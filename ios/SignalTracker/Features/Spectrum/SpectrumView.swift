import SwiftUI
import Charts
import SignalTrackerCore
struct SpectrumView:View {
    @EnvironmentObject var field:FieldModel
    @State private var zoom=1.0;@State private var pan=0.5;@State private var cursor=0.5
    private var frames:[SpectrumFrame] {guard let frames=field.selected?.spectrum,let last=frames.last else{return []};return frames.filter {$0.receiverID==last.receiverID && $0.centerFrequencyHz==last.centerFrequencyHz && $0.spanHz==last.spanHz && $0.bins.count==last.bins.count && $0.powerUnit==last.powerUnit && $0.provenance==last.provenance}}
    var body:some View {ScrollView {VStack(alignment:.leading,spacing:16) {if let f=frames.last {
        ProvenanceBadge(simulated:f.provenance == .simulated)
        FieldCard(title:"Spectrum · \(f.powerUnit.label)") {HStack {Metric(label:"Center",value:String(format:"%.3f",f.centerFrequencyHz/1e6),unit:"MHz");Spacer();Metric(label:"Span",value:String(format:"%.2f",f.spanHz/1e6),unit:"MHz")}
            let range=visible(f);Chart(Array(range),id:\.self) {i in LineMark(x:.value("Frequency MHz",f.frequency(at:i)/1e6),y:.value(f.powerUnit.label,f.bins[i])).foregroundStyle(.mint)}.frame(height:170)
            Text("Zoom");Slider(value:$zoom,in:1...8);Text("Pan");Slider(value:$pan,in:0...1);Text("Frequency cursor");Slider(value:$cursor,in:0...1)
            let index=range.lowerBound+Int(Double(max(1,range.count-1))*cursor);Text("Cursor: \(String(format:"%.4f",f.frequency(at:min(index,f.bins.count-1))/1e6)) MHz").font(.caption.monospaced())}
        FieldCard(title:"Waterfall · recorded time") {WaterfallCanvas(frames:Array(frames.suffix(128)),range:visible(f)).frame(height:240);Text("Frequency →   Time ↓   Brighter colors indicate stronger recorded power.").font(.caption).foregroundStyle(.secondary)}
        FieldCard(title:"Detected peaks") {ForEach(SignalMath.peaks(f),id:\.self) {i in HStack {Text(String(format:"%.4f MHz",f.frequency(at:i)/1e6)).monospaced();Spacer();Text(String(format:"%.1f %@",f.bins[i],f.powerUnit.label))}};Text("Peaks identify bins, not transmitters or decoded content.").font(.caption).foregroundStyle(.secondary)}
        NavigationLink("Frequency bookmarks") {BookmarksView()}
    } else {EmptyField(title:"Connect a spectrum receiver",detail:"An iPhone cannot scan arbitrary RF. Connect an authorized SDR bridge or load the labeled demo recording.",icon:"waveform.path")}}.padding()}.background(InstrumentTheme.background).navigationTitle("Spectrum")}
    private func visible(_ f:SpectrumFrame)->Range<Int> {let count=max(2,Int(Double(f.bins.count)/zoom)),start=Int(Double(max(0,f.bins.count-count))*pan);return start..<min(f.bins.count,start+count)}
}
struct WaterfallCanvas:View {
    let frames:[SpectrumFrame];let range:Range<Int>
    var body:some View {Canvas {context,size in guard !frames.isEmpty,!range.isEmpty else{return};let w=size.width/CGFloat(range.count),h=size.height/CGFloat(frames.count);for (row,f) in frames.enumerated() {for (column,index) in range.enumerated() where index<f.bins.count {let intensity=max(0,min(1,(f.bins[index]+110)/65));let color=Color(hue:0.62-intensity*0.45,saturation:0.75,brightness:0.12+intensity*0.88);context.fill(Path(CGRect(x:CGFloat(column)*w,y:CGFloat(row)*h,width:w+0.5,height:h+0.5)),with:.color(color))}}}}
}
