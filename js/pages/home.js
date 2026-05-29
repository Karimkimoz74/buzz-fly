/* =====================================================
   Buzz Fly — home.js (page script)
   Drives the home page search card (Flights + Hotels tabs).

   STAGE 1 of the hotel flow (per the contract):
   - Populates the destination autocomplete from DESTINATIONS
   - Caps the guests stepper at MAX_ROOM_CAPACITY (= 6)
   - Two-way coupling between guests and roomType:
       * Picking a roomType shrinks the guests max to capacityFor(type)
       * Setting guests filters the room-type dropdown to types that fit
       * If guests > capacity of all types, blocks the dropdown with a msg
   - Validates destination is non-empty
   - Navigates to /pages/hotel-results.html with every param in the URL

   The flights Search button just navigates for now — no field collection
   (real flight search lands later when the contract for flights is ready).

   Loaded as <script type="module"> on:
     index.html
   ===================================================== */

import {
  DESTINATIONS,
  AIRPORTS,
  ROOM_TYPES,
  ROOM_CAPACITY,
  MAX_ROOM_CAPACITY,
  capacityFor,
  eligibleRoomTypes
} from "/js/firebase/constants.js";

document.addEventListener("DOMContentLoaded", () => {
  hydrateDestinationAutocomplete();
  initHotelSearchForm();
  hydrateAirportsAutocomplete();
  initFlightSearchForm();
});

/* ---------- Destination <datalist> ---------- */
function hydrateDestinationAutocomplete() {
  const dataList = document.getElementById("hotel-dest-options");
  if (!dataList) {
    return;
  }
  let html = "";
  for (const city of DESTINATIONS) {
    html += `<option value="${city}"></option>`;
  }
  dataList.innerHTML = html;
}

/* ---------- Hotels search ---------- */
function initHotelSearchForm() {
  const destEl     = document.getElementById("hotel-dest");
  const checkInEl  = document.getElementById("hotel-checkin");
  const checkOutEl = document.getElementById("hotel-checkout");
  const guestsEl   = document.getElementById("hotel-guests");
  const roomTypeEl = document.getElementById("hotel-room-type");
  const btnEl      = document.getElementById("hotel-search-btn");
  const msgEl      = document.getElementById("hotel-search-msg");
  if (!destEl) {
    return; // not on the home page
  }

  // Min date = today on the check-in field
  const todayIso = new Date().toISOString().slice(0, 10);
  checkInEl.min  = todayIso;
  checkOutEl.min = todayIso;

  // Initial: no cap applied on guests select (all 1–6 enabled)
  rebuildGuestsSelect(guestsEl, MAX_ROOM_CAPACITY);

  // Initial population of the room-type select (all types, no guest filter)
  rebuildRoomTypeSelect(roomTypeEl, "", 0);

  /* --- Coupling: when guests changes --- */
  guestsEl.addEventListener("change", () => {
    const guests = parseGuestCount(guestsEl.value);
    const eligible = eligibleRoomTypes(guests);
    rebuildRoomTypeSelect(roomTypeEl, roomTypeEl.value, guests);

    // If the currently-picked room type can't fit, clear it
    if (roomTypeEl.value && !eligible.includes(roomTypeEl.value)) {
      roomTypeEl.value = "";
    }
    clearMsg(msgEl);
  });

  /* --- Coupling: when roomType changes --- */
  roomTypeEl.addEventListener("change", () => {
    const cap = capacityFor(roomTypeEl.value);
    if (cap !== null) {
      // Disable guest options above this room's capacity
      rebuildGuestsSelect(guestsEl, cap);
    } else {
      // "Any" picked — restore the global cap
      rebuildGuestsSelect(guestsEl, MAX_ROOM_CAPACITY);
    }
    clearMsg(msgEl);
  });

  /* --- Date coupling: check-out > check-in --- */
  checkInEl.addEventListener("change", () => {
    if (checkInEl.value) {
      checkOutEl.min = nextDayIso(checkInEl.value);
      if (checkOutEl.value && checkOutEl.value <= checkInEl.value) {
        checkOutEl.value = "";
      }
    }
  });

  /* --- Search submit --- */
  btnEl.addEventListener("click", () => {
    clearMsg(msgEl);

    const destination = destEl.value.trim();
    if (!destination) {
      showMsg(msgEl, "danger", "Please enter a destination.");
      destEl.focus();
      return;
    }

    const checkIn  = checkInEl.value || "";
    const checkOut = checkOutEl.value || "";
    if (checkIn && checkOut && checkOut <= checkIn) {
      showMsg(msgEl, "danger", "Check-out must be after check-in.");
      return;
    }

    const guests   = parseGuestCount(guestsEl.value);
    const roomType = roomTypeEl.value || "";

    const params = new URLSearchParams();
    params.set("destination", destination);
    if (checkIn)  params.set("checkIn",  checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (guests)   params.set("guests",   String(guests));
    if (roomType) params.set("roomType", roomType);

    window.location.href = `pages/hotel-results.html?${params.toString()}`;
  });
}

/* Rebuild the guests <select> options. Values above `maxAllowed` are
   rendered but disabled so the user can see why they're missing.
   Preserves the current selection if it's still within the cap. */
function rebuildGuestsSelect(selectEl, maxAllowed) {
  const current = selectEl.value;
  let html = `<option value="">Any</option>`;
  for (let n = 1; n <= MAX_ROOM_CAPACITY; n++) {
    const label = n === 1 ? "1 guest" : `${n} guests`;
    if (n > maxAllowed) {
      html += `<option value="${n}" disabled>${label}</option>`;
    } else {
      html += `<option value="${n}">${label}</option>`;
    }
  }
  selectEl.innerHTML = html;

  // Restore previous selection if it still fits
  if (current && parseInt(current, 10) <= maxAllowed) {
    selectEl.value = current;
  } else {
    selectEl.value = "";
  }
}

/* Build the <option> list inside the room-type select, filtered by
   what fits the current guest count. */
function rebuildRoomTypeSelect(selectEl, currentValue, guestCount) {
  const eligible = eligibleRoomTypes(guestCount);

  let html = `<option value="">Any</option>`;
  for (const type of ROOM_TYPES) {
    const fits = eligible.includes(type);
    if (!fits) {
      // Render but disable, so the user sees why it's missing
      html += `<option value="${type}" disabled>${type} (fits ${ROOM_CAPACITY[type]})</option>`;
    } else {
      html += `<option value="${type}">${type} (fits ${ROOM_CAPACITY[type]})</option>`;
    }
  }
  selectEl.innerHTML = html;

  // Restore the previous value if it's still eligible
  if (currentValue && eligible.includes(currentValue)) {
    selectEl.value = currentValue;
  } else {
    selectEl.value = "";
  }
}

/* ============================================================
   FLIGHTS — Stage 1 of the flight flow
   Collects: isRoundTrip, origin {code, city}, destination {code, city},
   departureDate, returnDate (round-trip only), cabinClass.
   Passengers HARDCODED to 1 — no picker exposed.
   Builds a FlightSearchQuery in the URL and pushes to
   pages/flight-search.html (the results page).
   No Firestore call. Guest mode allowed.
   ============================================================ */

function hydrateAirportsAutocomplete() {
  const dataList = document.getElementById("flight-airports");
  if (!dataList) return;
  let html = "";
  for (const a of AIRPORTS) {
    // Format "City · CODE" — user can type either the city or the IATA
    // code and the datalist substring-match will surface this option.
    html += `<option value="${a.city} · ${a.code}"></option>`;
  }
  dataList.innerHTML = html;
}

function initFlightSearchForm() {
  const fromEl    = document.getElementById("flight-from");
  if (!fromEl) return; // not on the home page

  const toEl      = document.getElementById("flight-to");
  const depEl     = document.getElementById("flight-departure");
  const retEl     = document.getElementById("flight-return");
  const retCol    = document.querySelector("[data-flight-return-col]");
  const cabinEl   = document.getElementById("flight-cabin");
  const btnEl     = document.getElementById("flight-search-btn");
  const msgEl     = document.getElementById("flight-search-msg");
  const tripBtns  = document.querySelectorAll("[data-flight-trip]");
  const flightOnly = document.querySelector("[data-flight-only]");

  // The Round Trip / One Way toggle lives next to the Flights/Hotels
  // tabs in the card header — it's only meaningful on the Flights tab,
  // so we hide it when the user switches to Hotels.
  const flightsTabBtn = document.querySelector('[data-bs-target="#flights-pane"]');
  const hotelsTabBtn  = document.querySelector('[data-bs-target="#hotels-pane"]');
  if (flightOnly && flightsTabBtn && hotelsTabBtn) {
    flightsTabBtn.addEventListener("shown.bs.tab", function () {
      flightOnly.classList.remove("d-none");
    });
    hotelsTabBtn.addEventListener("shown.bs.tab", function () {
      flightOnly.classList.add("d-none");
    });
  }

  // Min date = today on both date inputs
  const todayIso = new Date().toISOString().slice(0, 10);
  depEl.min = todayIso;
  retEl.min = todayIso;

  // ---- Trip-mode state (default Round Trip) ----
  let isRoundTrip = true;
  applyTripMode();

  tripBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.flightTrip === "roundtrip";
      if (next === isRoundTrip) return;
      isRoundTrip = next;
      applyTripMode();
      // Switching to One Way clears the return date per spec
      if (!isRoundTrip) {
        retEl.value = "";
      }
      clearMsg(msgEl);
    });
  });

  function applyTripMode() {
    tripBtns.forEach((btn) => {
      const active = btn.dataset.flightTrip === (isRoundTrip ? "roundtrip" : "oneway");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      if (active) {
        btn.classList.add("green-btn");
        btn.classList.remove("btn-light");
      } else {
        btn.classList.remove("green-btn");
        btn.classList.add("btn-light");
      }
    });
    // Hide the Return column when One Way
    if (retCol) {
      if (isRoundTrip) retCol.classList.remove("d-none");
      else             retCol.classList.add("d-none");
    }
  }

  // ---- Date coupling: returnDate strictly after departureDate ----
  depEl.addEventListener("change", () => {
    if (depEl.value) {
      retEl.min = nextDayIso(depEl.value);
      if (retEl.value && retEl.value <= depEl.value) {
        retEl.value = "";
      }
    }
  });

  // ---- Submit ----
  btnEl.addEventListener("click", () => {
    clearMsg(msgEl);

    const origin      = parseAirportPick(fromEl.value);
    const destination = parseAirportPick(toEl.value);

    // Validator 1: both airports set
    if (!origin || !destination) {
      showMsg(msgEl, "danger", "Choose a From and To airport.");
      return;
    }
    // Validator 2: airports differ
    if (origin.code === destination.code) {
      showMsg(msgEl, "danger", "From and To must be different.");
      return;
    }
    // Validator 3: dates set (return only required for round-trip)
    if (!depEl.value || (isRoundTrip && !retEl.value)) {
      showMsg(msgEl, "danger", "Choose your travel dates.");
      return;
    }

    // Build the FlightSearchQuery as URL params — the results page
    // reads these and starts fresh.
    const params = new URLSearchParams();
    params.set("originCode",      origin.code);
    params.set("originCity",      origin.city);
    params.set("destinationCode", destination.code);
    params.set("destinationCity", destination.city);
    params.set("departureDate",   depEl.value);            // yyyy-mm-dd ISO
    if (isRoundTrip) {
      params.set("returnDate",    retEl.value);
    }
    params.set("isRoundTrip",     isRoundTrip ? "1" : "0");
    params.set("cabinClass",      cabinEl.value);
    // passengers = 1, hardcoded; omitted from URL.

    window.location.href = `pages/flight-search.html?${params.toString()}`;
  });
}

/* Parse a free-text airport input into { code, city } or null.
   Accepts the canonical "City · CODE" datalist option, raw IATA codes
   (case-insensitive), or city names (exact then substring). */
function parseAirportPick(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Canonical "City · CODE" form (or "City (CODE)") — the datalist value
  const m = /^(.+?)\s*[·\(]\s*([A-Za-z]{3})\)?\s*$/.exec(trimmed);
  if (m) {
    const code = m[2].toUpperCase();
    const hit  = AIRPORTS.find((a) => a.code === code);
    if (hit) return hit;
  }

  // Raw IATA code
  const upper = trimmed.toUpperCase();
  const byCode = AIRPORTS.find((a) => a.code === upper);
  if (byCode) return byCode;

  // Exact city (case-insensitive)
  const lower = trimmed.toLowerCase();
  const byCityExact = AIRPORTS.find((a) => a.city.toLowerCase() === lower);
  if (byCityExact) return byCityExact;

  // Substring city match (first hit)
  const byCityFuzzy = AIRPORTS.find((a) => a.city.toLowerCase().includes(lower));
  if (byCityFuzzy) return byCityFuzzy;

  return null;
}

/* ---------- Helpers ---------- */

function parseGuestCount(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) {
    return 0;
  }
  return n;
}

function nextDayIso(yyyyMmDd) {
  const d = new Date(yyyyMmDd);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function showMsg(el, kind, text) {
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${kind} mb-3" role="alert">${text}</div>`;
}

function clearMsg(el) {
  if (!el) return;
  el.innerHTML = "";
}
