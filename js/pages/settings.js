/* settings.js — toggle state + theme selection */

(function () {
  const TOGGLES = [
    { id: 'profile-two-factor-auth', key: 'twoFactor'      },
    { id: 'public-profile-switch',   key: 'publicProfile'  },
    { id: 'notification-switch',     key: 'notifications'  },
  ];

  const saveBtn   = document.querySelector('[data-settings-save]');
  const cancelBtn = document.querySelector('[data-settings-cancel]');
  const themeBtns = document.querySelectorAll('[data-theme]');

  // snapshot toggle states on load so Cancel can revert
  const initial = {};
  TOGGLES.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    initial[key] = el.checked;
  });

  let currentTheme = null;

  // theme card click
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => applyThemeActive(b, false));
      applyThemeActive(btn, true);
      currentTheme = btn.dataset.theme;
    });
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

      themeBtns.forEach(b => applyThemeActive(b, false));
      currentTheme = null;
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  function applyThemeActive(btn, active) {
    if (active) {
      btn.classList.add('border-2');
      btn.style.borderColor = '#0F7A45';
    } else {
      btn.classList.remove('border-2');
      btn.style.borderColor = '';
    }
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
