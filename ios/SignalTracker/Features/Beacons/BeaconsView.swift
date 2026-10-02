import SwiftUI
struct BeaconsView:View {
    @EnvironmentObject var field:FieldModel
    @State private var name = ""
    @State private var identifier = ""
    @State private var notes = ""
    @State private var tags = ""
    @State private var frequency = ""
    @State private var type = "ble"
    @State private var icon = "antenna.radiowaves.left.and.right"
    var body:some View {List {Section("Owned beacons") {ForEach(field.state.beacons) {b in VStack(alignment:.leading,spacing:6) {Label(b.name,systemImage:b.icon);Text(b.identifier).font(.caption.monospaced());Text(b.notes).font(.caption).foregroundStyle(.secondary);Text(b.tags.joined(separator:" · ")).font(.caption);Button("Hunt this beacon") {field.startHunt(target:b.identifier,name:b.name,source:b.type=="ble" ? "iphone-ble" : field.receiverID)}}.swipeActions {Button("Delete",role:.destructive) {field.state.beacons.removeAll {$0.id==b.id};field.persist()}}};if field.state.beacons.isEmpty {Text("Save an advertised device from Hunt or register your equipment here.")}};Section("Register owned equipment") {TextField("Name",text:$name);Picker("Type",selection:$type){Text("BLE").tag("ble");Text("External RF").tag("rf")};Picker("Icon",selection:$icon){Text("Antenna").tag("antenna.radiowaves.left.and.right");Text("Camp").tag("tent.fill");Text("Equipment").tag("backpack.fill")};TextField("Advertised identifier",text:$identifier).textInputAutocapitalization(.never);TextField("Expected frequency in Hz (optional)",text:$frequency).keyboardType(.decimalPad);TextField("Tags, separated by commas",text:$tags);TextField("Notes",text:$notes,axis:.vertical);Button("Save beacon") {field.saveBeacon(name:name,identifier:identifier,type:type,notes:notes,frequency:Double(frequency),tags:tags,icon:icon);name="";identifier="";notes="";tags="";frequency=""}}}.navigationTitle("Known Beacons")}
}
struct BookmarksView:View {
    @EnvironmentObject var field: FieldModel
    @State private var name = ""
    @State private var frequency = ""
    @State private var bandwidth = ""
    @State private var mode = ""
    @State private var notes = ""
    var body:some View {List {ForEach(field.state.bookmarks) {b in VStack(alignment:.leading){Text(b.name).font(.headline);Text("\(Int(b.frequencyHz)) Hz · \(Int(b.bandwidthHz)) Hz · \(b.mode)").font(.caption);Text(b.notes).font(.caption)}.swipeActions {Button("Delete",role:.destructive) {field.state.bookmarks.removeAll {$0.id==b.id};field.persist()}}};Section("Bookmark an authorized frequency") {TextField("Name",text:$name);TextField("Frequency Hz",text:$frequency).keyboardType(.decimalPad);TextField("Bandwidth Hz",text:$bandwidth).keyboardType(.decimalPad);TextField("Mode or type",text:$mode);TextField("Notes",text:$notes);Button("Save frequency") {guard let f=Double(frequency),let b=Double(bandwidth) else{field.message="Enter numeric frequency and bandwidth.";return};field.saveBookmark(name:name,frequency:f,bandwidth:b,mode:mode,notes:notes)}}}.navigationTitle("Frequency bookmarks")}
}
