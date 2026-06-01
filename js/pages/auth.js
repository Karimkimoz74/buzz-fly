/* =====================================================
   Buzz Fly — auth.js  (page script)
   Wires the sign-in / sign-up / forgot-password forms to
   the Firebase auth module under /js/firebase/auth.js.

   ROUTING POLICY:
     After any successful sign-in / sign-up, decide where
     to land based on the user's profile completeness:
       - Profile missing or missing any onboarding-required
         field → push to /pages/profile/profile.html?onboarding=1
       - Profile complete → push to /index.html

     A signed-in user who lands on these auth pages directly
     is routed away on the same logic — one-shot check on
     DOMContentLoaded, NOT a live listener (avoids racing
     with in-progress sign-ins).

   Loaded as <script type="module"> on:
     pages/auth/signin.html
     pages/auth/signup.html
     pages/auth/forgot-password.html
   ===================================================== */

import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  sendPasswordReset,
  fetchProfile
} from "/js/firebase/auth.js";

import { auth } from "/js/firebase/firebase-init.js";

document.addEventListener("DOMContentLoaded", async () => {
  initPasswordToggle();
  preserveNextOnCrossLinks();

  // One-shot check: if Firebase already has a signed-in user when this
  // page loads, route them away — but NOT on forgot-password (a signed-in
  // user can legitimately want to reset their password from the profile page).
  const isForgotPage = window.location.pathname.includes("forgot-password");
  if (!isForgotPage) {
    await auth.authStateReady();
    if (auth.currentUser) {
      await routeAfterAuth();
      return;
    }
  }

  // Otherwise wire up the form handlers
  initSocialButtons();
  initSigninForm();
  initSignupForm();
  initForgotForm();
});

/* Append the current ?next= to every link pointing to another auth
   page. Without this, a user who landed on signin?next=/bookings and
   clicked "Create Account" would lose the redirect target. */
function preserveNextOnCrossLinks() {
  const next = getNextUrl();
  if (!next) return;
  const targets = [
    "/pages/auth/signin.html",
    "/pages/auth/signup.html",
    "/pages/auth/forgot-password.html"
  ];
  for (const target of targets) {
    document.querySelectorAll(`a[href="${target}"]`).forEach(function (a) {
      a.href = target + "?next=" + encodeURIComponent(next);
    });
  }
}

/* ---------- Routing decision ---------- */

const ONBOARDING_URL = "/pages/profile/profile.html?onboarding=1";
const HOME_URL       = "/index.html";

/* Read the ?next= URL param and validate it. Only same-origin relative
   paths starting with a single slash are accepted, so a malicious URL
   like ?next=//evil.com or ?next=https://evil.com is rejected. Returns
   the path or null when missing/invalid. */
function getNextUrl() {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  // Must start with a single '/' (not '//' protocol-relative, not 'http')
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  return decoded;
}

function profileNeedsOnboarding(profile) {
  if (!profile) {
    return true;
  }
  // Required onboarding fields per the profile spec
  if (!profile.gender)         return true;
  if (!profile.dateOfBirth)    return true;
  if (!profile.passportNumber) return true;
  if (!profile.phoneNumber)    return true;
  return false;
}

/* Build the onboarding URL, threading the next param through so that
   when the profile-onboarding form is saved, the user lands back on
   the page they originally came from. */
function buildOnboardingUrl(next) {
  if (!next) return ONBOARDING_URL;
  return ONBOARDING_URL + "&next=" + encodeURIComponent(next);
}

async function routeAfterAuth() {
  const next    = getNextUrl();
  const profile = await fetchProfile();

  if (profileNeedsOnboarding(profile)) {
    localStorage.setItem('buzzfly.profileIncomplete', '1');
    window.location.href = buildOnboardingUrl(next);
    return;
  }
  localStorage.removeItem('buzzfly.profileIncomplete');
  window.location.href = next || HOME_URL;
}

/* ---------- Password eye toggle ---------- */
function initPasswordToggle() {
  const toggles = document.querySelectorAll("[data-toggle-password]");
  toggles.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = btn.parentElement.querySelector("input");
      if (!input) {
        return;
      }
      if (input.type === "password") {
        input.type = "text";
      } else {
        input.type = "password";
      }
    });
  });
}

/* ---------- Google sign-in button ---------- */
function initSocialButtons() {
  const googleButtons = document.querySelectorAll("[data-auth-provider='google']");
  googleButtons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      const form = btn.closest("form");
      clearError(form);
      setBusy(btn, true);
      try {
        await signInWithGoogle();
        await routeAfterAuth();
      } catch (err) {
        showError(form, friendlyError(err));
        setBusy(btn, false);
      }
    });
  });
}

/* ---------- Sign-in form (existing user) ---------- */
function initSigninForm() {
  const form = document.getElementById("signinForm");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError(form);

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showError(form, "Please enter your email and password.");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    setBusy(submitBtn, true);
    try {
      await signInWithEmail(email, password);
      await routeAfterAuth();
    } catch (err) {
      showError(form, friendlyError(err));
      setBusy(submitBtn, false);
    }
  });
}

/* ---------- Sign-up form (always new user → onboarding) ---------- */
function initSignupForm() {
  const form = document.getElementById("signupForm");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError(form);

    const fullName        = document.getElementById("fullName").value.trim();
    const email           = document.getElementById("email").value.trim();
    const password        = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const agreed          = document.getElementById("agreeTerms").checked;

    if (!fullName || !email || !password) {
      showError(form, "Please fill in your full name, email and password.");
      return;
    }
    if (password.length < 8) {
      showError(form, "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showError(form, "Passwords don't match.");
      return;
    }
    if (!agreed) {
      showError(form, "You must agree to the Terms and Privacy Policy.");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    setBusy(submitBtn, true);
    try {
      await signUpWithEmail({ email, password, fullName });
      // Fresh sign-up always goes to onboarding — pass next through so
      // the profile-onboarding save lands back on the original page.
      window.location.href = buildOnboardingUrl(getNextUrl());
    } catch (err) {
      showError(form, friendlyError(err));
      setBusy(submitBtn, false);
    }
  });
}

/* ---------- Forgot-password form ---------- */
function initForgotForm() {
  const form = document.getElementById("forgotForm");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError(form);
    clearSuccess(form);

    const email = document.getElementById("email").value.trim();
    if (!email) {
      showError(form, "Please enter your email address.");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    setBusy(submitBtn, true);
    try {
      await sendPasswordReset(email);
      showSuccess(form, "Reset email sent. Check your inbox.");
    } catch (err) {
      showError(form, friendlyError(err));
    } finally {
      setBusy(submitBtn, false);
    }
  });
}

/* ---------- UI helpers ---------- */

function setBusy(button, busy) {
  if (!button) {
    return;
  }
  if (busy) {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Please wait…";
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function showError(form, message) {
  if (!form) return;
  let alert = form.querySelector(".buzz-auth-alert");
  if (!alert) {
    alert = document.createElement("div");
    alert.className = "alert alert-danger buzz-auth-alert mb-3";
    alert.setAttribute("role", "alert");
    form.prepend(alert);
  }
  alert.textContent = message;
}

function clearError(form) {
  if (!form) return;
  const alert = form.querySelector(".buzz-auth-alert");
  if (alert) alert.remove();
}

function showSuccess(form, message) {
  if (!form) return;
  let alert = form.querySelector(".buzz-auth-success");
  if (!alert) {
    alert = document.createElement("div");
    alert.className = "alert alert-success buzz-auth-success mb-3";
    alert.setAttribute("role", "alert");
    form.prepend(alert);
  }
  alert.textContent = message;
}

function clearSuccess(form) {
  if (!form) return;
  const alert = form.querySelector(".buzz-auth-success");
  if (alert) alert.remove();
}

function friendlyError(err) {
  if (!err) return "Something went wrong. Please try again.";
  const code = err.code || "";

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Email or password is incorrect.";
  }
  if (code === "auth/invalid-email") {
    return "That email address looks invalid.";
  }
  if (code === "auth/email-already-in-use") {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 8 characters.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Sign-in was cancelled.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the sign-in popup. Allow popups and try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Check your connection and try again.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a minute and try again.";
  }

  return err.message || "Something went wrong. Please try again.";
}
