/* =====================================================
   Buzz Fly — flight-search.js (Stage 2 of the flight flow)

   Reads the FlightSearchQuery from URL params (set by
   home.js on Stage 1), and an optional outboundFlight
   from sessionStorage (set when the user picked outbound
   on a round-trip and the page reloaded with ?leg=return).

   Two scenarios, one code path:
     A — One way (query.isRoundTrip === false)
         user picks one flight → Stage 3 with returnFlight = null
     B — Round-trip
         outbound run → user picks → stash + reload with ?leg=return
         return run → user picks → Stage 3 with both flights

   No auth required. Guests can browse results freely.

   Loaded as <script type="module"> on:
     pages/flight-search.html
   ===================================================== */

import { searchFlightsForLeg } from "/js/firebase/flights.js";
import {
  readOutboundFlight,
  stashOutboundFlight,
  goToFlightBooking
} from "/js/firebase/flight-bridge.js";

const PAGE_SIZE = 4;
const HOME_URL  = "/index.html";

/* ---------- DOM refs ---------- */

const els = {
  legEyebrow:   document.querySelector("[data-leg-eyebrow]"),
  routeTitle:   document.querySelector("[data-route-title]"),
  routeSub:     document.querySelector("[data-route-sub]"),
  backLink:     document.querySelector("[data-back-link]"),
  msg:          document.getElementById("flight-results-msg"),
  chips:        document.querySelector("[data-chips]"),
  results:      document.getElementById("flight-results"),
  discoverWrap: document.querySelector("[data-discover-wrap]"),
  discoverBtn:  document.querySelector("[data-discover-btn]")
};

/* ---------- Page state ---------- */

const state = {
  query:          null,    // FlightSearchQuery (dates as Date)
  isOneWay:       false,
  isReturnLeg:    false,
  outboundFlight: null,    // set only on the return-leg run
  list:           [],      // scoped flights for the active leg (cabin-filtered)
  filtered:       [],      // list after the active chip
  activeChip:     "best",
  visibleCount:   PAGE_SIZE
};

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  state.query = readQueryFromUrl();
  if (!state.query) {
    // Refresh on a stale URL, or direct nav with no query — bounce home.
    console.warn("[flight-search] no FlightSearchQuery in URL — redirecting home");
    window.location.replace(HOME_URL);
    return;
  }

  state.isOneWay    = !state.query.isRoundTrip;
  state.isReturnLeg = isReturnLegFlag() && !state.isOneWay;

  if (state.isReturnLeg) {
    state.outboundFlight = readOutboundFlight();
    if (!state.outboundFlight) {
      // Lost the outbound (tab cleared session storage, etc.).
      // Drop the leg flag and reload as outbound mode.
      const url = new URL(window.location.href);
      url.searchParams.delete("leg");
      window.location.replace(url.toString());
      return;
    }
  }

  renderHeader();
  bindChips();
  bindDiscover();
  showLoading();

  let raw;
  try {
    const leg = state.isReturnLeg ? "return" : "outbound";
    raw = await searchFlightsForLeg(state.query, { leg });
  } catch (err) {
    console.error("[flight-search] fetch failed:", err);
    showError("Couldn't load flights. Please try again.");
    return;
  }

  state.list = raw;
  applyChip();
  render();
});

/* ---------- URL parsing ---------- */

function readQueryFromUrl() {
  const p = new URLSearchParams(window.location.search);

  const originCode      = p.get("originCode");
  const destinationCode = p.get("destinationCode");
  const departureDate   = p.get("departureDate");
  const cabinClass      = p.get("cabinClass");

  // Hard requirements — without these the page can't run.
  if (!originCode || !destinationCode || !departureDate || !cabinClass) {
    return null;
  }

  // Defensive: origin and destination must differ.
  if (originCode === destinationCode) return null;

  const isRoundTrip = p.get("isRoundTrip") === "1";
  return {
    originCode:      originCode,
    originCity:      p.get("originCity")      || originCode,
    destinationCode: destinationCode,
    destinationCity: p.get("destinationCity") || destinationCode,
    departureDate:   new Date(departureDate),
    returnDate:      p.get("returnDate") ? new Date(p.get("returnDate")) : null,
    isRoundTrip:     isRoundTrip,
    cabinClass:      cabinClass,
    passengers:      1
  };
}

function isReturnLegFlag() {
  return new URLSearchParams(window.location.search).get("leg") === "return";
}

/* ---------- Header rendering ---------- */

function renderHeader() {
  const q = state.query;

  if (state.isReturnLeg) {
    if (els.legEyebrow) els.legEyebrow.textContent = "RETURN LEG";
    if (els.routeTitle) els.routeTitle.textContent = `Pick your return: ${q.destinationCity} → ${q.originCity}`;
    if (els.routeSub) {
      const ret = q.returnDate ? formatDate(q.returnDate) : "";
      els.routeSub.textContent = `${ret} · ${q.cabinClass}`;
    }
    // Back arrow returns to outbound results (browser back works
    // naturally because each leg is its own history entry).
    if (els.backLink) {
      els.backLink.textContent = "← Back to outbound results";
      els.backLink.addEventListener("click", function (e) {
        e.preventDefault();
        window.history.back();
      });
    }
    return;
  }

  if (state.isOneWay) {
    if (els.legEyebrow) els.legEyebrow.textContent = "ONE WAY";
  } else {
    if (els.legEyebrow) els.legEyebrow.textContent = "OUTBOUND LEG";
  }
  if (els.routeTitle) els.routeTitle.textContent = `${q.originCity} → ${q.destinationCity}`;
  if (els.routeSub) {
    els.routeSub.textContent = `${formatDate(q.departureDate)} · ${q.cabinClass}`;
  }
}

/* ---------- Filter chips ---------- */

function bindChips() {
  if (!els.chips) return;
  els.chips.querySelectorAll("[data-chip]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const next = btn.dataset.chip;
      if (next === state.activeChip) return;
      state.activeChip = next;
      state.visibleCount = PAGE_SIZE;
      setActiveChip(next);
      applyChip();
      render();
    });
  });
}

function setActiveChip(active) {
  if (!els.chips) return;
  els.chips.querySelectorAll("[data-chip]").forEach(function (btn) {
    const isActive = btn.dataset.chip === active;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    if (isActive) {
      btn.classList.add("green-btn");
      btn.classList.remove("btn-light");
    } else {
      btn.classList.remove("green-btn");
      btn.classList.add("btn-light");
    }
  });
}

function applyChip() {
  const list = state.list.slice();
  if (state.activeChip === "fastest") {
    list.sort(function (a, b) {
      return (a.durationMinutes || 0) - (b.durationMinutes || 0);
    });
  } else if (state.activeChip === "cheapest") {
    list.sort(function (a, b) {
      return (a.priceGbp || 0) - (b.priceGbp || 0);
    });
  } else {
    // Best Value (default) — score = priceGbp + durationMinutes*0.5 + stops*200
    list.sort(function (a, b) {
      const sa = (a.priceGbp || 0) + (a.durationMinutes || 0) * 0.5 + (a.stops || 0) * 200;
      const sb = (b.priceGbp || 0) + (b.durationMinutes || 0) * 0.5 + (b.stops || 0) * 200;
      return sa - sb;
    });
  }
  state.filtered = list;
}

/* ---------- Pagination ---------- */

function bindDiscover() {
  if (!els.discoverBtn) return;
  els.discoverBtn.addEventListener("click", function () {
    state.visibleCount += PAGE_SIZE;
    if (state.visibleCount > state.filtered.length) {
      state.visibleCount = state.filtered.length;
    }
    render();
  });
}

/* ---------- Rendering ---------- */

function showLoading() {
  if (!els.results) return;
  els.results.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Loading…</span>
      </div>
      <p class="mt-3 text-muted">Loading flights…</p>
    </div>
  `;
  hideDiscover();
}

function showError(message) {
  if (!els.results) return;
  els.results.innerHTML = `
    <div class="alert alert-danger" role="alert">${escapeHtml(message)}</div>
  `;
  hideDiscover();
}

function showEmpty() {
  if (!els.results) return;
  els.results.innerHTML = `
    <div class="text-center py-5">
      <p class="text-muted mb-1">No flights found. Try adjusting your search.</p>
      <a href="/index.html" class="text-green fw-semibold text-decoration-none">Back to search</a>
    </div>
  `;
  hideDiscover();
}

function render() {
  if (!state.filtered.length) {
    showEmpty();
    return;
  }

  const visible = state.filtered.slice(0, state.visibleCount);
  let html = "";
  for (let i = 0; i < visible.length; i++) {
    html += createFlightCard(visible[i], i);
  }
  els.results.innerHTML = html;
  wireCardClicks();

  if (state.visibleCount >= state.filtered.length) {
    hideDiscover();
  } else {
    showDiscover();
  }
}

function createFlightCard(f, indexInVisible) {
  // First card on each chip gets a small contextual badge.
  let badge = "";
  if (indexInVisible === 0) {
    if (state.activeChip === "best") {
      badge = `<span class="position-absolute top-0 start-0 ms-4 badge bg-dark-purple rounded-top-0 rounded-bottom-2" style="font-size:.6rem;letter-spacing:.1em;">BEST VALUE</span>`;
    } else if (state.activeChip === "cheapest") {
      badge = `<span class="position-absolute top-0 start-0 ms-4 badge bg-dark-green rounded-top-0 rounded-bottom-2" style="font-size:.6rem;letter-spacing:.1em;">CHEAPEST</span>`;
    } else if (state.activeChip === "fastest") {
      badge = `<span class="position-absolute top-0 start-0 ms-4 badge bg-dark-green rounded-top-0 rounded-bottom-2" style="font-size:.6rem;letter-spacing:.1em;">FASTEST</span>`;
    }
  }

  const stopsLabel    = buildStopsLabel(f);
  const stopsClass    = (f.stops === 0) ? "text-nav-green" : "";
  const stopsStyle    = (f.stops > 0)   ? "color:#D97706;" : "";
  const durationLabel = buildDurationLabel(f.durationMinutes);
  const priceLabel    = "$" + (Number(f.priceGbp) || 0).toLocaleString("en-US");

  return `
    <div class="bg-white border rounded-4 p-4 mb-3 position-relative" data-pick-id="${escapeAttr(f.id)}">
      ${badge}
      <div class="d-flex flex-column flex-md-row align-items-md-center gap-4${badge ? " pt-1" : ""}">
        <div class="flex-fill">
          <p class="text-secondary mb-2 fw-semibold" style="font-size:.875rem;">
            ${escapeHtml(f.airline || "—")} · ${escapeHtml(f.flightNumber || "")}
          </p>
          <div class="d-flex align-items-center gap-3">
            <div>
              <div class="fw-bolder lh-1 mb-1" style="font-size:1.375rem;">${escapeHtml(f.departureTime || "—")}</div>
              <div class="text-secondary fw-semibold" style="font-size:.72rem;">${escapeHtml(f.originCode || "")}</div>
            </div>
            <div class="flex-fill text-center">
              <div class="text-secondary fw-semibold mb-1" style="font-size:.75rem;">${durationLabel}</div>
              <!-- Dashed line with a small plane riding it -->
              <div class="position-relative d-flex align-items-center">
                <span class="rounded-circle bg-secondary-subtle flex-shrink-0" style="width:8px;height:8px;"></span>
                <span class="flex-fill border-top border-2" style="border-style:dashed!important;"></span>
                <span class="position-absolute top-50 start-50 translate-middle d-inline-flex align-items-center justify-content-center bg-white"
                      style="width:32px;height:22px;">
                  <i class="bi bi-airplane-fill text-green" style="font-size:1rem;transform:rotate(90deg);"></i>
                </span>
                <span class="flex-fill border-top border-2" style="border-style:dashed!important;"></span>
                <span class="rounded-circle bg-secondary-subtle flex-shrink-0" style="width:8px;height:8px;"></span>
              </div>
              <div class="fw-semibold mt-1 ${stopsClass}" style="font-size:.7rem;${stopsStyle}">${escapeHtml(stopsLabel)}</div>
            </div>
            <div class="text-end">
              <div class="fw-bolder lh-1 mb-1" style="font-size:1.375rem;">${escapeHtml(f.arrivalTime || "—")}</div>
              <div class="text-secondary fw-semibold" style="font-size:.72rem;">${escapeHtml(f.destinationCode || "")}</div>
            </div>
          </div>
        </div>
        <div class="text-md-end flex-shrink-0" style="min-width:140px;">
          <div class="text-uppercase fw-bold mb-1" style="font-size:.65rem;color:#a1a1aa;letter-spacing:.08em;">${escapeHtml(f.cabinClass)}</div>
          <div class="fw-bolder lh-1 mb-1" style="font-size:1.75rem;">${priceLabel}</div>
          <div class="text-secondary mb-3" style="font-size:.65rem;">per person</div>
          <button type="button" class="btn green-btn w-100" data-pick-btn>Select</button>
        </div>
      </div>
    </div>
  `;
}

function wireCardClicks() {
  if (!els.results) return;
  els.results.querySelectorAll("[data-pick-btn]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const card = btn.closest("[data-pick-id]");
      if (!card) return;
      const id = card.dataset.pickId;
      const picked = state.filtered.find(function (f) { return f.id === id; });
      if (!picked) return;
      onPickFlight(picked);
    });
  });
}

/* ---------- Click branching (the heart of Stage 2) ---------- */

function onPickFlight(picked) {
  // Scenario A — one way. Straight to Stage 3.
  if (state.isOneWay) {
    goToFlightBooking({
      flight:       picked,
      returnFlight: null,
      query:        state.query
    });
    return;
  }

  // Scenario B, first leg — stash outbound, reload Stage 2 for return.
  if (!state.isReturnLeg) {
    stashOutboundFlight(picked);
    const url = new URL(window.location.href);
    url.searchParams.set("leg", "return");
    window.location.href = url.toString();
    return;
  }

  // Scenario B, second leg — both flights ready, advance to Stage 3.
  goToFlightBooking({
    flight:       state.outboundFlight,
    returnFlight: picked,
    query:        state.query
  });
}

/* ---------- Helpers ---------- */

function showDiscover() {
  if (els.discoverWrap) els.discoverWrap.classList.remove("d-none");
}

function hideDiscover() {
  if (els.discoverWrap) els.discoverWrap.classList.add("d-none");
}

function buildStopsLabel(f) {
  if (!f.stops || f.stops === 0) return "Direct";
  if (f.stops === 1) return `1 stop · ${f.stopCity || "—"}`;
  return `${f.stops} stops · ${f.stopCity || "—"}`;
}

function buildDurationLabel(minutes) {
  if (!minutes || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
