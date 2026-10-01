import SwiftUI
struct RootView:View {
    @EnvironmentObject var field:FieldModel
    var body:some View {
        TabView(selection:$field.tab) {
            NavigationStack {DashboardView()}.tabItem {Label("Home",systemImage:"square.grid.2x2")}.tag(0)
            NavigationStack {HuntView()}.tabItem {Label("Hunt",systemImage:"antenna.radiowaves.left.and.right")}.tag(1)
            NavigationStack {FieldMapView()}.tabItem {Label("Map",systemImage:"map")}.tag(2)
            NavigationStack {SpectrumView()}.tabItem {Label("Spectrum",systemImage:"waveform.path")}.tag(3)
            NavigationStack {MoreView()}.tabItem {Label("More",systemImage:"ellipsis.circle")}.tag(4)
        }.onChange(of:field.state.settings) {_,_ in field.settingsChanged()}
        .alert("Signal Tracker",isPresented:Binding(get:{field.message != nil},set:{if !$0 {field.message=nil}})) {Button("OK") {field.message=nil}} message:{Text(field.message ?? "")}
    }
}
