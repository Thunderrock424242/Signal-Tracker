import {
  SessionSchema,
  type SignalSession,
} from "../../packages/core/src/index";
export class FieldRepository {
  private database?: Promise<IDBDatabase>;
  constructor(public name = "signal-tracker-v1") {}
  private open(): Promise<IDBDatabase> {
    return (this.database ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("sessions", { keyPath: "id" });
        r.result.createObjectStore("meta");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        reject(
          Error("Close other Signal Tracker tabs to update local storage."),
        );
    }));
  }
  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: IDBRequest<T>;
      try {
        result = work(tx);
      } catch (e) {
        tx.abort();
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = () => reject(tx.error ?? Error("Local storage failed"));
      tx.onabort = () =>
        reject(tx.error ?? Error("Local storage was interrupted"));
    });
  }
  async list(): Promise<SignalSession[]> {
    const raw: unknown[] = await this.transaction(
      ["sessions"],
      "readonly",
      (tx) => tx.objectStore("sessions").getAll(),
    );
    return raw
      .map((s) => SessionSchema.parse(s))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async put(s: SignalSession): Promise<void> {
    const valid = SessionSchema.parse(s);
    await this.transaction(["sessions"], "readwrite", (tx) =>
      tx.objectStore("sessions").put(valid),
    );
  }
  async putPending(s: SignalSession): Promise<void> {
    const valid = SessionSchema.parse(s);
    await this.transaction(["sessions", "meta"], "readwrite", (tx) => {
      const meta = tx.objectStore("meta"),
        read = meta.get("outbox");
      read.onsuccess = () => {
        try {
          const pending: unknown = JSON.parse(read.result ?? "[]");
          if (
            !Array.isArray(pending) ||
            !pending.every((id) => typeof id === "string")
          )
            throw Error("Damaged outbox");
          meta.put(
            JSON.stringify([...new Set([...pending, valid.id])]),
            "outbox",
          );
        } catch {
          tx.abort();
        }
      };
      return tx.objectStore("sessions").put(valid);
    });
  }
  async delete(id: string): Promise<void> {
    await this.transaction(["sessions", "meta"], "readwrite", (tx) => {
      const meta = tx.objectStore("meta"),
        read = meta.get("outbox");
      read.onsuccess = () => {
        const raw: unknown = JSON.parse(read.result ?? "[]");
        if (Array.isArray(raw))
          meta.put(JSON.stringify(raw.filter((v) => v !== id)), "outbox");
      };
      return tx.objectStore("sessions").delete(id);
    });
  }
  async clearHistory(): Promise<void> {
    await this.transaction(["sessions", "meta"], "readwrite", (tx) => {
      const meta = tx.objectStore("meta");
      meta.put("[]", "outbox");
      meta.put("[]", "beacons");
      meta.put("[]", "bookmarks");
      meta.put("[]", "public-layer");
      return tx.objectStore("sessions").clear();
    });
  }
  async writeMeta(key: string, value: string): Promise<void> {
    await this.transaction(["meta"], "readwrite", (tx) =>
      tx.objectStore("meta").put(value, key),
    );
  }
  async readMeta(key: string): Promise<string | undefined> {
    return this.transaction(["meta"], "readonly", (tx) =>
      tx.objectStore("meta").get(key),
    );
  }
}
