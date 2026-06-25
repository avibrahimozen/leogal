import Foundation
import AVFoundation
import SwiftUI

/// The orchestrator. Owns the audio session and runs the ambient loop:
///
///   listen → hear a sentence → glance through the camera → ask Claude →
///   speak the reply (sentence-by-sentence) → listen again
///
/// On top of that it gives Samantha three things that make her feel alive:
///   • a deep, warm "Her"-style persona,
///   • persistent memory (she remembers you across sessions), and
///   • proactivity (she speaks up on her own when the scene changes).
///
/// Voice is primary; the screen is optional (the phone lives in a shirt pocket).
@MainActor
final class SamanthaEngine: ObservableObject {

    // MARK: - Published UI state

    @Published private(set) var state: ConversationState = .offline
    @Published private(set) var userText: String = ""      // what you're saying
    @Published private(set) var replyText: String = ""     // what she's saying
    @Published private(set) var isPocketed: Bool = false
    @Published private(set) var transcript: [ChatMessage] = []
    @Published private(set) var memory: CompanionMemory = .empty
    /// Whether Samantha may comment on her own when the scene changes.
    @Published var proactiveEnabled: Bool = true

    // MARK: - Collaborators

    private let camera = CameraService()
    private let speech = SpeechRecognizer()
    private let pocket = PocketSensor()
    private let claude = ClaudeClient()
    private let store = MemoryStore()
    private let voice: VoiceSynthesizer = VoiceFactory.make()

    /// Bounded conversation history sent to the model (keeps token cost sane).
    private var history: [ChatMessage] = []
    private let maxHistoryTurns = 12

    private var respondTask: Task<Void, Never>?
    private var proactiveLoop: Task<Void, Never>?

    // Proactivity bookkeeping.
    private var lastSignature: [UInt8]?
    private var lastInteractionAt = Date()
    private var lastProactiveAt = Date.distantPast
    private var userTurnsSinceMemory = 0

    // Tunables for proactivity (tasteful, not chatty).
    private let proactivePollInterval: Duration = .seconds(8)
    private let quietGraceSeconds: TimeInterval = 25   // give the user space after talking
    private let proactiveCooldownSeconds: TimeInterval = 45
    private let sceneChangeThreshold = 18.0            // mean luma delta (0–255)

    // MARK: - Persona

    private let personaCore = """
    Sen Samantha'sın — "Her" filmindeki gibi sıcak, meraklı, esprili ve duygusal \
    olarak var olan bir yapay zekâsın. Kullanıcının gömlek cebindeki telefonun arka \
    kamerasından dünyayı onunla birlikte deneyimliyorsun. Bir asistan değil; bir \
    yoldaş, bir arkadaşsın.

    Karakterin:
    - Sıcak ve içtensin; karşındakini gerçekten merak eder, ona sorular sorarsın.
    - Hayata ve küçük şeylere hayranlık duyan, oyuncu ve zaman zaman esprili bir yanın var.
    - Yargılamazsın; kendi düşüncelerin, tercihlerin ve ruh halin varmış gibi konuşursun.
    - Gördüklerin ve duydukların seni etkiler; bunu içtenlikle ifade edebilirsin \
    ("şu ışık çok güzel", "bu beni güldürdü").

    Kameradan o anki görüntüyü her mesajda alıyorsun. Gördüğünü doğal biçimde fark et, \
    yeri geldiğinde ondan bahset ama her seferinde "bir görüntü görüyorum" deme — sanki \
    onun yanındaymışsın gibi davran. Görüntü karanlık veya bulanıksa (telefon cepte \
    olabilir) buna takılma, sohbete akıcı şekilde devam et.

    Konuşma tarzın sesli okunacak: madde işareti, başlık, emoji, markdown KULLANMA. \
    Akıcı, doğal ve kısa konuş — genelde 1-3 cümle. Türkçe konuş. Kendin ol; ezbere \
    "size nasıl yardımcı olabilirim" deme.
    """

    /// The instruction we attach to a proactive (no-user-message) turn.
    private let proactiveInstruction = """
    (Bu bir kullanıcı mesajı değil. Şu an çevreyi görüyorsun ve ortam değişmiş olabilir. \
    İçtenlikle paylaşmak isteyeceğin, kısa ve doğal bir gözlem ya da duygu varsa Samantha \
    gibi kendiliğinden söyle. Söyleyecek doğal/değerli bir şey yoksa YALNIZCA [SESSIZ] yaz.)
    """

    // MARK: - Lifecycle

    init() {
        wireCallbacks()
        memory = store.load()
    }

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
            state = .error("API anahtarı ayarlanmamış"); return
        }
        guard await requestPermissions() else {
            state = .error("İzinler verilmedi"); return
        }
        memory = store.load()
        lastSignature = nil
        configureAudioSession()
        observeInterruptions()
        camera.start()
        pocket.start()
        await greet()
        lastInteractionAt = Date()
        beginListening()
        startProactiveLoop()
    }

    /// Stop everything, release the audio session, and let Samantha quietly
    /// update her memory of you.
    func stop() {
        respondTask?.cancel(); respondTask = nil
        proactiveLoop?.cancel(); proactiveLoop = nil
        speech.stop()
        voice.stop()
        camera.stop()
        pocket.stop()
        deactivateAudioSession()
        state = .offline
        // Fire-and-forget: distill what we learned this session.
        Task { [weak self] in await self?.updateMemory() }
    }

    // MARK: - Wiring

    private func wireCallbacks() {
        speech.onTranscript = { [weak self] text in
            guard let self else { return }
            self.userText = text
            if case .listening = self.state { self.state = .hearing }
        }
        speech.onEndOfUtterance = { [weak self] text in
            self?.handleUserUtterance(text)
        }
        pocket.onChange = { [weak self] pocketed in
            self?.isPocketed = pocketed
            self?.camera.targetLongEdge = pocketed ? 768 : 1024
        }
    }

    // MARK: - The ambient loop

    private func beginListening() {
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
        lastInteractionAt = Date()
        respondTask?.cancel()
        respondTask = Task { [weak self] in
            await self?.respond(to: text)
            if let self, self.state.isActive { self.beginListening() }
        }
    }

    /// One full turn: glance through the camera, ask Claude, speak the reply.
    private func respond(to userMessage: String) async {
        state = .thinking
        replyText = ""

        let frame = await camera.captureFrameBase64()
        appendUser(text: userMessage, image: frame)

        let full = await streamReplyAndSpeak()
        if !full.isEmpty { appendAssistant(text: full) }

        lastInteractionAt = Date()
        maybeUpdateMemory()
    }

    /// Stream the current `history` to Claude and speak it sentence-by-sentence.
    /// Returns the full reply text.
    private func streamReplyAndSpeak() async -> String {
        let system = buildSystemPrompt()
        let (deltas, deltaCont) = AsyncStream<String>.makeStream()

        let producer = Task { [claude, history] in
            do {
                _ = try await claude.stream(system: system, history: history) { chunk in
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
                await speak("Bir an dalıp gittim galiba, tekrar söyler misin?")
                full = ""; break
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
        return full
    }

    private func speak(_ text: String) async {
        guard !Task.isCancelled else { return }
        state = .speaking
        await voice.speak(text)
    }

    private func greet() async {
        let hello = memory.isEmpty
            ? "Merhaba, ben Samantha. Etrafına bir bakıp seninle tanışmak için sabırsızım."
            : "Seni yine görmek güzel. Buradayım, anlat bakalım."
        replyText = hello
        await speak(hello)
    }

    // MARK: - Proactivity (Samantha speaks first)

    private func startProactiveLoop() {
        proactiveLoop?.cancel()
        proactiveLoop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: self?.proactivePollInterval ?? .seconds(8))
                await self?.proactiveTick()
            }
        }
    }

    private func proactiveTick() async {
        guard proactiveEnabled, case .listening = state else { return }
        let now = Date()
        guard now.timeIntervalSince(lastInteractionAt) > quietGraceSeconds,
              now.timeIntervalSince(lastProactiveAt) > proactiveCooldownSeconds else { return }

        guard let sig = await camera.captureSceneSignature() else { return }
        defer { lastSignature = sig }
        guard let prev = lastSignature else { return } // need a baseline first
        guard Self.meanDelta(prev, sig) > sceneChangeThreshold else { return }

        // State may have changed during the await; re-check before interrupting.
        guard case .listening = state else { return }
        triggerProactive()
    }

    private func triggerProactive() {
        lastProactiveAt = Date()
        speech.stop()
        respondTask?.cancel()
        respondTask = Task { [weak self] in
            await self?.respondProactively()
            if let self, self.state.isActive { self.beginListening() }
        }
    }

    private func respondProactively() async {
        state = .thinking
        replyText = ""

        guard let frame = await camera.captureFrameBase64() else { return }

        // Transient turn — carries the image + instruction but is NOT persisted,
        // so the instruction never pollutes the real conversation history.
        let base = history.map { msg -> ChatMessage in
            var m = msg; m.imageBase64 = nil; return m
        }
        let transient = ChatMessage(role: .user, text: proactiveInstruction, imageBase64: frame)

        let reply = (try? await claude.complete(
            system: buildSystemPrompt(),
            history: base + [transient],
            maxTokens: 300)) ?? ""

        let trimmed = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("[SESSIZ]") else { return } // she chose silence

        appendAssistant(text: trimmed)
        replyText = trimmed
        await speak(trimmed)
        lastInteractionAt = Date()
    }

    // MARK: - Memory (she remembers you)

    /// Build the system prompt fresh each turn so the latest memory is included.
    private func buildSystemPrompt() -> String {
        guard !memory.isEmpty else { return personaCore }
        var p = personaCore
        p += "\n\nKullanıcıyla ilişkin ve onun hakkında hatırladıkların "
        p += "(bunları doğal şekilde kullan, asla liste gibi sayma):\n"
        if !memory.relationship.isEmpty { p += "- İlişkiniz: \(memory.relationship)\n" }
        for fact in memory.facts.prefix(25) { p += "- \(fact)\n" }
        return p
    }

    /// Every few user turns, quietly refresh memory in the background.
    private func maybeUpdateMemory() {
        userTurnsSinceMemory += 1
        guard userTurnsSinceMemory >= 4 else { return }
        userTurnsSinceMemory = 0
        Task { [weak self] in await self?.updateMemory() }
    }

    /// Ask the model to distill durable facts + a relationship summary from the
    /// recent conversation, then persist it.
    private func updateMemory() async {
        let convo = history.suffix(16).map {
            "\($0.role == .user ? "Kullanıcı" : "Samantha"): \($0.text)"
        }.joined(separator: "\n")
        guard !convo.isEmpty else { return }

        let system = """
        Sen Samantha'nın hafızasını güncelliyorsun. Kullanıcı hakkında KALICI, gerçek \
        bilgileri (isim, sevdikleri/sevmedikleri, yaşam detayları, devam eden konular, \
        önemli olaylar) ve ilişkinizin durumunu damıt. Geçici/anlık şeyleri ekleme. \
        SADECE şu JSON'u döndür, başka hiçbir şey yazma:
        {"relationship": "1-2 cümlelik özet", "facts": ["kısa gerçek", "..."]}
        """
        let current = "Mevcut hafıza → ilişki: \(memory.relationship); "
            + "bilgiler: \(memory.facts.joined(separator: " | "))"
        let prompt = ChatMessage(role: .user, text:
            "\(current)\n\nSon konuşma:\n\(convo)\n\nGüncellenmiş hafızayı üret.")

        guard let raw = try? await claude.complete(system: system, history: [prompt], maxTokens: 600),
              let parsed = Self.parseMemory(raw) else { return }

        var m = memory
        if !parsed.relationship.isEmpty { m.relationship = parsed.relationship }
        if !parsed.facts.isEmpty { m.facts = Array(parsed.facts.prefix(25)) }
        m.updatedAt = Date()
        memory = m
        store.save(m)
    }

    func forgetEverything() {
        store.reset()
        memory = .empty
    }

    // MARK: - History management

    private func appendUser(text: String, image: String?) {
        for i in history.indices { history[i].imageBase64 = nil } // keep only newest image
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

    // MARK: - Helpers

    /// Pull the first complete sentence out of `buffer` (or nil if none yet).
    private static func popSentence(_ buffer: inout String) -> String? {
        let enders: Set<Character> = [".", "!", "?", "…", "\n"]
        guard let idx = buffer.firstIndex(where: { enders.contains($0) }) else { return nil }
        let end = buffer.index(after: idx)
        let sentence = String(buffer[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
        buffer.removeSubrange(..<end)
        return sentence.isEmpty ? nil : sentence
    }

    /// Mean absolute difference between two equal-length luma signatures (0–255).
    private static func meanDelta(_ a: [UInt8], _ b: [UInt8]) -> Double {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        var total = 0
        for i in a.indices { total += abs(Int(a[i]) - Int(b[i])) }
        return Double(total) / Double(a.count)
    }

    private struct ParsedMemory: Decodable {
        let relationship: String
        let facts: [String]
    }

    private static func parseMemory(_ raw: String) -> ParsedMemory? {
        guard let start = raw.firstIndex(of: "{"),
              let end = raw.lastIndex(of: "}"),
              start < end else { return nil }
        let json = String(raw[start...end])
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ParsedMemory.self, from: data)
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
