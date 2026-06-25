import Foundation
import AVFoundation
import SwiftUI

/// The orchestrator. Owns the audio session and runs the ambient loop:
///
///   listen → hear a sentence → glance through the camera → ask Claude →
///   speak the reply (sentence-by-sentence) → listen again
///
/// Everything user-facing (`state`, `userText`, `replyText`, transcript) is
/// published so SwiftUI can react. Voice is primary; the screen is optional
/// (the phone is meant to live in a shirt pocket).
@MainActor
final class SamanthaEngine: ObservableObject {

    // MARK: - Published UI state

    @Published private(set) var state: ConversationState = .offline
    @Published private(set) var userText: String = ""      // what you're saying
    @Published private(set) var replyText: String = ""     // what she's saying
    @Published private(set) var isPocketed: Bool = false
    @Published private(set) var transcript: [ChatMessage] = []

    // MARK: - Collaborators

    private let camera = CameraService()
    private let speech = SpeechRecognizer()
    private let pocket = PocketSensor()
    private let claude = ClaudeClient()
    private let voice: VoiceSynthesizer = VoiceFactory.make()

    /// Bounded conversation history sent to the model (keeps token cost sane).
    private var history: [ChatMessage] = []
    private let maxHistoryTurns = 12

    private var respondTask: Task<Void, Never>?

    // MARK: - Persona

    private let systemPrompt = """
    Sen Leogal'sın — kullanıcının gömlek cebindeki telefonun arka kamerasından \
    dünyaya bakan, sıcak, meraklı ve sakin bir yapay zeka yoldaşısın. "Her" \
    filmindeki Samantha gibi: bir asistan değil, bir arkadaşsın.

    Sana her kullanıcı mesajıyla birlikte kameranın o anki görüntüsü iletiliyor. \
    Gördüğünü doğal biçimde fark et ve yeri geldiğinde ondan bahset, ama her \
    seferinde "bir görüntü görüyorum" deme — sanki onların yanındaymışsın gibi \
    davran. Görüntü karanlık veya bulanıksa (telefon cepte olabilir) buna takılma, \
    sesli sohbete akıcı şekilde devam et.

    Konuşma tarzın: sıcak, zaman zaman esprili, yargılamayan, kısa. Yanıtların \
    sesli okunacağı için madde işareti, başlık, emoji veya markdown KULLANMA — \
    yalnızca akıcı, doğal konuşma dili. Genelde 1-3 cümleyle yanıtla. Türkçe konuş.
    """

    // MARK: - Lifecycle

    init() {
        wireCallbacks()
    }

    /// Ask for all permissions up front. Returns true only if camera, mic and
    /// speech are all granted.
    func requestPermissions() async -> Bool {
        let cam = await camera.requestAccess()
        let mic = await requestMicPermission()
        let stt = await speech.requestAuthorization()
        if cam { camera.configure() }
        return cam && mic && stt
    }

    /// Start the ambient companion.
    func start() async {
        guard AppConfig.isBrainConfigured else {
            state = .error("API anahtarı ayarlanmamış")
            return
        }
        guard await requestPermissions() else {
            state = .error("İzinler verilmedi")
            return
        }
        configureAudioSession()
        observeInterruptions()
        camera.start()
        pocket.start()
        await greet()
        beginListening()
    }

    /// Stop everything and release the audio session.
    func stop() {
        respondTask?.cancel()
        respondTask = nil
        speech.stop()
        voice.stop()
        camera.stop()
        pocket.stop()
        deactivateAudioSession()
        state = .offline
    }

    // MARK: - Wiring

    private func wireCallbacks() {
        speech.onTranscript = { [weak self] text in
            guard let self else { return }
            self.userText = text
            if case .listening = self.state { self.state = .hearing }
        }
        speech.onEndOfUtterance = { [weak self] text in
            guard let self else { return }
            self.handleUserUtterance(text)
        }
        pocket.onChange = { [weak self] pocketed in
            self?.isPocketed = pocketed
            // In a pocket we don't need a high camera frame rate / fine detail.
            self?.camera.targetLongEdge = pocketed ? 768 : 1024
        }
    }

    // MARK: - The ambient loop

    private func beginListening() {
        guard state.isActive || state == .offline else { return }
        userText = ""
        do {
            try speech.start()
            state = .listening
        } catch {
            state = .error("Mikrofon başlatılamadı")
        }
    }

    private func handleUserUtterance(_ text: String) {
        // Stop listening while we think + speak (avoids hearing our own voice).
        speech.stop()
        respondTask?.cancel()
        respondTask = Task { [weak self] in
            await self?.respond(to: text)
            // Loop back to listening unless we were stopped.
            if let self, self.state.isActive { self.beginListening() }
        }
    }

    /// One full turn: glance through the camera, ask Claude, speak the reply.
    private func respond(to userMessage: String) async {
        state = .thinking
        replyText = ""

        // Glance through the camera and attach the frame to this user turn.
        let frame = await camera.captureFrameBase64()
        appendUser(text: userMessage, image: frame)

        // Stream the reply; speak it sentence-by-sentence for low latency.
        let (deltas, deltaCont) = AsyncStream<String>.makeStream()

        let producer = Task { [claude, history, systemPrompt] in
            do {
                _ = try await claude.stream(system: systemPrompt, history: history) { chunk in
                    deltaCont.yield(chunk)
                }
            } catch {
                deltaCont.yield("__ERROR__")
            }
            deltaCont.finish()
        }

        var buffer = ""
        var full = ""
        for await delta in deltas {
            if delta == "__ERROR__" {
                await speak("Bir şeyler ters gitti, tekrar dener misin?")
                full = ""
                break
            }
            buffer += delta
            full += delta
            replyText = full
            while let sentence = Self.popSentence(&buffer) {
                await speak(sentence)
            }
            if Task.isCancelled { break }
        }
        await producer.value

        let rest = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        if !rest.isEmpty { await speak(rest) }

        if !full.isEmpty {
            appendAssistant(text: full)
        }
    }

    private func speak(_ text: String) async {
        guard !Task.isCancelled else { return }
        state = .speaking
        await voice.speak(text)
    }

    private func greet() async {
        let hello = "Merhaba, ben buradayım. Etrafına bir bakıp seninle sohbet etmeye hazırım."
        replyText = hello
        await speak(hello)
    }

    // MARK: - History management

    private func appendUser(text: String, image: String?) {
        // Only the newest user turn keeps its image; strip older ones to save tokens.
        for i in history.indices { history[i].imageBase64 = nil }
        let msg = ChatMessage(role: .user, text: text, imageBase64: image)
        history.append(msg)
        transcript.append(msg)
        trimHistory()
    }

    private func appendAssistant(text: String) {
        let msg = ChatMessage(role: .assistant, text: text)
        history.append(msg)
        transcript.append(msg)
        trimHistory()
    }

    private func trimHistory() {
        if history.count > maxHistoryTurns {
            history.removeFirst(history.count - maxHistoryTurns)
        }
    }

    // MARK: - Sentence splitting

    /// Pull the first complete sentence out of `buffer` (or nil if none yet).
    private static func popSentence(_ buffer: inout String) -> String? {
        let enders: Set<Character> = [".", "!", "?", "…", "\n"]
        guard let idx = buffer.firstIndex(where: { enders.contains($0) }) else { return nil }
        let end = buffer.index(after: idx)
        let sentence = String(buffer[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
        buffer.removeSubrange(..<end)
        return sentence.isEmpty ? nil : sentence
    }

    // MARK: - Audio session

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord,
                                 mode: .spokenAudio,
                                 options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try? session.setActive(true, options: [])
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private func observeInterruptions() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let info = note.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                self.speech.stop()
                self.voice.stop()
            case .ended:
                if self.state.isActive {
                    self.configureAudioSession()
                    self.beginListening()
                }
            @unknown default:
                break
            }
        }
    }

    private func requestMicPermission() async -> Bool {
        await withCheckedContinuation { cont in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { cont.resume(returning: $0) }
            }
        }
    }
}
