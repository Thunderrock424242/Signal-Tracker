import {
  SessionSchema,
  SyncQueue,
  type SignalSession,
} from "../../packages/core/src/index";
import { FieldRepository } from "./store";
import { BrowserAuth, httpsURL, type CloudConfig } from "./auth";
import { boundedResponseText } from "./response";
export class SyncClient {
  readonly queue: SyncQueue;
  private operation: Promise<unknown> = Promise.resolve();
  private controller = new AbortController();
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = async () => {
      this.controller = new AbortController();
      const onHidden = () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        )
          this.controller.abort(
            Error(
              "Transfer paused when the tab left the foreground. Retry manually.",
            ),
          );
      };
      if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", onHidden);
      try {
        onHidden();
        this.controller.signal.throwIfAborted();
        return await work();
      } finally {
        if (typeof document !== "undefined")
          document.removeEventListener("visibilitychange", onHidden);
      }
    };
    const next = this.operation.then(run, run);
    this.operation = next.catch(() => {});
    return next;
  }
  private async backoff(ms: number) {
    const signal = this.controller.signal;
    signal.throwIfAborted();
    let cancel = () => {};
    const aborted = new Promise<void>((_resolve, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
    });
    try {
      await Promise.race([this.wait(ms), aborted]);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
  constructor(
    private repository: FieldRepository,
    private auth: BrowserAuth,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.queue = new SyncQueue({
      read: async () => (await repository.readMeta("outbox")) ?? "[]",
      write: (value) => repository.writeMeta("outbox", value),
    });
  }
  private async request(
    config: CloudConfig,
    path: string,
    method = "GET",
    body?: SignalSession,
  ): Promise<Response> {
    if (!config.enabled)
      throw Error("Enable optional cloud synchronization first.");
    const base = httpsURL(config.apiURL);
    for (let attempt = 0; attempt < 3; attempt++) {
      this.controller.signal.throwIfAborted();
      const r = await fetch(new URL(path, base.href.replace(/\/$/, "") + "/"), {
        method,
        headers: {
          Authorization: "Bearer " + this.auth.accessToken(),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (r.status === 429 && attempt < 2) {
        await r.body?.cancel();
        const seconds = Number(r.headers.get("Retry-After")) || 60;
        await this.backoff(Math.max(1, Math.min(60, seconds)) * 1000);
        continue;
      }
      if (!r.ok)
        throw Error(
          r.status === 401
            ? "Sign in again to synchronize."
            : "Sync could not finish. Local recordings remain available.",
        );
      return r;
    }
    throw Error("Synchronization exceeded the retry limit");
  }
  upload(config: CloudConfig): Promise<number> {
    return this.serial(async () => {
      const sessions = await this.repository.list();
      for (const s of sessions) await this.queue.enqueue(s.id);
      let count = 0,
        error: unknown;
      await this.queue.flush(async (id) => {
        const session = (await this.repository.list()).find((s) => s.id === id);
        if (!session) return;
        try {
          await this.request(config, "v1/sessions/" + id, "PUT", session);
          this.controller.signal.throwIfAborted();
          count++;
        } catch (e) {
          error = e;
          throw e;
        }
      });
      if (error) throw error;
      return count;
    });
  }
  saveNotes(session: SignalSession): Promise<void> {
    return this.serial(() => this.repository.putPending(session));
  }
  download(config: CloudConfig): Promise<number> {
    return this.serial(async () => {
      let count = 0,
        processed = 0,
        before: string | undefined;
      const seen = new Set<string>(),
        pending = new Set(await this.queue.pending());
      do {
        const response = await this.request(
          config,
          "v1/sessions" +
            (before ? "?before=" + encodeURIComponent(before) : ""),
        );
        const result = JSON.parse(
          await boundedResponseText(response, 128_000),
        ) as { sessions: { id: string }[]; nextBefore: string | null };
        if (
          !Array.isArray(result.sessions) ||
          result.sessions.length > 50 ||
          (result.nextBefore !== null && typeof result.nextBefore !== "string")
        )
          throw Error("Invalid session listing");
        for (const summary of result.sessions) {
          if (!/^[a-f0-9-]{36}$/i.test(summary.id))
            throw Error("Invalid session identifier");
          if (++processed > 1000)
            throw Error(
              "Download limit reached; export or delete old cloud history first.",
            );
          if (pending.has(summary.id.toLowerCase())) continue;
          const data = await this.request(config, "v1/sessions/" + summary.id);
          const session = SessionSchema.parse(
            JSON.parse(await boundedResponseText(data)),
          );
          if (session.id !== summary.id.toLowerCase())
            throw Error("Cloud session ID does not match listing");
          await this.repository.put(session);
          count++;
        }
        before = result.nextBefore ?? undefined;
        if (before) {
          if (before.length > 150 || seen.has(before))
            throw Error("Invalid or repeated pagination cursor");
          seen.add(before);
        }
      } while (before);
      return count;
    });
  }
  deleteAll(config: CloudConfig): Promise<void> {
    return this.serial(async () => {
      await this.request(config, "v1/sessions", "DELETE");
    });
  }
}
