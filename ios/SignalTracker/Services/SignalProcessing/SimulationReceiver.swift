import Foundation
import SignalTrackerCore
@MainActor
final class SimulationReceiver:SignalReceiver {
    let id="simulation",name="Simulator · SIMULATED",capabilities=["Simulated power","Simulated GPS","Simulated spectrum"]
    private(set) var isConnected=false
    let measurements:AsyncStream<SignalMeasurement>;let spectrum:AsyncStream<SpectrumFrame>
    private let values:AsyncStream<SignalMeasurement>.Continuation;private let frames:AsyncStream<SpectrumFrame>.Continuation;private var timer:Task<Void,Never>?
    init() {var c:AsyncStream<SignalMeasurement>.Continuation!;measurements=AsyncStream(bufferingPolicy:.bufferingNewest(256)) {c=$0};values=c;var f:AsyncStream<SpectrumFrame>.Continuation!;spectrum=AsyncStream(bufferingPolicy:.bufferingNewest(16)) {f=$0};frames=f}
    func start() {guard timer==nil else{return};isConnected=true;timer=Task {[weak self] in guard let self,let demo=try? DemoData.load() else{return};for (i,sample) in demo.measurements.enumerated() {if Task.isCancelled{break};var m=sample;m.id=UUID();m.timestamp=Date();m.receiverID=self.id;self.values.yield(m);if i<demo.spectrum.count {var f=demo.spectrum[i];f.id=UUID();f.timestamp=Date();f.receiverID=self.id;self.frames.yield(f)};try? await Task.sleep(for:.seconds(1))};self.isConnected=false;self.timer=nil}}
    func stop() {timer?.cancel();timer=nil;isConnected=false}
}
