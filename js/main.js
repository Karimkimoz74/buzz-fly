/* Buzz Fly — main.js */

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  highlightActiveNavLink();
  highlightActiveSidebarLink();
  initSidebarMobile();
});

async function loadPartials() {
  const parts = [
    ["navbar-slot",  "/partials/navbar.html"],
    ["sidebar-slot", "/partials/sidebar.html"],
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
  if (path === "/") path = "/index.html";
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
  document.querySelectorAll(".sidebar-nav-link").forEach(link => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    }
  });
}


/* authored by rawan */
/* Off-canvas sidebar behaviour on mobile (<992px). */
function initSidebarMobile() {
  const sidebar = document.getElementById("profile-sidebar");
  if (!sidebar) return;

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  document.body.appendChild(backdrop);

  // Hamburger button — inserted inline into the page header row so it never overlaps content
  const hamburger = document.createElement("button");
  hamburger.className = "sidebar-hamburger";
  hamburger.setAttribute("aria-label", "Open menu");
  hamburger.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

  // Prepend into the first flex header row of <main>; fall back to prepending to <main> itself
  const main = document.querySelector("main");
  const headerRow = main?.querySelector(":scope > .d-flex");
  if (headerRow) {
    headerRow.prepend(hamburger);
  } else if (main) {
    main.prepend(hamburger);
  }

  const openSidebar = () => {
    sidebar.classList.add("sidebar-open");
    backdrop.classList.add("show");
  };
  const closeSidebar = () => {
    sidebar.classList.remove("sidebar-open");
    backdrop.classList.remove("show");
  };

  hamburger.addEventListener("click", openSidebar);
  backdrop.addEventListener("click", closeSidebar);
  document.getElementById("sidebar-close-btn")?.addEventListener("click", closeSidebar);

  // Close when navigating via a sidebar link on mobile
  sidebar.querySelectorAll(".sidebar-nav-link").forEach(link => {
    link.addEventListener("click", () => { if (window.innerWidth < 992) closeSidebar(); });
  });
}
