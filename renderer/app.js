// app.js — renderer process UI logic
// This file runs inside the Electron browser window (like a normal web page).
// It cannot access Node.js directly — all backend calls go through
// window.clarityAPI, which was set up securely in preload.js.

// ─── State ────────────────────────────────────────────────────────────────
let currentTab = 'text';  // which input tab is active
let pdfBuffer = null;     // ArrayBuffer of the loaded PDF
let imageDataUrl = null;  // base64 data URL of the loaded image
let isAnalyzing = false;  // prevents double-clicks during analysis
let isDemoMode = false;   // when true, returns hardcoded sample data instead of calling the API
let lastResult = null;    // most recent analysis result, used by Copy Results

// ─── Demo data ────────────────────────────────────────────────────────────
// Each tab gets its own realistic sample so the demo tells a complete story.

// Text / PDF tab: lab report with hypertension and high cholesterol
const DEMO_TEXT = {
  urgencyLevel: 'Moderate',
  urgencyReason: 'Elevated blood pressure and abnormal cholesterol require follow-up within 1–2 weeks.',
  diagnosis: 'You have been diagnosed with Stage 1 Hypertension (high blood pressure) and Hyperlipidemia (high cholesterol). These conditions mean your blood pressure and the amount of fat in your blood are higher than they should be. Both increase your risk of heart disease over time, but they are very manageable with lifestyle changes and medication.',
  medications: [
    'Lisinopril 10 mg — Take once daily in the morning. Lowers blood pressure by relaxing blood vessels.',
    'Atorvastatin 20 mg — Take once daily at bedtime. Reduces bad (LDL) cholesterol to lower heart disease risk.',
    'Aspirin 81 mg — Take once daily with food. Helps prevent blood clots from forming in blood vessels.',
  ],
  labFindings: [
    'Blood Pressure: 142/91 mmHg — Above the normal range of 120/80. Classified as Stage 1 Hypertension.',
    'LDL Cholesterol: 168 mg/dL — Higher than the ideal level of under 100 mg/dL. This is the "bad" cholesterol.',
    'HDL Cholesterol: 42 mg/dL — Slightly low. This is the "good" cholesterol; above 60 is ideal.',
    'Fasting Blood Glucose: 98 mg/dL — Normal (under 100 mg/dL). No signs of diabetes.',
    'Creatinine (Kidney Function): 0.9 mg/dL — Normal. Your kidneys are working well.',
  ],
  followUpActions: [
    'Schedule a follow-up appointment with your doctor in 2 weeks to recheck blood pressure.',
    'Begin a low-sodium diet — aim for under 2,300 mg of salt per day. Avoid processed and canned foods.',
    'Get at least 30 minutes of moderate exercise (brisk walking) most days of the week.',
    'Monitor blood pressure at home daily and log readings to bring to your next appointment.',
    'Repeat fasting cholesterol blood test in 3 months to check whether medication is working.',
  ],
  disclaimer: 'This analysis is for informational purposes only. Always consult your healthcare provider before making any medical decisions.',
};

// Image tab: lumbar MRI showing a herniated disc
const DEMO_IMAGE = {
  urgencyLevel: 'Moderate',
  urgencyReason: 'Findings consistent with a lumbar disc herniation warrant evaluation by a spine specialist within 1–2 weeks.',
  diagnosis: 'This MRI of the lower spine shows a herniated disc at the L4–L5 level. A herniated disc happens when the soft cushion between two spinal bones bulges out of place and mildly presses on a nearby nerve. This is a common condition that often improves with physical therapy and does not always require surgery.',
  medications: [
    'Ibuprofen 600 mg — Take every 8 hours with food as needed for pain and swelling.',
    'Cyclobenzaprine 5 mg — Take at bedtime as needed. A muscle relaxant to reduce lower back spasm.',
    'Diclofenac Gel 1% — Apply to the lower back twice daily for local pain relief.',
  ],
  labFindings: [
    'L4–L5 disc: Moderate posterior herniation with mild compression of the left nerve root.',
    'L5–S1 disc: Mild degenerative changes. No significant herniation.',
    'Spinal canal: No critical narrowing (stenosis) detected at any level.',
    'Vertebral alignment: Normal. No fractures or bone abnormalities identified.',
    'Paraspinal muscles: Mild asymmetry consistent with protective muscle guarding.',
  ],
  followUpActions: [
    'Refer to a spine specialist (orthopedic surgeon or physiatrist) for further evaluation.',
    'Begin physical therapy focused on core strengthening and lumbar stabilisation.',
    'Avoid heavy lifting and prolonged sitting — stand or walk for 5 minutes every 30 minutes.',
    'Apply ice for 15 minutes after activity; use heat for 15 minutes before gentle stretching.',
    'Return immediately if you develop leg weakness, numbness in the groin, or loss of bladder/bowel control — these are emergency symptoms.',
  ],
  disclaimer: 'This analysis is for informational purposes only. Always consult your healthcare provider before making any medical decisions.',
};

// Screen tab: telehealth annual wellness visit summary
const DEMO_SCREEN = {
  urgencyLevel: 'Routine',
  urgencyReason: 'Annual wellness visit with all major values within normal limits. No immediate concerns identified.',
  diagnosis: 'This appears to be a telehealth annual wellness visit summary. All major lab results are within normal range. You are in good general health. The visit notes include routine preventive care recommendations appropriate for your age group, along with a mild Vitamin D insufficiency that is easily corrected with supplementation.',
  medications: [
    'Vitamin D3 2,000 IU — Take once daily with a meal. Recommended due to mild insufficiency on last bloodwork.',
    'Daily multivitamin — Take once daily. General nutritional support.',
  ],
  labFindings: [
    'Complete Blood Count (CBC): All values normal. No signs of anaemia or infection.',
    'Comprehensive Metabolic Panel: Liver enzymes, kidney function, and electrolytes all normal.',
    'Vitamin D: 28 ng/mL — Slightly below the optimal range of 30–80 ng/mL. Supplement recommended.',
    'TSH (Thyroid): 2.1 mIU/L — Normal. Thyroid function is healthy.',
    'HbA1c (3-month blood sugar average): 5.4% — Normal. No signs of pre-diabetes.',
  ],
  followUpActions: [
    'Schedule next annual wellness visit in 12 months.',
    'Complete the age-appropriate cancer screenings discussed during this visit.',
    'Continue current exercise routine — provider noted cardiorespiratory fitness is good.',
    'Take Vitamin D supplement daily and have levels rechecked in 3 months.',
    'Maintain a balanced diet rich in whole foods and leafy greens to support Vitamin D absorption.',
  ],
  disclaimer: 'This analysis is for informational purposes only. Always consult your healthcare provider before making any medical decisions.',
};

// Map each tab to its corresponding demo dataset
const DEMO_BY_TAB = { text: DEMO_TEXT, pdf: DEMO_TEXT, image: DEMO_IMAGE, screenshot: DEMO_SCREEN };

// ─── DOM references ────────────────────────────────────────────────────────
// Grabbing everything once at startup is faster than querying the DOM on each event.
const analyzeBtn      = document.getElementById('analyze-btn');
const screenshotBtn   = document.getElementById('screenshot-btn');
const retryBtn        = document.getElementById('retry-btn');
const demoToggle      = document.getElementById('demo-toggle');
const demoBanner      = document.getElementById('demo-banner');
const copyBtn         = document.getElementById('copy-btn');
const newAnalysisBtn  = document.getElementById('new-analysis-btn');
const scrollFade      = document.getElementById('scroll-fade');
const resultsPanel    = document.querySelector('.results-panel');

const stateEmpty      = document.getElementById('state-empty');
const stateLoading    = document.getElementById('state-loading');
const stateError      = document.getElementById('state-error');
const resultsContent  = document.getElementById('results-content');
const errorMessage    = document.getElementById('error-message');

// ─── Scroll fade ───────────────────────────────────────────────────────────
// Show the fade whenever content overflows; hide it when scrolled to the bottom.
function updateScrollFade() {
  const atBottom = resultsPanel.scrollTop + resultsPanel.clientHeight >= resultsPanel.scrollHeight - 8;
  const canScroll = resultsPanel.scrollHeight > resultsPanel.clientHeight;
  scrollFade.hidden = !canScroll || atBottom;
}

resultsPanel.addEventListener('scroll', updateScrollFade);
window.addEventListener('resize', updateScrollFade);

// ─── Copy Results ──────────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  if (!lastResult) return;

  const sep  = '─'.repeat(40);
  const list = arr => (arr && arr.length) ? arr.map(i => `  • ${i}`).join('\n') : '  • None identified';

  const text = [
    'CLARITYMED ANALYSIS',
    '═'.repeat(40),
    '',
    `URGENCY: ${lastResult.urgencyLevel}`,
    lastResult.urgencyReason || '',
    '',
    'DIAGNOSIS', sep,
    lastResult.diagnosis || 'None identified',
    '',
    'MEDICATIONS', sep,
    list(lastResult.medications),
    '',
    'LAB FINDINGS', sep,
    list(lastResult.labFindings),
    '',
    'FOLLOW-UP ACTIONS', sep,
    list(lastResult.followUpActions),
    '',
    sep,
    lastResult.disclaimer || '',
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 2000);
  });
});

// ─── New Analysis ──────────────────────────────────────────────────────────
newAnalysisBtn.addEventListener('click', resetApp);
retryBtn.addEventListener('click', resetApp);

function resetApp() {
  // Clear all input state
  pdfBuffer    = null;
  imageDataUrl = null;
  lastResult   = null;

  document.getElementById('text-input').value = '';

  const pdfLabel = document.getElementById('pdf-filename');
  pdfLabel.textContent = '';
  pdfLabel.hidden = true;

  const previewWrap   = document.getElementById('image-preview-wrap');
  const placeholder   = document.getElementById('image-drop-placeholder');
  if (previewWrap)  previewWrap.hidden = true;
  if (placeholder)  placeholder.style.display = 'flex';

  resultsPanel.scrollTop = 0;
  showEmpty();
}

// ─── Demo mode toggle ──────────────────────────────────────────────────────
demoToggle.addEventListener('click', () => {
  isDemoMode = !isDemoMode;
  demoToggle.classList.toggle('active', isDemoMode);
  demoToggle.textContent = isDemoMode ? '✓ Demo Mode' : 'Demo Mode';
  // Show/hide the amber banner in the results panel
  demoBanner.hidden = !isDemoMode;
  // Reset to empty state so the user starts fresh in whichever mode they chose
  showEmpty();
});

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

// (retry is now wired to resetApp above)

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
    let result;
    if (isDemoMode) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      result = DEMO_BY_TAB[currentTab] || DEMO_TEXT;
    } else {
      result = await apiCallFn();
    }
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
  lastResult = data; // save for Copy Results

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

  // Scroll to top so urgency banner is visible first, then check if fade is needed
  resultsPanel.scrollTop = 0;
  requestAnimationFrame(updateScrollFade);
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
