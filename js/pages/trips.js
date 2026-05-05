/* trips.js — section filter (All / Upcoming / Past) */

(function () {
  const filterBtns = document.querySelectorAll('[data-trip-filter]');
  const sections   = document.querySelectorAll('[data-trip-section]');

  if (!filterBtns.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.tripFilter;

      // swap active state
      filterBtns.forEach(b => {
        b.classList.remove('green-btn');
        b.classList.add('btn-outline-secondary');
      });
      btn.classList.add('green-btn');
      btn.classList.remove('btn-outline-secondary');

      // show/hide sections
      sections.forEach(section => {
        const match = filter === 'all' || section.dataset.tripSection === filter;
        section.classList.toggle('d-none', !match);
      });
    });
  });
})();
