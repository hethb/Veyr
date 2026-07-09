import CodexBarCore
import Foundation
import Testing

struct VeyrPythonEnvTests {
    // MARK: - Python version parsing

    @Test func parsesPythonVersion() {
        let version = PythonEnvManager.parsePythonVersion("Python 3.14.0")
        #expect(version?.major == 3)
        #expect(version?.minor == 14)
    }

    @Test func parsesPythonVersionFromStderrNoise() {
        // pyenv shims and some builds prepend warnings before the version line.
        let output = "pyenv: warning something\nPython 3.12.11\n"
        let version = PythonEnvManager.parsePythonVersion(output)
        #expect(version?.major == 3)
        #expect(version?.minor == 12)
    }

    @Test func rejectsGarbagePythonVersion() {
        #expect(PythonEnvManager.parsePythonVersion("zsh: command not found: python3") == nil)
        #expect(PythonEnvManager.parsePythonVersion("Python three") == nil)
        #expect(PythonEnvManager.parsePythonVersion("") == nil)
    }

    @Test func minimumVersionGate() {
        // Graphify requires >= 3.10; macOS /usr/bin/python3 is often 3.9.
        #expect(PythonEnvManager.meetsMinimum((major: 3, minor: 10)))
        #expect(PythonEnvManager.meetsMinimum((major: 3, minor: 14)))
        #expect(PythonEnvManager.meetsMinimum((major: 4, minor: 0)))
        #expect(!PythonEnvManager.meetsMinimum((major: 3, minor: 9)))
        #expect(!PythonEnvManager.meetsMinimum((major: 2, minor: 7)))
    }

    // MARK: - Graphify version parsing

    @Test func parsesGraphifyVersion() {
        #expect(PythonEnvManager.parseGraphifyVersion("graphify 0.9.12") == "0.9.12")
    }

    @Test func parsesGraphifyVersionPastStalenessWarning() {
        // Graphify's _check_skill_version prints upgrade nags before the version.
        let output = """
        [graphify] A newer skill version is available. Run: graphify install
        graphify 0.9.12
        """
        #expect(PythonEnvManager.parseGraphifyVersion(output) == "0.9.12")
    }

    @Test func rejectsMissingGraphify() {
        let noModule = "/usr/local/bin/python3: No module named graphify"
        #expect(PythonEnvManager.parseGraphifyVersion(noModule) == nil)
        // importlib.metadata failure path reports "unknown" — treat as not installed.
        #expect(PythonEnvManager.parseGraphifyVersion("graphify unknown") == nil)
        #expect(PythonEnvManager.parseGraphifyVersion("") == nil)
    }

    // MARK: - Candidate ordering

    @Test func venvCandidateWinsAndPathIsScanned() {
        let venv = "/Users/x/.veyr/graphify-venv/bin/python3"
        let executables: Set<String> = [venv, "/opt/homebrew/bin/python3", "/usr/bin/python3"]
        let candidates = PythonEnvManager.pythonCandidates(
            venvPython: venv,
            pathVariable: "/opt/homebrew/bin:/usr/bin",
            home: "/Users/x",
            isExecutable: { executables.contains($0) })
        #expect(candidates.first == venv)
        #expect(candidates.contains("/opt/homebrew/bin/python3"))
        #expect(candidates.contains("/usr/bin/python3"))
    }

    @Test func candidatesAreDeduplicatedAndAbsolute() {
        let executables: Set<String> = ["/usr/local/bin/python3"]
        let candidates = PythonEnvManager.pythonCandidates(
            venvPython: "/Users/x/.veyr/graphify-venv/bin/python3",
            pathVariable: "/usr/local/bin:/usr/local/bin",
            home: "/Users/x",
            isExecutable: { executables.contains($0) })
        #expect(candidates == ["/usr/local/bin/python3"])
        #expect(candidates.allSatisfy { $0.hasPrefix("/") })
    }

    @Test func emptyPathStillYieldsFixedCandidates() {
        let executables: Set<String> = ["/usr/bin/python3"]
        let candidates = PythonEnvManager.pythonCandidates(
            venvPython: "/Users/x/.veyr/graphify-venv/bin/python3",
            pathVariable: nil,
            home: "/Users/x",
            isExecutable: { executables.contains($0) })
        #expect(candidates == ["/usr/bin/python3"])
    }

    // MARK: - PEP 668 detection

    @Test func detectsExternallyManagedEnvironment() {
        let homebrewError = """
        error: externally-managed-environment

        × This environment is externally managed
        ╰─> To install Python packages system-wide, try brew install xyz
        """
        #expect(PythonEnvManager.isExternallyManagedFailure(homebrewError))
        #expect(!PythonEnvManager.isExternallyManagedFailure("ERROR: Could not find a version"))
    }
}
