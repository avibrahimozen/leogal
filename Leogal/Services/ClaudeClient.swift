import Foundation

/// Minimal Claude Messages API client built on `URLSession` (there is no
/// official Anthropic Swift SDK, so we speak the raw HTTPS wire format).
///
/// Supports vision (base64 image blocks) and SSE streaming so the reply can be
/// spoken sentence-by-sentence for a responsive, Samantha-like cadence.
actor ClaudeClient {

    struct APIError: LocalizedError {
        let status: Int
        let body: String
        var errorDescription: String? { "Claude API \(status): \(body)" }
    }

    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    // MARK: - Public API

    /// Stream a reply. `onDelta` is called with incremental text as it arrives.
    /// Returns the full concatenated text when the stream ends.
    @discardableResult
    func stream(
        system: String,
        history: [ChatMessage],
        maxTokens: Int = 1024,
        onDelta: @Sendable (String) -> Void
    ) async throws -> String {
        var request = try makeRequest(system: system, history: history,
                                      maxTokens: maxTokens, stream: true)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        let (bytes, response) = try await session.bytes(for: request)
        try Self.validate(response, bytes: bytes)

        var full = ""
        for try await line in bytes.lines {
            // SSE: we only care about `data:` payload lines.
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard !payload.isEmpty, payload != "[DONE]" else { continue }
            guard let data = payload.data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }

            // We want content_block_delta -> delta.text (text_delta).
            if (event["type"] as? String) == "content_block_delta",
               let delta = event["delta"] as? [String: Any],
               (delta["type"] as? String) == "text_delta",
               let chunk = delta["text"] as? String {
                full += chunk
                onDelta(chunk)
            }
        }
        return full
    }

    /// Non-streaming convenience: returns the whole reply at once.
    func complete(
        system: String,
        history: [ChatMessage],
        maxTokens: Int = 1024
    ) async throws -> String {
        let request = try makeRequest(system: system, history: history,
                                      maxTokens: maxTokens, stream: false)
        let (data, response) = try await session.data(for: request)
        try Self.validate(response, bytes: nil, data: data)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]] else {
            throw APIError(status: -1, body: "Yanıt çözümlenemedi")
        }
        // Concatenate all text blocks (skip thinking/tool blocks).
        return content
            .filter { ($0["type"] as? String) == "text" }
            .compactMap { $0["text"] as? String }
            .joined()
    }

    // MARK: - Request building

    private func makeRequest(
        system: String,
        history: [ChatMessage],
        maxTokens: Int,
        stream: Bool
    ) throws -> URLRequest {
        let url = AppConfig.anthropicBaseURL.appendingPathComponent("v1/messages")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConfig.anthropicVersion, forHTTPHeaderField: "anthropic-version")
        if !AppConfig.anthropicAPIKey.isEmpty {
            request.setValue(AppConfig.anthropicAPIKey, forHTTPHeaderField: "x-api-key")
        }

        let body: [String: Any] = [
            "model": AppConfig.model,
            "max_tokens": maxTokens,
            "stream": stream,
            "system": system,
            "messages": history.map(Self.encode)
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    /// Encode one turn into the Anthropic content-block wire format. User turns
    /// may carry an image (vision); the image block goes *before* the text.
    private static func encode(_ message: ChatMessage) -> [String: Any] {
        var blocks: [[String: Any]] = []
        if let b64 = message.imageBase64 {
            blocks.append([
                "type": "image",
                "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64
                ]
            ])
        }
        blocks.append(["type": "text", "text": message.text])
        return ["role": message.role.rawValue, "content": blocks]
    }

    // MARK: - Validation

    private static func validate(_ response: URLResponse, bytes: URLSession.AsyncBytes?, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? "(gövde yok)"
            throw APIError(status: http.statusCode, body: body)
        }
    }
}
