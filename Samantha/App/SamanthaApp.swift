import SwiftUI

@main
struct SamanthaApp: App {
    @StateObject private var engine = SamanthaEngine()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(engine)
                .preferredColorScheme(.dark)
        }
    }
}
