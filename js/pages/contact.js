/* =====================================================
   Buzz Fly — contact.js (Contact Us page)

   Auth-gated. Identity (name + email) is loaded ONCE from
   users/{uid} on mount and rendered into disabled inputs.
   The user picks a reason from a fixed list and types a
   message; Submit writes one doc to support_tickets/{autoId}
   via the support.js helper, toasts, and resets the
   editable fields.

   The two identity fields stay disabled forever on this
   page — by design. Edit Profile is the path for changes.

   Loaded as <script type="module"> on:
     pages/contact.html
   ===================================================== */

import { auth } from "/js/firebase/firebase-init.js";
import { onAuthChange, fetchProfile } from "/js/firebase/auth.js";
import { submitSupportTicket } from "/js/firebase/support.js";

const SIGNIN_URL = "/pages/auth/signin.html";

/* Reasons list — verbatim, mirrors the mobile app. */
const CONTACT_REASONS = [
  "Booking Modification",
  "Cancellation Request",
  "Refund Request",
  "Trip Inquiry",
  "Account Issue",
  "Other"
];

/* ---------- DOM refs ---------- */

const els = {
  signin:    document.querySelector("[data-contact-signin]"),
  signinBtn: document.querySelector("[data-contact-signin-btn]"),
  loading:   document.querySelector("[data-contact-loading]"),
  form:      document.querySelector("[data-contact-form]"),
  name:      document.getElementById("contact-name"),
  email:     document.getElementById("contact-email"),
  reason:    document.getElementById("contact-reason"),
  message:   document.getElementById("contact-message"),
  submit:    document.querySelector("[data-contact-submit]")
};

/* ---------- Page state ---------- */

const state = {
  submitting: false
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", function () {
  if (els.signinBtn) {
    els.signinBtn.addEventListener("click", function () {
      const here = window.location.pathname;
      window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(here);
    });
  }
  if (els.form) {
    els.form.addEventListener("submit", onSubmit);
  }

  // React to every auth-state change. Signing out from another tab
  // flips the page back to the signin CTA.
  onAuthChange(function (user) {
    if (user) {
      showLoading();
      loadIdentity().then(showForm).catch(function (err) {
        console.warn("[contact] loadIdentity failed:", err);
        // Fall back to auth values; the form still works.
        showForm();
      });
    } else {
      showSigninCta();
    }
  });
});

/* ---------- View states ---------- */

function showSigninCta() { toggle(els.signin, true);  toggle(els.loading, false); toggle(els.form, false); }
function showLoading()   { toggle(els.signin, false); toggle(els.loading, true);  toggle(els.form, false); }
function showForm()      { toggle(els.signin, false); toggle(els.loading, false); toggle(els.form, true);  }

function toggle(el, visible) {
  if (!el) return;
  if (visible) el.classList.remove("d-none");
  else         el.classList.add("d-none");
}

/* ---------- Identity prefill ---------- */

/* Read users/{uid} once on mount and fill the disabled inputs.
   Each field falls back through profile → auth → empty string so
   a missing/sparse profile doesn't blank the form. */
async function loadIdentity() {
  const user = auth.currentUser;
  if (!user) return;

  let profile = null;
  try {
    profile = await fetchProfile();
  } catch (err) {
    console.warn("[contact] fetchProfile failed, falling back to auth:", err);
  }

  let name  = "";
  let email = "";
  if (profile && profile.fullName) name = profile.fullName;
  else if (user.displayName)       name = user.displayName;

  if (profile && profile.email)    email = profile.email;
  else if (user.email)             email = user.email;

  if (els.name)  els.name.value  = name;
  if (els.email) els.email.value = email;
}

/* ---------- Submit ---------- */

async function onSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;            // double-tap guard

  // Validation — reason defaults to "Booking Modification" so the
  // membership check is mostly defensive. Message must be non-empty.
  const reason  = els.reason  ? els.reason.value  : "";
  const message = els.message ? els.message.value : "";
  const trimmed = (message || "").trim();

  if (CONTACT_REASONS.indexOf(reason) === -1) {
    toast("Please pick a reason for contact.", "danger");
    return;
  }
  if (!trimmed) {
    toast("Please write a message before sending.", "danger");
    if (els.message) els.message.focus();
    return;
  }

  // The disabled-field values are part of the payload — read them
  // from the form (which was prefilled on mount), NOT from
  // auth.currentUser. If the user updated their profile in another
  // tab today, the next page mount picks up the change.
  const name  = els.name  ? els.name.value  : "";
  const email = els.email ? els.email.value : "";

  state.submitting = true;
  setBusy(els.submit, true);

  try {
    await submitSupportTicket({
      name:    name,
      email:   email,
      reason:  reason,
      message: trimmed
    });
  } catch (err) {
    console.error("[contact] submitSupportTicket failed:", err);
    state.submitting = false;
    setBusy(els.submit, false);

    const code = err && err.code ? err.code : "";
    if (code === "permission-denied" || code === "buzz/auth-required" || !auth.currentUser) {
      toast("Your session expired. Please sign in again.", "danger");
      setTimeout(function () {
        const here = window.location.pathname;
        window.location.href = SIGNIN_URL + "?next=" + encodeURIComponent(here);
      }, 1200);
      return;
    }
    toast("Could not send your message. Please try again.", "danger");
    return;
  }

  state.submitting = false;
  setBusy(els.submit, false);
  toast("Message sent successfully.", "success");

  // Reset only the editable fields — name + email stay prefilled.
  if (els.reason)  els.reason.value  = "Booking Modification";
  if (els.message) els.message.value = "";
}

/* ---------- UI helpers ---------- */

function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Sending…";
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function toast(message, kind) {
  const colour = kind || "success";
  const el = document.createElement("div");
  el.className = `position-fixed bottom-0 end-0 m-3 alert alert-${colour} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
  el.style.zIndex = "9999";
  el.textContent  = message;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}
