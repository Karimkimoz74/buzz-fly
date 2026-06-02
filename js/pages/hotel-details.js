/* =====================================================
   Buzz Fly — hotel-details.js (Stage 3, hotel side)

   Reads ?id + carried search query from the URL, fetches
   the hotel, builds a sticky booking card with a room
   picker / check-in / check-out / guests, recomputes the
   price breakdown on every change, prefills the traveller
   block from users/{uid} when signed in, and on Confirm
   builds a PaymentRequest matching the spec verbatim and
   hands it to the shared payment view.

   URL params:
     id          — hotel doc id (REQUIRED)
     roomType    — pre-selected room type (optional)
     checkIn     — yyyy-mm-dd (optional, defaults to today + 1)
     checkOut    — yyyy-mm-dd (optional, defaults to today + 3)
     guests      — integer 1..6 (optional, defaults to 2)
     destination — display only (optional)
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { fetchProfile } from "/js/firebase/auth.js";
import {
  getAllHotels,
  withRoomType,
  cheapestRoomTypeOf
} from "/js/firebase/hotels.js";
import {
  ROOM_CAPACITY,
  ROOM_TYPES,
  eligibleRoomTypes,
  MAX_ROOM_CAPACITY
} from "/js/firebase/constants.js";
import {
  goToPayment,
  ensureSignedIn,
  consumeAuthReturnFlag
} from "/js/firebase/payment-bridge.js";

const HOTEL_TAX_RATE     = 0.09;   // applied to basePrice
const SERVICE_FEE_RATE   = 0.15;   // applied to per-night, ONCE

/* ---------- DOM refs ---------- */

const els = {
  galleryInner:    document.querySelector("[data-hotel-gallery-inner]"),
  galleryDots:     document.querySelector("[data-hotel-gallery-indicators]"),
  title:           document.querySelector("[data-hotel-title]"),
  rating:          document.querySelector("[data-hotel-rating]"),
  location:        document.querySelector("[data-hotel-location]"),
  locationLine:    document.querySelector("[data-hotel-location-line]"),
  description:     document.querySelector("[data-hotel-description]"),

  card:            document.querySelector("[data-booking-card]"),
  loading:         document.querySelector("[data-booking-loading]"),
  error:           document.querySelector("[data-booking-error]"),
  errorMsg:        document.querySelector("[data-booking-error-msg]"),
  form:            document.querySelector("[data-booking-form]"),

  pricePerNight:   document.querySelector("[data-price-per-night]"),
  roomType:        document.getElementById("hd-room-type"),
  checkIn:         document.getElementById("hd-checkin"),
  checkOut:        document.getElementById("hd-checkout"),
  guests:          document.getElementById("hd-guests"),

  lineBaseLabel:   document.querySelector("[data-line-base-label]"),
  lineBaseAmount:  document.querySelector("[data-line-base-amount]"),
  lineTaxes:       document.querySelector("[data-line-taxes]"),
  lineService:     document.querySelector("[data-line-service]"),
  lineTotal:       document.querySelector("[data-line-total]"),

  travellerBlock:  document.querySelector("[data-traveller-block]"),
  travToggle:      document.getElementById("hd-trav-toggle"),
  travHelper:      document.querySelector("[data-trav-helper]"),
  travName:        document.getElementById("hd-trav-name"),
  travEmail:       document.getElementById("hd-trav-email"),
  travPassport:    document.getElementById("hd-trav-passport"),
  travPhone:       document.getElementById("hd-trav-phone"),

  confirmBtn:      document.querySelector("[data-confirm-btn]"),
  signinNudge:     document.querySelector("[data-signin-nudge]")
};

/* ---------- Page state ---------- */

const state = {
  hotel:            null,    // raw Firestore doc { id, title, location, roomPrices, ... }
  destination:      "",
  checkIn:          null,    // Date
  checkOut:         null,    // Date
  guests:           2,
  selectedRoomType: null,    // string
  profileTraveller: null     // { name, email, passport, phone } cached for the toggle
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  parseUrl();
  await loadHotel();
  if (!state.hotel) return;   // showError already painted

  renderHotelChrome();
  buildRoomTypeSelect();
  buildGuestsSelect();
  populateFormFromState();
  bindFormHandlers();

  await auth.authStateReady();
  await maybeMountTravellerBlock();

  recompute();

  // If the user just came back from sign-in, prompt them to re-tap Confirm.
  if (consumeAuthReturnFlag()) {
    toast("Signed in. Review your details and tap Confirm again.");
  }
});

/* ---------- URL parsing ---------- */

function parseUrl() {
  const p = new URLSearchParams(window.location.search);

  state.destination       = p.get("destination") || "";
  state.selectedRoomType  = p.get("roomType") || null;

  const today = startOfDay(new Date());
  const inIso  = p.get("checkIn");
  const outIso = p.get("checkOut");
  state.checkIn  = parseIsoDate(inIso)  || addDays(today, 1);
  state.checkOut = parseIsoDate(outIso) || addDays(today, 3);
  if (state.checkOut <= state.checkIn) {
    state.checkOut = addDays(state.checkIn, 2);
  }

  const g = parseInt(p.get("guests") || "2", 10);
  state.guests = (isNaN(g) || g < 1) ? 2 : Math.min(g, MAX_ROOM_CAPACITY);
}

/* ---------- Data load ---------- */

async function loadHotel() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showError("This hotel link is missing an id.");
    return;
  }

  let hotels;
  try {
    hotels = await getAllHotels();
  } catch (err) {
    console.error("[hotel-details] hotels fetch failed:", err);
    showError("Couldn't reach the hotel catalogue. Please try again.");
    return;
  }

  const found = hotels.find(function (h) { return h.id === id; });
  if (!found) {
    showError("This hotel is no longer available.");
    return;
  }
  state.hotel = found;

  // Validate the carried room type (it might be unavailable on this hotel)
  if (state.selectedRoomType && !(state.selectedRoomType in (state.hotel.roomPrices || {}))) {
    state.selectedRoomType = null;
  }
  if (!state.selectedRoomType) {
    state.selectedRoomType = cheapestRoomTypeOf(state.hotel);
  }
}

function showError(message) {
  if (els.loading) els.loading.classList.add("d-none");
  if (els.form)    els.form.classList.add("d-none");
  if (els.error)   els.error.classList.remove("d-none");
  if (els.errorMsg) els.errorMsg.textContent = message;
}

/* ---------- Render ---------- */

function renderHotelChrome() {
  if (els.loading) els.loading.classList.add("d-none");
  if (els.form)    els.form.classList.remove("d-none");

  const h = state.hotel;
  if (els.title)        els.title.textContent       = h.title || "—";
  if (els.rating)       els.rating.textContent      = h.rating != null ? String(h.rating) : "—";
  if (els.location)     els.location.textContent    = h.location || state.destination || "—";
  if (els.locationLine) els.locationLine.textContent = h.location || state.destination || "—";
  if (els.description)  els.description.textContent  = h.description || "An editorial escape curated for premium travellers.";

  populateGallery();
}

/* Build the carousel from hotel.images (array of 5 fully-resolved
   HTTPS URLs). Falls back to imageUrl when the gallery array is
   missing — defensive; the seed always writes 5. */
function populateGallery() {
  if (!els.galleryInner) return;

  const h = state.hotel;
  let urls = Array.isArray(h.images) ? h.images.slice() : [];
  if (urls.length === 0 && h.imageUrl) {
    urls = [h.imageUrl];
  }
  if (urls.length === 0) {
    els.galleryInner.innerHTML = "";
    if (els.galleryDots) els.galleryDots.innerHTML = "";
    return;
  }

  els.galleryInner.innerHTML = urls.map(function (url, i) {
    const active = i === 0 ? " active" : "";
    return `<div class="carousel-item${active} h-100">
              <img src="${escapeAttr(url)}" class="w-100 h-100 object-fit-cover d-block" alt="" />
            </div>`;
  }).join("");

  if (els.galleryDots) {
    els.galleryDots.innerHTML = urls.map(function (_url, i) {
      const isFirst = i === 0;
      const extra   = isFirst ? ' class="active" aria-current="true"' : "";
      return `<button type="button" data-bs-target="#hotelGallery" data-bs-slide-to="${i}"${extra} aria-label="Slide ${i + 1}"></button>`;
    }).join("");
  }
}

function escapeAttr(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* Build the room-type <select>. Options listed in their canonical order
   (constants.js ROOM_TYPES). Rooms the hotel doesn't offer are skipped.
   Rooms that can't fit the current guest count are disabled but visible. */
function buildRoomTypeSelect() {
  if (!els.roomType) return;
  els.roomType.innerHTML = "";

  const offered = Object.keys(state.hotel.roomPrices || {});
  const eligible = eligibleRoomTypes(state.guests);

  ROOM_TYPES.forEach(function (rt) {
    if (offered.indexOf(rt) === -1) return;
    const cap   = ROOM_CAPACITY[rt];
    const price = state.hotel.roomPrices[rt];
    const fits  = eligible.indexOf(rt) !== -1;
    const opt = document.createElement("option");
    opt.value = rt;
    opt.textContent = `${rt} · sleeps ${cap} · $${price}/night`;
    if (!fits) {
      opt.disabled = true;
      opt.textContent = `${rt} · too small for ${state.guests} guests`;
    }
    if (rt === state.selectedRoomType) opt.selected = true;
    els.roomType.appendChild(opt);
  });
}

function buildGuestsSelect() {
  if (!els.guests) return;
  els.guests.innerHTML = "";
  for (let i = 1; i <= MAX_ROOM_CAPACITY; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i === 1 ? "1 Guest" : `${i} Guests`;
    if (i === state.guests) opt.selected = true;
    els.guests.appendChild(opt);
  }
}

function populateFormFromState() {
  if (els.checkIn)  els.checkIn.value  = isoOf(state.checkIn);
  if (els.checkOut) els.checkOut.value = isoOf(state.checkOut);
  if (els.checkIn)  els.checkIn.min    = isoOf(startOfDay(new Date()));
  if (els.checkOut) els.checkOut.min   = isoOf(addDays(state.checkIn, 1));
}

function bindFormHandlers() {
  if (els.roomType) {
    els.roomType.addEventListener("change", function () {
      state.selectedRoomType = els.roomType.value;
      recompute();
    });
  }

  if (els.checkIn) {
    els.checkIn.addEventListener("change", function () {
      const picked = parseIsoDate(els.checkIn.value);
      if (!picked) return;
      state.checkIn = picked;
      // Keep check-out strictly after check-in
      els.checkOut.min = isoOf(addDays(state.checkIn, 1));
      if (state.checkOut <= state.checkIn) {
        state.checkOut = addDays(state.checkIn, 1);
        els.checkOut.value = isoOf(state.checkOut);
      }
      recompute();
    });
  }

  if (els.checkOut) {
    els.checkOut.addEventListener("change", function () {
      const picked = parseIsoDate(els.checkOut.value);
      if (!picked || picked <= state.checkIn) return;
      state.checkOut = picked;
      recompute();
    });
  }

  if (els.guests) {
    els.guests.addEventListener("change", function () {
      const n = parseInt(els.guests.value, 10);
      if (isNaN(n) || n < 1) return;
      state.guests = Math.min(n, MAX_ROOM_CAPACITY);
      // Rebuild the room-type select so ineligible rooms get disabled labels.
      buildRoomTypeSelect();
      recompute();
    });
  }

  if (els.confirmBtn) {
    els.confirmBtn.addEventListener("click", onConfirm);
  }
  if (els.travToggle) {
    els.travToggle.addEventListener("change", onTravellerToggle);
  }
}

/* ---------- Pricing (recompute on every change) ---------- */

function recompute() {
  const scoped = withRoomType(state.hotel, state.selectedRoomType);
  if (!scoped) {
    // Hotel doesn't offer this type — fall back to cheapest.
    state.selectedRoomType = cheapestRoomTypeOf(state.hotel);
    buildRoomTypeSelect();
    return recompute();
  }

  const nights      = Math.max(1, daysBetween(state.checkIn, state.checkOut));
  const perNight    = scoped.pricePerNight;
  const basePrice   = perNight * nights;
  const taxes       = Math.round(basePrice * HOTEL_TAX_RATE);
  const serviceFee  = Math.round(perNight * SERVICE_FEE_RATE);
  const total       = basePrice + taxes + serviceFee;

  if (els.pricePerNight) els.pricePerNight.textContent = fmtMoney(perNight);

  if (els.lineBaseLabel)  els.lineBaseLabel.textContent  = `Base price (${nights} night${nights === 1 ? "" : "s"})`;
  if (els.lineBaseAmount) els.lineBaseAmount.textContent = fmtMoney(basePrice);
  if (els.lineTaxes)      els.lineTaxes.textContent      = fmtMoney(taxes);
  if (els.lineService)    els.lineService.textContent    = fmtMoney(serviceFee);
  if (els.lineTotal)      els.lineTotal.textContent      = fmtMoney(total);

  // Stash on state for Confirm — recomputed lazily anyway.
}

/* ---------- Traveller block ---------- */

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
    console.warn("[hotel-details] could not prefill traveller:", err);
  }

  // Cache profile-derived values so the "another traveller" toggle can
  // restore them when the user un-checks it.
  state.profileTraveller = {
    name:     (profile && profile.fullName)       || auth.currentUser.displayName || "",
    email:    (profile && profile.email)          || auth.currentUser.email       || "",
    passport: (profile && profile.passportNumber) || "",
    phone:    (profile && profile.phoneNumber)    || ""
  };

  // Default state: locked, showing profile values.
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
    // Booking for someone else — clear + unlock.
    clearTravellerFields();
    setTravellerEditable(true);
    if (els.travName) els.travName.focus();
  } else {
    // Booking for me again — restore profile values + lock.
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
    if (!ok) return;     // user is being redirected to sign-in
    // After sign-in lands back here, the page re-runs DOMContentLoaded;
    // the toast is shown by consumeAuthReturnFlag(). Don't proceed now.
    return;
  }

  // 1. Traveller validity
  const traveller = readTraveller();
  const travellerErr = validateTraveller(traveller);
  if (travellerErr) {
    toast(travellerErr, "danger");
    return;
  }

  // 2. Capacity sanity — spec: ROOM_CAPACITY[selectedRoomType] >= guests
  const cap = ROOM_CAPACITY[state.selectedRoomType];
  if (!cap || cap < state.guests) {
    toast(`${state.selectedRoomType} doesn't fit ${state.guests} guests. Choose a larger room.`, "danger");
    return;
  }

  // 3. Build PaymentRequest — exact field names + line-item labels per spec
  const scoped     = withRoomType(state.hotel, state.selectedRoomType);
  const nights     = Math.max(1, daysBetween(state.checkIn, state.checkOut));
  const perNight   = scoped.pricePerNight;
  const basePrice  = perNight * nights;
  const taxes      = Math.round(basePrice * HOTEL_TAX_RATE);
  const serviceFee = Math.round(perNight * SERVICE_FEE_RATE);
  const total      = basePrice + taxes + serviceFee;

  const lineItems = [
    { label: `Base price (${nights} nights)`, amount: basePrice  },
    { label: "Local Taxes",                   amount: taxes      },
    { label: "Service Fee",                   amount: serviceFee }
  ];

  const title    = state.hotel.title;
  const subtitle = `${state.selectedRoomType} · ${nights} night${nights === 1 ? "" : "s"}`;

  const request = {
    type:       "hotel",
    title:      title,
    subtitle:   subtitle,
    lineItems:  lineItems,
    total:      total,
    travelDate: state.checkIn,        // semantic: check-in
    returnDate: state.checkOut,       // semantic: check-out
    segments:   [],                    // hotels have no per-leg detail
    traveller:  traveller
  };

  setBusy(els.confirmBtn, true);
  try {
    goToPayment(request);
  } catch (err) {
    console.error("[hotel-details] goToPayment failed:", err);
    setBusy(els.confirmBtn, false);
    toast("Couldn't open the payment page. Please try again.", "danger");
  }
}

/* ---------- Date / format helpers ---------- */

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

function isoOf(d) {
  if (!(d instanceof Date)) return "";
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
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
