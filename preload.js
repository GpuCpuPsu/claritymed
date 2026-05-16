// preload.js — runs before the renderer page loads, in an isolated context
//
// Security model in Electron:
//   renderer (index.html / app.js) — pure browser JS, no Node access
//   preload (this file)            — has Node + Electron APIs, bridges to renderer
//   main (main.js)                 — full Node, handles OS & API calls
//
// contextBridge.exposeInMainWorld() is the safe way to give the renderer
// access to specific capabilities without opening up all of Node.js.

const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('clarityAPI', {
  // ── Text analysis ─────────────────────────────────────────────────────────
  // ipcRenderer.invoke() sends a message to main.js and waits for the response.
  // In Python terms it's like an async RPC call.
  analyzeText: (text) => ipcRenderer.invoke('analyze-text', text),

  // ── PDF analysis ──────────────────────────────────────────────────────────
  // Passes an ArrayBuffer; main.js converts it to a Node Buffer and extracts text.
  analyzePDF: (arrayBuffer) => ipcRenderer.invoke('analyze-pdf', arrayBuffer),

  // ── Image analysis ────────────────────────────────────────────────────────
  // Passes a base64 data URL string; main.js splits it and calls Claude vision.
  analyzeImage: (dataUrl) => ipcRenderer.invoke('analyze-image', dataUrl),

  // ── Screen capture ────────────────────────────────────────────────────────
  // desktopCapturer is available in the preload context (Electron >= 27).
  // We capture the screen here and return a data URL string to the renderer.
  // The renderer then passes that string to analyzeImage() above.
  captureScreen: async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      // Request a reasonably high-res thumbnail so Claude can read text in the screenshot
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (!sources.length) throw new Error('No screen sources available');

    // NativeImage.toDataURL() returns a PNG encoded as a base64 data URL —
    // a plain string that safely crosses the contextBridge.
    return sources[0].thumbnail.toDataURL();
  },
});
