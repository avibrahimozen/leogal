import SwiftUI

/// Lightweight status / settings sheet. The actual secrets live in
/// `Secrets.xcconfig` (build-time), so this view is mostly diagnostic.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Beyin (Claude)") {
                    row("Model", AppConfig.model)
                    row("Sunucu", AppConfig.anthropicBaseURL.host ?? "—")
                    statusRow("Yapılandırma",
                              ok: AppConfig.isBrainConfigured,
                              okText: "Hazır", badText: "API anahtarı yok")
                }

                Section("Ses") {
                    statusRow("Doğal bulut sesi",
                              ok: AppConfig.hasCloudVoice,
                              okText: "ElevenLabs aktif", badText: "Cihaz sesi")
                }

                Section {
                    Text("Telefonu gömlek cebine arka kamera dışa bakacak şekilde "
                         + "yerleştir. Leogal etrafını görür ve seninle sesli sohbet eder. "
                         + "Anahtarlar Secrets.xcconfig içinden gelir ve git'e girmez.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ayarlar")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack { Text(title); Spacer(); Text(value).foregroundStyle(.secondary) }
    }

    private func statusRow(_ title: String, ok: Bool, okText: String, badText: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Label(ok ? okText : badText,
                  systemImage: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ok ? .green : .orange)
                .font(.callout)
        }
    }
}

#Preview { SettingsView() }
