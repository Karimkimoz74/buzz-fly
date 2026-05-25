/* =====================================================
   Buzz Fly Web — Flight bridge
   Cross-page state for the flight flow that doesn't fit
   in the URL: the picked outbound flight on a round-trip
   Stage 2 → Stage 2 transition, and the full Stage 3
   payload (flight + returnFlight + query) handed to the
   booking detail page.

   Both stash to sessionStorage so a refresh on Stage 3
   can rehydrate (or detect missing state and bounce).

   Public API:
     stashOutboundFlight(flight)
     readOutboundFlight()          → flight | null
     clearOutboundFlight()

     goToFlightBooking({ flight, returnFlight, query })
     readFlightBookingPayload()    → { flight, returnFlight, query } | null
     clearFlightBookingPayload()
   ===================================================== */

const OUTBOUND_KEY = "buzzfly.outboundFlight";
const STAGE3_KEY   = "buzzfly.flightBookingPayload";

const BOOKING_URL = "/pages/flight-details.html";

/* ---------- Outbound stash (Stage 2 → Stage 2) ---------- */

export function stashOutboundFlight(flight) {
  try {
    window.sessionStorage.setItem(OUTBOUND_KEY, JSON.stringify(flight));
  } catch (err) {
    console.error("[flight-bridge] stashOutboundFlight failed:", err);
  }
}

export function readOutboundFlight() {
  try {
    const raw = window.sessionStorage.getItem(OUTBOUND_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function clearOutboundFlight() {
  try { window.sessionStorage.removeItem(OUTBOUND_KEY); } catch (err) {}
}

/* ---------- Stage 3 navigation ---------- */

/* Stash the booking payload then redirect to the flight booking
   detail page. Dates inside the query are ISO-encoded so they
   round-trip cleanly; the consumer rehydrates them to Date. */
export function goToFlightBooking(payload) {
  if (!payload || !payload.flight || !payload.query) {
    throw new Error("goToFlightBooking: flight + query are required");
  }
  const serialisable = {
    flight:       payload.flight,
    returnFlight: payload.returnFlight || null,
    query:        serialiseQuery(payload.query)
  };
  try {
    window.sessionStorage.setItem(STAGE3_KEY, JSON.stringify(serialisable));
  } catch (err) {
    console.error("[flight-bridge] goToFlightBooking failed:", err);
    throw err;
  }
  // Outbound flight is now part of the Stage 3 payload — drop the
  // standalone key so a stale back-nav doesn't see both.
  clearOutboundFlight();
  window.location.href = BOOKING_URL;
}

export function readFlightBookingPayload() {
  try {
    const raw = window.sessionStorage.getItem(STAGE3_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      flight:       p.flight,
      returnFlight: p.returnFlight || null,
      query:        deserialiseQuery(p.query)
    };
  } catch (err) {
    console.error("[flight-bridge] readFlightBookingPayload corrupted:", err);
    return null;
  }
}

export function clearFlightBookingPayload() {
  try { window.sessionStorage.removeItem(STAGE3_KEY); } catch (err) {}
}

/* ---------- date helpers ---------- */

function serialiseQuery(q) {
  return Object.assign({}, q, {
    departureDate: q.departureDate ? toIso(q.departureDate) : null,
    returnDate:    q.returnDate    ? toIso(q.returnDate)    : null
  });
}

function deserialiseQuery(q) {
  return Object.assign({}, q, {
    departureDate: q.departureDate ? new Date(q.departureDate) : null,
    returnDate:    q.returnDate    ? new Date(q.returnDate)    : null
  });
}

function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  return null;
}
