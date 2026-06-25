import Foundation

/// A single turn in the conversation. `imageBase64` is set on user turns where
/// we attached a camera frame so Claude can "see" what the user is talking about.
struct ChatMessage: Identifiable, Equatable {
    enum Role: String {
        case user
        case assistant
    }

    let id = UUID()
    let role: Role
    var text: String
    /// JPEG bytes, base64-encoded, attached to user turns (vision input).
    var imageBase64: String?
    let createdAt = Date()

    init(role: Role, text: String, imageBase64: String? = nil) {
        self.role = role
        self.text = text
        self.imageBase64 = imageBase64
    }
}
