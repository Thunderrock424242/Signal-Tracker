import { authenticate } from "./auth";
import { handleAPI } from "./api";
import { D1SessionRepository } from "./repository";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleAPI(request, {
      authenticate: (r) => authenticate(r, env),
      repository: new D1SessionRepository(env.DB),
      limit: async (owner) =>
        (await env.SYNC_RATE.limit({ key: owner })).success,
      enabled: String(env.SYNC_ENABLED) === "true",
      origins: env.ALLOWED_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  },
} satisfies ExportedHandler<Env>;
