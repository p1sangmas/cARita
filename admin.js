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

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-icon btn-icon-delete';
    delBtn.title = 'Delete target';
    delBtn.textContent = '×';

    row.appendChild(indexEl);
    row.appendChild(thumb);
    row.appendChild(msgEl);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
    container.appendChild(row);

    editBtn.addEventListener('click', function () { startEdit(row, msgEl, editBtn, t); });
    delBtn.addEventListener('click',  function () { deleteTarget(t.index); });
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
