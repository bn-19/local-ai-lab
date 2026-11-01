// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LocalLabMac",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "LocalLabCore", targets: ["LocalLabCore"]),
        .executable(name: "LocalLabMac", targets: ["LocalLabMac"]),
        .executable(name: "LocalLabProcessHelper", targets: ["LocalLabProcessHelper"]),
        .executable(name: "LocalLabHeadlessChecks", targets: ["LocalLabHeadlessChecks"]),
    ],
    targets: [
        .target(name: "LocalLabCore"),
        .executableTarget(
            name: "LocalLabMac",
            dependencies: ["LocalLabCore"],
            resources: [.copy("Resources")]
        ),
        .executableTarget(name: "LocalLabProcessHelper"),
        .executableTarget(name: "LocalLabHeadlessChecks", dependencies: ["LocalLabCore"]),
    ],
    swiftLanguageModes: [.v5]
)
