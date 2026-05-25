/* =====================================================
   Buzz Fly — trip-detail.js (Trip Detail page)

   Reads the full Booking object from sessionStorage
   (stashed by My Trips via trip-detail-bridge.goToTripDetail)
   and renders the 5 sections per spec: header, segments
   (when present), traveller (when present), booking summary,
   footer (Cancel button OR cancelled/completed notice).

   Cancellation flow:
     - Tap Cancel → Bootstrap modal confirmation
     - Confirm → updateDoc({ status: 'cancelled' }) via
       bookings.cancelBooking, which also fires the
       booking-cancelled notification.
     - On success → signal to My Trips + navigate back so
       it re-fetches naturally.

   Loaded as <script type="module"> on:
     pages/profile/trip-detail.html
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { cancelBooking } from "/js/firebase/bookings.js";
import {
  readTripDetailPayload,
  clearTripDetailPayload,
  signalCancelledOnReturn
} from "/js/firebase/trip-detail-bridge.js";

const MY_TRIPS_URL = "/pages/profile/my-trips.html";
const SIGNIN_URL   = "/pages/auth/signin.html";

/* ---------- DOM refs ---------- */

const els = {
  iconWrap:        document.querySelector("[data-trip-icon-wrap]"),
  icon:            document.querySelector("[data-trip-icon]"),
  title:           document.querySelector("[data-trip-title]"),
  subtitle:        document.querySelector("[data-trip-subtitle]"),

  segmentsCard:    document.querySelector("[data-segments-card]"),
  segmentsList:    document.querySelector("[data-segments-list]"),

  travellerCard:   document.querySelector("[data-traveller-card]"),
  travellerRows:   document.querySelector("[data-traveller-rows]"),

  summaryRows:     document.querySelector("[data-summary-rows]"),

  footer:          document.querySelector("[data-footer]"),

  // Modal
  modalRoot:       document.getElementById("cancelBookingModal"),
  modalConfirmBtn: document.querySelector("[data-cancel-confirm-btn]"),
  modalRtNote:     document.querySelector("[data-cancel-roundtrip-note]")
};

/* ---------- Page state ---------- */

const state = {
  booking:    null,   // full Booking object (Dates rehydrated)
  cancelling: false   // in-flight guard for the cancel call
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const booking = readTripDetailPayload();
  if (!booking) {
    // Refresh on a stale URL, or direct nav with no payload — bounce to My Trips.
    console.warn("[trip-detail] no booking in sessionStorage — redirecting to My Trips");
    window.location.replace(MY_TRIPS_URL);
    return;
  }

  // Trip Detail is signed-in-only (My Trips gates upstream, but be defensive).
  await auth.authStateReady();
  if (!auth.currentUser) {
    const here = window.location.pathname;
    window.location.replace(SIGNIN_URL + "?next=" + encodeURIComponent(here));
    return;
  }

  state.booking = booking;
  renderHeader();
  renderSegments();
  renderTraveller();
  renderSummary();
  renderFooter();

  // Round-trip warning copy in the modal only when it applies.
  if (els.modalRtNote && deriveFlags().isRoundTrip) {
    els.modalRtNote.classList.remove("d-none");
  }
});

/* ---------- Decision flags (re-derived after every state change) ---------- */

function deriveFlags() {
  const b = state.booking;
  const isHotel     = b.type === "hotel";
  const hasSegments = Array.isArray(b.segments) && b.segments.length > 0;
  const isRoundTrip = b.returnDate != null && hasSegments && b.segments.length >= 2;
  const isCancelled = b.status === "cancelled";
  const isCompleted = b.status === "completed";
  return {
    isHotel:     isHotel,
    hasSegments: hasSegments,
    isRoundTrip: isRoundTrip,
    isCancelled: isCancelled,
    isCompleted: isCompleted,
    isReadOnly:  isCancelled || isCompleted
  };
}

/* ---------- Sections ---------- */

function renderHeader() {
  const b = state.booking;
  const f = deriveFlags();

  if (els.title)    els.title.textContent    = b.title || "—";
  if (els.subtitle) els.subtitle.textContent = b.subtitle || "";

  if (els.icon) {
    if (f.isHotel) els.icon.src = "/assets/icons/bed.svg";
    else           els.icon.src = "/assets/icons/plane-takeoff.svg";
  }
  if (els.iconWrap) {
    if (f.isHotel) {
      els.iconWrap.classList.add("bg-light-purple");
      els.iconWrap.classList.remove("bg-light-green");
    } else {
      els.iconWrap.classList.add("bg-light-green");
      els.iconWrap.classList.remove("bg-light-purple");
    }
  }
}

function renderSegments() {
  const b = state.booking;
  const f = deriveFlags();
  if (!f.hasSegments) {
    if (els.segmentsCard) els.segmentsCard.classList.add("d-none");
    return;
  }
  if (els.segmentsCard) els.segmentsCard.classList.remove("d-none");
  if (!els.segmentsList) return;

  els.segmentsList.innerHTML = b.segments.map(function (s, i) {
    const divider = i === 0 ? "" : `<hr class="my-0 opacity-25" />`;
    return `
      ${divider}
      <div class="d-flex gap-3 ${i === 0 ? "" : "pt-3"}">
        <span class="rounded-circle bg-light-green d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width:36px;height:36px;">
          <img src="/assets/icons/plane-takeoff.svg" alt="" width="16" height="16" />
        </span>
        <div class="flex-fill" style="min-width:0;">
          <p class="text-uppercase fw-bold mb-1" style="font-size:.62rem;color:#a1a1aa;letter-spacing:.1em;">${escapeHtml(s.label || "")}</p>
          <p class="fw-semibold mb-1" style="font-size:.95rem;">${escapeHtml(s.route || "")}</p>
          <p class="text-secondary mb-0 small">${escapeHtml(s.detail || "")}</p>
        </div>
      </div>
    `;
  }).join("");
}

function renderTraveller() {
  const t = state.booking.traveller;
  const present = t && (t.name || t.email || t.passport || t.phone);
  if (!present) {
    if (els.travellerCard) els.travellerCard.classList.add("d-none");
    return;
  }
  if (els.travellerCard) els.travellerCard.classList.remove("d-none");
  if (!els.travellerRows) return;

  const rows = [
    { label: "Traveller", value: t.name     || "—" },
    { label: "Email",     value: t.email    || "—" },
    { label: "Passport",  value: t.passport || "—" },
    { label: "Phone",     value: t.phone    || "—" }
  ];
  els.travellerRows.innerHTML = rows.map(function (r) {
    return `
      <div class="d-flex justify-content-between gap-2 py-2 border-bottom">
        <span class="text-muted small">${escapeHtml(r.label)}</span>
        <span class="fw-semibold small text-end">${escapeHtml(r.value)}</span>
      </div>
    `;
  }).join("");
}

function renderSummary() {
  const b = state.booking;
  const f = deriveFlags();
  const rows = [];

  // Hotels without segments still want a top-row recap.
  if (!f.hasSegments && b.subtitle) {
    rows.push({ label: "Booking", value: b.subtitle });
  }

  // Date row(s) — layout depends on type + presence of returnDate.
  if (f.isHotel && b.returnDate) {
    rows.push({ label: "Check-In",  value: formatDate(b.travelDate) });
    rows.push({ label: "Check-Out", value: formatDate(b.returnDate) });
  } else if (!f.isHotel && b.returnDate) {
    rows.push({ label: "Departure", value: formatDate(b.travelDate) });
    rows.push({ label: "Return",    value: formatDate(b.returnDate) });
  } else {
    rows.push({
      label: f.isHotel ? "Check-In" : "Travel date",
      value: b.travelDate ? formatDate(b.travelDate) : "Date to confirm"
    });
  }

  rows.push({
    label: "Total Price",
    value: fmtMoney(b.total)
  });

  const statusLabel = { confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed" }[b.status] || b.status;
  let statusColour = "text-secondary";
  if (b.status === "confirmed")  statusColour = "text-green";
  if (b.status === "cancelled")  statusColour = "text-danger";

  rows.push({
    label:      "Status",
    value:      statusLabel,
    valueClass: statusColour
  });

  if (!els.summaryRows) return;
  els.summaryRows.innerHTML = rows.map(function (r, i) {
    const border = i < rows.length - 1 ? " border-bottom" : "";
    const valCls = r.valueClass || "";
    return `
      <div class="d-flex justify-content-between gap-2 py-2${border}">
        <span class="text-muted small">${escapeHtml(r.label)}</span>
        <span class="fw-semibold small text-end ${valCls}">${escapeHtml(r.value)}</span>
      </div>
    `;
  }).join("");
}

function renderFooter() {
  if (!els.footer) return;
  const f = deriveFlags();

  if (f.isCancelled) {
    els.footer.innerHTML = `
      <div class="alert bg-danger-subtle text-danger border-0 rounded-4 small py-3 px-3" role="alert">
        <strong>This booking has been cancelled.</strong> The doc is kept for your records but no further action is available.
      </div>
    `;
    return;
  }

  if (f.isCompleted) {
    els.footer.innerHTML = `
      <div class="alert bg-light text-secondary border-0 rounded-4 small py-3 px-3" role="alert">
        <strong>This trip is completed.</strong> Enjoy your memories.
      </div>
    `;
    return;
  }

  // Confirmed — show the Cancel button + wire the modal trigger.
  els.footer.innerHTML = `
    <div class="text-center">
      <button type="button"
              class="btn text-danger bg-danger-subtle border-danger px-5 py-2 fw-semibold rounded-pill"
              data-cancel-trigger>
        Cancel Booking
      </button>
      <p class="text-muted small mt-2 mb-0">
        You can cancel anytime up to 48 hours before departure.
      </p>
    </div>
  `;
  const triggerBtn = els.footer.querySelector("[data-cancel-trigger]");
  if (triggerBtn) {
    triggerBtn.addEventListener("click", openCancelModal);
  }

  // Wire the modal's confirm button (only when shown).
  if (els.modalConfirmBtn && !els.modalConfirmBtn._wired) {
    els.modalConfirmBtn._wired = true;
    els.modalConfirmBtn.addEventListener("click", onConfirmCancel);
  }
}

/* ---------- Cancel flow ---------- */

function openCancelModal() {
  if (!els.modalRoot) return;
  if (!window.bootstrap) {
    // Fallback to native confirm if Bootstrap somehow didn't load.
    if (window.confirm("Cancel this booking? This cannot be undone.")) {
      onConfirmCancel();
    }
    return;
  }
  const modal = window.bootstrap.Modal.getOrCreateInstance(els.modalRoot);
  modal.show();
}

function closeCancelModal() {
  if (!els.modalRoot || !window.bootstrap) return;
  const modal = window.bootstrap.Modal.getOrCreateInstance(els.modalRoot);
  modal.hide();
}

async function onConfirmCancel() {
  if (state.cancelling) return;     // double-tap guard
  if (!state.booking || !state.booking.id) return;

  state.cancelling = true;
  setConfirmBusy(true);

  try {
    await cancelBooking(state.booking.id);
  } catch (err) {
    console.error("[trip-detail] cancel failed:", err);
    state.cancelling = false;
    setConfirmBusy(false);

    const code = err && err.code ? err.code : "";
    if (code === "permission-denied" || !auth.currentUser) {
      toast("Your session expired. Please sign in again.", "danger");
      setTimeout(function () {
        const here = window.location.pathname;
        window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(here);
      }, 1200);
      return;
    }
    if (code === "not-found") {
      toast("This booking is no longer available.", "danger");
      setTimeout(function () {
        window.location.href = MY_TRIPS_URL;
      }, 1200);
      return;
    }
    toast("Could not cancel the booking. Please try again.", "danger");
    return;
  }

  // Success — drop the stashed payload, signal My Trips, navigate back.
  signalCancelledOnReturn(state.booking.id);
  clearTripDetailPayload();
  closeCancelModal();
  // location.replace so the browser Back can't reopen Trip Detail with a
  // now-cancelled-but-locally-stale booking object.
  window.location.replace(MY_TRIPS_URL);
}

function setConfirmBusy(busy) {
  if (!els.modalConfirmBtn) return;
  if (busy) {
    els.modalConfirmBtn.disabled = true;
    els.modalConfirmBtn.dataset.originalText = els.modalConfirmBtn.dataset.originalText || els.modalConfirmBtn.innerHTML;
    els.modalConfirmBtn.innerHTML = "Cancelling…";
  } else {
    els.modalConfirmBtn.disabled = false;
    if (els.modalConfirmBtn.dataset.originalText) {
      els.modalConfirmBtn.innerHTML = els.modalConfirmBtn.dataset.originalText;
    }
  }
}

/* ---------- Helpers ---------- */

function formatDate(d) {
  if (!d) return "—";
  let dt = d;
  if (typeof d.toDate === "function") dt = d.toDate();
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(amount) {
  if (typeof amount !== "number" || isNaN(amount)) return "—";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
