/* =====================================================
   Buzz Fly — notifications.js (Notifications page)

   Auth-gated reader of the same notifications/{*}
   collection the navbar dropdown reads. Shows every
   notification (not capped), with Mark all read.

   The navbar uses `js/firebase/notifications.js`
   directly; this page imports from the same module so
   there is one source of truth across the app.

   Loaded as <script type="module"> on:
     pages/Notifications.html
   ===================================================== */

import { onAuthChange } from "/js/firebase/auth.js";
import {
  userNotifications,
  markAllNotificationsRead
} from "/js/firebase/notifications.js";

const SIGNIN_URL = "/pages/auth/signin.html";

/* ---------- DOM refs ---------- */

const els = {
  signin:     document.querySelector("[data-notif-signin]"),
  signinBtn:  document.querySelector("[data-notif-signin-btn]"),
  loading:    document.querySelector("[data-notif-loading]"),
  error:      document.querySelector("[data-notif-error]"),
  retryBtn:   document.querySelector("[data-notif-retry-btn]"),
  empty:      document.querySelector("[data-notif-empty]"),
  list:       document.querySelector("[data-notif-list]"),
  markAllBtn: document.querySelector("[data-notif-mark-all]")
};

/* ---------- Page state ---------- */

const state = {
  items: []   // most-recent first
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", function () {
  bindUi();
  onAuthChange(function (user) {
    if (user) loadAndRender();
    else      showSigninCta();
  });
});

function bindUi() {
  if (els.signinBtn) {
    els.signinBtn.addEventListener("click", function () {
      const here = window.location.pathname;
      window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(here);
    });
  }
  if (els.retryBtn) {
    els.retryBtn.addEventListener("click", function () { loadAndRender(); });
  }
  if (els.markAllBtn) {
    els.markAllBtn.addEventListener("click", onMarkAllRead);
  }
}

/* ---------- View states ---------- */

function showSigninCta() {
  toggle(els.signin,  true);
  toggle(els.loading, false);
  toggle(els.error,   false);
  toggle(els.empty,   false);
  toggle(els.list,    false);
  toggle(els.markAllBtn, false);
}

function showLoading() {
  toggle(els.signin,  false);
  toggle(els.loading, true);
  toggle(els.error,   false);
  toggle(els.empty,   false);
  toggle(els.list,    false);
  toggle(els.markAllBtn, false);
}

function showError() {
  toggle(els.signin,  false);
  toggle(els.loading, false);
  toggle(els.error,   true);
  toggle(els.empty,   false);
  toggle(els.list,    false);
  toggle(els.markAllBtn, false);
}

function toggle(el, visible) {
  if (!el) return;
  if (visible) el.classList.remove("d-none");
  else         el.classList.add("d-none");
}

/* ---------- Fetch + render ---------- */

async function loadAndRender() {
  showLoading();
  try {
    state.items = await userNotifications();
  } catch (err) {
    console.error("[notifications] fetch failed:", err);
    // Permission-denied (missing rule / signed out / expired token)
    // looks the same as no data from the user's POV — show the empty
    // state instead of a scary error so they're never left stuck.
    state.items = [];
  }
  renderList();
}

function renderList() {
  toggle(els.signin,  false);
  toggle(els.loading, false);
  toggle(els.error,   false);

  if (!state.items.length) {
    toggle(els.empty, true);
    toggle(els.list,  false);
    toggle(els.markAllBtn, false);
    return;
  }

  toggle(els.empty, false);
  toggle(els.list,  true);

  // Mark-all-read button only useful when there's an unread row.
  const hasUnread = state.items.some(function (n) { return !n.isRead; });
  toggle(els.markAllBtn, hasUnread);

  els.list.innerHTML = state.items.map(notifCardHtml).join("");
}

function notifCardHtml(n) {
  const icon     = iconForNotif(n);
  const bgCircle = bgForNotif(n);
  const ago      = relativeTime(n.createdAt);
  const isBooking = n.type === "booking" || !!n.relatedBookingId;
  const clickAttr = isBooking
    ? `style="cursor:pointer;" onclick="window.location.href='/pages/profile/my-trips.html'"`
    : "";
  return `
    <div class="card border-0 shadow-sm rounded-4 mb-3 p-4" ${clickAttr}>
      <div class="d-flex align-items-start gap-3">
        <div class="rounded-3 d-inline-flex align-items-center justify-content-center ${bgCircle} flex-shrink-0" style="width:52px;height:52px;">
          <img src="${icon}" alt="" style="width:22px;height:22px;" />
        </div>
        <div class="flex-grow-1">
          <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
            <h2 class="fs-6 fw-bold mb-0">${escapeHtml(n.title || "")}</h2>
            <span class="text-muted flex-shrink-0" style="font-size:.78rem;white-space:nowrap;">${escapeHtml(ago)}</span>
          </div>
          <p class="text-muted mb-0" style="font-size:.875rem;">${escapeHtml(n.body || "")}</p>
        </div>
      </div>
    </div>
  `;
}

/* Icon + bg derived from type ('booking' | 'system') for the
   high-level split, then from the title for the within-booking
   distinction between confirm / cancel / reminder. Title strings
   are stable — they're hardcoded inside bookings.js and
   notifications.js. */
function iconForNotif(n) {
  if (n.type === "system") return "/assets/icons/badge-verified.svg";
  const title = (n.title || "").toLowerCase();
  if (title.indexOf("cancel") !== -1) return "/assets/icons/info.svg";
  if (title.indexOf("soon")   !== -1) return "/assets/icons/calendar.svg";
  return "/assets/icons/badge-verified.svg";   // booking confirmed + fallback
}

function bgForNotif(n) {
  if (n.type === "system") return "bg-light-green";
  const title = (n.title || "").toLowerCase();
  if (title.indexOf("cancel") !== -1) return "bg-danger-subtle";
  if (title.indexOf("soon")   !== -1) return "bg-light-purple";
  return "bg-light-green";                     // booking confirmed + fallback
}

function relativeTime(ts) {
  let ms = 0;
  if (!ts) return "";
  if (typeof ts.toMillis === "function") ms = ts.toMillis();
  else if (ts instanceof Date)            ms = ts.getTime();
  else                                    return "";
  const diff = Date.now() - ms;
  if (diff < 60_000)         return "just now";
  if (diff < 3_600_000)      return Math.floor(diff / 60_000)    + "m ago";
  if (diff < 86_400_000)     return Math.floor(diff / 3_600_000) + "h ago";
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d ago";
  return new Date(ms).toLocaleDateString();
}

/* ---------- Mark all read ---------- */

async function onMarkAllRead() {
  if (!els.markAllBtn) return;
  els.markAllBtn.disabled = true;
  const originalText = els.markAllBtn.innerHTML;
  els.markAllBtn.innerHTML = "Working…";
  try {
    await markAllNotificationsRead(state.items);
  } catch (err) {
    console.error("[notifications] mark-all-read failed:", err);
  }
  els.markAllBtn.disabled = false;
  els.markAllBtn.innerHTML = originalText;
  renderList();
}

/* ---------- Helpers ---------- */

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
