/* Buzz Fly — main.js */

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
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

/* Highlight the current page's nav link.
   Bootstrap navbar uses .nav-link.active for active state. */
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
