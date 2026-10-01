import XCTest
@testable import SignalTrackerCore

final class CoreTests: XCTestCase {
    func testDemoInterchangeRoundTrip() throws {
        let session = try DemoData.load()
        XCTAssertTrue(session.measurements.allSatisfy { $0.provenance == .simulated })
        XCTAssertGreaterThan(session.spectrum.count, 10)
        let decoded = try SessionCodec.decode(SessionCodec.encode(session))
        XCTAssertEqual(decoded.id, session.id)
        XCTAssertEqual(decoded.measurements.first?.rssiDbm, session.measurements.first?.rssiDbm)
    }
    func testSparseAndStationaryDataCannotEstimate() throws {
        let samples = try DemoData.load().measurements
        XCTAssertNil(WeightedRegionEstimator().estimate(Array(samples.prefix(1))))
        let stationary = samples.map { m -> SignalMeasurement in var value=m; value.location=samples.first!.location; return value }
        XCTAssertNil(WeightedRegionEstimator().estimate(stationary))
    }
    func testPoorGPSAndMixedDomainsCannotEstimate() throws {
        let samples=try DemoData.load().measurements
        let poor=samples.map { m -> SignalMeasurement in var value=m; value.location?.horizontalAccuracy=200; return value }
        XCTAssertNil(WeightedRegionEstimator().estimate(poor))
        var mixed=samples; mixed[0].receiverID="other"
        XCTAssertNil(WeightedRegionEstimator().estimate(mixed))
    }
    func testEstimatorProducesUncertainRegion() throws {
        let result=WeightedRegionEstimator().estimate(try DemoData.load().measurements)
        XCTAssertNotNil(result)
        XCTAssertGreaterThanOrEqual(result!.radiusMeters,20)
        XCTAssertEqual(result?.label,"Estimated source region")
    }
    func testSmoothingAndRouteGeometry() {
        XCTAssertEqual(SignalMath.smooth([-80,Double.nan,-60],alpha:0.5),[-80,-70])
        let a=LocationFix(latitude:0,longitude:179.999,horizontalAccuracy:5),b=LocationFix(latitude:0,longitude:-179.999,horizontalAccuracy:5)
        XCTAssertEqual(Geo.distance(a,b),222.39,accuracy:1)
        XCTAssertEqual(Geo.bearing(LocationFix(latitude:40,longitude:-75,horizontalAccuracy:5),LocationFix(latitude:41,longitude:-75,horizontalAccuracy:5)),0,accuracy:0.1)
    }
    func testInvalidImportIsRejected() throws {
        var session=try DemoData.load(); session.measurements[0].location?.latitude=95
        XCTAssertThrowsError(try SessionCodec.decode(JSONCoding.encoder().encode(session)))
    }
    func testExternalPacketRetainsRelativePowerUnit() throws {
        let raw=Data(#"{"version":1,"kind":"measurement","timestamp":"2026-09-29T12:00:00Z","receiverId":"sdr-1","powerDb":-61.4,"powerUnit":"dbfs","signalIdentifier":"owned-test"}"#.utf8)
        let packet=try ReceiverPacket.decode(raw)
        XCTAssertEqual(packet.measurement?.powerUnit,.dbfs)
        XCTAssertEqual(packet.measurement?.provenance,.measured)
    }
    func testAtomicStoreAndOutboxSurviveRestart() async throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:directory) }
        let store=LocalStore(directory:directory); var state=StoreState(); let session=try DemoData.load()
        state.sessions=[session]; state.outbox=[session.id]; state.revision=2
        try await store.save(state)
        var old=StoreState(); old.revision=1; try await store.save(old)
        let restored=try await LocalStore(directory:directory).load()
        XCTAssertEqual(restored.sessions.first?.id,session.id)
        XCTAssertEqual(restored.outbox,[session.id])
    }
    func testCSVPreservesTimestampsAndNeutralizesFormulas() throws {
        var s=try DemoData.load(); s.measurements[0].signalIdentifier="=BAD()"
        let text=SessionExport.csv(s)
        XCTAssertTrue(text.contains("'=BAD()"))
        XCTAssertTrue(text.contains(JSONCoding.dateString(s.measurements[0].timestamp)))
    }
    func testRouteRestartsAfterGapAndDoesNotBridgeDistance() {
        let a=RoutePoint(fix:LocationFix(latitude:44,longitude:-71,horizontalAccuracy:5),timestamp:Date(timeIntervalSince1970:1000))
        let b=RoutePoint(fix:LocationFix(latitude:44.001,longitude:-71,horizontalAccuracy:5),timestamp:Date(timeIntervalSince1970:1060))
        let accepted=RouteRecording.next(b,after:a)
        XCTAssertEqual(accepted?.segmentStart,true)
        XCTAssertEqual(Geo.routeDistance([a,accepted!]),0)
        XCTAssertEqual(RouteRecording.segments([a,accepted!]).count,2)
    }
    func testFlatPowerCannotProduceCompassBearing() throws {
        let flat=try DemoData.load().measurements.map {m -> SignalMeasurement in var value=m;value.rssiDbm = -70;return value}
        XCTAssertNotNil(WeightedRegionEstimator().estimate(flat))
        XCTAssertNil(WeightedRegionEstimator().estimate(flat)?.bearingDegrees)
    }
    func testInterruptedSessionClosesAtLastPersistedObservation() throws {
        var s=try DemoData.load();s.endedAt=nil
        let recovered=SessionRecovery.closeInterrupted(s)
        XCTAssertNotNil(recovered.endedAt)
        XCTAssertTrue(recovered.notes.contains("interrupted"))
        XCTAssertEqual(SessionRecovery.closeInterrupted(recovered).notes,recovered.notes)
    }
    func testMixedSessionKeepsSimulationDisclosure() throws {
        var s=try DemoData.load();s.measurements[0].provenance = .measured
        XCTAssertTrue(s.isSimulated)
    }
}
