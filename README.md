# cARita

**Still on the outside. Alive on the inside.**

cARita turns printed postcards into living AR experiences. Scan a postcard with your phone camera — no app install needed — and watch a personal video message play directly over the card.

Live demo: [carita.pages.dev](https://carita.pages.dev)

---

## How it works

1. A postcard is printed and physically sent or given to someone.
2. The recipient opens `carita.pages.dev` on their phone browser, taps **Tap to Start**, and points the camera at the postcard.
3. MindAR recognises the postcard image and overlays the matching video directly on top of it in real time.
4. The recipient can tap **Share Story** to share a pre-composed 1080×1920 MP4 story card to Instagram, WhatsApp, or any other app.

Everything runs in the browser — iOS Safari and Android Chrome both work with no installation.

---

## Features

- **AR video overlay** — MindAR.js image tracking plays a video precisely over the postcard.
- **Multi-target** — supports multiple different postcards, each with its own video and message.
- **Share Story** — admin pre-composes a 1080×1920 story video (FFmpeg.wasm + Canvas overlay) and stores it in R2. End users fetch and share instantly, even on iOS Safari.
- **Self-service admin panel** — upload new postcard images and videos, recompile AR targets, and generate story videos, all from the browser. No developer needed after initial setup.
- **Zero app install** — pure PWA-style web app hosted on Cloudflare Pages.
- **Free infrastructure** — Cloudflare Pages + R2 + KV, all on the free tier.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| AR tracking | [MindAR.js 1.2.2](https://hiukim.github.io/mind-ar-js-doc/) |
| 3D scene | [A-Frame 1.4.2](https://aframe.io) |
| Video compositing | [FFmpeg.wasm 0.12](https://ffmpegwasm.netlify.app/) (admin only, desktop Chrome) |
| Storage | Cloudflare R2 (videos, images, `.mind` file, story MP4s) |
| Metadata | Cloudflare KV (target list JSON) |
| API | Cloudflare Pages Functions |
| Hosting | Cloudflare Pages |

---

## Project structure

```
cARita/
├── index.html                  # AR viewer app (public)
├── app.js                      # AR event handlers, share logic
├── style.css                   # Styles
├── admin.html                  # Admin panel (token-protected)
├── admin.js                    # Admin logic: upload, compile, story generation
├── _headers                    # Cloudflare HTTP headers (COOP/COEP on admin, CORS on /r2/*)
├── wrangler.toml.example       # Copy to wrangler.toml and fill in your values
├── ffmpeg/
│   ├── worker.js               # Self-hosted FFmpeg worker (same-origin required)
│   ├── const.js                # FFmpeg constants
│   └── errors.js               # FFmpeg error definitions
└── functions/
    ├── api/
    │   ├── targets.js          # GET  /api/targets       — target list from KV
    │   ├── targets-config.js   # GET  /api/targets-config — blocking JS for buildScene()
    │   ├── mind.js             # GET/PUT /api/mind       — targets.mind in R2
    │   ├── upload-image.js     # POST /api/upload-image  — image → R2, updates KV
    │   ├── upload-video.js     # POST /api/upload-video  — video → R2
    │   ├── upload-story-video.js # PUT /api/upload-story-video — story MP4 → R2
    │   ├── update-target.js    # PATCH /api/update-target — edit message in KV
    │   └── delete-target.js    # DELETE /api/delete-target — remove target from KV + R2
    └── r2/
        └── [[path]].js         # GET /r2/* — proxy R2 assets to browser with CORS headers
```

---

## Self-hosting guide

### Prerequisites

- [Node.js](https://nodejs.org) (for Wrangler CLI)
- A [Cloudflare account](https://cloudflare.com) (free)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

### 1. Clone and configure

```bash
git clone https://github.com/p1sangmas/cARita.git
cd carita
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and fill in your project name and resource IDs (see steps below).

### 2. Create Cloudflare resources

```bash
wrangler login

# Create R2 bucket
wrangler r2 bucket create your-bucket-name

# Create KV namespace — note the ID printed in the output
wrangler kv:namespace create carita-kv
```

Paste the KV namespace ID and bucket name into `wrangler.toml`.

### 3. Set the admin token

In the [Cloudflare Pages dashboard](https://dash.cloudflare.com), go to your project → **Settings → Environment variables** and add:

| Variable | Value |
|----------|-------|
| `ADMIN_TOKEN` | A long random secret (e.g. output of `openssl rand -hex 32`) |

This token is never stored in the codebase. It is entered manually in the admin panel on first login.

### 4. Upload your initial assets

```bash
# Postcard images
wrangler r2 object put your-bucket/targets/0/image.jpg --file assets/your-postcard.jpg

# Overlay videos
wrangler r2 object put your-bucket/targets/0/video.mp4 --file assets/your-video.mp4

# Compiled .mind file (generate via the admin panel after deploy, or use the MindAR compiler tool)
wrangler r2 object put your-bucket/targets.mind --file assets/targets.mind
```

### 5. Seed the KV target list

```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID targets \
  '[{"index":0,"message":"Location, Date","videoKey":"targets/0/video.mp4"}]'
```

### 6. Deploy

```bash
wrangler pages deploy . --project-name your-project-name
```

---

## Admin panel

Access `/admin.html` from a desktop browser (Chrome recommended). Enter your `ADMIN_TOKEN` to sign in.

From the admin panel you can:
- **View current targets** — list of all uploaded postcards with thumbnails.
- **Add a new target** — upload a postcard image (JPG/PNG), overlay video (MP4), and a message label.
- **Recompile targets** — runs the MindAR compiler in the browser to regenerate `targets.mind`. Required after every image upload.
- **Generate Story Video** — uses FFmpeg.wasm to composite the overlay video with a branded 1080×1920 story card layout and uploads the result to R2. End users can then share it instantly without any on-device processing.

> **Note:** Story video generation requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on `/admin.html`, which are set in `_headers`. These headers are intentionally **not** applied to `index.html` (the public AR viewer) to avoid breaking CDN-loaded A-Frame and MindAR scripts.

---

## How story sharing works

```
Admin (desktop Chrome):
  Uploads target → clicks "Generate Story Video"
  FFmpeg.wasm composites video + branded overlay PNG
  PUT /api/upload-story-video → R2: targets/{n}/story.mp4

End user (iOS or Android):
  Scans postcard → taps "Share Story"
  HEAD /r2/targets/{n}/story.mp4
    → exists  → fetch MP4 → Web Share sheet (or download)
    → missing → PNG story card fallback (generated on-device)
```

| Platform | Behaviour |
|----------|-----------|
| iOS Safari | Fetches pre-composed MP4 → native share sheet |
| Android Chrome | Fetches pre-composed MP4 → native share sheet |
| Desktop | Downloads MP4 |
| No story video yet | Generates PNG story card on-device (fallback) |

---

## Local development

Wrangler's local dev server emulates R2 and KV bindings:

```bash
wrangler pages dev . --compatibility-date 2024-01-01
```

Open `http://localhost:8788` in your browser.

> Camera access requires HTTPS in most browsers. For local testing of the AR experience, deploy to Pages and test on the live URL, or use a tool like `ngrok` to expose your local server over HTTPS.

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

When contributing:
- Do not commit `wrangler.toml` — it is in `.gitignore`. Use `wrangler.toml.example` as the template.
- Do not commit your `ADMIN_TOKEN` or any Cloudflare account IDs.
- The `assets/` directory is for local seed files only and is not deployed.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built with ❤️ by Fakhrul Fauzi
