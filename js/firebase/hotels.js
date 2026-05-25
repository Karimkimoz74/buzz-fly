/* =====================================================
   Buzz Fly Web — Hotels data module
   Reads the public `hotels` collection. Guest browsing
   is allowed; no auth required.

   Search strategy: pull every hotel doc once, filter
   client-side. Collection is small (~500 docs) so a
   full read is fine and avoids needing a text index.

   Public API:
     getAllHotels()                        — every hotel (cached)
     refreshHotels()                       — clear the in-memory cache
     searchHotels({ destination, roomType }) — legacy convenience
     withRoomType(hotel, roomType)         — scope a hotel to a chosen tier
     cheapestRoomTypeOf(hotel)             — default tier when none chosen
     hotelPriceFor(hotel, roomType)        — null-safe price lookup
   ===================================================== */

import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";

let _hotelsCache = null;

/* Pull every hotel doc once, keep in memory.
   Returns a fresh array each call so callers can sort/filter without
   mutating the cache. */
export async function getAllHotels() {
  if (!_hotelsCache) {
    const snap = await getDocs(collection(db, "hotels"));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    _hotelsCache = list;
  }
  return _hotelsCache.slice();
}

export function refreshHotels() {
  _hotelsCache = null;
}

/* Look up the per-night price for a room type. Null-safe. */
export function hotelPriceFor(hotel, roomType) {
  if (!hotel || !hotel.roomPrices) {
    return null;
  }
  const price = hotel.roomPrices[roomType];
  if (price === undefined || price === null) {
    return null;
  }
  return price;
}

/* Return the room type with the lowest price on this hotel
   (used as the default tier when the user hasn't picked one).
   Returns null if the hotel has no priced rooms at all. */
export function cheapestRoomTypeOf(hotel) {
  if (!hotel || !hotel.roomPrices) {
    return null;
  }
  let cheapestType = null;
  let cheapestPrice = Infinity;
  for (const [type, price] of Object.entries(hotel.roomPrices)) {
    if (typeof price !== "number") {
      continue;
    }
    if (price < cheapestPrice) {
      cheapestPrice = price;
      cheapestType = type;
    }
  }
  return cheapestType;
}

/* Scope a hotel to a chosen room type — adds `roomType` and
   `pricePerNight` fields derived from `roomPrices[roomType]`.
   Returns null if the hotel doesn't offer that type at all. */
export function withRoomType(hotel, roomType) {
  if (!hotel) {
    return null;
  }
  const price = hotelPriceFor(hotel, roomType);
  if (price === null) {
    return null;
  }
  return {
    ...hotel,
    roomType,
    pricePerNight: price
  };
}

/* Legacy convenience — kept for callers that want one-shot search.
   New pages should use getAllHotels() + the helpers above for full control. */
export async function searchHotels({ destination, roomType } = {}) {
  let results = await getAllHotels();

  if (destination && destination.trim()) {
    const needle = destination.trim().toLowerCase();
    results = results.filter(h => {
      if (!h.location) {
        return false;
      }
      return h.location.toLowerCase().includes(needle);
    });
  }

  if (roomType) {
    const scoped = [];
    for (const h of results) {
      const s = withRoomType(h, roomType);
      if (s) {
        scoped.push(s);
      }
    }
    results = scoped;
  }

  return results;
}
