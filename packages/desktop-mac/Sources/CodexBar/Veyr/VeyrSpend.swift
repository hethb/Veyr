// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import Foundation
import VeyrKit

/// Process-wide Veyr spend store. Started on first access; every surface
/// (menu summary, dashboard window, status item label) reads the same instance.
@MainActor
enum VeyrSpend {
    static let shared: VeyrSpendStore = {
        let store = VeyrSpendStore()
        store.start()
        return store
    }()
}

/// Shared formatting for Veyr spend surfaces.
enum VeyrFormat {
    static func usd(_ value: Double) -> String {
        String(format: "$%.2f", value)
    }

    /// Compact token count: 950 → "950", 12_400 → "12.4k", 1_200_000 → "1.2M".
    static func tokens(_ count: Int) -> String {
        switch count {
        case ..<1000:
            return "\(count)"
        case ..<1_000_000:
            return String(format: "%.1fk", Double(count) / 1000)
        default:
            return String(format: "%.1fM", Double(count) / 1_000_000)
        }
    }

    /// Relative session timestamp: "Today 14:23", "Yesterday 09:10", "Mon 18:02", else "Jun 12".
    static func sessionTimestamp(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let time = date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute())
        if calendar.isDate(date, inSameDayAs: now) {
            return "Today \(time)"
        }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday)
        {
            return "Yesterday \(time)"
        }
        if let weekAgo = calendar.date(byAdding: .day, value: -6, to: now), date >= weekAgo {
            let weekday = date.formatted(.dateTime.weekday(.abbreviated))
            return "\(weekday) \(time)"
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
