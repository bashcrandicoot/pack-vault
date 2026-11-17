# Zara's Poképacks — Pokémon pack-opening simulator (static PWA)

Mobile-first, installable, works offline. No build step, no backend.

## Run locally
    cd pokepack-sim && python3 -m http.server 8000
    # open http://localhost:8000 (a service worker needs http(s), not file://)

## Host it (any static host)
Upload the whole folder (index.html, style.css, app.js, data.js, pack-model.js, sw.js, manifest.webmanifest,
precache-imgs.json, icons/, img/, img/packs/, img/energy/, img/ui/). Netlify Drop, Cloudflare Pages, GitHub Pages and Vercel all work.
On the phone: open the URL in Safari → Share → Add to Home Screen.

## Data
- tools/build_data.py builds data.js from TCGplayer market prices (tcgcsv.com export, 2026-11-16)
  and TCGplayer Authentication Center pull rates (via pullsim.com).
- tools/fetch_imgs.sh downloads card thumbnails into img/.
- tools/ev.py prints expected value per pack.
- Saves collection + stats in localStorage (key `packvault.v1`), per device/browser.

Pack wrapper photos in `img/packs/` are the TCGplayer sealed booster-pack product images (see img/packs/SOURCES.txt).

## Pack model
English Scarlet & Violet / Mega Evolution boosters are modeled as 10 game cards + 1 Basic Energy + 1 TCG Live code card:
4 commons, 3 uncommons, 2 reverse-holo slots (one can upgrade to an Illustration Rare or better), and 1 rare-or-better.
Prismatic Evolutions uses its Poké Ball / ACE SPEC and Master Ball / Special Illustration Rare slots.
Sampling is without replacement by collector number, so the same card cannot appear twice in one pack (including regular + reverse).
Trainers appear in the common and uncommon pools at their printed rarity. Energy art is from the Scarlet & Violet energy sheet (`sve`, pokemontcg.io). The card back is the official English TCG back (Bulbagarden archives).
See the in-app Odds tab for sources.

The enter-screen title uses the fan font **Pokemon Solid** (IPBP / Fontsaurus, Creative Commons Attribution; see `fonts/SOURCES.txt`).
