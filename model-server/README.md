# Passeo Gemma 2 2B Model Server

Server ini untuk bagian model AI. GitHub Pages tetap dipakai sebagai UI, sedangkan server ini dipasang di VPS/RunPod/Fly/Render atau host lain yang bisa menjalankan container.

## Deploy

```bash
docker compose up -d --build
docker compose exec ollama ollama pull gemma2:2b
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

## GitHub Pages + Gemma 2 2B no-key model server

Frontend resmi dipakai dari GitHub Pages. Model tetap berjalan di model server ini dan dibuka lewat endpoint HTTPS publik/tunnel.

Jalankan proxy lokal dengan model yang sudah terunduh di Ollama:

```bash
OLLAMA_ORIGINS="https://*.github.io,http://localhost:*" ollama serve
HERMES_MODEL=gemma2:2b HERMES_UPSTREAM_URL=http://127.0.0.1:11434 PORT=8080 npm start
```

Lalu pakai endpoint:

```text
http://127.0.0.1:8080
```

Endpoint chat no-key:

```text
http://127.0.0.1:8080/api/chat
```

Default proxy disetel untuk respons cepat: `HERMES_NUM_CTX=128`, `HERMES_NUM_PREDICT=16`, dan `HERMES_UPSTREAM_TIMEOUT_MS=4500`. Jika butuh jawaban lebih panjang, naikkan env tersebut, tetapi respons bisa melewati 5 detik di CPU.

## Hugging Face Transformers lokal

Jika Gemma 2 2B sudah ada di cache Hugging Face atau folder lokal, server ini juga bisa dijalankan langsung dengan Transformers tanpa API key/browser token:

```bash
python3 -m pip install -r requirements-hf.txt
GEMMA_MODEL_PATH=google/gemma-2-2b-it npm run hf:gemma
```

Default `GEMMA_LOCAL_FILES_ONLY=1`, jadi server hanya memakai file lokal yang sudah ada. Untuk folder manual:

```bash
GEMMA_MODEL_PATH=/path/ke/gemma-2-2b-it npm run hf:gemma
```

Status:

```bash
npm run status:hf-gemma
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

Jika app dibuka dari GitHub Pages di HP dan server model berjalan di mesin lain, jangan pakai `localhost` di app. Buat endpoint HTTPS publik:

```bash
cd model-server
npm run tunnel:cloudflare
```

Copy URL `https://...trycloudflare.com` ke endpoint app di **Set > Koneksi**.

Untuk menjaga tunnel tetap hidup:

```bash
cd model-server
nohup npm run watch:tunnel > /tmp/passeo-cloudflare-watchdog.log 2>&1 &
```

Catatan: quick tunnel gratis dari Cloudflare tidak menjamin URL permanen jika proses tunnel mati dan dibuat ulang. Untuk URL benar-benar permanen, pakai named tunnel Cloudflare dengan domain akun sendiri.
