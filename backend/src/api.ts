import { z } from "zod";
import {
  parseSessionJSON,
  type SignalSession,
} from "../../packages/core/src/index";
export interface SessionRepository {
  list(
    owner: string,
    before?: string,
  ): Promise<
    { id: string; name: string; startedAt: string; updatedAt: string }[]
  >;
  get(owner: string, id: string): Promise<SignalSession | undefined>;
  put(owner: string, session: SignalSession): Promise<void>;
  delete(owner: string, id: string): Promise<void>;
  deleteAll(owner: string): Promise<void>;
}
export interface ApiServices {
  authenticate(request: Request): Promise<string>;
  repository: SessionRepository;
  limit(owner: string): Promise<boolean>;
  enabled: boolean;
  origins: string[];
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function boundedText(request: Request): Promise<string> {
  if (Number(request.headers.get("Content-Length")) > 2_000_000)
    throw Error("too-large");
  const reader = request.body?.getReader();
  if (!reader) throw Error("invalid");
  const decoder = new TextDecoder(),
    parts: string[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > 2_000_000) throw Error("too-large");
      parts.push(decoder.decode(result.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    await reader.cancel();
  }
}
export async function handleAPI(
  request: Request,
  services: ApiServices,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !services.origins.includes(origin))
    return json({ error: "Origin not allowed" }, 403);
  const cors = (r: Response) => {
    if (origin) {
      r.headers.set("Access-Control-Allow-Origin", origin);
      r.headers.set("Vary", "Origin");
    }
    return r;
  };
  if (request.method === "OPTIONS")
    return cors(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "600",
        },
      }),
    );
  const url = new URL(request.url);
  if (url.pathname === "/health")
    return cors(
      json({ service: "Signal Tracker", syncConfigured: services.enabled }),
    );
  if (!services.enabled)
    return cors(
      json(
        {
          error:
            "Cloud sync is not configured. Local recordings remain available.",
        },
        503,
      ),
    );
  let owner: string;
  try {
    owner = await services.authenticate(request);
  } catch {
    return cors(json({ error: "Authentication required" }, 401));
  }
  try {
    if (!(await services.limit(owner))) {
      const response = json({ error: "Too many requests. Retry later." }, 429);
      response.headers.set("Retry-After", "60");
      return cors(response);
    }
    if (url.pathname === "/v1/sessions") {
      if (request.method === "GET") {
        const before = url.searchParams.get("before") ?? undefined;
        if (before) {
          const parts = before.split("|");
          if (
            parts.length !== 2 ||
            !z.string().datetime({ offset: true }).safeParse(parts[0])
              .success ||
            !z.uuid().safeParse(parts[1]).success
          )
            return cors(json({ error: "Invalid cursor" }, 400));
        }
        const sessions = await services.repository.list(owner, before);
        const last = sessions.at(-1);
        return cors(
          json({
            sessions,
            nextBefore:
              sessions.length === 50 && last
                ? last.startedAt + "|" + last.id
                : null,
          }),
        );
      }
      if (request.method === "DELETE") {
        await services.repository.deleteAll(owner);
        return cors(new Response(null, { status: 204 }));
      }
    }
    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)$/),
      id = match?.[1]?.toLowerCase();
    if (!id || !z.uuid().safeParse(id).success)
      return cors(json({ error: "Not found" }, 404));
    if (request.method === "GET") {
      const s = await services.repository.get(owner, id);
      return cors(s ? json(s) : json({ error: "Not found" }, 404));
    }
    if (request.method === "DELETE") {
      await services.repository.delete(owner, id);
      return cors(new Response(null, { status: 204 }));
    }
    if (request.method === "PUT") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        return cors(json({ error: "Use application/json" }, 415));
      let session: SignalSession;
      try {
        session = parseSessionJSON(await boundedText(request));
      } catch (e) {
        return cors(
          json(
            {
              error:
                e instanceof Error && e.message === "too-large"
                  ? "Recording exceeds 2 MB"
                  : "Invalid version-1 session",
            },
            e instanceof Error && e.message === "too-large" ? 413 : 400,
          ),
        );
      }
      if (session.id !== id)
        return cors(json({ error: "Session ID does not match the URL" }, 400));
      await services.repository.put(owner, session);
      return cors(json({ id: session.id, saved: true }));
    }
    return cors(json({ error: "Method not allowed" }, 405));
  } catch {
    console.error(
      JSON.stringify({
        event: "sync_failure",
        path: url.pathname,
        method: request.method,
      }),
    );
    return cors(
      json(
        {
          error:
            "Unable to complete synchronization. Your local recording is unchanged.",
        },
        500,
      ),
    );
  }
}
