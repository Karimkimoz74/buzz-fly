/* =====================================================
   Buzz Fly Web — Notifications
   Per-user notification feed backed by Firestore
   notifications/{autoId}. Owner-only (userId == auth.uid),
   matching the bookings rule pattern.

   Doc shape (required by the security rule):
     {
       userId:            string,     // === auth.currentUser.uid
       title:             string,     // "Booking confirmed" / "Welcome" / …
       body:              string,     // free text
       type:              'booking' | 'system',  // taxonomy for icon
       createdAt:         serverTimestamp,
       isRead:            boolean,    // false on create
       relatedBookingId?: string,     // present only for booking notifications
     }

   Public API:
     createNotification({ type, title, body, relatedBookingId? })
     userNotifications({ limit? })           → newest first
     markNotificationRead(id)
     markAllNotificationsRead(prefetched?)
     checkAndCreateReminders(bookings)       → idempotent client-side scan
   ===================================================== */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db } from "./firebase-init.js";

const REMINDER_SENT_KEY    = "buzzfly.reminderSentBookingIds";
const REMINDER_WINDOW_MS   = 24 * 60 * 60 * 1000;   // 24 hours

/* Internal — enforce sign-in. Throws otherwise. */
function requireSignedIn() {
  if (!auth.currentUser) {
    const err = new Error("Sign in required");
    err.code = "buzz/auth-required";
    throw err;
  }
  return auth.currentUser;
}

/* ---------- Create ---------- */

/* Write one notification doc. Always tagged with the current user's
   uid so the security rule passes; createdAt is a server timestamp.
   `relatedBookingId` is optional — present for booking-flow
   notifications, absent for system / welcome messages. */
export async function createNotification(payload) {
  const user = requireSignedIn();
  if (!payload || !payload.type || !payload.title) {
    throw new Error("createNotification: type + title required");
  }

  const docData = {
    userId:    user.uid,
    type:      payload.type,                       // 'booking' | 'system'
    title:     payload.title,
    body:      payload.body || "",
    isRead:    false,
    createdAt: serverTimestamp()
  };
  if (payload.relatedBookingId) {
    docData.relatedBookingId = payload.relatedBookingId;
  }

  const ref = await addDoc(collection(db, "notifications"), docData);
  return ref.id;
}

/* ---------- Read ---------- */

/* Fetch every notification for the current user. Sorted client-side
   newest first (no composite index needed because we don't combine
   where + orderBy). Pass { limit } to cap the result. */
export async function userNotifications(options) {
  const user = requireSignedIn();
  const cap  = (options && typeof options.limit === "number") ? options.limit : 0;

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid)
  );

  const snap = await getDocs(q);
  const list = [];
  snap.forEach(function (d) {
    list.push(Object.assign({ id: d.id }, d.data()));
  });

  list.sort(function (a, b) {
    return millisOf(b.createdAt) - millisOf(a.createdAt);
  });

  if (cap > 0) return list.slice(0, cap);
  return list;
}

function millisOf(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  return 0;
}

/* Flip a single notification's isRead flag. */
export async function markNotificationRead(notificationId) {
  requireSignedIn();
  await updateDoc(doc(db, "notifications", notificationId), {
    isRead: true
  });
}

/* Flip every unread notification for the current user to isRead.
   Pass in the already-fetched list to avoid a re-query — callers
   that just rendered the feed already have it. Falls back to
   fetching when no list is passed. Returns the count flipped. */
export async function markAllNotificationsRead(prefetched) {
  requireSignedIn();
  let list = prefetched;
  if (!Array.isArray(list)) {
    list = await userNotifications();
  }
  let count = 0;
  for (const n of list) {
    if (n.isRead) continue;
    try {
      await updateDoc(doc(db, "notifications", n.id), { isRead: true });
      n.isRead = true;
      count++;
    } catch (err) {
      console.warn("[notifications] markAll failed for", n.id, err);
    }
  }
  return count;
}

/* ---------- 24h reminder check (client-side cron substitute) ----------

   Web has no Cloud Functions in this project, so the 24h reminder
   notification is fired opportunistically — every time the user
   visits My Trips, we scan their confirmed bookings, find the ones
   whose travelDate is within the next 24 hours, and create one
   reminder notification per booking ID (idempotent).

   "Already reminded" tracking lives in localStorage so we don't
   double-fire on the same device. A user opening My Trips from a
   second device would get one duplicate reminder there — acceptable
   for a school-project scope (the proper fix is Cloud Functions
   writing a `reminderSentAt` field on the booking doc). */
export async function checkAndCreateReminders(bookings) {
  if (!auth.currentUser) return [];
  if (!Array.isArray(bookings) || bookings.length === 0) return [];

  const sent = readReminderSentSet();
  const now  = Date.now();
  const fired = [];

  for (const b of bookings) {
    if (!b || b.status !== "confirmed") continue;
    if (!b.travelDate) continue;
    if (sent.has(b.id)) continue;

    const travelMs = millisOf(b.travelDate);
    if (travelMs <= 0) continue;

    const delta = travelMs - now;
    // Within the next 24h AND not already past
    if (delta > 0 && delta <= REMINDER_WINDOW_MS) {
      try {
        await createNotification({
          type:             "booking",
          title:            "Your trip starts soon",
          body:             `${b.title || "Your booking"} starts in less than 24 hours.`,
          relatedBookingId: b.id
        });
        sent.add(b.id);
        fired.push(b.id);
      } catch (err) {
        console.warn("[notifications] reminder failed for", b.id, err);
      }
    }
  }

  if (fired.length > 0) writeReminderSentSet(sent);
  return fired;
}

function readReminderSentSet() {
  try {
    const raw = window.localStorage.getItem(REMINDER_SENT_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch (err) {
    return new Set();
  }
}

function writeReminderSentSet(set) {
  try {
    window.localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {}
}
