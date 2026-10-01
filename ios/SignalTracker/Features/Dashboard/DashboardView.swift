import SwiftUI
struct DashboardView:View {
    @EnvironmentObject var field:FieldModel
    var body:some View {ScrollView {VStack(alignment:.leading,spacing:20) {
        HStack {Image(systemName:"antenna.radiowaves.left.and.right").font(.title).foregroundStyle(.mint);VStack(alignment:.leading){Text("SIGNAL TRACKER").font(.title3.monospaced().weight(.bold));Text("Your field. Your signals.").font(.caption).foregroundStyle(.secondary)};Spacer();Image(systemName:"location.north.circle").font(.title2)}
        FieldCard(title:"Field status") {Label(field.location.status,systemImage:"location");Label(field.ble.status,systemImage:"antenna.radiowaves.left.and.right");Label(field.location.heading == nil ? "Compass awaiting a heading" : "Compass available",systemImage:"safari");Label(field.connectivity.status,systemImage:"network");Text("External receivers: \(field.receivers.filter(\.isConnected).count) connected").font(.caption).foregroundStyle(.secondary)}
        if let s=field.selected {FieldCard(title:field.activeID != nil ? "Active session" : "Selected recording") {ProvenanceBadge(simulated:s.isSimulated);Text(s.name).font(.headline);HStack {Metric(label:"Samples",value:"\(s.measurements.count)",unit:"");Spacer();Metric(label:"Route",value:String(format:"%.0f",SignalTrackerDistance(s)),unit:"m")};Button("Open hunt") {field.tab=1}}}
        LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:12) {
            card("Signal Hunter","antenna.radiowaves.left.and.right") {field.tab=1};card("Live Map","map") {field.tab=2}
            NavigationLink {WildernessView()} label:{tile("Wilderness Mode","mountain.2")};card("Spectrum","waveform.path") {field.tab=3}
            NavigationLink {BeaconsView()} label:{tile("Known Beacons","dot.radiowaves.left.and.right")};NavigationLink {ReceiversView()} label:{tile("Receiver Devices","externaldrive")}
            NavigationLink {SessionsView()} label:{tile("Saved Hunts","tray.full")};NavigationLink {HistoryView()} label:{tile("Signal History","chart.xyaxis.line")};NavigationLink {SettingsView()} label:{tile("Settings","slider.horizontal.3")}
        }
        Button("Load demo hunt") {field.showDemo()}.buttonStyle(.bordered);Button("Start simulated hunt") {field.startHunt(target:"demo-camp-beacon",name:"SIMULATED field exercise",source:"simulation")}.buttonStyle(.bordered)
        Text("Local recording works without an account. Spectrum requires an external receiver; demo recordings are clearly labeled.").font(.footnote).foregroundStyle(.secondary)
    }.padding()}.background(InstrumentTheme.background).navigationTitle("Field overview").navigationBarTitleDisplayMode(.inline)}
    private func tile(_ title:String,_ icon:String)->some View {VStack(alignment:.leading,spacing:18){Image(systemName:icon).foregroundStyle(.mint).font(.title2);Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)}.frame(maxWidth:.infinity,minHeight:96,alignment:.leading).padding(16).background(InstrumentTheme.panel,in:RoundedRectangle(cornerRadius:14))}
    private func card(_ title:String,_ icon:String,action:@escaping()->Void)->some View {Button(action:action){tile(title,icon)}}
}
import SignalTrackerCore
private func SignalTrackerDistance(_ s:SignalSession)->Double {Geo.routeDistance(s.route)}
