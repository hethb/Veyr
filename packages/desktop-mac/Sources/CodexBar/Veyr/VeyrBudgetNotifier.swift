// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation
import VeyrKit

/// Posts budget-threshold notifications through the app's existing
/// UNUserNotificationCenter wrapper. Each threshold fires once per month
/// (dedupe state in UserDefaults, keyed by month).
@MainActor
enum VeyrBudgetNotifier {
    private static let firedDefaultsKeyPrefix = "veyrBudgetAlertsFired:"
    static let notificationsEnabledDefaultsKey = "veyrBudgetNotificationsEnabled"

    static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: Self.notificationsEnabledDefaultsKey) as? Bool ?? true
    }

    static func checkAndNotify(
        sessions: [SessionEntry],
        controls: VeyrBudgetControls,
        now: Date = Date(),
        calendar: Calendar = .current,
        post: (String, String) -> Void = { title, body in
            AppNotifications.shared.post(idPrefix: "veyr-budget", title: title, body: body)
        })
    {
        guard Self.isEnabled else { return }

        let monthStart = calendar.dateInterval(of: .month, for: now)?.start
            ?? calendar.startOfDay(for: now)
        let monthKey = Self.monthKey(for: now)
        var fired = Self.loadFired(monthKey: monthKey)
        let monthSessions = sessions.filter { $0.timestamp >= monthStart }

        var spendByTag: [String: Double] = [:]
        for session in monthSessions {
            spendByTag[session.featureTag, default: 0] += session.usage.costUSD
        }

        for (tag, budget) in controls.perTag {
            let spent = spendByTag[tag] ?? 0
            guard budget.monthlyCapUSD > 0 else { continue }
            let pct = spent / budget.monthlyCapUSD * 100
            if pct >= 100 {
                Self.fireOnce(key: "tag:\(tag):100", fired: &fired) {
                    post("Veyr", "\(tag) has hit its \(Self.usd(budget.monthlyCapUSD))/mo budget")
                }
            } else if pct >= 80, budget.alertAt80Pct {
                Self.fireOnce(key: "tag:\(tag):80", fired: &fired) {
                    post("Veyr", "\(tag) is at 80% of its \(Self.usd(budget.monthlyCapUSD))/mo budget")
                }
            }
        }

        if let globalCap = controls.globalMonthlyCapUSD, globalCap > 0 {
            let globalSpent = monthSessions.reduce(0.0) { $0 + $1.usage.costUSD }
            let pct = globalSpent / globalCap * 100
            if pct >= 100 {
                Self.fireOnce(key: "global:100", fired: &fired) {
                    post("Veyr", "You've hit your \(Self.usd(globalCap)) global monthly budget")
                }
            } else if pct >= 80 {
                Self.fireOnce(key: "global:80", fired: &fired) {
                    post(
                        "Veyr",
                        "You've spent \(Self.usd(globalSpent)) — 80% of your " +
                            "\(Self.usd(globalCap)) global budget")
                }
            }
        }

        Self.saveFired(fired, monthKey: monthKey)
    }

    // MARK: - Once-per-month dedupe

    private static func fireOnce(key: String, fired: inout Set<String>, action: () -> Void) {
        guard !fired.contains(key) else { return }
        fired.insert(key)
        action()
    }

    static func monthKey(for date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
    }

    private static func loadFired(monthKey: String) -> Set<String> {
        let stored = UserDefaults.standard.stringArray(
            forKey: Self.firedDefaultsKeyPrefix + monthKey) ?? []
        return Set(stored)
    }

    private static func saveFired(_ fired: Set<String>, monthKey: String) {
        UserDefaults.standard.set(Array(fired).sorted(), forKey: Self.firedDefaultsKeyPrefix + monthKey)
    }

    private static func usd(_ value: Double) -> String {
        value == value.rounded() && value < 10_000
            ? String(format: "$%.0f", value)
            : String(format: "$%.2f", value)
    }
}
