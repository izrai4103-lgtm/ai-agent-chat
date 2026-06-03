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
GET  /
GET  /health
POST /api/chat
POST /v1/chat/completions
```

`GET /` menyajikan UI chat dari folder `docs/`, jadi tunnel Cloudflare bisa dipakai langsung sebagai app dan API satu-origin.

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

## Local watchdog

Pakai ini agar Ollama dan proxy lokal otomatis dinyalakan lagi kalau prosesnya mati:

```bash
cd model-server
nohup npm run watch:gemma > /tmp/passeo-local-watchdog.log 2>&1 &
```

Cek status:

```bash
cd model-server
npm run status:gemma
```

Jika app dibuka dari Anyclaw/GitHub di HP dan server model berjalan di mesin lain, jangan pakai `localhost` di app. Buat endpoint HTTPS publik:

```bash
cd model-server
npm run tunnel:cloudflare
```

Copy URL `https://...trycloudflare.com` ke endpoint app, atau update `PUBLIC_GEMMA_ENDPOINT` di `index.html`.

Untuk menjaga tunnel tetap hidup:

```bash
cd model-server
nohup npm run watch:tunnel > /tmp/passeo-cloudflare-watchdog.log 2>&1 &
```

Catatan: quick tunnel gratis dari Cloudflare tidak menjamin URL permanen jika proses tunnel mati dan dibuat ulang. Untuk URL benar-benar permanen, pakai named tunnel Cloudflare dengan domain akun sendiri.
