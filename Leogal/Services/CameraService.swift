import AVFoundation
import CoreImage
import UIKit

/// Drives the back camera and hands out the most recent frame on demand as a
/// downscaled JPEG (base64). We keep a rolling "latest frame" rather than
/// taking a still photo so grabbing an image for Claude is instant and silent.
final class CameraService: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {

    private let session = AVCaptureSession()
    private let output = AVCaptureVideoDataOutput()
    private let queue = DispatchQueue(label: "com.leogal.camera")
    private let ciContext = CIContext()

    /// Protected by `queue`.
    private var latestPixelBuffer: CVPixelBuffer?

    /// Long edge we downscale frames to before sending to the model. Smaller =
    /// fewer vision tokens and lower latency; 1024 is a good balance.
    var targetLongEdge: CGFloat = 1024
    var jpegQuality: CGFloat = 0.6

    // MARK: - Lifecycle

    func requestAccess() async -> Bool {
        await withCheckedContinuation { cont in
            AVCaptureDevice.requestAccess(for: .video) { cont.resume(returning: $0) }
        }
    }

    /// Configure once. Safe to call before `start()`.
    func configure() {
        queue.async { [weak self] in
            guard let self else { return }
            guard self.session.inputs.isEmpty else { return }

            self.session.beginConfiguration()
            self.session.sessionPreset = .high

            if let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                    for: .video, position: .back),
               let input = try? AVCaptureDeviceInput(device: device),
               self.session.canAddInput(input) {
                self.session.addInput(input)
            }

            self.output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            self.output.alwaysDiscardsLateVideoFrames = true
            self.output.setSampleBufferDelegate(self, queue: self.queue)
            if self.session.canAddOutput(self.output) {
                self.session.addOutput(self.output)
            }
            self.session.commitConfiguration()
        }
    }

    func start() {
        queue.async { [weak self] in
            guard let self, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    // MARK: - Frame capture

    /// Returns the most recent frame as a base64 JPEG, or nil if none yet.
    func captureFrameBase64() async -> String? {
        await withCheckedContinuation { cont in
            queue.async { [weak self] in
                guard let self, let buffer = self.latestPixelBuffer else {
                    cont.resume(returning: nil); return
                }
                cont.resume(returning: self.encode(buffer))
            }
        }
    }

    private func encode(_ buffer: CVPixelBuffer) -> String? {
        var image = CIImage(cvPixelBuffer: buffer)
        let extent = image.extent
        let longEdge = max(extent.width, extent.height)
        if longEdge > targetLongEdge {
            let scale = targetLongEdge / longEdge
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        guard let cg = ciContext.createCGImage(image, from: image.extent) else { return nil }
        let uiImage = UIImage(cgImage: cg)
        return uiImage.jpegData(compressionQuality: jpegQuality)?.base64EncodedString()
    }

    // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        // Called on `queue`. Just keep the most recent buffer.
        latestPixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    }
}
