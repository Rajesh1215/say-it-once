# Aether Shorts — landing page

A one-page site for Aether Shorts, built like a short: each section carries a timecode and a scene mark (HOOK,
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

It posts `{ email }` as JSON to `SITE.formEndpoint`. Until that is set (in `data/site-data.js`) it tells the
visitor it isn't connected — connect it to your list (a serverless function, Formspree, a Google Apps Script…)
before launch.
