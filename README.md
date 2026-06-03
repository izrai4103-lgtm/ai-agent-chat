# AI Agent Chat

Static GitHub Pages app for chatting with Passeo-ai-Agent through one no-key Puter.js model by default:

- Default endpoint: `puter://chat`
- Model: `qwen/qwen3.6-flash`
- API key: not required

The browser app stores chat history, settings, enabled skills, and Vector DB cache locally. Chat prompts are sent only to the model endpoint selected in Settings.

## Local preview

```bash
cd docs
python3 -m http.server 4175 --bind 127.0.0.1
```

Open `http://127.0.0.1:4175`.

The legacy `hermes-ollama-agent/` folder is kept as a standalone copy. GitHub Pages should use `docs/`.

## Optional Local Gemma

Use the already-downloaded Ollama model:

```bash
cd model-server
npm run local:gemma
```

Or run a local Hugging Face/Transformers copy if `google/gemma-2-2b-it` is already available in the Hugging Face cache or in `GEMMA_MODEL_PATH`:

```bash
cd model-server
python3 -m pip install -r requirements-hf.txt
npm run hf:gemma
```

For GitHub Pages from another device, expose port `8080` with a tunnel and paste the HTTPS endpoint in **Set > Koneksi**.

## GitHub Pages

This repo is ready for GitHub Pages branch deployment from the `docs/` folder.

```bash
gh auth login
git init
git add .
git commit -m "Initial AI Agent Chat"
gh repo create ai-agent-chat --public --source=. --remote=origin --push
```

In GitHub, enable Pages with **Build and deployment: Deploy from a branch**, then select branch `main` and folder `/docs`.

No model API key is committed. The default browser app is no-key through Puter.js. If you switch to a custom model server endpoint, the browser only calls that endpoint.

Chat UI uses a 5-second response budget and no longer fabricates local fallback answers. The default fast model is `qwen/qwen3.6-flash`. If you switch back to local Gemma 2 2B and CPU inference cannot finish in time, configure a legal fast endpoint in `model-server` with `HERMES_FAST_UPSTREAM_URL`, `HERMES_FAST_MODEL`, and optional server-side `HERMES_FAST_UPSTREAM_KEY`.

## TikTok LIVE Connector

```bash
npm install
npm run tiktok-live -- <username-yang-sedang-live>
```

Examples:

```bash
npm run tiktok-live -- officialgeilegisela
npm run tiktok-live -- @username --extended-gifts
TIKTOK_USERNAME=username npm run tiktok-live
```

The listener prints TikTok LIVE events such as chat, gifts, likes, follows, shares, members, viewer updates, and stream end.
