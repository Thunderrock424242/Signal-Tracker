import CoreBluetooth
import Combine
import SignalTrackerCore
struct VisibleBeacon:Identifiable {
    let id:UUID;var name:String;var rssi:Double;var lastSeen:Date;var services:[String];var history:[Double]
}
@MainActor
final class BLEReceiver:NSObject,ObservableObject,SignalReceiver,CBCentralManagerDelegate {
    let id="iphone-ble",name="iPhone BLE",capabilities=["BLE advertisements","RSSI (dBm)"]
    @Published private(set) var devices:[VisibleBeacon]=[]
    @Published private(set) var status="Not started"
    @Published private(set) var isConnected=false
    @Published private(set) var isScanning=false
    var interval:TimeInterval=1
    let measurements:AsyncStream<SignalMeasurement>;let spectrum:AsyncStream<SpectrumFrame>
    private let values:AsyncStream<SignalMeasurement>.Continuation
    private var central:CBCentralManager?;private var requested=false;private var emitted:[UUID:Date]=[:]
    override init() {
        var c:AsyncStream<SignalMeasurement>.Continuation!;measurements=AsyncStream(bufferingPolicy:.bufferingNewest(256)) {c=$0};values=c
        spectrum=AsyncStream {$0.finish()};super.init()
    }
    func start() {requested=true;if central==nil {central=CBCentralManager(delegate:self,queue:.main,options:[CBCentralManagerOptionShowPowerAlertKey:true])};scanIfReady()}
    private func scanIfReady() {guard requested,central?.state == .poweredOn else{return};central?.scanForPeripherals(withServices:nil,options:[CBCentralManagerScanOptionAllowDuplicatesKey:true]);isScanning=true;status="Scanning foreground advertisements"}
    func stop() {requested=false;central?.stopScan();isScanning=false;status=isConnected ? "Ready · scan paused" : status}
    func centralManagerDidUpdateState(_ central:CBCentralManager) {
        isConnected=central.state == .poweredOn
        switch central.state {case .poweredOn:status="Ready";scanIfReady();case .poweredOff:status="Bluetooth is off";case .unauthorized:status="Bluetooth permission denied. Enable it in iPhone Settings.";case .unsupported:status="Bluetooth unavailable on this device";default:status="Bluetooth starting"}
        if central.state != .poweredOn {isScanning=false}
    }
    func centralManager(_ central:CBCentralManager,didDiscover peripheral:CBPeripheral,advertisementData:[String:Any],rssi RSSI:NSNumber) {
        let power=RSSI.doubleValue;guard (-160...20).contains(power) else{return}
        let now=Date(),name=(advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? "Unnamed BLE device",services=(advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []).map(\.uuidString)
        if let i=devices.firstIndex(where:{$0.id==peripheral.identifier}) {devices[i].name=name;devices[i].rssi=power;devices[i].lastSeen=now;devices[i].services=services;devices[i].history=Array((devices[i].history+[power]).suffix(120))}
        else if devices.count<500 {devices.append(VisibleBeacon(id:peripheral.identifier,name:name,rssi:power,lastSeen:now,services:services,history:[power]))}
        guard now.timeIntervalSince(emitted[peripheral.identifier] ?? .distantPast)>=interval else{return};emitted[peripheral.identifier]=now
        var m=SignalMeasurement(timestamp:now,receiverID:id,receiverType:.ble,provenance:.measured,signalIdentifier:peripheral.identifier.uuidString,rssiDbm:power)
        m.metadata=["advertisedName":String(name.prefix(120)),"services":String(services.joined(separator:",").prefix(1000))]
        values.yield(m)
    }
}
