import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(ROOT_DIR, "docs"));
const DEFAULT_MODEL = process.env.HERMES_MODEL || "gemma2:2b";
const UPSTREAM_URL = trimTrailingSlash(process.env.HERMES_UPSTREAM_URL || "http://ollama:11434");
const UPSTREAM_MODE = String(process.env.HERMES_UPSTREAM_MODE || "ollama").toLowerCase();
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024);
const DEFAULT_NUM_CTX = Number(process.env.HERMES_NUM_CTX || 128);
const DEFAULT_NUM_THREAD = Number(process.env.HERMES_NUM_THREAD || 2);
const DEFAULT_NUM_PREDICT = Number(process.env.HERMES_NUM_PREDICT || 16);
const UPSTREAM_TIMEOUT_MS = Number(process.env.HERMES_UPSTREAM_TIMEOUT_MS || 4500);
const HEALTH_TIMEOUT_MS = Number(process.env.HERMES_HEALTH_TIMEOUT_MS || 5000);
const ALLOWED_ORIGINS = parseOrigins(
  process.env.CORS_ORIGINS ||
    "https://anyclaw.store,https://*.anyclaw.store,https://*.trycloudflare.com,https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*"
);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

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
    if (pattern.includes("*")) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(origin);
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

function sendFile(req, res, filePath) {
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=60"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, pathname) {
  let decodedPath = "/";
  try {
    decodedPath = decodeURIComponent(pathname || "/");
  } catch {
    sendJson(res, 400, { error: "Path tidak valid." });
    return true;
  }

  const routePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const candidate = path.resolve(STATIC_DIR, `.${routePath}`);
  if (!candidate.startsWith(`${STATIC_DIR}${path.sep}`) && candidate !== STATIC_DIR) {
    sendJson(res, 403, { error: "Path tidak diizinkan." });
    return true;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(req, res, candidate);
    return true;
  }

  const fallback = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
    sendFile(req, res, fallback);
    return true;
  }

  sendJson(res, 404, { error: "Static app tidak ditemukan." });
  return true;
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
    keep_alive: payload.keep_alive || "30m",
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

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Upstream model tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function proxyJson(req, res, pathname) {
  const payload = normalizeChatPayload(await readJsonBody(req));
  const target = `${UPSTREAM_URL}${upstreamPath(pathname)}`;
  const upstream = await fetchWithTimeout(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.HERMES_UPSTREAM_KEY ? { Authorization: `Bearer ${process.env.HERMES_UPSTREAM_KEY}` } : {})
    },
    body: JSON.stringify(payload)
  }, UPSTREAM_TIMEOUT_MS);
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
    if (req.method === "GET" && ["/health", "/api/version"].includes(url.pathname)) {
      const [upstreamHealth, upstreamTags] = await Promise.all([
        fetchWithTimeout(`${UPSTREAM_URL}/api/version`, {}, HEALTH_TIMEOUT_MS).catch(() => null),
        fetchWithTimeout(`${UPSTREAM_URL}/api/tags`, {}, HEALTH_TIMEOUT_MS).catch(() => null)
      ]);
      const upstreamJson = upstreamHealth?.ok ? await upstreamHealth.json().catch(() => null) : null;
      const tagsJson = upstreamTags?.ok ? await upstreamTags.json().catch(() => null) : null;
      const modelLoaded = Array.isArray(tagsJson?.models)
        ? tagsJson.models.some((model) => model.name === DEFAULT_MODEL || model.model === DEFAULT_MODEL)
        : false;
      const ok = Boolean(upstreamHealth?.ok && modelLoaded);
      sendJson(res, ok ? 200 : 503, {
        ok,
        name: "Passeo model server",
        model: DEFAULT_MODEL,
        modelLoaded,
        upstream: UPSTREAM_URL,
        upstreamVersion: upstreamJson?.version || null,
        detail: ok
          ? null
          : upstreamHealth?.ok
            ? `Model ${DEFAULT_MODEL} belum tersedia di upstream model runtime.`
            : "Ollama upstream belum tersambung."
      });
      return;
    }

    if (req.method === "POST" && ["/api/chat", "/v1/chat/completions"].includes(url.pathname)) {
      await proxyJson(req, res, url.pathname);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 404, { error: "Route tidak ditemukan." });
  } catch (error) {
    const status = error.status || 502;
    sendJson(res, status, {
      error: "Gemma model server gagal memproses request.",
      detail: error.message
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Passeo model server listening on :${PORT}`);
});
