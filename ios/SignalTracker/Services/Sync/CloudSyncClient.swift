import Foundation
import SignalTrackerCore

struct CloudSyncClient {
    struct Summary: Decodable { let id: UUID }
    struct Page: Decodable { let sessions: [Summary]; let nextBefore: String? }
    let base: URL
    let token: String
    init(url: String, token: String) throws {
        guard let url = URL(string: url), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else { throw DataError.invalid("Configure a valid HTTPS API URL") }
        base = url; self.token = token
    }
    func upload(_ session: SignalSession) async throws {
        _ = try await send(path: "v1/sessions/" + session.id.uuidString.lowercased(), method: "PUT", body: SessionCodec.encode(session))
    }
    func deleteAll() async throws { _ = try await send(path: "v1/sessions", method: "DELETE") }
    func list(before: String?) async throws -> Page {
        let data = try await send(path: "v1/sessions", method: "GET", before: before, limit: 128_000)
        let page = try JSONCoding.decoder().decode(Page.self, from: data)
        guard page.sessions.count <= 50, page.nextBefore.map({ $0.count <= 150 }) ?? true else { throw DataError.invalid("Invalid cloud listing") }
        return page
    }
    func download(_ id: UUID) async throws -> SignalSession {
        let data = try await send(path: "v1/sessions/" + id.uuidString.lowercased(), method: "GET")
        let session = try SessionCodec.decode(data)
        guard session.id == id else { throw DataError.invalid("Cloud session ID does not match its URL") }
        return session
    }
    private func send(path: String, method: String, body: Data? = nil, before: String? = nil, limit: Int = 2_000_000) async throws -> Data {
        guard var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { throw DataError.invalid("Invalid API URL") }
        if let before { components.queryItems = [URLQueryItem(name: "before", value: before)] }
        guard let url = components.url else { throw DataError.invalid("Invalid API URL") }
        var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 15
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for attempt in 0..<3 {
            try Task.checkCancellation()
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw DataError.invalid("Invalid cloud response") }
            if http.statusCode == 429 && attempt < 2 {
                let seconds = Double(http.value(forHTTPHeaderField: "Retry-After") ?? "60") ?? 60
                try await Task.sleep(for: .seconds(max(1, min(60, seconds))))
                continue
            }
            guard (200..<300).contains(http.statusCode) else { throw DataError.invalid("Sync failed. Your recording stays local; retry after checking sign-in and connectivity.") }
            var data = Data()
            for try await byte in bytes { try Task.checkCancellation(); guard data.count < limit else { throw DataError.invalid("Cloud response exceeds its size limit") }; data.append(byte) }
            return data
        }
        throw DataError.invalid("Synchronization exceeded the retry limit")
    }
}
