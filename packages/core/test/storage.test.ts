import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { FieldRepository } from "../../../web/src/store";
import { createDemoSession } from "../src/index";
it("persists real session payloads and erases local sessions and outbox together", async () => {
  const db = new FieldRepository("test-" + crypto.randomUUID());
  const s = createDemoSession();
  await db.put(s);
  await db.writeMeta("outbox", JSON.stringify([s.id]));
  const again = new FieldRepository(db.name);
  expect((await again.list())[0]?.id).toBe(s.id);
  await db.delete(s.id);
  expect(await db.list()).toEqual([]);
  expect(await db.readMeta("outbox")).toBe("[]");
});
it("rejects invalid recordings before writing", async () => {
  const db = new FieldRepository("test-" + crypto.randomUUID());
  await expect(
    db.put({ ...createDemoSession(), schemaVersion: 99 } as never),
  ).rejects.toThrow();
  expect(await db.list()).toEqual([]);
});
it("commits edited session and pending status atomically, rolling back a damaged outbox", async () => {
  const db = new FieldRepository("atomic-" + crypto.randomUUID()),
    session = createDemoSession();
  await db.putPending(session);
  expect(await db.readMeta("outbox")).toBe(JSON.stringify([session.id]));
  await db.writeMeta("outbox", "damaged");
  const edited = { ...session, notes: "new edit" };
  await expect(db.putPending(edited)).rejects.toThrow();
  expect((await db.list())[0]!.notes).toBe(session.notes);
  expect(await db.readMeta("outbox")).toBe("damaged");
});
