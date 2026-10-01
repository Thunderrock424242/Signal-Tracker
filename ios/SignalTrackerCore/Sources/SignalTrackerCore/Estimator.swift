import Foundation
public protocol RegionEstimating: Sendable {func estimate(_ samples:[SignalMeasurement])->EstimatedRegion?}
public struct WeightedRegionEstimator: RegionEstimating {
    private struct Domain:Hashable {let receiver:String;let target:String?;let unit:String?;let frequency:Double?;let provenance:String}
    public init() {}
    public func estimate(_ samples:[SignalMeasurement])->EstimatedRegion? {
        let valid=samples.filter {$0.isValid && $0.location != nil && $0.location!.horizontalAccuracy<=65}
        guard valid.count>=4 else{return nil}
        let domains=Set(valid.map {Domain(receiver:$0.receiverID,target:$0.signalIdentifier,unit:$0.unit?.rawValue,frequency:$0.frequencyHz,provenance:$0.provenance.rawValue)})
        guard domains.count==1 else{return nil}
        let sorted=valid.compactMap(\.strength).sorted(),median=sorted[sorted.count/2],dev=sorted.map {abs($0-median)}.sorted(),mad=dev[dev.count/2]
        var points:[SignalMeasurement]=[]
        for m in valid where abs(m.strength!-median)<=max(12,3*mad) {if !points.contains(where:{Geo.distance($0.location!,m.location!)<3}) {points.append(m)}}
        guard points.count>=4 else{return nil}
        let origin=points[0].location!,scale=111320*cos(origin.latitude*Double.pi/180)
        let xs=points.map {Geo.wrap($0.location!.longitude-origin.longitude)*scale},ys=points.map {($0.location!.latitude-origin.latitude)*111320},powers=points.map {$0.strength!}
        let span=hypot(xs.max()!-xs.min()!,ys.max()!-ys.min()!)
        guard span>=12 && span<=50000 else{return nil}
        let low=powers.min()!,weights=points.indices.map {pow(10,min(24,powers[$0]-low)/20)/max(5,points[$0].location!.horizontalAccuracy)},total=weights.reduce(0,+)
        let cx=points.indices.reduce(0) {$0+xs[$1]*weights[$1]}/total,cy=points.indices.reduce(0) {$0+ys[$1]*weights[$1]}/total
        let accuracy=points.reduce(0) {$0+$1.location!.horizontalAccuracy}/Double(points.count),mean=powers.reduce(0,+)/Double(powers.count),variance=powers.reduce(0) {$0+pow($1-mean,2)}/Double(powers.count)
        let mx=xs.reduce(0,+)/Double(xs.count),my=ys.reduce(0,+)/Double(ys.count)
        let xx=xs.reduce(0) {$0+pow($1-mx,2)},yy=ys.reduce(0) {$0+pow($1-my,2)},cross=xs.indices.reduce(0) {$0+(xs[$1]-mx)*(ys[$1]-my)}
        let discriminant=sqrt(pow(xx-yy,2)+4*cross*cross),ratio=(xx+yy-discriminant)/max(1,xx+yy+discriminant)
        let confidence:Confidence=points.count>=40 && span>=50 && accuracy<=10 && ratio>=0.2 && variance<=100 ? .high : points.count>=12 && span>=30 && accuracy<=20 && ratio>=0.08 ? .medium : .low
        let center=LocationFix(latitude:origin.latitude+cy/111320,longitude:Geo.wrap(origin.longitude+cx/(111320*max(0.01,cos(origin.latitude*Double.pi/180)))),horizontalAccuracy:accuracy),last=points.last!
        let bearing=span>=30 && points.count>=12 && ratio>=0.08 && variance>=4 && Geo.distance(last.location!,center)>accuracy*2 ? Geo.bearing(last.location!,center) : nil
        return EstimatedRegion(id:last.id,center:center,radius:max(20,accuracy*2,span*0.65),confidence:confidence,sampleCount:points.count,meanRSSI:last.rssiDbm != nil ? mean : nil,variance:variance,createdAt:last.timestamp,bearingDegrees:bearing,provenance:last.provenance)
    }
}
