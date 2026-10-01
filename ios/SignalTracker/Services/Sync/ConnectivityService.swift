import Network
import Combine
@MainActor
final class ConnectivityService:ObservableObject {
    @Published private(set) var available=false
    @Published private(set) var status="Checking network path"
    var onChange:((Bool)->Void)?
    private let monitor=NWPathMonitor()
    init() {monitor.pathUpdateHandler={ [weak self] path in let value=path.status == .satisfied;Task {@MainActor in guard let self else{return};let changed=self.available != value;self.available=value;self.status=value ? "Network path available" : "Offline · local recording available";if changed {self.onChange?(value)}}};monitor.start(queue:DispatchQueue(label:"SignalTracker.Connectivity"))}
    deinit {monitor.cancel()}
}
