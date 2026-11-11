# GovBid (govbid.cc)

Static site that shows the daily analysis of MyBidMatch bids for Marut-X Labs.
No build step, no dependencies. Hosted on Cloudflare Pages from this repo.

## Layout

```
index.html                  the page
assets/style.css, app.js    styling and logic (plain JS)
data/archive/YYYY-MM-DD.json one file per day, never overwritten
data/index.json             list of snapshots, rebuilt by script
scripts/build_index.py      validates snapshots, rebuilds index.json
.github/workflows/index.yml rebuilds index.json after each push
_headers                    Cloudflare cache and security headers
```

## Daily refresh

1. Create the new day's snapshot as `data/archive/YYYY-MM-DD.json` (same shape as the existing file).
2. Commit and push to `main`.
3. The GitHub Action validates all snapshots and updates `data/index.json`. Cloudflare Pages redeploys on its own.

To do it without the Action, run `python scripts/build_index.py` locally and commit `data/index.json` too.

Rules that keep the archive safe:
- Never edit or delete an old file in `data/archive/`. Add a new date instead.
- The script stops with an error if a snapshot is malformed or its counts do not add up, so a bad file cannot reach the site.

## Run locally

```
python -m http.server 8000
```
Open http://localhost:8000 (opening index.html directly will not work, because the page fetches JSON).

## Cloudflare Pages settings

- Framework preset: None
- Build command: (empty)
- Build output directory: `/`
- Custom domain: govbid.cc

## Notes

- `index.html` has `noindex`. Delete that line to let search engines list the site.
- Anyone with the URL can open the site, and a public repo exposes the data files. To limit access, make the GitHub repo private (Cloudflare Pages can still deploy it) and put Cloudflare Access in front of govbid.cc.
