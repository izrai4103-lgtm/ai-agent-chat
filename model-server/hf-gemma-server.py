#!/usr/bin/env python3
"""No-key local Gemma 2 2B chat server using Hugging Face Transformers.

The server exposes OpenAI-compatible /v1/chat/completions and Ollama-like
/api/chat endpoints so the static GitHub Pages frontend can call a local or
tunneled model server without putting any API key in the browser.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


PORT = int(os.environ.get("PORT", "8080"))
MODEL_PATH = os.environ.get("GEMMA_MODEL_PATH", "google/gemma-2-2b-it")
MODEL_NAME = os.environ.get("GEMMA_MODEL_NAME", "gemma2:2b")
LOCAL_FILES_ONLY = os.environ.get("GEMMA_LOCAL_FILES_ONLY", "1").lower() not in {"0", "false", "no"}
MAX_INPUT_CHARS = int(os.environ.get("GEMMA_MAX_INPUT_CHARS", "12000"))
DEFAULT_MAX_NEW_TOKENS = int(os.environ.get("GEMMA_MAX_NEW_TOKENS", "256"))
DEFAULT_TEMPERATURE = float(os.environ.get("GEMMA_TEMPERATURE", "0.7"))
DEFAULT_TOP_P = float(os.environ.get("GEMMA_TOP_P", "0.9"))
ALLOWED_ORIGINS = [
    item.strip()
    for item in os.environ.get(
        "CORS_ORIGINS",
        "https://anyclaw.store,https://*.anyclaw.store,https://*.trycloudflare.com,"
        "https://izrai4103-lgtm.github.io,https://*.github.io,http://localhost:*,http://127.0.0.1:*",
    ).split(",")
    if item.strip()
]

_tokenizer = None
_model = None
_torch = None
_load_error = None
_load_lock = threading.Lock()
_generate_lock = threading.Lock()


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True
    for pattern in ALLOWED_ORIGINS:
        if pattern == "*":
            return True
        if pattern.endswith(":*") and origin.startswith(pattern[:-1]):
            return True
        if "*" in pattern:
            prefix, _, suffix = pattern.partition("*")
            if origin.startswith(prefix) and origin.endswith(suffix):
                return True
        if origin == pattern:
            return True
    return False


def load_model() -> tuple[Any, Any, Any]:
    global _tokenizer, _model, _torch, _load_error
    if _tokenizer is not None and _model is not None and _torch is not None:
        return _tokenizer, _model, _torch
    with _load_lock:
        if _tokenizer is not None and _model is not None and _torch is not None:
            return _tokenizer, _model, _torch
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            device = os.environ.get("GEMMA_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
            dtype_name = os.environ.get("GEMMA_DTYPE") or ("float16" if device == "cuda" else "float32")
            dtype = getattr(torch, dtype_name)
            tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=LOCAL_FILES_ONLY)
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_PATH,
                local_files_only=LOCAL_FILES_ONLY,
                torch_dtype=dtype,
                low_cpu_mem_usage=True,
            )
            model.to(device)
            model.eval()
            _tokenizer = tokenizer
            _model = model
            _torch = torch
            _load_error = None
            return tokenizer, model, torch
        except Exception as error:  # pragma: no cover - reported through HTTP
            _load_error = str(error)
            raise


def normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    system_parts: list[str] = []
    normalized: list[dict[str, str]] = []
    for message in messages:
        role = str(message.get("role") or "user")
        content = str(message.get("content") or "")
        if role == "system":
            system_parts.append(content)
        elif role in {"user", "assistant"}:
            normalized.append({"role": role, "content": content})
    if system_parts:
        system_text = "Instruksi sistem:\n" + "\n\n".join(system_parts).strip()
        if normalized and normalized[0]["role"] == "user":
            normalized[0]["content"] = f"{system_text}\n\n{normalized[0]['content']}"
        else:
            normalized.insert(0, {"role": "user", "content": system_text})
    return normalized[-12:]


def render_prompt(tokenizer: Any, messages: list[dict[str, str]]) -> str:
    try:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    except Exception:
        chunks: list[str] = []
        for message in messages:
            role = "User" if message["role"] == "user" else "Assistant"
            chunks.append(f"{role}: {message['content']}")
        chunks.append("Assistant:")
        return "\n\n".join(chunks)


def generate_reply(payload: dict[str, Any]) -> str:
    tokenizer, model, torch = load_model()
    messages = normalize_messages(payload.get("messages") or [])
    if not messages:
        raise ValueError("messages kosong.")
    prompt = render_prompt(tokenizer, messages)
    if len(prompt) > MAX_INPUT_CHARS:
        prompt = prompt[-MAX_INPUT_CHARS:]

    max_new_tokens = int(payload.get("max_tokens") or DEFAULT_MAX_NEW_TOKENS)
    max_new_tokens = max(1, min(max_new_tokens, int(os.environ.get("GEMMA_MAX_OUTPUT_HARD_LIMIT", "1024"))))
    temperature = float(payload.get("temperature") or DEFAULT_TEMPERATURE)
    top_p = float(payload.get("top_p") or DEFAULT_TOP_P)

    inputs = tokenizer(prompt, return_tensors="pt")
    device = next(model.parameters()).device
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with _generate_lock, torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            temperature=max(temperature, 0.01),
            top_p=top_p,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = output[0][inputs["input_ids"].shape[-1] :]
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


class Handler(BaseHTTPRequestHandler):
    server_version = "PasseoGemmaHF/1.0"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        super().end_headers()

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"/health", "/api/version"}:
            self.send_json(
                200,
                {
                    "ok": True,
                    "name": "Passeo Gemma Hugging Face local server",
                    "model": MODEL_NAME,
                    "modelPath": MODEL_PATH,
                    "loaded": _model is not None,
                    "localFilesOnly": LOCAL_FILES_ONLY,
                    "loadError": _load_error,
                },
            )
            return
        self.send_json(404, {"error": "Route tidak ditemukan."})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in {"/v1/chat/completions", "/api/chat"}:
            self.send_json(404, {"error": "Route tidak ditemukan."})
            return
        if not origin_allowed(self.headers.get("Origin")):
            self.send_json(403, {"error": "Origin tidak diizinkan."})
            return
        try:
            payload = self.read_json()
            content = generate_reply(payload)
            if path == "/api/chat":
                self.send_json(
                    200,
                    {
                        "model": MODEL_NAME,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "message": {"role": "assistant", "content": content},
                        "done": True,
                    },
                )
                return
            self.send_json(
                200,
                {
                    "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": MODEL_NAME,
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": content},
                            "finish_reason": "stop",
                        }
                    ],
                },
            )
        except Exception as error:
            self.send_json(503, {"error": "Gemma Hugging Face server gagal.", "detail": str(error)})


def main() -> None:
    if os.environ.get("GEMMA_LOAD_ON_START", "0").lower() in {"1", "true", "yes"}:
        load_model()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Passeo Gemma Hugging Face local server listening on :{PORT}", flush=True)
    print(f"Model path: {MODEL_PATH} (local_files_only={LOCAL_FILES_ONLY})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
