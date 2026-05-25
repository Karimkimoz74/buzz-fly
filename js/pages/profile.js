/* =====================================================
   Buzz Fly — profile.js (page script)
   Reads + writes users/{uid} on Firestore. Two modes:

     EDIT mode (default)
       - Reached from the Profile menu's "Edit Profile" button
       - Back button OK; Discard reverts pending changes after a confirm
       - Toast + back-nav after Save

     ONBOARDING mode (URL has ?onboarding=1)
       - Reached after a brand-new sign-up or first Google sign-in
       - "Welcome! Complete your profile…" banner
       - Discard button hidden — the user can't dismiss this screen
       - Required-on-save grows to include gender + dateOfBirth
       - After Save → land on Home

   Both paths write to the SAME doc with setDoc(merge:true).
   When fullName changes, also calls updateProfile(displayName).
   Avatar field stores a bundled path like "assets/avatars/avatar3.png".

   Loaded as <script type="module"> on:
     pages/profile/profile.html
   ===================================================== */

import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import { auth, db } from "/js/firebase/firebase-init.js";
import { userAvatarCache } from "/js/firebase/avatar-cache.js";

/* ---------- Constants ---------- */

const AVATAR_PATHS = [
  "/assets/avatars/avatar1.png",
  "/assets/avatars/avatar2.png",
  "/assets/avatars/avatar3.png",
  "/assets/avatars/avatar4.png",
  "/assets/avatars/avatar5.png"
];

const SIGNIN_URL    = "/pages/auth/signin.html";
const HOME_URL      = "/index.html";
const MIN_AGE_YEARS = 12;

/* ---------- DOM refs ---------- */

const els = {
  editBtn:           document.querySelector("[data-profile-edit-btn]"),
  saveBtn:           document.querySelector("[data-profile-save-btn]"),
  discardBtn:        document.querySelector("[data-profile-discard-btn]"),
  actionsRow:        document.querySelector("[data-profile-actions]"),
  editingAlert:      document.querySelector("[data-profile-editing-alert]"),
  onboardingAlert:   document.querySelector("[data-profile-onboarding-alert]"),
  form:              document.querySelector("[data-profile-form]"),
  displayName:       document.querySelector("[data-profile-display-name]"),
  reqMarks:          document.querySelectorAll("[data-req-mark-onboarding]"),

  // Avatar
  avatarPreview:     document.getElementById("avatar-preview"),
  avatarToggleBtn:   document.querySelector("[data-avatar-picker-toggle]"),
  avatarPicker:      document.querySelector("[data-avatar-picker]"),
  avatarGrid:        document.querySelector("[data-avatar-grid]"),

  // Form fields
  fullName:          document.getElementById("profile-fullname"),
  gender:            document.getElementById("profile-gender"),
  dob:               document.getElementById("profile-dob"),
  age:               document.getElementById("profile-age"),
  passportNumber:    document.getElementById("profile-passport"),
  passportExpiry:    document.getElementById("profile-passport-expiry"),
  country:           document.getElementById("profile-country"),
  email:             document.getElementById("profile-email"),
  phoneNumber:       document.getElementById("profile-phone"),
  title:             document.getElementById("profile-title")
};

/* ---------- Page-level state ---------- */

const state = {
  editing:        false,
  isOnboarding:   false,
  selectedAvatar: null,
  // snapshot of field values at the moment we enter edit mode, for Discard
  snapshot:       null
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  state.isOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";

  await auth.authStateReady();
  if (!auth.currentUser) {
    // Profile page requires sign-in. Bounce to login carrying intent.
    window.location.href = `${SIGNIN_URL}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  buildAvatarPicker();

  // Paint the preview from the cached avatar instantly so the user
  // never sees a flash of the default icon. loadProfile() will
  // overwrite with the live Firestore value moments later if it
  // differs (e.g., changed on another device).
  const cachedAvatar = userAvatarCache.get();
  if (cachedAvatar) {
    state.selectedAvatar = cachedAvatar;
    applyAvatarToPreview(cachedAvatar);
    highlightSelectedAvatar();
  }

  await loadProfile();

  // Wire control buttons
  if (els.editBtn)         els.editBtn.addEventListener("click", enterEditMode);
  if (els.saveBtn)         els.saveBtn.addEventListener("click", saveProfile);
  if (els.discardBtn)      els.discardBtn.addEventListener("click", discardChanges);
  if (els.avatarToggleBtn) els.avatarToggleBtn.addEventListener("click", toggleAvatarPicker);

  // Auto-derive age when DOB changes
  if (els.dob) {
    els.dob.addEventListener("change", () => {
      const a = computeAge(els.dob.value);
      els.age.value = a !== null ? String(a) : "";
    });
  }

  applyOnboardingChrome();

  if (state.isOnboarding) {
    enterEditMode();
  }
});

/* ---------- Onboarding mode chrome ---------- */

function applyOnboardingChrome() {
  if (!state.isOnboarding) return;

  // Show the welcome banner
  els.onboardingAlert?.classList.remove("d-none");

  // Reveal the required asterisks beside gender + DOB
  els.reqMarks.forEach(m => m.classList.remove("d-none"));

  // Hide the Discard button — user can't dismiss this screen
  if (els.discardBtn) {
    els.discardBtn.classList.add("d-none");
  }

  // Title/subtitle copy tweak
  const titleEl = document.querySelector("[data-profile-page-title]");
  const subEl   = document.querySelector("[data-profile-page-sub]");
  if (titleEl) titleEl.textContent = "Complete Your Profile";
  if (subEl)   subEl.textContent   = "A few details so we can book your trips.";
}

/* ---------- Load doc → form ---------- */

async function loadProfile() {
  const user = auth.currentUser;

  let data = {};
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      data = snap.data();
    }
  } catch (err) {
    console.error("[profile] fetch failed:", err);
    showToast("Couldn't load your profile. Refresh to retry.", "danger");
    return;
  }

  els.fullName.value       = data.fullName       || user.displayName || "";
  els.email.value          = data.email          || user.email       || "";
  els.gender.value         = data.gender         || "";
  els.dob.value            = toIsoDate(data.dateOfBirth);
  els.age.value            = data.age            || (computeAge(els.dob.value) ?? "");
  els.passportNumber.value = data.passportNumber || "";
  els.passportExpiry.value = toIsoDate(data.passportExpiry);
  els.country.value        = data.country        || "";
  els.phoneNumber.value    = data.phoneNumber    || "";
  els.title.value          = data.title          || "";

  state.selectedAvatar = data.avatar || null;
  applyAvatarToPreview(state.selectedAvatar);
  highlightSelectedAvatar();

  // Header display name
  if (els.displayName) {
    els.displayName.textContent = els.fullName.value || "Traveler";
  }

  // Push initial value into the cache so navbar/header avatar updates too
  userAvatarCache.set(state.selectedAvatar);
}

/* ---------- Edit / discard ---------- */

function enterEditMode() {
  state.editing  = true;
  state.snapshot = currentValuesSnapshot();

  enableFields(true);

  els.editBtn?.classList.add("d-none");
  els.actionsRow?.classList.remove("d-none");
  if (!state.isOnboarding) {
    els.editingAlert?.classList.remove("d-none");
  }

  // Show the Change Avatar button once in edit mode
  els.avatarToggleBtn?.classList.remove("d-none");
}

function discardChanges() {
  if (!state.editing) return;
  const confirmed = window.confirm("Discard unsaved changes?");
  if (!confirmed) return;

  // Restore snapshot
  restoreSnapshot(state.snapshot);
  applyAvatarToPreview(state.selectedAvatar);
  highlightSelectedAvatar();

  state.editing = false;
  enableFields(false);

  els.editBtn?.classList.remove("d-none");
  els.actionsRow?.classList.add("d-none");
  els.editingAlert?.classList.add("d-none");
  els.avatarPicker?.classList.add("d-none");
  els.avatarToggleBtn?.classList.add("d-none");
}

function enableFields(on) {
  const inputs = els.form.querySelectorAll("input, select");
  inputs.forEach(el => {
    // Email and Age are always read-only (auto-managed)
    if (el === els.email || el === els.age) return;

    if (el.tagName === "SELECT") {
      if (on) el.removeAttribute("disabled");
      else    el.setAttribute("disabled", "");
    } else {
      if (on) el.removeAttribute("readonly");
      else    el.setAttribute("readonly", "");
    }

    if (on) el.classList.add("border-success");
    else    el.classList.remove("border-success");
  });
}

function currentValuesSnapshot() {
  return {
    fullName:       els.fullName.value,
    gender:         els.gender.value,
    dob:            els.dob.value,
    age:            els.age.value,
    passportNumber: els.passportNumber.value,
    passportExpiry: els.passportExpiry.value,
    country:        els.country.value,
    phoneNumber:    els.phoneNumber.value,
    title:          els.title.value,
    avatar:         state.selectedAvatar
  };
}

function restoreSnapshot(s) {
  if (!s) return;
  els.fullName.value       = s.fullName;
  els.gender.value         = s.gender;
  els.dob.value            = s.dob;
  els.age.value            = s.age;
  els.passportNumber.value = s.passportNumber;
  els.passportExpiry.value = s.passportExpiry;
  els.country.value        = s.country;
  els.phoneNumber.value    = s.phoneNumber;
  els.title.value          = s.title;
  state.selectedAvatar     = s.avatar;
}

/* ---------- Save ---------- */

async function saveProfile() {
  if (!state.editing) return;

  const errors = validate();
  if (errors.length) {
    showToast(errors[0], "danger");
    return;
  }

  const user     = auth.currentUser;
  const fullName = els.fullName.value.trim();

  // Sync displayName when fullName changes
  if (fullName !== (user.displayName || "")) {
    try {
      await updateProfile(user, { displayName: fullName });
    } catch (err) {
      console.warn("[profile] updateProfile failed:", err);
    }
  }

  const payload = {
    fullName,
    gender:         els.gender.value || null,
    dateOfBirth:    isoToDmy(els.dob.value) || null,
    age:            els.age.value || null,
    passportNumber: els.passportNumber.value.trim() || null,
    passportExpiry: isoToDmy(els.passportExpiry.value) || null,
    country:        els.country.value || null,
    email:          user.email,
    phoneNumber:    els.phoneNumber.value.trim() || null,
    title:          els.title.value || null,
    avatar:         state.selectedAvatar,
    updatedAt:      serverTimestamp()
  };

  setBusy(els.saveBtn, true);
  try {
    await setDoc(doc(db, "users", user.uid), payload, { merge: true });
  } catch (err) {
    console.error("[profile] save failed:", err);
    showToast("Couldn't save your profile. Try again.", "danger");
    setBusy(els.saveBtn, false);
    return;
  }
  setBusy(els.saveBtn, false);

  // Notify any subscribed avatars (header, drawer, etc.)
  userAvatarCache.set(state.selectedAvatar);

  // Update the page's display name immediately
  if (els.displayName) {
    els.displayName.textContent = fullName || "Traveler";
  }

  if (state.isOnboarding) {
    window.location.href = HOME_URL;
    return;
  }

  // Edit mode: drop back to read view
  state.editing = false;
  enableFields(false);
  els.editBtn?.classList.remove("d-none");
  els.actionsRow?.classList.add("d-none");
  els.editingAlert?.classList.add("d-none");
  els.avatarPicker?.classList.add("d-none");
  els.avatarToggleBtn?.classList.add("d-none");

  showToast("Profile saved.", "success");
}

/* ---------- Validation ---------- */

function validate() {
  const errors = [];

  const fullName = els.fullName.value.trim();
  if (!fullName || !/[a-zA-Z]/.test(fullName)) {
    errors.push("Please enter your full name.");
  }

  const passport = els.passportNumber.value.trim();
  if (!passport || passport.length < 5) {
    errors.push("Passport number must be at least 5 characters.");
  }

  const phoneDigits = (els.phoneNumber.value.match(/\d/g) || []).length;
  if (phoneDigits < 6) {
    errors.push("Phone number must contain at least 6 digits.");
  }

  // Onboarding-only required fields
  if (state.isOnboarding) {
    if (!els.gender.value) {
      errors.push("Please pick a gender.");
    }
    if (!els.dob.value) {
      errors.push("Please enter your date of birth.");
    }
  }

  // Date sanity (when provided)
  if (els.dob.value) {
    const age = computeAge(els.dob.value);
    if (age === null) {
      errors.push("Date of birth doesn't look valid.");
    } else if (age < MIN_AGE_YEARS) {
      errors.push(`You must be at least ${MIN_AGE_YEARS} years old.`);
    }
  }

  if (els.passportExpiry.value) {
    const expiry = new Date(els.passportExpiry.value);
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(expiry.getTime()) || expiry <= today) {
      errors.push("Passport expiry must be a future date.");
    }
  }

  return errors;
}

/* ---------- Avatar picker ---------- */

function buildAvatarPicker() {
  if (!els.avatarGrid) return;
  let html = "";
  for (const path of AVATAR_PATHS) {
    html += `
      <button type="button"
              class="border-0 p-0 bg-transparent rounded-circle"
              style="width:56px;height:56px;"
              data-avatar-tile="${path}"
              aria-label="Select avatar">
        <img src="${path}" alt=""
             class="w-100 h-100 rounded-circle border"
             style="object-fit:cover;cursor:pointer;" />
      </button>
    `;
  }
  els.avatarGrid.innerHTML = html;

  els.avatarGrid.querySelectorAll("[data-avatar-tile]").forEach(btn => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.avatarTile;
      state.selectedAvatar = path;
      applyAvatarToPreview(path);
      highlightSelectedAvatar();
    });
  });
}

function toggleAvatarPicker() {
  if (!els.avatarPicker) return;
  els.avatarPicker.classList.toggle("d-none");
}

function applyAvatarToPreview(path) {
  if (!els.avatarPreview) return;
  const wrap = document.getElementById("avatar-preview-wrap");

  if (path) {
    // Fill mode — avatar PNG covers the whole circle. The placeholder
    // bg is removed so any transparent PNG margins blend into the white
    // card instead of showing a visible gray ring.
    els.avatarPreview.src              = normaliseAssetPath(path);
    els.avatarPreview.style.width      = "100%";
    els.avatarPreview.style.height     = "100%";
    els.avatarPreview.style.objectFit  = "cover";
    els.avatarPreview.style.filter     = "none";
    els.avatarPreview.style.padding    = "0";
    if (wrap) wrap.classList.remove("bg-light");
  } else {
    // Placeholder mode — small centered user.svg on a soft gray bg.
    const defaultSrc = els.avatarPreview.dataset.defaultSrc || "/assets/icons/user.svg";
    els.avatarPreview.src              = defaultSrc;
    els.avatarPreview.style.width      = "42px";
    els.avatarPreview.style.height     = "42px";
    els.avatarPreview.style.objectFit  = "contain";
    els.avatarPreview.style.filter     = "";
    els.avatarPreview.style.padding    = "";
    if (wrap) wrap.classList.add("bg-light");
  }
}

function highlightSelectedAvatar() {
  if (!els.avatarGrid) return;
  els.avatarGrid.querySelectorAll("[data-avatar-tile]").forEach(btn => {
    const path = btn.dataset.avatarTile;
    const inner = btn.querySelector("img");
    if (!inner) return;
    if (state.selectedAvatar === path) {
      inner.classList.remove("border");
      inner.classList.add("border", "border-3", "border-success");
    } else {
      inner.classList.remove("border-3", "border-success");
      inner.classList.add("border");
    }
  });
}

/* Mobile stores avatars as relative paths "assets/avatars/avatar3.png".
   Web is served from the project root, so the same string needs a leading slash. */
function normaliseAssetPath(path) {
  if (!path) return "";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return "/" + path;
}

/* ---------- Date helpers (dd/mm/yyyy ⇄ yyyy-mm-dd) ---------- */

function dmyToIso(dmy) {
  if (!dmy) return "";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/* Accept any of: Firestore Timestamp, JS Date, ISO yyyy-mm-dd, or
   dd/mm/yyyy string. Returns ISO yyyy-mm-dd for <input type="date">,
   or "" when the value is missing/unparseable. The mobile app may
   store DOB/passport-expiry as a Timestamp; web stores dd/mm/yyyy.
   Both must light up the same form. */
function toIsoDate(value) {
  if (!value) return "";

  // Firestore Timestamp → has .toDate()
  if (typeof value === "object" && typeof value.toDate === "function") {
    return jsDateToIso(value.toDate());
  }

  // Native Date
  if (value instanceof Date) {
    return jsDateToIso(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Already ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    // Web format dd/mm/yyyy
    const dmy = dmyToIso(trimmed);
    if (dmy) return dmy;
    // Last-ditch: let Date try to parse it
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return jsDateToIso(d);
  }

  return "";
}

function jsDateToIso(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDmy(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

function computeAge(isoDate) {
  if (!isoDate) return null;
  const dob = new Date(isoDate);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    years--;
  }
  if (years < 0) return null;
  return years;
}

/* ---------- UI helpers ---------- */

function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Saving…";
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function showToast(message, kind) {
  const t = document.createElement("div");
  t.className = `position-fixed bottom-0 end-0 m-3 alert alert-${kind || "success"} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
  t.style.zIndex = "9999";
  t.textContent  = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
