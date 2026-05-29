/* =====================================================
   Buzz Fly Web — App-level constants
   Mirror the mobile app's hardcoded lists. NOT stored
   in Firestore — keep these in sync with the mobile app.
   ===================================================== */

export const CABIN_CLASSES = ["Standard", "Business", "First"];

/* Baggage allowance per cabin class — derived on the booking
   detail screen from the chosen outbound cabin. NOT a Firestore
   field; mirror exactly with the mobile app. */
export const BAGGAGE_BY_CABIN = {
  Standard: { cabin: "7 kg",  checked: "23 kg" },
  Business: { cabin: "10 kg", checked: "32 kg" },
  First:    { cabin: "15 kg", checked: "50 kg" }
};

export const ROOM_CAPACITY = {
  "Standard Room":   2,
  "Deluxe Room":     3,
  "Suite":           3,
  "Family Room":     4,
  "Executive Suite": 6
};

export const ROOM_TYPES = Object.keys(ROOM_CAPACITY);

/* The highest possible guest count any single room can hold.
   Drives the upper bound of the guests stepper. */
export const MAX_ROOM_CAPACITY = Math.max(...Object.values(ROOM_CAPACITY));

/* Capacity lookup for a specific room type. Returns null if unknown. */
export function capacityFor(roomType) {
  if (!roomType) {
    return null;
  }
  const cap = ROOM_CAPACITY[roomType];
  if (cap === undefined) {
    return null;
  }
  return cap;
}

/* Given a guest count, return the room types that can fit.
     eligibleRoomTypes(6) → ["Executive Suite"]
     eligibleRoomTypes(4) → ["Family Room", "Executive Suite"]
     eligibleRoomTypes(0) → all 5 (treat 0 as "unset / any") */
export function eligibleRoomTypes(guestCount) {
  if (!guestCount || guestCount <= 0) {
    return [...ROOM_TYPES];
  }
  const result = [];
  for (const roomType of ROOM_TYPES) {
    if (ROOM_CAPACITY[roomType] >= guestCount) {
      result.push(roomType);
    }
  }
  return result;
}

/* Legacy alias kept for older call sites. */
export function roomsThatFit(guestCount) {
  return eligibleRoomTypes(guestCount);
}

/* Airport list — mirror of the mobile app's app_airports.dart.
   Source of truth for the From / To pickers on the Flights search
   pane. NOT stored in Firestore — keep in sync manually.

   Each entry is { code, city } where `code` is the IATA code. */
export const AIRPORTS = [
  { code: "CAI", city: "Cairo" },
  { code: "HRG", city: "Hurghada" },
  { code: "SSH", city: "Sharm El Sheikh" },
  { code: "IST", city: "Istanbul" },
  { code: "CDG", city: "Paris" },
  { code: "ZRH", city: "Zurich" },
  { code: "GVA", city: "Geneva" },
  { code: "LHR", city: "London" },
  { code: "MAN", city: "Manchester" },
  { code: "JFK", city: "New York" },
  { code: "LAX", city: "Los Angeles" },
  { code: "MIA", city: "Miami" },
  { code: "LAS", city: "Las Vegas" },
  { code: "SFO", city: "San Francisco" },
  { code: "DXB", city: "Dubai" },
  { code: "DOH", city: "Doha" },
  { code: "RUH", city: "Riyadh" },
  { code: "RAK", city: "Marrakech" },
  { code: "NRT", city: "Tokyo" },
  { code: "KIX", city: "Kyoto" },
  { code: "SIN", city: "Singapore" },
  { code: "MLE", city: "Maldives" },
  { code: "DPS", city: "Bali" }
];

/* Destination autocomplete list — shared with the mobile app.
   Edit this list when the team adds new seeded cities. */
export const DESTINATIONS = [
  "Cairo",
  "Istanbul",
  "Paris",
  "Lucerne",
  "Zurich",
  "Geneva",
  "Bali",
  "Ubud",
  "Kyoto",
  "Tokyo",
  "Singapore",
  "Maldives",
  "New York",
  "London",
  "Dubai",
  "Doha",
  "Riyadh",
  "Marrakech"
];
