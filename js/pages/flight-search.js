/* flight-search.js — page-specific interactions only */

document.addEventListener('DOMContentLoaded', () => {

  // Swap cities
  document.getElementById('swapBtn')?.addEventListener('click', () => {
    const fromCity = document.getElementById('fromCity');
    const toCity   = document.getElementById('toCity');
    const fromCode = document.getElementById('fromCode');
    const toCode   = document.getElementById('toCode');
    [fromCity.textContent, toCity.textContent] = [toCity.textContent, fromCity.textContent];
    [fromCode.textContent, toCode.textContent] = [toCode.textContent, fromCode.textContent];
  });

  // Trip type tabs
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Filter pills toggle
  document.querySelectorAll('[data-pill]').forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('btn-outline-secondary') || pill.classList.toggle('green-btn'));
  });

  // Sort buttons
  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => {
        b.classList.remove('green-btn');
        b.classList.add('btn-light');
      });
      btn.classList.add('green-btn');
      btn.classList.remove('btn-light');
    });
  });

  // Price calendar
  document.querySelectorAll('[data-day]').forEach(day => {
    day.addEventListener('click', () => {
      document.querySelectorAll('[data-day]').forEach(d => d.classList.remove('bg-light-green'));
      day.classList.add('bg-light-green');
    });
  });

  // Departure time slots
  document.querySelectorAll('[data-time]').forEach(slot => {
    slot.addEventListener('click', () => {
      document.querySelectorAll('[data-time]').forEach(s => {
        s.classList.remove('light-green-btn');
        s.classList.add('btn-light');
      });
      slot.classList.add('light-green-btn');
      slot.classList.remove('btn-light');
    });
  });

  // Price range label
  document.getElementById('priceRange')?.addEventListener('input', function () {
    document.getElementById('priceVal').textContent = '$' + Number(this.value).toLocaleString();
  });

  // Duration range label
  document.getElementById('durationRange')?.addEventListener('input', function () {
    document.getElementById('durationVal').textContent = 'Up to ' + this.value + 'h';
  });

  // Select button
  document.querySelectorAll('.fs-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fs-select-btn').forEach(b => {
        b.textContent = 'Select';
        b.classList.remove('solid-green-btn');
        b.classList.add('green-btn');
      });
      btn.textContent = 'Selected ✓';
      btn.classList.remove('green-btn');
      btn.classList.add('solid-green-btn');
    });
  });

  // Load more
  document.getElementById('loadMoreBtn')?.addEventListener('click', function () {
    this.textContent = 'No more flights';
    this.disabled = true;
    this.classList.add('disabled');
  });

});
