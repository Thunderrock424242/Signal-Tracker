export interface QueueStorage {
  read(): Promise<string>;
  write(value: string): Promise<void>;
}
/** Serializes mutations; acknowledgement becomes durable before another upload starts. */
export class SyncQueue {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private storage: QueueStorage) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }
  private async load(): Promise<string[]> {
    const parsed: unknown = JSON.parse(await this.storage.read());
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string"))
      throw Error("Outbox is damaged; restore a backup.");
    return [...new Set(parsed as string[])];
  }
  enqueue(id: string): Promise<void> {
    return this.serial(async () => {
      const ids = await this.load();
      if (!ids.includes(id))
        await this.storage.write(JSON.stringify([...ids, id]));
    });
  }
  remove(id: string): Promise<void> {
    return this.serial(async () => {
      await this.storage.write(
        JSON.stringify((await this.load()).filter((v) => v !== id)),
      );
    });
  }
  pending(): Promise<string[]> {
    return this.serial(() => this.load());
  }
  flush(send: (id: string) => Promise<void>): Promise<void> {
    return this.serial(async () => {
      const ids = await this.load();
      for (const id of [...ids]) {
        try {
          await send(id);
        } catch {
          return;
        }
        ids.splice(ids.indexOf(id), 1);
        await this.storage.write(JSON.stringify(ids));
      }
    });
  }
}
