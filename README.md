# ClarityMed

A cross-platform desktop app that analyzes medical documents and scans in plain language, powered by Claude AI.

## Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An [Anthropic API key](https://console.anthropic.com/)

### 2. Install dependencies

```bash
cd claritymed
npm install
```

### 3. Add your API key

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and replace `your_api_key_here` with your actual key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run the app

```bash
npm start
```

---

## Features

| Tab | What it does |
|-----|-------------|
| **Text** | Paste or type clinical notes, lab results, discharge summaries |
| **PDF** | Drag & drop a PDF — text is extracted and analyzed |
| **Image** | Upload an X-ray, MRI, CT scan, or any medical image for vision analysis |
| **Screen** | Captures your current screen and analyzes it (useful for telehealth portals) |

Results are broken into: **Urgency Level**, **Diagnosis**, **Medications**, **Lab Findings**, **Follow-Up Actions**.

---

## Project structure

```
claritymed/
├── main.js          # Electron main process — window, IPC handlers, Claude API calls
├── preload.js       # Secure bridge between renderer and main process
├── package.json
├── .env             # Your API key (never commit this)
├── .env.example     # Template
└── renderer/
    ├── index.html   # App UI
    ├── styles.css   # Dark-green medical theme
    └── app.js       # Frontend logic (tabs, drag-drop, result rendering)
```

---

## Troubleshooting

**"Analysis failed" / API error** — Check that `ANTHROPIC_API_KEY` in `.env` is correct and has credits.

**PDF shows "Could not extract text"** — The PDF is likely a scanned image. Use the **Image** tab instead.

**Screen capture is blank** — On macOS, grant Screen Recording permission to the app in System Preferences → Privacy & Security.

**`npm install` fails on pdf-parse** — Run `npm install --legacy-peer-deps`.

---

## Disclaimer

ClarityMed is for informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.
