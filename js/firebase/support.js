/* =====================================================
   Buzz Fly Web — Support tickets
   Create-only for signed-in users. The rule blocks
   reads from the client — admins read via the console
   or Cloud Functions.

   Public API:
     submitSupportTicket({ name, email, reason, message })
   ===================================================== */

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db } from "./firebase-init.js";

export async function submitSupportTicket({ name, email, reason, message }) {
  if (!auth.currentUser) {
    const err = new Error("Sign in required to submit a support ticket");
    err.code = "buzz/auth-required";
    throw err;
  }

  await addDoc(collection(db, "support_tickets"), {
    name,
    email,
    reason,
    message,
    userId:    auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
}
