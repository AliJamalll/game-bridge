// A small live counter at the bottom corner of every page: people online now, today, and all time.
(function () {
  var box = document.createElement("div");
  box.setAttribute("aria-live", "polite");
  box.style.cssText = "position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:50;display:flex;gap:14px;align-items:center;" +
    "padding:8px 14px;border-radius:999px;background:rgba(15,18,26,.88);color:#e8ecf4;border:1px solid rgba(255,255,255,.12);" +
    "font:600 12px/1 system-ui,-apple-system,sans-serif;backdrop-filter:blur(8px);max-width:calc(100vw - 32px);flex-wrap:wrap";
  box.hidden = true;
  box.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><i id="gbv-dot" style="width:8px;height:8px;border-radius:50%;background:#3ddc84;box-shadow:0 0 8px #3ddc84"></i><b id="gbv-on">0</b> online now</span>' +
    '<span><b id="gbv-today">0</b> today</span><span><b id="gbv-total">0</b> visitors</span>';
  document.body.appendChild(box);
  var shown = {};
  function set(id, value) {
    var el = document.getElementById(id);
    if (!el || shown[id] === value) return;
    var up = shown[id] !== undefined && value > shown[id];
    shown[id] = value;
    el.textContent = Number(value).toLocaleString();
    if (up) { el.style.transition = "none"; el.style.color = "#3ddc84"; requestAnimationFrame(function () { el.style.transition = "color 1.2s"; el.style.color = ""; }); }
  }
  function show(d) {
    if (!d || typeof d.total !== "number") return;
    box.hidden = false;
    set("gbv-on", d.online); set("gbv-today", d.today); set("gbv-total", d.total);
  }
  function ping(method) {
    return fetch("/api/visit", { method: method, keepalive: true }).then(function (r) { return r.ok ? r.json() : null; }).then(show).catch(function () {});
  }
  ping("POST");                                               // this visit
  setInterval(function () { if (!document.hidden) ping("GET"); }, 8000);       // everyone else's, live
  setInterval(function () { if (!document.hidden) ping("POST"); }, 30000);     // stay "online"
})();
