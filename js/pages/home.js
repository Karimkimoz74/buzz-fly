/* =====================================================
   Buzz Fly — home.js
   Behaviors specific to the home page (index.html)
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initSearchTabs();
});

/**
 * Flights / Hotels tab switching on the home-page search card.
 * Clicking a tab hides the other form and shows the matching one.
 */
function initSearchTabs() {
  const tabs  = document.querySelectorAll(".tab[data-form-target]");
  const forms = document.querySelectorAll(".search__fields[data-form]");
  if (!tabs.length || !forms.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.formTarget;

      // Toggle active class on tabs
      tabs.forEach((t) => t.classList.toggle("tab--active", t === tab));

      // Show only the form matching the clicked tab
      forms.forEach((form) => {
        form.hidden = form.dataset.form !== target;
      });
    });
  });
}
