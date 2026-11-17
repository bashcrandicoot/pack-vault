/* Pack Vault — pack opening simulator. Data: window.PP_DATA (real TCGplayer prices + measured pull rates). */
(() => {
'use strict';
const SETS = window.PP_DATA;
const MSRP = 4.49;           // US retail sticker price per Mega Evolution-era booster pack
const RESALE = 0.65;         // realistic resale factor
const KEY = 'packvault.v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2);
const fmtS = n => (n > 0 ? '+' : '') + fmt(n);

const RAR = {
  c:{n:'Common',o:0}, u:{n:'Uncommon',o:1}, r:{n:'Rare (holo)',o:2}, rev:{n:'Reverse Holo',o:1.5},
  pb:{n:'Poké Ball Foil',o:2.5}, ace:{n:'ACE SPEC Rare',o:3}, dr:{n:'Double Rare',o:4}, ur:{n:'Ultra Rare',o:5},
  mar:{n:'Mega Attack Rare',o:5.5}, ir:{n:'Illustration Rare',o:6}, mb:{n:'Master Ball Foil',o:6.5},
  sir:{n:'Special Illustration Rare',o:8}, hr:{n:'Hyper Rare',o:9}, mhr:{n:'Mega Hyper Rare',o:10}
};
const HIT = new Set(['ir','mb','sir','hr','mhr','mar']);
const BIG = new Set(['sir','hr','mhr']);

/* ---------- state ---------- */
const def = () => ({start:100, topups:0, resale:false, priceMode:'market', muted:false, haptics:true, set:'pfl', packs:[], coll:{}});
let S;
try { S = Object.assign(def(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = def(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const setById = id => SETS.find(s => s.id === id) || SETS[0];
const priceOf = s => S.priceMode === 'msrp' ? MSRP : s.pack;
const factor = () => S.resale ? RESALE : 1;
const totals = () => {
  let spent = 0, val = 0;
  for (const p of S.packs) { spent += p.cost; val += p.value; }
  return {spent, val, worth: val * factor(), net: val * factor() - spent};
};
const balance = () => S.start + S.topups + totals().net;

/* ---------- RNG + pull model ---------- */
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const mean = arr => arr && arr.length ? arr.reduce((t, c) => t + c[2], 0) / arr.length : 0;
// Weighted choice; probabilities in %, remainder -> fallback pool.
function roll(table, fallback) {
  let x = rnd() * 100;
  for (const [k, p] of table) { if (x < p) return k; x -= p; }
  return fallback;
}
// Slot model for modern (Scarlet & Violet / Mega Evolution) 10-card packs:
// 4 common, 3 uncommon, reverse-holo slot, "hit" reverse slot (IR/SIR/MHR or reverse holo), rare slot (Rare/DR/UR/MAR).
function slots(s) {
  const r = s.rates;
  const out = [];
  for (let i = 0; i < 4; i++) out.push(['c']);
  for (let i = 0; i < 3; i++) out.push(['u']);
  if (s.id === 'pre') {
    out.push([[['ace', r.ace], ['pb', r.pb]], 'rev']);
    out.push([[['hr', r.hr], ['sir', r.sir], ['mb', r.mb]], 'rev']);
  } else {
    out.push(['rev']);
    out.push([[['mhr', r.mhr], ['sir', r.sir], ['ir', r.ir]].filter(x => x[1]), 'rev']);
  }
  out.push([[['ur', r.ur], ['mar', r.mar], ['dr', r.dr]].filter(x => x[1]), 'r']);
  return out;
}
function openPack(s) {
  return slots(s).map(sl => {
    const key = sl.length === 1 ? sl[0] : roll(sl[0], sl[1]);
    const c = pick(s.pools[key]);
    return {set: s.id, k: key, name: c[0], num: c[1], v: c[2], pid: c[3]};
  });
}
function ev(s) {
  return slots(s).reduce((t, sl) => {
    if (sl.length === 1) return t + mean(s.pools[sl[0]]);
    let rest = 100, sum = 0;
    for (const [k, p] of sl[0]) { sum += p / 100 * mean(s.pools[k]); rest -= p; }
    return t + sum + rest / 100 * mean(s.pools[sl[1]]);
  }, 0);
}
const EV = Object.fromEntries(SETS.map(s => [s.id, ev(s)]));
window.PP_EV = EV;

/* ---------- audio (synthesized, no files) ---------- */
let AC;
const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
function tone(f, d, type = 'sine', g = .12, when = 0, slide) {
  if (S.muted) return; const a = ac(); if (!a) return;
  const o = a.createOscillator(), v = a.createGain(), t = a.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + .01); v.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(v).connect(a.destination); o.start(t); o.stop(t + d + .05);
}
function noise(d = .35, g = .25, hp = 1200) {
  if (S.muted) return; const a = ac(); if (!a) return;
  const b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain();
  f.type = 'highpass'; f.frequency.value = hp; v.gain.value = g; src.buffer = b;
  src.connect(f).connect(v).connect(a.destination); src.start();
}
const SFX = {
  tick: () => tone(1800, .03, 'square', .02),
  tear: () => { noise(.45, .35, 900); tone(300, .25, 'sawtooth', .04, 0, 90); },
  flip: () => { noise(.08, .12, 3000); tone(520, .06, 'triangle', .05); },
  rare: () => [660, 880].forEach((f, i) => tone(f, .3, 'triangle', .09, i * .07)),
  hit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .5, 'triangle', .1, i * .08)),
  big: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .9, 'triangle', .11, i * .09)); tone(80, 1.2, 'sine', .25, 0, 40); },
  coin: () => { tone(1320, .08, 'square', .03); tone(1760, .12, 'square', .03, .06); },
  thud: () => tone(140, .25, 'sine', .2, 0, 60)
};
const buzz = p => { if (S.haptics && navigator.vibrate) try { navigator.vibrate(p); } catch {} };

/* ---------- header ---------- */
let shownBal = null;
function renderHeader(pending = 0) {
  const b = balance() - pending * factor();
  const el = $('#balance');
  if (shownBal !== null && Math.abs(b - shownBal) > .001) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  shownBal = b; el.textContent = fmt(b);
  const n = totals().net - pending * factor();
  const np = $('#netPill'); np.textContent = 'Net ' + fmtS(n); np.className = 'net ' + (n < -.004 ? 'neg' : n > .004 ? 'pos' : '');
  $('#muteBtn').textContent = S.muted ? '🔇' : '🔊';
}

/* ---------- set picker + pack ---------- */
function applyTheme(s) {
  document.documentElement.style.setProperty('--a1', s.theme[0]);
  document.documentElement.style.setProperty('--a2', s.theme[1]);
}
function renderPicker() {
  $('#setPicker').innerHTML = SETS.map(s =>
    `<button class="set-chip ${s.id === S.set ? 'on' : ''}" data-s="${s.id}"><b>${s.name}</b><small>${fmt(priceOf(s))} · avg pull ${fmt(EV[s.id] * factor())}</small></button>`).join('');
  $$('.set-chip').forEach(b => b.onclick = () => { if (busy) return; S.set = b.dataset.s; save(); SFX.tick(); buzz(8); renderPack(); renderPicker(); });
}
function renderPack() {
  const s = setById(S.set); applyTheme(s);
  const chase = s.pools.sir ? s.pools.sir[0] : s.pools.ur[0];
  $('#packArt').style.backgroundImage = `url(img/${chase[3]}.jpg)`;
  $('#packCode').textContent = s.code; $('#packName').textContent = s.name;
  const p = priceOf(s), e = EV[s.id] * factor();
  $('#packPrice').textContent = fmt(p); $('#packEv').textContent = fmt(e);
  $('#evLine').innerHTML = e < p
    ? `On average you get back <b>${Math.round(e / p * 100)}¢</b> for every $1 you spend on this pack.`
    : `At this price the average pull is about even on paper, but selling cards usually gets ~65%, so you'd still lose.`;
  const can = balance() >= p;
  $('#ripBtn').disabled = !can;
  $('#ripBtn').textContent = can ? `Rip it open · ${fmt(p)}` : 'Not enough money';
  $('#hint').textContent = can ? 'Swipe across the top to rip ➜' : 'Out of money! That’s how packs work. Add allowance in ⚙️';
}

/* ---------- tearing ---------- */
let busy = false, cur = null, idx = 0;
const pack = $('#pack'), top = $('#packTop'), line = $('#tearline');
let drag = null;
pack.addEventListener('pointerdown', e => {
  if (busy) return;
  const r = pack.getBoundingClientRect();
  if (e.clientY - r.top > r.height * .42) return; // must start on upper part
  drag = {x0: e.clientX, r, last: 0}; pack.setPointerCapture(e.pointerId); ac();
});
pack.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = Math.max(0, Math.min(1, (e.clientX - drag.r.left) / drag.r.width));
  const prog = Math.max(drag.last, p * (e.clientX > drag.x0 ? 1 : 0));
  line.style.width = (prog * 100) + '%';
  if (Math.floor(prog * 10) > Math.floor(drag.last * 10)) { SFX.tick(); buzz(6); }
  drag.last = prog;
  if (prog > .82) { drag = null; startRip(); }
});
const endDrag = () => { if (drag) { line.style.transition = 'width .3s'; line.style.width = '0'; setTimeout(() => line.style.transition = '', 300); drag = null; } };
pack.addEventListener('pointerup', endDrag); pack.addEventListener('pointercancel', endDrag);
$('#ripBtn').onclick = () => { if (!busy) { ac(); line.style.transition = 'width .35s ease-out'; line.style.width = '100%'; setTimeout(() => { line.style.transition = ''; startRip(); }, 360); } };

function startRip() {
  const s = setById(S.set), cost = priceOf(s);
  if (balance() < cost - 1e-9) { line.style.width = '0'; toast('Not enough money for this pack'); pack.classList.add('shake'); setTimeout(() => pack.classList.remove('shake'), 400); return; }
  busy = true; document.body.classList.add('ripping');
  const cards = openPack(s);
  const value = +cards.reduce((t, c) => t + c.v, 0).toFixed(2);
  // commit immediately (so closing the app mid-reveal still keeps the pack)
  const rec = {t: Date.now(), set: s.id, cost, value, cards: cards.map(c => [c.k, c.pid, c.v, c.name])};
  S.packs.push(rec);
  for (const c of cards) {
    const k = `${c.set}|${c.k}|${c.pid}`;
    const e = S.coll[k] || (S.coll[k] = {set: c.set, k: c.k, pid: c.pid, name: c.name, num: c.num, v: c.v, n: 0, t: 0});
    e.n++; e.t = Date.now(); e.v = c.v;
  }
  save();
  cur = {s, cards, cost, value, pulled: 0, revealedVal: 0};
  SFX.tear(); buzz([20, 30, 40]);
  pack.classList.add('torn');
  renderHeader(value); // shows balance after paying, before cards are counted
  setTimeout(() => { pack.classList.add('gone'); }, 450);
  setTimeout(beginReveal, 900);
}

/* ---------- reveal ---------- */
function cardFace(c) {
  return `<img src="img/${c.pid}.jpg" alt="" data-n="${esc(c.name)}" data-r="${RAR[c.k].n}" onerror="ppFallback(this)">`;
}
window.ppFallback = img => { const d = document.createElement('div'); d.className = 'fallback'; d.innerHTML = `<div class="fb-n">${esc(img.dataset.n || '')}</div><div class="fb-r">${esc(img.dataset.r || '')}</div>`; img.replaceWith(d); };
function beginReveal() {
  $('#packWrap').classList.add('hidden'); $('#reveal').classList.remove('hidden');
  $('#tPaid').textContent = fmt(cur.cost); $('#tPulled').textContent = '$0.00'; $('#tCount').textContent = '0/10';
  $('#strip').innerHTML = '';
  const deck = $('#deck'); deck.innerHTML = '';
  cur.cards.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = `card r-${c.k} ${HIT.has(c.k) || c.v >= 10 ? 'hit' : ''}`;
    el.style.zIndex = 100 - i;
    el.style.transform = `translateY(${i * 1.5}px) rotate(${(i % 2 ? 1 : -1) * i * .3}deg)`;
    el.innerHTML = `<div class="glow"></div><div class="back"></div><div class="face">${cardFace(c)}<div class="holo"></div>
      <div class="badge">${RAR[c.k].n}</div>
      <div class="ribbon"><div><div class="nm">${esc(c.name)}</div><div class="rt">${c.num || ''}</div></div><div class="vl">${fmt(c.v * factor())}</div></div></div>`;
    el.onclick = () => advance();
    deck.appendChild(el);
    if (i === 0) el.animate([{transform: 'translateY(80px) scale(.8)', opacity: 0}, {transform: el.style.transform, opacity: 1}], {duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.2)'});
  });
  idx = 0; cur.state = 'back';
  $('#tapNote').textContent = 'Tap the card to flip';
}
function advance() {
  if (!cur) return;
  const els = $$('#deck .card'), el = els[idx], c = cur.cards[idx];
  if (!el) return;
  if (cur.state === 'back') {
    el.style.transform = ''; el.classList.add('flipped'); cur.state = 'face';
    cur.revealedVal += c.v; $('#tPulled').textContent = fmt(cur.revealedVal * factor()); $('#tCount').textContent = `${idx + 1}/10`;
    renderHeader(cur.value - cur.revealedVal);
    SFX.flip(); buzz(10);
    if (BIG.has(c.k) || c.v >= 25) { setTimeout(() => { SFX.big(); buzz([80, 40, 80, 40, 200]); celebrate(c); document.body.classList.add('shakescreen'); setTimeout(() => document.body.classList.remove('shakescreen'), 900); }, 350); }
    else if (HIT.has(c.k) || c.v >= 5) { setTimeout(() => { SFX.hit(); buzz([40, 30, 60]); }, 250); }
    else if (['dr', 'ur', 'ace', 'pb'].includes(c.k) || c.v >= 1) setTimeout(() => SFX.rare(), 200);
    else if (c.v >= .2) setTimeout(() => SFX.coin(), 150);
    $('#tapNote').textContent = idx === 9 ? 'Tap to see your results' : 'Tap for the next card';
  } else {
    el.classList.add('out');
    const m = document.createElement('div'); m.className = 'mini' + (HIT.has(c.k) || c.v >= 5 ? ' hit' : '');
    m.innerHTML = `<img src="img/${c.pid}.jpg" alt="">`; $('#strip').appendChild(m);
    idx++; cur.state = 'back';
    if (idx >= 10) setTimeout(showSummary, 350);
  }
}
$('#revealAllBtn').onclick = () => {
  if (!cur || $('#celebrate').classList.contains('hidden') === false) return;
  const step = () => {
    if (!cur || idx >= 10) return;
    if (!$('#celebrate').classList.contains('hidden')) { setTimeout(step, 300); return; }
    advance(); setTimeout(step, cur.state === 'face' ? 380 : 120);
  };
  step();
};

function showSummary() {
  const {cost, value, cards, s} = cur; const f = factor();
  const net = value * f - cost;
  $('#reveal').classList.add('hidden'); $('#summary').classList.remove('hidden');
  const best = [...cards].sort((a, b) => b.v - a.v)[0];
  $('#sumTitle').textContent = net >= 0 ? '🎉 You beat the pack!' : net > -cost * .5 ? '😬 Close, but the pack won' : '📉 The pack won this time';
  $('#sPaid').textContent = fmt(cost); $('#sPaid').className = 'neg';
  $('#sVal').textContent = fmt(value * f); $('#sVal').className = 'pos';
  $('#sNet').textContent = fmtS(net); $('#sNet').className = net >= 0 ? 'pos' : 'neg';
  $('#sumBest').textContent = `Best card: ${best.name} (${RAR[best.k].n}) · ${fmt(best.v * f)}`;
  const t = totals();
  $('#sumNote').textContent = S.packs.length > 1
    ? `After ${S.packs.length} packs you've spent ${fmt(t.spent)} and pulled ${fmt(t.worth)} in cards (${fmtS(t.net)}).`
    : (S.resale ? 'Counting cards at 65% of their price, which is closer to what you would get if you sold them.' : 'Card values are what they are "worth" on paper. Selling usually gets about 65%.');
  $('#sumCards').innerHTML = cards.map(c => `<div class="mini"><img src="img/${c.pid}.jpg" alt=""><span>${fmt(c.v * f)}</span></div>`).join('');
  renderHeader(0);
  const can = balance() >= priceOf(s);
  $('#againBtn').disabled = !can; $('#againBtn').textContent = can ? `Open another · ${fmt(priceOf(s))}` : 'Out of money';
  if (net >= 0) SFX.hit(); else SFX.thud();
}
function resetStage() {
  cur = null; busy = false; document.body.classList.remove('ripping');
  $('#summary').classList.add('hidden'); $('#reveal').classList.add('hidden'); $('#packWrap').classList.remove('hidden');
  pack.classList.remove('torn', 'gone'); line.style.width = '0';
  renderPack(); renderPicker(); renderHeader();
}
$('#doneBtn').onclick = resetStage;
$('#againBtn').onclick = () => { resetStage(); };

/* ---------- celebration fx ---------- */
let fxRaf;
function celebrate(c) {
  $('#celTag').textContent = RAR[c.k].n;
  $('#celCard').innerHTML = cardFace(c) + '<div class="holo" style="opacity:.35"></div>';
  $('#celName').textContent = c.name; $('#celVal').textContent = fmt(c.v * factor());
  $('#celebrate').classList.remove('hidden');
  const cv = $('#fx'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const cols = ['#ffe7a8', '#f5c96a', '#ff4fd8', '#4fffd5', '#4f8bff', '#ffffff'];
  const P = Array.from({length: 180}, () => ({x: innerWidth / 2, y: innerHeight * .42, vx: (rnd() - .5) * 14, vy: rnd() * -16 - 4, r: rnd() * 6 + 3, c: pick(cols), a: rnd() * 6, s: rnd() * .3 - .15}));
  cancelAnimationFrame(fxRaf);
  const loop = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of P) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.s; if (p.y < innerHeight + 20) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
    if (alive) fxRaf = requestAnimationFrame(loop);
  };
  loop();
}
$('#celOk').onclick = () => { $('#celebrate').classList.add('hidden'); cancelAnimationFrame(fxRaf); };

/* ---------- stats ---------- */
function renderStats() {
  const t = totals(), n = S.packs.length;
  const ret = t.spent ? t.worth / t.spent : 0;
  let best = null; for (const p of S.packs) for (const c of p.cards) if (!best || c[2] > best[2]) best = [...c, p.set];
  $('#lesson').innerHTML = n
    ? `<div class="k">For every $1 spent</div><div class="big">you got ${Math.round(ret * 100)}¢ back</div>
       <div class="meter"><i style="width:${Math.min(100, ret * 100)}%"></i></div>
       <p>${t.net < 0 ? `The packs are ahead by <b>${fmt(-t.net)}</b>. Most packs are worth less than they cost, because the big cards are super rare.` : `You're ahead right now! That's rare. Keep opening and the odds usually pull it back down.`}</p>`
    : `<div class="k">The big question</div><div class="big">Do packs pay off?</div><p>Open some packs and watch the money you spend vs what your cards are worth. Real odds, real prices.</p>`;
  const kp = [
    ['Spent on packs', fmt(t.spent), 'neg'], ['Cards worth', fmt(t.worth), 'pos'],
    ['Profit / loss', fmtS(t.net), t.net >= 0 ? 'pos' : 'neg'], ['Packs opened', n, ''],
  ];
  $('#kpis').innerHTML = kp.map(k => `<div class="kpi"><div class="k">${k[0]}</div><b class="${k[2]}">${k[1]}</b></div>`).join('')
    + (best ? `<div class="kpi wide"><div class="k">Best pull</div><b>${esc(best[3])} · ${fmt(best[2] * factor())}</b><small>${RAR[best[0]].n} · ${setById(best[4]).name}</small></div>` : '');
  renderChart();
  const rows = S.packs.map((p, i) => [i + 1, setById(p.set).name, p.cost, p.value * factor()]).reverse();
  $('#logTable').innerHTML = `<tr><th>#</th><th>Set</th><th>Cost</th><th>Pulled</th><th>Net</th></tr>` +
    (rows.length ? rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${fmt(r[2])}</td><td>${fmt(r[3])}</td><td class="${r[3] - r[2] >= 0 ? 'pos' : 'neg'}">${fmtS(r[3] - r[2])}</td></tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--mute);padding:16px">Your packs will show up here</td></tr>`);
}
function renderChart() {
  const W = 340, H = 180, pad = {l: 40, r: 10, t: 10, b: 22};
  let cs = 0, cv = 0; const ptsS = [[0, 0]], ptsV = [[0, 0]];
  S.packs.forEach((p, i) => { cs += p.cost; cv += p.value * factor(); ptsS.push([i + 1, cs]); ptsV.push([i + 1, cv]); });
  const n = Math.max(1, S.packs.length), mx = Math.max(10, cs, cv) * 1.08;
  const X = i => pad.l + i / n * (W - pad.l - pad.r), Y = v => H - pad.b - v / mx * (H - pad.t - pad.b);
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(mx * f)}" y2="${Y(mx * f)}" stroke="rgba(255,255,255,.07)"/><text x="${pad.l - 6}" y="${Y(mx * f) + 4}" fill="#9a96a8" font-size="10" text-anchor="end">$${Math.round(mx * f)}</text>`).join('');
  const area = `${path(ptsS)} L ${X(ptsV[ptsV.length - 1][0])} ${Y(ptsV[ptsV.length - 1][1])} ${ptsV.slice().reverse().map(p => 'L' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ')} Z`;
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${grid}
    <path d="${area}" fill="rgba(255,107,122,.13)"/>
    <path d="${path(ptsS)}" fill="none" stroke="#ff6b7a" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path(ptsV)}" fill="none" stroke="#f5c96a" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="${W - pad.r}" y="${H - 6}" fill="#9a96a8" font-size="10" text-anchor="end">packs opened: ${S.packs.length}</text></svg>
    <div class="fine" style="text-align:left;margin-top:4px">The red gap is money the packs kept.</div>`;
}

/* ---------- binder ---------- */
function renderBinder() {
  const fs = $('#fSet'), fr = $('#fRar');
  if (!fs.options.length) {
    fs.innerHTML = `<option value="">All sets</option>` + SETS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    fr.innerHTML = `<option value="">All rarities</option><option value="hits">Hits only</option>` +
      Object.entries(RAR).sort((a, b) => b[1].o - a[1].o).map(([k, r]) => `<option value="${k}">${r.n}</option>`).join('');
    [fs, fr, $('#fSort')].forEach(x => x.onchange = renderBinder);
  }
  const all = Object.values(S.coll);
  let list = all.filter(c => (!fs.value || c.set === fs.value) && (!fr.value || (fr.value === 'hits' ? (HIT.has(c.k) || c.v >= 5) : c.k === fr.value)));
  const so = $('#fSort').value;
  list.sort(so === 'count' ? (a, b) => b.n - a.n : so === 'name' ? (a, b) => a.name.localeCompare(b.name) : so === 'recent' ? (a, b) => b.t - a.t : (a, b) => b.v - a.v);
  const tv = all.reduce((t, c) => t + c.v * c.n, 0) * factor(), tc = all.reduce((t, c) => t + c.n, 0);
  $('#binderVal').textContent = fmt(tv);
  $('#binderCount').innerHTML = `${tc} cards<br>${all.length} different`;
  const shown = list.slice(0, 300);
  $('#binder').innerHTML = shown.length ? shown.map(c => `<div class="bcard ${HIT.has(c.k) || c.v >= 5 ? 'hit' : ''}" title="${esc(c.name)} · ${RAR[c.k].n}">
      <img src="img/${c.pid}.jpg" alt="${esc(c.name)}" loading="lazy" onerror="this.style.display='none'">
      ${c.n > 1 ? `<div class="cnt">×${c.n}</div>` : ''}
      <div class="bv2"><span>${RAR[c.k].n.split(' ').map(w => w[0]).join('')}</span><b>${fmt(c.v * factor())}</b></div></div>`).join('')
    : `<div class="empty-msg">${all.length ? 'No cards match these filters' : 'Rip a pack and your cards land here'}</div>`;
}

/* ---------- odds ---------- */
function renderOdds() {
  $('#oddsList').innerHTML = SETS.map(s => {
    const rows = [];
    const add = (k, p) => { if (p && s.pools[k]) rows.push([k, p]); };
    ['mhr', 'hr', 'sir', 'mb', 'ir', 'mar', 'ur', 'ace', 'dr', 'pb'].forEach(k => add(k, s.rates[k]));
    rows.sort((a, b) => a[1] - b[1]);
    const p = priceOf(s), e = EV[s.id] * factor(), pct = Math.min(100, e / p * 100);
    const top = s.pools.sir ? s.pools.sir[0] : null;
    return `<div class="oset"><h3>${s.name}</h3><div class="meta">${s.code} · released ${s.released} · odds from ${s.sample.toLocaleString()} opened packs</div>
      ${rows.map(([k, pr]) => `<div class="orow"><span>${RAR[k].n} <small style="color:var(--mute)">(${s.pools[k].length} card${s.pools[k].length > 1 ? 's' : ''}, avg ${fmt(mean(s.pools[k]))})</small></span><span>1 in ${(100 / pr) < 10 ? (100 / pr).toFixed(1) : Math.round(100 / pr).toLocaleString()}</span><span>${pr}%</span></div>`).join('')}
      ${top ? `<div class="fine" style="text-align:left">Top chase: <b>${esc(top[0])}</b> ${fmt(top[2])}. Chance in any one pack: 1 in ${Math.round(100 / (s.rates.sir / s.pools.sir.length)).toLocaleString()}.</div>` : ''}
      <div class="evbar"><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="lab"><span>Average pull <b style="color:var(--gold)">${fmt(e)}</b></span><span>Pack <b>${fmt(p)}</b></span></div>
      <div class="fine" style="text-align:left">${e < p ? `You lose about ${fmt(p - e)} per pack on average (${Math.round(e / p * 100)}¢ back per $1).` : `About even on paper at this price, but resale at ~65% would be ${fmt(EV[s.id] * RESALE)}.`}</div></div></div>`;
  }).join('');
  $('#sources').innerHTML = `<b>Sources.</b> Card and pack prices: TCGplayer market prices (daily export via <a href="https://tcgcsv.com" target="_blank" rel="noopener">tcgcsv.com</a>), captured Nov 16, 2026. "Real price now" is the TCGplayer market price of a single booster pack; "store sticker" is the $4.49 US retail price for Mega Evolution-era packs (<a href="https://printedprice.com/pokemon-delta-reign" target="_blank" rel="noopener">Printed Price</a>, <a href="https://www.phdgames.com/2026/08/20/pokemon-tcg-mega-evolution-delta-reign/" target="_blank" rel="noopener">PHD Games</a>), applied to every set as an estimate.
  Pull rates: TCGplayer Authentication Center measurements (${SETS.map(s => `<a href="${s.src}" target="_blank" rel="noopener">${s.name}</a>`).join(', ')}), compiled by <a href="https://pullsim.com/sets/" target="_blank" rel="noopener">PullSim</a>.
  <b>Simplifications (estimates):</b> packs are modeled as 4 commons, 3 uncommons, 1 reverse holo, 1 reverse-or-hit slot and 1 rare slot; every card of a rarity is equally likely; Mega Hyper Rares are placed in the hit slot; god packs, energy and code cards are left out. Card images © The Pokémon Company / Nintendo, via TCGplayer. Not affiliated with them. Prices change daily.`;
}

/* ---------- settings ---------- */
function openSheet() {
  $('#startInput').value = S.start; $('#resaleT').checked = S.resale; $('#hapticT').checked = S.haptics;
  $$('#priceSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === S.priceMode));
  $('#sheet').classList.remove('hidden');
}
$('#setBtn').onclick = openSheet;
$('#closeSheet').onclick = () => { $('#sheet').classList.add('hidden'); };
$('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); };
$('#startInput').onchange = e => { const v = parseFloat(e.target.value); if (v > 0 && v < 100000) { S.start = Math.round(v * 100) / 100; save(); refresh(); } };
$$('.chips button').forEach(b => b.onclick = () => { S.topups += +b.dataset.add; save(); SFX.coin(); buzz(15); refresh(); toast(`Added $${b.dataset.add}`); });
$('#resaleT').onchange = e => { S.resale = e.target.checked; save(); refresh(); };
$('#hapticT').onchange = e => { S.haptics = e.target.checked; save(); buzz(20); };
$$('#priceSeg button').forEach(b => b.onclick = () => { S.priceMode = b.dataset.p; save(); $$('#priceSeg button').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
$('#resetBtn').onclick = () => $('#confirm').classList.remove('hidden');
$('#noReset').onclick = () => $('#confirm').classList.add('hidden');
$('#yesReset').onclick = () => {
  const keep = {start: S.start, muted: S.muted, haptics: S.haptics, resale: S.resale, priceMode: S.priceMode, set: S.set};
  S = Object.assign(def(), keep); save();
  $('#confirm').classList.add('hidden'); $('#sheet').classList.add('hidden'); shownBal = null; resetStage(); refresh(); toast('Fresh start!');
};
$('#muteBtn').onclick = () => { S.muted = !S.muted; save(); renderHeader(cur ? cur.value - cur.revealedVal : 0); if (!S.muted) SFX.coin(); };

/* ---------- tabs ---------- */
let view = 'rip';
$$('.tab').forEach(t => t.onclick = () => {
  view = t.dataset.v; $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
  SFX.tick(); buzz(6); scrollTo(0, 0); refreshView();
});
function refreshView() { if (view === 'stats') renderStats(); else if (view === 'binder') renderBinder(); else if (view === 'odds') renderOdds(); }
function refresh() { if (!busy) { renderPack(); renderPicker(); renderHeader(); } else renderHeader(cur ? cur.value - cur.revealedVal : 0); refreshView(); }

/* ---------- utils ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(tt); tt = setTimeout(() => t.classList.add('hidden'), 2200); }

renderPicker(); renderPack(); renderHeader();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
