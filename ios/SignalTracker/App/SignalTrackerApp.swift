import SwiftUI
@main
struct SignalTrackerApp: App {
    @StateObject private var field=FieldModel()
    @Environment(\.scenePhase) private var phase
    var body:some Scene {WindowGroup {RootView().environmentObject(field).preferredColorScheme(.dark).tint(.mint).task {await field.load()}.onChange(of:phase) {_,next in if next == .background {field.pauseForBackground()}else if next == .active {field.resumeForeground()}}}}
}
