/* Mind xTrade — rendu de la bibliothèque à partir de data/indicators.json */
(function () {
  "use strict";

  const DATA_URL = "data/indicators.json";

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtDate = (iso, opts = { day: "numeric", month: "long", year: "numeric" }) => {
    if (!iso) return "—";
    const d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", opts);
  };
  const fmtSize = (bytes) => {
    if (!bytes) return "";
    const u = ["o", "Ko", "Mo", "Go"];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0).replace(".", ",") + " " + u[i];
  };
  const cmpVersion = (a, b) => {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  };

  // Générateur pseudo-aléatoire déterministe : même graphique à chaque visite
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7);

  const STATUS = {
    stable: ["Stable", "tag-stable"],
    beta: ["Bêta", "tag-beta"],
    soon: ["Bientôt", "tag-soon"],
  };

  /* ---------- Graphique décoratif du hero ---------- */
  function drawHeroChart() {
    const svg = $("#hero-svg");
    if (!svg) return;
    const W = 1000, H = 520, N = 64, pad = 30;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const r = rng(20241023);

    const candles = [];
    let price = 100;
    for (let i = 0; i < N; i++) {
      const drift = Math.sin(i / 9) * 0.9 + 0.35;
      const o = price;
      const c = o + (r() - 0.5) * 5 + drift;
      const hi = Math.max(o, c) + r() * 2.4;
      const lo = Math.min(o, c) - r() * 2.4;
      candles.push({ o, c, hi, lo });
      price = c;
    }
    const min = Math.min(...candles.map((k) => k.lo));
    const max = Math.max(...candles.map((k) => k.hi));
    const y = (v) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
    const step = W / N;
    const bw = step * 0.52;

    let body = "";
    candles.forEach((k, i) => {
      const x = i * step + step / 2;
      const up = k.c >= k.o;
      const col = up ? "var(--up)" : "var(--down)";
      const top = y(Math.max(k.o, k.c));
      const h = Math.max(1.5, Math.abs(y(k.o) - y(k.c)));
      body += `<g class="cdl" style="animation-delay:${i * 14}ms" opacity=".75">
        <line x1="${x}" x2="${x}" y1="${y(k.hi)}" y2="${y(k.lo)}" stroke="${col}" stroke-width="1.2"/>
        <rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="1.2" fill="${up ? col : "none"}" stroke="${col}" stroke-width="1.2" fill-opacity=".85"/>
      </g>`;
    });

    // Ligne de tendance lissée (EMA) superposée
    const alpha = 2 / (12 + 1);
    let ema = candles[0].c;
    const emas = candles.map((k, i) => (ema = i ? k.c * alpha + ema * (1 - alpha) : ema));
    const pts = emas.map((v, i) => [i * step + step / 2, y(v)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = d + ` L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`;

    // Marqueurs de signal sur les croisements prix / EMA
    let marks = "";
    let lastMark = -Infinity;
    for (let i = 4; i < N; i++) {
      const up = candles[i].c > emas[i];
      if (up !== candles[i - 1].c > emas[i - 1] && i - lastMark >= 8) {
        lastMark = i;
        const [x] = pts[i];
        const yy = up ? y(candles[i].lo) + 16 : y(candles[i].hi) - 16;
        const tri = up ? `${x - 5},${yy + 4} ${x + 5},${yy + 4} ${x},${yy - 4}` : `${x - 5},${yy - 4} ${x + 5},${yy - 4} ${x},${yy + 4}`;
        marks += `<polygon points="${tri}" fill="var(--gold)" opacity=".9"/>`;
      }
    }

    const last = pts[pts.length - 1];
    svg.innerHTML = `
      <defs>
        <linearGradient id="emaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--gold)" stop-opacity=".16"/>
          <stop offset="1" stop-color="var(--gold)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#emaFill)"/>
      ${body}
      <path class="ema" d="${d}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round"/>
      ${marks}
      <line x1="0" x2="${W}" y1="${last[1]}" y2="${last[1]}" stroke="var(--gold)" stroke-opacity=".35" stroke-dasharray="3 5"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--gold)"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="10" fill="none" stroke="var(--gold)" stroke-opacity=".4"/>`;

    const ema$ = svg.querySelector(".ema");
    const len = ema$.getTotalLength();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ema$.style.strokeDasharray = len;
      ema$.style.strokeDashoffset = len;
      ema$.getBoundingClientRect();
      ema$.style.transition = "stroke-dashoffset 2.4s cubic-bezier(.6,.1,.2,1) .3s";
      ema$.style.strokeDashoffset = 0;
    }
  }

  function sparkline(seed) {
    const r = rng(hash(seed));
    let v = 10;
    const pts = Array.from({ length: 16 }, (_, i) => { v += (r() - 0.38) * 4; return [i * (88 / 15), v]; });
    const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + (30 - ((p[1] - lo) / (hi - lo || 1)) * 26).toFixed(1)).join(" ");
    return `<svg class="spark" viewBox="0 0 88 34" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /* ---------- Cartes indicateurs ---------- */
  function renderIndicator(ind, idx) {
    const [statusLabel, statusClass] = STATUS[ind.status] || STATUS.stable;
    const [maj, ...rest] = String(ind.version || "0.0.0").split(".");
    const hasFile = Boolean(ind.file);
    const list = (items) => (items || []).map((x) => `<li>${esc(x)}</li>`).join("");

    const meta = [
      ["Publiée le", fmtDate(ind.released)],
      ["Plateforme", ind.platform],
      ["Catégorie", ind.category],
      ["Contenu", ind.contents],
    ].filter(([, v]) => v).map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join("");

    const download = hasFile
      ? `<a class="btn btn-primary" href="${esc(ind.file)}" download>
           <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
           Télécharger ${ind.size ? `<span class="btn-size">${fmtSize(ind.size)}</span>` : ""}
         </a>`
      : `<span class="btn btn-primary" aria-disabled="true">Bientôt disponible</span>`;

    const guide = ind.guide
      ? `<a class="btn btn-ghost" href="${esc(ind.guide)}" target="_blank" rel="noopener">Consulter le guide PDF</a>`
      : "";

    const sha = ind.sha256
      ? `<div class="hash" title="Empreinte SHA-256 de l'archive"><span>SHA-256</span><code>${esc(ind.sha256)}</code><button type="button" data-copy="${esc(ind.sha256)}">Copier</button></div>`
      : "";

    return `
      <article class="ind reveal" id="${esc(ind.id)}">
        <div class="ind-main">
          <div class="ind-top">
            <span class="ind-index">${String(idx + 1).padStart(2, "0")}</span>
            <span class="tag ${statusClass}">${statusLabel}</span>
            ${(ind.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          </div>
          <h3>${esc(ind.name)}</h3>
          ${ind.tagline ? `<p class="ind-tagline">${esc(ind.tagline)}</p>` : ""}
          <p class="ind-desc">${esc(ind.description)}</p>
          <div class="ind-blocks">
            ${ind.features?.length ? `<div><h4>Ce qu'il fait</h4><ul>${list(ind.features)}</ul></div>` : ""}
            ${ind.useCases?.length ? `<div><h4>Quand l'utiliser</h4><ul>${list(ind.useCases)}</ul></div>` : ""}
          </div>
        </div>
        <aside class="ind-side">
          <div class="ind-version">
            <div>
              <div class="ind-version-label">Version actuelle</div>
              <div class="ind-version-num">v${esc(maj)}<span>.${esc(rest.join("."))}</span></div>
            </div>
            ${sparkline(ind.id)}
          </div>
          <ul class="meta">${meta}</ul>
          ${download}
          ${guide}
          ${sha}
        </aside>
      </article>`;
  }

  /* ---------- Journal des versions ---------- */
  function renderTimeline(indicators) {
    const entries = indicators.flatMap((ind) =>
      (ind.changelog || []).map((c) => ({ ...c, name: ind.name, id: ind.id }))
    );
    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)) || cmpVersion(b.version, a.version));
    if (!entries.length) return `<p class="empty">Aucune version publiée pour le moment.</p>`;

    return entries.map((e, i) => `
      <div class="tl-item reveal ${i === 0 ? "is-latest" : ""}">
        <div class="tl-date">${fmtDate(e.date, { day: "2-digit", month: "short", year: "numeric" })}</div>
        <div class="tl-rail"><span class="tl-dot"></span></div>
        <div class="tl-body">
          <div class="tl-head">
            <strong>${esc(e.name)}</strong>
            <span class="tl-ver">v${esc(e.version)}</span>
            ${i === 0 ? `<span class="tag tag-beta">Dernière publication</span>` : ""}
          </div>
          ${e.notes?.length ? `<ul>${e.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
          ${e.file ? `<a class="tl-dl" href="${esc(e.file)}" download>Télécharger la v${esc(e.version)} ↓</a>` : ""}
        </div>
      </div>`).join("");
  }

  /* ---------- Interactions ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-copy]");
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast("Empreinte copiée");
    } catch {
      toast("Copie impossible");
    }
  });

  function observeReveal() {
    const items = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((list) => {
      list.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }

  function applySite(site = {}) {
    if (site.youtube) {
      ["#nav-youtube", "#foot-youtube"].forEach((s) => { const a = $(s); a.href = site.youtube; a.hidden = false; });
    }
  }

  async function init() {
    $("#year").textContent = new Date().getFullYear();
    drawHeroChart();
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const inds = data.indicators || [];
      applySite(data.site);

      $("#library").innerHTML = inds.length ? inds.map(renderIndicator).join("") : `<p class="empty">Aucun indicateur publié.</p>`;
      $("#timeline").innerHTML = renderTimeline(inds);

      $("#stat-count").textContent = String(inds.length).padStart(2, "0");
      const latest = inds.map((i) => i.released).filter(Boolean).sort().pop();
      $("#stat-updated").textContent = fmtDate(latest, { day: "numeric", month: "short", year: "numeric" });
    } catch (err) {
      $("#library").innerHTML = `<p class="empty">Impossible de charger la bibliothèque (${esc(err.message)}).</p>`;
    }
    observeReveal();
  }

  init();
})();
