import Foundation

/// Central place to read configuration that is injected at build time from
/// `Secrets.xcconfig` -> `Info.plist`. Nothing secret is hard-coded in source.
enum AppConfig {

    // MARK: - Anthropic (the "brain")

    /// Direct API key. Empty when you are routing through a backend proxy.
    static var anthropicAPIKey: String {
        infoString("ANTHROPIC_API_KEY")
    }

    /// Base URL for the Messages API. Defaults to Anthropic direct; override
    /// with your own proxy in `Secrets.xcconfig` for production.
    static var anthropicBaseURL: URL {
        let raw = infoString("ANTHROPIC_BASE_URL")
        return URL(string: raw.isEmpty ? "https://api.anthropic.com" : raw)!
    }

    /// We talk to Claude over raw HTTPS because there is no official Swift SDK.
    static let anthropicVersion = "2023-06-01"

    /// Vision-capable, latest Opus. Keep responses short for a voice UX.
    static let model = "claude-opus-4-8"

    // MARK: - ElevenLabs (optional natural cloud voice)

    static var elevenLabsAPIKey: String { infoString("ELEVENLABS_API_KEY") }
    static var elevenLabsVoiceID: String { infoString("ELEVENLABS_VOICE_ID") }

    /// True when a cloud voice is configured; otherwise we fall back to the
    /// on-device system voice.
    static var hasCloudVoice: Bool {
        !elevenLabsAPIKey.isEmpty && !elevenLabsVoiceID.isEmpty
    }

    /// True when we can reach the model at all (direct key or a proxy URL set).
    static var isBrainConfigured: Bool {
        !anthropicAPIKey.isEmpty || anthropicBaseURL.host != "api.anthropic.com"
    }

    // MARK: - Helpers

    private static func infoString(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
