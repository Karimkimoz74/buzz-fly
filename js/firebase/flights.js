/* =====================================================
   Buzz Fly Web — Flights
   Reads the public `flights` collection. Guest browsing
   is allowed; no auth required.

   Flights are date-less daily schedules. The displayed
   travel date comes from the user's search form, NOT
   the doc — do not query by date.

   Public API:
     searchFlights({ originCode, destinationCode })
     flightPriceFor(flight, cabinClass)
   ===================================================== */

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";

/* Find every flight matching an origin → destination pair.
   Returns an array of plain objects:
     [{ id, airline, airlineLogoUrl, flightNumber, originCode, ... cabinPrices, ... }] */
export async function searchFlights({ originCode, destinationCode }) {
  if (!originCode || !destinationCode) {
    throw new Error("searchFlights: originCode and destinationCode are required");
  }

  const q = query(
    collection(db, "flights"),
    where("originCode",      "==", originCode),
    where("destinationCode", "==", destinationCode)
  );

  const snap = await getDocs(q);
  const results = [];
  snap.forEach(d => {
    results.push({ id: d.id, ...d.data() });
  });
  return results;
}

/* Look up the price for a chosen cabin class on a flight.
   Returns null if the class isn't offered on this flight. */
export function flightPriceFor(flight, cabinClass) {
  if (!flight || !flight.cabinPrices) {
    return null;
  }
  const price = flight.cabinPrices[cabinClass];
  if (price === undefined || price === null) {
    return null;
  }
  return price;
}

import { BAGGAGE_BY_CABIN } from "./constants.js";

/* Return the cheapest cabin class offered on a flight (string key
   from flight.cabinPrices). Returns null when the flight has no
   priced cabins. Used by Stage 3 to pick a fallback for the return
   leg when the user's searched class isn't offered. */
export function cheapestClass(flight) {
  if (!flight || !flight.cabinPrices) {
    return null;
  }
  const entries = Object.entries(flight.cabinPrices);
  if (entries.length === 0) {
    return null;
  }
  entries.sort(function (a, b) { return a[1] - b[1]; });
  return entries[0][0];
}

/* Scope a flight to a chosen cabin class. Returns the same flight
   object spread with `cabinClass` + `priceGbp` (the per-class price)
   added — matching the contract the Stage 2 pipeline produces.
   Returns null when the class isn't offered. */
export function withClass(flight, cabinClass) {
  if (!flight || !flight.cabinPrices) {
    return null;
  }
  const price = flight.cabinPrices[cabinClass];
  if (price === undefined || price === null) {
    return null;
  }
  return Object.assign({}, flight, {
    cabinClass: cabinClass,
    priceGbp:   price
  });
}

/* Baggage allowance for a cabin class. Returns null for unknown
   classes — defensive against typos / future cabin tiers. */
export function baggageFor(cabinClass) {
  if (!cabinClass) return null;
  return BAGGAGE_BY_CABIN[cabinClass] || null;
}

/* Stage 2 fetch helper. Given a FlightSearchQuery and a leg
   ("outbound" — default — or "return"), runs the right Firestore query
   (swapping origin/destination on the return leg) and scopes every
   result to the chosen cabin class. Flights that don't offer the
   searched class are dropped. Returned objects have `cabinClass` +
   `priceGbp` added — every downstream calculation must read these
   off the scoped object, NOT off the original cabinPrices map. */
export async function searchFlightsForLeg(searchQuery, options) {
  if (!searchQuery) {
    throw new Error("searchFlightsForLeg: query is required");
  }
  const leg = (options && options.leg) || "outbound";

  let originCode, destinationCode;
  if (leg === "return") {
    originCode      = searchQuery.destinationCode;
    destinationCode = searchQuery.originCode;
  } else {
    originCode      = searchQuery.originCode;
    destinationCode = searchQuery.destinationCode;
  }

  const raw = await searchFlights({
    originCode:      originCode,
    destinationCode: destinationCode
  });

  const cabinClass = searchQuery.cabinClass;
  const out = [];
  for (const f of raw) {
    if (!f.cabinPrices) continue;
    if (!(cabinClass in f.cabinPrices)) continue;     // class not offered → drop
    out.push(Object.assign({}, f, {
      cabinClass: cabinClass,
      priceGbp:   f.cabinPrices[cabinClass]
    }));
  }
  return out;
}
