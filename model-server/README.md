# Passeo Hermes 7B Model Server

Server ini untuk bagian model AI. GitHub Pages tetap dipakai sebagai UI, sedangkan server ini dipasang di VPS/RunPod/Fly/Render atau host lain yang bisa menjalankan container.

## Deploy

```bash
docker compose up -d --build
docker compose exec ollama ollama pull nous-hermes:7b
```

Pasang domain HTTPS ke port `8080`, lalu isi endpoint di app:

```text
https://domain-server-model-kamu.com
```

Endpoint yang tersedia:

```text
GET  /health
POST /api/chat
POST /v1/chat/completions
```

GitHub Pages tidak menjalankan model. Pages hanya memanggil endpoint HTTPS server ini.

## Local Gemma 2 2B proxy

Untuk app HTTPS dari Anyclaw/GitHub yang memanggil Ollama di device ini, jalankan proxy lokal ini supaya preflight Private Network Access dari Chrome lolos:

```bash
OLLAMA_ORIGINS="https://anyclaw.store,https://*.github.io,http://localhost:*" ollama serve
HERMES_MODEL=gemma2:2b HERMES_UPSTREAM_URL=http://127.0.0.1:11434 PORT=8080 npm start
```

Lalu pakai endpoint:

```text
http://127.0.0.1:8080
```
