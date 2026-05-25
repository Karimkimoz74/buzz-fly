/* =====================================================
   Buzz Fly Web — Avatar cache (pub/sub singleton)
   Mirrors the mobile app's ValueNotifier<String?> so every
   <img> rendering the current user's avatar repaints the
   moment Save resolves on Edit Profile.

   Persists the last-known avatar path in localStorage so
   the navbar/header paints with the right image instantly
   on the next page load — no flash of the default icon
   while Firebase Auth + Firestore round-trip.

   Usage:
     import { userAvatarCache } from "/js/firebase/avatar-cache.js";

     // Inside any view that shows the user's avatar:
     const unsubscribe = userAvatarCache.subscribe((path) => {
       imgEl.src = path || "/assets/icons/user.svg";
     });

     // Inside Edit Profile save:
     userAvatarCache.set(selectedAvatar);

     // On sign-out:
     userAvatarCache.clear();
   ===================================================== */

const STORAGE_KEY = "buzzfly.avatar";
const subscribers = new Set();
let currentAvatar = readFromStorage();

export const userAvatarCache = {

  /* Read the latest avatar path (or null if unset). */
  get() {
    return currentAvatar;
  },

  /* Replace the avatar path and notify every subscriber.
     Skips the notify (and the localStorage write) when the
     value is identical to what's already cached — avoids a
     redundant repaint on every page navigation. */
  set(path) {
    const next = path || null;
    if (next === currentAvatar) return;
    currentAvatar = next;
    writeToStorage(next);
    notify();
  },

  /* Wipe the avatar on sign-out so the next account starts clean. */
  clear() {
    if (currentAvatar === null) return;
    currentAvatar = null;
    writeToStorage(null);
    notify();
  },

  /* Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn) {
    subscribers.add(fn);
    // Fire immediately so the subscriber renders the current value
    fn(currentAvatar);
    return () => subscribers.delete(fn);
  }
};

function notify() {
  for (const fn of subscribers) {
    try {
      fn(currentAvatar);
    } catch (err) {
      // A subscriber blowing up shouldn't stop the others
      console.error("[avatar-cache] subscriber threw:", err);
    }
  }
}

function readFromStorage() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value || null;
  } catch (err) {
    // Storage unavailable (Safari private mode, disabled, etc.)
    return null;
  }
}

function writeToStorage(value) {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    // Storage unavailable — fall through, cache still works in-memory
  }
}
