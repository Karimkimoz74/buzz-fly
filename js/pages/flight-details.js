/* =====================================================
   Buzz Fly — flight-details.js (Stage 3, flight side)

   Reads { flight, returnFlight, query } from sessionStorage
   (stashed by Stage 2 via flight-bridge.goToFlightBooking),
   builds the journey overview, lets the user adjust per-leg
   cabin classes (independent — Business outbound + Standard
   return is valid), shows baggage derived from the OUTBOUND
   cabin, prefills the traveller block from users/{uid}, and
   on Confirm builds a PaymentRequest matching the spec
   verbatim and hands off to the shared payment view.

   Mirrors the hotel-details.js pattern exactly so the two
   detail flows stay consistent.

   Loaded as <script type="module"> on:
     pages/flight-details.html
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { fetchProfile } from "/js/firebase/auth.js";
import { baggageFor, cheapestClass } from "/js/firebase/flights.js";
import {
  readFlightBookingPayload,
  clearFlightBookingPayload
} from "/js/firebase/flight-bridge.js";
import {
  goToPayment,
  ensureSignedIn,
  consumeAuthReturnFlag
} from "/js/firebase/payment-bridge.js";

const FLIGHT_TAX_RATE = 0.12;
const HOME_URL        = "/index.html";

/* ---------- DOM refs ---------- */

const els = {
  tripEyebrow:     document.querySelector("[data-trip-eyebrow]"),
  routeTitle:      document.querySelector("[data-route-title]"),
  routeSub:        document.querySelector("[data-route-sub]"),

  journeyCards:    document.querySelector("[data-journey-cards]"),

  baggageContent:  document.querySelector("[data-baggage-content]"),

  card:            document.querySelector("[data-booking-card]"),
  loading:         document.querySelector("[data-booking-loading]"),
  error:           document.querySelector("[data-booking-error]"),
  errorMsg:        document.querySelector("[data-booking-error-msg]"),
  form:            document.querySelector("[data-booking-form]"),

  totalPrice:      document.querySelector("[data-total-price]"),

  outboundLabel:   document.querySelector("[data-outbound-label]"),
  outboundPicker:  document.querySelector("[data-outbound-picker]"),
  returnWrap:      document.querySelector("[data-return-picker-wrap]"),
  returnPicker:    document.querySelector("[data-return-picker]"),

  fareLines:       document.querySelector("[data-fare-lines]"),
  lineTotal:       document.querySelector("[data-line-total]"),

  travellerBlock:  document.querySelector("[data-traveller-block]"),
  travToggle:      document.getElementById("fd-trav-toggle"),
  travHelper:      document.querySelector("[data-trav-helper]"),
  travName:        document.getElementById("fd-trav-name"),
  travEmail:       document.getElementById("fd-trav-email"),
  travPassport:    document.getElementById("fd-trav-passport"),
  travPhone:       document.getElementById("fd-trav-phone"),

  confirmBtn:      document.querySelector("[data-confirm-btn]"),
  signinNudge:     document.querySelector("[data-signin-nudge]")
};

/* ---------- Page state ---------- */

const state = {
  flight:           null,    // outbound Flight, scoped via withClass at Stage 2
  returnFlight:     null,    // round-trip return Flight, or null
  query:            null,    // FlightSearchQuery — needed for dates
  isRoundTrip:      false,
  outboundClass:    null,
  returnClass:      null,
  profileTraveller: null     // cache for the "another traveller" toggle
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const payload = readFlightBookingPayload();
  if (!payload || !payload.flight || !payload.query) {
    // Refresh on a stale URL or direct nav — bounce to Stage 1.
    console.warn("[flight-details] no payload in sessionStorage — redirecting home");
    window.location.replace(HOME_URL);
    return;
  }

  state.flight       = payload.flight;
  state.returnFlight = payload.returnFlight || null;
  state.query        = payload.query;
  state.isRoundTrip  = state.returnFlight != null;

  // ---- Per-leg cabin defaults ----
  // Mirror searched class when the leg offers it; fall back to that
  // leg's cheapest tier otherwise. Spec edge case for round-trip return.
  state.outboundClass = state.query.cabinClass;
  // Defensive: outbound was scoped at Stage 2 but its raw cabinPrices
  // map is preserved — if for some reason the searched class isn't
  // there, fall back to the outbound's cheapest.
  if (!(state.outboundClass in (state.flight.cabinPrices || {}))) {
    state.outboundClass = cheapestClass(state.flight);
  }

  if (state.isRoundTrip) {
    const offered = state.returnFlight.cabinPrices || {};
    if (state.query.cabinClass in offered) {
      state.returnClass = state.query.cabinClass;
    } else {
      state.returnClass = cheapestClass(state.returnFlight);
    }
  } else {
    state.returnClass = state.outboundClass;
  }

  renderChrome();
  renderJourneyCards();
  buildOutboundPicker();
  if (state.isRoundTrip) {
    els.returnWrap.classList.remove("d-none");
    buildReturnPicker();
  }
  recompute();

  // Reveal the form
  if (els.loading) els.loading.classList.add("d-none");
  if (els.form)    els.form.classList.remove("d-none");

  await auth.authStateReady();
  await maybeMountTravellerBlock();

  if (els.confirmBtn) {
    els.confirmBtn.addEventListener("click", onConfirm);
  }
  if (els.travToggle) {
    els.travToggle.addEventListener("change", onTravellerToggle);
  }

  // Prompt the user after a sign-in round-trip.
  if (consumeAuthReturnFlag()) {
    toast("Signed in. Review your details and tap Confirm again.");
  }
});

/* ---------- Chrome (top header) ---------- */

function renderChrome() {
  const q = state.query;

  if (state.isRoundTrip) {
    if (els.tripEyebrow) els.tripEyebrow.textContent = "ROUND TRIP";
    if (els.routeTitle)  els.routeTitle.textContent  = `${q.originCity} → ${q.destinationCity} → ${q.originCity}`;
    if (els.routeSub) {
      const dep = q.departureDate ? formatDate(q.departureDate) : "";
      const ret = q.returnDate    ? formatDate(q.returnDate)    : "";
      els.routeSub.textContent = `${dep} – ${ret}`;
    }
  } else {
    if (els.tripEyebrow) els.tripEyebrow.textContent = "ONE WAY";
    if (els.routeTitle)  els.routeTitle.textContent  = `${q.originCity} → ${q.destinationCity}`;
    if (els.routeSub) {
      els.routeSub.textContent = q.departureDate ? formatDate(q.departureDate) : "";
    }
  }

  if (els.outboundLabel) {
    els.outboundLabel.textContent = state.isRoundTrip ? "Cabin Class — Departure" : "Cabin Class";
  }
}

/* ---------- Journey overview cards ---------- */

function renderJourneyCards() {
  if (!els.journeyCards) return;

  if (state.isRoundTrip) {
    els.journeyCards.innerHTML =
      legCardHtml("Departure", state.flight, state.outboundClass) +
      legCardHtml("Return",    state.returnFlight, state.returnClass);
  } else {
    els.journeyCards.innerHTML =
      legCardHtml("Flight", state.flight, state.outboundClass);
  }
}

function legCardHtml(label, f, currentClass) {
  const stopsLabel  = buildStopsLabel(f);
  const stopsClass  = (f.stops === 0) ? "text-nav-green" : "";
  const stopsStyle  = (f.stops > 0)   ? "color:#D97706;" : "";
  const durLabel    = buildDurationLabel(f.durationMinutes);

  return `
    <div class="bg-white border rounded-4 p-4 mb-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2">
          <img src="/assets/icons/plane-takeoff.svg" alt="" width="18" height="18" />
          <h3 class="mb-0" style="font-size:1rem;">${escapeHtml(label)}</h3>
        </div>
        <span class="badge rounded-pill bg-light-green text-green fw-semibold" style="font-size:.7rem;" data-leg-class>${escapeHtml(currentClass)}</span>
      </div>

      <p class="text-secondary mb-2 fw-semibold" style="font-size:.875rem;">
        ${escapeHtml(f.airline || "—")} · ${escapeHtml(f.flightNumber || "")}
      </p>

      <div class="d-flex align-items-center gap-3">
        <div>
          <div class="fw-bolder lh-1 mb-1" style="font-size:1.375rem;">${escapeHtml(f.departureTime || "—")}</div>
          <div class="text-secondary fw-semibold" style="font-size:.72rem;">${escapeHtml(f.originCode || "")}</div>
        </div>
        <div class="flex-fill text-center">
          <div class="text-secondary fw-semibold mb-1" style="font-size:.75rem;">${durLabel}</div>
          <!-- Line with a small plane riding it -->
          <div class="position-relative d-flex align-items-center">
            <span class="rounded-circle bg-secondary-subtle flex-shrink-0" style="width:8px;height:8px;"></span>
            <span class="flex-fill border-top border-2" style="border-style:dashed!important;"></span>
            <span class="position-absolute top-50 start-50 translate-middle d-inline-flex align-items-center justify-content-center bg-white"
                  style="width:32px;height:22px;">
              <i class="bi bi-airplane-fill text-green" style="font-size:1rem;transform:rotate(90deg);"></i>
            </span>
            <span class="flex-fill border-top border-2" style="border-style:dashed!important;"></span>
            <span class="rounded-circle bg-secondary-subtle flex-shrink-0" style="width:8px;height:8px;"></span>
          </div>
          <div class="fw-semibold mt-1 ${stopsClass}" style="font-size:.7rem;${stopsStyle}">${escapeHtml(stopsLabel)}</div>
        </div>
        <div class="text-end">
          <div class="fw-bolder lh-1 mb-1" style="font-size:1.375rem;">${escapeHtml(f.arrivalTime || "—")}</div>
          <div class="text-secondary fw-semibold" style="font-size:.72rem;">${escapeHtml(f.destinationCode || "")}</div>
        </div>
      </div>
    </div>
  `;
}

/* Re-paint the small "Business" pill on each journey card after a
   cabin change. Lighter than re-rendering the whole card. */
function refreshLegBadges() {
  const cards = els.journeyCards.querySelectorAll("[data-leg-class]");
  if (state.isRoundTrip) {
    if (cards[0]) cards[0].textContent = state.outboundClass;
    if (cards[1]) cards[1].textContent = state.returnClass;
  } else if (cards[0]) {
    cards[0].textContent = state.outboundClass;
  }
}

/* ---------- Cabin pickers ---------- */

function buildOutboundPicker() {
  if (!els.outboundPicker) return;
  paintPicker(els.outboundPicker, state.flight, state.outboundClass, "outbound");
}

function buildReturnPicker() {
  if (!els.returnPicker) return;
  paintPicker(els.returnPicker, state.returnFlight, state.returnClass, "return");
}

/* Render one cabin picker — rows sorted cheapest-first, each showing
   the class name + delta relative to the SELECTED class (not the
   cheapest). Selected row shows the absolute price. */
function paintPicker(container, leg, currentClass, kind) {
  const prices  = leg.cabinPrices || {};
  const base    = prices[currentClass];
  const classes = Object.keys(prices).sort(function (a, b) {
    return prices[a] - prices[b];
  });

  container.innerHTML = classes.map(function (c) {
    const delta    = prices[c] - base;
    const selected = (c === currentClass);
    let label;
    if (selected)        label = "$" + base.toLocaleString("en-US");
    else if (delta > 0)  label = "+$" + delta.toLocaleString("en-US");
    else                 label = "-$" + Math.abs(delta).toLocaleString("en-US");

    const activeCls = selected ? "border-2 border-success bg-light-green" : "border";
    const check     = selected ? `<img src="/assets/icons/badge-verified.svg" alt="" width="14" height="14" class="ms-2" />` : "";
    const labelCls  = selected ? "text-green" : (delta > 0 ? "text-muted" : "text-nav-green");

    return `
      <button type="button"
              class="d-flex align-items-center justify-content-between p-3 rounded-3 ${activeCls}"
              style="background:${selected ? "" : "#fff"};border-style:solid;"
              data-cabin-pick="${escapeAttr(c)}"
              data-cabin-leg="${kind}">
        <span class="fw-semibold d-flex align-items-center">${escapeHtml(c)}${check}</span>
        <span class="fw-bold ${labelCls}">${label}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-cabin-pick]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const next = btn.dataset.cabinPick;
      const leg  = btn.dataset.cabinLeg;
      if (leg === "return") {
        if (next === state.returnClass) return;
        state.returnClass = next;
      } else {
        if (next === state.outboundClass) return;
        state.outboundClass = next;
      }
      // Rebuild the picker so the deltas re-anchor to the new selection
      if (leg === "return") buildReturnPicker();
      else                  buildOutboundPicker();
      refreshLegBadges();
      recompute();
    });
  });
}

/* ---------- Recompute (every cabin change re-derives totals + baggage) ---------- */

function recompute() {
  const outboundFare = state.flight.cabinPrices[state.outboundClass];
  const returnFare   = state.isRoundTrip ? state.returnFlight.cabinPrices[state.returnClass] : 0;
  const baseFare     = outboundFare + returnFare;
  const taxes        = Math.round(baseFare * FLIGHT_TAX_RATE);
  const total        = baseFare + taxes;

  if (els.totalPrice) els.totalPrice.textContent = fmtMoney(total);
  if (els.lineTotal)  els.lineTotal.textContent  = fmtMoney(total);

  // Fare line items — exact labels per spec.
  if (els.fareLines) {
    const lines = state.isRoundTrip
      ? [
          { label: "Departure fare", amount: outboundFare },
          { label: "Return fare",    amount: returnFare   }
        ]
      : [
          { label: "Base fare",      amount: outboundFare }
        ];
    lines.push({ label: "Local Taxes", amount: taxes });

    els.fareLines.innerHTML = lines.map(function (li) {
      return `
        <div class="d-flex justify-content-between small mb-2">
          <span class="text-muted">${escapeHtml(li.label)}</span>
          <span>${fmtMoney(li.amount)}</span>
        </div>
      `;
    }).join("");
  }

  // Baggage allowance — per leg. Round-trip shows two columns
  // (Departure + Return) so the user sees both cabin tiers at once.
  renderBaggage();
}

function renderBaggage() {
  if (!els.baggageContent) return;
  if (state.isRoundTrip) {
    els.baggageContent.innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">${baggageLegHtml("Departure", state.outboundClass)}</div>
        <div class="col-md-6">${baggageLegHtml("Return",    state.returnClass)}</div>
      </div>
    `;
  } else {
    els.baggageContent.innerHTML = baggageLegHtml("Flight", state.outboundClass);
  }
}

function baggageLegHtml(label, cabinClass) {
  const bag = baggageFor(cabinClass) || { cabin: "—", checked: "—" };
  return `
    <div class="border rounded-3 p-3 h-100">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <span class="text-uppercase fw-bold" style="font-size:.65rem;color:#a1a1aa;letter-spacing:.1em;">${escapeHtml(label)}</span>
        <span class="badge rounded-pill bg-light-green text-green fw-semibold" style="font-size:.7rem;">${escapeHtml(cabinClass)}</span>
      </div>

      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-light-green flex-shrink-0" style="width:38px;height:38px;">
          <img src="/assets/icons/Baggage.svg" alt="" width="18" height="18" />
        </span>
        <div>
          <p class="text-uppercase fw-bold mb-0" style="font-size:.6rem;color:#a1a1aa;letter-spacing:.08em;">Cabin Baggage</p>
          <p class="fw-bolder mb-0" style="font-size:1.0625rem;">${escapeHtml(bag.cabin)}</p>
        </div>
      </div>

      <div class="d-flex align-items-center gap-3">
        <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-light-purple flex-shrink-0" style="width:38px;height:38px;">
          <img src="/assets/icons/Baggage.svg" alt="" width="18" height="18" />
        </span>
        <div>
          <p class="text-uppercase fw-bold mb-0" style="font-size:.6rem;color:#a1a1aa;letter-spacing:.08em;">Checked Baggage</p>
          <p class="fw-bolder mb-0" style="font-size:1.0625rem;">${escapeHtml(bag.checked)}</p>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Traveller block (mirrors hotel-details exactly) ---------- */

async function maybeMountTravellerBlock() {
  if (!auth.currentUser) {
    if (els.travellerBlock) els.travellerBlock.classList.add("d-none");
    if (els.signinNudge)    els.signinNudge.classList.remove("d-none");
    return;
  }
  if (els.travellerBlock) els.travellerBlock.classList.remove("d-none");
  if (els.signinNudge)    els.signinNudge.classList.add("d-none");

  let profile = null;
  try {
    profile = await fetchProfile();
  } catch (err) {
    console.warn("[flight-details] could not prefill traveller:", err);
  }

  state.profileTraveller = {
    name:     (profile && profile.fullName)       || auth.currentUser.displayName || "",
    email:    (profile && profile.email)          || auth.currentUser.email       || "",
    passport: (profile && profile.passportNumber) || "",
    phone:    (profile && profile.phoneNumber)    || ""
  };

  fillTravellerFromProfile();
  setTravellerEditable(false);
}

function fillTravellerFromProfile() {
  const p = state.profileTraveller || {};
  if (els.travName)     els.travName.value     = p.name     || "";
  if (els.travEmail)    els.travEmail.value    = p.email    || "";
  if (els.travPassport) els.travPassport.value = p.passport || "";
  if (els.travPhone)    els.travPhone.value    = p.phone    || "";
}

function clearTravellerFields() {
  if (els.travName)     els.travName.value     = "";
  if (els.travEmail)    els.travEmail.value    = "";
  if (els.travPassport) els.travPassport.value = "";
  if (els.travPhone)    els.travPhone.value    = "";
}

function setTravellerEditable(editable) {
  [els.travName, els.travEmail, els.travPassport, els.travPhone].forEach(function (el) {
    if (!el) return;
    if (editable) el.removeAttribute("disabled");
    else          el.setAttribute("disabled", "");
  });
  if (els.travHelper) {
    if (editable) {
      els.travHelper.textContent = "Enter the traveller's details below.";
    } else {
      els.travHelper.textContent = "Booking under your profile. Toggle the switch to enter another traveller's details.";
    }
  }
}

function onTravellerToggle() {
  if (!els.travToggle) return;
  if (els.travToggle.checked) {
    clearTravellerFields();
    setTravellerEditable(true);
    if (els.travName) els.travName.focus();
  } else {
    fillTravellerFromProfile();
    setTravellerEditable(false);
  }
}

function readTraveller() {
  return {
    name:     (els.travName     && els.travName.value     || "").trim(),
    email:    (els.travEmail    && els.travEmail.value    || "").trim(),
    passport: (els.travPassport && els.travPassport.value || "").trim(),
    phone:    (els.travPhone    && els.travPhone.value    || "").trim()
  };
}

function validateTraveller(t) {
  if (!t.name)     return "Please enter the traveller's full name.";
  if (!t.email)    return "Please enter the traveller's email.";
  if (!t.passport) return "Please enter the traveller's passport number.";
  if (!t.phone)    return "Please enter the traveller's phone number.";
  return null;
}

/* ---------- Confirm → build PaymentRequest → goToPayment ---------- */

async function onConfirm() {
  // 0. Guest gate
  if (!auth.currentUser) {
    const ok = await ensureSignedIn();
    if (!ok) return;
    return;        // user returns after sign-in, consumeAuthReturnFlag() runs
  }

  // 1. Traveller validity
  const traveller = readTraveller();
  const err = validateTraveller(traveller);
  if (err) {
    toast(err, "danger");
    return;
  }

  // 2. Re-derive prices (defensive — user may have changed cabin since paint)
  const outboundFare = state.flight.cabinPrices[state.outboundClass];
  const returnFare   = state.isRoundTrip ? state.returnFlight.cabinPrices[state.returnClass] : 0;
  const baseFare     = outboundFare + returnFare;
  const taxes        = Math.round(baseFare * FLIGHT_TAX_RATE);
  const total        = baseFare + taxes;

  // 3. Build PaymentRequest — field names + labels per spec verbatim
  const lineItems = state.isRoundTrip
    ? [
        { label: "Departure fare", amount: outboundFare },
        { label: "Return fare",    amount: returnFare   }
      ]
    : [
        { label: "Base fare",      amount: outboundFare }
      ];
  lineItems.push({ label: "Local Taxes", amount: taxes });

  let title, subtitle;
  if (state.isRoundTrip) {
    title = "Round Trip";
    const classLabel = state.outboundClass === state.returnClass
      ? state.outboundClass
      : `${state.outboundClass} / ${state.returnClass}`;
    subtitle = `${state.flight.originCity} → ${state.flight.destinationCity} → ${state.flight.originCity} · ${classLabel}`;
  } else {
    title    = state.flight.airline;
    subtitle = `${state.flight.originCity} → ${state.flight.destinationCity} · ${state.flight.flightNumber} · ${state.outboundClass}`;
  }

  const segments = state.isRoundTrip
    ? [
        { label: "Departure",
          route:  `${state.flight.originCity} → ${state.flight.destinationCity}`,
          detail: `${state.flight.flightNumber} · ${state.flight.departureTime} - ${state.flight.arrivalTime} · ${state.outboundClass}` },
        { label: "Return",
          route:  `${state.returnFlight.originCity} → ${state.returnFlight.destinationCity}`,
          detail: `${state.returnFlight.flightNumber} · ${state.returnFlight.departureTime} - ${state.returnFlight.arrivalTime} · ${state.returnClass}` }
      ]
    : [
        { label: "Flight",
          route:  `${state.flight.originCity} → ${state.flight.destinationCity}`,
          detail: `${state.flight.flightNumber} · ${state.flight.departureTime} - ${state.flight.arrivalTime} · ${state.outboundClass}` }
      ];

  const request = {
    type:       "flight",
    title:      title,
    subtitle:   subtitle,
    lineItems:  lineItems,
    total:      total,
    travelDate: state.query.departureDate,
    returnDate: state.isRoundTrip ? state.query.returnDate : null,
    segments:   segments,
    traveller:  traveller
  };

  setBusy(els.confirmBtn, true);
  try {
    // Stage 3 payload is consumed — drop it before navigating so the
    // back button can't replay it with stale data.
    clearFlightBookingPayload();
    goToPayment(request);
  } catch (err) {
    console.error("[flight-details] goToPayment failed:", err);
    setBusy(els.confirmBtn, false);
    toast("Couldn't open the payment page. Please try again.", "danger");
  }
}

/* ---------- Format helpers ---------- */

function buildStopsLabel(f) {
  if (!f.stops || f.stops === 0) return "Direct";
  if (f.stops === 1) return `1 stop · ${f.stopCity || "—"}`;
  return `${f.stops} stops · ${f.stopCity || "—"}`;
}

function buildDurationLabel(minutes) {
  if (!minutes || minutes < 0) return "—";
  const h  = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  return `${h}h ${mm}m`;
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(amount) {
  if (typeof amount !== "number" || isNaN(amount)) return "—";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ---------- UI helpers ---------- */

function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Opening payment…";
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

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
