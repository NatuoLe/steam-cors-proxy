/**
 * Steam CORS Proxy - Deno Deploy
 * 公开访问，无需认证
 */

const ALLOWED_ORIGINS = [
  "https://claudwang.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "null", // 本地直接打开 HTML 文件时
];

const ALLOWED_HOSTS = [
  "steamcommunity.com",
  "api.steampowered.com",
  "store.steampowered.com",
];

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin === "";
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";

  // OPTIONS 预检
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // 只允许 GET
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  let target = url.searchParams.get("target");

  // 支持 b64target 参数（base64 编码的 target URL，避免双重编码问题）
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
    return new Response(JSON.stringify({ error: "Missing target parameter. Use ?target=URL or ?b64target=base64(URL)" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // target 由 url.searchParams.get() 自动 decode 一次，正常情况已是原始 URL
  // 无需手动 decode

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid target URL", received: target.substring(0, 100) }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 只允许代理 Steam 域名
  if (!ALLOWED_HOSTS.some((h) => targetUrl.hostname.endsWith(h))) {
    return new Response(JSON.stringify({ error: "Target host not allowed" }), {
      status: 403,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const steamResp = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Referer": "https://steamcommunity.com/",
        "Origin": "https://steamcommunity.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    const body = await steamResp.text();
    const contentType = steamResp.headers.get("content-type") ?? "application/json";

    return new Response(body, {
      status: steamResp.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": contentType,
        "X-Steam-Status": String(steamResp.status),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Upstream request failed", detail: String(err) }),
      {
        status: 502,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      }
    );
  }
});
