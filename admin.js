import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';

// cARita Admin — client-side logic
// Handles auth, target listing, image/video upload, and MindAR target recompilation.

var token = localStorage.getItem('carita_admin_token') || '';

// ── Bootstrap ──────────────────────────────────────────────────────────────
if (token) {
  showAdmin();
}

document.getElementById('auth-form').addEventListener('submit', function (e) {
  e.preventDefault();
  token = document.getElementById('token-input').value.trim();
  if (!token) return;
  localStorage.setItem('carita_admin_token', token);
  showAdmin();
});

function showAdmin() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('admin-section').style.display = 'block';
  loadTargets();
}

function signOut() {
  localStorage.removeItem('carita_admin_token');
  token = '';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('auth-section').style.display = 'block';
  document.getElementById('token-input').value = '';
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function showStatus(id, type, msg) {
  var el = document.getElementById(id);
  el.className = 'status ' + type;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideStatus(id) {
  document.getElementById(id).style.display = 'none';
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + token };
}

// ── Load & render target list ────────────────────────────────────────────────
var currentTargets = [];

async function loadTargets() {
  var container = document.getElementById('targets-list');
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    var res = await fetch('/api/targets');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentTargets = await res.json();
    renderTargets(currentTargets);
  } catch (err) {
    container.innerHTML = '<p class="empty-state" style="color:#ff8080">Failed to load targets: ' + err.message + '</p>';
  }
}

function renderTargets(targets) {
  var container = document.getElementById('targets-list');
  hideStatus('targets-status');
  container.innerHTML = '';

  if (!targets.length) {
    container.innerHTML = '<p class="empty-state">No targets yet. Add one below.</p>';
    return;
  }

  targets.forEach(function (t) {
    var wrap = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'target-row';

    var indexEl = document.createElement('span');
    indexEl.className = 'target-index';
    indexEl.textContent = t.index;

    var thumb = document.createElement('img');
    thumb.className = 'target-thumb';
    thumb.src = '/r2/' + (t.imageKey || 'targets/' + t.index + '/image.jpg');
    thumb.alt = '';
    thumb.onerror = function () { this.style.opacity = 0.2; };

    var msgEl = document.createElement('span');
    msgEl.className = 'target-message';
    msgEl.textContent = t.message || '(no message)';

    var editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.title = 'Edit message';
    editBtn.textContent = '✎';

    var storyBtn = document.createElement('button');
    storyBtn.className = 'btn-icon';
    storyBtn.title = 'Generate story video';
    storyBtn.textContent = '🎬 Story';

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-icon btn-icon-delete';
    delBtn.title = 'Delete target';
    delBtn.textContent = '×';

    row.appendChild(indexEl);
    row.appendChild(thumb);
    row.appendChild(msgEl);
    row.appendChild(editBtn);
    row.appendChild(storyBtn);
    row.appendChild(delBtn);

    var progressEl = document.createElement('div');
    progressEl.className = 'sv-progress';
    progressEl.style.display = 'none';
    progressEl.innerHTML = '<div class="sv-track"><div class="sv-fill"></div></div><p class="sv-label"></p>';

    wrap.appendChild(row);
    wrap.appendChild(progressEl);
    container.appendChild(wrap);

    editBtn.addEventListener('click', function () { startEdit(row, msgEl, editBtn, t); });
    storyBtn.addEventListener('click', function () { generateStoryVideo(t, storyBtn, progressEl); });
    delBtn.addEventListener('click',  function () { deleteTarget(t.index); });

    // Disable button if story.mp4 already exists in R2
    fetch('/r2/targets/' + t.index + '/story.mp4', { method: 'HEAD' })
      .then(function (r) { if (r.ok) markStoryDone(storyBtn); })
      .catch(function () {});
  });
}

// ── Inline message edit ──────────────────────────────────────────────────────
function startEdit(row, msgEl, editBtn, t) {
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-inline';
  input.value = t.message || '';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'btn-icon btn-icon-save';
  saveBtn.textContent = '✓';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-icon';
  cancelBtn.textContent = '✕';

  row.replaceChild(input, msgEl);
  editBtn.replaceWith(saveBtn, cancelBtn);
  input.focus();

  saveBtn.addEventListener('click', function () {
    saveMessage(t.index, input.value.trim());
  });
  cancelBtn.addEventListener('click', loadTargets);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  saveMessage(t.index, input.value.trim());
    if (e.key === 'Escape') loadTargets();
  });
}

async function saveMessage(index, message) {
  try {
    var res = await fetch('/api/update-target', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ index: index, message: message }),
    });
    if (res.status === 401) { signOut(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await loadTargets();
    showStatus('targets-status', 'success', 'Message updated.');
  } catch (err) {
    showStatus('targets-status', 'error', 'Failed to save: ' + err.message);
  }
}

// ── Delete target ────────────────────────────────────────────────────────────
async function deleteTarget(index) {
  if (!confirm('Delete target ' + index + '?\n\nThis removes its image and video from R2. You will need to Compile & Upload afterwards.')) return;

  try {
    var res = await fetch('/api/delete-target?index=' + index, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.status === 401) { signOut(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentTargets = await res.json();
    renderTargets(currentTargets);
    showStatus('targets-status', 'success', 'Target deleted. Compile & Upload to apply changes to the AR app.');
  } catch (err) {
    showStatus('targets-status', 'error', 'Failed to delete: ' + err.message);
  }
}

// ── Video preview ────────────────────────────────────────────────────────────
document.getElementById('video-input').addEventListener('change', function () {
  var preview = document.getElementById('video-preview');
  var file = this.files[0];
  if (!file) { preview.style.display = 'none'; return; }
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
});

// ── Add target ───────────────────────────────────────────────────────────────
document.getElementById('add-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var btn = document.getElementById('add-btn');
  var imageFile = document.getElementById('image-input').files[0];
  var videoFile = document.getElementById('video-input').files[0];
  var message   = document.getElementById('message-input').value.trim();

  if (!imageFile || !videoFile) {
    showStatus('add-status', 'error', 'Please select both an image and a video file.');
    return;
  }

  btn.disabled = true;
  hideStatus('add-status');
  showStatus('add-status', 'info', 'Uploading image…');

  try {
    // Step 1: upload image + message, get assigned index back
    var imgForm = new FormData();
    imgForm.append('image', imageFile);
    imgForm.append('message', message);

    var imgRes = await fetch('/api/upload-image', {
      method: 'POST',
      headers: authHeaders(),
      body: imgForm,
    });

    if (imgRes.status === 401) {
      signOut();
      throw new Error('Token rejected — please sign in again.');
    }
    if (!imgRes.ok) throw new Error('Image upload failed: HTTP ' + imgRes.status);

    var { index } = await imgRes.json();

    // Step 2: upload video using the assigned index
    showStatus('add-status', 'info', 'Uploading video…');

    var vidForm = new FormData();
    vidForm.append('video', videoFile);
    vidForm.append('index', String(index));

    var vidRes = await fetch('/api/upload-video', {
      method: 'POST',
      headers: authHeaders(),
      body: vidForm,
    });

    if (!vidRes.ok) throw new Error('Video upload failed: HTTP ' + vidRes.status);

    showStatus('add-status', 'success', 'Target ' + index + ' added. Remember to Compile & Upload below.');
    var preview = document.getElementById('video-preview');
    URL.revokeObjectURL(preview.src);
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('add-form').reset();
    loadTargets();

  } catch (err) {
    showStatus('add-status', 'error', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── Canvas helpers (mirrored from app.js) ────────────────────────────────────
function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,      y + h, x,      y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,      y,     x + r,  y,          r);
  ctx.closePath();
}

function drawQROnCanvas(ctx, centerX, topY, url) {
  var qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  var count  = qr.getModuleCount();
  var QUIET  = 4;
  var cellPx = 8;
  var totalPx = (count + QUIET * 2) * cellPx;
  var x = centerX - totalPx / 2;
  var bgPad = 14;

  ctx.fillStyle = '#fff';
  fillRoundRect(ctx, x - bgPad, topY - bgPad, totalPx + bgPad * 2, totalPx + bgPad * 2, 16);
  ctx.fill();

  ctx.fillStyle = '#000';
  for (var r = 0; r < count; r++) {
    for (var c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(x + (c + QUIET) * cellPx, topY + (r + QUIET) * cellPx, cellPx, cellPx);
      }
    }
  }
  return totalPx + bgPad * 2;
}

// ── Generate overlay PNG (story card layout without video, transparent video zone) ──
function generateOverlayPNG(message, fontFamily) {
  var W = 1080, H = 1920, PAD = 72;
  var FONT = (fontFamily || 'system-ui') + ', system-ui, -apple-system, Helvetica Neue, Arial, sans-serif';

  var canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle teal glow
  var glow = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.65);
  glow.addColorStop(0, 'rgba(42,123,155,0.09)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header: cARita wordmark
  var titleY = 150;
  ctx.font = 'bold 108px ' + FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign    = 'left';

  var cW   = ctx.measureText('c').width;
  var arW  = ctx.measureText('AR').width;
  var itaW = ctx.measureText('ita').width;
  var startX = (W - cW - arW - itaW) / 2;

  ctx.fillStyle = '#fff';
  ctx.fillText('c', startX, titleY);

  var arGrad = ctx.createLinearGradient(startX + cW, 0, startX + cW + arW, 0);
  arGrad.addColorStop(0,   '#2A7B9B');
  arGrad.addColorStop(0.5, '#57C785');
  arGrad.addColorStop(1,   '#EDDD53');
  ctx.fillStyle = arGrad;
  ctx.fillText('AR', startX + cW, titleY);

  ctx.fillStyle = '#fff';
  ctx.fillText('ita', startX + cW + arW, titleY);

  // Tagline
  ctx.textAlign  = 'center';
  ctx.font       = '400 34px ' + FONT;
  ctx.fillStyle  = 'rgba(255,255,255,0.35)';
  ctx.fillText('Still on the outside. Alive on the inside.', W / 2, titleY + 56);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, titleY + 88);
  ctx.lineTo(W - PAD, titleY + 88);
  ctx.stroke();

  // Punch transparent hole for video zone (FFmpeg fills this with the actual video)
  var FRAME_TOP   = titleY + 120;  // 270
  var FRAME_MAX_W = W - PAD * 2;   // 936
  var FRAME_MAX_H = 950;
  ctx.clearRect(PAD, FRAME_TOP, FRAME_MAX_W, FRAME_MAX_H);

  // Info section
  var INFO_TOP = FRAME_TOP + FRAME_MAX_H + 50;
  ctx.textAlign = 'center';

  if (message) {
    var comma    = message.indexOf(',');
    var location = comma !== -1 ? message.slice(0, comma).trim() : message;
    var date     = comma !== -1 ? message.slice(comma + 1).trim() : '';

    ctx.font      = 'bold 54px ' + FONT;
    ctx.fillStyle = '#fff';
    ctx.fillText(location, W / 2, INFO_TOP);

    if (date) {
      ctx.font      = '400 36px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(date, W / 2, INFO_TOP + 60);
    }
  }

  // Divider
  var divY = INFO_TOP + (message ? 106 : 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD * 2, divY);
  ctx.lineTo(W - PAD * 2, divY);
  ctx.stroke();

  // "Scan a postcard" label
  ctx.font      = '400 30px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('Scan a postcard', W / 2, divY + 46);

  // QR code
  var QR_TOP    = divY + 68;
  var qrPainted = 0;
  if (typeof qrcode !== 'undefined') {
    qrPainted = drawQROnCanvas(ctx, W / 2, QR_TOP, 'https://carita.pages.dev');
  }

  // URL beneath QR
  ctx.font      = '400 28px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText('carita.pages.dev', W / 2, QR_TOP + qrPainted + 32);

  // Footer
  ctx.font      = '400 26px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillText('Built by Fakhrul Fauzi · Beta', W / 2, H - 60);

  return canvas;
}

// ── Generate story video via FFmpeg.wasm (admin desktop Chrome only) ─────────
async function generateStoryVideo(target, storyBtn, progressEl) {
  storyBtn.disabled = true;
  storyBtn.textContent = 'Loading…';
  progressEl.style.display = 'block';

  var fill  = progressEl.querySelector('.sv-fill');
  var label = progressEl.querySelector('.sv-label');
  label.style.color = '';

  function setProgress(pct, msg) {
    fill.style.width  = pct + '%';
    label.textContent = msg;
  }

  try {
    var CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

    setProgress(2, 'Downloading FFmpeg core JS (1/2)…');
    var coreURL = await toBlobURL(CORE_BASE + '/ffmpeg-core.js', 'text/javascript');

    setProgress(8, 'Downloading FFmpeg WASM (~12 MB, please wait…)');
    var wasmURL = await toBlobURL(CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm');

    setProgress(18, 'Initializing FFmpeg…');
    var ffmpeg = new FFmpeg();
    ffmpeg.on('progress', function (e) {
      var p   = Math.min(e.progress, 1);
      var pct = 22 + Math.round(p * 68);
      storyBtn.textContent = 'Encoding ' + Math.round(p * 100) + '%…';
      setProgress(pct, 'Encoding… ' + Math.round(p * 100) + '%');
    });
    await ffmpeg.load({
      classWorkerURL: location.origin + '/ffmpeg/worker.js',
      coreURL: coreURL,
      wasmURL: wasmURL,
    });

    setProgress(20, 'Fetching video…');
    storyBtn.textContent = 'Fetching…';
    await ffmpeg.writeFile('input.mp4', await fetchFile('/r2/targets/' + target.index + '/video.mp4'));

    setProgress(21, 'Loading fonts…');
    var fontFamily = 'system-ui';
    try {
      var jsrBase = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files';
      var f400 = new FontFace('Inter', 'url(' + jsrBase + '/inter-latin-400-normal.woff2)', { weight: '400' });
      var f700 = new FontFace('Inter', 'url(' + jsrBase + '/inter-latin-700-normal.woff2)', { weight: '700' });
      await Promise.all([f400.load(), f700.load()]);
      document.fonts.add(f400);
      document.fonts.add(f700);
      fontFamily = 'Inter';
    } catch (_) { /* fall back to system-ui if font load fails */ }

    setProgress(21, 'Generating overlay…');
    storyBtn.textContent = 'Compositing…';
    var overlayCanvas = generateOverlayPNG(target.message, fontFamily);
    var overlayBlob = await new Promise(function (res, rej) {
      overlayCanvas.toBlob(function (b) { b ? res(b) : rej(new Error('Canvas export failed')); }, 'image/png');
    });
    await ffmpeg.writeFile('overlay.png', await fetchFile(overlayBlob));

    setProgress(22, 'Running FFmpeg…');
    // Use pad filter only — avoids the `color` source filter which may be absent
    // in some FFmpeg.wasm builds.
    var exitCode = await ffmpeg.exec([
      '-i', 'input.mp4',
      '-i', 'overlay.png',
      '-filter_complex',
      '[0:v]scale=936:950:force_original_aspect_ratio=decrease,' +
      'pad=936:950:(ow-iw)/2:(oh-ih)/2:black,' +
      'pad=1080:1920:72:270:black[bgvid];' +
      '[bgvid][1:v]overlay=0:0:format=auto[out]',
      '-map', '[out]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      'output.mp4',
    ]);
    if (exitCode !== 0) throw new Error('FFmpeg encoding failed (exit code ' + exitCode + ')');

    setProgress(92, 'Uploading…');
    storyBtn.textContent = 'Uploading…';
    var data = await ffmpeg.readFile('output.mp4');
    // Use data directly (not data.buffer) to avoid sending buffer padding bytes
    var blob = new Blob([data], { type: 'video/mp4' });
    setProgress(93, 'Uploading… (' + (blob.size / 1024 / 1024).toFixed(1) + ' MB)');

    var res = await fetch('/api/upload-story-video?index=' + target.index, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'video/mp4' }, authHeaders()),
      body: blob,
    });

    if (res.status === 401) { signOut(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Upload failed: HTTP ' + res.status);

    setProgress(100, 'Done!');
    markStoryDone(storyBtn);

  } catch (err) {
    setProgress(0, 'Error: ' + err.message);
    label.style.color = '#ff8080';
    storyBtn.textContent = '🎬 Story';
    storyBtn.disabled = false;
  }
}

function markStoryDone(btn) {
  btn.textContent = '✓ Story';
  btn.disabled = false;
  btn.style.color = 'rgba(80,200,120,0.8)';
  btn.style.borderColor = 'rgba(80,200,120,0.3)';
  btn.style.cursor = 'pointer';
  btn.title = 'Story video ready — click to regenerate';
}

// ── Compile & upload targets.mind ────────────────────────────────────────────
async function compile() {
  if (!currentTargets.length) {
    showStatus('compile-status', 'error', 'No targets to compile.');
    return;
  }

  var btn = document.getElementById('compile-btn');
  btn.disabled = true;
  hideStatus('compile-status');

  var progressWrap  = document.getElementById('progress-wrap');
  var progressFill  = document.getElementById('progress-bar-fill');
  var progressLabel = document.getElementById('progress-label');

  function setProgress(pct, label) {
    progressWrap.style.display = 'block';
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  }

  try {
    // Step 1: fetch all target images and decode to HTMLImageElement
    setProgress(0, 'Fetching target images…');
    var imageElements = [];

    for (var i = 0; i < currentTargets.length; i++) {
      var t = currentTargets[i];
      var img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = function () { reject(new Error('Could not load image for target ' + t.index)); };
        var imgPath = t.imageKey || ('targets/' + t.index + '/image.jpg');
        img.src = '/r2/' + imgPath + '?' + Date.now(); // cache-bust
      });
      imageElements.push(img);
      setProgress(Math.round(((i + 1) / currentTargets.length) * 20), 'Loaded ' + (i + 1) + ' of ' + currentTargets.length + ' images…');
    }

    // Step 2: dynamically import MindAR (ES module — relative chunks resolved by jsDelivr)
    setProgress(20, 'Loading compiler…');
    var mindar = await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image.prod.js');
    var Compiler = mindar.Compiler;
    if (!Compiler) throw new Error('Could not load MindAR Compiler.');

    var compiler = new Compiler();

    setProgress(25, 'Compiling (this may take a minute)…');
    await compiler.compileImageTargets(imageElements, function (progress) {
      // progress is 0–100
      var pct = 25 + Math.round(progress * 0.7);
      setProgress(pct, 'Compiling… ' + Math.round(progress) + '%');
    });

    // Step 3: export binary and upload to R2
    setProgress(96, 'Exporting…');
    var buffer = await compiler.exportData();

    setProgress(98, 'Uploading targets.mind…');
    var res = await fetch('/api/mind', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, authHeaders()),
      body: buffer,
    });

    if (res.status === 401) {
      signOut();
      throw new Error('Token rejected — please sign in again.');
    }
    if (!res.ok) throw new Error('Upload failed: HTTP ' + res.status);

    setProgress(100, 'Done!');
    showStatus('compile-status', 'success', 'targets.mind updated in R2. AR app will use the new targets immediately.');

  } catch (err) {
    showStatus('compile-status', 'error', err.message);
    progressWrap.style.display = 'none';
  } finally {
    btn.disabled = false;
  }
}

// ── Expose functions called from HTML onclick attributes (module scope) ───────
window.signOut = signOut;
window.compile = compile;
