# Recall Radar

Keep a list of what's in your fridge, cupboard and medicine cabinet, and see when the FDA recalls any of it.

- **Add items** by scanning a barcode with your phone camera, typing the barcode, or typing the product name. Barcodes are looked up in [Open Food Facts](https://world.openfoodfacts.org) to fill in the name and brand.
- **Matching:** an item matches a recall by barcode (exact) or by name (needs two product words, or the brand plus one). Ingredient lists in recall notices are ignored, so "milk" does not match a cookie that contains milk. Tap **Not mine** to hide a wrong match.
- **Recent recalls** from the last 120 days of [openFDA](https://open.fda.gov) food and drug enforcement reports, searchable.
- **Installs like an app** (it's a PWA) and works offline with the last data it downloaded. Your pantry is stored only on your device.

## How it runs

There is no server. A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every day at 13:00 UTC and on every push to `main`. It:

1. runs the tests,
2. downloads recent recalls with `scripts/fetch-recalls.mjs` into `site/data/recalls.json`,
3. publishes the `site/` folder to GitHub Pages.

The `site/data/recalls.json` in the repo is a 15-recall sample so the app works locally; the workflow replaces it with live data when deploying.

### One-time setup

1. In the repo on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge to `main` (or run the workflow from the **Actions** tab). The app will be at `https://<your-username>.github.io/recall-radar/`.
3. Optional: add an `OPENFDA_API_KEY` repository secret ([free key](https://open.fda.gov/apis/authentication/)) for higher rate limits. It works without one.

## Develop

```sh
npm test                      # matching tests
node scripts/fetch-recalls.mjs  # pull live recalls into site/data/recalls.json
npm start                     # serve site/ locally
```

The camera needs `https` or `localhost`.

## Not built yet

- Alerts when the app is closed (needs push notifications or email from a scheduled job).
- USDA FSIS meat and poultry recalls, which openFDA does not cover.
- Medicines by name lookup (RxNorm) instead of free text.
