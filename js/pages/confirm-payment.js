/* =====================================================
   Buzz Fly — confirm-payment.js (shared payment view)
   Consumes a PaymentRequest stashed by hotel-details /
   flight-details via payment-bridge.js, renders the
   summary read-only, runs card-form validators, and on
   submit calls createBooking(request).

   Card details are NEVER persisted. They live in form
   state for a single submit and are dropped after the
   addDoc resolves.

   Loaded as <script type="module"> on:
     pages/confirm-payment.html
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { createBooking } from "/js/firebase/bookings.js";
import {
  readPaymentRequest,
  clearPaymentRequest
} from "/js/firebase/payment-bridge.js";

const HOME_URL     = "/index.html";
const MY_TRIPS_URL = "/pages/profile/my-trips.html";

/* ---------- DOM refs ---------- */

const els = {
  pageTitle:     document.querySelector("[data-payment-page-title]"),
  pageSub:       document.querySelector("[data-payment-page-sub]"),

  // Summary
  kind:          document.querySelector("[data-summary-kind]"),
  title:         document.querySelector("[data-summary-title]"),
  subtitle:      document.querySelector("[data-summary-subtitle]"),
  dates:         document.querySelector("[data-summary-dates]"),
  travellerRows: document.querySelector("[data-summary-traveller-rows]"),
  segWrap:       document.querySelector("[data-summary-segments-wrap]"),
  segs:          document.querySelector("[data-summary-segments]"),
  lineItems:     document.querySelector("[data-summary-line-items]"),
  total:         document.querySelector("[data-summary-total]"),

  // Form
  cardholder:    document.getElementById("cardholderName"),
  cardNumber:    document.getElementById("cardNumber"),
  expiry:        document.getElementById("expiry"),
  cvv:           document.getElementById("cvv"),
  submit:        document.querySelector("[data-payment-submit]"),

  // Modal
  modalRoot:     document.getElementById("bookingConfirmedModal"),
  modalOk:       document.getElementById("bookingConfirmedOk")
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const request = readPaymentRequest();

  // Refresh on a stale payment URL, or direct nav → bounce home.
  if (!request) {
    console.warn("[payment] no PaymentRequest in sessionStorage — redirecting home");
    window.location.replace(HOME_URL);
    return;
  }

  // Defensive: the page is signed-in-only. Detail pages already gate
  // Confirm via ensureSignedIn(), so this is a fail-safe.
  await auth.authStateReady();
  if (!auth.currentUser) {
    const here = window.location.pathname;
    window.location.replace("/pages/auth/signin.html?next=" + encodeURIComponent(here));
    return;
  }

  renderSummary(request);
  wireFormatters();
  wireSubmit(request);
});

/* ---------- Summary rendering ---------- */

function renderSummary(request) {
  if (els.kind) {
    if (request.type === "flight") {
      els.kind.textContent = "FLIGHT BOOKING";
    } else {
      els.kind.textContent = "HOTEL BOOKING";
    }
  }
  if (els.title)    els.title.textContent    = request.title || "—";
  if (els.subtitle) els.subtitle.textContent = request.subtitle || "";

  if (els.pageTitle) els.pageTitle.textContent = "Finalize Your Journey";
  if (els.pageSub) {
    els.pageSub.textContent = "Review your details, then complete the secure payment to confirm.";
  }

  // Date row(s) — context-aware:
  //   hotel + returnDate    → Check-In / Check-Out
  //   flight + returnDate   → Departure / Return (round-trip)
  //   otherwise             → single Travel date row
  renderDateRows(request);

  // Traveller — 4 read-only rows
  renderTravellerRows(request.traveller || {});

  // Segments
  if (els.segWrap && els.segs) {
    if (Array.isArray(request.segments) && request.segments.length > 0) {
      els.segWrap.classList.remove("d-none");
      els.segs.innerHTML = request.segments.map(function (s) {
        return `
          <div class="border rounded-3 p-2">
            <p class="fw-semibold mb-0" style="font-size:.8125rem;">${escapeHtml(s.label)} · ${escapeHtml(s.route)}</p>
            <p class="text-secondary mb-0" style="font-size:.78rem;">${escapeHtml(s.detail)}</p>
          </div>
        `;
      }).join("");
    } else {
      els.segWrap.classList.add("d-none");
      els.segs.innerHTML = "";
    }
  }

  // Line items
  if (els.lineItems) {
    els.lineItems.innerHTML = (request.lineItems || []).map(function (li) {
      return `
        <div class="d-flex justify-content-between text-secondary" style="font-size:.875rem;">
          <span>${escapeHtml(li.label)}</span>
          <span>${fmtMoney(li.amount)}</span>
        </div>
      `;
    }).join("");
  }

  // Total
  if (els.total) {
    els.total.textContent = fmtMoney(request.total);
  }

  // CTA price
  if (els.submit) {
    els.submit.textContent = "Complete Booking • " + fmtMoney(request.total);
  }
}

function renderDateRows(request) {
  if (!els.dates) return;

  const isHotel = request.type === "hotel";
  const hasReturn = request.returnDate != null;
  let rows;

  if (hasReturn && isHotel) {
    rows = [
      { label: "Check-In",  value: formatDate(request.travelDate) },
      { label: "Check-Out", value: formatDate(request.returnDate) }
    ];
  } else if (hasReturn && !isHotel) {
    rows = [
      { label: "Departure", value: formatDate(request.travelDate) },
      { label: "Return",    value: formatDate(request.returnDate) }
    ];
  } else {
    rows = [
      { label: isHotel ? "Check-In" : "Travel Date", value: formatDate(request.travelDate) }
    ];
  }

  const colCls = rows.length === 2 ? "col-6" : "col-12";
  els.dates.innerHTML = rows.map(function (r) {
    return `
      <div class="${colCls}">
        <div class="border rounded-3 p-2">
          <p class="text-uppercase fw-bold mb-1" style="font-size:.6rem;color:#a1a1aa;letter-spacing:.08em;">${escapeHtml(r.label)}</p>
          <p class="fw-semibold small mb-0">${escapeHtml(r.value)}</p>
        </div>
      </div>
    `;
  }).join("");
}

function renderTravellerRows(t) {
  if (!els.travellerRows) return;
  const rows = [
    { label: "Traveller", value: t.name     || "—" },
    { label: "Email",     value: t.email    || "—" },
    { label: "Passport",  value: t.passport || "—" },
    { label: "Phone",     value: t.phone    || "—" }
  ];
  els.travellerRows.innerHTML = rows.map(function (r) {
    return `
      <div class="d-flex justify-content-between gap-2">
        <span class="text-muted" style="font-size:.78rem;">${escapeHtml(r.label)}</span>
        <span class="fw-semibold text-end" style="font-size:.8125rem;">${escapeHtml(r.value)}</span>
      </div>
    `;
  }).join("");
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/* ---------- Card formatters (live, on every input) ---------- */

function wireFormatters() {
  if (els.cardholder) {
    els.cardholder.addEventListener("blur", function () {
      els.cardholder.value = els.cardholder.value.trim().toUpperCase();
    });
  }
  if (els.cardNumber) {
    els.cardNumber.addEventListener("input", function () {
      const digits = stripDigits(els.cardNumber.value).slice(0, 16);
      els.cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1-");
    });
  }
  if (els.expiry) {
    els.expiry.addEventListener("input", function () {
      const digits = stripDigits(els.expiry.value).slice(0, 4);
      if (digits.length <= 2) {
        els.expiry.value = digits;
      } else {
        els.expiry.value = digits.slice(0, 2) + "/" + digits.slice(2);
      }
    });
  }
  if (els.cvv) {
    els.cvv.addEventListener("input", function () {
      els.cvv.value = stripDigits(els.cvv.value).slice(0, 4);
    });
  }
}

function stripDigits(s) {
  return (s || "").replace(/\D/g, "");
}

/* ---------- Validators ---------- */

function validate() {
  let ok = true;
  clearInvalid();

  const holder = (els.cardholder.value || "").trim();
  if (!holder) {
    flagInvalid(els.cardholder);
    ok = false;
  }

  const cardDigits = stripDigits(els.cardNumber.value);
  if (cardDigits.length < 13 || cardDigits.length > 19) {
    flagInvalid(els.cardNumber);
    ok = false;
  }

  if (!validExpiry(els.expiry.value)) {
    flagInvalid(els.expiry);
    ok = false;
  }

  const cvv = stripDigits(els.cvv.value);
  if (cvv.length < 3 || cvv.length > 4) {
    flagInvalid(els.cvv);
    ok = false;
  }

  return ok;
}

function validExpiry(value) {
  const digits = stripDigits(value);
  if (digits.length !== 4) return false;
  const mm = parseInt(digits.slice(0, 2), 10);
  const yy = parseInt(digits.slice(2), 10);
  if (isNaN(mm) || isNaN(yy)) return false;
  if (mm < 1 || mm > 12) return false;

  // Two-digit year window — treat as 20YY.
  const now    = new Date();
  const thisYY = now.getFullYear() % 100;
  const thisMM = now.getMonth() + 1;
  if (yy < thisYY) return false;
  if (yy === thisYY && mm < thisMM) return false;
  return true;
}

function flagInvalid(el) {
  if (!el) return;
  el.classList.add("is-invalid");
  el.addEventListener("input", function once() {
    el.classList.remove("is-invalid");
    el.removeEventListener("input", once);
  });
}

function clearInvalid() {
  [els.cardholder, els.cardNumber, els.expiry, els.cvv].forEach(function (el) {
    if (el) el.classList.remove("is-invalid");
  });
}

/* ---------- Submit ---------- */

function wireSubmit(request) {
  if (!els.submit) return;
  els.submit.addEventListener("click", async function () {
    if (!validate()) {
      toast("Please fix the highlighted fields before continuing", "danger");
      return;
    }

    setBusy(els.submit, true);
    try {
      await createBooking(request);
    } catch (err) {
      console.error("[payment] createBooking failed:", err);
      setBusy(els.submit, false);

      // Auth dropped mid-payment (token expired, signed out from
      // another tab, security rule rejected) → push back to sign-in
      // with ?next= so the user can retry.
      const code = err && err.code ? err.code : "";
      const isAuthDrop = code === "permission-denied"
                     || code === "buzz/auth-required"
                     || !auth.currentUser;
      if (isAuthDrop) {
        toast("Your session expired. Please sign in to complete your booking.", "danger");
        const here = window.location.pathname;
        setTimeout(function () {
          window.location.href = "/pages/auth/signin.html?next=" + encodeURIComponent(here);
        }, 1200);
        return;
      }

      toast("Could not complete your booking. Please try again.", "danger");
      return;
    }

    // Success — card details are dropped now.
    clearPaymentRequest();

    // Modal → My Trips, with replace() so Back can't reopen
    // the payment page with a now-empty session.
    showConfirmedModal();
  });
}

function showConfirmedModal() {
  if (!els.modalRoot || !window.bootstrap) {
    window.alert("Booking Confirmed — your booking is saved. You can find it under My Trips.");
    window.location.replace(MY_TRIPS_URL);
    return;
  }
  const modal = window.bootstrap.Modal.getOrCreateInstance(els.modalRoot);
  modal.show();
  els.modalOk.addEventListener("click", function () {
    window.location.replace(MY_TRIPS_URL);
  }, { once: true });
}

/* ---------- UI helpers ---------- */

function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Processing…";
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
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

function fmtMoney(amount) {
  if (typeof amount !== "number" || isNaN(amount)) return "—";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
