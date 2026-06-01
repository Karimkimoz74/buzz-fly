/* =====================================================
   Buzz Fly — hotel-results.js (page script)
   STAGE 2 of the hotel flow:

   PIPELINE (in this exact order):
     1. Fetch every hotel doc (one getDocs call, cached in hotels.js)
     2. Filter by destination (substring match on location, lowercased)
     3. Scope each hotel to chosen roomType — adds .roomType + .pricePerNight
        If no roomType chosen, default to the hotel's cheapest tier.
     4. Apply the active filter chip:
          default  → identity
          price    → sort ascending by pricePerNight
          rating   → sort descending by rating
          boutique → filter rating >= 4.7
     5. Paginate client-side: show 4 initially, +4 per "Discover more" click.

   The search query is read from the URL (set by home.js):
     ?destination=...&checkIn=...&checkOut=...&guests=...&roomType=...

   Clicking a card navigates to hotel-details.html?id=...
   carrying the same query string forward.

   Loaded as <script type="module"> on:
     pages/hotel-results.html
   ===================================================== */

import {
  getAllHotels,
  withRoomType,
  cheapestRoomTypeOf
} from "/js/firebase/hotels.js";

const PAGE_SIZE = 4;
const BOUTIQUE_RATING_MIN = 4.7;

const container       = document.getElementById("cards-container");
const heroTitleEl     = document.getElementById("hero-title");
const heroSubtitleEl  = document.getElementById("hero-subtitle");
const breadcrumbLocEl = document.getElementById("breadcrumb-loc");
const chipsEl         = document.getElementById("filter-chips");
const discoverWrapEl  = document.getElementById("discover-more-wrap");
const discoverBtnEl   = document.getElementById("discover-more-btn");

// Page-level state
const state = {
  query:        null,    // { destination, checkIn, checkOut, guests, roomType }
  scoped:       [],      // hotels after destination + roomType scoping
  filtered:     [],      // hotels after the active chip
  activeFilter: "default",
  visibleCount: PAGE_SIZE
};

document.addEventListener("DOMContentLoaded", async () => {
  state.query = readQuery();
  applyQueryToHero(state.query);
  wireFilterChips();
  wireDiscoverMore();

  showLoading();
  try {
    const all = await getAllHotels();
    state.scoped = pipelineDestinationAndRoom(all, state.query);
    applyActiveFilter();
    render();
  } catch (err) {
    showError(err);
  }
});

/* =====================================================
   1) Read the search query out of the URL
   ===================================================== */

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    destination: (params.get("destination") || "").trim(),
    checkIn:     params.get("checkIn")     || "",
    checkOut:    params.get("checkOut")    || "",
    guests:      parseInt(params.get("guests"), 10) || 0,
    roomType:    params.get("roomType")    || ""
  };
}

function applyQueryToHero(query) {
  if (query.destination) {
    if (breadcrumbLocEl) {
      breadcrumbLocEl.textContent = query.destination;
    }
    if (heroTitleEl) {
      heroTitleEl.textContent = `Stays in ${query.destination}`;
    }
  }
}

/* =====================================================
   2 + 3) Destination filter + room-type scoping
   ===================================================== */

function pipelineDestinationAndRoom(all, query) {
  // Step 2: destination match
  let list = all;
  if (query.destination) {
    const needle = query.destination.toLowerCase();
    list = list.filter(h => {
      if (!h.location) return false;
      return h.location.toLowerCase().includes(needle);
    });
  }

  // Step 3: room-type scoping
  if (query.roomType) {
    const scoped = [];
    for (const h of list) {
      const s = withRoomType(h, query.roomType);
      if (s) {
        scoped.push(s); // hotel offers this type
      }
    }
    list = scoped;
  } else {
    // No type chosen — default to each hotel's cheapest tier
    const scoped = [];
    for (const h of list) {
      const cheapest = cheapestRoomTypeOf(h);
      if (cheapest) {
        scoped.push(withRoomType(h, cheapest));
      }
    }
    list = scoped;
  }

  return list;
}

/* =====================================================
   4) Filter chips (one active at a time)
   ===================================================== */

function wireFilterChips() {
  if (!chipsEl) return;
  chipsEl.querySelectorAll("button[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.filter;
      if (state.activeFilter === f) return;
      state.activeFilter = f;
      state.visibleCount = PAGE_SIZE;   // reset pagination on filter change
      setActiveChip(f);
      applyActiveFilter();
      render();
    });
  });
}

function setActiveChip(activeFilter) {
  chipsEl.querySelectorAll("button[data-filter]").forEach((btn) => {
    const isActive = btn.dataset.filter === activeFilter;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    if (isActive) {
      btn.classList.add("bg-light-green", "text-green");
      btn.classList.remove("bg-light");
    } else {
      btn.classList.remove("bg-light-green", "text-green");
      btn.classList.add("bg-light");
    }
  });
}

function applyActiveFilter() {
  const list = state.scoped.slice();
  if (state.activeFilter === "price") {
    list.sort((a, b) => (a.pricePerNight || 0) - (b.pricePerNight || 0));
  } else if (state.activeFilter === "rating") {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (state.activeFilter === "boutique") {
    state.filtered = list.filter(h => (h.rating || 0) >= BOUTIQUE_RATING_MIN);
    return;
  }
  state.filtered = list;
}

/* =====================================================
   5) Pagination — "Discover more"
   ===================================================== */

function wireDiscoverMore() {
  if (!discoverBtnEl) return;
  discoverBtnEl.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    if (state.visibleCount > state.filtered.length) {
      state.visibleCount = state.filtered.length;
    }
    render();
  });
}

/* =====================================================
   Render
   ===================================================== */

function render() {
  if (!state.filtered.length) {
    showEmpty();
    hideDiscoverMore();
    updateSubtitle(0);
    return;
  }

  const visible = state.filtered.slice(0, state.visibleCount);
  let html = "";
  for (const hotel of visible) {
    html += createHotelCard(hotel);
  }
  container.innerHTML = html;

  updateSubtitle(state.filtered.length);

  if (state.visibleCount >= state.filtered.length) {
    hideDiscoverMore();
  } else {
    showDiscoverMore();
  }
}

function updateSubtitle(count) {
  if (!heroSubtitleEl) return;
  if (count === 0) {
    heroSubtitleEl.textContent = "No properties match your search.";
    return;
  }
  let propertyWord = "properties";
  if (count === 1) propertyWord = "property";
  heroSubtitleEl.textContent =
    `Discover ${count} curated ${propertyWord} handpicked for your next escape.`;
}

function showLoading() {
  container.innerHTML = `
    <div class="col-12 text-center py-5">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Loading…</span>
      </div>
      <p class="mt-3 text-muted">Loading hotels…</p>
    </div>
  `;
  hideDiscoverMore();
}

function showEmpty() {
  let extra = "";
  if (state.query.roomType) {
    extra = ` for a ${state.query.roomType}`;
  }
  container.innerHTML = `
    <div class="col-12 text-center py-5">
      <p class="text-muted mb-2">No hotels found${extra} matching your search.</p>
      <p class="small text-muted">Try a different destination or remove the room-type filter.</p>
    </div>
  `;
}

function showError(err) {
  let message = "Unknown error";
  if (err && err.message) message = err.message;
  container.innerHTML = `
    <div class="col-12">
      <div class="alert alert-danger" role="alert">
        Couldn't load hotels — ${escapeHtml(message)}
      </div>
    </div>
  `;
  hideDiscoverMore();
}

function showDiscoverMore() {
  if (discoverWrapEl) discoverWrapEl.classList.remove("d-none");
}

function hideDiscoverMore() {
  if (discoverWrapEl) discoverWrapEl.classList.add("d-none");
}

/* =====================================================
   Card markup
   ===================================================== */

function createHotelCard(hotel) {
  const priceLabel  = buildPriceLabel(hotel);
  const ratingLabel = buildRatingLabel(hotel);
  const tierLabel   = buildTierLabel(hotel);
  const safeTitle   = escapeHtml(hotel.title || "Untitled");
  const safeLoc     = escapeHtml(hotel.location || "");
  const safeImg     = escapeHtml(hotel.imageUrl || "");
  const detailsHref = buildDetailsHref(hotel);

  return `
    <div class="col-md-6 col-lg-4">
      <article class="card h-100 border-0 rounded-4 overflow-hidden shadow-sm">
        <div class="position-relative rounded-4 overflow-hidden" style="height: 255px;">
          <img src="${safeImg}" class="w-100 h-100 object-fit-cover" alt="${safeTitle}">
        </div>
        <div class="card-body p-4 d-flex flex-column">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
            <h2 class="card-title m-0 fs-3 fw-bold">${safeTitle}</h2>
            ${ratingLabel}
          </div>
          ${tierLabel}
          <p class="d-flex align-items-center gap-1 text-muted small mb-3">
            <img src="../assets/icons/location.svg" style="width: 15px; height: 15px;">
            ${safeLoc}
          </p>
          <div class="d-flex justify-content-between align-items-center mt-auto">
            <div class="d-flex align-items-baseline gap-1">
              ${priceLabel}
            </div>
            <a class="btn green-btn px-4" href="${detailsHref}">View Deal</a>
          </div>
        </div>
      </article>
    </div>
  `;
}

function buildPriceLabel(hotel) {
  if (hotel.pricePerNight === undefined || hotel.pricePerNight === null) {
    return `<span class="text-muted small">Price on request</span>`;
  }
  return `
    <strong class="fs-3">$${hotel.pricePerNight}</strong>
    <span class="text-muted small">/night</span>
  `;
}

function buildRatingLabel(hotel) {
  if (hotel.rating === undefined || hotel.rating === null) {
    return "";
  }
  return `
    <span class="rating-badge d-inline-flex align-items-center gap-1 px-2 py-1 rounded fw-bold small text-nowrap bg-light-green text-green">
      <img src="../assets/icons/star.svg" class="icon-sm" alt="">${hotel.rating}
    </span>
  `;
}

/* Show which tier this row's price refers to (Standard / Suite / etc).
   Helps users see why one card is cheaper than another. */
function buildTierLabel(hotel) {
  if (!hotel.roomType) return "";
  return `<p class="small text-muted mb-1">${escapeHtml(hotel.roomType)}</p>`;
}

/* Build the View Deal href — carries the entire search query forward
   so the booking detail page knows the user's intent. */
function buildDetailsHref(hotel) {
  const params = new URLSearchParams();
  params.set("id", hotel.id);
  if (hotel.roomType)             params.set("roomType", hotel.roomType);
  if (state.query.destination)    params.set("destination", state.query.destination);
  if (state.query.checkIn)        params.set("checkIn", state.query.checkIn);
  if (state.query.checkOut)       params.set("checkOut", state.query.checkOut);
  if (state.query.guests)         params.set("guests", String(state.query.guests));
  return `hotel-details.html?${params.toString()}`;
}


/* =====================================================
   Helpers
   ===================================================== */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
