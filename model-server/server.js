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
const FAST_UPSTREAM_URL = trimTrailingSlash(process.env.HERMES_FAST_UPSTREAM_URL || process.env.FAST_UPSTREAM_URL || "");
const FAST_UPSTREAM_MODE = String(process.env.HERMES_FAST_UPSTREAM_MODE || process.env.FAST_UPSTREAM_MODE || "openai").toLowerCase();
const FAST_UPSTREAM_MODEL = process.env.HERMES_FAST_MODEL || process.env.FAST_MODEL || "llama-3.1-8b-instant";
const FAST_UPSTREAM_KEY = process.env.HERMES_FAST_UPSTREAM_KEY || process.env.FAST_UPSTREAM_KEY || "";
const FAST_UPSTREAM_TIMEOUT_MS = Number(process.env.HERMES_FAST_UPSTREAM_TIMEOUT_MS || process.env.FAST_UPSTREAM_TIMEOUT_MS || 4800);
const FAST_UPSTREAM_PRIMARY = parseBoolean(process.env.HERMES_FAST_PRIMARY ?? process.env.FAST_PRIMARY ?? "1");
const ALLOWED_ORIGINS = parseOrigins(
  process.env.CORS_ORIGINS ||
    "https://anyclaw.store,https://*.anyclaw.store,https://*.trycloudflare.com,https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*"
);
const RETRYABLE_MODEL_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
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

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function isFastUpstreamConfigured() {
  return Boolean(FAST_UPSTREAM_URL && FAST_UPSTREAM_MODEL);
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
  res.setHeader("Access-Control-Expose-Headers", "X-Passeo-Model-Route");
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

function normalizeOpenAiPayload(payload, modelName) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const maxTokens = Number(payload.max_tokens || payload.max_completion_tokens || payload.options?.num_predict || DEFAULT_NUM_PREDICT);
  const temperature = Number(payload.temperature ?? payload.options?.temperature ?? 0.25);
  const topP = Number(payload.top_p ?? payload.options?.top_p ?? 0.8);
  const normalized = {
    model: modelName || payload.model || DEFAULT_MODEL,
    messages: messages
      .map((message) => ({
        role: ["system", "user", "assistant", "tool"].includes(message?.role) ? message.role : "user",
        content: String(message?.content || "")
      }))
      .filter((message) => message.content.trim()),
    temperature: Number.isFinite(temperature) ? Math.max(0, Math.min(temperature, 2)) : 0.25,
    max_tokens: Number.isFinite(maxTokens) ? Math.max(1, Math.min(maxTokens, 768)) : DEFAULT_NUM_PREDICT,
    stream: false
  };
  if (Number.isFinite(topP)) normalized.top_p = Math.max(0.01, Math.min(topP, 1));
  return normalized;
}

function normalizePayloadForMode(payload, mode, modelName) {
  return mode === "openai" ? normalizeOpenAiPayload(payload, modelName) : normalizeChatPayload({ ...payload, model: modelName || payload.model });
}

function openAiChatPath(baseUrl) {
  try {
    const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
    if (/(^|\/)v1$/i.test(pathname)) return "/chat/completions";
  } catch {
    return "/v1/chat/completions";
  }
  return "/v1/chat/completions";
}

function chatEndpoint(baseUrl, mode) {
  if (/\/(api\/chat|v1\/chat\/completions|chat\/completions)$/i.test(baseUrl)) return baseUrl;
  return `${baseUrl}${mode === "openai" ? openAiChatPath(baseUrl) : "/api/chat"}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS, label = "Upstream model") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`${label} tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function makeAuthHeaders(key) {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function readResponseDetail(response) {
  const text = await response.text().catch(() => "");
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

function makeHttpError(message, status = 502, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

async function fetchModelRoute(route, rawPayload) {
  const payload = normalizePayloadForMode(rawPayload, route.mode, route.model);
  const response = await fetchWithTimeout(route.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...makeAuthHeaders(route.key)
    },
    body: JSON.stringify(payload)
  }, route.timeoutMs, route.label);
  return response;
}

function writeModelResponse(res, response, routeName) {
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
  res.writeHead(response.status, {
    "Content-Type": contentType,
    "X-Passeo-Model-Route": routeName
  });
}

async function forwardModelResponse(res, response, routeName) {
  writeModelResponse(res, response, routeName);
  const body = await response.text();
  res.end(body);
}

function modelRoutes() {
  const localRoute = {
    name: "local",
    label: "Gemma lokal",
    url: chatEndpoint(UPSTREAM_URL, UPSTREAM_MODE),
    mode: UPSTREAM_MODE,
    model: DEFAULT_MODEL,
    key: process.env.HERMES_UPSTREAM_KEY || "",
    timeoutMs: UPSTREAM_TIMEOUT_MS
  };
  if (!isFastUpstreamConfigured()) return [localRoute];
  const fastRoute = {
    name: "fast",
    label: "Fast model endpoint",
    url: chatEndpoint(FAST_UPSTREAM_URL, FAST_UPSTREAM_MODE),
    mode: FAST_UPSTREAM_MODE,
    model: FAST_UPSTREAM_MODEL,
    key: FAST_UPSTREAM_KEY,
    timeoutMs: FAST_UPSTREAM_TIMEOUT_MS
  };
  return FAST_UPSTREAM_PRIMARY ? [fastRoute, localRoute] : [localRoute, fastRoute];
}

async function proxyJson(req, res) {
  const rawPayload = await readJsonBody(req);
  const routes = modelRoutes();
  const failures = [];

  for (const route of routes) {
    try {
      const response = await fetchModelRoute(route, rawPayload);
      if (response.ok || !RETRYABLE_MODEL_STATUSES.has(response.status) || route === routes.at(-1)) {
        await forwardModelResponse(res, response, route.name);
        return;
      }
      failures.push(`${route.label} HTTP ${response.status}: ${await readResponseDetail(response)}`);
    } catch (error) {
      failures.push(`${route.label}: ${error.message}`);
      if (route === routes.at(-1)) {
        throw makeHttpError(
          isFastUpstreamConfigured()
            ? "Semua endpoint model gagal memberi jawaban asli."
            : "Gemma lokal tidak sanggup memberi jawaban asli dalam batas waktu dan fast endpoint belum disetel.",
          error.status || 502,
          failures
        );
      }
    }
  }

  throw makeHttpError("Tidak ada endpoint model yang berhasil.", 502, failures);
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
      const shouldCheckOllama = UPSTREAM_MODE !== "openai";
      const [upstreamHealth, upstreamTags] = shouldCheckOllama
        ? await Promise.all([
            fetchWithTimeout(`${UPSTREAM_URL}/api/version`, {}, HEALTH_TIMEOUT_MS, "Ollama health").catch(() => null),
            fetchWithTimeout(`${UPSTREAM_URL}/api/tags`, {}, HEALTH_TIMEOUT_MS, "Ollama tags").catch(() => null)
          ])
        : [null, null];
      const upstreamJson = upstreamHealth?.ok ? await upstreamHealth.json().catch(() => null) : null;
      const tagsJson = upstreamTags?.ok ? await upstreamTags.json().catch(() => null) : null;
      const modelLoaded = Array.isArray(tagsJson?.models)
        ? tagsJson.models.some((model) => model.name === DEFAULT_MODEL || model.model === DEFAULT_MODEL)
        : false;
      const localOk = Boolean(upstreamHealth?.ok && modelLoaded);
      const fastConfigured = isFastUpstreamConfigured();
      const ok = Boolean(localOk || fastConfigured);
      sendJson(res, ok ? 200 : 503, {
        ok,
        name: "Passeo model server",
        model: DEFAULT_MODEL,
        modelLoaded,
        upstream: UPSTREAM_URL,
        upstreamMode: UPSTREAM_MODE,
        upstreamVersion: upstreamJson?.version || null,
        fastConfigured,
        fastPrimary: fastConfigured ? FAST_UPSTREAM_PRIMARY : false,
        fastModel: fastConfigured ? FAST_UPSTREAM_MODEL : null,
        fastUpstream: fastConfigured ? FAST_UPSTREAM_URL : null,
        fastMode: fastConfigured ? FAST_UPSTREAM_MODE : null,
        detail: ok
          ? null
          : upstreamHealth?.ok
            ? `Model ${DEFAULT_MODEL} belum tersedia di upstream model runtime.`
            : "Ollama upstream belum tersambung dan fast endpoint belum disetel."
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
    const payload = {
      error: "Gemma model server gagal memproses request.",
      detail: error.message
    };
    if (error.details) payload.details = error.details;
    sendJson(res, status, payload);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Passeo model server listening on :${PORT}`);
});
