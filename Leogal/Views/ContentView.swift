import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var engine: SamanthaEngine
    @State private var showSettings = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 28) {
                header

                Spacer()

                AmbientOrbView(state: engine.state)
                    .frame(height: 240)

                Text(engine.state.label)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.85))
                    .animation(.default, value: engine.state)

                // Live captions (useful when the phone is out of the pocket).
                captions

                Spacer()

                controlButton
            }
            .padding(24)
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
    }

    private var header: some View {
        HStack {
            Text("Leogal")
                .font(.system(.title2, design: .rounded).weight(.semibold))
                .foregroundStyle(.white)
            Spacer()
            if engine.isPocketed {
                Label("Cepte", systemImage: "tshirt")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
    }

    @ViewBuilder
    private var captions: some View {
        VStack(spacing: 12) {
            if !engine.userText.isEmpty {
                caption(engine.userText, icon: "person.fill", tint: .cyan)
            }
            if !engine.replyText.isEmpty {
                caption(engine.replyText, icon: "waveform", tint: .orange)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .top)
        .animation(.default, value: engine.userText)
        .animation(.default, value: engine.replyText)
    }

    private func caption(_ text: String, icon: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(text)
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
    }

    private var controlButton: some View {
        Button {
            Task {
                if engine.state.isActive { engine.stop() }
                else { await engine.start() }
            }
        } label: {
            Label(engine.state.isActive ? "Durdur" : "Başlat",
                  systemImage: engine.state.isActive ? "stop.fill" : "mic.fill")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(engine.state.isActive ? Color.red.opacity(0.85) : Color.white)
                .foregroundStyle(engine.state.isActive ? .white : .black)
                .clipShape(Capsule())
        }
    }
}

#Preview {
    ContentView().environmentObject(SamanthaEngine())
}
