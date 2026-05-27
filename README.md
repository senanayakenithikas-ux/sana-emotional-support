# Sana — Emotional Support Companion

A calm, professional AI companion for emotional support, with a web chat UI, installable mobile app (PWA), and optional CLI.

## Mobile app (any network)

Your phone must reach a **public HTTPS** server (not `127.0.0.1` on your PC).

### Deploy to Render (recommended)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New** → **Blueprint** (or Web Service from Docker).
3. Connect the repo; Render reads [`render.yaml`](render.yaml).
4. Set environment variable **`GROQ_API_KEY`** in the dashboard (never commit it).
5. Deploy. Open your URL, e.g. `https://sana-xxxx.onrender.com`.

### Install on your phone

1. Open the deployed **HTTPS** URL in Chrome (Android) or Safari (iOS).
2. **Android:** Menu → **Install app** or **Add to Home screen**.
3. **iPhone:** Share → **Add to Home Screen**.

The app runs full screen with your Sana icon (PWA).

### Notes

- **HTTPS** is required for the microphone on mobile.
- **FFmpeg** is included in the Docker image for voice transcription.
- Chat history is stored in `sana_memory.json` on the server; it may reset when the host redeploys unless you add persistent storage.
- Free Render plans sleep when idle; the first open after sleep can be slow while Whisper loads.

---

## Run locally

1. Install server dependencies:

```bash
pip install -r requirements.txt
```

For the terminal CLI (`code.py`), also install:

```bash
pip install -r requirements-cli.txt
```

2. Add your Groq API key to `.env`:

```
GROQ_API_KEY=your_key_here
```

3. For local voice in the browser, install [FFmpeg](https://ffmpeg.org/download.html) on your PATH.

4. Start the server:

```bash
python api.py
```

5. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

## Test from another network (tunnel)

If the API runs on your PC and you want a quick public URL:

1. `python api.py`
2. In another terminal: `ngrok http 8000` (or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/))
3. Open the **https** URL ngrok gives you on your phone.

Your PC must stay on; the URL changes on the free ngrok tier.

---

## Web / PWA features

- Text chat with conversation memory
- Hold the microphone to record; release to send (Whisper transcription)
- Read replies aloud (browser speech synthesis)
- Dark mode and delete chat history
- Offline shell caching (service worker); API calls need network

---

## CLI (terminal)

```bash
pip install -r requirements-cli.txt
python code.py
```

Press Enter to speak, type `text` for typing, or `quit` to exit.

---

## Project layout

| File | Purpose |
|------|---------|
| `sana_core.py` | Memory, Groq chat, Whisper |
| `api.py` | FastAPI server + static frontend |
| `static/` | HTML, CSS, JS, PWA manifest, service worker |
| `Dockerfile` | Production image (Python + FFmpeg + Whisper) |
| `render.yaml` | Render.com deploy config |
| `code.py` | Terminal interface (local mic + PowerShell TTS) |
| `requirements.txt` | Server dependencies |
| `requirements-cli.txt` | Extra deps for `code.py` |

---

## Capacitor / Play Store (later)

Set an absolute API URL before loading the app:

```html
<script>window.SANA_API_BASE = "https://your-app.onrender.com";</script>
<script src="/static/config.js"></script>
```

Then wrap `static/` with [Capacitor](https://capacitorjs.com/) for a native APK.
