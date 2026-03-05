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
}

// ── Scan → splash (back button) ───────────────────────────────
function goHome() {
  // Pause all videos
  document.querySelectorAll('a-assets video').forEach(function (v) { v.pause(); });
  // Reset scan UI and download button
  var scanUI = document.getElementById('scan-ui');
  scanUI.classList.remove('hidden');
  scanUI.style.display = 'none';
  document.getElementById('download-btn').style.display = 'none';
  // Restore splash
  var splash = document.getElementById('splash');
  splash.classList.remove('fade-out');
  splash.style.display = 'flex';
}

// ── AR target event handlers ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var scanUI      = document.getElementById('scan-ui');
  var downloadBtn = document.getElementById('download-btn');

  // Wire up every target entity generically via its data attributes
  document.querySelectorAll('[mindar-image-target]').forEach(function (target) {
    var video    = document.querySelector(target.dataset.video);
    var filename = target.dataset.download;

    target.addEventListener('targetFound', function () {
      scanUI.classList.add('hidden');
      downloadBtn.href = './' + filename;
      downloadBtn.setAttribute('download', filename);
      // Reset animation so the spring replays on every detection
      downloadBtn.style.animation = 'none';
      downloadBtn.offsetHeight;   // force reflow
      downloadBtn.style.animation = '';
      downloadBtn.style.display = 'block';
      video.play();
    });

    target.addEventListener('targetLost', function () {
      scanUI.classList.remove('hidden');
      downloadBtn.style.display = 'none';
      video.pause();
    });
  });
});
