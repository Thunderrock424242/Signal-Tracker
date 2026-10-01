import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { D1SessionRepository } from "../src/repository";
import { createDemoSession } from "../../packages/core/src/index";
it("paginates tied timestamps without losing sessions and scopes real D1 reads/deletes", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-30",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = await runtime.getD1Database("DB");
    const migration = await readFile(
      new URL("../migrations/0001_sessions.sql", import.meta.url),
      "utf8",
    );
    await db.batch(
      migration
        .split(";")
        .filter((sql) => sql.trim())
        .map((sql) => db.prepare(sql)),
    );
    const repository = new D1SessionRepository(db);
    const s = createDemoSession();
    s.spectrum = [];
    s.measurements = [];
    s.route = [];
    s.estimatedRegions = [];
    for (let i = 1; i <= 55; i++)
      await repository.put("owner-a", {
        ...s,
        id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
      });
    await repository.put("owner-b", s);
    const first = await repository.list("owner-a");
    expect(first).toHaveLength(50);
    const last = first.at(-1)!;
    const second = await repository.list(
      "owner-a",
      last.startedAt + "|" + last.id,
    );
    expect(second).toHaveLength(5);
    expect(new Set([...first, ...second].map((v) => v.id)).size).toBe(55);
    await repository.deleteAll("owner-a");
    expect(await repository.list("owner-a")).toHaveLength(0);
    expect(await repository.get("owner-b", s.id)).toBeDefined();
  } finally {
    await runtime.dispose();
  }
});
