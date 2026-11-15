# VoxReel — landing page

A one-page site for VoxReel (live at https://voxreel.github.io, repo voxreel/voxreel.github.io), built like a short: each section carries a timecode and a scene mark (HOOK,
POINT, PAYOFF, CTA), the hero headline's dead air is cut to a breath, and every example on the page is a real edit
the app made from an unedited recording.

No build step and no dependencies: `index.html`, `styles.css`, `main.js`, and `data/site-data.js` (the data).

## Run it

```bash
python3 -m http.server 4321   # then open http://localhost:4321
```

Opening `index.html` straight from disk works too.

## The media

`media/` holds 720p web copies (76 MB in all) of the 11 shorts, the raw recordings shown in "raw → edited" and
"before / after", and a poster for each. The 1080p masters are kept outside git (`~/Desktop/landing-shorts/`);
`scripts/make-web-media.sh` makes web copies from masters.

**Before going public:** check you have the rights to every clip (most are stock or downloaded), and that the AI
voices (UPI, 5 AM) are fine to show.

## The data

`data/site-data.js` — the hero short's words as ElevenLabs timed them, the cuts the pacing made in its raw take
(both exported from the app), and the list of shorts. `data/*.json` are the same exports.

## Early-access form

The form posts to `signup-service/` — a small Flask service on Google Cloud Run (`aether-signups`, us-central1,
project `project-512b0c9f-1fbc-4933-866`), running as the `autoedits` service account, so no key file exists anywhere:

- `POST /upload-url` → a 15-minute signed PUT URL into `gs://aether-assets-production/signups/<date>/<id>/…`
  (video/audio/image, ≤ 500 MB); the browser uploads straight to the bucket (its CORS allows PUT from this page only).
- `POST /signup` → one row in the "Aether sign-ups" Google Sheet (shared with the service account as Editor).
- `POST /hit` → one row per visit or click in the Sheet's **Visits** tab, counted **without cookies**: no IP is kept,
  the visitor code is a hash that changes every day, and the country comes from the browser's time zone. The
  **Summary** tab totals them (views, unique visitors per day, clicks, sign-ups, by day / country / source).

Only the page's origins may call it, a hidden `website` field drops bots, and each IP gets a few calls a minute.
Redeploy after a change: `cd signup-service && gcloud run deploy aether-signups --source . --region us-central1`
(the environment variables stay as set).
