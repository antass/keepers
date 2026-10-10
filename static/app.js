/* Keepers — your favorite places, on a map. Data lives in data/places.json via the local server. */
(() => {
  "use strict";

  // ---------- Categories ----------
  const CATS = {
    restaurant: { label: "Restaurant", color: "#D0573F", icon: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5v4h3M17 3v18" },
    cafe:       { label: "Café",       color: "#8B6142", icon: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3" },
    bar:        { label: "Bar",        color: "#86507F", icon: "M4 4h16l-8 9zM12 13v7M8 20h8" },
    bakery:     { label: "Bakery",     color: "#D9963A", icon: "M4 15c0-5 4-8 8-8s8 3 8 8v3H4zM9 10v5M15 10v5M12 9v6" },
    museum:     { label: "Museum",     color: "#2E8783", icon: "M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" },
    library:    { label: "Library",    color: "#4C70A0", icon: "M4 4h4v16H4zM9 4h4v16H9zM14.5 5.2l3.8-1 3.5 14.6-3.8 1z" },
    bookstore:  { label: "Bookstore",  color: "#7F8A2C", icon: "M3 5c3-1 6 0 9 2 3-2 6-3 9-2v14c-3-1-6 0-9 2-3-2-6-3-9-2zM12 7v14" },
    park:       { label: "Park",       color: "#4A9A4C", icon: "M12 3l6 8h-4l5 6H5l5-6H6zM12 17v4" },
    shop:       { label: "Shop",       color: "#C76A8A", icon: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" },
    venue:      { label: "Venue",      color: "#A05238", icon: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
    other:      { label: "Other",      color: "#7D857A", icon: "M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" },
  };
  // OpenStreetMap tag value → our category (used when you pick a search result)
  const OSM_CAT = {
    restaurant: "restaurant", fast_food: "restaurant", food_court: "restaurant", ice_cream: "cafe",
    cafe: "cafe", coffee: "cafe", tea: "cafe",
    bar: "bar", pub: "bar", biergarten: "bar", nightclub: "bar", wine: "bar", brewery: "bar",
    bakery: "bakery", pastry: "bakery", confectionery: "bakery",
    museum: "museum", gallery: "museum", arts_centre: "museum", artwork: "museum", attraction: "museum",
    library: "library", books: "bookstore",
    park: "park", garden: "park", nature_reserve: "park", playground: "park", beach: "park",
    theatre: "venue", cinema: "venue", music_venue: "venue", concert_hall: "venue", stadium: "venue",
    clothes: "shop", gift: "shop", deli: "shop", greengrocer: "shop", marketplace: "shop", supermarket: "shop", toys: "shop", antiques: "shop", second_hand: "shop",
  };
  const iconSvg = (cat) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${(CATS[cat] || CATS.other).icon}"/></svg>`;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z"/></svg>';

  // ---------- State ----------
  let places = [];
  const f = { q: "", cats: new Set(), tags: new Set(), minRating: 0, returnOnly: false, inView: false, sort: "rating" };
  let selectedId = null;
  let draft = null;        // place being added/edited
  let view = "list";
  const markers = new Map();
  let draftMarker = null;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const lastVisit = (p) => (p.visits || []).slice().sort().pop() || "";
  function ago(s) {
    if (!s) return "";
    const days = Math.round((new Date(today() + "T12:00:00") - new Date(s + "T12:00:00")) / 864e5);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    if (days < 730) return `${Math.round(days / 30)} months ago`;
    return `${Math.round(days / 365)} years ago`;
  }
  const stars = (r) => `<span class="stars" aria-label="${r || 0} out of 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= r ? "on" : ""}">${STAR}</span>`).join("")}</span>`;
  const price = (n) => n ? "$".repeat(n) : "";

  // ---------- Persistence ----------
  let saveTimer = null;
  function persist() {
    $("#saveState").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const r = await fetch("/api/places", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, places }) });
        if (!r.ok) throw new Error();
        $("#saveState").textContent = "Saved";
        setTimeout(() => { if ($("#saveState").textContent === "Saved") $("#saveState").textContent = ""; }, 1800);
      } catch {
        $("#saveState").textContent = "Not saved — is Keepers running?";
      }
    }, 250);
  }

  // ---------- Map ----------
  const map = L.map("map", { zoomControl: false, attributionControl: true }).setView([41.8881, -87.6298], 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // OpenStreetMap tiles; dark mode tints them via CSS (.leaflet-tile-pane filter)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const pinIcon = (cat, cls = "") => L.divIcon({
    className: "", iconSize: [32, 32], iconAnchor: [16, 34], tooltipAnchor: [0, -30],
    html: `<div class="pin ${cls}" style="--c:${(CATS[cat] || CATS.other).color}">${iconSvg(cat)}</div>`,
  });

  function syncMarkers(visible) {
    const ids = new Set(visible.map((p) => p.id));
    for (const [id, m] of markers) if (!places.some((p) => p.id === id)) { map.removeLayer(m); markers.delete(id); }
    for (const p of places) {
      let m = markers.get(p.id);
      const cls = [p.id === selectedId ? "active" : "", ids.has(p.id) ? "" : "dim"].join(" ");
      if (!m) {
        m = L.marker([p.lat, p.lon], { icon: pinIcon(p.category, cls), riseOnHover: true }).addTo(map);
        m.bindTooltip("", { className: "pin-tip", direction: "top" });
        m.on("click", () => { if (view === "edit") return; select(m._pid, false); });
        markers.set(p.id, m);
      } else {
        m.setLatLng([p.lat, p.lon]);
        m.setIcon(pinIcon(p.category, cls));
      }
      m._pid = p.id;
      m.setTooltipContent(esc(p.name));
      m.setZIndexOffset(p.id === selectedId ? 1000 : ids.has(p.id) ? 100 : 0);
      if (draft && draft.id === p.id) m.setOpacity(0); else m.setOpacity(1);
    }
  }

  const panelPad = () => window.innerWidth > 760 ? document.getElementById("panel").offsetWidth + 32 : 0;
  function focusOn(lat, lon, zoom) {
    const z = zoom ?? map.getZoom();
    const pt = map.project([lat, lon], z).subtract([panelPad() / 2, 0]);
    map.setView(map.unproject(pt, z), z, { animate: true });
  }
  function fitAll() {
    const pts = filtered().map((p) => [p.lat, p.lon]);
    if (!pts.length) return;
    if (pts.length === 1) focusOn(pts[0][0], pts[0][1], 15);
    else map.fitBounds(pts, { paddingTopLeft: [panelPad() + 40, 80], paddingBottomRight: [50, 50], maxZoom: 15 });
  }

  // ---------- Filtering ----------
  function filtered() {
    const q = f.q.trim().toLowerCase();
    const bounds = f.inView ? map.getBounds() : null;
    let list = places.filter((p) => {
      if (f.cats.size && !f.cats.has(p.category)) return false;
      if (f.tags.size && ![...f.tags].every((t) => (p.tags || []).includes(t))) return false;
      if (f.minRating && (p.rating || 0) < f.minRating) return false;
      if (f.returnOnly && !p.wantToReturn) return false;
      if (bounds && !bounds.contains([p.lat, p.lon])) return false;
      if (q) {
        const hay = [p.name, p.address, p.city, p.notes, (p.tags || []).join(" "), CATS[p.category]?.label].join(" ").toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const c = map.getCenter();
    const dist = (p) => (p.lat - c.lat) ** 2 + ((p.lon - c.lng) * Math.cos(c.lat * Math.PI / 180)) ** 2;
    const sorters = {
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || lastVisit(b).localeCompare(lastVisit(a)),
      recent: (a, b) => lastVisit(b).localeCompare(lastVisit(a)) || (b.created || 0) - (a.created || 0),
      visits: (a, b) => (b.visits?.length || 0) - (a.visits?.length || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      near: (a, b) => dist(a) - dist(b),
    };
    return list.sort(sorters[f.sort]);
  }

  // ---------- Render: list ----------
  function renderStats() {
    const n = places.length;
    if (!n) { $("#stats").textContent = "Your favorite places, on one map."; return; }
    const cities = new Set(places.map((p) => p.city).filter(Boolean)).size;
    const rated = places.filter((p) => p.rating);
    const avg = rated.length ? (rated.reduce((s, p) => s + p.rating, 0) / rated.length).toFixed(1) : "–";
    const visits = places.reduce((s, p) => s + (p.visits?.length || 0), 0);
    $("#stats").textContent = `${n} place${n === 1 ? "" : "s"} · ${cities || 1} cit${cities === 1 ? "y" : "ies"} · ${visits} visits · avg ${avg}★`;
  }

  function renderFilters() {
    const counts = {};
    places.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    const used = Object.keys(CATS).filter((k) => counts[k]);
    $("#catChips").innerHTML = used.map((k) =>
      `<button class="chip" data-cat="${k}" aria-pressed="${f.cats.has(k)}" style="--c:${CATS[k].color}">${iconSvg(k)}${CATS[k].label}<span class="n">${counts[k]}</span></button>`
    ).join("");
    const tagCounts = {};
    places.forEach((p) => (p.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b));
    for (const t of [...f.tags]) if (!tagCounts[t]) f.tags.delete(t);
    $("#tagChips").innerHTML = tags.map((t) =>
      `<button class="chip" data-tag="${esc(t)}" aria-pressed="${f.tags.has(t)}">#${esc(t)}<span class="n">${tagCounts[t]}</span></button>`
    ).join("");
    $("#returnOnly").setAttribute("aria-pressed", f.returnOnly);
    $("#inView").setAttribute("aria-pressed", f.inView);
  }

  function renderList() {
    const list = filtered();
    $("#exampleBanner").hidden = !places.some((p) => p.example);
    $("#cards").innerHTML = list.map((p) => {
      const lv = lastVisit(p), n = p.visits?.length || 0;
      const meta = [CATS[p.category]?.label, p.city || p.address?.split(",")[0], price(p.price)].filter(Boolean).join(" · ");
      return `<li class="card ${p.id === selectedId ? "active" : ""}" data-id="${p.id}" tabindex="0">
        <div class="badge" style="--c:${CATS[p.category]?.color}">${iconSvg(p.category)}</div>
        <div class="card-main">
          <p class="card-name">${esc(p.name)}</p>
          <div class="card-meta">${esc(meta)}${lv ? ` · ${ago(lv)}` : ""}</div>
          ${p.tags?.length ? `<div class="card-tags">${p.tags.slice(0, 4).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="card-side">
          ${p.rating ? stars(p.rating) : ""}
          ${n ? `<span class="tally" title="${n} visit${n === 1 ? "" : "s"}">${n}× visited</span>` : ""}
          ${p.wantToReturn ? `<span class="return-flag">Go back</span>` : ""}
        </div>
      </li>`;
    }).join("");
    const empty = $("#empty");
    if (!places.length) {
      empty.hidden = false;
      empty.innerHTML = `<h3>Start your map</h3>
        <p>Add a restaurant, café, museum or bookstore you love. Rate it, tag it, and jot down what to order next time.</p>
        <div class="row"><button class="btn primary" id="emptyAdd">Add your first place</button>
        <button class="btn ghost" id="loadExamples">Show example places</button></div>`;
    } else if (!list.length) {
      empty.hidden = false;
      empty.innerHTML = `<h3>Nothing matches</h3><p>No places fit these filters.</p><div class="row"><button class="btn ghost" id="clearFilters">Clear filters</button></div>`;
    } else empty.hidden = true;
    syncMarkers(list);
    return list;
  }

  function render() {
    renderStats();
    renderFilters();
    renderList();
    if (view === "detail") renderDetail();
  }

  // ---------- Render: detail ----------
  function renderDetail() {
    const p = places.find((x) => x.id === selectedId);
    if (!p) return show("list");
    const visits = (p.visits || []).slice().sort().reverse();
    const ll = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    const qName = encodeURIComponent(p.name + (p.address ? ", " + p.address : ""));
    $("#detailView").innerHTML = `
      <div class="view-head"><button class="back" data-back>← All places</button></div>
      <div class="detail">
        <div class="detail-top">
          <div class="badge" style="--c:${CATS[p.category]?.color}">${iconSvg(p.category)}</div>
          <div>
            <div class="kind">${CATS[p.category]?.label}${p.price ? ` · ${price(p.price)}` : ""}</div>
            <h2>${esc(p.name)}</h2>
          </div>
        </div>
        <div class="rating-line">
          ${p.rating ? stars(p.rating) : `<span class="price-txt">Not rated yet</span>`}
          ${p.wantToReturn ? `<span class="return-flag">Want to go back</span>` : ""}
        </div>
        ${p.tags?.length ? `<div class="card-tags">${p.tags.map((t) => `<button class="tag chip-link" data-tagjump="${esc(t)}" style="border:0;cursor:pointer">#${esc(t)}</button>`).join("")}</div>` : ""}
        <div>
          <p class="sec-lbl">Notes</p>
          <p class="notes ${p.notes ? "" : "none"}">${p.notes ? esc(p.notes) : "No notes yet."}</p>
        </div>
        <div>
          <p class="sec-lbl">Where</p>
          ${p.address ? `<p class="addr">${esc(p.address)}</p>` : ""}
          <p class="coords">${ll}</p>
          <div class="links">
            <a href="https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lon}" target="_blank" rel="noopener">Apple Maps</a>
            <a href="https://www.google.com/maps/search/?api=1&query=${qName}" target="_blank" rel="noopener">Google Maps</a>
          </div>
        </div>
        <div>
          <p class="sec-lbl">Visits · ${visits.length}</p>
          ${visits.length ? `<ul class="visit-log">${visits.map((v) => `<li><span>${fmtDate(v)}</span><span>${ago(v)}</span></li>`).join("")}</ul>` : `<p class="price-txt">No visits logged.</p>`}
        </div>
        <div class="detail-actions">
          <button class="btn primary" id="logVisit">${visits[0] === today() ? "Visited today ✓" : "Log a visit today"}</button>
          <button class="btn ghost" id="editBtn">Edit</button>
        </div>
      </div>`;
  }

  // ---------- Views ----------
  function show(v) {
    view = v;
    $("#listView").hidden = v !== "list";
    $("#detailView").hidden = v !== "detail";
    $("#editView").hidden = v !== "edit";
    document.body.classList.toggle("adding", v === "edit");
    document.body.classList.toggle("editing", v === "edit");
    $("#pinHint").hidden = !(v === "edit" && draft && draft.lat == null);
    $("#addBtn").hidden = v === "edit";
    if (v !== "edit") clearDraftMarker();
    if (v === "list") { selectedId = null; render(); }
    if (v === "detail") renderDetail();
    setTimeout(() => map.invalidateSize(), 50);
    document.querySelector(`#${v}View`)?.scrollTo(0, 0);
  }

  function select(id, pan = true) {
    selectedId = id;
    const p = places.find((x) => x.id === id);
    show("detail");
    renderList();
    if (p) {
      if (pan || !map.getBounds().contains([p.lat, p.lon])) focusOn(p.lat, p.lon, Math.max(map.getZoom(), 15));
    }
  }

  // ---------- Editor ----------
  function openEditor(p) {
    draft = p ? JSON.parse(JSON.stringify(p)) : { id: null, name: "", category: "restaurant", rating: 0, price: 0, address: "", city: "", lat: null, lon: null, tags: [], notes: "", visits: [today()], wantToReturn: false };
    $("#editTitle").textContent = p ? "Edit place" : "Add a place";
    $("#finder").hidden = false;
    $("#lookup").value = "";
    $("#results").innerHTML = "";
    $("#f-name").value = draft.name;
    $("#f-address").value = draft.address || "";
    $("#f-notes").value = draft.notes || "";
    $("#f-return").checked = !!draft.wantToReturn;
    $("#f-visit-date").value = today();
    $("#formError").textContent = "";
    $("#deleteBtn").hidden = !p;
    $("#confirmDelete").hidden = true;
    renderEditBits();
    show("edit");
    if (draft.lat != null) placeDraftMarker(draft.lat, draft.lon, false);
    if (!p) setTimeout(() => $("#lookup").focus(), 60);
  }

  function renderEditBits() {
    $("#f-cats").innerHTML = Object.entries(CATS).map(([k, c]) =>
      `<button type="button" class="chip" role="radio" data-setcat="${k}" aria-checked="${draft.category === k}" style="--c:${c.color}">${iconSvg(k)}${c.label}</button>`).join("");
    $("#f-rating").innerHTML = [1, 2, 3, 4, 5].map((i) =>
      `<button type="button" role="radio" data-rate="${i}" class="${i <= draft.rating ? "on" : ""}" aria-checked="${draft.rating === i}" aria-label="${i} star${i > 1 ? "s" : ""}">${STAR}</button>`).join("");
    $("#f-price").innerHTML = [1, 2, 3, 4].map((i) =>
      `<button type="button" role="radio" data-price="${i}" class="${i === draft.price ? "on" : ""}" aria-checked="${draft.price === i}">${"$".repeat(i)}</button>`).join("");
    $("#f-tags").innerHTML = draft.tags.map((t, i) => `<span class="tag">#${esc(t)}<button type="button" data-rmtag="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("");
    const all = allTags().filter((t) => !draft.tags.includes(t));
    $("#tagList").innerHTML = all.map((t) => `<option value="${esc(t)}">`).join("");
    const starters = ["kid-friendly", "date night", "outdoor seating", "quiet", "brunch", "late night", "cozy", "rainy day", "bring visitors", "work-friendly"];
    const sugg = [...new Set([...all.slice(0, 8), ...starters])].filter((t) => !draft.tags.includes(t)).slice(0, 10);
    $("#tagSuggest").innerHTML = sugg.map((t) => `<button type="button" class="chip" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join("");
    $("#f-visits").innerHTML = draft.visits.slice().sort().reverse().map((v) => `<span class="tag">${fmtDate(v)}<button type="button" data-rmvisit="${v}" aria-label="Remove visit ${v}">×</button></span>`).join("");
    $("#f-coords").textContent = draft.lat != null ? `${draft.lat.toFixed(5)}, ${draft.lon.toFixed(5)}` : "No pin yet — search above or tap the map";
  }

  function allTags() {
    const c = {};
    places.forEach((p) => (p.tags || []).forEach((t) => (c[t] = (c[t] || 0) + 1)));
    return Object.keys(c).sort((a, b) => c[b] - c[a]);
  }

  function addTag(raw) {
    raw.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean).forEach((t) => {
      if (!draft.tags.includes(t)) draft.tags.push(t.slice(0, 30));
    });
    $("#f-tag").value = "";
    renderEditBits();
  }

  function placeDraftMarker(lat, lon, pan = true) {
    draft.lat = lat; draft.lon = lon;
    if (!draftMarker) {
      draftMarker = L.marker([lat, lon], { draggable: true, icon: pinIcon(draft.category, "active"), zIndexOffset: 2000 }).addTo(map);
      draftMarker.on("dragend", () => {
        const ll = draftMarker.getLatLng();
        draft.lat = ll.lat; draft.lon = ll.lng;
        renderEditBits();
      });
    } else draftMarker.setLatLng([lat, lon]);
    draftMarker.setIcon(pinIcon(draft.category, "active"));
    if (pan) focusOn(lat, lon, Math.max(map.getZoom(), 16));
    $("#pinHint").hidden = true;
    renderEditBits();
    syncMarkers(filtered());
  }
  function clearDraftMarker() {
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
  }

  // Place lookup (Photon / OpenStreetMap via local server)
  let lookupTimer = null, lookupSeq = 0, lastResults = [];
  function fmtFeature(ft) {
    const p = ft.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const addr = [street, p.city || p.town || p.village, p.state, p.country !== "United States" ? p.country : ""].filter(Boolean).join(", ");
    return { name: p.name || street || p.city || "Unnamed place", address: addr, city: p.city || p.town || p.village || p.county || "", category: OSM_CAT[p.osm_value] || "other", lat: ft.geometry.coordinates[1], lon: ft.geometry.coordinates[0], kind: (p.osm_value || "").replace(/_/g, " ") };
  }
  async function lookup(q) {
    const seq = ++lookupSeq;
    const box = $("#results");
    if (q.trim().length < 3) { box.innerHTML = ""; return; }
    box.innerHTML = `<li class="msg">Searching…</li>`;
    try {
      const c = map.getCenter();
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`);
      const data = await r.json();
      if (seq !== lookupSeq) return;
      if (data.error) throw new Error(data.error);
      lastResults = (data.features || []).map(fmtFeature);
      box.innerHTML = lastResults.length ? lastResults.map((x, i) =>
        `<li><button type="button" data-pick="${i}" style="--c:${CATS[x.category].color}">${iconSvg(x.category)}<span><b>${esc(x.name)}</b><small>${esc([x.kind, x.address].filter(Boolean).join(" · "))}</small></span></button></li>`).join("")
        : `<li class="msg">No matches. Try adding the city, or tap the map to drop a pin.</li>`;
    } catch {
      if (seq === lookupSeq) box.innerHTML = `<li class="msg">Search is offline right now. Tap the map to drop a pin instead.</li>`;
    }
  }
  async function reverse(lat, lon) {
    try {
      const r = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`);
      const ft = (await r.json()).features?.[0];
      if (!ft || !draft) return;
      const x = fmtFeature(ft);
      if (!$("#f-address").value) { draft.address = x.address; $("#f-address").value = x.address; }
      draft.city = draft.city || x.city;
      if (!$("#f-name").value && ft.properties.name) { $("#f-name").value = ft.properties.name; if (x.category !== "other") setCat(x.category); }
    } catch { /* offline — pin still works */ }
  }
  function setCat(k) {
    draft.category = k;
    if (draftMarker) draftMarker.setIcon(pinIcon(k, "active"));
    renderEditBits();
  }

  function saveDraft(e) {
    e.preventDefault();
    draft.name = $("#f-name").value.trim();
    draft.address = $("#f-address").value.trim();
    draft.notes = $("#f-notes").value.trim();
    draft.wantToReturn = $("#f-return").checked;
    if ($("#f-tag").value.trim()) addTag($("#f-tag").value);
    if (!draft.name) { $("#formError").textContent = "Give the place a name."; $("#f-name").focus(); return; }
    if (draft.lat == null) { $("#formError").textContent = "Put it on the map: pick a search result or tap the map."; return; }
    if (!draft.city && draft.address) draft.city = draft.address.split(",").slice(-2, -1)[0]?.trim() || "";
    draft.updated = Date.now();
    if (draft.id) {
      const i = places.findIndex((p) => p.id === draft.id);
      places[i] = draft;
    } else {
      draft.id = uid();
      draft.created = Date.now();
      places.push(draft);
    }
    const id = draft.id;
    draft = null;
    persist();
    select(id, false);
    render();
  }

  // ---------- Events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, .card, [data-back]");
    if (!t) return;
    const d = t.dataset;
    if (t.matches("[data-back]")) { draft = null; return selectedId && view === "edit" && places.some((p) => p.id === selectedId) ? show("detail") : show("list"); }
    if (t.classList.contains("card")) return select(d.id);
    if (d.cat) { f.cats.has(d.cat) ? f.cats.delete(d.cat) : f.cats.add(d.cat); return render(); }
    if (d.tag) { f.tags.has(d.tag) ? f.tags.delete(d.tag) : f.tags.add(d.tag); return render(); }
    if (d.tagjump) { f.tags = new Set([d.tagjump]); f.cats.clear(); show("list"); return; }
    if (d.setcat) return setCat(d.setcat);
    if (d.rate) { draft.rating = draft.rating === +d.rate ? 0 : +d.rate; return renderEditBits(); }
    if (d.price) { draft.price = draft.price === +d.price ? 0 : +d.price; return renderEditBits(); }
    if (d.rmtag) { draft.tags.splice(+d.rmtag, 1); return renderEditBits(); }
    if (d.addtag) return addTag(d.addtag);
    if (d.rmvisit) { draft.visits.splice(draft.visits.indexOf(d.rmvisit), 1); return renderEditBits(); }
    if (d.pick) {
      const x = lastResults[+d.pick];
      $("#f-name").value = x.name; draft.name = x.name;
      $("#f-address").value = x.address; draft.address = x.address;
      draft.city = x.city;
      draft.category = x.category;
      $("#results").innerHTML = "";
      $("#lookup").value = "";
      placeDraftMarker(x.lat, x.lon);
      return;
    }
    switch (t.id) {
      case "addBtn": case "emptyAdd": return openEditor(null);
      case "editBtn": return openEditor(places.find((p) => p.id === selectedId));
      case "logVisit": {
        const p = places.find((x) => x.id === selectedId);
        p.visits = p.visits || [];
        if (!p.visits.includes(today())) { p.visits.push(today()); persist(); render(); }
        return;
      }
      case "f-add-visit": {
        const v = $("#f-visit-date").value;
        if (v && !draft.visits.includes(v)) { draft.visits.push(v); renderEditBits(); }
        return;
      }
      case "deleteBtn": $("#confirmDelete").hidden = false; return;
      case "confirmNo": $("#confirmDelete").hidden = true; return;
      case "confirmYes": {
        places = places.filter((p) => p.id !== draft.id);
        draft = null; persist(); show("list"); return;
      }
      case "loadExamples": places = EXAMPLES.map((p) => ({ ...p, id: uid() + p.id, example: true, created: Date.now() })); persist(); render(); fitAll(); return;
      case "clearExamples": places = places.filter((p) => !p.example); persist(); show("list"); return;
      case "clearFilters": f.q = ""; $("#q").value = ""; f.cats.clear(); f.tags.clear(); f.minRating = 0; $("#minRating").value = "0"; f.returnOnly = false; f.inView = false; return render();
      case "returnOnly": f.returnOnly = !f.returnOnly; return render();
      case "inView": f.inView = !f.inView; return render();
      case "fitBtn": return fitAll();
      case "locateBtn": return map.locate({ setView: true, maxZoom: 15 });
      case "menuBtn": { const m = $("#menu"); m.hidden = !m.hidden; t.setAttribute("aria-expanded", !m.hidden); return; }
      case "exportBtn": {
        const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), places }, null, 1)], { type: "application/json" });
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `keepers-${today()}.json` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        $("#menu").hidden = true; return;
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList?.contains("card")) select(e.target.dataset.id);
    if (e.key === "Escape" && view !== "list") { draft = null; show("list"); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".brand-actions")) $("#menu").hidden = true; }, true);

  $("#q").addEventListener("input", (e) => { f.q = e.target.value; renderList(); });
  $("#sort").addEventListener("change", (e) => { f.sort = e.target.value; renderList(); });
  $("#minRating").addEventListener("change", (e) => { f.minRating = +e.target.value; renderList(); });
  map.on("moveend", () => { if (f.inView || f.sort === "near") renderList(); });
  map.on("click", (e) => {
    if (view !== "edit" || !draft) return;
    placeDraftMarker(e.latlng.lat, e.latlng.lng, false);
    reverse(e.latlng.lat, e.latlng.lng);
  });
  map.on("locationerror", () => { $("#saveState").textContent = "Location unavailable"; });

  $("#lookup").addEventListener("input", (e) => { clearTimeout(lookupTimer); lookupTimer = setTimeout(() => lookup(e.target.value), 350); });
  $("#lookup").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(lookupTimer); lookup(e.target.value); } });
  $("#f-tag").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === ",") && e.target.value.trim()) { e.preventDefault(); addTag(e.target.value); }
    if (e.key === "Backspace" && !e.target.value && draft.tags.length) { draft.tags.pop(); renderEditBits(); }
  });
  $("#f-tag").addEventListener("change", (e) => { if (allTags().includes(e.target.value.trim())) addTag(e.target.value); });
  $("#editForm").addEventListener("submit", saveDraft);
  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      const incoming = Array.isArray(doc) ? doc : doc.places;
      if (!Array.isArray(incoming)) throw new Error();
      const byId = new Map(places.map((p) => [p.id, p]));
      incoming.filter((p) => p && p.name && isFinite(p.lat) && isFinite(p.lon)).forEach((p) => byId.set(p.id || uid(), { tags: [], visits: [], ...p }));
      places = [...byId.values()];
      persist(); render(); fitAll();
      $("#saveState").textContent = `Imported ${incoming.length}`;
    } catch { $("#saveState").textContent = "That file isn't a Keepers backup"; }
    e.target.value = ""; $("#menu").hidden = true;
  });

  // ---------- Examples (clearly marked, removable) ----------
  const EXAMPLES = [
    { id: "a", name: "The Art Institute of Chicago", category: "museum", lat: 41.8796, lon: -87.6237, address: "111 S Michigan Ave, Chicago, IL", city: "Chicago", rating: 5, price: 3, tags: ["rainy day", "bring visitors", "kid-friendly"], notes: "Thorne Miniature Rooms are the kids' favorite.\nGo Thursday evening for fewer crowds.", visits: ["2026-03-14", "2026-07-02", "2026-09-20"], wantToReturn: true },
    { id: "b", name: "Harold Washington Library Center", category: "library", lat: 41.8763, lon: -87.6282, address: "400 S State St, Chicago, IL", city: "Chicago", rating: 4, price: 0, tags: ["quiet", "work-friendly", "kid-friendly"], notes: "Winter Garden on the 9th floor is the best reading spot.", visits: ["2026-08-11"], wantToReturn: true },
    { id: "c", name: "Myopic Books", category: "bookstore", lat: 41.9097, lon: -87.6775, address: "1564 N Milwaukee Ave, Chicago, IL", city: "Chicago", rating: 5, price: 1, tags: ["used books", "rainy day"], notes: "Three floors. Poetry upstairs.", visits: ["2026-05-03", "2026-09-28"], wantToReturn: true },
    { id: "d", name: "The Violet Hour", category: "bar", lat: 41.9087, lon: -87.6773, address: "1520 N Damen Ave, Chicago, IL", city: "Chicago", rating: 4, price: 3, tags: ["date night", "cocktails"], notes: "Unmarked door. Arrive before 8 to skip the line.", visits: ["2026-02-14"], wantToReturn: false },
    { id: "e", name: "Lula Cafe", category: "restaurant", lat: 41.9271, lon: -87.7072, address: "2537 N Kedzie Blvd, Chicago, IL", city: "Chicago", rating: 5, price: 2, tags: ["brunch", "date night"], notes: "Order the seasonal pasta. Monday farm dinner is worth booking.", visits: ["2026-04-19", "2026-06-07", "2026-08-30", "2026-10-04"], wantToReturn: true },
    { id: "f", name: "Garfield Park Conservatory", category: "park", lat: 41.8863, lon: -87.7173, address: "300 N Central Park Ave, Chicago, IL", city: "Chicago", rating: 5, price: 0, tags: ["kid-friendly", "rainy day", "free"], notes: "Warm in January. The Fern Room feels like another planet.", visits: ["2026-01-18"], wantToReturn: true },
  ];

  // ---------- Boot ----------
  (async () => {
    try {
      const r = await fetch("/api/places");
      places = (await r.json()).places || [];
    } catch {
      $("#saveState").textContent = "Can't reach Keepers — start it with Keepers.command";
    }
    render();
    if (places.length) fitAll();
  })();
})();
