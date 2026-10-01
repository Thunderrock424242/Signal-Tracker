import Foundation
public enum RouteRecording {
    /// A GPS gap starts a new segment, never a fabricated connecting route.
    public static func next(_ point:RoutePoint,after previous:RoutePoint?)->RoutePoint? {
        guard point.fix.isValid,point.horizontalAccuracy<=65 else{return nil};guard let previous else{return point}
        let elapsed=point.timestamp.timeIntervalSince(previous.timestamp),distance=Geo.distance(previous.fix,point.fix)
        guard elapsed>0,distance>=max(3,min(15,point.horizontalAccuracy)) else{return nil};var value=point
        if elapsed>30 || distance>max(100,elapsed*8+point.horizontalAccuracy*2) {value.segmentStart=true};return value
    }
    public static func segments(_ route:[RoutePoint])->[[RoutePoint]] {var result:[[RoutePoint]]=[];for point in route {if result.isEmpty || point.segmentStart==true {result.append([point])}else{result[result.count-1].append(point)}};return result}
}
public enum SessionRecovery {
    public static func closeInterrupted(_ session:SignalSession)->SignalSession {guard session.endedAt==nil else{return session};var copy=session;copy.endedAt=([session.startedAt]+session.measurements.map(\.timestamp)+session.route.map(\.timestamp)+session.spectrum.map(\.timestamp)).max();copy.notes=String((session.notes+"\nRecovered interrupted foreground recording. End time is the last persisted observation; recording was not resumed automatically.").prefix(10000));return copy}
}
