/* profile.js — edit mode toggle + avatar preview */

(function () {
  const editBtn      = document.querySelector('[data-profile-edit-btn]');
  const saveBtn      = document.querySelector('[data-profile-save-btn]');
  const discardBtn   = document.querySelector('[data-profile-discard-btn]');
  const actionsRow   = document.querySelector('[data-profile-actions]');
  const editingAlert = document.querySelector('[data-profile-editing-alert]');
  const form         = document.querySelector('[data-profile-form]');
  const avatarInput  = document.getElementById('avatar-upload');
  const avatarPreview = document.getElementById('avatar-preview');

  if (!editBtn || !form) return;

  const fields      = form.querySelectorAll('input, select');
  const nameInput   = form.querySelector('input[type="text"]');
  const displayName = document.querySelector('.border-bottom h2');
  let editing = false;

  // ── triggers ─────────────────────────────────────────────────────────────
  editBtn.addEventListener('click',    () => enterEditMode());
  if (saveBtn)    saveBtn.addEventListener('click',    () => saveChanges());
  if (discardBtn) discardBtn.addEventListener('click', () => discardChanges());

  // ── avatar: live preview on file pick ────────────────────────────────────
  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = ev => applyAvatar(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  function applyAvatar(src) {
    avatarPreview.src          = src;
    avatarPreview.style.filter = 'none';
    avatarPreview.style.width  = '100%';
    avatarPreview.style.height = '100%';
  }

  // ── edit mode ─────────────────────────────────────────────────────────────
  function enterEditMode() {
    editing = true;

    fields.forEach(el => {
      el.dataset.original = el.value;

      el.tagName === 'SELECT'
        ? el.removeAttribute('disabled')
        : el.removeAttribute('readonly');

      el.classList.add('border-success');
    });

    editBtn.classList.add('d-none');
    actionsRow?.classList.remove('d-none');
    editingAlert?.classList.remove('d-none');
  }

  // ── save ──────────────────────────────────────────────────────────────────
  function saveChanges() {
    if (!editing) return;
    editing = false;

    fields.forEach(el => {
      el.tagName === 'SELECT'
        ? el.setAttribute('disabled', '')
        : el.setAttribute('readonly', '');

      el.classList.remove('border-success');
    });

    if (displayName && nameInput && nameInput.value.trim()) {
      displayName.textContent = nameInput.value.trim();
    }

    editBtn.classList.remove('d-none');
    actionsRow?.classList.add('d-none');
    editingAlert?.classList.add('d-none');

    showToast('Profile updated successfully.', 'success');
  }

  // ── discard ───────────────────────────────────────────────────────────────
  function discardChanges() {
    editing = false;

    fields.forEach(el => {
      if (el.dataset.original !== undefined) {
        el.value = el.dataset.original;
      }

      el.tagName === 'SELECT'
        ? el.setAttribute('disabled', '')
        : el.setAttribute('readonly', '');

      el.classList.remove('border-success');
    });

    editBtn.classList.remove('d-none');
    actionsRow?.classList.add('d-none');
    editingAlert?.classList.add('d-none');
  }

  // ── toast helper ─────────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `position-fixed bottom-0 end-0 m-3 alert alert-${type} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
    t.style.zIndex = '9999';
    t.textContent  = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
})();
