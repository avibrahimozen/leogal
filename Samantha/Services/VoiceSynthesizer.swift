import Foundation
import AVFoundation

/// Pluggable text-to-speech. Swap implementations without touching the engine.
/// `speak` resolves when playback finishes (or is interrupted).
protocol VoiceSynthesizer: AnyObject {
    /// One-time setup (e.g. request Personal Voice access). Safe to call again.
    func prepare() async
    func speak(_ text: String) async
    func stop()
}

extension VoiceSynthesizer {
    func prepare() async {}
}

/// Factory: use the natural cloud voice when configured, else the on-device one.
enum VoiceFactory {
    static func make() -> VoiceSynthesizer {
        AppConfig.hasCloudVoice ? CloudVoice() : SystemVoice()
    }
}

// MARK: - On-device voice (free, offline, always available)

final class SystemVoice: NSObject, VoiceSynthesizer, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var continuation: CheckedContinuation<Void, Never>?

    /// The warmest/highest-quality voice available. Recomputed in `prepare()`
    /// once Personal Voice authorization is known.
    private var preferredVoice: AVSpeechSynthesisVoice? = SystemVoice.bestVoice()

    override init() {
        super.init()
        synth.delegate = self
    }

    /// Request Personal Voice (iOS 17+). If the user has created one and grants
    /// access, Samantha will speak in *their* voice — the most "Her" thing of all.
    func prepare() async {
        let status: AVSpeechSynthesisVoice.PersonalVoiceAuthorizationStatus =
            await withCheckedContinuation { cont in
                AVSpeechSynthesisVoice.requestPersonalVoiceAuthorization { cont.resume(returning: $0) }
            }
        // Re-pick now that personal voices may be visible in the catalog.
        preferredVoice = Self.bestVoice(allowPersonal: status == .authorized)
    }

    func speak(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            self.continuation = cont
            let utterance = AVSpeechUtterance(string: trimmed)
            utterance.voice = preferredVoice
            // Slightly slower + warmer than default for a gentler, present feel.
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
            utterance.pitchMultiplier = 1.07
            utterance.postUtteranceDelay = 0.06
            synth.speak(utterance)
        }
    }

    /// Personal Voice (if allowed) > premium > enhanced > any Turkish voice.
    /// Premium/enhanced voices are downloaded by the user in
    /// Settings ▸ Accessibility ▸ Spoken Content ▸ Voices.
    private static func bestVoice(allowPersonal: Bool = false) -> AVSpeechSynthesisVoice? {
        let all = AVSpeechSynthesisVoice.speechVoices()
        if allowPersonal,
           let personal = all.first(where: { $0.voiceTraits.contains(.isPersonalVoice) }) {
            return personal
        }
        let turkish = all.filter { $0.language.hasPrefix("tr") }
        return turkish.first { $0.quality == .premium }
            ?? turkish.first { $0.quality == .enhanced }
            ?? turkish.first
            ?? AVSpeechSynthesisVoice(language: "tr-TR")
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
        finish()
    }

    private func finish() {
        continuation?.resume()
        continuation = nil
    }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { finish() }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { finish() }
}

// MARK: - Cloud voice (ElevenLabs) — the "Samantha" voice

/// Streams MP3 from ElevenLabs and plays it. Falls back to the system voice on
/// any failure so the companion never goes silent.
final class CloudVoice: NSObject, VoiceSynthesizer {
    private let session = URLSession(configuration: .default)
    private var player: AVAudioPlayer?
    private let fallback = SystemVoice()

    func speak(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let data = try await synthesize(trimmed)
            try await play(data)
        } catch {
            // Never go silent — degrade gracefully to the device voice.
            await fallback.speak(trimmed)
        }
    }

    func stop() {
        player?.stop()
        player = nil
        fallback.stop()
    }

    private func synthesize(_ text: String) async throws -> Data {
        let urlString = "https://api.elevenlabs.io/v1/text-to-speech/\(AppConfig.elevenLabsVoiceID)"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("audio/mpeg", forHTTPHeaderField: "Accept")
        request.setValue(AppConfig.elevenLabsAPIKey, forHTTPHeaderField: "xi-api-key")
        let body: [String: Any] = [
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": ["stability": 0.5, "similarity_boost": 0.75]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func play(_ data: Data) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            do {
                let player = try AVAudioPlayer(data: data)
                self.player = player
                self.playbackDone = cont
                player.delegate = self
                player.play()
            } catch {
                cont.resume(throwing: error)
            }
        }
    }

    private var playbackDone: CheckedContinuation<Void, Error>?
}

extension CloudVoice: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        playbackDone?.resume(returning: ())
        playbackDone = nil
    }
}
