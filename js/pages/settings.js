/* settings.js — edited by rawan
   Handles: dark mode toggle, notifications toggle,
            language/currency selects, display name,
            and delete account flow.                  */

(function () {

  // ── Dark mode ────────────────────────────────────────────────────────────
  const darkSwitch = document.getElementById('dark-mode-switch');

  if (darkSwitch) {
    // Reflect stored preference on page load
    darkSwitch.checked = localStorage.getItem('buzzfly.theme') === 'dark';

    darkSwitch.addEventListener('change', () => {
      const dark = darkSwitch.checked;
      const theme = dark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-bs-theme', theme);
      localStorage.setItem('buzzfly.theme', theme);
    });
  }

  // ── Notifications ────────────────────────────────────────────────────────
  const notifSwitch = document.getElementById('notification-switch');

  if (notifSwitch) {
    notifSwitch.checked = localStorage.getItem('buzzfly.notifications') !== 'false';

    notifSwitch.addEventListener('change', () => {
      localStorage.setItem('buzzfly.notifications', notifSwitch.checked ? 'true' : 'false');
      showToast(notifSwitch.checked ? 'Notifications enabled.' : 'Notifications disabled.');
    });
  }

  // ── Display name ─────────────────────────────────────────────────────────
  import('/js/firebase/auth.js').then(({ onAuthChange }) => {
    onAuthChange((user) => {
      const nameEl = document.getElementById('settings-display-name');
      if (!nameEl) return;
      if (user) {
        nameEl.textContent = user.displayName || user.email || 'Traveler';
      }
    });
  }).catch(() => { /* Firebase unavailable — keep placeholder */ });

  // ── Delete Account ───────────────────────────────────────────────────────
  const deleteBtn  = document.getElementById('delete-account-btn');
  const confirmBtn = document.getElementById('confirm-delete-btn');

  if (deleteBtn) {
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteBtn.addEventListener('click', () => modal.show());

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting…';

        try {
          const { deleteAccount } = await import('/js/firebase/auth.js');
          await deleteAccount();
          localStorage.clear();
          window.location.href = '/index.html';
        } catch (err) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Delete';

          if (err.code === 'buzz/active-bookings-exist') {
            showToast('Cancel your active bookings first, then try again.', true);
          } else if (err.code === 'buzz/reauth-required') {
            showToast('Please log out, sign in again, then delete.', true);
          } else {
            showToast('Something went wrong. Please try again.', true);
          }
        }
      });
    }
  }

  // ── Toast helper ─────────────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.className = [
      'position-fixed bottom-0 end-0 m-3 shadow-sm rounded-4 py-2 px-3 small fw-semibold',
      isError ? 'alert alert-danger' : 'alert alert-success',
    ].join(' ');
    t.style.zIndex = '9999';
    t.textContent  = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

})();
