/* =====================================================
   Buzz Fly — trips.js (My Trips page)

   Auth-gated reader of bookings/{*} for the current user.
   Round-trip flight bookings expand into TWO cards (one
   keyed on travelDate, one on returnDate). The hotel /
   one-way flight case stays as a single card.

   Also runs the 24h-before-travel reminder check on every
   visit — see notifications.checkAndCreateReminders.

   Loaded as <script type="module"> on:
     pages/profile/my-trips.html
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { onAuthChange } from "/js/firebase/auth.js";
import { userBookings } from "/js/firebase/bookings.js";
import { checkAndCreateReminders } from "/js/firebase/notifications.js";
import {
  goToTripDetail,
  consumeCancelledFlag
} from "/js/firebase/trip-detail-bridge.js";

const SIGNIN_URL = "/pages/auth/signin.html";

/* ---------- DOM refs ---------- */

const els = {
  signin:        document.querySelector("[data-trips-signin]"),
  signinBtn:     document.querySelector("[data-trips-signin-btn]"),
  loading:       document.querySelector("[data-trips-loading]"),
  error:         document.querySelector("[data-trips-error]"),
  retryBtn:      document.querySelector("[data-trips-retry-btn]"),
  main:          document.querySelector("[data-trips-main]"),
  typeTabs:      document.querySelector("[data-type-tabs]"),
  whenTabs:      document.querySelector("[data-when-tabs]"),
  grid:          document.querySelector("[data-trips-grid]"),
  empty:         document.querySelector("[data-trips-empty]"),
  emptyTitle:    document.querySelector("[data-trips-empty-title]")
};

/* ---------- Page state ---------- */

const state = {
  bookings:    [],          // raw docs from Firestore
  type:        "flight",    // 'flight' | 'hotel'
  when:        "upcoming"   // 'upcoming' | 'past'
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", function () {
  bindUi();
  // Listen continuously — if the user signs out in another tab the
  // view flips to the sign-in CTA, and signing back in re-fetches.
  onAuthChange(function (user) {
    if (user) {
      loadAndRender();
    } else {
      showSigninCta();
    }
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
  if (els.typeTabs) {
    els.typeTabs.querySelectorAll("[data-type-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const next = btn.dataset.typeTab;
        if (next === state.type) return;
        state.type = next;
        paintTypeTabs();
        renderGrid();
      });
    });
  }
  if (els.whenTabs) {
    els.whenTabs.querySelectorAll("[data-when-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const next = btn.dataset.whenTab;
        if (next === state.when) return;
        state.when = next;
        paintWhenTabs();
        renderGrid();
      });
    });
  }
}

/* ---------- Auth gate + fetch ---------- */

function showSigninCta() {
  if (els.signin)  els.signin.classList.remove("d-none");
  if (els.loading) els.loading.classList.add("d-none");
  if (els.error)   els.error.classList.add("d-none");
  if (els.main)    els.main.classList.add("d-none");
}

function showLoading() {
  if (els.signin)  els.signin.classList.add("d-none");
  if (els.loading) els.loading.classList.remove("d-none");
  if (els.error)   els.error.classList.add("d-none");
  if (els.main)    els.main.classList.add("d-none");
}

function showError() {
  if (els.signin)  els.signin.classList.add("d-none");
  if (els.loading) els.loading.classList.add("d-none");
  if (els.error)   els.error.classList.remove("d-none");
  if (els.main)    els.main.classList.add("d-none");
}

function showMain() {
  if (els.signin)  els.signin.classList.add("d-none");
  if (els.loading) els.loading.classList.add("d-none");
  if (els.error)   els.error.classList.add("d-none");
  if (els.main)    els.main.classList.remove("d-none");
}

async function loadAndRender() {
  showLoading();
  try {
    state.bookings = await userBookings();
  } catch (err) {
    console.error("[trips] fetch failed:", err);
    showError();
    return;
  }
  showMain();
  paintTypeTabs();
  paintWhenTabs();
  renderGrid();

  // Fire reminder notifications for any booking starting in <24h
  // that we haven't already reminded on this device. Idempotent.
  checkAndCreateReminders(state.bookings).catch(function (err) {
    console.warn("[trips] reminder scan failed:", err);
  });

  // If the user just cancelled a booking on Trip Detail, the fresh
  // userBookings() above already reflects the new status — the
  // cancelled card has moved from Upcoming to Past. Toast to confirm.
  const cancelled = consumeCancelledFlag();
  if (cancelled) {
    toast("Booking cancelled.", "success");
  }
}

/* ---------- Tab paint ---------- */

function paintTypeTabs() {
  if (!els.typeTabs) return;
  els.typeTabs.querySelectorAll("[data-type-tab]").forEach(function (btn) {
    const active = btn.dataset.typeTab === state.type;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) {
      btn.classList.add("green-btn");
      btn.classList.remove("btn-outline-secondary");
    } else {
      btn.classList.remove("green-btn");
      btn.classList.add("btn-outline-secondary");
    }
    // Re-tint the icon based on active state (white on active, default otherwise)
    const ic = btn.querySelector("img");
    if (ic) {
      ic.style.filter = active ? "brightness(0) invert(1)" : "";
    }
  });
}

function paintWhenTabs() {
  if (!els.whenTabs) return;
  els.whenTabs.querySelectorAll("[data-when-tab]").forEach(function (btn) {
    const active = btn.dataset.whenTab === state.when;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) {
      btn.classList.add("green-btn");
      btn.classList.remove("btn-light");
    } else {
      btn.classList.remove("green-btn");
      btn.classList.add("btn-light");
    }
  });
}

/* ---------- Leg splitting (round-trip → 2 cards) ----------

   A booking with type === 'flight', segments.length >= 2 and a
   non-null returnDate expands into Departure (keyed on travelDate)
   + Return (keyed on returnDate). Hotels and one-way flights stay
   as a single card keyed on travelDate. */
function legsFor(bookings, wantedType) {
  const out = [];
  for (const b of bookings) {
    if (b.type !== wantedType) continue;
    const isRoundTrip = b.type === "flight"
                     && Array.isArray(b.segments)
                     && b.segments.length >= 2
                     && b.returnDate != null;
    if (isRoundTrip) {
      out.push({
        booking:  b,
        date:     toDateOrNull(b.travelDate),
        legLabel: "Departure",
        legRoute: b.segments[0].route
      });
      out.push({
        booking:  b,
        date:     toDateOrNull(b.returnDate),
        legLabel: "Return",
        legRoute: b.segments[1].route
      });
    } else {
      out.push({
        booking:  b,
        date:     toDateOrNull(b.travelDate),
        legLabel: null,
        legRoute: null
      });
    }
  }
  return out;
}

function toDateOrNull(t) {
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate();
  if (t instanceof Date) return t;
  return null;
}

/* ---------- Upcoming / Past filter ---------- */

function visibleLegs(legs, isUpcoming) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (isUpcoming) {
    return legs.filter(function (l) {
      if (l.booking.status === "cancelled") return false;
      if (l.date == null) return true;          // undated → treat as upcoming
      return l.date >= startOfToday;
    });
  }
  return legs.filter(function (l) {
    if (l.booking.status === "cancelled") return true;
    if (l.date == null) return false;
    return l.date < startOfToday;
  });
}

/* ---------- Render ---------- */

function renderGrid() {
  if (!els.grid) return;

  const legs    = legsFor(state.bookings, state.type);
  const visible = visibleLegs(legs, state.when === "upcoming");

  // Sort visible: upcoming ascending, past descending (recent first).
  visible.sort(function (a, b) {
    const aMs = a.date ? a.date.getTime() : (state.when === "upcoming" ? Infinity : -Infinity);
    const bMs = b.date ? b.date.getTime() : (state.when === "upcoming" ? Infinity : -Infinity);
    if (state.when === "upcoming") return aMs - bMs;
    return bMs - aMs;
  });

  if (visible.length === 0) {
    els.grid.innerHTML = "";
    if (els.empty) {
      els.empty.classList.remove("d-none");
      if (els.emptyTitle) {
        const word = state.when === "upcoming" ? "upcoming" : "past";
        const noun = state.type === "flight" ? "flights" : "hotels";
        els.emptyTitle.textContent = `No ${word} ${noun} yet`;
      }
    }
    return;
  }

  if (els.empty) els.empty.classList.add("d-none");
  els.grid.innerHTML = visible.map(tripCardHtml).join("");

  // Wire each card → Trip Detail with the underlying booking.
  // Round-trip departure + return cards both point at the same
  // booking, so Trip Detail can read travelDate / returnDate itself.
  els.grid.querySelectorAll("[data-trip-card]").forEach(function (card) {
    card.addEventListener("click", function () {
      const id = card.dataset.tripCard;
      const booking = state.bookings.find(function (b) { return b.id === id; });
      if (!booking) return;
      try {
        goToTripDetail(booking);
      } catch (err) {
        console.error("[trips] goToTripDetail failed:", err);
        toast("Couldn't open the trip details. Please try again.", "danger");
      }
    });
  });
}

function tripCardHtml(leg) {
  const b      = leg.booking;
  const pill   = statusPillHtml(b.status);
  const icon   = b.type === "flight" ? "plane-takeoff.svg" : "bed.svg";
  const bgIcon = b.type === "flight" ? "bg-light-green"     : "bg-light-purple";
  const subtitleText = leg.legLabel
    ? `${leg.legLabel} · ${leg.legRoute || ""}`
    : (b.subtitle || "");
  const dateText  = leg.date ? formatDate(leg.date) : "Date to confirm";
  const priceText = "$" + (Number(b.total) || 0).toLocaleString("en-US");

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <article class="card border-0 shadow-sm rounded-4 h-100" data-trip-card="${escapeHtml(b.id)}" role="button" style="cursor:pointer;">
        <div class="card-body p-3 d-flex flex-column h-100">
          <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
            <div class="rounded-4 ${bgIcon} d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width:46px;height:46px;">
              <img src="/assets/icons/${icon}" alt="" width="20" height="20" />
            </div>
            ${pill}
          </div>

          <div class="mb-3">
            <h3 class="h6 fw-bold mb-1">${escapeHtml(b.title || "—")}</h3>
            <p class="text-muted small mb-0">${escapeHtml(subtitleText)}</p>
          </div>

          <div class="d-flex align-items-center justify-content-between mt-auto pt-3 border-top">
            <div>
              <p class="text-uppercase fw-bold mb-1" style="font-size:.62rem;color:#a1a1aa;letter-spacing:.08em;">
                ${b.type === "hotel" ? "Stay" : (leg.legLabel || "Flight")}
              </p>
              <p class="fw-semibold small mb-0">${escapeHtml(dateText)}</p>
            </div>
            <p class="fw-bold text-green mb-0">${priceText}</p>
          </div>
        </div>
      </article>
    </div>
  `;
}

function statusPillHtml(status) {
  if (status === "cancelled") {
    return `<span class="badge rounded-pill bg-danger-subtle text-danger fw-semibold" style="font-size:.65rem;">CANCELLED</span>`;
  }
  if (status === "completed") {
    return `<span class="badge rounded-pill bg-secondary-subtle text-secondary fw-semibold" style="font-size:.65rem;">COMPLETED</span>`;
  }
  return `<span class="badge rounded-pill bg-light-green text-green fw-semibold" style="font-size:.65rem;">CONFIRMED</span>`;
}

/* ---------- Helpers ---------- */

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
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

function toast(message, kind) {
  const colour = kind || "success";
  const el = document.createElement("div");
  el.className = `position-fixed bottom-0 end-0 m-3 alert alert-${colour} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
  el.style.zIndex = "9999";
  el.textContent  = message;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}
