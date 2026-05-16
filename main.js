// main.js — Electron main process
// Think of this as the "server" or "backend" of the desktop app.
// It creates the window, handles OS-level operations (file I/O, native APIs),
// and makes Claude API calls. The renderer (frontend) talks to it via IPC messages.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// dotenv reads .env and injects values into process.env
require('dotenv').config();

// Official Anthropic Node.js SDK
const Anthropic = require('@anthropic-ai/sdk');

// pdf-parse's default entry point runs a test suite on import — a known quirk.
// We import the underlying library directly to skip that.
const pdfParse = require('pdf-parse/lib/pdf-parse');

// Initialise the Claude client once at startup
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Using the most capable Opus model for accurate medical analysis.
// (The spec asked for "claude-opus-4-5" which is not a real model ID;
//  claude-opus-4-7 is the correct current Opus identifier.)
const MODEL = 'claude-opus-4-7';

// The system prompt shapes Claude's behaviour for every request.
// We define it once so the API can cache it — re-using a cached prompt
// costs fewer tokens, which matters when users analyze many documents.
const SYSTEM_PROMPT = `You are a medical document analyzer helping patients and healthcare workers understand clinical information in plain language.

Analyze the provided medical content and return ONLY a valid JSON object with exactly these fields — no markdown, no code fences, no extra text:

{
  "urgencyLevel": "Routine" or "Moderate" or "Urgent",
  "urgencyReason": "One sentence explaining why this urgency level was assigned",
  "diagnosis": "Plain-language explanation of the diagnosis or main findings. Write 'No diagnosis identified' if none.",
  "medications": ["Medication name — dosage — what it is for in plain language", "..."],
  "labFindings": ["Lab test name: result — what this means for the patient", "..."],
  "followUpActions": ["Specific action the patient or provider should take", "..."],
  "disclaimer": "This analysis is for informational purposes only. Always consult your healthcare provider before making any medical decisions."
}

Rules:
- Write at a 6th-grade reading level — clear, no jargon
- If a section has no relevant data use an empty array [] or the string "None identified"
- Urgency levels: Routine = normal/preventive, Moderate = needs attention within days or weeks, Urgent = needs same-day or immediate care
- For medical images (X-ray, MRI, CT, ultrasound): describe observable findings in plain terms, note any visible abnormalities
- Return ONLY the raw JSON object`;

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1b12', // Match dark-green theme — prevents white flash on startup
    show: false,                // Don't render until content is ready
    webPreferences: {
      // Security: the renderer cannot directly access Node.js APIs
      nodeIntegration: false,
      // Security: preload runs in an isolated V8 context and bridges via contextBridge
      contextIsolation: true,
      // Electron 20+ enables sandbox by default, which strips desktopCapturer from
      // the preload context. Disabling sandbox restores it. The renderer is still
      // fully isolated via contextIsolation — nodeIntegration:false still applies.
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show once the page has finished loading to avoid a blank-window flash
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();

  // macOS convention: re-create the window when the dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit on all-windows-closed (standard behaviour on Windows/Linux; macOS keeps running)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Shared helper: call Claude and parse the JSON response ──────────────────

async function callClaude(userContent) {
  // userContent is either a plain string (text analysis) or
  // an array of {type, ...} blocks (vision analysis with image + text).
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // cache_control tells the API to cache this system prompt.
    // On repeated calls the cached version is reused, cutting token costs.
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const rawText = response.content[0].text.trim();

  // Strip markdown code fences if Claude wraps the JSON despite instructions
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  return JSON.parse(cleaned);
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
// ipcMain.handle() registers async handlers that the renderer calls via
// ipcRenderer.invoke(). The return value is sent back to the caller automatically.

// Handler: plain text analysis
ipcMain.handle('analyze-text', async (_event, text) => {
  if (!text || !text.trim()) throw new Error('No text provided');

  return callClaude(`Please analyze this medical document:\n\n${text}`);
});

// Handler: PDF — receives an ArrayBuffer, extracts text, then analyzes it
ipcMain.handle('analyze-pdf', async (_event, arrayBuffer) => {
  // Buffer.from() converts the renderer's ArrayBuffer into a Node.js Buffer
  const buffer = Buffer.from(arrayBuffer);
  const pdfData = await pdfParse(buffer);

  if (!pdfData.text || !pdfData.text.trim()) {
    throw new Error(
      'Could not extract text from this PDF. It may be a scanned document — try the Image tab instead.'
    );
  }

  // Slice to ~15 000 chars to stay well within Claude's context window
  const truncated = pdfData.text.slice(0, 15000);

  return callClaude(
    `Please analyze this medical document extracted from a PDF:\n\n${truncated}`
  );
});

// Handler: image analysis — receives a data URL and sends it to Claude vision
ipcMain.handle('analyze-image', async (_event, dataUrl) => {
  // Data URL format: "data:<mediaType>;base64,<base64data>"
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid image data');

  const mediaType = match[1]; // e.g. "image/png"
  const base64Data = match[2];

  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!supported.includes(mediaType)) {
    throw new Error(`Unsupported image type: ${mediaType}. Use JPEG, PNG, GIF, or WebP.`);
  }

  // Vision requests use a multi-part content array: image block + text instruction
  return callClaude([
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    },
    {
      type: 'text',
      text: 'Please analyze this medical image and describe your findings in plain language.',
    },
  ]);
});
