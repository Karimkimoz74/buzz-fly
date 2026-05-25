/* =====================================================
   Buzz Fly Web — Bookings
   Owner-only writes (the security rule enforces
   request.auth.uid == resource.data.userId).

   Notes:
   - createBooking ALWAYS overwrites userId with the current
     user's uid, so callers can't accidentally write a doc
     that the rule will reject.
   - Caller passes a PaymentRequest (plain JS Dates inside);
     createBooking converts to Firestore Timestamps.
   - userBookings reads by userId, then sorts client-side by
     travelDate ascending (no composite index needed).
   - cancelBooking sets status="cancelled" — NEVER deletes
     the doc. Past bookings stay for history.

   Public API:
     createBooking(request)
     userBookings()
     cancelBooking(id)
   ===================================================== */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db } from "./firebase-init.js";
import { createNotification } from "./notifications.js";

/* Internal: enforce that someone is signed in. Throws otherwise. */
function requireSignedIn() {
  if (!auth.currentUser) {
    const err = new Error("Sign in required");
    err.code = "buzz/auth-required";
    throw err;
  }
  return auth.currentUser;
}

/* Write one booking doc. The caller supplies a PaymentRequest:
     {
       type:       'flight' | 'hotel',
       title:      string,
       subtitle:   string,
       lineItems:  [{label, amount}, ...],   // NOT persisted; used by payment UI
       total:      number,
       travelDate: Date,
       returnDate: Date | null,
       segments:   [{label, route, detail}, ...],
       traveller:  { name, email, passport, phone }
     }
   The returned doc id is the autoId. */
export async function createBooking(request) {
  const user = requireSignedIn();

  if (!request || !request.type || !request.travelDate) {
    throw new Error("createBooking: invalid request");
  }

  const docData = {
    userId:     user.uid,                                    // required by rule
    type:       request.type,
    title:      request.title,
    subtitle:   request.subtitle,
    total:      request.total,
    status:     "confirmed",
    createdAt:  serverTimestamp(),
    travelDate: Timestamp.fromDate(toDate(request.travelDate)),
    segments:   (request.segments || []).map(function (s) {
                  return { label: s.label, route: s.route, detail: s.detail };
                }),
    traveller:  Object.assign({}, request.traveller || {})
  };

  // Only include returnDate when it's actually a date — round-trip
  // flights and hotels (check-out) carry one; one-way flights don't.
  if (request.returnDate) {
    docData.returnDate = Timestamp.fromDate(toDate(request.returnDate));
  }

  const ref = await addDoc(collection(db, "bookings"), docData);

  // Fire-and-forget notification — booking write is the source of
  // truth, so a notification failure should NOT roll back the
  // booking. Logged for diagnosis only.
  try {
    await createNotification({
      type:             "booking",
      title:            "Booking confirmed",
      body:             `${request.title || "Your booking"} is confirmed. We'll remind you 24h before it starts.`,
      relatedBookingId: ref.id
    });
  } catch (err) {
    console.warn("[bookings] notification on create failed:", err);
  }

  return ref.id;
}

/* Permissive Date coercion — accepts Date, ISO string, or
   millisecond number. Throws on invalid input so the call site
   doesn't silently write a garbage timestamp. */
function toDate(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error("createBooking: invalid Date");
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new Error("createBooking: unparseable date");
    return d;
  }
  throw new Error("createBooking: travelDate / returnDate must be a Date");
}

/* Fetch every booking for the current user, sorted client-side by
   travelDate ascending (no composite index needed). */
export async function userBookings() {
  const user = requireSignedIn();

  const q = query(
    collection(db, "bookings"),
    where("userId", "==", user.uid)
  );

  const snap = await getDocs(q);
  const list = [];
  snap.forEach(function (d) {
    list.push(Object.assign({ id: d.id }, d.data()));
  });

  list.sort(function (a, b) {
    return millisOf(a.travelDate) - millisOf(b.travelDate);
  });

  return list;
}

function millisOf(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  return 0;
}

/* Cancel a booking (sets status = "cancelled"). The doc is NOT
   deleted. Also fires a cancellation notification carrying the
   booking title so the notifications feed reads well. */
export async function cancelBooking(bookingId) {
  requireSignedIn();

  // Read the doc first so the notification can carry the booking
  // title. If the read fails we still cancel — the notification
  // just gets a generic body.
  let title = "Your booking";
  try {
    const snap = await getDoc(doc(db, "bookings", bookingId));
    if (snap.exists()) {
      const data = snap.data();
      if (data.title) title = data.title;
    }
  } catch (err) {
    console.warn("[bookings] could not read title before cancel:", err);
  }

  await updateDoc(doc(db, "bookings", bookingId), {
    status: "cancelled"
  });

  try {
    await createNotification({
      type:             "booking",
      title:            "Booking cancelled",
      body:             `${title} has been cancelled. Refunds follow our flexible-cancellation policy.`,
      relatedBookingId: bookingId
    });
  } catch (err) {
    console.warn("[bookings] notification on cancel failed:", err);
  }
}
