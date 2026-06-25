import Foundation

/// The companion's high-level state. Drives the UI (the orb) and the audio
/// session routing inside `SamanthaEngine`.
enum ConversationState: Equatable {
    /// Not running at all.
    case offline
    /// Ambient: mic open, waiting for the user to start speaking (or wake word).
    case listening
    /// User is actively speaking; we are accumulating a transcript.
    case hearing
    /// Talking to Claude (and looking through the camera).
    case thinking
    /// Speaking the reply out loud.
    case speaking
    /// Something went wrong; carries a human-readable reason.
    case error(String)

    var isActive: Bool {
        switch self {
        case .offline, .error: return false
        default: return true
        }
    }

    /// Short label for the UI.
    var label: String {
        switch self {
        case .offline:        return "Uykuda"
        case .listening:      return "Dinliyor"
        case .hearing:        return "Seni duyuyor"
        case .thinking:       return "Düşünüyor"
        case .speaking:       return "Konuşuyor"
        case .error(let m):   return m
        }
    }
}
