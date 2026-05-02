/* =====================================================
   Buzz Fly — home.js
   Behaviors specific to the home page (index.html).
   Tab switching is handled natively by Bootstrap
   (data-bs-toggle="pill" on the search-card tabs).
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initSearchButtons();
});

/* Search buttons (Flights / Hotels tabs).
   For now: each button has data-search-target="..." that points to
   the page to open on click. Later, this will read the form fields,
   validate them, and either redirect with query params or fetch
   results from the backend. */
function initSearchButtons() {
  const buttons = document.querySelectorAll("[data-search-target]");

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const target = btn.dataset.searchTarget;
      if (target) {
        window.location.href = target;
      }
    });
  });
}
