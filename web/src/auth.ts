export interface CloudConfig {
  enabled: boolean;
  apiURL: string;
  issuer: string;
  clientID: string;
  audience: string;
}
interface PendingAuth {
  state: string;
  verifier: string;
  redirect: string;
  issuer: string;
  clientID: string;
  expiresAt: number;
  tokenEndpoint: string;
}
export const defaultCloud: CloudConfig = {
  enabled: false,
  apiURL: "",
  issuer: "",
  clientID: "",
  audience: "signal-tracker",
};
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export function httpsURL(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Use an HTTPS URL without embedded credentials.");
  return url;
}
async function boundedJSON(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) throw Error("Sign-in provider rejected the request.");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty provider response");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const p = await reader.read();
      if (p.done) break;
      length += p.value.length;
      if (length > 64000) throw Error("Provider response too large");
      chunks.push(p.value);
    }
    const bytes = new Uint8Array(length);
    let i = 0;
    for (const c of chunks) {
      bytes.set(c, i);
      i += c.length;
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("Invalid provider response");
    return data as Record<string, unknown>;
  } finally {
    await reader.cancel();
  }
}
export class BrowserAuth {
  private token?: string;
  private expiresAt = 0;
  get signedIn() {
    return !!this.token && Date.now() < this.expiresAt;
  }
  accessToken(): string {
    if (!this.signedIn)
      throw Error("Sign in to synchronize. Local use needs no account.");
    return this.token!;
  }
  signOut() {
    this.token = undefined;
    this.expiresAt = 0;
    sessionStorage.removeItem("signal-tracker-auth");
  }
  async login(config: CloudConfig): Promise<void> {
    if (!config.clientID) throw Error("Enter your public OIDC client ID.");
    const issuer = httpsURL(config.issuer),
      discoveryURL = new URL(
        issuer.href.replace(/\/$/, "") + "/.well-known/openid-configuration",
      );
    const doc = await boundedJSON(
      await fetch(discoveryURL, { signal: AbortSignal.timeout(10000) }),
    );
    if (
      doc.issuer !== config.issuer ||
      typeof doc.authorization_endpoint !== "string" ||
      typeof doc.token_endpoint !== "string"
    )
      throw Error("Invalid OIDC discovery document.");
    const endpoint = httpsURL(doc.authorization_endpoint),
      tokenEndpoint = httpsURL(doc.token_endpoint);
    const verifier = random(),
      state = random(),
      challenge = base64url(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      );
    const redirect = location.origin + location.pathname;
    const pending: PendingAuth = {
      state,
      verifier,
      redirect,
      issuer: config.issuer,
      clientID: config.clientID,
      tokenEndpoint: tokenEndpoint.href,
      expiresAt: Date.now() + 600000,
    };
    sessionStorage.setItem("signal-tracker-auth", JSON.stringify(pending));
    const params = {
      client_id: config.clientID,
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      audience: config.audience,
    };
    for (const [k, v] of Object.entries(params))
      endpoint.searchParams.set(k, v);
    location.assign(endpoint.href);
  }
  async finishCallback(config: CloudConfig): Promise<boolean> {
    const query = new URLSearchParams(location.search);
    if (!query.has("code") && !query.has("error")) return false;
    const raw = sessionStorage.getItem("signal-tracker-auth");
    sessionStorage.removeItem("signal-tracker-auth");
    history.replaceState(null, "", location.pathname + "#/settings");
    if (query.has("error")) throw Error("Sign in was declined or cancelled.");
    const p: PendingAuth | undefined = raw ? JSON.parse(raw) : undefined;
    if (
      !p ||
      p.expiresAt < Date.now() ||
      p.state !== query.get("state") ||
      p.issuer !== config.issuer ||
      p.clientID !== config.clientID ||
      p.redirect !== location.origin + location.pathname
    )
      throw Error("Invalid or expired sign-in callback.");
    const tokens = await boundedJSON(
      await fetch(httpsURL(p.tokenEndpoint), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: p.clientID,
          redirect_uri: p.redirect,
          code: query.get("code")!,
          code_verifier: p.verifier,
        }),
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (
      typeof tokens.access_token !== "string" ||
      tokens.access_token.length > 16000 ||
      typeof tokens.expires_in !== "number" ||
      tokens.expires_in <= 0
    )
      throw Error("Provider did not issue a usable API access token.");
    this.token = tokens.access_token;
    this.expiresAt = Date.now() + tokens.expires_in * 1000;
    return true;
  }
}
