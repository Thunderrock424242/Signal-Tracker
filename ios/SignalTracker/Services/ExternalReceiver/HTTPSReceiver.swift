import Foundation
import Combine
import SignalTrackerCore

@MainActor
final class HTTPSReceiver: ObservableObject, SignalReceiver {
    let id: String
    let name: String
    let endpoint: URL
    let capabilities = ["Normalized power", "Spectrum if provided"]
    @Published private(set) var isConnected = false
    @Published private(set) var status = "Disconnected"
    @Published private(set) var latencyMilliseconds: Double?
    @Published private(set) var latest: Date?
    @Published private(set) var sampleRate: Double = 0
    @Published private(set) var batteryPercent: Double?
    let measurements: AsyncStream<SignalMeasurement>
    let spectrum: AsyncStream<SpectrumFrame>
    private let values: AsyncStream<SignalMeasurement>.Continuation
    private let frames: AsyncStream<SpectrumFrame>.Continuation
    private var poll: Task<Void, Never>?
    private let token: String
    private var seen = Set<UUID>()
    private var received = 0
    private var connectedAt = Date()

    init(id: String, name: String, endpoint: URL, token: String) throws {
        guard endpoint.scheme == "https", endpoint.host != nil, endpoint.user == nil, endpoint.password == nil, token.count >= 32 else {
            throw DataError.invalid("Use a trusted HTTPS receiver URL and a token of at least 32 characters.")
        }
        self.id = id; self.name = name; self.endpoint = endpoint; self.token = token
        var valuesContinuation: AsyncStream<SignalMeasurement>.Continuation!
        measurements = AsyncStream(bufferingPolicy: .bufferingNewest(256)) { valuesContinuation = $0 }
        values = valuesContinuation
        var framesContinuation: AsyncStream<SpectrumFrame>.Continuation!
        spectrum = AsyncStream(bufferingPolicy: .bufferingNewest(16)) { framesContinuation = $0 }
        frames = framesContinuation
    }

    func start() {
        guard poll == nil else { return }
        connectedAt = Date(); received = 0
        poll = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    let sent = Date()
                    // The bridge holds separate latest packets; polling both prevents spectrum starvation.
                    let measurement = try await self.fetch(kind: "measurement")
                    let frame = try await self.fetch(kind: "spectrum")
                    try Task.checkCancellation()
                    self.latencyMilliseconds = Date().timeIntervalSince(sent) * 1000
                    self.isConnected = true
                    self.status = measurement == nil && frame == nil ? "Connected · waiting for fresh data" : "Connected"
                    for packet in [measurement, frame].compactMap({ $0 }) {
                        guard let packetID = packet.id, !self.seen.contains(packetID) else { continue }
                        self.seen.insert(packetID)
                        if self.seen.count > 2048 { self.seen = [packetID] }
                        if let value = packet.measurement { self.values.yield(value) }
                        if let value = packet.frame { self.frames.yield(value) }
                        self.received += 1; self.latest = packet.timestamp
                        self.batteryPercent = packet.batteryPercent
                        self.sampleRate = Double(self.received) / max(1, Date().timeIntervalSince(self.connectedAt))
                    }
                } catch {
                    if Task.isCancelled { return }
                    self.isConnected = false; self.status = error.localizedDescription
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    private func fetch(kind: String) async throws -> ReceiverPacket? {
        guard var components = URLComponents(url: endpoint.appendingPathComponent("v1/latest"), resolvingAgainstBaseURL: false) else { throw DataError.invalid("Invalid receiver URL") }
        components.queryItems = [URLQueryItem(name: "kind", value: kind)]
        guard let url = components.url else { throw DataError.invalid("Invalid receiver URL") }
        var request = URLRequest(url: url); request.timeoutInterval = 5
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw DataError.invalid("Invalid receiver response") }
        if http.statusCode == 204 { return nil }
        guard http.statusCode == 200 else { throw DataError.invalid("Receiver rejected the connection") }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 128_000 else { throw DataError.invalid("Receiver response too large") }
            data.append(byte)
        }
        let packet = try ReceiverPacket.decode(data)
        guard packet.receiverId == id, packet.kind == kind else { throw DataError.invalid("Packet receiver ID or kind does not match this adapter") }
        guard abs(packet.timestamp.timeIntervalSinceNow) <= 30 else { throw DataError.invalid("Receiver data is stale; check its clock") }
        guard packet.id != nil else { throw DataError.invalid("Receiver polling requires stable packet IDs") }
        return packet
    }

    func stop() { poll?.cancel(); poll = nil; isConnected = false; status = "Disconnected" }
}
