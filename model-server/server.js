import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const DEFAULT_MODEL = process.env.HERMES_MODEL || "nous-hermes:7b";
const UPSTREAM_URL = trimTrailingSlash(process.env.HERMES_UPSTREAM_URL || "http://ollama:11434");
const UPSTREAM_MODE = String(process.env.HERMES_UPSTREAM_MODE || "ollama").toLowerCase();
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024);
const DEFAULT_NUM_CTX = Number(process.env.HERMES_NUM_CTX || 512);
const DEFAULT_NUM_THREAD = Number(process.env.HERMES_NUM_THREAD || 2);
const DEFAULT_NUM_PREDICT = Number(process.env.HERMES_NUM_PREDICT || 256);
const ALLOWED_ORIGINS = parseOrigins(
  process.env.CORS_ORIGINS ||
    "https://anyclaw.store,https://*.anyclaw.store,https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*"
);

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function originAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith(":*")) {
      return origin.startsWith(pattern.slice(0, -1));
    }
    return origin === pattern;
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0] || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Payload terlalu besar.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function normalizeChatPayload(payload) {
  return {
    ...payload,
    model: payload.model || DEFAULT_MODEL,
    stream: false,
    options: {
      num_ctx: DEFAULT_NUM_CTX,
      num_predict: DEFAULT_NUM_PREDICT,
      num_thread: DEFAULT_NUM_THREAD,
      ...(payload.options || {})
    }
  };
}

function upstreamPath(pathname) {
  if (pathname.endsWith("/health") || pathname.endsWith("/api/version")) return "/api/version";
  if (pathname.includes("/v1/chat/completions")) return "/v1/chat/completions";
  return UPSTREAM_MODE === "openai" ? "/v1/chat/completions" : "/api/chat";
}

async function proxyJson(req, res, pathname) {
  const payload = normalizeChatPayload(await readJsonBody(req));
  const target = `${UPSTREAM_URL}${upstreamPath(pathname)}`;
  const upstream = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.HERMES_UPSTREAM_KEY ? { Authorization: `Bearer ${process.env.HERMES_UPSTREAM_KEY}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const body = await upstream.text();
  const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
  res.writeHead(upstream.status, { "Content-Type": contentType });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (!originAllowed(req.headers.origin)) {
    sendJson(res, 403, { error: "Origin tidak diizinkan." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && ["/", "/health", "/api/version"].includes(url.pathname)) {
      const upstreamHealth = await fetch(`${UPSTREAM_URL}/api/version`).catch(() => null);
      const upstreamJson = upstreamHealth?.ok ? await upstreamHealth.json().catch(() => null) : null;
      sendJson(res, upstreamHealth?.ok ? 200 : 503, {
        ok: Boolean(upstreamHealth?.ok),
        name: "Passeo model server",
        model: DEFAULT_MODEL,
        upstream: UPSTREAM_URL,
        upstreamVersion: upstreamJson?.version || null
      });
      return;
    }

    if (req.method === "POST" && ["/api/chat", "/v1/chat/completions"].includes(url.pathname)) {
      await proxyJson(req, res, url.pathname);
      return;
    }

    sendJson(res, 404, { error: "Route tidak ditemukan." });
  } catch (error) {
    const status = error.status || 502;
    sendJson(res, status, {
      error: "Hermes model server gagal memproses request.",
      detail: error.message
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Passeo model server listening on :${PORT}`);
});
