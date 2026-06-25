import Foundation

/// The companion's high-level state. Drives the UI (the orb) and the audio
/// session routing inside `SamanthaEngine`.
enum ConversationState: Equatable {
    /// Not running at all.
    case offline
    /// Low-power passive mode: only listening for the wake word ("Hey Samantha").
    /// Camera is paused; she won't respond to anything else.
    case standby
    /// Ambient: mic open, waiting for the user to start speaking.
    case listening
    /// User is actively speaking; we are accumulating a transcript.
    case hearing
    /// Talking to Claude (and looking through the camera).
    case thinking
    /// Speaking the reply out loud.
    case speaking
    /// Something went wrong; carries a human-readable reason.
    case error(String)

    /// Running at all (engine started), including passive standby.
    var isRunning: Bool {
        switch self {
        case .offline, .error: return false
        default: return true
        }
    }

    /// Actively conversing (not offline, not passive standby).
    var isActive: Bool {
        switch self {
        case .offline, .error, .standby: return false
        default: return true
        }
    }

    /// Short label for the UI.
    var label: String {
        switch self {
        case .offline:        return "Uykuda"
        case .standby:        return "Bekliyor — \"Hey Samantha\" de"
        case .listening:      return "Dinliyor"
        case .hearing:        return "Seni duyuyor"
        case .thinking:       return "Düşünüyor"
        case .speaking:       return "Konuşuyor"
        case .error(let m):   return m
        }
    }
}
