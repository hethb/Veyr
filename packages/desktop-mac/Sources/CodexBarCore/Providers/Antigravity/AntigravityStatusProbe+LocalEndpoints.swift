// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
extension AntigravityStatusProbe {
    static func cliEndpoints(ports: [Int]) -> [AntigravityConnectionEndpoint] {
        ports.flatMap { port in
            self.localProbeSchemes.map { scheme in
                AntigravityConnectionEndpoint(
                    scheme: scheme,
                    port: port,
                    csrfToken: "",
                    source: .cliHTTPS)
            }
        }
    }

    static var localProbeSchemes: [String] {
        #if os(Linux)
        // FoundationNetworking cannot trust Antigravity's self-signed TLS cert.
        // Requests remain pinned to 127.0.0.1 in makeRequest.
        ["https", "http"]
        #else
        ["https"]
        #endif
    }
}
