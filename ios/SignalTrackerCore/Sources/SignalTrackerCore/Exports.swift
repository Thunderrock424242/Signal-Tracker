import Foundation
public enum SessionExport {
    private static func cell(_ value:String,number:Bool=false)->String {let guarded = !number && ["=","+","-","@","\t","\r"].contains(String(value.prefix(1))) ? "'"+value : value;return "\""+guarded.replacingOccurrences(of:"\"",with:"\"\"")+"\""}
    public static func csv(_ s:SignalSession)->String {
        let header="id,timestamp,receiverID,receiverType,provenance,signalIdentifier,latitude,longitude,horizontalAccuracy,altitude,heading,headingAccuracy,frequencyHz,bandwidthHz,rssiDbm,powerDb,powerUnit,snrDb,bearingDegrees,bearingAccuracyDegrees,metadata"
        let rows=s.measurements.map {m -> String in
            let prefix=[m.id.uuidString,JSONCoding.dateString(m.timestamp),m.receiverID,m.receiverType.rawValue,m.provenance.rawValue,m.signalIdentifier ?? ""].map {cell($0)}
            let numbers=[m.location?.latitude,m.location?.longitude,m.location?.horizontalAccuracy,m.location?.altitude,m.heading,m.headingAccuracy,m.frequencyHz,m.bandwidthHz,m.rssiDbm,m.powerDb].map {cell($0.map {String($0)} ?? "",number:true)}
            let meta=(try? JSONCoding.encoder().encode(m.metadata ?? [:])).flatMap {String(data:$0,encoding:.utf8)} ?? "{}"
            let tail=[cell(m.powerUnit?.rawValue ?? ""),cell(m.snrDb.map {String($0)} ?? "",number:true),cell(m.bearingDegrees.map {String($0)} ?? "",number:true),cell(m.bearingAccuracyDegrees.map {String($0)} ?? "",number:true),cell(meta)]
            return (prefix+numbers+tail).joined(separator:",")
        };return ([header]+rows).joined(separator:"\r\n")
    }
    public static func geoJSON(_ s:SignalSession) throws ->Data {
        var features:[[String:Any]]=s.measurements.compactMap {m in guard let l=m.location else{return nil};var p:[String:Any]=["kind":"measurement","id":m.id.uuidString,"timestamp":JSONCoding.dateString(m.timestamp),"provenance":m.provenance.rawValue,"receiverID":m.receiverID];if let r=m.rssiDbm {p["rssiDbm"]=r};if let r=m.powerDb {p["powerDb"]=r};if let u=m.powerUnit {p["powerUnit"]=u.rawValue};return ["type":"Feature","properties":p,"geometry":["type":"Point","coordinates":[l.longitude,l.latitude]]]} 
        for segment in RouteRecording.segments(s.route) where segment.count>=2 {features.append(["type":"Feature","properties":["kind":"breadcrumb","timestamps":segment.map {JSONCoding.dateString($0.timestamp)}],"geometry":["type":"LineString","coordinates":segment.map {[$0.longitude,$0.latitude]}]])}
        for w in s.waypoints {features.append(["type":"Feature","properties":["kind":"waypoint","name":w.name,"timestamp":JSONCoding.dateString(w.timestamp)],"geometry":["type":"Point","coordinates":[w.longitude,w.latitude]]])}
        for e in s.estimatedRegions {let ring=(0...64).map {i -> [Double] in let bearing=Double(i)*2*Double.pi/64,r=e.radiusMeters/6371000,lat=e.centerLatitude*Double.pi/180,lon=e.centerLongitude*Double.pi/180,l=asin(sin(lat)*cos(r)+cos(lat)*sin(r)*cos(bearing)),o=lon+atan2(sin(bearing)*sin(r)*cos(lat),cos(r)-sin(lat)*sin(l));return [Geo.wrap(o*180/Double.pi),l*180/Double.pi]};features.append(["type":"Feature","properties":["kind":"estimated-region","label":e.label,"confidence":e.confidence.rawValue,"radiusMeters":e.radiusMeters,"algorithm":e.algorithm,"provenance":e.provenance.rawValue],"geometry":["type":"Polygon","coordinates":[ring]]])}
        return try JSONSerialization.data(withJSONObject:["type":"FeatureCollection","features":features],options:.sortedKeys)
    }
}
