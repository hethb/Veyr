// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import SwiftUI

/// Root of the Veyr window: Spend and Agent tabs.
struct VeyrDashboardRootView: View {
    @Bindable var store: VeyrSpendStore
    @Bindable var agentService: VeyrAgentStatusService

    var body: some View {
        TabView(selection: self.$store.dashboardSelectedTab) {
            VeyrSpendDashboardView(store: self.store)
                .tabItem { Label("Spend", systemImage: "dollarsign.circle") }
                .tag(0)
            VeyrAgentDashboardView(service: self.agentService)
                .tabItem { Label("Agent", systemImage: "cpu") }
                .tag(1)
            VeyrControlsView(store: self.store)
                .tabItem { Label("Controls", systemImage: "slider.horizontal.3") }
                .tag(2)
            VeyrPromptStyleStatsView()
                .tabItem { Label("Style", systemImage: "text.bubble") }
                .tag(3)
        }
    }
}
