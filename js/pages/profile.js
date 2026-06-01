// profile.js — reads + writes users/{uid} on Firestore
// Two modes: EDIT (default) and ONBOARDING (?onboarding=1)

import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, db }       from "/js/firebase/firebase-init.js";
import { userAvatarCache } from "/js/firebase/avatar-cache.js";

const AVATAR_PATHS = [
  "/assets/avatars/avatar1.png", "/assets/avatars/avatar2.png",
  "/assets/avatars/avatar3.png", "/assets/avatars/avatar4.png",
  "/assets/avatars/avatar5.png"
];
const SIGNIN_URL    = "/pages/auth/signin.html";
const HOME_URL      = "/index.html";
const MIN_AGE_YEARS = 12;
const SNAP_FIELDS   = ["fullName","gender","dob","age","passportNumber","passportExpiry","country","phoneNumber","title"];

// ── DOM refs ──────────────────────────────────────────────────────────────────

const els = {
  editBtn:         document.querySelector("[data-profile-edit-btn]"),
  saveBtn:         document.querySelector("[data-profile-save-btn]"),
  discardBtn:      document.querySelector("[data-profile-discard-btn]"),
  actionsRow:      document.querySelector("[data-profile-actions]"),
  editingAlert:    document.querySelector("[data-profile-editing-alert]"),
  onboardingAlert: document.querySelector("[data-profile-onboarding-alert]"),
  form:            document.querySelector("[data-profile-form]"),
  displayName:     document.querySelector("[data-profile-display-name]"),
  pageTitle:       document.querySelector("[data-profile-page-title]"),
  pageSub:         document.querySelector("[data-profile-page-sub]"),
  reqMarks:        document.querySelectorAll("[data-req-mark-onboarding]"),
  avatarPreview:   document.getElementById("avatar-preview"),
  avatarWrap:      document.getElementById("avatar-preview-wrap"),
  avatarToggleBtn: document.querySelector("[data-avatar-picker-toggle]"),
  avatarPicker:    document.querySelector("[data-avatar-picker]"),
  avatarGrid:      document.querySelector("[data-avatar-grid]"),
  fullName:        document.getElementById("profile-fullname"),
  gender:          document.getElementById("profile-gender"),
  dob:             document.getElementById("profile-dob"),
  age:             document.getElementById("profile-age"),
  passportNumber:  document.getElementById("profile-passport"),
  passportExpiry:  document.getElementById("profile-passport-expiry"),
  country:         document.getElementById("profile-country"),
  email:           document.getElementById("profile-email"),
  phoneNumber:     document.getElementById("profile-phone"),
  title:           document.getElementById("profile-title")
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  editing:        false,
  isOnboarding:   false,
  selectedAvatar: null,
  snapshot:       null
};

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  state.isOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";

  await auth.authStateReady();
  if (!auth.currentUser) {
    window.location.href = `${SIGNIN_URL}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  buildAvatarPicker();

  const cached = userAvatarCache.get();
  if (cached) {
    state.selectedAvatar = cached;
    applyAvatarToPreview(cached);
    highlightSelectedAvatar();
  }

  await loadProfile();

  els.editBtn?.addEventListener("click", enterEditMode);
  els.saveBtn?.addEventListener("click", saveProfile);
  els.discardBtn?.addEventListener("click", discardChanges);
  els.avatarToggleBtn?.addEventListener("click", toggleAvatarPicker);
  els.dob?.addEventListener("change", () => {
    els.age.value = computeAge(els.dob.value) ?? "";
  });

  applyOnboardingChrome();
  if (state.isOnboarding) enterEditMode();
});

// ── Onboarding chrome ─────────────────────────────────────────────────────────

function applyOnboardingChrome() {
  if (!state.isOnboarding) return;
  els.onboardingAlert?.classList.remove("d-none");
  els.reqMarks.forEach(m => m.classList.remove("d-none"));
  els.discardBtn?.classList.add("d-none");
  if (els.pageTitle) els.pageTitle.textContent = "Complete Your Profile";
  if (els.pageSub)   els.pageSub.textContent   = "A few details so we can book your trips.";
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadProfile() {
  const user = auth.currentUser;
  let data = {};
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) data = snap.data();
  } catch (err) {
    console.error("[profile] fetch failed:", err);
    showToast("Couldn't load your profile. Refresh to retry.", "danger");
    return;
  }

  const simple = {
    fullName: data.fullName || user.displayName || "",
    email:    data.email    || user.email       || "",
    gender: data.gender || "", country: data.country || "",
    phoneNumber: data.phoneNumber || "", title: data.title || "",
    passportNumber: data.passportNumber || ""
  };
  Object.entries(simple).forEach(([k, v]) => { if (els[k]) els[k].value = v; });

  els.dob.value            = toIsoDate(data.dateOfBirth);
  els.passportExpiry.value = toIsoDate(data.passportExpiry);
  els.age.value            = data.age || (computeAge(els.dob.value) ?? "");

  state.selectedAvatar = data.avatar || null;
  applyAvatarToPreview(state.selectedAvatar);
  highlightSelectedAvatar();
  if (els.displayName) els.displayName.textContent = els.fullName.value || "Traveler";
  userAvatarCache.set(state.selectedAvatar);
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function enterEditMode() {
  state.editing  = true;
  state.snapshot = currentValuesSnapshot();
  enableFields(true);
  els.editBtn?.classList.add("d-none");
  els.actionsRow?.classList.remove("d-none");
  if (!state.isOnboarding) els.editingAlert?.classList.remove("d-none");
  els.avatarToggleBtn?.classList.remove("d-none");
}

function exitEditMode() {
  state.editing = false;
  enableFields(false);
  els.editBtn?.classList.remove("d-none");
  els.actionsRow?.classList.add("d-none");
  els.editingAlert?.classList.add("d-none");
  els.avatarPicker?.classList.add("d-none");
  els.avatarToggleBtn?.classList.add("d-none");
}

function discardChanges() {
  if (!state.editing) return;
  if (!window.confirm("Discard unsaved changes?")) return;
  restoreSnapshot(state.snapshot);
  applyAvatarToPreview(state.selectedAvatar);
  highlightSelectedAvatar();
  exitEditMode();
}

function enableFields(on) {
  els.form.querySelectorAll("input, select").forEach(el => {
    if (el === els.email || el === els.age) return;
    el.toggleAttribute(el.tagName === "SELECT" ? "disabled" : "readonly", !on);
    el.classList.toggle("border-success", on);
  });
}

function currentValuesSnapshot() {
  const s = { avatar: state.selectedAvatar };
  SNAP_FIELDS.forEach(k => { s[k] = els[k].value; });
  return s;
}

function restoreSnapshot(s) {
  if (!s) return;
  SNAP_FIELDS.forEach(k => { els[k].value = s[k]; });
  state.selectedAvatar = s.avatar;
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveProfile() {
  if (!state.editing) return;
  const errors = validate();
  if (errors.length) { showToast(errors[0], "danger"); return; }

  const user     = auth.currentUser;
  const fullName = els.fullName.value.trim();

  if (fullName !== (user.displayName || "")) {
    try { await updateProfile(user, { displayName: fullName }); }
    catch (err) { console.warn("[profile] updateProfile failed:", err); }
  }

  const payload = {
    fullName,
    gender:         els.gender.value         || null,
    dateOfBirth:    isoToDmy(els.dob.value)  || null,
    age:            els.age.value            || null,
    passportNumber: els.passportNumber.value.trim() || null,
    passportExpiry: isoToDmy(els.passportExpiry.value) || null,
    country:        els.country.value        || null,
    email:          user.email,
    phoneNumber:    els.phoneNumber.value.trim() || null,
    title:          els.title.value          || null,
    avatar:         state.selectedAvatar,
    updatedAt:      serverTimestamp()
  };

  setBusy(els.saveBtn, true);
  try {
    await setDoc(doc(db, "users", user.uid), payload, { merge: true });
    userAvatarCache.set(state.selectedAvatar);
    if (els.displayName) els.displayName.textContent = fullName || "Traveler";
    localStorage.removeItem('buzzfly.profileIncomplete');
    if (state.isOnboarding) {
      window.location.href = getValidatedNextUrl() || HOME_URL;
      return;
    }
    exitEditMode();
    showToast("Profile saved.");
  } catch (err) {
    console.error("[profile] save failed:", err);
    showToast("Couldn't save your profile. Try again.", "danger");
  } finally {
    setBusy(els.saveBtn, false);
  }
}

/* Read the ?next= URL param and validate it — same-origin paths only. */
function getValidatedNextUrl() {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  return decoded;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate() {
  const errors = [];
  const fullName = els.fullName.value.trim();
  if (!fullName || !/[a-zA-Z]/.test(fullName))
    errors.push("Please enter your full name.");

  if (els.passportNumber.value.trim().length < 5)
    errors.push("Passport number must be at least 5 characters.");

  if ((els.phoneNumber.value.match(/\d/g) || []).length < 6)
    errors.push("Phone number must contain at least 6 digits.");

  if (state.isOnboarding) {
    if (!els.gender.value) errors.push("Please pick a gender.");
    if (!els.dob.value)    errors.push("Please enter your date of birth.");
  }

  if (els.dob.value) {
    const age = computeAge(els.dob.value);
    if (age === null)          errors.push("Date of birth doesn't look valid.");
    else if (age < MIN_AGE_YEARS) errors.push(`You must be at least ${MIN_AGE_YEARS} years old.`);
  }

  if (els.passportExpiry.value) {
    const expiry = new Date(els.passportExpiry.value);
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(expiry.getTime()) || expiry <= today)
      errors.push("Passport expiry must be a future date.");
  }

  return errors;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function buildAvatarPicker() {
  if (!els.avatarGrid) return;
  els.avatarGrid.innerHTML = AVATAR_PATHS.map(path => `
    <button type="button" class="border-0 p-0 bg-transparent rounded-circle"
            style="width:56px;height:56px;" data-avatar-tile="${path}" aria-label="Select avatar">
      <img src="${path}" alt="" class="w-100 h-100 rounded-circle border" style="object-fit:cover;cursor:pointer;" />
    </button>`).join("");

  els.avatarGrid.querySelectorAll("[data-avatar-tile]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedAvatar = btn.dataset.avatarTile;
      applyAvatarToPreview(state.selectedAvatar);
      highlightSelectedAvatar();
    });
  });
}

function toggleAvatarPicker() {
  els.avatarPicker?.classList.toggle("d-none");
}

function applyAvatarToPreview(path) {
  if (!els.avatarPreview) return;
  if (path) {
    Object.assign(els.avatarPreview.style, { width: "100%", height: "100%", objectFit: "cover", filter: "none", padding: "0" });
    els.avatarPreview.src = normaliseAssetPath(path);
    els.avatarWrap?.classList.remove("bg-light");
  } else {
    Object.assign(els.avatarPreview.style, { width: "42px", height: "42px", objectFit: "contain", filter: "", padding: "" });
    els.avatarPreview.src = els.avatarPreview.dataset.defaultSrc || "/assets/icons/user.svg";
    els.avatarWrap?.classList.add("bg-light");
  }
}

function highlightSelectedAvatar() {
  if (!els.avatarGrid) return;
  els.avatarGrid.querySelectorAll("[data-avatar-tile]").forEach(btn => {
    const selected = state.selectedAvatar === btn.dataset.avatarTile;
    const img = btn.querySelector("img");
    if (!img) return;
    img.classList.add("border");
    img.classList.toggle("border-3", selected);
    img.classList.toggle("border-success", selected);
  });
}

function normaliseAssetPath(path) {
  if (!path) return "";
  return (path.startsWith("/") || path.startsWith("http")) ? path : "/" + path;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toIsoDate(value) {
  if (!value) return "";
  if (typeof value === "object" && typeof value.toDate === "function") value = value.toDate();
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const d = new Date(t);
    if (!isNaN(d.getTime())) return toIsoDate(d);
  }
  return "";
}

function isoToDmy(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function computeAge(isoDate) {
  if (!isoDate) return null;
  const dob = new Date(isoDate);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) years--;
  return years < 0 ? null : years;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.innerHTML = "Saving…";
  } else if (button.dataset.originalText) {
    button.innerHTML = button.dataset.originalText;
  }
}

function showToast(message, kind = "success") {
  const t = document.createElement("div");
  t.className = `position-fixed bottom-0 end-0 m-3 alert alert-${kind} shadow-sm rounded-4 py-2 px-3 small fw-semibold`;
  t.style.zIndex = "9999";
  t.textContent  = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
