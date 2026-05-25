/* =====================================================
   Buzz Fly Web — Auth + user profile
   Wraps Firebase Auth + the users/{uid} Firestore doc.

   Public API:
     onAuthChange(cb)                           — subscribe to auth state
     currentUser()                              — sync getter
     signInWithEmail(email, password)
     signUpWithEmail({ email, password, fullName })
     signInWithGoogle()
     sendPasswordReset(email)
     signOut()
     fetchProfile(uid?)                         — defaults to current user
     saveProfile(partial)                       — merge update, syncs displayName
     deleteAccount()                            — blocks if active bookings exist;
                                                  silently re-auths Google users
   ===================================================== */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  reauthenticateWithPopup,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db, googleProvider } from "./firebase-init.js";
import { createNotification } from "./notifications.js";

/* Fire a "Welcome to Buzz Fly" system notification. Wrapped in try/catch
   so a failure here NEVER rolls back the user creation it follows. */
async function fireWelcomeNotification() {
  try {
    await createNotification({
      type:  "system",
      title: "Welcome to Buzz Fly",
      body:  "Your account is ready. Happy travels!"
    });
  } catch (err) {
    console.warn("[auth] welcome notification failed:", err);
  }
}

/* Fire a "Welcome back" system notification on every successful sign-in
   for a returning user (email sign-in or returning Google user). Falls
   back to a generic greeting when displayName isn't set. */
async function fireWelcomeBackNotification() {
  try {
    const user = auth.currentUser;
    let firstName = "Traveler";
    if (user && user.displayName) {
      const parts = user.displayName.trim().split(/\s+/);
      if (parts[0]) firstName = parts[0];
    }
    await createNotification({
      type:  "system",
      title: `Welcome back, ${firstName}!`,
      body:  "Great to see you again. Pick up where you left off."
    });
  } catch (err) {
    console.warn("[auth] welcome-back notification failed:", err);
  }
}

/* ---------- Auth state ---------- */

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

/* ---------- Sign in / out ---------- */

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await fireWelcomeBackNotification();
  return cred.user;
}

export async function signUpWithEmail({ email, password, fullName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  // Mirror fullName into the Auth profile so other Firebase tools see it
  if (fullName) {
    await updateProfile(user, { displayName: fullName });
  }

  // Create the matching Firestore profile doc (rule allows because uid matches)
  await setDoc(doc(db, "users", user.uid), {
    uid:       user.uid,
    fullName:  fullName || "",
    email:     email,
    createdAt: serverTimestamp()
  });

  await fireWelcomeNotification();
  return user;
}

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;

  // Create profile doc on first Google sign-in (idempotent thanks to merge).
  // First-time users get "Welcome to Buzz Fly"; returning users get
  // "Welcome back, <name>!" on every sign-in.
  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  if (!existing.exists()) {
    await setDoc(profileRef, {
      uid:       user.uid,
      fullName:  user.displayName || "",
      email:     user.email || "",
      createdAt: serverTimestamp()
    }, { merge: true });
    await fireWelcomeNotification();
  } else {
    await fireWelcomeBackNotification();
  }

  return user;
}

export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  await firebaseSignOut(auth);
}

/* ---------- Profile read / write ---------- */

export async function fetchProfile(uid) {
  let targetUid = uid;
  if (!targetUid) {
    if (!auth.currentUser) {
      throw new Error("Not signed in");
    }
    targetUid = auth.currentUser.uid;
  }
  const snap = await getDoc(doc(db, "users", targetUid));
  if (!snap.exists()) {
    return null;
  }
  return snap.data();
}

/* Merge-update the users/{uid} doc.
   If `fullName` is in the partial, also update the Auth user's displayName. */
export async function saveProfile(partial) {
  if (!auth.currentUser) {
    throw new Error("Not signed in");
  }
  const user = auth.currentUser;

  await setDoc(doc(db, "users", user.uid), partial, { merge: true });

  if (partial.fullName && partial.fullName !== user.displayName) {
    await updateProfile(user, { displayName: partial.fullName });
  }
}

/* ---------- Account deletion ---------- */

/* Internal: check if the user has any non-cancelled bookings. */
async function hasActiveBookings(uid) {
  const q = query(
    collection(db, "bookings"),
    where("userId", "==", uid),
    limit(50) // small batch — we just need to find any active ones
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const status = d.data().status;
    if (status !== "cancelled") {
      return true;
    }
  }
  return false;
}

/* Internal: detect which auth provider this user signed in with. */
function primaryProviderId(user) {
  const provider = user.providerData[0];
  if (!provider) {
    return null;
  }
  return provider.providerId;
}

export async function deleteAccount() {
  if (!auth.currentUser) {
    throw new Error("Not signed in");
  }
  const user = auth.currentUser;
  const uid  = user.uid;

  // 1. Block if there are active bookings
  const blocked = await hasActiveBookings(uid);
  if (blocked) {
    const err = new Error("You have active bookings. Cancel them before deleting your account.");
    err.code = "buzz/active-bookings-exist";
    throw err;
  }

  // 2. Delete the users/{uid} doc FIRST while auth is still valid
  //    (the security rule requires request.auth.uid == uid for delete)
  try {
    await deleteDoc(doc(db, "users", uid));
  } catch (err) {
    // If the doc was already gone from a prior failed attempt, ignore
    if (err.code !== "not-found") {
      throw err;
    }
  }

  // 3. Delete the Auth user — may require recent login
  try {
    await deleteUser(user);
    return;
  } catch (err) {
    if (err.code !== "auth/requires-recent-login") {
      throw err;
    }
  }

  // 4. requires-recent-login fallback
  const providerId = primaryProviderId(user);
  if (providerId === "google.com") {
    // Silent re-auth via Google popup, then retry
    await reauthenticateWithPopup(user, googleProvider);
    await deleteUser(user);
    return;
  }

  // Email/password — no silent re-auth path. Throw a tagged error
  // so the UI can prompt the user to log out and log back in.
  const err = new Error("Recent login required. Please log out, sign in again, and retry account deletion.");
  err.code = "buzz/reauth-required";
  throw err;
}
