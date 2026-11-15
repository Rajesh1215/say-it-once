"""Aether early-access sign-ups: the landing page's form calls this (Cloud Run, running as the autoedits service
account — no key file anywhere).

  POST /upload-url  {name, type, size}            -> {url, path}   a signed PUT URL into the bucket, 15 minutes
  POST /signup      {name, email, phone, makes, posts, recording?, website?}  -> {ok: true}   a row in the Sheet

Only the landing page's origins may call it; a hidden `website` field catches bots; each IP gets a few calls a minute.
Env: BUCKET, SHEET_ID, ALLOWED_ORIGINS (comma-separated), NOTIFY_EMAIL (optional, unused until mail is set up).
"""
from __future__ import annotations

import datetime as dt
import os
import re
import time
import uuid
from collections import defaultdict, deque

import google.auth
from google.auth.transport import requests as grequests
from google.cloud import storage
from googleapiclient.discovery import build
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
sheets = build('sheets', 'v4', credentials=creds, cache_discovery=False)
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
    sheets.spreadsheets().values().append(spreadsheetId=SHEET_ID, range='A1', valueInputOption='RAW',
                                          insertDataOption='INSERT_ROWS', body={'values': [row]}).execute()
    return jsonify({'ok': True})


@app.get('/')
def health():
    return jsonify({'ok': True, 'service': 'aether-signups'})
