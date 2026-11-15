"""Aether early-access sign-ups: the landing page's form calls this (Cloud Run, running as the autoedits service
account — no key file anywhere).

  POST /upload-url  {name, type, size}            -> {url, path}   a signed PUT URL into the bucket, 15 minutes
  POST /signup      {name, email, phone, makes, posts, recording?, website?}  -> {ok: true}   a row in the Sheet

Only the landing page's origins may call it; a hidden `website` field catches bots; each IP gets a few calls a minute.
  POST /hit  {event, ref, utm, tz, lang, screen, path}  -> 204   one cookieless visit/event row in the "Visits" tab

Visits keep no cookie and no IP: a visitor code is a hash of (IP, browser, the day, a secret salt) — unique visitors per
day, nobody recognisable across days. Country comes from the browser's time zone (zone.tab), not from the IP.
Env: BUCKET, SHEET_ID, ALLOWED_ORIGINS (comma-separated), SALT.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import time
import uuid
from collections import defaultdict, deque

import google.auth
from google.auth.transport import requests as grequests
from google.cloud import storage
from google.auth.transport.requests import AuthorizedSession
from flask import Flask, jsonify, request

BUCKET = os.environ.get('BUCKET', 'aether-assets-production')
SHEET_ID = os.environ.get('SHEET_ID', '')
ORIGINS = {o.strip() for o in re.split(r'[,|]', os.environ.get('ALLOWED_ORIGINS', 'https://rajesh1215.github.io')) if o.strip()}
MAX_BYTES = 500 * 1024 * 1024
TYPES = re.compile(r'^(video|audio|image)/[\w.+-]+$')
EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

app = Flask(__name__)
creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/spreadsheets'])
gcs = storage.Client(credentials=creds)
api = AuthorizedSession(creds)                              # requests-based: safe across the server's threads


def append(rng: str, row: list) -> None:
    """One row at the end of a tab (the Sheets API's values.append), tried twice."""
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{rng}:append'
    for attempt in (1, 2):
        r = api.post(url, params={'valueInputOption': 'RAW', 'insertDataOption': 'INSERT_ROWS'}, json={'values': [row]}, timeout=15)
        if r.ok:
            return
        if attempt == 2 or r.status_code < 500:
            raise RuntimeError(f'sheets append {r.status_code}: {r.text[:200]}')
hits: dict[str, deque] = defaultdict(deque)


def limited(limit: int, per: float = 60.0) -> bool:
    ip = (request.headers.get('X-Forwarded-For') or request.remote_addr or '?').split(',')[0].strip()
    q, now = hits[f'{request.path}:{ip}'], time.time()
    while q and now - q[0] > per:
        q.popleft()
    q.append(now)
    return len(q) > limit


@app.after_request
def cors(resp):
    origin = request.headers.get('Origin', '')
    if origin in ORIGINS:
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        resp.headers['Vary'] = 'Origin'
    return resp


def refused(msg: str, code: int = 400):
    return jsonify({'ok': False, 'error': msg}), code


def allowed() -> bool:
    return request.headers.get('Origin', '') in ORIGINS


@app.route('/upload-url', methods=['POST', 'OPTIONS'])
def upload_url():
    if request.method == 'OPTIONS':
        return '', 204
    if not allowed():
        return refused('origin not allowed', 403)
    if limited(20):
        return refused('too many uploads — try again in a minute', 429)
    d = request.get_json(silent=True) or {}
    name, ctype, size = str(d.get('name') or 'file')[:120], str(d.get('type') or ''), int(d.get('size') or 0)
    if not TYPES.match(ctype):
        return refused('only video, audio or image files')
    if not 0 < size <= MAX_BYTES:
        return refused('files up to 500 MB')
    safe = re.sub(r'[^\w.-]+', '_', name).strip('._') or 'file'
    path = f"signups/{dt.date.today().isoformat()}/{uuid.uuid4().hex}/{safe}"
    creds.refresh(grequests.Request())                      # signed through the IAM API: no private key needed
    url = gcs.bucket(BUCKET).blob(path).generate_signed_url(
        version='v4', expiration=dt.timedelta(minutes=15), method='PUT', content_type=ctype,
        service_account_email=creds.service_account_email, access_token=creds.token)
    return jsonify({'ok': True, 'url': url, 'path': path})


@app.route('/signup', methods=['POST', 'OPTIONS'])
def signup():
    if request.method == 'OPTIONS':
        return '', 204
    if not allowed():
        return refused('origin not allowed', 403)
    if limited(5):
        return refused('too many sign-ups — try again in a minute', 429)
    d = request.get_json(silent=True) or {}
    if d.get('website'):                                    # the hidden field: a bot filled it
        return jsonify({'ok': True})
    name, email = str(d.get('name') or '').strip()[:120], str(d.get('email') or '').strip()[:200]
    if not name or not EMAIL.match(email):
        return refused('a name and a valid email, please')
    rec = d.get('recording') or {}
    files = [f"gs://{BUCKET}/{f.get('path')}" for f in (rec.get('files') or []) if str(f.get('path', '')).startswith('signups/')]
    media = [f"gs://{BUCKET}/{f.get('path')}" for f in (rec.get('media') or []) if str(f.get('path', '')).startswith('signups/')]
    row = [dt.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'), name, email, str(d.get('phone') or '')[:40], str(d.get('makes') or '')[:80],
           ', '.join(str(p) for p in (d.get('posts') or []))[:200], 'yes' if (files or rec.get('link')) else '',
           str(rec.get('instructions') or '')[:2000], '\n'.join(files), str(rec.get('link') or '')[:500], '\n'.join(media),
           'yes' if rec.get('consent') else '', (request.headers.get('X-Forwarded-For') or '').split(',')[0][:60]]
    append('Sheet1!A1', row)
    return jsonify({'ok': True})


def _zones() -> dict[str, str]:
    """time zone -> country name, from the tz database's zone.tab and iso3166.tab (the tzdata package)."""
    import importlib.resources as res
    try:
        base = res.files('tzdata').joinpath('zoneinfo')
        names = dict(l.split('\t')[:2] for l in base.joinpath('iso3166.tab').read_text().splitlines() if l and not l.startswith('#'))
        out = {}
        for l in base.joinpath('zone.tab').read_text().splitlines():
            if l and not l.startswith('#'):
                cc, _, tz = l.split('\t')[:3]
                out[tz] = names.get(cc, cc)
        out.update({'Asia/Calcutta': 'India', 'Asia/Kolkata': 'India'})
        return out
    except Exception:
        return {'Asia/Kolkata': 'India', 'Asia/Calcutta': 'India'}


ZONES = _zones()
SALT = os.environ.get('SALT', 'aether')
BOT = re.compile(r'bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|bingpreview|headless', re.I)
EVENTS = {'view', 'cta', 'signup', 'signup_clip', 'more', 'example', 'sound'}


def _device(ua: str) -> tuple[str, str]:
    kind = 'tablet' if re.search(r'iPad|Tablet', ua) else 'phone' if re.search(r'Mobi|Android|iPhone', ua) else 'desktop'
    for name, pat in (('Edge', r'Edg/'), ('Samsung', r'SamsungBrowser'), ('Chrome', r'Chrome/|CriOS'), ('Firefox', r'Firefox/|FxiOS'),
                      ('Safari', r'Safari/'), ('Instagram', r'Instagram'), ('Facebook', r'FBAN|FBAV')):
        if re.search(pat, ua):
            return kind, name
    return kind, 'other'


@app.route('/hit', methods=['POST', 'OPTIONS'])
def hit():
    if request.method == 'OPTIONS':
        return '', 204
    if not allowed() or limited(60):
        return '', 204                                    # a visit we don't count is never an error to the page
    ua = request.headers.get('User-Agent', '')
    if BOT.search(ua) and not request.args.get('test'):
        return '', 204
    try:
        d = json.loads(request.get_data(as_text=True) or '{}')   # sent as text/plain (sendBeacon, no preflight)
    except ValueError:
        return '', 204
    event = str(d.get('event') or 'view')
    if event not in EVENTS:
        return '', 204
    ip = (request.headers.get('X-Forwarded-For') or request.remote_addr or '').split(',')[0].strip()
    day = dt.date.today().isoformat()
    visitor = hashlib.sha256(f'{SALT}|{day}|{ip}|{ua}'.encode()).hexdigest()[:10]
    tz = str(d.get('tz') or '')[:60]
    kind, browser = _device(ua)
    ref = str(d.get('ref') or '')[:200]
    ref = re.sub(r'^https?://(www\.)?', '', ref).split('/')[0] if ref else 'direct'
    row = [dt.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'), day, event, str(d.get('detail') or '')[:80], visitor,
           ZONES.get(tz, 'unknown'), tz, ref, str(d.get('utm') or '')[:120], kind, browser, str(d.get('lang') or '')[:20],
           str(d.get('screen') or '')[:20]]
    try:
        append('Visits!A1', row)
    except Exception:
        app.logger.exception('visit not recorded')
    return '', 204


@app.get('/')
def health():
    return jsonify({'ok': True, 'service': 'aether-signups'})
