/* Buzz Fly — main.js */

/* edited by rawan — restore saved theme immediately */
(function () {
  var t = localStorage.getItem('buzzfly.theme');
  if (t) document.documentElement.setAttribute('data-bs-theme', t);
})();

/* edited by rawan — if profile is known incomplete, block all pages
   except auth pages and the profile page itself                     */
(function () {
  if (localStorage.getItem('buzzfly.profileIncomplete') !== '1') return;
  var path = window.location.pathname;
  var exempt = path.includes('/pages/auth/') ||
               path.includes('/pages/profile/profile.html');
  if (exempt) return;
  window.location.href = '/pages/profile/profile.html?onboarding=1&next=' +
    encodeURIComponent(path + window.location.search);
})();

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  highlightActiveNavLink();
  highlightActiveSidebarLink();
  initSidebarMobile();
  initNavbarAuth();
});

/* Auth-aware navbar runs from a module, so we dynamic-import it from
   this classic script after the partials are in the DOM. Triggered by
   any auth-tagged element: navbar dropdowns ([data-auth-only]),
   sidebar/header avatars ([data-auth-avatar]), or the sidebar/navbar
   sign-out button ([data-auth-signout]). */
function initNavbarAuth() {
  const needed = document.querySelector(
    "[data-auth-only], [data-auth-avatar], [data-auth-signout]"
  );
  if (!needed) return;
  import("/js/firebase/navbar-auth.js")
    .then((mod) => mod.initAuthAwareNavbar())
    .catch((err) => console.error("[main] navbar-auth load failed:", err));
}

async function loadPartials() {
  const parts = [
    ["navbar-slot",  "/partials/navbar.html"],
    ["sidebar-slot", "/partials/sidebar.html"],
    ["footer-slot",  "/partials/footer.html"],
  ];
  for (const [slot, url] of parts) {
    const el = document.getElementById(slot);
    if (!el) continue;
    // Add a timestamp query param so the browser doesn't serve a cached copy.
    const res  = await fetch(url + "?v=" + Date.now());
    let html   = await res.text();
    html = primeAvatarInPartial(html);
    el.innerHTML = html;
  }
}

/* Pre-paint every [data-auth-avatar] <img> in a partial from
   localStorage so the user's chosen photo shows the instant the partial
   is injected — no flash of the default user.svg while Firebase
   modules load.

   Imgs marked with data-auth-avatar-fill (the navbar icon button) also
   get full-bleed styles so the photo covers the whole 40px circle.
   Other tagged imgs (the sidebar avatar, already sized via its own
   class/style) only get the src swapped, leaving their layout alone.

   Attribute order in the source HTML is not assumed — we match the
   whole <img …> tag and rewrite src / style regardless of position. */
function primeAvatarInPartial(html) {
  let avatar = null;
  try { avatar = localStorage.getItem("buzzfly.avatar"); } catch (e) {}
  if (!avatar) return html;

  let src = avatar;
  if (!src.startsWith("/") && !src.startsWith("http")) {
    src = "/" + src;
  }
  const fillStyle = "width:100%;height:100%;object-fit:cover;border-radius:50%";

  return html.replace(/<img\s[^>]*data-auth-avatar[^>]*>/g, function (tag) {
    let next = tag;

    // Swap (or insert) src
    if (/\ssrc="[^"]*"/.test(next)) {
      next = next.replace(/\ssrc="[^"]*"/, ` src="${src}"`);
    } else {
      next = next.replace(/^<img/, `<img src="${src}"`);
    }

    // Inject full-bleed style only when the element opts in
    if (/data-auth-avatar-fill/.test(next)) {
      if (/\sstyle="[^"]*"/.test(next)) {
        next = next.replace(/\sstyle="[^"]*"/, ` style="${fillStyle}"`);
      } else {
        next = next.replace(/^<img/, `<img style="${fillStyle}"`);
      }
    }

    return next;
  });
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
