import SwiftUI
import Charts
import SignalTrackerCore
struct HuntView:View {
    @EnvironmentObject var field:FieldModel
    @State private var mode="Graph"
    var body:some View {ScrollView {VStack(alignment:.leading,spacing:16) {
        if let session=field.selected,session.type == .hunt {
            ProvenanceBadge(simulated:session.isSimulated);Text(session.name).font(.title2.weight(.semibold))
            let values=field.selectedMeasurements.compactMap(\.strength)
            FieldCard(title:field.activeID==session.id ? "Signal hunt · recording" : "Saved hunt") {
                HStack(alignment:.firstTextBaseline){Text(values.last.map {String(format:"%.0f",$0)} ?? "—").font(.system(size:64,weight:.medium,design:.monospaced));Text(field.selectedMeasurements.last?.unit?.label ?? "dBm").foregroundStyle(.secondary)}
                Text(SignalMath.trend(values)).foregroundStyle(.mint)
                Text("Power is not an exact distance measurement.").font(.caption).foregroundStyle(.secondary)
            }
            if let region=field.currentRegion {FieldCard(title:"Estimated source region") {Text("Uncertainty radius: approximately \(Int(region.radiusMeters.rounded())) m").font(.headline);Text("\(region.confidence.rawValue.capitalized) heuristic confidence · \(region.sampleCount) separated samples");Text(region.bearingDegrees.map {"Estimated bearing \(Geo.compass($0)) · \(Int($0.rounded()))°"} ?? "More movement is needed for a bearing").foregroundStyle(.mint);Text("An observed strength region; the transmitter may lie outside it.").font(.caption).foregroundStyle(.secondary)}} else {Text("Walk through several separated locations with usable GPS to build an estimated region.").font(.subheadline).foregroundStyle(.secondary)}
            Picker("Hunt display",selection:$mode) {Text("Graph").tag("Graph");Text("Compass").tag("Compass")}.pickerStyle(.segmented)
            if mode=="Compass" {CompassHuntView()} else {SignalGraphView(samples:field.selectedMeasurements,smoothing:field.state.settings.smoothing)}
            HStack {Button("Map") {field.tab=2}.buttonStyle(.bordered);Spacer();if field.activeID==session.id {Button("Stop & save",role:.destructive) {field.stop()}.buttonStyle(.bordered)}}
        } else {EmptyField(title:"Choose your beacon",detail:"Start a foreground scan, then select a BLE device you own or are authorized to investigate.",icon:"antenna.radiowaves.left.and.right")}
        FieldCard(title:"Visible BLE devices") {
            Button(field.ble.isScanning ? "Stop scanning" : "Scan Bluetooth") {if field.ble.isScanning {field.ble.stop()}else{field.ble.start()}}.buttonStyle(.bordered)
            Text(field.ble.status).font(.caption).foregroundStyle(.secondary)
            ForEach(field.ble.devices.sorted {$0.rssi>$1.rssi}) {d in VStack(alignment:.leading,spacing:7) {HStack {Text(d.name).font(.headline);Spacer();Text("\(Int(d.rssi)) dBm").monospacedDigit()};Text(d.id.uuidString).font(.caption2.monospaced()).foregroundStyle(.secondary);Text("Last seen \(d.lastSeen.formatted(date:.omitted,time:.standard)) · Services: \(d.services.isEmpty ? "not advertised" : d.services.joined(separator:", "))").font(.caption);HStack {Button("Hunt my beacon") {field.startHunt(target:d.id.uuidString,name:d.name)};Spacer();Button("Save beacon") {field.saveBeacon(name:d.name,identifier:d.id.uuidString)}};Divider()}}
        }
    }.padding()}.background(InstrumentTheme.background).navigationTitle("Signal Hunter").navigationBarTitleDisplayMode(.inline)}
}
struct SignalGraphView:View {
    let samples:[SignalMeasurement];let smoothing:Bool;@State private var distanceAxis=false
    private var values:[(Int,Double,Double)] {let powers=samples.compactMap(\.strength),series=smoothing ? SignalMath.smooth(powers) : powers;var walked=0.0;return samples.enumerated().compactMap {i,m in guard i<series.count else{return nil};if i>0,let a=samples[i-1].location,let b=m.location {walked+=Geo.distance(a,b)};return (i,distanceAxis ? walked : m.timestamp.timeIntervalSince(samples.first!.timestamp),series[i])}}
    var body:some View {FieldCard(title:"Signal history") {Toggle("Distance traveled axis",isOn:$distanceAxis);Chart(values,id:\.0) {v in LineMark(x:.value(distanceAxis ? "Meters" : "Seconds",v.1),y:.value("Power",v.2)).foregroundStyle(.mint)}.frame(height:180);Text(smoothing ? "Smoothed display; raw readings remain in the recording." : "Raw recorded readings").font(.caption).foregroundStyle(.secondary)}}
}
struct CompassHuntView:View {
    @EnvironmentObject var field:FieldModel
    var body:some View {FieldCard(title:"Compass hunt") {ZStack {Circle().stroke(.mint.opacity(0.2),lineWidth:2).frame(width:180,height:180);Text("N").offset(y:-72);Image(systemName:"location.north.fill").font(.system(size:48)).foregroundStyle(.mint).rotationEffect(.degrees((field.currentRegion?.bearingDegrees ?? field.location.freshHeading ?? 0)-(field.location.freshHeading ?? 0)))}.frame(maxWidth:.infinity);Text("Heading: \(field.location.freshHeading.map {"\(Int($0))°"} ?? "unavailable")");Text("Walking course: \(field.location.course.map {Geo.compass($0)} ?? "waiting for movement")");Text(field.currentRegion?.bearingDegrees == nil ? "Arrow shows heading only. BLE RSSI provides no antenna direction." : "Arrow points toward an estimated region derived from movement.").font(.caption).foregroundStyle(.secondary)}}
}
