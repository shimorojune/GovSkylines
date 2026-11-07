/**
 * Client for the GovSkylines bridge mod running inside Cities: Skylines II
 * (forked from CS2MCP.Bridge, see ../bridge). The bridge serves JSON over HTTP
 * on 127.0.0.1 and requires POST for routes that change game state.
 */

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export interface BridgeOptions {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
}

/** Must match IsMutatingPath in bridge/HttpBridgeServer.cs. */
export function isMutatingPath(route: string): boolean {
  return (
    route.startsWith("/build/") ||
    route.startsWith("/sim/") ||
    route.endsWith("/set") ||
    ["/game/save", "/city/tiles/buy", "/transit/stops/place", "/transit/lines/create", "/transit/lines/delete"].includes(
      route,
    )
  );
}

export class Bridge {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(opts: BridgeOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.CS2_BRIDGE_URL ?? "http://127.0.0.1:8642").replace(/\/+$/, "");
    this.token = (opts.token ?? process.env.CS2MCP_TOKEN ?? "").trim();
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  /** Calls a bridge route. `query` values are stringified; undefined values are dropped. */
  async call<T = unknown>(
    route: string,
    query: Record<string, string | number | boolean | undefined> = {},
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
    // The bridge decodes %20, not "+".
    const qs = params.toString().replace(/\+/g, "%20");
    const url = `${this.baseUrl}${route}${qs ? `?${qs}` : ""}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: isMutatingPath(route) ? "POST" : "GET",
        headers: this.token ? { "X-CS2MCP-Token": this.token } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new BridgeError(
        `Cannot reach the game bridge at ${this.baseUrl} (${(err as Error).message}). ` +
          "Make sure Cities: Skylines II is running with the GovSkylines bridge mod enabled.",
      );
    }

    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const msg = (payload as { error?: unknown })?.error;
      if (res.status === 409) throw new BridgeError(`No city is loaded (${msg ?? "HTTP 409"}).`, 409);
      throw new BridgeError(String(msg ?? `bridge returned HTTP ${res.status}`), res.status);
    }
    return payload as T;
  }
}
