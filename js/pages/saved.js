/* saved.js — remove items + empty state */

(function () {
  function init() {
    document.querySelectorAll('[data-remove-btn]').forEach(btn => {
      // avoid double-binding if init is ever called again
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';

      btn.addEventListener('click', () => removeCard(btn));
    });
  }

  function removeCard(btn) {
    const card = btn.closest('[data-saved-card]');
    if (!card) return;

    card.style.transition = 'opacity .22s ease, transform .22s ease';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(.95)';

    setTimeout(() => {
      card.remove();
      checkEmpty();
    }, 230);
  }

  function checkEmpty() {
    const remaining = document.querySelectorAll('[data-saved-card]').length;
    if (remaining > 0) return;

    // remove all section wrappers
    document.querySelectorAll('[data-saved-section]').forEach(s => s.remove());

    const main      = document.querySelector('main');
    const footer    = document.getElementById('footer-slot');
    const emptyState = buildEmptyState();

    main.insertBefore(emptyState, footer);
  }

  function buildEmptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'd-flex flex-column align-items-center justify-content-center text-center py-5';
    wrap.innerHTML = `
      <div class="d-inline-flex align-items-center justify-content-center rounded-circle bg-white shadow-sm mb-4" style="width:80px;height:80px;">
        <img src="/assets/icons/favorite.svg" alt="" width="32" height="32" style="opacity:.35;" />
      </div>
      <h2 class="h5 fw-bold mb-2">Your wishlist is empty</h2>
      <p class="text-muted small mb-4" style="max-width:22rem;">
        Start exploring destinations and tap the heart to save the ones you love.
      </p>
      <a href="/index.html" class="btn green-btn px-4 py-2">Explore Destinations</a>
    `;
    return wrap;
  }

  init();
})();
