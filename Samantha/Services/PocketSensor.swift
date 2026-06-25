import Foundation
import UIKit

/// Heuristic "is the phone in a pocket / covered" detector using the proximity
/// sensor. When pocketed we lean fully on voice (no visual UI is visible) and
/// can relax the camera frame rate. This is a hint, not a guarantee.
final class PocketSensor {

    /// Called on the main thread when the pocketed state flips.
    var onChange: ((Bool) -> Void)?

    private(set) var isPocketed = false {
        didSet {
            guard oldValue != isPocketed else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.onChange?(self.isPocketed)
            }
        }
    }

    func start() {
        let device = UIDevice.current
        device.isProximityMonitoringEnabled = true
        guard device.isProximityMonitoringEnabled else { return } // unsupported on some devices
        NotificationCenter.default.addObserver(
            self, selector: #selector(proximityChanged),
            name: UIDevice.proximityStateDidChangeNotification, object: nil)
        isPocketed = device.proximityState
    }

    func stop() {
        NotificationCenter.default.removeObserver(
            self, name: UIDevice.proximityStateDidChangeNotification, object: nil)
        UIDevice.current.isProximityMonitoringEnabled = false
        isPocketed = false
    }

    @objc private func proximityChanged() {
        isPocketed = UIDevice.current.proximityState
    }
}
