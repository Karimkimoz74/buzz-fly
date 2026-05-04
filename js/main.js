/* Buzz Fly — main.js */

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  highlightActiveNavLink();
  highlightActiveSidebarLink();
});

async function loadPartials() {
  const parts = [
    ["navbar-slot",  "/partials/navbar.html"],
    ["sidebar-slot", "/partials/sidebar.html"], /* authored by rawan */
    ["footer-slot",  "/partials/footer.html"],
  ];
  for (const [slot, url] of parts) {
    const el = document.getElementById(slot);
    if (!el) continue;
    const res = await fetch(url);
    el.innerHTML = await res.text();
  }
}

/* Highlight the current page's nav link in the top navbar. */
function highlightActiveNavLink() {
  let path = window.location.pathname;
  if (path === "/") {
    path = "/index.html";
  }
  document.querySelectorAll(".buzz-nav-link").forEach(link => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

/* authored by rawan */
/* Highlight the current page's link in the profile sidebar. */
function highlightActiveSidebarLink() {
  const path = window.location.pathname;
  document.querySelectorAll(".buzz-sidebar-link").forEach(link => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    }
  });
}
