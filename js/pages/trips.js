// trips.js — My Trips page

import { onAuthChange }          from "/js/firebase/auth.js";
import { userBookings }          from "/js/firebase/bookings.js";
import { checkAndCreateReminders } from "/js/firebase/notifications.js";
import { goToTripDetail, consumeCancelledFlag } from "/js/firebase/trip-detail-bridge.js";

const SIGNIN_URL = "/pages/auth/signin.html";

const els = {
  signin:    document.querySelector("[data-trips-signin]"),
  signinBtn: document.querySelector("[data-trips-signin-btn]"),
  loading:   document.querySelector("[data-trips-loading]"),
  error:     document.querySelector("[data-trips-error]"),
  retryBtn:  document.querySelector("[data-trips-retry-btn]"),
  main:      document.querySelector("[data-trips-main]"),
  typeTabs:  document.querySelector("[data-type-tabs]"),
  whenTabs:  document.querySelector("[data-when-tabs]"),
  grid:      document.querySelector("[data-trips-grid]"),
  empty:     document.querySelector("[data-trips-empty]"),
  emptyTitle: document.querySelector("[data-trips-empty-title]")
};

const state = {
  bookings: [],
  type: "flight",   // 'flight' | 'hotel'
  when: "upcoming"  // 'upcoming' | 'past'
};

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  bindUi();
  onAuthChange(user => user ? loadAndRender() : showView("signin"));
});

function bindUi() {
  els.signinBtn?.addEventListener("click", () => {
    window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(window.location.pathname);
  });
  els.retryBtn?.addEventListener("click", loadAndRender);

  wireTabGroup(els.typeTabs, "type-tab", "type", paintTypeTabs);
  wireTabGroup(els.whenTabs, "when-tab",  "when", paintWhenTabs);

  // One delegated listener covers all cards — survives every innerHTML replace
  els.grid?.addEventListener("click", e => {
    const card = e.target.closest("[data-trip-card]");
    if (!card) return;
    const booking = state.bookings.find(b => b.id === card.dataset.tripCard);
    if (!booking) return;
    try {
      goToTripDetail(booking);
    } catch (err) {
      console.error("[trips] goToTripDetail failed:", err);
      toast("Couldn't open the trip details. Please try again.", "danger");
    }
  });
}

function wireTabGroup(container, attr, stateKey, paintFn) {
  if (!container) return;
  container.querySelectorAll("[data-" + attr + "]").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-" + attr);
      if (next === state[stateKey]) return;
      state[stateKey] = next;
      paintFn();
      renderGrid();
    });
  });
}

// ── Auth + fetch ──────────────────────────────────────────────────────────────

function showView(name) {
  const panels = { signin: els.signin, loading: els.loading, error: els.error, main: els.main };
  Object.entries(panels).forEach(([key, el]) => el?.classList.toggle("d-none", key !== name));
}

async function loadAndRender() {
  showView("loading");
  try {
    state.bookings = await userBookings();
  } catch (err) {
    console.error("[trips] fetch failed:", err);
    showView("error");
    return;
  }
  showView("main");
  paintTypeTabs();
  paintWhenTabs();
  renderGrid();

  checkAndCreateReminders(state.bookings).catch(err =>
    console.warn("[trips] reminder scan failed:", err)
  );
  if (consumeCancelledFlag()) toast("Booking cancelled.", "success");
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function paintTypeTabs() {
  paintTabs(els.typeTabs, "type-tab", state.type, "btn-outline-secondary", true);
}
function paintWhenTabs() {
  paintTabs(els.whenTabs, "when-tab", state.when, "btn-light", false);
}

function paintTabs(container, attr, activeValue, inactiveClass, tintIcon) {
  if (!container) return;
  container.querySelectorAll("[data-" + attr + "]").forEach(btn => {
    const active = btn.getAttribute("data-" + attr) === activeValue;
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("green-btn", active);
    btn.classList.toggle(inactiveClass, !active);
    if (tintIcon) {
      const ic = btn.querySelector("img");
      if (ic) ic.style.filter = active ? "brightness(0) invert(1)" : "";
    }
  });
}

// ── Data ──────────────────────────────────────────────────────────────────────

// Round-trip → 2 legs (Departure + Return). One-way/hotel → 1 leg.
function legsFor(bookings, wantedType) {
  const out = [];
  for (const b of bookings) {
    if (b.type !== wantedType) continue;
    const isRoundTrip = Array.isArray(b.segments)
                     && b.segments.length >= 2
                     && b.returnDate != null;
    if (isRoundTrip) {
      out.push({ booking: b, date: toDateOrNull(b.travelDate), legLabel: "Departure", legRoute: b.segments[0].route });
      out.push({ booking: b, date: toDateOrNull(b.returnDate),  legLabel: "Return",    legRoute: b.segments[1].route });
    } else {
      out.push({ booking: b, date: toDateOrNull(b.travelDate), legLabel: null, legRoute: null });
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

function visibleLegs(legs, isUpcoming) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return legs.filter(l => {
    const cancelled = l.booking.status === "cancelled";
    return isUpcoming
      ? !cancelled && (l.date == null || l.date >= today)
      : cancelled  || (l.date != null  && l.date < today);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderGrid() {
  if (!els.grid) return;

  const isUpcoming = state.when === "upcoming";
  const visible    = visibleLegs(legsFor(state.bookings, state.type), isUpcoming);

  visible.sort((a, b) => {
    const aMs = a.date?.getTime() ?? (isUpcoming ? Infinity : -Infinity);
    const bMs = b.date?.getTime() ?? (isUpcoming ? Infinity : -Infinity);
    return isUpcoming ? aMs - bMs : bMs - aMs;
  });

  if (visible.length === 0) {
    els.grid.innerHTML = "";
    if (els.empty) {
      els.empty.classList.remove("d-none");
      if (els.emptyTitle) {
        els.emptyTitle.textContent =
          `No ${isUpcoming ? "upcoming" : "past"} ${state.type === "flight" ? "flights" : "hotels"} yet`;
      }
    }
    return;
  }

  if (els.empty) els.empty.classList.add("d-none");
  els.grid.innerHTML = visible.map(tripCardHtml).join("");
}

const STATUS_PILL = {
  cancelled: ["bg-danger-subtle text-danger",       "CANCELLED"],
  completed: ["bg-secondary-subtle text-secondary", "COMPLETED"]
};

function tripCardHtml(leg) {
  const b           = leg.booking;
  const [cls, label] = STATUS_PILL[b.status] || ["bg-light-green text-green", "CONFIRMED"];
  const pill        = `<span class="badge rounded-pill ${cls} fw-semibold" style="font-size:.65rem;">${label}</span>`;
  const icon        = b.type === "flight" ? "plane-takeoff.svg" : "bed.svg";
  const bgIcon      = b.type === "flight" ? "bg-light-green" : "bg-light-purple";
  const subtitle    = leg.legLabel ? `${leg.legLabel} · ${leg.legRoute || ""}` : (b.subtitle || "");
  const dateText    = leg.date ? formatDate(leg.date) : "Date to confirm";
  const priceText   = "$" + (Number(b.total) || 0).toLocaleString("en-US");
  const rowLabel    = b.type === "hotel" ? "Stay" : (leg.legLabel || "Flight");

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
            <p class="text-muted small mb-0">${escapeHtml(subtitle)}</p>
          </div>
          <div class="d-flex align-items-center justify-content-between mt-auto pt-3 border-top">
            <div>
              <p class="text-uppercase fw-bold mb-1" style="font-size:.62rem;color:#a1a1aa;letter-spacing:.08em;">${rowLabel}</p>
              <p class="fw-semibold small mb-0">${escapeHtml(dateText)}</p>
            </div>
            <p class="fw-bold text-green mb-0">${priceText}</p>
          </div>
        </div>
      </article>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message, kind = "success") {
  const el = document.createElement("div");
  el.className = `position-fixed bottom-0 end-0 m-3 alert alert-${kind} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
  el.style.zIndex = "9999";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
