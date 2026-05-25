/* =====================================================
   Buzz Fly Web — Firebase init
   Connects to the EXISTING Firebase project that powers
   the Buzz Fly mobile app. No schema changes from here.

   Project ID:        buzz-fly-mobile-2a08c
   Firestore region:  me-central1
   Auth providers:    Email/Password, Google
   Storage:           none

   Use:
     import { auth, db, googleProvider } from "/js/firebase/firebase-init.js";

   Every other module under js/firebase/ imports these
   singletons — do NOT call initializeApp() anywhere else.
   ===================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ⚠️ Paste the web firebaseConfig from
//    Firebase console → Project settings → "Your apps" → web app
//    The placeholders below WILL fail to connect.
const firebaseConfig = {
  apiKey: "AIzaSyDG0m2OAFRl6novbavgRt2ZBz5yTzordKw",
  authDomain: "buzz-fly-mobile-2a08c.firebaseapp.com",
  projectId: "buzz-fly-mobile-2a08c",
  storageBucket: "buzz-fly-mobile-2a08c.firebasestorage.app",
  messagingSenderId: "675929451879",
  appId: "1:675929451879:web:bdf872acb2b762a37693c2"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// Always show the Google account chooser, even for users already signed
// in to Google in this browser — matches user expectation of "redirect to
// Google to sign in". Without this, returning users get an instant flash.
googleProvider.setCustomParameters({ prompt: "select_account" });
