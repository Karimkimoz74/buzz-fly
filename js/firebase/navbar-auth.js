/* =====================================================
   Buzz Fly Web — Auth-aware navbar
   Toggles the [data-auth-only] sections of the shared
   navbar partial based on Firebase auth state, populates
   the signed-in user's name/email, and wires the Sign Out
   button.

   Loaded by js/main.js after the navbar partial is
   injected. Safe to call once per page.

   Markup contract (partials/navbar.html):
     [data-auth-only="signed-in"]   shown only when signed in
     [data-auth-only="signed-out"]  shown only when signed out
     [data-auth-display-name]       text set to user's name
     [data-auth-email]              text set to user's email
     [data-auth-signout]            click → sign out + redirect
   ===================================================== */

import { onAuthChange, signOut, fetchProfile } from "/js/firebase/auth.js";
import { userAvatarCache } from "/js/firebase/avatar-cache.js";
import { userNotifications } from "/js/firebase/notifications.js";

const LOGOUT_URL    = "/pages/auth/logout.html";
const NOTIF_LIMIT   = 8;        // max rows in the dropdown

export function initAuthAwareNavbar() {
  // Sign-out button uses event delegation so it survives partial re-injection
  // and works even if the dropdown menu is rendered later.
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-auth-signout]");
    if (!btn) return;
    e.preventDefault();
    btn.disabled = true;
    try {
      await signOut();
      userAvatarCache.clear();
      localStorage.removeItem('buzzfly.profileIncomplete');
      window.location.href = LOGOUT_URL;
    } catch (err) {
      console.error("[navbar-auth] sign out failed:", err);
      btn.disabled = false;
    }
  });

  // Repaint every [data-auth-avatar] <img> whenever the cached avatar
  // changes — fires immediately with the current value too.
  userAvatarCache.subscribe(applyAvatarToNavbar);

  // React to every auth-state change (initial load, sign-in, sign-out)
  onAuthChange(async (user) => {
    applyAuthVisibility(Boolean(user));
    if (user) {
      populateSignedInUser(user);
      // Load the Firestore profile to get the preferred display name
      // and avatar — but never block visibility on it.
      try {
        const profile = await fetchProfile();
        if (profile) {
          if (profile.fullName) {
            setText("[data-auth-display-name]", profile.fullName);
          }
          if (profile.avatar) {
            userAvatarCache.set(profile.avatar);
          }
        }
      } catch (err) {
        console.warn("[navbar-auth] could not fetch profile:", err);
      }
      // Load notifications — independent of the profile fetch.
      // On any failure (permission-denied, network blip, missing
      // collection rule) we paint the empty state so the dropdown
      // never gets stuck on "Loading…".
      refreshNotifications().catch(function (err) {
        console.warn("[navbar-auth] notifications load failed:", err);
        paintNotifications([]);
      });
    } else {
      userAvatarCache.clear();
      clearNotifications();
    }
  });
}

/* ---------- Notifications dropdown ---------- */

async function refreshNotifications() {
  const list = await userNotifications({ limit: NOTIF_LIMIT });
  paintNotifications(list);
}

function paintNotifications(list) {
  const wrap = document.querySelector("[data-notif-list]");
  const pill = document.querySelector("[data-notif-unread-pill]");
  if (!wrap) return;

  if (!Array.isArray(list) || list.length === 0) {
    wrap.innerHTML = `
      <div class="px-4 py-4 text-center">
        <p class="text-muted small mb-0">You're all caught up — no new notifications.</p>
      </div>
    `;
    if (pill) pill.classList.add("d-none");
    return;
  }

  const unreadCount = list.filter(function (n) { return !n.isRead; }).length;
  if (pill) {
    if (unreadCount > 0) {
      pill.textContent = String(unreadCount) + " new";
      pill.classList.remove("d-none");
    } else {
      pill.classList.add("d-none");
    }
  }

  wrap.innerHTML = list.map(notifRowHtml).join("");
}

function notifRowHtml(n) {
  const iconSrc = iconForNotif(n);
  const unreadCls = !n.isRead ? " bg-light-green" : "";
  const ago = relativeTime(n.createdAt);
  // text-wrap overrides Bootstrap's dropdown-item nowrap; min-width:0 on
  // the inner flex column lets long bodies break instead of forcing a
  // horizontal scrollbar on the dropdown.
  return `
    <a href="/pages/Notifications.html" class="dropdown-item d-flex gap-3 px-4 py-3 border-bottom text-wrap${unreadCls}">
      <span class="buzz-notif-icon rounded-circle border bg-white d-inline-flex align-items-center justify-content-center flex-shrink-0">
        <img src="${iconSrc}" alt="" />
      </span>
      <span class="flex-grow-1" style="min-width:0;">
        <span class="d-block fw-semibold small">${escapeHtml(n.title || "")}</span>
        <span class="d-block text-muted small" style="white-space:normal;">${escapeHtml(n.body || "")}${ago ? " · " + escapeHtml(ago) : ""}</span>
      </span>
    </a>
  `;
}

/* Icon choice keys off type ('booking' | 'system') for the high-level
   split, then off the title text for the within-booking distinction
   between confirm / cancel / reminder. Title strings are stable —
   they're hardcoded inside bookings.js and notifications.js. */
function iconForNotif(n) {
  if (n.type === "system") return "/assets/icons/badge-verified.svg";
  const title = (n.title || "").toLowerCase();
  if (title.indexOf("cancel") !== -1) return "/assets/icons/info.svg";
  if (title.indexOf("soon")   !== -1) return "/assets/icons/calendar.svg";
  return "/assets/icons/badge-verified.svg";   // booking confirmed + fallback
}

function relativeTime(ts) {
  let ms = 0;
  if (!ts) return "";
  if (typeof ts.toMillis === "function") ms = ts.toMillis();
  else if (ts instanceof Date)            ms = ts.getTime();
  else                                    return "";
  const diff = Date.now() - ms;
  if (diff < 60_000)        return "just now";
  if (diff < 3_600_000)     return Math.floor(diff / 60_000)    + "m ago";
  if (diff < 86_400_000)    return Math.floor(diff / 3_600_000) + "h ago";
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d ago";
  return new Date(ms).toLocaleDateString();
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearNotifications() {
  const wrap = document.querySelector("[data-notif-list]");
  const pill = document.querySelector("[data-notif-unread-pill]");
  if (wrap) {
    wrap.innerHTML = `
      <div class="px-4 py-4 text-center">
        <p class="text-muted small mb-0">Sign in to see your notifications.</p>
      </div>
    `;
  }
  if (pill) pill.classList.add("d-none");
}

/* Swap every avatar <img> tagged [data-auth-avatar] (navbar + sidebar
   + anywhere else) to the user's chosen avatar, or fall back to the
   default icon when no avatar is set.

   Imgs that additionally carry [data-auth-avatar-fill] (the navbar
   icon button) get full-bleed sizing so the photo covers the parent
   circle. Other tagged imgs keep their own dimensions. */
function applyAvatarToNavbar(path) {
  const imgs = document.querySelectorAll("[data-auth-avatar]");
  const normalised = normaliseAvatarPath(path);
  imgs.forEach((img) => {
    const fill = img.hasAttribute("data-auth-avatar-fill");
    if (normalised) {
      img.src = normalised;
      if (fill) {
        img.style.width        = "100%";
        img.style.height       = "100%";
        img.style.objectFit    = "cover";
        img.style.borderRadius = "50%";
      }
    } else {
      img.src = img.dataset.defaultSrc || "/assets/icons/user.svg";
      if (fill) {
        img.style.width        = "";
        img.style.height       = "";
        img.style.objectFit    = "";
        img.style.borderRadius = "";
      }
    }
  });
}

/* Mobile stores avatars as relative paths "assets/avatars/avatar3.png".
   Web is served from the project root, so the same string needs a leading slash. */
function normaliseAvatarPath(path) {
  if (!path) return "";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return "/" + path;
}

function applyAuthVisibility(isSignedIn) {
  const all = document.querySelectorAll("[data-auth-only]");
  all.forEach((el) => {
    const mode = el.getAttribute("data-auth-only");
    let shouldShow = false;
    if (mode === "signed-in" && isSignedIn) {
      shouldShow = true;
    }
    if (mode === "signed-out" && !isSignedIn) {
      shouldShow = true;
    }
    if (shouldShow) {
      el.classList.remove("d-none");
    } else {
      el.classList.add("d-none");
    }
  });
}

function populateSignedInUser(user) {
  const name = user.displayName || user.email || "Traveler";
  setText("[data-auth-display-name]", name);
  setText("[data-auth-email]", user.email || "");
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}
