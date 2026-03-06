// ── Torch state ───────────────────────────────────────────────
var torchActive = false;
var torchTrack  = null;

function detectTorchSupport() {
  var videos = document.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) {
    if (videos[i].srcObject) {
      var track = videos[i].srcObject.getVideoTracks()[0];
      if (!track) continue;
      track.applyConstraints({ advanced: [{ torch: false }] })
        .then(function () { torchTrack = track; document.getElementById('torch-btn').style.display = 'block'; })
        .catch(function () { /* not supported, button stays hidden */ });
      return;
    }
  }
}

function toggleTorch() {
  if (!torchTrack) return;
  torchActive = !torchActive;
  torchTrack.applyConstraints({ advanced: [{ torch: torchActive }] })
    .then(function () { document.getElementById('torch-btn').classList.toggle('torch-on', torchActive); })
    .catch(function () { document.getElementById('torch-btn').style.display = 'none'; torchTrack = null; });
}

// ── Error display ─────────────────────────────────────────────
function showError(msg) {
  var el = document.getElementById('error-overlay');
  el.style.display = 'block';
  el.textContent += msg + '\n';
}

window.onerror = function (msg, src, line) {
  showError(msg + ' (' + src + ':' + line + ')');
};

window.addEventListener('unhandledrejection', function (e) {
  showError('Promise rejection: ' + e.reason);
});

// ── Splash → scan transition ──────────────────────────────────
function startExperience() {
  var splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  setTimeout(function () { splash.style.display = 'none'; }, 500);
  document.getElementById('scan-ui').style.display = 'flex';

  var sceneEl = document.querySelector('a-scene');
  if (!sceneEl.hasLoaded) {
    var arLoader = document.getElementById('ar-loader');
    arLoader.style.display = 'flex';
    sceneEl.addEventListener('loaded', function () {
      arLoader.style.display = 'none';
      detectTorchSupport();
    }, { once: true });
  } else {
    detectTorchSupport();
  }
}

// ── Scan → splash (back button) ───────────────────────────────
function goHome() {
  if (torchTrack && torchActive) {
    torchTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(function(){});
  }
  torchActive = false; torchTrack = null;
  document.getElementById('torch-btn').style.display = 'none';
  document.getElementById('torch-btn').classList.remove('torch-on');

  document.querySelectorAll('a-assets video').forEach(function (v) { v.pause(); });

  var scanUI = document.getElementById('scan-ui');
  scanUI.classList.remove('hidden');
  scanUI.style.display = 'none';
  document.getElementById('download-btn').style.display = 'none';
  document.getElementById('share-btn').style.display = 'none';
  currentVideo   = null;
  currentMessage = '';
  currentBlob    = null;

  var splash = document.getElementById('splash');
  splash.classList.remove('fade-out');
  splash.style.display = 'flex';
}

// ── Story card ────────────────────────────────────────────────
var currentVideo   = null;
var currentMessage = '';
var currentBlob    = null;  // pre-generated PNG blob for instant sharing

function prepareStoryBlob() {
  currentBlob = null;
  if (!currentVideo) return;
  try {
    var card = generateStoryCard(currentVideo, currentMessage);
    card.toBlob(function (b) { if (b) currentBlob = b; }, 'image/png');
  } catch (e) { showError('[prep] ' + e.name + ': ' + e.message); }
}

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
  var count  = qr.moduleCount();
  var QUIET  = 4;
  var cellPx = 8;
  var totalPx = (count + QUIET * 2) * cellPx;
  var x = centerX - totalPx / 2;
  var bgPad = 14;

  // Rounded white background
  ctx.fillStyle = '#fff';
  fillRoundRect(ctx, x - bgPad, topY - bgPad, totalPx + bgPad * 2, totalPx + bgPad * 2, 16);
  ctx.fill();

  // Dark modules
  ctx.fillStyle = '#000';
  for (var r = 0; r < count; r++) {
    for (var c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(x + (c + QUIET) * cellPx, topY + (r + QUIET) * cellPx, cellPx, cellPx);
      }
    }
  }

  return totalPx + bgPad * 2; // painted height including background padding
}

function generateStoryCard(videoEl, message) {
  var W = 1080, H = 1920, PAD = 72;
  var FONT = 'system-ui, -apple-system, Helvetica Neue, Arial, sans-serif';

  var canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');

  // ── Background ─────────────────────────────────────────────
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle teal glow behind the frame area
  var glow = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.65);
  glow.addColorStop(0, 'rgba(42,123,155,0.09)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Header: cARita wordmark ─────────────────────────────────
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

  // ── Video frame ─────────────────────────────────────────────
  var FRAME_TOP   = titleY + 120;
  var FRAME_MAX_W = W - PAD * 2;  // 936 px
  var FRAME_MAX_H = 950;

  var vw = videoEl.videoWidth  || 16;
  var vh = videoEl.videoHeight || 9;
  var scale = Math.min(FRAME_MAX_W / vw, FRAME_MAX_H / vh);
  var fw = Math.round(vw * scale);
  var fh = Math.round(vh * scale);
  var fx = (W - fw) / 2;
  var fy = FRAME_TOP + (FRAME_MAX_H - fh) / 2;
  var R  = 28;

  // Clip to rounded rect and draw video frame
  ctx.save();
  fillRoundRect(ctx, fx, fy, fw, fh, R);
  ctx.clip();
  ctx.drawImage(videoEl, fx, fy, fw, fh);
  ctx.restore();

  // Subtle frame border
  ctx.save();
  fillRoundRect(ctx, fx, fy, fw, fh, R);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.restore();

  // ── Info section ────────────────────────────────────────────
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

  // "Scan this postcard" label
  ctx.font      = '400 30px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('Scan this postcard', W / 2, divY + 46);

  // QR code
  var QR_TOP     = divY + 68;
  var qrPainted  = 0;
  if (typeof qrcode !== 'undefined') {
    qrPainted = drawQROnCanvas(ctx, W / 2, QR_TOP, 'https://carita.pages.dev');
  }

  // URL beneath QR
  ctx.font      = '400 28px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText('carita.pages.dev', W / 2, QR_TOP + qrPainted + 32);

  // ── Footer ──────────────────────────────────────────────────
  ctx.font      = '400 26px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillText('Built by Fakhrul Fauzi · Beta', W / 2, H - 60);

  return canvas;
}

async function shareStory() {
  var btn = document.getElementById('share-btn');
  if (btn.disabled) return;
  btn.disabled    = true;
  btn.textContent = 'Generating…';

  try {
    // Use pre-generated blob if available (avoids Safari user-gesture timeout).
    // If not ready yet, generate now (desktop / slow devices).
    var blob = currentBlob;
    if (!blob) {
      var card = generateStoryCard(currentVideo, currentMessage);
      blob = await new Promise(function (res, rej) {
        card.toBlob(function (b) {
          b ? res(b) : rej(new Error('Canvas export failed'));
        }, 'image/png');
      });
    }

    var file = new File([blob], 'carita-story.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'cARita' });
    } else {
      // Fallback: open image in new tab (iOS-safe; user can long-press to save)
      var url = URL.createObjectURL(blob);
      if (!window.open(url, '_blank')) {
        // If popup blocked, anchor download
        var a = document.createElement('a');
        a.href = url; a.download = 'carita-story.png'; a.click();
      }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError('[share] ' + err.name + ': ' + err.message);
      btn.textContent = 'Failed — try again';
      setTimeout(function () { btn.textContent = 'Share Story'; }, 2500);
    }
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'Generating…') btn.textContent = 'Share Story';
  }
}

// ── AR target event handlers ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var scanUI      = document.getElementById('scan-ui');
  var downloadBtn = document.getElementById('download-btn');
  var shareBtn    = document.getElementById('share-btn');

  document.querySelectorAll('[mindar-image-target]').forEach(function (target) {
    var video    = document.querySelector(target.dataset.video);
    var filename = target.dataset.download;
    var message  = target.dataset.message || '';

    var textEl = target.querySelector('a-text');
    if (textEl && message) textEl.setAttribute('value', message);

    target.addEventListener('targetFound', function () {
      navigator.vibrate && navigator.vibrate(60);
      scanUI.classList.add('hidden');

      // Download button
      downloadBtn.href = filename;
      downloadBtn.setAttribute('download', filename.split('/').pop());
      downloadBtn.style.animation = 'none';
      downloadBtn.offsetHeight;
      downloadBtn.style.animation = '';
      downloadBtn.style.display   = 'block';

      // Share Story button
      currentVideo   = video;
      currentMessage = message;
      currentBlob    = null;
      shareBtn.style.animation = 'none';
      shareBtn.offsetHeight;
      shareBtn.style.animation = '';
      shareBtn.style.display   = 'block';

      video.play();
      // Pre-generate story card blob so share is instant when user taps
      setTimeout(prepareStoryBlob, 600);
    });

    target.addEventListener('targetLost', function () {
      scanUI.classList.remove('hidden');
      downloadBtn.style.display = 'none';
      shareBtn.style.display    = 'none';
      currentVideo   = null;
      currentMessage = '';
      currentBlob    = null;
      video.pause();
    });
  });
});
