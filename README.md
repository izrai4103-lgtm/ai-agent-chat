# AI Agent Chat

Static GitHub Pages app for chatting with Gemini, Hermes Gateway, or Ollama.

## Local preview

```bash
cd hermes-ollama-agent
python3 -m http.server 4175 --bind 127.0.0.1
```

Open `http://127.0.0.1:4175`.

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

API keys are not committed. Paste the Gemini API key in the app settings; it is stored only in browser localStorage.
