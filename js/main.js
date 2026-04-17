/* =====================================================
   Buzz Fly — main.js
   Global navbar behaviors (dropdown menus)
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initDropdownMenus();
});

/**
 * Any element with [data-menu] that contains [data-menu-trigger] + [data-menu-panel]
 * becomes a toggleable dropdown. Works for account menu, notifications, etc.
 */
function initDropdownMenus() {
  const menus = document.querySelectorAll("[data-menu]");
  if (!menus.length) return;

  menus.forEach((menu) => {
    const trigger = menu.querySelector("[data-menu-trigger]");
    if (!trigger) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();

      // Close other open menus first — only one open at a time
      menus.forEach((other) => {
        if (other !== menu) {
          other.classList.remove("is-open");
          const otherTrigger = other.querySelector("[data-menu-trigger]");
          if (otherTrigger) otherTrigger.setAttribute("aria-expanded", "false");
        }
      });

      // Toggle this one
      const isOpen = menu.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", isOpen);
    });
  });

  // Click anywhere outside any menu → close all
  document.addEventListener("click", (e) => {
    menus.forEach((menu) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove("is-open");
        const trigger = menu.querySelector("[data-menu-trigger]");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
  });

  // Escape → close all
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menus.forEach((menu) => {
        menu.classList.remove("is-open");
        const trigger = menu.querySelector("[data-menu-trigger]");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
    }
  });
}
