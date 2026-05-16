# ClarityMed

A cross-platform desktop application that analyzes medical documents and scans using Claude AI, presenting findings in plain, easy-to-understand language.

## Features

| Tab | What it does |
|-----|-------------|
| **Clinical Text** | Paste or type clinical notes, lab results, or discharge summaries |
| **PDF Document** | Drag & drop a PDF — text is extracted and sent for analysis |
| **Medical Image** | Upload an X-ray, MRI, CT scan, or ultrasound for vision analysis |
| **Screenshot** | Capture your screen and analyze it — useful for telehealth portals |

Every analysis returns a structured summary with:

- **Urgency Level** — Routine, Moderate, or Urgent, with a plain-language explanation
- **Diagnosis** — Main findings explained at a 6th-grade reading level
- **Medications** — Each drug with dosage and purpose in plain terms
- **Lab Findings** — Results with what they mean for the patient
- **Follow-Up Actions** — Specific next steps for the patient or provider

A **Demo Mode** lets you explore all features with realistic sample data — no API key needed.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An [Anthropic API key](https://console.anthropic.com/)

### Install

```bash
git clone https://github.com/GpuCpuPsu/claritymed.git
cd claritymed
npm install
```

### Configure

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and add your key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Run

```bash
npm start
```

---

## Project Structure

```
claritymed/
├── main.js          # Electron main process — window, IPC handlers, Claude API calls
├── preload.js       # Secure context bridge between renderer and main process
├── package.json
├── .env             # Your API key (never committed)
├── .env.example     # Template
└── renderer/
    ├── index.html   # App layout and markup
    ├── styles.css   # Indigo SaaS dashboard theme
    └── app.js       # UI logic — tabs, drag-drop, demo mode, result rendering
```

---

## Tech Stack

- [Electron](https://www.electronjs.org/) — Cross-platform desktop shell
- [Claude AI](https://www.anthropic.com/) (`claude-opus-4-7`) — Medical document analysis
- [Anthropic Node.js SDK](https://github.com/anthropics/anthropic-sdk-node) — API client
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF text extraction

---

## Security

- The renderer runs with `nodeIntegration: false` and `contextIsolation: true`
- All Claude API calls happen in the main process — the renderer never touches the API key
- `.env` is gitignored and never committed

---

## Troubleshooting

**"Analysis failed" / API error** — Verify `ANTHROPIC_API_KEY` in `.env` is correct and the account has credits.

**PDF shows "Could not extract text"** — The PDF is likely a scanned image. Use the **Medical Image** tab instead.

**Screen capture is blank** — On macOS, grant Screen Recording permission in System Preferences → Privacy & Security.

**`npm install` fails on pdf-parse** — Run `npm install --legacy-peer-deps`.

---

## Disclaimer

ClarityMed is for informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider before making any medical decisions.
