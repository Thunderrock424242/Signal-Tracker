import Foundation
import Combine
import SignalTrackerCore
@MainActor
final class FieldModel:ObservableObject {
    @Published var state=StoreState()
    @Published var activeID:UUID?
    @Published var selectedID:UUID?
    @Published var tab=0
    @Published var message:String?
    @Published var syncStatus="Local only"
    @Published var receivers:[HTTPSReceiver]=[]
    @Published var receiverID="iphone-ble"
    @Published private(set) var isSaving=false
    let ble=BLEReceiver(),location=LocationService(),connectivity=ConnectivityService(),auth=AuthenticationService(),simulator=SimulationReceiver()
    private let store=LocalStore();private var tasks:[Task<Void,Never>]=[];private var loaded=false;private var saveDate=Date.distantPast;private var lastOnlineFix:RoutePoint?;private var subscriptions=Set<AnyCancellable>();private var syncRunning=false;private var isForeground=true;private var syncTask:Task<Void,Never>?
    var selected:SignalSession? {state.sessions.first(where:{$0.id==(activeID ?? selectedID)})}
    var active:SignalSession? {state.sessions.first(where:{$0.id==activeID})}
    var hunting:Bool {active?.type == .hunt}
    var currentRegion:EstimatedRegion? {WeightedRegionEstimator().estimate(Array(selectedMeasurements.suffix(1000)))}
    var selectedMeasurements:[SignalMeasurement] {guard let s=selected else{return []};let last=s.measurements.last(where:{$0.receiverID==receiverID}) ?? s.measurements.last;guard let last else{return []};return s.measurements.filter {$0.receiverID==last.receiverID && $0.signalIdentifier==last.signalIdentifier && $0.frequencyHz==last.frequencyHz && $0.unit==last.unit && $0.provenance==last.provenance}}
    init() {
        location.onFix={ [weak self] p in self?.recordRoute(p) }
        connectivity.onChange={ [weak self] available in guard let self else{return};if !available,let i=self.activeIndex,let fix=self.lastOnlineFix,Date().timeIntervalSince(fix.timestamp)<30 {self.state.sessions[i].lastServicePoint=fix;self.persist()}}
        for publisher in [ble.objectWillChange.eraseToAnyPublisher(),location.objectWillChange.eraseToAnyPublisher(),connectivity.objectWillChange.eraseToAnyPublisher(),auth.objectWillChange.eraseToAnyPublisher()] {publisher.sink { [weak self] _ in self?.objectWillChange.send() }.store(in:&subscriptions)}
        attach(ble);attach(simulator)
    }
    private var activeIndex:Int? {guard let id=activeID else{return nil};return state.sessions.firstIndex(where:{$0.id==id})}
    func load() async {guard !loaded else{return};do {state=try await store.load();loaded=true;restoreReceivers();let interrupted=state.sessions.contains {$0.endedAt==nil};state.sessions=state.sessions.map {SessionRecovery.closeInterrupted($0)};if interrupted {persist();message="An interrupted recording was recovered through its last saved observation."};selectedID=state.sessions.last?.id;syncStatus=state.settings.syncEnabled ? "Sync enabled · uploads are manual" : "Local only";configureBattery()}catch {message="Local history could not be read: \(error.localizedDescription). The original file is preserved."}}
    func persist() {
        guard loaded else{return};state.revision+=1;let snapshot=state;isSaving=true
        Task {do {try await store.save(snapshot);if self.state.revision==snapshot.revision {self.isSaving=false}}catch{self.isSaving=false;self.message="Recording could not be saved: \(error.localizedDescription). Export it before closing."}}
    }
    private func checkpoint() async throws {guard loaded else{throw DataError.invalid("Local history must load successfully before synchronization. The original file is preserved.")};state.revision+=1;let snapshot=state;try await store.save(snapshot)}
    func configureBattery() {location.configure(state.settings.batteryMode);ble.interval=state.settings.batteryMode == .highAccuracy ? 0.5 : state.settings.batteryMode == .batterySaver ? 3 : 1}
    func settingsChanged() {configureBattery();syncStatus=state.settings.syncEnabled ? "Sync enabled · uploads are manual" : "Local only";persist()}
    func startHunt(target:String,name:String,source:String="iphone-ble") {
        guard loaded,activeID==nil,!target.isEmpty else{message="Stop the current session before beginning another.";return}
        let s=SignalSession(name:String(name.prefix(120)),type:.hunt,targetSignal:target);state.sessions.append(s);activeID=s.id;selectedID=s.id;receiverID=source;tab=1
        if source=="simulation" {simulator.start()}else{location.start(mode:state.settings.batteryMode);if source==ble.id {ble.start()}}
        persist()
    }
    func startWilderness() {guard loaded,activeID==nil else{message="Stop the current session first.";return};guard let fix=location.freshFix else{location.start(mode:state.settings.batteryMode);message="Acquiring a fresh GPS fix. Mark the start once GPS is available.";return};var s=SignalSession(name:"Wilderness · \(Date().formatted(date:.abbreviated,time:.shortened))",type:.wilderness);s.route=[RoutePoint(fix:fix,timestamp:Date())];state.sessions.append(s);activeID=s.id;selectedID=s.id;location.start(mode:state.settings.batteryMode);tab=2;persist()}
    func stop() {if let i=activeIndex {state.sessions[i].endedAt=Date()};activeID=nil;ble.stop();simulator.stop();location.stop();persist()}
    func pauseForBackground() {isForeground=false;syncTask?.cancel();if activeID != nil {stop();message="Foreground session saved and stopped when the app left the screen. Start another session to resume recording."};ble.stop();location.stop();receivers.forEach {$0.stop()}}
    func resumeForeground() {isForeground=true}
    func signOut() {guard !syncRunning else{message="Wait for the requested transfer to finish before signing out.";return};auth.signOut()}
    func showDemo() {guard activeID==nil else{message="Stop your real session before opening demo data.";return};do{let demo=try DemoData.load();if !state.sessions.contains(where:{$0.id==demo.id}){state.sessions.append(demo)};selectedID=demo.id;receiverID=demo.measurements.first?.receiverID ?? "simulation";persist()}catch{message=error.localizedDescription}}
    private func attach(_ receiver:any SignalReceiver) {
        tasks.append(Task {[weak self] in for await m in receiver.measurements {guard !Task.isCancelled else{return};self?.record(m)}})
        tasks.append(Task {[weak self] in for await f in receiver.spectrum {guard !Task.isCancelled else{return};self?.recordSpectrum(f)}})
    }
    func connectReceiver(id:String,name:String,url:String,token:String) {
        do {let config=ReceiverConfiguration(id:id,name:name,url:url);guard config.isValid,!receivers.contains(where:{$0.id==id}),receivers.count<8,let endpoint=URL(string:url) else{throw DataError.invalid("Use a unique receiver ID, a name, and an HTTPS bridge URL")};let r=try HTTPSReceiver(id:id,name:name,endpoint:endpoint,token:token);try KeychainStore.save(Data(token.utf8),account:"receiver-"+id);register(r);state.receivers=(state.receivers ?? [])+[config];persist();r.start()}catch{message=error.localizedDescription}
    }
    private func register(_ receiver:HTTPSReceiver) {receivers.append(receiver);receiver.objectWillChange.sink {[weak self] _ in self?.objectWillChange.send()}.store(in:&subscriptions);attach(receiver)}
    private func restoreReceivers() {for config in state.receivers ?? [] {guard let data=KeychainStore.read("receiver-"+config.id),let token=String(data:data,encoding:.utf8),let url=URL(string:config.url),let receiver=try? HTTPSReceiver(id:config.id,name:config.name,endpoint:url,token:token) else{continue};register(receiver)}}
    func removeReceiver(_ id:String) {guard activeID==nil else{message="Stop the active session before removing its receiver.";return};receivers.first(where:{$0.id==id})?.stop();receivers.removeAll {$0.id==id};state.receivers?.removeAll {$0.id==id};KeychainStore.delete("receiver-"+id);persist()}
    private func record(_ incoming:SignalMeasurement) {
        guard let i=activeIndex,state.sessions[i].type == .hunt,incoming.signalIdentifier==state.sessions[i].targetSignal,incoming.isValid,abs(incoming.timestamp.timeIntervalSinceNow)<30 else{return}
        if state.sessions[i].measurements.count>=2000 {message="This session reached the bounded recording limit. It was saved; start a new session to continue.";stop();return}
        var m=incoming
        if m.location==nil && m.provenance == .measured {m.location=location.freshFix;m.heading=location.freshHeading;m.headingAccuracy=m.heading != nil ? location.headingAccuracy : nil}
        state.sessions[i].measurements.append(m)
        if m.provenance == .simulated,let fix=m.location {state.sessions[i].route.append(RoutePoint(fix:fix,timestamp:m.timestamp))}
        let group=Array(state.sessions[i].measurements.filter {$0.receiverID==m.receiverID && $0.unit==m.unit && $0.frequencyHz==m.frequencyHz && $0.provenance==m.provenance}.suffix(1000))
        if group.count%4==0,let estimate=WeightedRegionEstimator().estimate(group) {state.sessions[i].estimatedRegions=Array((state.sessions[i].estimatedRegions+[estimate]).suffix(250))}
        if Date().timeIntervalSince(saveDate)>3 {saveDate=Date();persist()}
    }
    private func recordSpectrum(_ frame:SpectrumFrame) {guard let i=activeIndex,frame.isValid else{return};state.sessions[i].spectrum=Array((state.sessions[i].spectrum+[frame]).suffix(128));if Date().timeIntervalSince(saveDate)>3 {saveDate=Date();persist()}}
    private func recordRoute(_ point:RoutePoint) {
        if connectivity.available {lastOnlineFix=point}
        guard let i=activeIndex,active?.measurements.first?.provenance != .simulated else{return}
        guard state.sessions[i].route.count<2000 else{message="Route limit reached. Start a new session to continue.";stop();return}
        guard let accepted=RouteRecording.next(point,after:state.sessions[i].route.last) else{return}
        state.sessions[i].route.append(accepted);if Date().timeIntervalSince(saveDate)>3 {saveDate=Date();persist()}
    }
    func markWaypoint(name:String) {guard let i=activeIndex,let fix=location.freshFix else{message="A running session and fresh GPS fix are required.";return};state.sessions[i].waypoints.append(Waypoint(name:name.isEmpty ? "Waypoint \(state.sessions[i].waypoints.count+1)" : String(name.prefix(100)),fix:fix));persist()}
    func saveBeacon(name:String,identifier:String,type:String="ble",notes:String="",frequency:Double?=nil,tags:String="",icon:String="antenna.radiowaves.left.and.right") {guard !name.isEmpty,!identifier.isEmpty,identifier.count<=200,frequency.map({$0.isFinite && $0>0 && $0<=1e13}) ?? true else{message="Enter a name, advertised identifier and valid optional frequency below 10 THz.";return};state.beacons.append(KnownBeacon(name:String(name.prefix(100)),type:type,identifier:identifier,icon:icon,notes:String(notes.prefix(2000)),frequencyHz:frequency,tags:Array(tags.split(separator:",").prefix(20).map {String($0.trimmingCharacters(in:.whitespaces).prefix(50))})));persist()}
    func saveBookmark(name:String,frequency:Double,bandwidth:Double,mode:String,notes:String) {guard frequency.isFinite,frequency>0,frequency<=1e13,bandwidth.isFinite,bandwidth>0,bandwidth<=1e12,!name.isEmpty else{message="Enter a name, a frequency below 10 THz and bandwidth below 1 THz.";return};state.bookmarks.append(FrequencyBookmark(name:String(name.prefix(100)),frequencyHz:frequency,bandwidthHz:bandwidth,mode:String(mode.prefix(50)),notes:String(notes.prefix(2000))));persist()}
    func importSession(url:URL) {guard !syncRunning else{message="Wait for the requested transfer before importing a recording.";return};let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}};do{let size=(try url.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0;guard size<=2_000_000 else{throw DataError.invalid("Import exceeds 2 MB")};let s=try SessionCodec.decode(Data(contentsOf:url));guard activeID != s.id else{throw DataError.invalid("Stop the active session before replacing it")};state.sessions.removeAll {$0.id==s.id};state.sessions.append(s);selectedID=s.id;persist()}catch{message="Import rejected: \(error.localizedDescription)"}}
    func exportSession(_ s:SignalSession,format:String) throws ->URL {let data=format=="csv" ? Data(SessionExport.csv(s).utf8) : format=="geojson" ? try SessionExport.geoJSON(s) : try SessionCodec.encode(s);let url=FileManager.default.temporaryDirectory.appendingPathComponent("signal-tracker-\(s.id.uuidString).\(format)");try data.write(to:url,options:[.atomic,.completeFileProtectionUnlessOpen]);return url}
    func deleteSession(_ id:UUID) {guard activeID != id,!syncRunning else{message="Stop recording and wait for any active transfer before deleting this session.";return};state.sessions.removeAll {$0.id==id};state.outbox.removeAll {$0==id};if selectedID==id{selectedID=state.sessions.last?.id};persist()}
    func saveNotes(_ notes:String,for id:UUID) {guard !syncRunning,let index=state.sessions.firstIndex(where:{$0.id==id}) else{message="Wait for the requested transfer before editing a recording.";return};state.sessions[index].notes=String(notes.prefix(10000));if !state.outbox.contains(id){state.outbox.append(id)};persist()}
    func deleteLocalHistory() {guard !syncRunning else{message="Wait for the active transfer before deleting local history.";return};stop();state.sessions=[];state.beacons=[];state.bookmarks=[];state.outbox=[];selectedID=nil;persist()}
    func syncNow() async {
        guard state.settings.syncEnabled,!syncRunning,isForeground else{message="Enable sync and wait for any active transfer to finish.";return};syncRunning=true
        syncTask=Task {defer{self.syncRunning=false};do {let token=try self.auth.accessToken(settings:self.state.settings),client=try CloudSyncClient(url:self.state.settings.apiURL,token:token);for s in self.state.sessions where s.endedAt != nil {if !self.state.outbox.contains(s.id){self.state.outbox.append(s.id)}};try await self.checkpoint();self.syncStatus="Uploading requested sessions"
            for id in self.state.outbox {try Task.checkCancellation();guard self.isForeground,self.state.settings.syncEnabled else{throw CancellationError()};guard let s=self.state.sessions.first(where:{$0.id==id}),s.endedAt != nil else{continue};try await client.upload(s);try Task.checkCancellation();self.state.outbox.removeAll {$0==id};try await self.checkpoint()};self.syncStatus="Requested sessions synced"
        }catch{self.syncStatus="Upload pending · retry manually";if !(error is CancellationError){self.message=error.localizedDescription}}}
        await syncTask?.value;syncTask=nil
    }
    func downloadCloudHistory() async {
        guard state.settings.syncEnabled,!syncRunning,isForeground,activeID==nil else{message="Enable sync, stop recording and wait for any active transfer before downloading.";return};syncRunning=true
        syncTask=Task {defer{self.syncRunning=false};do {let client=try CloudSyncClient(url:self.state.settings.apiURL,token:self.auth.accessToken(settings:self.state.settings));var before:String?;var seen=Set<String>();var count=0
            repeat {try Task.checkCancellation();guard self.isForeground,self.state.settings.syncEnabled else{throw CancellationError()};let page=try await client.list(before:before)
                for summary in page.sessions {try Task.checkCancellation();guard self.isForeground else{throw CancellationError()};if self.state.outbox.contains(summary.id){continue};guard count<1000 else{throw DataError.invalid("Download limit reached. Export or delete older cloud sessions before retrying.")};let session=try await client.download(summary.id);try Task.checkCancellation();self.state.sessions.removeAll {$0.id==session.id};self.state.sessions.append(session);count+=1;try await self.checkpoint()}
                before=page.nextBefore;if let cursor=before {guard seen.insert(cursor).inserted else{throw DataError.invalid("Repeated cloud pagination cursor")}}
            }while before != nil
            self.selectedID=self.state.sessions.last?.id;self.syncStatus="Downloaded \(count) sessions · pending local uploads preserved"
        }catch{self.syncStatus="Download interrupted · local recordings preserved";if !(error is CancellationError){self.message=error.localizedDescription}}}
        await syncTask?.value;syncTask=nil
    }
    func deleteCloudHistory() async {guard !syncRunning,isForeground else{message="Wait for the requested transfer before deleting cloud history.";return};syncRunning=true;syncTask=Task {defer{self.syncRunning=false};do {let token=try self.auth.accessToken(settings:self.state.settings);try await CloudSyncClient(url:self.state.settings.apiURL,token:token).deleteAll();self.state.outbox=[];try await self.checkpoint();self.syncStatus="Cloud history deleted"}catch{if !(error is CancellationError){self.message=error.localizedDescription}}};await syncTask?.value;syncTask=nil}
}
