/**
 * Steam CORS Proxy for LenatuoJam
 * 专用于获取玩家游戏库数据，部署在 Deno Deploy
 */
const ALLOWED_ORIGINS = [
  "https://natuole.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "null",
  "http://134.175.64.88:8888",
];

const ALLOWED_HOSTS = [
  "steamcommunity.com",
  "api.steampowered.com",
  "store.steampowered.com",
];

const STEAM_API_KEY = "CD2B193068D2DAD3DB2120A8445CF19F";
const STEAM_ID = "76561198842540431";

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin === "";
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin",
  };
}

function isSteamApiUrl(url: URL): boolean {
  return url.hostname === "api.steampowered.com";
}

async function handleSteamApi(url: URL): Promise<Response> {
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "max-age=300",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Steam API fetch failed", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

async function handleSteamCommunity(target: string): Promise<Response> {
  try {
    const resp = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://steamcommunity.com/",
        "Origin": "https://steamcommunity.com",
      },
    });
    const body = await resp.text();
    const ct = resp.headers.get("content-type") ?? "text/html";
    return new Response(body, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": ct,
        "X-Steam-Status": String(resp.status),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Steam fetch failed", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  let target = url.searchParams.get("target");

  const b64target = url.searchParams.get("b64target");
  if (b64target) {
    try {
      target = decodeURIComponent(escape(atob(b64target)));
    } catch (_) {
      return new Response(JSON.stringify({ error: "Invalid b64target" }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  if (!target) {
    const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0002/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=1&include_played_free_games=1`;
    const apiResp = await handleSteamApi(new URL(gamesUrl));
    return new Response(await apiResp.text(), {
      status: apiResp.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "max-age=300",
      },
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid target URL" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!ALLOWED_HOSTS.some((h) => targetUrl.hostname.endsWith(h))) {
    return new Response(JSON.stringify({ error: "Host not allowed" }), {
      status: 403,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (isSteamApiUrl(targetUrl)) {
    return handleSteamApi(targetUrl);
  } else {
    return handleSteamCommunity(target);
  }
});
