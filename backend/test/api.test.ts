import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { authenticate } from "../src/auth";
import {
  handleAPI,
  type SessionRepository,
  type ApiServices,
} from "../src/api";
import {
  createDemoSession,
  type SignalSession,
} from "../../packages/core/src/index";
class MemoryRepository implements SessionRepository {
  records = new Map<string, SignalSession>();
  async list(owner: string) {
    return [...this.records]
      .filter(([k]) => k.startsWith(owner + ":"))
      .map(([, s]) => ({
        id: s.id,
        name: s.name,
        startedAt: s.startedAt,
        updatedAt: s.startedAt,
      }));
  }
  async get(o: string, id: string) {
    return this.records.get(o + ":" + id);
  }
  async put(o: string, s: SignalSession) {
    this.records.set(o + ":" + s.id, s);
  }
  async delete(o: string, id: string) {
    this.records.delete(o + ":" + id);
  }
  async deleteAll(o: string) {
    for (const k of this.records.keys())
      if (k.startsWith(o + ":")) this.records.delete(k);
  }
}
const services = (): ApiServices => ({
  repository: new MemoryRepository(),
  authenticate: async (r) => {
    const t = r.headers.get("Authorization");
    if (!t) throw Error();
    return t;
  },
  limit: async () => true,
  enabled: true,
  origins: ["https://example.com"],
});
const request = (
  path: string,
  method = "GET",
  owner?: string,
  body?: unknown,
) =>
  new Request("https://api.example.com" + path, {
    method,
    headers: {
      ...(owner ? { Authorization: owner } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
describe("session API", () => {
  it("requires authentication", async () => {
    expect((await handleAPI(request("/v1/sessions"), services())).status).toBe(
      401,
    );
  });
  it("does not expose recordings to another owner", async () => {
    const sv = services(),
      s = createDemoSession();
    await handleAPI(request("/v1/sessions/" + s.id, "PUT", "owner-a", s), sv);
    expect(
      (await handleAPI(request("/v1/sessions/" + s.id, "GET", "owner-b"), sv))
        .status,
    ).toBe(404);
    expect(
      (await handleAPI(request("/v1/sessions/" + s.id, "GET", "owner-a"), sv))
        .status,
    ).toBe(200);
  });
  it("deletes only the authenticated owners history", async () => {
    const sv = services(),
      s = createDemoSession();
    await sv.repository.put("a", s);
    await sv.repository.put("b", s);
    await handleAPI(request("/v1/sessions", "DELETE", "a"), sv);
    expect(await sv.repository.get("a", s.id)).toBeUndefined();
    expect(await sv.repository.get("b", s.id)).toBeDefined();
  });
  it("rejects a foreign origin before touching data", async () => {
    const r = request("/v1/sessions", "GET", "a");
    r.headers.set("Origin", "https://evil.example");
    expect((await handleAPI(r, services())).status).toBe(403);
  });
  it("returns rate limits", async () => {
    const sv = services();
    sv.limit = async () => false;
    expect(
      (await handleAPI(request("/v1/sessions", "GET", "a"), sv)).status,
    ).toBe(429);
  });
  it("rejects malformed data", async () => {
    const s = createDemoSession();
    expect(
      (
        await handleAPI(
          request("/v1/sessions/" + s.id, "PUT", "a", {
            ...s,
            schemaVersion: 9,
          }),
          services(),
        )
      ).status,
    ).toBe(400);
  });
  it("accepts Foundation uppercase UUIDs through a lowercase URL", async () => {
    const sv = services(),
      s = createDemoSession();
    s.id = "A8AB8D62-E0A9-4BAC-891F-002233445566";
    expect(
      (
        await handleAPI(
          request("/v1/sessions/" + s.id.toLowerCase(), "PUT", "a", s),
          sv,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleAPI(request("/v1/sessions/" + s.id, "GET", "a"), sv)).status,
    ).toBe(200);
  });
  it("rejects an oversized streamed body", async () => {
    const s = createDemoSession(),
      r = new Request("https://api.example.com/v1/sessions/" + s.id, {
        method: "PUT",
        headers: { Authorization: "a", "Content-Type": "application/json" },
        body: " ".repeat(2_000_001),
      });
    expect((await handleAPI(r, services())).status).toBe(413);
  });
  it("remains disabled without deployment configuration", async () => {
    const sv = services();
    sv.enabled = false;
    expect(
      (await handleAPI(request("/v1/sessions", "GET", "a"), sv)).status,
    ).toBe(503);
  });
});
describe("JWT security", () => {
  it("verifies signature, audience and issuer and hashes owner identity", async () => {
    const keys = await generateKeyPair("ES256");
    const jwk = await exportJWK(keys.publicKey),
      getKey = createLocalJWKSet({
        keys: [{ ...jwk, kid: "test", alg: "ES256" }],
      });
    const config = {
      OIDC_ISSUER: "https://issuer.example",
      OIDC_AUDIENCE: "signal-tracker",
      OIDC_JWKS_URL: "https://issuer.example/jwks",
    };
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject("owner")
      .setIssuer(config.OIDC_ISSUER)
      .setAudience(config.OIDC_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
    const r = new Request("https://api.example", {
      headers: { Authorization: "Bearer " + token },
    });
    expect(await authenticate(r, config, getKey)).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      authenticate(r, { ...config, OIDC_AUDIENCE: "wrong" }, getKey),
    ).rejects.toThrow();
  });
  it("rejects unsigned/malformed tokens", async () => {
    await expect(
      authenticate(
        new Request("https://api.example", {
          headers: { Authorization: "Bearer fake" },
        }),
        {
          OIDC_ISSUER: "https://issuer.example",
          OIDC_AUDIENCE: "a",
          OIDC_JWKS_URL: "https://issuer.example/jwks",
        },
      ),
    ).rejects.toThrow();
  });
});
