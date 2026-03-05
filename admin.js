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
  if (!targets.length) {
    container.innerHTML = '<p class="empty-state">No targets yet. Add one below.</p>';
    return;
  }

  container.innerHTML = targets.map(function (t) {
    return (
      '<div class="target-row">' +
        '<span class="target-index">' + t.index + '</span>' +
        '<img class="target-thumb" src="/r2/targets/' + t.index + '/image.jpg" alt="" onerror="this.style.opacity=0.2" />' +
        '<span class="target-message">' + (t.message || '(no message)') + '</span>' +
      '</div>'
    );
  }).join('');
}

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
    document.getElementById('add-form').reset();
    loadTargets();

  } catch (err) {
    showStatus('add-status', 'error', err.message);
  } finally {
    btn.disabled = false;
  }
});

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
        img.src = '/r2/targets/' + t.index + '/image.jpg?' + Date.now(); // cache-bust
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
