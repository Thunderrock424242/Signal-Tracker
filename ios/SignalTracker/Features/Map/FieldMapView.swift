import SwiftUI
import MapKit
import SignalTrackerCore

extension LocationFix {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

struct FieldMapView: View {
    @EnvironmentObject var field: FieldModel
    var body: some View {
        VStack(spacing: 0) {
            if let session = field.selected {
                HStack {
                    ProvenanceBadge(simulated: session.isSimulated)
                    Spacer()
                    Text("\(session.route.count) route points").font(.caption.monospaced())
                }.padding()
                if field.state.settings.coordinateOnlyMap || !field.connectivity.available {
                    CoordinateRouteView(session: session, opacity: field.state.settings.heatmapOpacity, measurements: field.selectedMeasurements)
                } else {
                    Map(initialPosition: .automatic) {
                        ForEach(Array(RouteRecording.segments(session.route).enumerated()), id: \.offset) { item in
                            if item.element.count > 1 {
                                MapPolyline(coordinates: item.element.map { $0.fix.coordinate }).stroke(.mint, lineWidth: 3)
                            }
                        }
                        ForEach(Array(field.selectedMeasurements.suffix(1000))) { m in
                            if let fix = m.location {
                                MapCircle(center: fix.coordinate, radius: max(4, min(20, fix.horizontalAccuracy)))
                                    .foregroundStyle(color(m.strength).opacity(field.state.settings.heatmapOpacity))
                            }
                        }
                        if let region = field.currentRegion {
                            MapCircle(center: region.center.coordinate, radius: region.radiusMeters)
                                .foregroundStyle(.orange.opacity(0.1))
                                .stroke(.orange, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                        }
                        if let start = session.route.first {
                            Annotation("Start", coordinate: start.fix.coordinate) { Image(systemName: "flag.fill").foregroundStyle(.mint) }
                        }
                        if let latest = session.route.last {
                            Annotation(session.isSimulated ? "Simulated position" : "Last recorded position", coordinate: latest.fix.coordinate) {
                                Image(systemName: "location.circle.fill").font(.title).foregroundStyle(.white)
                            }
                        }
                        ForEach(session.waypoints) { waypoint in
                            Annotation(waypoint.name, coordinate: CLLocationCoordinate2D(latitude: waypoint.latitude, longitude: waypoint.longitude)) {
                                Image(systemName: "mappin.circle.fill").foregroundStyle(.cyan)
                            }
                        }
                        if let point = session.lastServicePoint {
                            Annotation("Last connectivity observed here", coordinate: point.fix.coordinate) { Image(systemName: "network").foregroundStyle(.blue) }
                        }
                    }.mapStyle(.standard(elevation: .flat)).mapControls { MapCompass(); MapScaleView() }
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text("Heatmap opacity").font(.caption); Slider(value: $field.state.settings.heatmapOpacity, in: 0.1...0.9) }
                    Text("● Observed strength   ┄ Estimated area   ⚑ Start   ◆ Waypoint").font(.caption2)
                    Text("Showing one receiver, target, frequency and power unit. Last connectivity is an observation, not a guarantee of service.")
                        .font(.caption2).foregroundStyle(.secondary)
                }.padding().background(InstrumentTheme.panel)
            } else {
                EmptyField(title: "Your route starts here", detail: "Record a hunt or wilderness session, or load a labeled demo from Home.", icon: "map")
            }
        }.background(InstrumentTheme.background).navigationTitle("Field Map").navigationBarTitleDisplayMode(.inline)
    }
    private func color(_ power: Double?) -> Color {
        guard let power else { return .gray }
        return power > -60 ? .mint : power > -80 ? .yellow : .blue
    }
}

struct CoordinateRouteView: View {
    let session: SignalSession
    let opacity: Double
    var measurements: [SignalMeasurement]? = nil
    private var samples: [SignalMeasurement] {
        if let measurements { return Array(measurements.suffix(1000)) }
        guard let last = session.measurements.last else { return [] }
        return Array(session.measurements.filter {
            $0.receiverID == last.receiverID && $0.signalIdentifier == last.signalIdentifier && $0.frequencyHz == last.frequencyHz && $0.unit == last.unit && $0.provenance == last.provenance
        }.suffix(1000))
    }
    var body: some View {
        VStack {
            Canvas { context, size in
                let values = samples
                let region = WeightedRegionEstimator().estimate(values)
                let points = session.route.map(\.fix) + values.compactMap(\.location) + session.waypoints.map { LocationFix(latitude: $0.latitude, longitude: $0.longitude, horizontalAccuracy: $0.horizontalAccuracy) } + (session.lastServicePoint.map { [$0.fix] } ?? [])
                guard let origin = points.first else { return }
                let longitudeScale = 111320 * max(0.01, cos(origin.latitude * Double.pi / 180))
                func position(_ fix: LocationFix) -> CGPoint {
                    CGPoint(x: Geo.wrap(fix.longitude - origin.longitude) * longitudeScale, y: (fix.latitude - origin.latitude) * 111320)
                }
                let positions = points.map(position)
                var minX = positions.map(\.x).min() ?? 0, maxX = positions.map(\.x).max() ?? 1
                var minY = positions.map(\.y).min() ?? 0, maxY = positions.map(\.y).max() ?? 1
                if let region {
                    let point = position(region.center), radius = CGFloat(region.radiusMeters)
                    minX = min(minX, point.x - radius); maxX = max(maxX, point.x + radius)
                    minY = min(minY, point.y - radius); maxY = max(maxY, point.y + radius)
                }
                let scale = max(0.01, min((size.width - 60) / max(60, maxX - minX), (size.height - 60) / max(60, maxY - minY)))
                func project(_ fix: LocationFix) -> CGPoint {
                    let point = position(fix)
                    return CGPoint(x: size.width / 2 + (point.x - (minX + maxX) / 2) * scale, y: size.height / 2 - (point.y - (minY + maxY) / 2) * scale)
                }
                for x in stride(from: CGFloat(0), through: size.width, by: 32) {
                    var path = Path(); path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: size.height))
                    context.stroke(path, with: .color(.white.opacity(0.04)))
                }
                for y in stride(from: CGFloat(0), through: size.height, by: 32) {
                    var path = Path(); path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: size.width, y: y))
                    context.stroke(path, with: .color(.white.opacity(0.04)))
                }
                var path = Path()
                for (index, point) in session.route.enumerated() {
                    if index == 0 || point.segmentStart == true { path.move(to: project(point.fix)) } else { path.addLine(to: project(point.fix)) }
                }
                context.stroke(path, with: .color(.mint.opacity(0.8)), lineWidth: 2)
                for sample in values {
                    if let fix = sample.location {
                        let point = project(fix), radius = CGFloat(6)
                        context.fill(Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)), with: .color((sample.strength ?? -120) > -65 ? .mint.opacity(opacity) : .blue.opacity(opacity)))
                    }
                }
                if let region {
                    let point = project(region.center), radius = CGFloat(region.radiusMeters) * scale
                    let circle = Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
                    context.fill(circle, with: .color(.orange.opacity(0.08)))
                    context.stroke(circle, with: .color(.orange), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                }
                if let start = session.route.first {
                    let point = project(start.fix)
                    context.draw(Text("START").font(.caption.monospaced()).foregroundColor(.mint), at: CGPoint(x: point.x, y: point.y + 18))
                }
                if let latest = session.route.last {
                    let point = project(latest.fix)
                    context.fill(Path(ellipseIn: CGRect(x: point.x - 5, y: point.y - 5, width: 10, height: 10)), with: .color(.white))
                }
                for waypoint in session.waypoints {
                    let point = project(LocationFix(latitude: waypoint.latitude, longitude: waypoint.longitude, horizontalAccuracy: waypoint.horizontalAccuracy))
                    context.draw(Text("◆").foregroundColor(.cyan), at: point)
                }
                if let service = session.lastServicePoint {
                    context.draw(Text("LAST CONNECTIVITY").font(.caption2).foregroundColor(.blue), at: project(service.fix))
                }
            }.frame(minHeight: 320)
            Text("OFFLINE COORDINATE VIEW · NORTH UP").font(.caption2.monospaced()).foregroundStyle(.mint)
            Text("Route geometry is available. Downloadable terrain tiles need a licensed offline provider.").font(.caption).foregroundStyle(.secondary).padding()
        }
    }
}
