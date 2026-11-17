# Pack Vault — Pokémon pack-opening simulator (static PWA)

Mobile-first, installable, works offline. No build step, no backend.

## Run locally
    cd pokepack-sim && python3 -m http.server 8000
    # open http://localhost:8000 (a service worker needs http(s), not file://)

## Host it (any static host)
Upload the whole folder (index.html, style.css, app.js, data.js, sw.js, manifest.webmanifest,
precache-imgs.json, icons/, img/). Netlify Drop, Cloudflare Pages, GitHub Pages and Vercel all work.
On the phone: open the URL in Safari → Share → Add to Home Screen.

## Data
- tools/build_data.py builds data.js from TCGplayer market prices (tcgcsv.com export, 2026-11-16)
  and TCGplayer Authentication Center pull rates (via pullsim.com).
- tools/fetch_imgs.sh downloads card thumbnails into img/.
- tools/ev.py prints expected value per pack.
- Saves collection + stats in localStorage (key `packvault.v1`), per device/browser.
