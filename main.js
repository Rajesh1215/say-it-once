// Aether Shorts landing — no build step, no dependencies. Data comes from data/site-data.js (window.SITE).
(() => {
  const SITE = window.SITE;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

  // ── visits, counted without cookies: one small beacon per event to our own service (no IP or id kept on this side) ─
  const track = (event, detail = '') => {
    if (!SITE.hitEndpoint) return;
    const q = new URLSearchParams(location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map(k => q.get(k)).filter(Boolean).join(' / ');
    const body = JSON.stringify({ event, detail, ref: document.referrer, utm, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language, screen: `${screen.width}x${screen.height}` });
    try { navigator.sendBeacon(SITE.hitEndpoint, new Blob([body], { type: 'text/plain' })); } catch { /* never in the visitor's way */ }
  };
  track('view');
  // how far they got: scroll depth, the sections they reached, the form, their files, and how long they stayed
  const seen = new Set();
  const once = (key, event, detail) => { if (!seen.has(key)) { seen.add(key); track(event, detail); } };
  let deepest = 0;
  addEventListener('scroll', () => {
    const d = (scrollY + innerHeight) / document.documentElement.scrollHeight;
    deepest = Math.max(deepest, d);
    [25, 50, 75, 100].forEach(m => { if (d >= m / 100 - 0.02) once(`s${m}`, 'scroll', `${m}%`); });
  }, { passive: true });
  const sections = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) once(`sec-${e.target.id}`, 'section', e.target.id); }), { threshold: 0.35 });
  ['pairs', 'does', 'looks', 'access'].forEach(id => { const el = document.getElementById(id); if (el) sections.observe(el); });
  const started = Date.now();
  addEventListener('pagehide', () => track('leave', `${Math.round((Date.now() - started) / 1000)} s · ${Math.round(deepest * 100)}% down`));
  document.addEventListener('click', e => { if (e.target.closest('a[href="#access"]')) track('cta'); });

  // every muted preview plays only while it is on screen (light on a phone; muted autoplay is allowed everywhere)
  const watch = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.4 && !reduced) v.play().catch(() => {});
    else if (v.muted) v.pause();
  }), { threshold: [0, 0.4] });
  const autoplay = root => root.querySelectorAll('video[data-auto]').forEach(v => watch.observe(v));

  // ── one sound on the page at a time: a voice note, or one short's sound ────────────────────────────
  let soundOn = null;                                    // { stop }
  const quiet = () => { soundOn?.stop(); soundOn = null; };
  const playAudio = (url, btn) => {
    if (soundOn?.btn === btn) { quiet(); return; }
    quiet();
    const a = new Audio(url);
    const stop = () => { a.pause(); btn.setAttribute('aria-pressed', 'false'); };
    soundOn = { btn, stop };
    btn.setAttribute('aria-pressed', 'true');
    a.addEventListener('ended', () => { if (soundOn?.btn === btn) quiet(); });
    a.play().catch(stop);
  };
  const toggleVideoSound = (video, btn) => {
    if (soundOn?.btn === btn) { quiet(); return; }
    quiet();
    video.muted = false; video.play().catch(() => {}); track('sound');
    btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Sound on';
    soundOn = { btn, stop: () => { video.muted = true; btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Sound off'; } };
  };

  // ── HOOK: the dead air between the words, cut to a breath ──────────────────────────────────────────
  const cutline = $('.cutline');
  cutline.querySelectorAll('.gap').forEach(g => {
    const len = Number(g.dataset.from);
    g.style.setProperty('--len', String(len));
    g.dataset.label = `${len.toFixed(2)} s`;
  });
  const cut = () => cutline.classList.add('cut-done');
  if (reduced) cut(); else setTimeout(cut, 1300);
  cutline.addEventListener('click', () => { cutline.classList.remove('cut-done'); setTimeout(cut, 900); });

  // ── HOOK: the words as said, under the hero short ──────────────────────────────────────────────────
  const hero = $('#hero-video'), ticker = $('#ticker');
  const words = SITE.heroWords.words || [];
  const row = document.createElement('div');
  row.className = 'ticker-row';
  row.innerHTML = words.map(w => `<span>${esc(w.t)}</span>`).join('');
  ticker.appendChild(row);
  const spans = [...row.children];
  let last = -1;
  (function follow() {
    const t = hero.currentTime;
    let i = -1;
    for (let k = 0; k < words.length; k++) { if (words[k].s <= t + 0.02) i = k; else break; }
    if (i !== last) {
      spans.forEach((s, k) => { s.className = k === i ? 'now' : k < i ? 'said' : ''; });
      const el = spans[Math.max(0, i)];
      if (el) row.style.transform = `translateX(${-(el.offsetLeft + el.offsetWidth / 2)}px)`;
      last = i;
    }
    requestAnimationFrame(follow);
  })();
  hero.dataset.auto = '';
  watch.observe(hero);
  const heroSound = $('.sound');
  heroSound.addEventListener('click', () => toggleVideoSound(hero, heroSound));

  // ── a voice recording's real waveform, drawn from the file ─────────────────────────────────────────
  async function drawWave(canvas, url) {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
      const ch = buf.getChannelData(0), w = canvas.width = Math.max(60, canvas.clientWidth * 2), h = canvas.height = Math.max(20, canvas.clientHeight * 2);
      const g = canvas.getContext('2d'), step = Math.max(1, Math.floor(ch.length / w));
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
      for (let x = 0; x < w; x += 3) {
        let m = 0;
        for (let i = x * step; i < (x + 1) * step && i < ch.length; i += 8) m = Math.max(m, Math.abs(ch[i]));
        const bh = Math.max(2, m * h * 0.95);
        g.fillRect(x, (h - bh) / 2, 2, bh);
      }
      return buf.duration;
    } catch { return null; }
  }
  const waveWatch = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    waveWatch.unobserve(e.target);
    drawWave(e.target, e.target.dataset.wave).then(d => {
      const tag = e.target.parentElement.querySelector('[data-len]');
      if (d && tag) tag.textContent = mmss(d);
    });
  }));

  // ── an example: what came in · what it was told · what came out ─────────────────────────────────────
  const rawSide = e => {
    if (e.kind === 'audio') return `<div class="notes">${e.raw.map((u, k) => `
      <div class="note"><button type="button" aria-pressed="false" data-audio="${u}" aria-label="Play ${e.raw.length > 1 ? `voice note ${k + 1}` : 'the recording'}">▶</button>
      <canvas data-wave="${u}"></canvas><span data-len>${e.raw.length > 1 ? `note ${k + 1}` : 'voice'}</span></div>`).join('')}</div>`;
    if (e.kind === 'pile') {
      // the takes scattered like a handful of clips, the same way every time (seeded)
      const r = k => { const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
      return `<div class="pile" aria-label="${e.raw.length} takes">${e.raw.map((u, k) => {
        const x = 4 + r(k) * 38, y = 2 + (k / (e.raw.length - 1)) * 68 + (r(k + 40) - .5) * 6, rot = (r(k + 80) - .5) * 22;
        const sx = 4 + (k % 3) * 20, sy = 2 + Math.floor(k / 3) * 17;
        return `<img src="${u}" alt="" loading="lazy" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;z-index:${k};transform:rotate(${rot.toFixed(1)}deg);--spread:translate(${(sx - x).toFixed(1)}%, ${(sy - y).toFixed(1)}%) rotate(0deg) scale(.7)" />`;
      }).join('')}<span class="count">${e.raw.length} takes</span></div>`;
    }
    return `<div class="raw-frame${e.wide ? ' wide' : ''}"><video src="${e.raw}" poster="${e.poster}" muted loop playsinline preload="none" data-auto></video><span class="stamp">raw</span></div>`;
  };
  const told = e => e.instructions
    ? `<div class="told"><span class="k">What it was told</span><q>${esc(e.instructions)}</q>${e.media.length ? `<span class="k">Their own media</span>
        <div class="chips">${e.media.map(m => `<span class="chip"><img src="${m.src}" alt="" />${esc(m.label)}</span>`).join('')}</div>` : ''}</div>`
    : `<div class="told none"><span class="k">What it was told</span><span>Nothing — the planner chose.</span></div>`;
  const example = (e, full = false) => `
    <article class="pair">
      <div class="side raw"><span class="label">In · ${esc(e.rawLabel)}</span>${rawSide(e)}</div>
      <div class="arrow">
        <div class="times"><span>${e.from} <small>in</small></span><span>${e.to} <small>out</small></span></div>
        <svg viewBox="0 0 240 56" aria-hidden="true"><path d="M6 28 C 70 0, 160 56, 226 28" /><path class="head" d="M214 20 L230 28 L216 38" /></svg>
        ${told(e)}
        <ul class="did">${e.did.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
        <span class="tag look-tag">${e.look} look</span>
      </div>
      <div class="side edited"><span class="label">Out · the short</span>
        <div class="phone"><video src="media/${e.id}.mp4" poster="media/${e.id}.jpg" muted loop playsinline preload="${full ? 'auto' : 'none'}" ${full ? 'controls' : 'data-auto'}></video>
        ${full ? '' : '<button class="mute" type="button" aria-pressed="false">Sound off</button>'}</div></div>
    </article>`;
  const wire = root => {
    autoplay(root);
    root.querySelectorAll('[data-audio]').forEach(b => b.addEventListener('click', () => playAudio(b.dataset.audio, b)));
    root.querySelectorAll('canvas[data-wave]').forEach(c => waveWatch.observe(c));
    root.querySelectorAll('.mute').forEach(b => b.addEventListener('click', () => toggleVideoSound(b.parentElement.querySelector('video'), b)));
  };

  // ── POINT: the first few examples, the rest behind "View more" ─────────────────────────────────────
  const list = $('#pair-list'), more = $('#more');
  const shown = SITE.shown || 3;
  list.innerHTML = SITE.examples.slice(0, shown).map(e => example(e)).join('');
  wire(list);
  more.textContent = `View ${SITE.examples.length - shown} more examples`;
  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') === 'true';
    if (!open) track('more');
    if (!open) {
      const extra = document.createElement('div');
      extra.className = 'pair-list extra'; extra.id = 'pair-extra';
      extra.innerHTML = SITE.examples.slice(shown).map(e => example(e)).join('');
      list.after(extra); wire(extra);
      more.textContent = 'Show fewer'; more.setAttribute('aria-expanded', 'true');
    } else {
      $('#pair-extra')?.remove(); quiet();
      more.textContent = `View ${SITE.examples.length - shown} more examples`; more.setAttribute('aria-expanded', 'false');
      list.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
    }
  });

  // ── PAYOFF: every finished short; tap one for in · told · out ───────────────────────────────────────
  const reel = $('#reel');
  reel.innerHTML = SITE.examples.map(e => `
    <button class="reel-item" type="button" data-id="${e.id}" aria-label="${esc(e.topic)}, ${e.look} look: see the raw recording, the instructions and the short">
      <div class="phone"><video src="media/${e.id}.mp4" poster="media/${e.id}.jpg" muted loop playsinline preload="none" data-auto></video></div>
      <span class="look">${e.look}<em>${esc(e.rawLabel)}</em></span>
      <span class="what">${esc(e.topic)} · ${Math.round(e.len)} s</span>
    </button>`).join('');
  autoplay(reel);

  const detail = $('#detail'), body = $('#detail-body');
  let opener = null;
  const closeDetail = () => { quiet(); body.querySelectorAll('video').forEach(v => v.pause()); body.innerHTML = ''; detail.hidden = true; document.body.style.overflow = ''; opener?.focus(); };
  reel.addEventListener('click', ev => {
    const item = ev.target.closest('.reel-item');
    if (!item) return;
    const e = SITE.examples.find(x => x.id === item.dataset.id);
    opener = item; quiet(); track('example', e.id);
    $('#detail-title').textContent = `${e.topic} — ${e.look} look`;
    body.innerHTML = example(e, true);
    wire(body);
    const out = body.querySelector('.edited video');
    out.muted = false;
    detail.hidden = false; document.body.style.overflow = 'hidden';
    $('.close', detail).focus();
    out.play().catch(() => { out.muted = true; out.play().catch(() => {}); });
  });
  $('.close', detail).addEventListener('click', closeDetail);
  detail.addEventListener('click', ev => { if (ev.target === detail) closeDetail(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !detail.hidden) closeDetail(); });

  // ── CTA: early access + an optional clip to edit ────────────────────────────────────────────────────
  const form = $('#access-form'), note = $('#form-note'), submit = $('#submit');
  const MAX_FILE = 500 * 1024 * 1024;
  const listFiles = (input, el) => {
    el.innerHTML = [...input.files].map(f => `<li>${esc(f.name)} · ${(f.size / 1048576).toFixed(1)} MB${f.size > MAX_FILE ? ' — too big (500 MB max)' : ''}</li>`).join('');
  };
  [['recording', '#files-recording', '#drop'], ['media', '#files-media', '#drop-media']].forEach(([name, el, drop]) => {
    const input = form.elements[name], zone = $(drop);
    input.addEventListener('change', () => listFiles(input, $(el)));
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, () => zone.classList.add('over')));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('over')));
  });
  // the form: that they began (which field — never what they typed), and the files they picked
  form.addEventListener('focusin', e => { const n = e.target.name; if (n && n !== 'website') once(`f-${n}`, 'form', n); });
  ['recording', 'media'].forEach(n => form.elements[n].addEventListener('change', e => {
    const fs = [...e.target.files];
    if (fs.length) track('files', `${n}: ${fs.length} · ${(fs.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1)} MB`);
  }));
  const wantsEdit = () => form.elements.recording.files.length > 0 || form.elements.link.value.trim() !== '';
  const syncButton = () => { submit.textContent = wantsEdit() ? 'Get early access + edit my clip' : 'Get early access'; };
  form.addEventListener('input', syncButton); form.addEventListener('change', syncButton);

  // a file goes straight to storage through a signed URL the upload endpoint hands out
  // a file goes straight to storage through a signed URL the upload endpoint hands out; XHR, so its progress shows
  async function upload(file, onProgress) {
    const r = await fetch(SITE.uploadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', size: file.size }) });
    if (!r.ok) { const m = (await r.json().catch(() => ({}))).error; throw new Error(m || 'upload refused'); }
    const { url, path } = await r.json();
    await new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('PUT', url);
      x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => (x.status >= 200 && x.status < 300 ? res() : rej(new Error('upload failed')));
      x.onerror = () => rej(new Error('upload failed'));
      x.send(file);
    });
    return { name: file.name, path, size: file.size };
  }

  // the button says what is happening: Sending… / Uploading 2 of 3 · 45 %, with a bar under it
  const progress = $('#progress'), bar = $('#progress-bar'), label = $('#progress-label');
  const busy = (text, frac = null) => {
    submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.classList.add('busy');
    submit.innerHTML = `<i class="spin" aria-hidden="true"></i>${esc(text)}`;
    progress.hidden = frac === null; if (frac !== null) { bar.style.width = `${Math.round(frac * 100)}%`; label.textContent = text; }
  };
  const idle = () => { submit.disabled = false; submit.removeAttribute('aria-busy'); submit.classList.remove('busy'); progress.hidden = true; syncButton(); };

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const el = form.elements;
    const name = el['name'].value.trim(), email = el.email.value.trim();
    if (!name) { note.textContent = 'Add your name.'; el['name'].focus(); track('error', 'no name'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'That email doesn’t look right — check it and try again.'; el.email.focus(); track('error', 'bad email'); return; }
    const files = [...el.recording.files, ...el.media.files];
    if (files.some(f => f.size > MAX_FILE)) { note.textContent = 'One of the files is over 500 MB — send a shorter clip or a link.'; return; }
    if (wantsEdit() && !el.consent.checked) { note.textContent = 'To edit your clip, tick the box confirming it’s yours to share.'; el.consent.focus(); track('error', 'no consent'); return; }
    if (!SITE.formEndpoint || (files.length && !SITE.uploadEndpoint)) {
      note.textContent = 'The sign-up isn’t connected yet — set formEndpoint and uploadEndpoint in data/site-data.js.'; return;
    }
    busy('Sending…'); note.textContent = '';
    try {
      const all = wantsEdit() ? [...el.recording.files, ...el.media.files] : [];
      const total = all.reduce((n, f) => n + f.size, 0) || 1;
      let done = 0, k = 0;
      const up = async fs => {
        const out = [];
        for (const f of fs) {
          k++;
          out.push(await upload(f, q => busy(`Uploading ${k} of ${all.length} · ${Math.round(((done + q * f.size) / total) * 100)}%`, (done + q * f.size) / total)));
          done += f.size;
        }
        return out;
      };
      if (all.length) track('upload', `start · ${all.length} file(s) · ${(total / 1048576).toFixed(1)} MB`);
      const recording = wantsEdit() ? {
        files: await up([...el.recording.files]), link: el.link.value.trim(), instructions: el.instructions.value.trim(),
        media: await up([...el.media.files]), consent: el.consent.checked } : null;
      busy('Sending…');
      const payload = { name, email, website: el.website.value, phone: el.phone.value.trim(), makes: el.makes.value,
        posts: [...form.querySelectorAll('input[name="posts"]:checked')].map(x => x.value), recording };
      const r = await fetch(SITE.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(String(r.status));
      track(recording ? 'signup_clip' : 'signup');
      // done: the form gives way to a clear confirmation
      const first = esc(name.split(' ')[0]);
      $('#done').innerHTML = `<span class="tick" aria-hidden="true">✓</span><h3>You’re in, ${first}.</h3>
        <p>${recording ? `We’ve got your clip${all.length > 1 ? 's' : ''}. We’ll edit it and send the short to <b>${esc(email)}</b>.` : `We’ll write to <b>${esc(email)}</b> when you can bring your first recording.`}</p>
        <button class="btn ghost small" type="button" id="again">Send another</button>`;
      idle(); form.hidden = true; $('#done').hidden = false; $('#done').focus();
      $('#again').addEventListener('click', () => { form.reset(); ['#files-recording', '#files-media'].forEach(l => { $(l).innerHTML = ''; }); $('#done').hidden = true; form.hidden = false; idle(); });
    } catch (err) {
      track('error', `send failed: ${String(err && err.message || err).slice(0, 60)}`);
      note.textContent = err && err.message && !/^\d+$/.test(err.message) && !/fetch/i.test(err.message)
        ? `That didn’t go through: ${err.message}.` : 'That didn’t go through — try again in a moment.';
      idle();
    }
  });
})();
