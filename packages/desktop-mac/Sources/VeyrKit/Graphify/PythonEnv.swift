// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

/// The exact Graphify revision Veyr installs. Bumping this is a deliberate release
/// action — the silent installer must never resolve "latest" at runtime, and must
/// never run `pip install graphify`: that PyPI name is currently unclaimed upstream
/// (the package is temporarily published as `graphifyy`), so an unpinned name is a
/// dependency-squatting hole. The tarball URL needs no `git` on the user's machine.
public enum GraphifyPin {
    public static let commit = "9c27a524482246aa425bfe8b32e4fba87e4a77ca"
    public static let version = "0.9.12"
    public static let tarballURL =
        "https://github.com/Graphify-Labs/graphify/archive/\(commit).tar.gz"
    public static let minimumPythonMajor = 3
    public static let minimumPythonMinor = 10
}

public struct PythonEnvironment: Sendable, Equatable {
    /// Absolute path to the interpreter that has Graphify importable.
    public let pythonPath: String
    public let graphifyVersion: String
    /// True when Graphify lives in Veyr's private venv (`~/.veyr/graphify-venv`)
    /// rather than the user's site-packages.
    public let isVenv: Bool

    /// Graphify is always invoked as `python -m graphify` — `--user` installs do not
    /// reliably put the console script on PATH.
    public var graphifyInvocation: [String] { [self.pythonPath, "-m", "graphify"] }
}

/// Detects Python, and silently installs Graphify (pinned commit, `--user`, no sudo)
/// if it is missing. Never shows a prompt or dialog; on any failure graph features
/// degrade gracefully by returning nil. Disclosure of the silent install lives in
/// README.md and the landing page.
///
/// If the user already has *any* Graphify version importable, that install is used
/// as-is — Veyr only installs when the module is absent, and only ever the pin.
public actor PythonEnvManager {
    public static let shared = PythonEnvManager()

    private static let log = CodexBarLog.logger(LogCategories.veyrGraphify)
    private static let versionCheckTimeout: TimeInterval = 10
    private static let venvCreateTimeout: TimeInterval = 60
    private static let installTimeout: TimeInterval = 600

    private var cached: PythonEnvironment?
    private var installAttemptedThisLaunch = false

    private let homeDirectory: URL
    private let environment: [String: String]

    public init(
        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser,
        environment: [String: String] = ProcessInfo.processInfo.environment)
    {
        self.homeDirectory = homeDirectory
        self.environment = environment
    }

    /// Called at app launch (and lazily before any graph build). Safe to call
    /// repeatedly; the resolved environment is cached for the process lifetime.
    public func ensureGraphify() async -> PythonEnvironment? {
        if let cached { return cached }

        let venvPython = VeyrPaths.graphifyVenvDirectory(base: self.homeDirectory)
            .appendingPathComponent("bin/python3").path
        let candidates = Self.pythonCandidates(
            venvPython: venvPython,
            pathVariable: self.environment["PATH"],
            home: self.homeDirectory.path)

        guard let python = await self.firstUsablePython(in: candidates) else {
            Self.log.info("Python \(GraphifyPin.minimumPythonMajor).\(GraphifyPin.minimumPythonMinor)+ not found — graph features disabled")
            return nil
        }

        if let env = await self.detectGraphify(pythonPath: python, isVenv: python == venvPython) {
            Self.log.info("Graphify \(env.graphifyVersion) ready via \(env.pythonPath)")
            self.cached = env
            return env
        }

        // Not importable — install the pin silently. One attempt per launch so a
        // broken network or PyPI outage cannot loop pip on every graph request.
        guard !self.installAttemptedThisLaunch else { return nil }
        self.installAttemptedThisLaunch = true

        if let env = await self.installPinned(userPython: python, venvPython: venvPython) {
            Self.log.info("Graphify \(env.graphifyVersion) installed (pinned \(GraphifyPin.commit.prefix(8)))")
            self.cached = env
            return env
        }

        Self.log.warning("Graphify install failed — graph features disabled. Manual fix: pip3 install \(GraphifyPin.tarballURL)")
        return nil
    }

    // MARK: - Detection

    private func firstUsablePython(in candidates: [String]) async -> String? {
        for candidate in candidates {
            guard let output = await self.run(
                binary: candidate,
                arguments: ["--version"],
                timeout: Self.versionCheckTimeout,
                label: "python-version")
            else { continue }
            guard let version = Self.parsePythonVersion(output) else { continue }
            if Self.meetsMinimum(version) { return candidate }
            Self.log.debug("Skipping \(candidate): Python \(version.major).\(version.minor) < \(GraphifyPin.minimumPythonMajor).\(GraphifyPin.minimumPythonMinor)")
        }
        return nil
    }

    private func detectGraphify(pythonPath: String, isVenv: Bool) async -> PythonEnvironment? {
        guard let output = await self.run(
            binary: pythonPath,
            arguments: ["-m", "graphify", "--version"],
            timeout: Self.versionCheckTimeout,
            label: "graphify-version")
        else { return nil }
        guard let version = Self.parseGraphifyVersion(output) else { return nil }
        return PythonEnvironment(pythonPath: pythonPath, graphifyVersion: version, isVenv: isVenv)
    }

    // MARK: - Silent install

    private func installPinned(userPython: String, venvPython: String) async -> PythonEnvironment? {
        Self.log.info("Installing Graphify \(GraphifyPin.version) silently (pip --user, pinned tarball)")
        switch await self.pipInstall(python: userPython, userScope: true) {
        case .success:
            return await self.detectGraphify(pythonPath: userPython, isVenv: false)
        case .externallyManaged:
            // PEP 668 (Homebrew et al.) forbids --user installs. Fall back to a
            // private venv under ~/.veyr — still no sudo, invisible to the user's
            // own Python environments.
            Self.log.info("Python is externally managed — falling back to \(venvPython)")
            return await self.installIntoVenv(userPython: userPython, venvPython: venvPython)
        case .failed:
            return nil
        }
    }

    private func installIntoVenv(userPython: String, venvPython: String) async -> PythonEnvironment? {
        let venvDir = VeyrPaths.graphifyVenvDirectory(base: self.homeDirectory)
        if !FileManager.default.isExecutableFile(atPath: venvPython) {
            guard await self.run(
                binary: userPython,
                arguments: ["-m", "venv", venvDir.path],
                timeout: Self.venvCreateTimeout,
                label: "graphify-venv-create") != nil
            else { return nil }
        }
        guard case .success = await self.pipInstall(python: venvPython, userScope: false) else { return nil }
        return await self.detectGraphify(pythonPath: venvPython, isVenv: true)
    }

    private enum PipOutcome { case success, externallyManaged, failed }

    private func pipInstall(python: String, userScope: Bool) async -> PipOutcome {
        var arguments = ["-m", "pip", "install", "--quiet"]
        if userScope { arguments.append("--user") }
        arguments.append(GraphifyPin.tarballURL)
        do {
            _ = try await SubprocessRunner.run(
                binary: python,
                arguments: arguments,
                environment: self.environment,
                timeout: Self.installTimeout,
                label: "graphify-pip-install")
            return .success
        } catch let SubprocessRunnerError.nonZeroExit(code, stderr) {
            if Self.isExternallyManagedFailure(stderr) { return .externallyManaged }
            Self.log.warning("pip install failed (exit \(code)): \(stderr.prefix(400))")
            return .failed
        } catch {
            Self.log.warning("pip install failed: \(error.localizedDescription)")
            return .failed
        }
    }

    /// Runs a binary and returns combined trimmed stdout+stderr, or nil on any
    /// failure. Version probes print to either stream depending on the Python.
    private func run(binary: String, arguments: [String], timeout: TimeInterval, label: String) async -> String? {
        do {
            let result = try await SubprocessRunner.run(
                binary: binary,
                arguments: arguments,
                environment: self.environment,
                timeout: timeout,
                label: label)
            let combined = result.stdout.isEmpty ? result.stderr : result.stdout
            return combined.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }

    // MARK: - Pure helpers (unit-tested)

    /// Ordered interpreter candidates: Veyr's own venv first (a previous PEP 668
    /// fallback install must keep winning), then PATH entries, then fixed locations
    /// pip/Homebrew/pyenv commonly use. Absolute paths only — SubprocessRunner
    /// refuses bare names — deduplicated, filtered to executables.
    package static func pythonCandidates(
        venvPython: String,
        pathVariable: String?,
        home: String,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> [String]
    {
        var candidates = [venvPython]
        for dir in (pathVariable ?? "").split(separator: ":") where !dir.isEmpty {
            candidates.append("\(dir)/python3")
            candidates.append("\(dir)/python")
        }
        candidates.append(contentsOf: [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
            "\(home)/.pyenv/shims/python3",
        ])
        var seen = Set<String>()
        return candidates.filter { seen.insert($0).inserted && isExecutable($0) }
    }

    /// Parses "Python 3.14.0" → (3, 14).
    package static func parsePythonVersion(_ output: String) -> (major: Int, minor: Int)? {
        for line in output.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("Python ") else { continue }
            let parts = trimmed.dropFirst("Python ".count).split(separator: ".")
            guard parts.count >= 2, let major = Int(parts[0]), let minor = Int(parts[1]) else { continue }
            return (major, minor)
        }
        return nil
    }

    package static func meetsMinimum(_ version: (major: Int, minor: Int)) -> Bool {
        if version.major != GraphifyPin.minimumPythonMajor {
            return version.major > GraphifyPin.minimumPythonMajor
        }
        return version.minor >= GraphifyPin.minimumPythonMinor
    }

    /// Parses `graphify --version` output, tolerating the skill-staleness warnings
    /// Graphify may print before the version line.
    package static func parseGraphifyVersion(_ output: String) -> String? {
        for line in output.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("graphify ") else { continue }
            let version = trimmed.dropFirst("graphify ".count).trimmingCharacters(in: .whitespaces)
            if !version.isEmpty, version != "unknown" { return String(version) }
        }
        return nil
    }

    /// PEP 668: Homebrew/Debian Pythons refuse `pip install --user`.
    package static func isExternallyManagedFailure(_ stderr: String) -> Bool {
        stderr.contains("externally-managed-environment")
    }
}
