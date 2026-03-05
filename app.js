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
  // download-btn stays hidden until a target is found

  // Feature 4 — loading indicator while MindAR initialises
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
  // Feature 8 — torch cleanup
  if (torchTrack && torchActive) {
    torchTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(function(){});
  }
  torchActive = false; torchTrack = null;
  document.getElementById('torch-btn').style.display = 'none';
  document.getElementById('torch-btn').classList.remove('torch-on');

  // Pause all videos
  document.querySelectorAll('a-assets video').forEach(function (v) { v.pause(); });
  // Reset scan UI and download button
  var scanUI = document.getElementById('scan-ui');
  scanUI.classList.remove('hidden');
  scanUI.style.display = 'none';
  document.getElementById('download-btn').style.display = 'none';
  document.getElementById('greeting').style.display = 'none';
  // Restore splash
  var splash = document.getElementById('splash');
  splash.classList.remove('fade-out');
  splash.style.display = 'flex';
}

// ── AR target event handlers ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var scanUI      = document.getElementById('scan-ui');
  var downloadBtn = document.getElementById('download-btn');
  var greeting    = document.getElementById('greeting');

  // Wire up every target entity generically via its data attributes
  document.querySelectorAll('[mindar-image-target]').forEach(function (target) {
    var video    = document.querySelector(target.dataset.video);
    var filename = target.dataset.download;
    var message  = target.dataset.message || '';

    target.addEventListener('targetFound', function () {
      navigator.vibrate && navigator.vibrate(60);
      scanUI.classList.add('hidden');
      // Greeting
      if (message) {
        greeting.textContent = message;
        greeting.style.animation = 'none';
        greeting.offsetHeight;   // force reflow
        greeting.style.animation = '';
        greeting.style.display = 'block';
      }
      // Download button
      downloadBtn.href = './' + filename;
      downloadBtn.setAttribute('download', filename);
      downloadBtn.style.animation = 'none';
      downloadBtn.offsetHeight;
      downloadBtn.style.animation = '';
      downloadBtn.style.display = 'block';
      video.play();
    });

    target.addEventListener('targetLost', function () {
      scanUI.classList.remove('hidden');
      greeting.style.display = 'none';
      downloadBtn.style.display = 'none';
      video.pause();
    });
  });
});
