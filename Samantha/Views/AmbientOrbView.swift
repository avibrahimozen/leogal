import SwiftUI

/// The breathing "presence" orb. Its colour and motion reflect the companion's
/// state — this is the only thing on screen most of the time, since the phone
/// is meant to live in a pocket and the experience is voice-first.
struct AmbientOrbView: View {
    let state: ConversationState
    @State private var pulse = false

    private var colors: [Color] {
        switch state {
        case .offline:   return [.gray.opacity(0.4), .gray.opacity(0.1)]
        case .listening: return [.teal, .blue]
        case .hearing:   return [.cyan, .teal]
        case .thinking:  return [.purple, .indigo]
        case .speaking:  return [.orange, .pink]
        case .error:     return [.red, .red.opacity(0.4)]
        }
    }

    private var animates: Bool { state.isActive }

    var body: some View {
        ZStack {
            ForEach(0..<3) { ring in
                Circle()
                    .fill(
                        RadialGradient(colors: colors,
                                       center: .center,
                                       startRadius: 4,
                                       endRadius: 160)
                    )
                    .frame(width: 220, height: 220)
                    .scaleEffect(pulse ? 1.0 + CGFloat(ring) * 0.12 : 0.85)
                    .opacity(pulse ? 0.25 : 0.6)
                    .blur(radius: CGFloat(ring) * 6)
            }
            Circle()
                .fill(RadialGradient(colors: colors, center: .center,
                                     startRadius: 2, endRadius: 110))
                .frame(width: 180, height: 180)
                .scaleEffect(pulse ? 1.05 : 0.95)
                .shadow(color: colors.first?.opacity(0.6) ?? .clear, radius: 40)
        }
        .animation(animates
                   ? .easeInOut(duration: 1.6).repeatForever(autoreverses: true)
                   : .default,
                   value: pulse)
        .onAppear { pulse = animates }
        .onChange(of: animates) { _, newValue in pulse = newValue }
    }
}
