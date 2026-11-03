// Shared by every page. Each part looks for its own elements and does nothing on pages without them.

// Side menu: a modal drawer, so Esc and focus trapping come from <dialog>; clicking the backdrop or a link closes it.
(function () {
  const menu = document.getElementById("side-menu");
  const open = document.getElementById("menu-open");
  if (!menu || !open) return;
  function close() { menu.classList.remove("on"); setTimeout(function () { menu.close(); }, 200); }
  open.addEventListener("click", function () {
    menu.showModal(); open.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () { menu.classList.add("on"); });
  });
  menu.addEventListener("close", function () { menu.classList.remove("on"); open.setAttribute("aria-expanded", "false"); });
  menu.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
  document.getElementById("menu-close").addEventListener("click", close);
  menu.addEventListener("click", function (e) { if (e.target === menu || e.target.closest(".side-links a")) close(); });
})();

// Hero video reel: cross-fade to the next clip as each 6-second clip ends; only the first clip loads up front.
(function () {
  let clips = [...document.querySelectorAll(".reel video")];
  if (!clips.length) return;
  // Phones and data-saver connections cycle through fewer clips to save data.
  const light = matchMedia("(max-width: 860px)").matches || (navigator.connection && navigator.connection.saveData);
  if (light) { clips.slice(5).forEach(function (v) { v.remove(); }); clips = clips.slice(0, 5); }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { clips[0].pause(); clips[0].removeAttribute("autoplay"); return; }
  const playSafe = v => { const p = v.play(); if (p && p.catch) p.catch(function () {}); };
  playSafe(clips[0]);
  if (clips.length < 2) return;
  let i = 0;
  setInterval(function () {
    const cur = clips[i], next = clips[(i + 1) % clips.length];
    next.preload = "auto"; next.currentTime = 0; playSafe(next);
    next.classList.add("on"); cur.classList.remove("on");
    setTimeout(function () { cur.pause(); }, 2000);
    i = (i + 1) % clips.length;
    clips[(i + 1) % clips.length].preload = "auto";
  }, 5600);
})();

// Where the shelf's "get it" link sends people, per store page ({app} = Steam app id, {q} = title).
// An affiliate program's own link format goes here; `paid: true` then shows the commission note.
// EPIC_CREATOR_CODE is a Support-A-Creator code, entered at Epic's checkout.
const SHOP = {
  steam: { label: "See it on Steam", url: "https://store.steampowered.com/app/{app}/", paid: false },
  other: { label: "See it on Steam", url: "https://store.steampowered.com/app/{app}/", paid: false },
  epic: { label: "Get it on the Epic Games Store", url: "https://store.epicgames.com/en-US/browse?q={q}", paid: false },
  gog: { label: "Get it on GOG", url: "https://www.gog.com/en/games?query={q}", paid: false },
};
const EPIC_CREATOR_CODE = "";

// Hero shelf: pointing at a cover brings that game's art behind the headline (like the app);
// clicking one plays its trailer further down.
(function () {
  const art = document.querySelector(".hero-art"), name = document.getElementById("shelf-name");
  const shelf = document.querySelector(".shelf"), chips = document.querySelector(".genres");
  const covers = [...document.querySelectorAll(".cover")];
  if (!art || !shelf || !covers.length) return;
  // A link to buy the game on screen, beside its name. Never for a game marked "Won't run".
  const store = ["steam", "epic", "gog", "other"].find(function (k) { return document.body.classList.contains(k); });
  const shop = SHOP[store || "steam"], creator = store === "epic" && EPIC_CREATOR_CODE;
  let buy = null;
  if (name) {
    buy = document.createElement("a");
    buy.className = "shelf-buy"; buy.target = "_blank"; buy.hidden = true;
    buy.rel = "noopener" + (shop.paid ? " sponsored" : "");
    name.after(buy);
    if (shop.paid || creator) {
      const note = document.createElement("small");
      note.className = "shelf-note";
      note.textContent = (creator ? "Support us with creator code " + EPIC_CREATOR_CODE + " at checkout. " : "")
        + (shop.paid ? "Store links may earn Game Bridger a commission." : "");
      name.parentNode.appendChild(note);
    }
  }
  function shopLink(c) {
    if (!buy) return;
    const needsApp = shop.url.indexOf("{app}") >= 0;
    buy.hidden = Boolean(c.dataset.note) || (needsApp && !c.dataset.app);
    if (buy.hidden) return;
    buy.href = shop.url.replace("{app}", c.dataset.app || "").replace("{q}", encodeURIComponent(c.dataset.title));
    buy.textContent = shop.label;
  }
  let warm = false;
  // The wide art is large: start fetching all of it as soon as the pointer reaches the shelf.
  shelf.addEventListener("pointerenter", function () {
    if (warm) return; warm = true;
    covers.forEach(function (c) { new Image().src = c.dataset.art; });
  });
  // Touch screens can't point, so the first tap shows a game and a second tap opens its trailer.
  const touch = matchMedia("(hover: none)").matches;
  if (touch && name) name.textContent = "tap one";
  covers.forEach(function (c) {
    function show() {
      art.style.backgroundImage = "url(" + c.dataset.art + ")";
      art.classList.add("on");
      if (name) name.textContent = c.dataset.title + (c.dataset.note ? " · " + c.dataset.note : c.dataset.genre ? " · " + c.dataset.genre : "");
      shopLink(c);
      covers.forEach(function (o) { o.classList.toggle("on", o === c); });
    }
    c.addEventListener("mouseenter", show); c.addEventListener("focus", show);
    c.addEventListener("click", function () {
      if (touch && !c.dataset.seen) { covers.forEach(function (o) { delete o.dataset.seen; }); c.dataset.seen = "1"; show(); return; }
      if (c.dataset.href) { location.href = c.dataset.href; return; }
      const pick = document.querySelector('.pick[data-title="' + c.dataset.title + '"]');
      if (!pick) return;
      document.getElementById("trailers").scrollIntoView();
      pick.click();
    });
  });
  // Genre chips, built from the covers' data-genre in shelf order.
  if (chips) ["All"].concat([...new Set(covers.map(function (c) { return c.dataset.genre; }))]).forEach(function (g) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "genre"; b.textContent = g; b.setAttribute("aria-pressed", g === "All");
    b.addEventListener("click", function () {
      chips.querySelectorAll(".genre").forEach(function (o) { o.setAttribute("aria-pressed", o === b); });
      covers.forEach(function (c) { c.hidden = g !== "All" && c.dataset.genre !== g; });
      shelf.scrollLeft = 0;
    });
    chips.appendChild(b);
  });
  // The shelf drifts on its own so every cover gets seen; it holds still while the visitor points at,
  // touches, scrolls or tabs into it, and at the end it rests, then glides back to the start.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let pos = 0, last = 0, holdUntil = 0, hover = false, atEnd = false;
    const hold = function (ms) { holdUntil = Math.max(holdUntil, performance.now() + ms); };
    shelf.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hover = true; });
    shelf.addEventListener("pointerleave", function () { hover = false; hold(1500); });
    ["wheel", "touchstart", "focusin"].forEach(function (ev) { shelf.addEventListener(ev, function () { hold(5000); }, { passive: true }); });
    if (chips) chips.addEventListener("click", function () { atEnd = false; hold(1500); });
    function step(t) {
      const dt = Math.min(t - last, 100); last = t;
      const end = shelf.scrollWidth - shelf.clientWidth;
      const drift = !hover && t >= holdUntil && end > 0 && !document.hidden;
      shelf.classList.toggle("drift", drift);
      if (drift) {
        if (Math.abs(shelf.scrollLeft - pos) > 2) pos = shelf.scrollLeft;   // moved by the visitor or a genre chip
        if (pos < end) { pos = Math.min(end, pos + dt * 0.03); shelf.scrollLeft = pos; }
        else if (!atEnd) { atEnd = true; hold(2000); }
        else { atEnd = false; pos = 0; shelf.scrollTo({ left: 0, behavior: "smooth" }); hold(2500); }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(function (t) { last = t; requestAnimationFrame(step); });
  }
})();

// Video tiles: load when scrolled near, play only while visible.
(function () {
  const tiles = [...document.querySelectorAll("video.tv")];
  if (!tiles.length || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      const vid = e.target;
      if (e.isIntersecting) {
        if (!vid.src) { vid.src = vid.dataset.src; }
        const p = vid.play(); if (p && p.catch) p.catch(function () {});
      } else if (vid.src) { vid.pause(); }
    });
  }, { rootMargin: "200px 0px" });
  tiles.forEach(function (t) { io.observe(t); });
})();

// Trailers: muted autoplay when the player scrolls into view; the visitor picks the next one.
(function () {
  const frame = document.getElementById("tplayer");
  if (!frame) return;
  const picks = [...document.querySelectorAll(".pick")];
  const now = document.getElementById("tnow");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let idx = 0, started = false;
  function load(i, autoplay) {
    idx = i;
    const b = picks[i];
    picks.forEach(function (p) { p.classList.toggle("on", p === b); });
    now.textContent = b.dataset.title;
    frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + b.dataset.id +
      '?autoplay=' + (autoplay ? 1 : 0) + '&mute=1&rel=0&modestbranding=1&playsinline=1" title="' + b.dataset.title +
      ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    started = true;
  }
  picks.forEach(function (b, i) { b.addEventListener("click", function () { load(i, true); }); });
  frame.addEventListener("click", function () { if (!started) load(idx, true); });
  if (reduce || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting || started) return;
    load(0, true);
    io.disconnect();
  }, { threshold: 0.5 });
  io.observe(frame);
})();

// Invite links (?invite=CODE): show the friend their code.
(function () {
  const box = document.getElementById("invited");
  if (!box) return;
  const code = (new URLSearchParams(location.search).get("invite") || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[2-9A-HJKMNP-Z]{8}$/.test(code)) return;
  document.getElementById("inv-code").textContent = code;
  box.hidden = false;
  const btn = document.getElementById("inv-copy");
  btn.addEventListener("click", function () {
    const done = function () { btn.textContent = "Copied"; };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, function () {}); else done();
  });
})();

// Founders offer: real seats from the server and a real deadline; hidden once it's over.
(function () {
  const box = document.getElementById("founders");
  if (!box) return;
  fetch("/api/founders").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.open) return;
    const ends = Date.parse(d.endsAt);
    document.getElementById("f-claimed").textContent = d.claimed.toLocaleString();
    document.getElementById("f-cap").textContent = d.cap.toLocaleString();
    document.getElementById("f-bar").style.width = Math.max(2, d.claimed / d.cap * 100) + "%";
    const left = document.getElementById("f-left");
    function tick() {
      const ms = ends - Date.now();
      if (ms <= 0) { box.hidden = true; return; }
      const dd = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1e3) % 60;
      left.textContent = dd + "d " + hh + "h " + String(mm).padStart(2, "0") + "m " + String(ss).padStart(2, "0") + "s";
    }
    tick(); setInterval(tick, 1000);
    box.hidden = false;
  }).catch(function () {});
})();

// Game deals (from /api/deals): shown when there are any.
(function () {
  const grid = document.getElementById("deals-grid");
  if (!grid) return;
  fetch("/api/deals").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    const deals = (d && d.deals || []).slice(0, 8);
    if (!deals.length) return;
    deals.forEach(function (g) {
      const a = document.createElement("a");
      a.className = "card deal"; a.href = g.link; a.target = "_blank"; a.rel = "noopener sponsored";
      const img = document.createElement("img"); img.alt = ""; img.loading = "lazy";
      img.src = "https://cdn.akamai.steamstatic.com/steam/apps/" + encodeURIComponent(g.appid) + "/header.jpg";
      const h = document.createElement("h3"); h.textContent = g.title;
      const p = document.createElement("p");
      p.innerHTML = '<b class="price">$' + g.price.toFixed(2) + '</b>' + (g.savings > 0 ? ' <s>$' + g.retail.toFixed(2) + '</s> <span class="off">-' + g.savings + '%</span>' : '') + '<br>at ' + g.store.replace(/[<>&]/g, "") + (g.runsWell ? ' · <span class="green-text">Runs well</span>' : '');
      a.append(img, h, p); grid.append(a);
    });
    document.getElementById("deals").hidden = false;
    document.querySelectorAll(".deals-link").forEach(function (l) { l.hidden = false; });
  }).catch(function () {});
})();

// Player ratings from the app: shown only once there are real votes.
(function () {
  const grid = document.getElementById("works-grid");
  if (!grid) return;
  fetch("/api/works").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    const games = (d && d.games || []).filter(function (g) { return g.up > 0 && g.up >= g.down * 3; }).slice(0, 8);
    if (!games.length) return;
    games.forEach(function (g) {
      const total = g.up + g.down, pct = Math.round(g.up / total * 100);
      const el = document.createElement("div");
      el.className = "card";
      const img = document.createElement("img");
      img.src = "https://cdn.akamai.steamstatic.com/steam/apps/" + encodeURIComponent(g.appid) + "/header.jpg";
      img.alt = ""; img.loading = "lazy";
      const name = document.createElement("h3"); name.textContent = g.name;
      const meta = document.createElement("p");
      meta.innerHTML = '<span class="green-text">' + pct + '% runs well</span> · ' + total + (total === 1 ? " rating" : " ratings");
      el.append(img, name, meta);
      grid.append(el);
    });
    document.getElementById("works").hidden = false;
  }).catch(function () {});
})();
