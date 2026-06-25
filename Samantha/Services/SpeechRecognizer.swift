import Foundation
import Speech
import AVFoundation

/// Streaming speech-to-text on top of `SFSpeechRecognizer` + `AVAudioEngine`.
///
/// The engine owns the `AVAudioSession`; this class only taps the input node.
/// It reports partial transcripts live and fires `onEndOfUtterance` after a
/// short silence so the orchestrator knows the user finished a sentence.
final class SpeechRecognizer {

    /// Live partial/updated transcript (main thread).
    var onTranscript: ((String) -> Void)?
    /// User went quiet after speaking; carries the final transcript.
    var onEndOfUtterance: ((String) -> Void)?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "tr-TR"))
        ?? SFSpeechRecognizer()
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private var silenceTimer: Timer?
    private var currentTranscript = ""
    private var hasHeardSpeech = false

    /// Silence (seconds) after the last word before we treat the turn as done.
    var endOfUtteranceSilence: TimeInterval = 1.1

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
    }

    // MARK: - Control

    /// Begin listening. The caller must have already activated a record-capable
    /// `AVAudioSession`. Throws if the recognizer/engine cannot start.
    func start() throws {
        stop() // ensure clean state

        currentTranscript = ""
        hasHeardSpeech = false

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer?.supportsOnDeviceRecognition ?? false
        self.request = request

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        engine.prepare()
        try engine.start()

        task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty {
                    self.hasHeardSpeech = true
                    self.currentTranscript = text
                    DispatchQueue.main.async { self.onTranscript?(text) }
                    self.resetSilenceTimer()
                }
            }
            if error != nil || (result?.isFinal ?? false) {
                self.finishUtterance()
            }
        }
    }

    func stop() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
    }

    // MARK: - Silence / end-of-utterance

    private func resetSilenceTimer() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.silenceTimer?.invalidate()
            self.silenceTimer = Timer.scheduledTimer(
                withTimeInterval: self.endOfUtteranceSilence, repeats: false
            ) { [weak self] _ in
                self?.finishUtterance()
            }
        }
    }

    private func finishUtterance() {
        let text = currentTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let didHear = hasHeardSpeech
        stop()
        guard didHear, !text.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onEndOfUtterance?(text)
        }
    }
}
