import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface AuthConfig {
  OIDC_ISSUER: string;
  OIDC_AUDIENCE: string;
  OIDC_JWKS_URL: string;
}
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function keySet(url: URL) {
  let keys = keySets.get(url.href);
  if (!keys) {
    if (keySets.size >= 4) keySets.clear();
    keys = createRemoteJWKSet(url, { timeoutDuration: 5000 });
    keySets.set(url.href, keys);
  }
  return keys;
}
export async function authenticate(
  request: Request,
  config: AuthConfig,
  key?: JWTVerifyGetKey,
): Promise<string> {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 16000) throw Error("Unauthorized");
  const jwksURL = new URL(config.OIDC_JWKS_URL);
  if (jwksURL.protocol !== "https:" || jwksURL.hostname.endsWith(".invalid"))
    throw Error("Authentication not configured");
  const { payload } = await jwtVerify(token, key ?? keySet(jwksURL), {
    issuer: config.OIDC_ISSUER,
    audience: config.OIDC_AUDIENCE,
    algorithms: ["RS256", "ES256"],
    requiredClaims: ["exp", "iat", "sub"],
    clockTolerance: 5,
  });
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 500
  )
    throw Error("Unauthorized");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${payload.iss}\u0000${payload.sub}`),
  );
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
