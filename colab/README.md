# Passeo Hermes 7B on Google Colab

Notebook ini menjalankan `nous-hermes:7b` di Google Colab, lalu membuka endpoint HTTPS publik lewat Cloudflare Tunnel.

Link Colab setelah file ini dipush ke GitHub:

```text
https://colab.research.google.com/github/izrai4103-lgtm/ai-agent-chat/blob/main/colab/passeo-hermes-7b-colab.ipynb
```

Alur:

1. Buka notebook di Colab.
2. Runtime > Change runtime type > pilih GPU jika tersedia.
3. Run all.
4. Tunggu `ollama pull nous-hermes:7b` selesai.
5. Copy URL `https://...trycloudflare.com`.
6. Paste URL itu ke `Set > Server model endpoint` di Passeo-ai-Agent.

Catatan: Colab free akan tidur/putus jika idle, jadi URL tunnel bisa berubah setiap runtime baru.
