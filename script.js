// ===================== THEME TOGGLE =====================
const themeToggleBtn = document.getElementById("themeToggle");
const THEME_KEY = "showfinder_theme_v2";

function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  if (themeToggleBtn) themeToggleBtn.textContent = theme === "light" ? "☀️" : "🌙";
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || "dark";
  applyTheme(theme);
})();

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light");
    const next = isLight ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

// ===================== TOAST =====================
const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 1800);
}

// ===================== TABS =====================
const tabButtons = document.querySelectorAll(".tab");
const tabResults = document.getElementById("tab-results");
const tabFavorites = document.getElementById("tab-favorites");
const tabAbout = document.getElementById("tab-about");

function openTab(name) {
  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  tabResults.classList.toggle("hidden", name !== "results");
  tabFavorites.classList.toggle("hidden", name !== "favorites");
  tabAbout.classList.toggle("hidden", name !== "about");

  if (name === "favorites") renderFavorites();
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => openTab(btn.dataset.tab));
});

// ===================== ELEMENTS =====================
const queryEl = document.getElementById("query");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const favStatusEl = document.getElementById("favStatus");
const favoritesGridEl = document.getElementById("favoritesGrid");

const genreFilterEl = document.getElementById("genreFilter");
const sortByEl = document.getElementById("sortBy");
const minRatingEl = document.getElementById("minRating");
const minRatingValueEl = document.getElementById("minRatingValue");
const refreshTrendingBtn = document.getElementById("refreshTrendingBtn");

const loadMoreBtn = document.getElementById("loadMoreBtn");

const modal = document.getElementById("modal");
const closeModalBtn = document.getElementById("closeModal");
const detailsEl = document.getElementById("details");

// ===================== STATE =====================
let lastQuery = "";
let allResults = [];   // array of show objects
let viewResults = [];  // filtered + sorted
let visibleCount = 12;

// ===================== FAVORITES =====================
const LS_FAV_KEY = "showfinder_favorites_v2";

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(LS_FAV_KEY)) || []; }
  catch { return []; }
}

function setFavorites(favs) {
  localStorage.setItem(LS_FAV_KEY, JSON.stringify(favs));
}

function isFav(id) {
  return getFavorites().some(x => x.id === Number(id));
}

function toggleFav(show) {
  const favs = getFavorites();
  const idx = favs.findIndex(x => x.id === show.id);

  if (idx >= 0) {
    favs.splice(idx, 1);
    setFavorites(favs);
    showToast("Removed from favorites ❌");
  } else {
    favs.push({
      id: show.id,
      name: show.name,
      image: show.image?.medium || "",
      rating: show.rating?.average ?? null,
      premiered: show.premiered || null
    });
    setFavorites(favs);
    showToast("Added to favorites ⭐");
  }
}

// ===================== EVENTS =====================
searchBtn.addEventListener("click", () => searchShows());
queryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchShows();
});

genreFilterEl.addEventListener("change", applyFiltersAndRender);
sortByEl.addEventListener("change", applyFiltersAndRender);

minRatingEl.addEventListener("input", () => {
  minRatingValueEl.textContent = minRatingEl.value;
  applyFiltersAndRender();
});

refreshTrendingBtn.addEventListener("click", () => loadTrending(true));

loadMoreBtn.addEventListener("click", () => {
  visibleCount += 12;
  renderGrid();
});

// Modal close
closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

// ===================== SKELETONS =====================
function renderSkeletons(targetEl, count = 12) {
  targetEl.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton">
      <div class="sk-poster"></div>
      <div class="sk-lines">
        <div class="sk-line"></div>
        <div class="sk-line short"></div>
      </div>
    </div>
  `).join("");
}

// ===================== API HELPERS =====================
function yearOf(show) {
  return show.premiered ? Number(show.premiered.slice(0, 4)) : -1;
}

function ratingOf(show) {
  return show.rating?.average ?? -1;
}

function buildGenreOptions(shows) {
  const genres = new Set();
  shows.forEach(s => (s.genres || []).forEach(g => genres.add(g)));

  const current = genreFilterEl.value;
  const options = ['<option value="">All Genres</option>']
    .concat([...genres].sort().map(g => `<option value="${g}">${g}</option>`))
    .join("");

  genreFilterEl.innerHTML = options;

  if ([...genreFilterEl.options].some(o => o.value === current)) {
    genreFilterEl.value = current;
  } else {
    genreFilterEl.value = "";
  }
}

function sortShows(shows, sortBy) {
  const copy = [...shows];
  switch (sortBy) {
    case "rating_desc": return copy.sort((a, b) => ratingOf(b) - ratingOf(a));
    case "rating_asc":  return copy.sort((a, b) => ratingOf(a) - ratingOf(b));
    case "year_desc":   return copy.sort((a, b) => yearOf(b) - yearOf(a));
    case "year_asc":    return copy.sort((a, b) => yearOf(a) - yearOf(b));
    case "name_asc":    return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:            return copy; // relevance
  }
}

// ===================== TRENDING (NO SEARCH REQUIRED) =====================
// TVMaze doesn't have "trending" endpoint, so we simulate "Trending" by:
// fetching a page of shows and sorting by rating (high to low).
async function loadTrending(showToastMsg = false) {
  openTab("results");
  lastQuery = "Trending";
  visibleCount = 12;

  statusEl.textContent = "Loading trending shows...";
  loadMoreBtn.classList.add("hidden");
  renderSkeletons(resultsEl, 12);

  try {
    // Choose a page. Page 1 usually has many popular classics; you can change to 0/2/3.
    const res = await fetch("https://api.tvmaze.com/shows?page=1");
    const data = await res.json();

    // Keep only shows with images (nicer UI), then sort by rating
    const sorted = data
      .filter(s => s.image?.medium)
      .sort((a, b) => ratingOf(b) - ratingOf(a));

    allResults = sorted.slice(0, 60); // keep enough for load more
    buildGenreOptions(allResults);

    // reset controls
    sortByEl.value = "rating_desc";
    minRatingEl.value = "0";
    minRatingValueEl.textContent = "0";
    genreFilterEl.value = "";

    applyFiltersAndRender();

    if (showToastMsg) showToast("Trending refreshed 🔥");
  } catch {
    statusEl.textContent = "Failed to load trending. Check your internet.";
    resultsEl.innerHTML = "";
  }
}

// ===================== SEARCH =====================
async function searchShows() {
  const q = queryEl.value.trim();
  if (!q) {
    statusEl.textContent = "Type a show title first (e.g., Batman).";
    resultsEl.innerHTML = "";
    loadMoreBtn.classList.add("hidden");
    return;
  }

  lastQuery = q;
  visibleCount = 12;

  statusEl.textContent = "Searching...";
  loadMoreBtn.classList.add("hidden");
  renderSkeletons(resultsEl, 12);

  try {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!data.length) {
      statusEl.textContent = `No results found for "${q}".`;
      resultsEl.innerHTML = "";
      return;
    }

    allResults = data.map(x => x.show);
    buildGenreOptions(allResults);

    // keep previous sort/min rating but reset genre if not present
    applyFiltersAndRender();
  } catch {
    statusEl.textContent = "Error fetching data. Check your internet connection.";
    resultsEl.innerHTML = "";
  }
}

// ===================== FILTER + RENDER =====================
function applyFiltersAndRender() {
  const genre = genreFilterEl.value;
  const minRating = Number(minRatingEl.value);
  const sortBy = sortByEl.value;

  viewResults = allResults
    .filter(s => !genre || (s.genres || []).includes(genre))
    .filter(s => (s.rating?.average ?? 0) >= minRating);

  viewResults = sortShows(viewResults, sortBy);

  visibleCount = 12;
  renderGrid();
}

function renderGrid() {
  const slice = viewResults.slice(0, visibleCount);

  resultsEl.innerHTML = slice.map(show => {
    const poster = show.image?.medium || "";
    const rating = show.rating?.average ?? "N/A";
    const year = show.premiered ? show.premiered.slice(0, 4) : "N/A";
    const favMark = isFav(show.id) ? `<span class="fav-badge">★</span>` : "";

    return `
      <article class="card" data-id="${show.id}">
        ${poster ? `<img class="poster" src="${poster}" alt="${show.name}">` : `<div class="poster"></div>`}
        <div class="card-body">
          <div class="card-title">${show.name}${favMark}</div>
          <div class="card-meta">${year} • Rating: ${rating}</div>

          <div class="card-actions">
            <button data-action="details" data-id="${show.id}">Details</button>
            <button data-action="fav" data-id="${show.id}">${isFav(show.id) ? "Unfavorite" : "Favorite"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  // status + load more
  const total = viewResults.length;
  statusEl.textContent = lastQuery === "Trending"
    ? `Trending picks • Showing ${slice.length} of ${total}`
    : `Results for "${lastQuery}" • Showing ${slice.length} of ${total}`;

  loadMoreBtn.classList.toggle("hidden", !(total > visibleCount));

  // button events
  resultsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "details") openDetails(id);
      if (action === "fav") {
        const show = allResults.find(s => s.id === Number(id)) || viewResults.find(s => s.id === Number(id));
        toggleFav(show);
        // re-render to update the badge + button label
        renderGrid();
      }
    });
  });

  // add tilt effect to cards
  enableCardTilt();
}

// ===================== CARD TILT =====================
function enableCardTilt() {
  const cards = resultsEl.querySelectorAll(".card");

  cards.forEach(card => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // rotate range
      const rx = ((y / rect.height) - 0.5) * -8;
      const ry = ((x / rect.width) - 0.5) * 10;

      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });

    card.addEventListener("click", () => {
      const id = card.dataset.id;
      openDetails(id);
    });
  });
}

// ===================== DETAILS MODAL =====================
async function openDetails(showId) {
  modal.classList.remove("hidden");
  detailsEl.innerHTML = `
  <div style="padding:20px; text-align:center;">
    <div class="loader"></div>
    <p class="status" style="margin-top:12px;">Loading details...</p>
  </div>
`;


  try {
    const res = await fetch(`https://api.tvmaze.com/shows/${showId}`);
    const show = await res.json();

    const poster = show.image?.original || show.image?.medium || "";
    const rating = show.rating?.average ?? "N/A";
    const genres = show.genres?.length ? show.genres.join(", ") : "N/A";
    const premiered = show.premiered || "N/A";
    const ended = show.ended || "N/A";
    const schedule = show.schedule?.days?.length ? `${show.schedule.days.join(", ")} • ${show.schedule.time || "Time N/A"}` : "N/A";
    const summary = (show.summary || "No summary available.").replace(/<[^>]*>/g, "");

    detailsEl.innerHTML = `
      <div class="details-wrap">
        ${poster ? `<img class="details-poster" src="${poster}" alt="${show.name}">` : `<div></div>`}
        <div class="details">
          <h2>${show.name}</h2>
          <div>
            <span class="badge">⭐ ${rating}</span>
            <span class="badge">Genres: ${genres}</span>
            <span class="badge">Status: ${show.status || "N/A"}</span>
          </div>
          <p><b>Premiered:</b> ${premiered}</p>
          <p><b>Ended:</b> ${ended}</p>
          <p><b>Schedule:</b> ${schedule}</p>
          <p><b>Language:</b> ${show.language || "N/A"}</p>
          <p><b>Network:</b> ${show.network?.name || show.webChannel?.name || "N/A"}</p>
          <p><b>Official site:</b> ${show.officialSite ? `<a href="${show.officialSite}" target="_blank">Open</a>` : "N/A"}</p>
          <p><b>Summary:</b> ${summary}</p>
        </div>
      </div>
    `;
  } catch {
    detailsEl.innerHTML = `<p>Failed to load details.</p>`;
  }
}

// ===================== FAVORITES TAB =====================
function renderFavorites() {
  const favs = getFavorites();

  if (!favs.length) {
    favStatusEl.textContent = "No favorites yet. Go to Results and click Favorite ⭐";
    favoritesGridEl.innerHTML = "";
    return;
  }

  favStatusEl.textContent = `Saved favorites: ${favs.length}`;

  favoritesGridEl.innerHTML = favs.map(f => {
    const rating = f.rating ?? "N/A";
    const year = f.premiered ? f.premiered.slice(0, 4) : "N/A";

    return `
      <article class="card" data-id="${f.id}">
        ${f.image ? `<img class="poster" src="${f.image}" alt="${f.name}">` : `<div class="poster"></div>`}
        <div class="card-body">
          <div class="card-title">${f.name}<span class="fav-badge">★</span></div>
          <div class="card-meta">${year} • Rating: ${rating}</div>

          <div class="card-actions">
            <button data-action="details" data-id="${f.id}">Details</button>
            <button data-action="remove" data-id="${f.id}">Remove</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  favoritesGridEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "details") openDetails(id);
      if (action === "remove") {
        const favs = getFavorites().filter(x => x.id !== Number(id));
        setFavorites(favs);
        showToast("Removed from favorites ❌");
        renderFavorites();
      }
    });
  });

  favoritesGridEl.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => openDetails(card.dataset.id));
  });
}

// ===================== INIT =====================
minRatingValueEl.textContent = minRatingEl.value;

// Load trending automatically on page load
loadTrending(false);
