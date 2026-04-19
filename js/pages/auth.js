/* Buzz Fly — auth.js
   Handles the sign-in / sign-up / forgot-password pages.
   Data is dummy (UI phase) — no real auth backend yet. */

document.addEventListener("DOMContentLoaded", () => {
  initPasswordToggle();
  initSocialButtons();
  initAuthForm();
});

/* Show/hide password eye icon */
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

/* Social sign-in buttons (Google / Apple).
   Real OAuth redirect will be wired when backend is ready.
   For now: no-op placeholder so clicks don't do anything harmful. */
function initSocialButtons() {
  const buttons = document.querySelectorAll("[data-auth-provider]");

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const provider = btn.dataset.authProvider;
      console.log("[auth] " + provider + " sign-in clicked — backend not wired yet.");
    });
  });
}

/* Dummy form submit — prevent navigation, log values.
   Replace with real fetch() when backend is ready. */
function initAuthForm() {
  const signinForm = document.getElementById("signinForm");
  const signupForm = document.getElementById("signupForm");
  const forgotForm = document.getElementById("forgotForm");

  if (forgotForm) {
    forgotForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const data = {
        email: document.getElementById("email").value
      };
      console.log("[auth] reset-password submitted (dummy):", data);
    });
  }

  if (signinForm) {
    signinForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const data = {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      };
      console.log("[auth] sign-in submitted (dummy):", data);
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const data = {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        confirmPassword: document.getElementById("confirmPassword").value,
        agreed: document.getElementById("agreeTerms").checked
      };

      if (data.password !== data.confirmPassword) {
        console.log("[auth] passwords don't match");
        return;
      }
      if (!data.agreed) {
        console.log("[auth] must agree to terms");
        return;
      }

      console.log("[auth] sign-up submitted (dummy):", data);
    });
  }
}
