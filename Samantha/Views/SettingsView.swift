import SwiftUI

/// Status, persona controls, and what Samantha remembers about you. The actual
/// secrets live in `Secrets.xcconfig` (build-time), so config rows are
/// diagnostic only.
struct SettingsView: View {
    @EnvironmentObject private var engine: SamanthaEngine
    @Environment(\.dismiss) private var dismiss
    @State private var showForgetConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Davranış") {
                    Toggle("Kendiliğinden konuşsun", isOn: $engine.proactiveEnabled)
                    Toggle("Sözünü kesebileyim (barge-in)", isOn: $engine.bargeInEnabled)
                    Toggle("\"Hey Samantha\" ile uyansın", isOn: $engine.wakeWordEnabled)
                    Text("Kendiliğinden konuşma: ortam değişince kısa yorum yapar. "
                         + "Barge-in: o konuşurken söze girersen susup seni dinler. "
                         + "Bekleme modunda (ay simgesi) yalnızca adını duyunca uyanır.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Samantha'nın hatırladıkları") {
                    if engine.memory.isEmpty {
                        Text("Henüz seni tanımıyor. Konuştukça seni hatırlamaya başlayacak.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        if !engine.memory.relationship.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("İlişkiniz").font(.caption).foregroundStyle(.secondary)
                                Text(engine.memory.relationship)
                            }
                        }
                        ForEach(engine.memory.facts, id: \.self) { fact in
                            Label(fact, systemImage: "sparkle")
                                .font(.callout)
                        }
                        Button("Beni unut", role: .destructive) {
                            showForgetConfirm = true
                        }
                    }
                }

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
                         + "yerleştir. Samantha etrafını görür, seni dinler ve seninle "
                         + "sohbet eder. Anahtarlar Secrets.xcconfig içinden gelir, git'e girmez.")
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
            .confirmationDialog("Samantha seni tamamen unutsun mu?",
                                isPresented: $showForgetConfirm, titleVisibility: .visible) {
                Button("Her şeyi unut", role: .destructive) { engine.forgetEverything() }
                Button("Vazgeç", role: .cancel) {}
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

#Preview {
    SettingsView().environmentObject(SamanthaEngine())
}
