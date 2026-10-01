import Foundation
public enum Geo {
    public static func wrap(_ n:Double)->Double { var value=(n+180).truncatingRemainder(dividingBy:360);if value<0 {value+=360};return value-180 }
    public static func distance(_ a:LocationFix,_ b:LocationFix)->Double {let rad=Double.pi/180;let h=pow(sin((b.latitude-a.latitude)*rad/2),2)+cos(a.latitude*rad)*cos(b.latitude*rad)*pow(sin(wrap(b.longitude-a.longitude)*rad/2),2);return 6371000*2*atan2(sqrt(min(1,h)),sqrt(max(0,1-h)))}
    public static func bearing(_ a:LocationFix,_ b:LocationFix)->Double {let rad=Double.pi/180,d=wrap(b.longitude-a.longitude)*rad;return (atan2(sin(d)*cos(b.latitude*rad),cos(a.latitude*rad)*sin(b.latitude*rad)-sin(a.latitude*rad)*cos(b.latitude*rad)*cos(d))/rad+360).truncatingRemainder(dividingBy:360)}
    public static func routeDistance(_ route:[RoutePoint])->Double {zip(route,route.dropFirst()).reduce(0) {$0+($1.1.segmentStart==true ? 0 : distance($1.0.fix,$1.1.fix))}}
    public static func compass(_ bearing:Double)->String { ["N","NE","E","SE","S","SW","W","NW"][Int((bearing/45).rounded())%8] }
}
public enum SignalMath {
    public static func smooth(_ values:[Double],alpha:Double=0.25)->[Double] { var previous:Double?;return values.filter(\.isFinite).map {v in let next=previous.map {alpha*v+(1-alpha)*$0} ?? v;previous=next;return next} }
    public static func trend(_ values:[Double])->String {let s=smooth(Array(values.suffix(12)));guard s.count>=4 else{return "Collecting samples"};let d=s.last!-s.first!;return d>2 ? "↑ Getting stronger" : d < -2 ? "↓ Getting weaker" : "→ Signal steady"}
    public static func peaks(_ frame:SpectrumFrame)->[Int] {let sorted=frame.bins.sorted(),floor=sorted[sorted.count/2];return frame.bins.indices.filter {i in i>0 && i<frame.bins.count-1 && frame.bins[i]>frame.bins[i-1] && frame.bins[i]>=frame.bins[i+1] && frame.bins[i]-floor>=8}.sorted {frame.bins[$0]>frame.bins[$1]}.prefix(12).map {$0}}
}
