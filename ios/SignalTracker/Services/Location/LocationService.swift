import CoreLocation
import Combine
import SignalTrackerCore
@MainActor
final class LocationService:NSObject,ObservableObject,CLLocationManagerDelegate {
    @Published private(set) var latest:RoutePoint?
    @Published private(set) var heading:Double?
    @Published private(set) var headingAccuracy:Double?
    @Published private(set) var course:Double?
    @Published private(set) var status="Location not requested"
    @Published private(set) var precise=false
    var onFix:((RoutePoint)->Void)?
    private let manager=CLLocationManager();private var wanted=false;private var headingDate:Date?
    override init() {super.init();manager.delegate=self}
    func start(mode:BatteryMode) {wanted=true;configure(mode);manager.requestWhenInUseAuthorization();resumeIfAllowed()}
    func configure(_ mode:BatteryMode) {manager.desiredAccuracy=mode == .highAccuracy ? kCLLocationAccuracyBest : mode == .batterySaver ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyBest;manager.distanceFilter=mode == .highAccuracy ? 2 : mode == .batterySaver ? 15 : 5;manager.headingFilter=mode == .batterySaver ? 10 : 3;manager.activityType = .fitness;manager.pausesLocationUpdatesAutomatically=true}
    func stop() {wanted=false;manager.stopUpdatingLocation();manager.stopUpdatingHeading();status="Paused"}
    private func resumeIfAllowed() {
        guard wanted else{return}
        switch manager.authorizationStatus {case .authorizedAlways,.authorizedWhenInUse:precise=manager.accuracyAuthorization == .fullAccuracy;status=precise ? "Acquiring GPS" : "Approximate location · confidence reduced";manager.startUpdatingLocation();if CLLocationManager.headingAvailable() {manager.startUpdatingHeading()};case .denied,.restricted:status="Location denied. Power readings still work; geographic recording requires permission.";default:status="Awaiting location permission"}
    }
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager) {resumeIfAllowed()}
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]) {
        guard let l=locations.last,l.horizontalAccuracy>=0,abs(l.timestamp.timeIntervalSinceNow)<15 else{return}
        let fix=LocationFix(latitude:l.coordinate.latitude,longitude:l.coordinate.longitude,horizontalAccuracy:l.horizontalAccuracy,altitude:l.verticalAccuracy>=0 ? l.altitude : nil)
        guard fix.isValid else{return};let point=RoutePoint(fix:fix,timestamp:l.timestamp);latest=point;course=l.course>=0 && l.speed>0.5 ? l.course : nil;status=precise ? "GPS available" : "Approximate location";onFix?(point)
    }
    func locationManager(_ manager:CLLocationManager,didUpdateHeading newHeading:CLHeading) {guard newHeading.headingAccuracy>=0 else{heading=nil;headingAccuracy=nil;return};heading=newHeading.trueHeading>=0 ? newHeading.trueHeading : newHeading.magneticHeading;headingAccuracy=newHeading.headingAccuracy;headingDate=Date()}
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error) {status=error.localizedDescription}
    var freshFix:LocationFix? {guard let p=latest,abs(p.timestamp.timeIntervalSinceNow)<=15 else{return nil};return p.fix}
    var freshHeading:Double? {guard let date=headingDate,date.timeIntervalSinceNow > -15 else{return nil};return heading}
}
