const queryEl = document.getElementById("query");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const modal = document.getElementById("modal");
const closeModalBtn = document.getElementById("closeModal");
const detailsEl = document.getElementById("details");

searchBtn.addEventListener("click", searchShows);
queryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchShows();
});

closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

async function searchShows() {
  const q = queryEl.value.trim();
  if (!q) {
    statusEl.textContent = "Type a show title first (e.g., Batman).";
    resultsEl.innerHTML = "";
    return;
  }

  statusEl.textContent = "Loading results...";
  resultsEl.innerHTML = "";

  try {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!data.length) {
      statusEl.textContent = "No results found. Try another title.";
      return;
    }

    statusEl.textContent = `Results for: "${q}"`;
    renderCards(data);
  } catch (err) {
    statusEl.textContent = "Error fetching data. Check your internet connection.";
  }
}

function renderCards(items) {
  resultsEl.innerHTML = items.map(item => {
    const show = item.show;
    const poster = show.image?.medium || "";
    const rating = show.rating?.average ?? "N/A";
    const year = show.premiered ? show.premiered.slice(0, 4) : "N/A";

    return `
      <article class="card" data-id="${show.id}">
        ${poster ? `<img class="poster" src="${poster}" alt="${show.name}">` : `<div class="poster"></div>`}
        <div class="card-body">
          <div class="card-title">${show.name}</div>
          <div class="card-meta">${year} • Rating: ${rating}</div>
        </div>
      </article>
    `;
  }).join("");

  // add click listeners
  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => openDetails(card.dataset.id));
  });
}

async function openDetails(showId) {
  modal.classList.remove("hidden");
  detailsEl.innerHTML = `<p class="status">Loading details...</p>`;

  try {
    const res = await fetch(`https://api.tvmaze.com/shows/${showId}`);
    const show = await res.json();

    const poster = show.image?.original || show.image?.medium || "";
    const rating = show.rating?.average ?? "N/A";
    const genres = show.genres?.length ? show.genres.join(", ") : "N/A";
    const premiered = show.premiered || "N/A";
    const ended = show.ended || "N/A";
    const summary = (show.summary || "No summary available.").replace(/<[^>]*>/g, ""); // remove HTML tags

    detailsEl.innerHTML = `
      <div class="details-wrap">
        ${poster ? `<img class="details-poster" src="${poster}" alt="${show.name}">` : `<div></div>`}
        <div class="details">
          <h2>${show.name}</h2>
          <div>
            <span class="badge">⭐ ${rating}</span>
            <span class="badge">Genres: ${genres}</span>
          </div>
          <p><b>Premiered:</b> ${premiered}</p>
          <p><b>Ended:</b> ${ended}</p>
          <p><b>Language:</b> ${show.language || "N/A"}</p>
          <p><b>Official site:</b> ${show.officialSite ? `<a href="${show.officialSite}" target="_blank">Open</a>` : "N/A"}</p>
          <p><b>Summary:</b> ${summary}</p>
        </div>
      </div>
    `;
  } catch {
    detailsEl.innerHTML = `<p>Failed to load details.</p>`;
  }
}
