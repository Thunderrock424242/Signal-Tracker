import "fake-indexeddb/auto";
import { expect, it, vi, afterEach } from "vitest";
import { FieldRepository } from "../../../web/src/store";
import { BrowserAuth } from "../../../web/src/auth";
import { SyncClient } from "../../../web/src/sync";
import { createDemoSession } from "../src/index";
afterEach(() => vi.unstubAllGlobals());
it("does not start a cloud request from a hidden browser tab", async () => {
  const db = new FieldRepository("hidden-" + crypto.randomUUID());
  await db.put(createDemoSession());
  class TestAuth extends BrowserAuth {
    override accessToken() {
      return "test-token";
    }
  }
  const fetcher = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("document", {
    visibilityState: "hidden",
    addEventListener() {},
    removeEventListener() {},
  });
  const client = new SyncClient(db, new TestAuth());
  await expect(
    client.upload({
      enabled: true,
      apiURL: "https://api.example",
      issuer: "https://issuer.example",
      clientID: "test",
      audience: "test",
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("finishes an active upload before deleting cloud history", async () => {
  const db = new FieldRepository("sync-" + crypto.randomUUID());
  await db.put(createDemoSession());
  class TestAuth extends BrowserAuth {
    override accessToken() {
      return "test-token";
    }
  }
  const client = new SyncClient(db, new TestAuth()),
    config = {
      enabled: true,
      apiURL: "https://api.example",
      issuer: "https://issuer.example",
      clientID: "test",
      audience: "test",
    };
  const methods: string[] = [];
  let release!: () => void, started!: () => void;
  const began = new Promise<void>((resolve) => (started = resolve)),
    hold = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    methods.push(init.method!);
    if (init.method === "PUT") {
      started();
      await hold;
    }
    return new Response("{}", { status: 200 });
  });
  const upload = client.upload(config);
  await began;
  const remove = client.deleteAll(config);
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(methods).toEqual(["PUT"]);
  release();
  await Promise.all([upload, remove]);
  expect(methods).toEqual(["PUT", "DELETE"]);
});
it("waits on rate limiting and preserves local sessions with pending edits", async () => {
  const db = new FieldRepository("retry-" + crypto.randomUUID()),
    session = createDemoSession();
  session.notes = "Local edit";
  await db.put(session);
  class TestAuth extends BrowserAuth {
    override accessToken() {
      return "test-token";
    }
  }
  const waits: number[] = [],
    client = new SyncClient(db, new TestAuth(), async (ms) => {
      waits.push(ms);
    }),
    config = {
      enabled: true,
      apiURL: "https://api.example",
      issuer: "https://issuer.example",
      clientID: "test",
      audience: "test",
    };
  await client.queue.enqueue(session.id);
  let calls = 0;
  vi.stubGlobal("fetch", async () =>
    ++calls === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "60" } })
      : Response.json({ sessions: [{ id: session.id }], nextBefore: null }),
  );
  expect(await client.download(config)).toBe(0);
  expect(waits).toEqual([60000]);
  expect(calls).toBe(2);
  expect((await db.list())[0]!.notes).toBe("Local edit");
});
