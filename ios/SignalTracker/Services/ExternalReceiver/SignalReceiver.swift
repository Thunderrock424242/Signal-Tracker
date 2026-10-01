import Foundation
import SignalTrackerCore
@MainActor
protocol SignalReceiver:AnyObject {
    var id:String {get}; var name:String {get}; var isConnected:Bool {get};var capabilities:[String] {get}
    var measurements:AsyncStream<SignalMeasurement> {get};var spectrum:AsyncStream<SpectrumFrame> {get}
    func start();func stop()
}
