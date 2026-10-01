import {
  SessionSchema,
  type SignalSession,
} from "../../packages/core/src/index";
import type { SessionRepository } from "./api";
export class D1SessionRepository implements SessionRepository {
  constructor(private db: D1Database) {}
  async list(owner: string, before?: string) {
    const [timestamp, id] = before?.split("|") ?? ["9999-12-31T23:59:59Z", ""];
    const r = await this.db
      .prepare(
        "SELECT id, name, started_at AS startedAt, updated_at AS updatedAt FROM sessions WHERE owner = ? AND (started_at < ? OR (started_at = ? AND id < ?)) ORDER BY started_at DESC, id DESC LIMIT 50",
      )
      .bind(owner, timestamp, timestamp, id ?? "")
      .all<{
        id: string;
        name: string;
        startedAt: string;
        updatedAt: string;
      }>();
    return r.results;
  }
  async get(owner: string, id: string): Promise<SignalSession | undefined> {
    const r = await this.db
      .prepare("SELECT payload FROM sessions WHERE owner = ? AND id = ?")
      .bind(owner, id)
      .first<{ payload: string }>();
    return r ? SessionSchema.parse(JSON.parse(r.payload)) : undefined;
  }
  async put(owner: string, s: SignalSession) {
    await this.db
      .prepare(
        "INSERT INTO sessions (owner,id,name,started_at,updated_at,payload) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,started_at=excluded.started_at,updated_at=excluded.updated_at,payload=excluded.payload",
      )
      .bind(
        owner,
        s.id,
        s.name,
        s.startedAt,
        new Date().toISOString(),
        JSON.stringify(s),
      )
      .run();
  }
  async delete(owner: string, id: string) {
    await this.db
      .prepare("DELETE FROM sessions WHERE owner = ? AND id = ?")
      .bind(owner, id)
      .run();
  }
  async deleteAll(owner: string) {
    await this.db
      .prepare("DELETE FROM sessions WHERE owner = ?")
      .bind(owner)
      .run();
  }
}
