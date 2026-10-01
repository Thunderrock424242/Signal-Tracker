import Foundation

public enum Provenance: String, Codable, Sendable { case measured, simulated }
public enum ReceiverType: String, Codable, Sendable { case ble, esp32, sdr, lora, directional, simulation }
public enum PowerUnit: String, Codable, Sendable { case dbm, dbfs, db; public var label:String { self == .dbm ? "dBm" : self == .dbfs ? "dBFS" : "dB" } }
public enum Confidence: String, Codable, Sendable { case low, medium, high }
public enum SessionType: String, Codable, Sendable { case hunt, wilderness }
public enum BatteryMode: String, Codable, CaseIterable, Sendable { case highAccuracy, balanced, batterySaver }

public struct LocationFix: Codable, Hashable, Sendable {
    public var latitude:Double; public var longitude:Double; public var horizontalAccuracy:Double; public var altitude:Double?
    public init(latitude:Double,longitude:Double,horizontalAccuracy:Double,altitude:Double?=nil) { self.latitude=latitude;self.longitude=longitude;self.horizontalAccuracy=horizontalAccuracy;self.altitude=altitude }
    public var isValid:Bool { latitude.isFinite && longitude.isFinite && horizontalAccuracy.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude) && (0...100000).contains(horizontalAccuracy) && (altitude?.isFinite ?? true) }
}
public struct RoutePoint: Codable, Hashable, Identifiable, Sendable {
    public var latitude:Double; public var longitude:Double; public var horizontalAccuracy:Double; public var altitude:Double?; public var timestamp:Date
    public var segmentStart:Bool?
    public var id:Date { timestamp }
    public var fix:LocationFix { LocationFix(latitude:latitude,longitude:longitude,horizontalAccuracy:horizontalAccuracy,altitude:altitude) }
    public init(fix:LocationFix,timestamp:Date) {latitude=fix.latitude;longitude=fix.longitude;horizontalAccuracy=fix.horizontalAccuracy;altitude=fix.altitude;self.timestamp=timestamp}
}
public struct SignalMeasurement: Codable, Identifiable, Sendable {
    public var id:UUID; public var timestamp:Date; public var receiverID:String; public var receiverType:ReceiverType; public var provenance:Provenance
    public var location:LocationFix?; public var heading:Double?; public var headingAccuracy:Double?
    public var frequencyHz:Double?; public var bandwidthHz:Double?; public var rssiDbm:Double?; public var powerDb:Double?; public var powerUnit:PowerUnit?; public var snrDb:Double?
    public var bearingDegrees:Double?; public var bearingAccuracyDegrees:Double?; public var signalIdentifier:String?; public var metadata:[String:String]?
    public init(id:UUID=UUID(),timestamp:Date=Date(),receiverID:String,receiverType:ReceiverType,provenance:Provenance,signalIdentifier:String?=nil,rssiDbm:Double?=nil,powerDb:Double?=nil,powerUnit:PowerUnit?=nil,location:LocationFix?=nil) {
        self.id=id;self.timestamp=timestamp;self.receiverID=receiverID;self.receiverType=receiverType;self.provenance=provenance;self.signalIdentifier=signalIdentifier;self.rssiDbm=rssiDbm;self.powerDb=powerDb;self.powerUnit=powerUnit;self.location=location
    }
    public var strength:Double? { rssiDbm ?? powerDb }
    public var unit:PowerUnit? { rssiDbm != nil ? .dbm : powerUnit }
    public var isValid:Bool {
        let bounded:(Double?,ClosedRange<Double>)->Bool={v,r in v.map { $0.isFinite && r.contains($0) } ?? true}
        return !receiverID.isEmpty && receiverID.count<=200 && (location?.isValid ?? true) && (rssiDbm != nil || (powerDb != nil && powerUnit != nil)) && bounded(rssiDbm,-160...20) && bounded(powerDb,-300...200) && bounded(heading,0...359.999999) && bounded(headingAccuracy,0...180) && bounded(frequencyHz,0.000001...1e13) && bounded(bandwidthHz,0.000001...1e12) && bounded(snrDb,-100...150) && bounded(bearingDegrees,0...359.999999) && bounded(bearingAccuracyDegrees,0...180) && (signalIdentifier.map { !$0.isEmpty && $0.count<=200 } ?? true) && (metadata.map { $0.count<=30 && $0.allSatisfy { $0.key.count<=80 && $0.value.count<=1000 } } ?? true)
    }
}
public struct EstimatedRegion: Codable, Identifiable, Sendable {
    public var id:UUID; public var centerLatitude:Double; public var centerLongitude:Double; public var radiusMeters:Double; public var confidence:Confidence; public var algorithm:String; public var sampleCount:Int
    public var meanRSSI:Double?; public var variance:Double; public var createdAt:Date; public var label:String="Estimated source region"; public var bearingDegrees:Double?; public var provenance:Provenance
    public init(id:UUID,center:LocationFix,radius:Double,confidence:Confidence,sampleCount:Int,meanRSSI:Double?,variance:Double,createdAt:Date,bearingDegrees:Double?,provenance:Provenance) {self.id=id;centerLatitude=center.latitude;centerLongitude=center.longitude;radiusMeters=radius;self.confidence=confidence;algorithm="WeightedRegionEstimator/v1";self.sampleCount=sampleCount;self.meanRSSI=meanRSSI;self.variance=variance;self.createdAt=createdAt;self.bearingDegrees=bearingDegrees;self.provenance=provenance}
    public var center:LocationFix { LocationFix(latitude:centerLatitude,longitude:centerLongitude,horizontalAccuracy:radiusMeters) }
}
public struct SpectrumFrame: Codable, Identifiable, Sendable {
    public var id:UUID; public var timestamp:Date; public var receiverID:String; public var provenance:Provenance; public var centerFrequencyHz:Double; public var spanHz:Double; public var powerUnit:PowerUnit; public var bins:[Double]
    public init(id:UUID=UUID(),timestamp:Date,receiverID:String,provenance:Provenance,centerFrequencyHz:Double,spanHz:Double,powerUnit:PowerUnit,bins:[Double]) {self.id=id;self.timestamp=timestamp;self.receiverID=receiverID;self.provenance=provenance;self.centerFrequencyHz=centerFrequencyHz;self.spanHz=spanHz;self.powerUnit=powerUnit;self.bins=bins}
    public var isValid:Bool { (2...1024).contains(bins.count) && bins.allSatisfy { $0.isFinite && (-300...200).contains($0) } && !receiverID.isEmpty && receiverID.count<=200 && centerFrequencyHz.isFinite && centerFrequencyHz>0 && centerFrequencyHz<=1e13 && spanHz.isFinite && spanHz>0 && spanHz<=1e12 && centerFrequencyHz-spanHz/2>=0 }
    public func frequency(at index:Int)->Double { centerFrequencyHz-spanHz/2+Double(index)*spanHz/Double(max(1,bins.count-1)) }
}
public struct KnownBeacon: Codable, Identifiable, Sendable {
    public var id:UUID=UUID();public var name:String;public var type:String;public var identifier:String;public var icon:String;public var notes:String;public var frequencyHz:Double?;public var tags:[String]
    public init(name:String,type:String="ble",identifier:String,icon:String="antenna.radiowaves.left.and.right",notes:String="",frequencyHz:Double?=nil,tags:[String]=[]) {self.name=name;self.type=type;self.identifier=identifier;self.icon=icon;self.notes=notes;self.frequencyHz=frequencyHz;self.tags=tags}
    public var isValid:Bool {!name.isEmpty && name.count<=100 && ["ble","rf"].contains(type) && !identifier.isEmpty && identifier.count<=200 && icon.count<=50 && notes.count<=2000 && (frequencyHz.map {$0.isFinite && $0>0 && $0<=1e13} ?? true) && tags.count<=20 && tags.allSatisfy {$0.count<=50}}
}
public struct FrequencyBookmark: Codable, Identifiable, Sendable {
    public var id:UUID=UUID();public var name:String;public var frequencyHz:Double;public var bandwidthHz:Double;public var mode:String;public var notes:String
    public init(name:String,frequencyHz:Double,bandwidthHz:Double,mode:String,notes:String) {self.name=name;self.frequencyHz=frequencyHz;self.bandwidthHz=bandwidthHz;self.mode=mode;self.notes=notes}
    public var isValid:Bool {!name.isEmpty && name.count<=100 && frequencyHz.isFinite && frequencyHz>0 && frequencyHz<=1e13 && bandwidthHz.isFinite && bandwidthHz>0 && bandwidthHz<=1e12 && mode.count<=50 && notes.count<=2000}
}
public struct Waypoint: Codable, Identifiable, Sendable {
    public var id:UUID=UUID();public var name:String;public var latitude:Double;public var longitude:Double;public var horizontalAccuracy:Double;public var altitude:Double?;public var timestamp:Date
    public init(name:String,fix:LocationFix,timestamp:Date=Date()) {self.name=name;latitude=fix.latitude;longitude=fix.longitude;horizontalAccuracy=fix.horizontalAccuracy;altitude=fix.altitude;self.timestamp=timestamp}
}
public struct SignalSession: Codable, Identifiable, Sendable {
    public var schemaVersion:Int=1;public var id:UUID;public var name:String;public var type:SessionType;public var startedAt:Date;public var endedAt:Date?;public var targetSignal:String?
    public var measurements:[SignalMeasurement]=[];public var route:[RoutePoint]=[];public var estimatedRegions:[EstimatedRegion]=[];public var spectrum:[SpectrumFrame]=[];public var waypoints:[Waypoint]=[];public var lastServicePoint:RoutePoint?;public var notes:String=""
    public init(id:UUID=UUID(),name:String,type:SessionType,startedAt:Date=Date(),targetSignal:String?=nil) {self.id=id;self.name=name;self.type=type;self.startedAt=startedAt;self.targetSignal=targetSignal}
    public var isSimulated:Bool { measurements.contains { $0.provenance == .simulated } || spectrum.contains { $0.provenance == .simulated } }
}
public struct FieldSettings: Codable, Sendable, Equatable {
    public var batteryMode:BatteryMode = .balanced;public var smoothing=true;public var heatmapOpacity:Double=0.6;public var coordinateOnlyMap=false;public var syncEnabled=false
    public var apiURL="";public var issuer="";public var clientID="";public var audience="signal-tracker"
    public init() {}
}
public struct ReceiverConfiguration: Codable, Sendable {
    public var id:String;public var name:String;public var url:String
    public init(id:String,name:String,url:String) {self.id=id;self.name=name;self.url=url}
    public var isValid:Bool {guard let endpoint=URL(string:url) else{return false};return !id.isEmpty && id.count<=200 && !name.isEmpty && name.count<=100 && url.count<=2000 && endpoint.scheme=="https" && endpoint.host != nil && endpoint.user==nil && endpoint.password==nil}
}
public struct StoreState: Codable, Sendable {
    public var version=1;public var revision:Int=0;public var sessions:[SignalSession]=[];public var beacons:[KnownBeacon]=[];public var bookmarks:[FrequencyBookmark]=[];public var settings=FieldSettings();public var outbox:[UUID]=[]
    public var receivers:[ReceiverConfiguration]?
    public init() {}
}
