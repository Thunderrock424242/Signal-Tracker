import Foundation
public enum DataError:LocalizedError {case invalid(String);public var errorDescription:String? {if case .invalid(let reason)=self{return reason};return nil}}
public enum JSONCoding {
    public static func dateString(_ date:Date)->String {let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.string(from:date)}
    public static func encoder()->JSONEncoder {let e=JSONEncoder();e.outputFormatting=[.sortedKeys];e.dateEncodingStrategy = .custom {date,encoder in var c=encoder.singleValueContainer();try c.encode(dateString(date))};return e}
    public static func decoder()->JSONDecoder {let d=JSONDecoder();d.dateDecodingStrategy = .custom {decoder in let c=try decoder.singleValueContainer(),s=try c.decode(String.self),f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];if let date=f.date(from:s){return date};f.formatOptions=[.withInternetDateTime];guard let date=f.date(from:s) else {throw DataError.invalid("Invalid timestamp")};return date};return d}
}
public enum SessionCodec {
    public static func validate(_ s:SignalSession) throws {
        guard s.schemaVersion==1,!s.name.isEmpty,s.name.count<=120,s.targetSignal.map({!$0.isEmpty && $0.count<=200}) ?? true,s.measurements.count<=20000,s.route.count<=20000,s.estimatedRegions.count<=1000,s.spectrum.count<=300,s.waypoints.count<=1000,s.notes.count<=10000,s.endedAt.map({$0>=s.startedAt}) ?? true else{throw DataError.invalid("Invalid or oversized version-1 session")}
        guard s.measurements.allSatisfy(\.isValid),s.route.allSatisfy({$0.fix.isValid}),s.spectrum.allSatisfy(\.isValid),s.waypoints.allSatisfy({!$0.name.isEmpty && $0.name.count<=100 && LocationFix(latitude:$0.latitude,longitude:$0.longitude,horizontalAccuracy:$0.horizontalAccuracy,altitude:$0.altitude).isValid}),s.lastServicePoint?.fix.isValid ?? true else{throw DataError.invalid("Invalid measurement or route coordinates")}
        guard s.estimatedRegions.allSatisfy({LocationFix(latitude:$0.centerLatitude,longitude:$0.centerLongitude,horizontalAccuracy:0).isValid && $0.radiusMeters.isFinite && $0.radiusMeters>0 && $0.radiusMeters<=2e7 && !$0.algorithm.isEmpty && $0.algorithm.count<=100 && ($0.bearingDegrees.map {$0.isFinite && $0>=0 && $0<360} ?? true) && $0.label=="Estimated source region" && (4...20000).contains($0.sampleCount) && $0.variance.isFinite && $0.variance>=0 && ($0.meanRSSI?.isFinite ?? true)}) else{throw DataError.invalid("Invalid estimated region")}
    }
    public static func decode(_ data:Data) throws ->SignalSession {
        guard data.count<=2_000_000 else{throw DataError.invalid("Recording exceeds 2 MB. Split long sessions.")}
        guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(object.keys).isSubset(of:["schemaVersion","id","name","type","startedAt","endedAt","targetSignal","measurements","route","estimatedRegions","spectrum","waypoints","lastServicePoint","notes"]) else{throw DataError.invalid("Unknown session fields")}
        let s=try JSONCoding.decoder().decode(SignalSession.self,from:data);try validate(s);return s
    }
    public static func encode(_ s:SignalSession) throws ->Data {try validate(s);let data=try JSONCoding.encoder().encode(s);guard data.count<=2_000_000 else{throw DataError.invalid("Recording exceeds the 2 MB export limit. Split long sessions.")};return data}
}
public enum DemoData {public static func load() throws ->SignalSession {guard let url=Bundle.module.url(forResource:"demo-session",withExtension:"json") else{throw DataError.invalid("Demo resource is unavailable")};return try SessionCodec.decode(Data(contentsOf:url))}}
