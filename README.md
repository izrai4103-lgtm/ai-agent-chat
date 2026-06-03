# AI Agent Chat

Static GitHub Pages app for chatting with Passeo-ai-Agent through one no-key Pollinations model:

- Endpoint: `https://text.pollinations.ai/openai`
- Model: `openai-large`
- API key: not required

The browser app stores chat history, settings, enabled skills, and Vector DB cache locally. Chat prompts are sent only to the model endpoint selected in Settings.

## Local preview

```bash
cd docs
python3 -m http.server 4175 --bind 127.0.0.1
```

Open `http://127.0.0.1:4175`.

The legacy `hermes-ollama-agent/` folder is kept as a standalone copy. GitHub Pages should use `docs/`.

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

No model API key is committed or required for the Pollinations endpoint used by the app.
Anonymous Pollinations requests can queue or rate-limit during high traffic; the app automatically retries temporary `429`, `502`, `503`, and `504` responses before showing an error.

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
