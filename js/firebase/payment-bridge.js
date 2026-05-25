/* =====================================================
   Buzz Fly Web — Payment bridge
   Carries a PaymentRequest from hotel-details / flight-details
   to /pages/confirm-payment.html. Implementation detail: stash
   it in sessionStorage so a full page navigation can pick it up
   without making the URL huge.

   Also exposes the deferred-auth gate used by the Stage 3
   Confirm buttons (signed-out user → bounce to /pages/auth/signin
   with ?next= carrying the current detail page, including all
   query params and a flag so the page can show a toast on return).

   Public API:
     goToPayment(request)
     readPaymentRequest()
     clearPaymentRequest()
     ensureSignedIn()          → boolean (true: already signed in)
     consumeAuthReturnFlag()   → boolean (was a "just signed in" toast queued)
   ===================================================== */

import { auth } from "./firebase-init.js";

const PAYMENT_KEY     = "buzzfly.paymentRequest";
const AUTH_RETURN_KEY = "buzzfly.justSignedIn";

const PAYMENT_URL = "/pages/confirm-payment.html";
const SIGNIN_URL  = "/pages/auth/signin.html";

/* Stash the request, navigate to the payment page. Dates inside the
   request are serialised to ISO strings — the reader rehydrates them
   back to JS Date. */
export function goToPayment(request) {
  if (!request) throw new Error("goToPayment: request is required");
  const serialisable = serialiseRequest(request);
  try {
    window.sessionStorage.setItem(PAYMENT_KEY, JSON.stringify(serialisable));
  } catch (err) {
    console.error("[payment-bridge] sessionStorage write failed:", err);
    throw err;
  }
  window.location.href = PAYMENT_URL;
}

/* Read + rehydrate the stashed PaymentRequest. Returns null when
   missing or corrupted — the payment page treats that as "refresh
   on a stale URL" and bounces home. */
export function readPaymentRequest() {
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(PAYMENT_KEY);
  } catch (err) {
    return null;
  }
  if (!raw) return null;
  try {
    return deserialiseRequest(JSON.parse(raw));
  } catch (err) {
    console.error("[payment-bridge] corrupted PaymentRequest:", err);
    return null;
  }
}

/* Drop the stashed request — call after a successful booking so the
   next nav to /payment can't accidentally re-render it. */
export function clearPaymentRequest() {
  try { window.sessionStorage.removeItem(PAYMENT_KEY); } catch (err) {}
}

/* Deferred-auth gate. If the user is signed in, return true and
   the caller proceeds. If signed out, bounce to sign-in with
   ?next=<current URL> + a fromAuth flag. Returns false so the
   caller knows not to continue.

   Per the spec, after sign-in the user lands back on the detail
   page; the page detects the return-flag via consumeAuthReturnFlag()
   and shows a toast prompting them to review + re-tap Confirm. */
export async function ensureSignedIn() {
  await auth.authStateReady();
  if (auth.currentUser) return true;

  try {
    window.sessionStorage.setItem(AUTH_RETURN_KEY, "1");
  } catch (err) {}

  const here = window.location.pathname + window.location.search;
  window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(here);
  return false;
}

/* Read-and-clear the "just returned from sign-in" flag. */
export function consumeAuthReturnFlag() {
  let flag = null;
  try {
    flag = window.sessionStorage.getItem(AUTH_RETURN_KEY);
    if (flag) window.sessionStorage.removeItem(AUTH_RETURN_KEY);
  } catch (err) {}
  return flag === "1";
}

/* ---------- serialisation ---------- */

function serialiseRequest(request) {
  return {
    type:       request.type,
    title:      request.title,
    subtitle:   request.subtitle,
    lineItems:  (request.lineItems || []).map(function (li) {
                  return { label: li.label, amount: li.amount };
                }),
    total:      request.total,
    travelDate: dateToIso(request.travelDate),
    returnDate: request.returnDate ? dateToIso(request.returnDate) : null,
    segments:   (request.segments || []).map(function (s) {
                  return { label: s.label, route: s.route, detail: s.detail };
                }),
    traveller:  Object.assign({}, request.traveller || {})
  };
}

function deserialiseRequest(raw) {
  return {
    type:       raw.type,
    title:      raw.title,
    subtitle:   raw.subtitle,
    lineItems:  raw.lineItems || [],
    total:      raw.total,
    travelDate: raw.travelDate ? new Date(raw.travelDate) : null,
    returnDate: raw.returnDate ? new Date(raw.returnDate) : null,
    segments:   raw.segments || [],
    traveller:  raw.traveller || {}
  };
}

function dateToIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  throw new Error("payment-bridge: travelDate / returnDate must be a Date");
}
