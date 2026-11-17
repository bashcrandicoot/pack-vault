/* Pack opening model for English Scarlet & Violet / Mega Evolution boosters.
   10 game cards (no in-pack duplicates) + 1 Basic Energy + 1 code card. */
(function (root) {
  'use strict';
  const ENERGY_TYPES = [
    {id: 'grass', name: 'Basic Grass Energy'},
    {id: 'fire', name: 'Basic Fire Energy'},
    {id: 'water', name: 'Basic Water Energy'},
    {id: 'lightning', name: 'Basic Lightning Energy'},
    {id: 'psychic', name: 'Basic Psychic Energy'},
    {id: 'fighting', name: 'Basic Fighting Energy'},
    {id: 'darkness', name: 'Basic Darkness Energy'},
    {id: 'metal', name: 'Basic Metal Energy'}
  ];
  const ENERGY_VALUE = 0.03;

  function defaultRnd() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }

  function createModel(rnd) {
    if (!rnd) rnd = defaultRnd;
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const mean = arr => arr && arr.length ? arr.reduce((t, c) => t + c[2], 0) / arr.length : 0;
    function roll(table, fallback) {
      let x = rnd() * 100;
      for (const [k, p] of table) { if (x < p) return k; x -= p; }
      return fallback;
    }
    function cardKey(c) {
      const num = c && (c.num != null ? c.num : c[1]);
      const name = c && (c.name != null ? c.name : c[0]);
      if (num) return String(num).replace(/\s+/g, '').toLowerCase();
      return String(name || '').toLowerCase();
    }
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
    function pickUnique(pool, used) {
      if (!pool || !pool.length) return ['Unknown', '', 0, 0];
      const avail = [];
      for (const c of pool) if (!used.has(cardKey(c))) avail.push(c);
      const c = pick(avail.length ? avail : pool);
      used.add(cardKey(c));
      return c;
    }
    function openPack(s, opts) {
      const used = new Set();
      const cards = slots(s).map(sl => {
        const key = sl.length === 1 ? sl[0] : roll(sl[0], sl[1]);
        const c = pickUnique(s.pools[key], used);
        return {set: s.id, k: key, name: c[0], num: c[1], v: c[2], pid: c[3]};
      });
      if (!opts || opts.extras !== false) {
        const e = pick(ENERGY_TYPES);
        cards.push({set: s.id, k: 'en', name: e.name, num: '', v: ENERGY_VALUE, pid: e.id, eid: e.id});
        cards.push({set: s.id, k: 'code', name: 'Code Card', num: s.name, v: 0, pid: s.id});
      }
      return cards;
    }
    function ev(s) {
      const game = slots(s).reduce((t, sl) => {
        if (sl.length === 1) return t + mean(s.pools[sl[0]]);
        let rest = 100, sum = 0;
        for (const [k, p] of sl[0]) { sum += p / 100 * mean(s.pools[k]); rest -= p; }
        return t + sum + rest / 100 * mean(s.pools[sl[1]]);
      }, 0);
      return game + ENERGY_VALUE;
    }
    return {slots, roll, openPack, ev, cardKey, pickUnique, mean, ENERGY_TYPES, ENERGY_VALUE};
  }

  root.PP_createModel = createModel;
  root.PP_ENERGY_TYPES = ENERGY_TYPES;
  root.PP_ENERGY_VALUE = ENERGY_VALUE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
