import AVFoundation
import AppKit
import CoreGraphics

// Two modes:
//   grab-frame <video> <out.jpg> <seconds> [width] [height]   → freeze + scale + JPEG
//   grab-frame --luma <image.jpg>                             → print the mean luma (0-255)
func meanLuma(_ image: CGImage) -> Int {
    let side = 8
    guard let ctx = CGContext(
        data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return -1 }
    ctx.interpolationQuality = .low
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
    guard let data = ctx.data else { return -1 }
    let pixels = data.bindMemory(to: UInt8.self, capacity: side * side * 4)
    var total = 0.0
    for index in 0..<(side * side) {
        let offset = index * 4
        let r = Double(pixels[offset]), g = Double(pixels[offset + 1]), b = Double(pixels[offset + 2])
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return Int((total / Double(side * side)).rounded())
}

let args = CommandLine.arguments
guard args.count >= 3 else { exit(2) }

if args[1] == "--luma" {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(3) }
    print("luma \(meanLuma(image))")
    exit(0)
}

guard args.count >= 4 else { exit(2) }
let targetW = args.count > 4 ? Int(args[4]) ?? 0 : 0
let targetH = args.count > 5 ? Int(args[5]) ?? 0 : 0

let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = CMTime(seconds: 2, preferredTimescale: 600)
gen.maximumSize = CGSize(width: 3840, height: 2160)

do {
    let time = CMTime(seconds: Double(args[3]) ?? 1.0, preferredTimescale: 600)
    let cg = try gen.copyCGImage(at: time, actualTime: nil)

    var output = cg
    if targetW > 0, targetH > 0 {
        let scale = max(Double(targetW) / Double(cg.width), Double(targetH) / Double(cg.height))
        let scaledW = Int((Double(cg.width) * scale).rounded())
        let scaledH = Int((Double(cg.height) * scale).rounded())
        guard let ctx = CGContext(
            data: nil, width: scaledW, height: scaledH, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { exit(5) }
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: scaledW, height: scaledH))
        guard let scaled = ctx.makeImage() else { exit(6) }
        let cropX = (scaledW - targetW) / 2
        let cropY = (scaledH - targetH) / 2
        guard let cropped = scaled.cropping(to: CGRect(x: cropX, y: cropY, width: targetW, height: targetH)) else { exit(7) }
        output = cropped
    }

    let rep = NSBitmapImageRep(cgImage: output)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92]) else { exit(3) }
    try data.write(to: URL(fileURLWithPath: args[2]))
    print("frame \(output.width)x\(output.height) luma \(meanLuma(output))")
} catch {
    FileHandle.standardError.write("\(error)\n".data(using: .utf8)!)
    exit(4)
}
