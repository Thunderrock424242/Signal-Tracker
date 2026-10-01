import Foundation
public actor LocalStore {
    private let directory:URL;private var latestRevision:Int = -1
    public init(directory:URL?=nil) {self.directory=directory ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("SignalTracker",isDirectory:true)}
    private var file:URL {directory.appendingPathComponent("field-store-v1.json")}
    public func load() throws ->StoreState {
        guard FileManager.default.fileExists(atPath:file.path) else{return StoreState()}
        let state=try JSONCoding.decoder().decode(StoreState.self,from:Data(contentsOf:file))
        guard state.version==1 else{throw DataError.invalid("Unsupported local store. Export a backup before upgrading.")}
        try validate(state)
        latestRevision=state.revision;return state
    }
    public func save(_ state:StoreState) throws {
        guard state.revision>latestRevision else{return}
        try validate(state)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let data=try JSONCoding.encoder().encode(state)
        #if os(iOS)
        try data.write(to:file,options:[.atomic,.completeFileProtectionUnlessOpen])
        #else
        try data.write(to:file,options:.atomic)
        #endif
        latestRevision=state.revision
    }
    private func validate(_ state:StoreState) throws {
        guard state.beacons.count<=1000,state.bookmarks.count<=1000,state.beacons.allSatisfy(\.isValid),state.bookmarks.allSatisfy(\.isValid),(state.receivers?.count ?? 0)<=8,state.receivers?.allSatisfy(\.isValid) ?? true else{throw DataError.invalid("Invalid saved equipment or receiver configuration")}
        for session in state.sessions {try SessionCodec.validate(session)}
    }
}
