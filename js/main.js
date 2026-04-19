/* Buzz Fly — main.js */

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  initDropdownMenus();
  highlightActiveNavLink();
});

async function loadPartials() {
  const parts = [
    ["navbar-slot", "/partials/navbar.html"],
    ["footer-slot", "/partials/footer.html"],
  ];
  for (const [slot, url] of parts) {
    const el = document.getElementById(slot);
    if (!el) continue;
    const res = await fetch(url);
    el.innerHTML = await res.text();
  }
}

function highlightActiveNavLink() {
  const path = window.location.pathname === "/" ? "/index.html" : window.location.pathname;
  document.querySelectorAll(".navbar__link").forEach(link => {
    link.classList.toggle("navbar__link--active", link.getAttribute("href") === path);
  });
}

function initDropdownMenus() {
  const menus = document.querySelectorAll("[data-menu]");
  if (!menus.length) return;

  menus.forEach(menu => {
    const trigger = menu.querySelector("[data-menu-trigger]");
    if (!trigger) return;
    trigger.addEventListener("click", e => {
      e.stopPropagation();
      menus.forEach(other => { if (other !== menu) other.classList.remove("is-open"); });
      menu.classList.toggle("is-open");
    });
  });

  document.addEventListener("click", e => {
    menus.forEach(menu => { if (!menu.contains(e.target)) menu.classList.remove("is-open"); });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") menus.forEach(m => m.classList.remove("is-open"));
  });
}
