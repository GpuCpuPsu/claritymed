// app.js — renderer process UI logic
// This file runs inside the Electron browser window (like a normal web page).
// It cannot access Node.js directly — all backend calls go through
// window.clarityAPI, which was set up securely in preload.js.

// ─── State ────────────────────────────────────────────────────────────────
let currentTab = 'text';  // which input tab is active
let pdfBuffer = null;     // ArrayBuffer of the loaded PDF
let imageDataUrl = null;  // base64 data URL of the loaded image
let isAnalyzing = false;  // prevents double-clicks during analysis

// ─── DOM references ────────────────────────────────────────────────────────
// Grabbing everything once at startup is faster than querying the DOM on each event.
const analyzeBtn      = document.getElementById('analyze-btn');
const screenshotBtn   = document.getElementById('screenshot-btn');
const retryBtn        = document.getElementById('retry-btn');

const stateEmpty      = document.getElementById('state-empty');
const stateLoading    = document.getElementById('state-loading');
const stateError      = document.getElementById('state-error');
const resultsContent  = document.getElementById('results-content');
const errorMessage    = document.getElementById('error-message');

// ─── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  currentTab = tab;

  // Update aria-selected attributes (accessibility)
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-selected', b.dataset.tab === tab);
  });

  // Show the matching content panel, hide others
  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });

  // The screenshot tab has its own action button — hide the shared analyze button
  analyzeBtn.style.display = tab === 'screenshot' ? 'none' : 'block';

  // Reset file selections when changing tabs (avoids confusing state)
  pdfBuffer  = null;
  imageDataUrl = null;
  document.getElementById('pdf-filename').hidden = true;

  const previewWrap = document.getElementById('image-preview-wrap');
  const placeholder = document.getElementById('image-drop-placeholder');
  if (previewWrap && placeholder) {
    previewWrap.hidden = true;
    placeholder.style.display = 'flex';
  }
}

// ─── Main analyze button ───────────────────────────────────────────────────
analyzeBtn.addEventListener('click', () => {
  if (isAnalyzing) return;

  if (currentTab === 'text') {
    const text = document.getElementById('text-input').value;
    if (!text.trim()) { showError('Please paste or type some medical text first.'); return; }
    runAnalysis(() => window.clarityAPI.analyzeText(text));

  } else if (currentTab === 'pdf') {
    if (!pdfBuffer) { showError('Please select or drop a PDF file first.'); return; }
    runAnalysis(() => window.clarityAPI.analyzePDF(pdfBuffer));

  } else if (currentTab === 'image') {
    if (!imageDataUrl) { showError('Please select or drop a medical image first.'); return; }
    runAnalysis(() => window.clarityAPI.analyzeImage(imageDataUrl));
  }
});

// ─── Screenshot button ─────────────────────────────────────────────────────
screenshotBtn.addEventListener('click', () => {
  if (isAnalyzing) return;
  runAnalysis(async () => {
    // captureScreen() is defined in preload.js — it calls desktopCapturer
    // and returns the screenshot as a base64 PNG data URL string.
    const dataUrl = await window.clarityAPI.captureScreen();
    return window.clarityAPI.analyzeImage(dataUrl);
  });
});

// ─── Retry button ──────────────────────────────────────────────────────────
retryBtn.addEventListener('click', () => showEmpty());

// ─── PDF file handling ─────────────────────────────────────────────────────
setupDropZone({
  zoneId:    'pdf-drop',
  accepts:   file => file.type === 'application/pdf',
  onFile:    loadPDF,
  errorMsg:  'Only PDF files are accepted here.',
});

document.getElementById('pdf-select-btn').addEventListener('click', () => {
  document.getElementById('pdf-input').click();
});

document.getElementById('pdf-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadPDF(file);
  // Reset the input so the same file can be re-selected if needed
  e.target.value = '';
});

function loadPDF(file) {
  const reader = new FileReader();
  reader.onload = () => {
    pdfBuffer = reader.result; // ArrayBuffer — sent directly to main.js over IPC
    const label = document.getElementById('pdf-filename');
    label.textContent = `📄 ${file.name}`;
    label.hidden = false;
  };
  reader.onerror = () => showError('Failed to read the PDF file.');
  // readAsArrayBuffer gives us the raw binary — pdf-parse in main.js needs this
  reader.readAsArrayBuffer(file);
}

// ─── Image file handling ───────────────────────────────────────────────────
setupDropZone({
  zoneId:   'image-drop',
  accepts:  file => file.type.startsWith('image/'),
  onFile:   loadImage,
  errorMsg: 'Only image files (JPEG, PNG, WebP, GIF) are accepted here.',
});

document.getElementById('image-select-btn').addEventListener('click', () => {
  document.getElementById('image-input').click();
});

document.getElementById('image-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadImage(file);
  e.target.value = '';
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = reader.result; // "data:image/png;base64,..." string
    showImagePreview(imageDataUrl);
  };
  reader.onerror = () => showError('Failed to read the image file.');
  // readAsDataURL encodes the image as a base64 data URL — Claude vision needs this format
  reader.readAsDataURL(file);
}

function showImagePreview(dataUrl) {
  const previewWrap = document.getElementById('image-preview-wrap');
  const placeholder = document.getElementById('image-drop-placeholder');
  document.getElementById('preview-img').src = dataUrl;
  previewWrap.hidden = false;
  placeholder.style.display = 'none'; // hide the "drop here" placeholder
}

// ─── Drop zone helper ──────────────────────────────────────────────────────
// setupDropZone wires up drag-and-drop events for a given zone.
// It's a reusable function — Python equivalent would be a decorator or helper.
function setupDropZone({ zoneId, accepts, onFile, errorMsg }) {
  const zone = document.getElementById(zoneId);

  zone.addEventListener('dragover', e => {
    e.preventDefault(); // required — without this the browser won't allow a drop
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', e => {
    // Only remove the highlight when the cursor actually leaves the zone,
    // not when it moves over a child element inside the zone.
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!accepts(file)) {
      showError(errorMsg);
      return;
    }

    onFile(file);
  });

  // Keyboard accessibility: allow Enter/Space to open file picker
  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const input = zone.querySelector('input[type="file"]');
      if (input) input.click();
    }
  });
}

// ─── Analysis runner ───────────────────────────────────────────────────────
// runAnalysis wraps any API call with loading state, error handling, and result rendering.
// apiCallFn is a function that returns a Promise — in Python this would be an async callable.
async function runAnalysis(apiCallFn) {
  if (isAnalyzing) return;

  isAnalyzing = true;
  setButtonsDisabled(true);
  showLoading();

  try {
    const result = await apiCallFn();
    renderResults(result);
  } catch (err) {
    // err.message comes from main.js — it wraps the actual error with context
    showError(err.message || 'An unexpected error occurred. Check your API key and try again.');
  } finally {
    isAnalyzing = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  analyzeBtn.disabled    = disabled;
  screenshotBtn.disabled = disabled;
}

// ─── UI state helpers ──────────────────────────────────────────────────────
function showEmpty() {
  stateEmpty.hidden    = false;
  stateLoading.hidden  = true;
  stateError.hidden    = true;
  resultsContent.hidden = true;
}

function showLoading() {
  stateEmpty.hidden    = true;
  stateLoading.hidden  = false;
  stateError.hidden    = true;
  resultsContent.hidden = true;
}

function showError(msg) {
  stateEmpty.hidden     = true;
  stateLoading.hidden   = true;
  stateError.hidden     = false;
  resultsContent.hidden = true;
  errorMessage.textContent = msg;
}

// ─── Result rendering ──────────────────────────────────────────────────────
function renderResults(data) {
  stateEmpty.hidden    = true;
  stateLoading.hidden  = true;
  stateError.hidden    = true;
  resultsContent.hidden = false;

  // ── Urgency badge ──
  const badge = document.getElementById('urgency-badge');
  // Normalise to title-case in case Claude capitalises differently
  const level = (data.urgencyLevel || 'Routine').trim();
  badge.textContent = level;
  // Remove all level classes then add the correct one
  badge.className = 'urgency-badge';
  const levelClass = { Routine: 'routine', Moderate: 'moderate', Urgent: 'urgent' }[level] || 'routine';
  badge.classList.add(levelClass);

  document.getElementById('urgency-reason').textContent = data.urgencyReason || '';

  // ── Text sections ──
  document.getElementById('result-diagnosis').textContent =
    data.diagnosis || 'No diagnosis information found.';

  // ── List sections ──
  renderList('result-medications', data.medications);
  renderList('result-lab-findings', data.labFindings);
  renderList('result-follow-up', data.followUpActions);

  // ── Disclaimer ──
  document.getElementById('result-disclaimer').textContent = data.disclaimer || '';

  // Scroll the results panel back to the top so the urgency banner is visible first
  document.querySelector('.results-panel').scrollTop = 0;
}

// Renders an array of strings as <li> elements inside a <ul>.
// If the array is empty or missing, shows a "None identified" placeholder.
function renderList(elementId, items) {
  const ul = document.getElementById(elementId);
  ul.innerHTML = ''; // clear previous results

  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-item';
    li.textContent = 'None identified';
    ul.appendChild(li);
    return;
  }

  items.forEach(item => {
    const li = document.createElement('li');
    // textContent (not innerHTML) prevents any HTML injection from API responses
    li.textContent = item;
    ul.appendChild(li);
  });
}
