/* settings.js — toggle state snapshot + save/cancel */

(function () {
  const TOGGLES = [
    { id: 'public-profile-switch', key: 'publicProfile' },
    { id: 'notification-switch',   key: 'notifications' },
  ];

  const saveBtn   = document.querySelector('[data-settings-save]');
  const cancelBtn = document.querySelector('[data-settings-cancel]');

  // snapshot toggle states on load so Cancel can revert
  const initial = {};
  TOGGLES.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    initial[key] = el.checked;
  });

  // save — just show toast (no persistence)
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      showToast('Settings saved.');
    });
  }

  // cancel — revert toggles to state on page load
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      TOGGLES.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = initial[key];
      });
    });
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'position-fixed bottom-0 end-0 m-3 alert alert-success shadow-sm rounded-4 py-2 px-3 small fw-semibold';
    t.style.zIndex = '9999';
    t.textContent  = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
})();