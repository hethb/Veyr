// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Darwin

enum MemoryPressureRelief {
    static func releaseFreeMallocPages() {
        _ = malloc_zone_pressure_relief(nil, 0)
    }
}
