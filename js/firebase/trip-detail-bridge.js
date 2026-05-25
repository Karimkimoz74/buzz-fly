/* =====================================================
   Buzz Fly Web — Trip Detail bridge
   Cross-page state between My Trips and the Trip Detail
   view. Mirrors the flight-bridge / payment-bridge
   pattern: stash the full Booking object in sessionStorage,
   navigate, rehydrate on the other side.

   Firestore Timestamps don't survive JSON.stringify cleanly,
   so the serialise/deserialise pair walks the booking and
   converts Timestamp <-> ISO string on the relevant fields.

   Public API:
     goToTripDetail(booking)             stash + navigate
     readTripDetailPayload()             rehydrated Booking or null
     clearTripDetailPayload()            drop the stashed booking

     signalCancelledOnReturn(bookingId)  flag: "the user cancelled this"
     consumeCancelledFlag()              one-shot read+clear; returns
                                         { id } or null
   ===================================================== */

const PAYLOAD_KEY = "buzzfly.tripDetailBooking";
const RESULT_KEY  = "buzzfly.tripDetailCancelled";

const TRIP_DETAIL_URL = "/pages/profile/trip-detail.html";

/* ---------- Outgoing: My Trips -> Trip Detail ---------- */

export function goToTripDetail(booking) {
  if (!booking || !booking.id) {
    throw new Error("goToTripDetail: booking with .id is required");
  }
  try {
    window.sessionStorage.setItem(PAYLOAD_KEY, JSON.stringify(serialiseBooking(booking)));
  } catch (err) {
    console.error("[trip-detail-bridge] stash failed:", err);
    throw err;
  }
  window.location.href = TRIP_DETAIL_URL;
}

export function readTripDetailPayload() {
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(PAYLOAD_KEY);
  } catch (err) {
    return null;
  }
  if (!raw) return null;
  try {
    return deserialiseBooking(JSON.parse(raw));
  } catch (err) {
    console.error("[trip-detail-bridge] corrupted payload:", err);
    return null;
  }
}

export function clearTripDetailPayload() {
  try { window.sessionStorage.removeItem(PAYLOAD_KEY); } catch (err) {}
}

/* ---------- Return signal: Trip Detail -> My Trips ---------- */

export function signalCancelledOnReturn(bookingId) {
  try {
    window.sessionStorage.setItem(RESULT_KEY, JSON.stringify({ id: bookingId }));
  } catch (err) {}
}

export function consumeCancelledFlag() {
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(RESULT_KEY);
    if (raw) window.sessionStorage.removeItem(RESULT_KEY);
  } catch (err) {}
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

/* ---------- serialisation helpers ----------

   Firestore Timestamps come back from getDocs as objects with .toMillis()
   and .toDate(). JSON.stringify on them yields {} (no own enumerable
   props), so the field would round-trip as null. We convert to ISO
   strings on the way out and back to Date objects on the way in. */

function serialiseBooking(b) {
  return Object.assign({}, b, {
    createdAt:  tsToIso(b.createdAt),
    travelDate: tsToIso(b.travelDate),
    returnDate: tsToIso(b.returnDate)
  });
}

function deserialiseBooking(b) {
  return Object.assign({}, b, {
    createdAt:  isoToDate(b.createdAt),
    travelDate: isoToDate(b.travelDate),
    returnDate: isoToDate(b.returnDate)
  });
}

function tsToIso(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (v instanceof Date)                return v.toISOString();
  if (typeof v === "string")            return v;
  if (typeof v === "number")            return new Date(v).toISOString();
  return null;
}

function isoToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}
