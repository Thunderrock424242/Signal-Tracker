// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "SignalTrackerCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "SignalTrackerCore", targets: ["SignalTrackerCore"])],
    targets: [
        .target(name: "SignalTrackerCore", resources: [.process("Resources")]),
        .testTarget(name: "SignalTrackerCoreTests", dependencies: ["SignalTrackerCore"])
    ]
)
