// Aether Shorts landing — no build step, no dependencies. Data comes from data/site-data.js (window.SITE).
(() => {
  const SITE = window.SITE;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

  // every preview plays only while it is on screen (a page of many videos stays light, and phones allow muted autoplay)
  const watch = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.4 && !reduced) v.play().catch(() => {});
    else v.pause();
  }), { threshold: [0, 0.4] });
  const autoplay = v => watch.observe(v);

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
  autoplay(hero);
  const sound = $('.sound');
  sound.addEventListener('click', () => {
    hero.muted = !hero.muted;
    sound.setAttribute('aria-pressed', String(!hero.muted));
    sound.textContent = hero.muted ? 'Sound off' : 'Sound on';
    if (!hero.muted) hero.play().catch(() => {});
  });

  // ── a recording's real waveform, drawn from the file (voice notes have no picture to show) ─────────
  async function drawWave(canvas, url) {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
      const ch = buf.getChannelData(0), w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
      const g = canvas.getContext('2d'), step = Math.floor(ch.length / w);
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
  // one sound at a time across the page
  let playingAudio = null;
  const playAudio = (url, btn) => {
    if (playingAudio && playingAudio.btn === btn) { playingAudio.a.pause(); return; }
    if (playingAudio) playingAudio.a.pause();
    const a = new Audio(url);
    playingAudio = { a, btn };
    btn.setAttribute('aria-pressed', 'true');
    a.addEventListener('pause', () => { btn.setAttribute('aria-pressed', 'false'); if (playingAudio?.a === a) playingAudio = null; });
    a.addEventListener('ended', () => a.pause());
    a.play().catch(() => a.pause());
  };

  // ── POINT: raw → edited ─────────────────────────────────────────────────────────────────────────────
  const rawSide = p => {
    if (p.kind === 'audio') return `<div class="notes">${p.raw.map((u, k) => `
      <div class="note"><button type="button" aria-pressed="false" data-audio="${u}" aria-label="Play voice note ${k + 1}">▶</button>
      <canvas data-wave="${u}"></canvas><span data-len="${u}">note ${k + 1}</span></div>`).join('')}</div>`;
    if (p.kind === 'sheet') return `<div class="raw-frame wide"><img src="${p.raw}" alt="The 13 takes, as recorded" loading="lazy" /><span class="stamp">13 takes</span></div>`;
    return `<div class="raw-frame${/clip5/.test(p.id) ? ' wide' : ''}"><video src="${p.raw}" poster="${p.poster}" muted loop playsinline preload="none"></video><span class="stamp">raw</span></div>`;
  };
  $('#pair-list').innerHTML = SITE.pairs.map(p => `
    <article class="pair">
      <div class="side raw"><span class="label">What came in · ${esc(p.rawLabel)}</span>${rawSide(p)}</div>
      <div class="arrow">
        <div class="times"><span>${p.from} <small>recorded</small></span><span>${p.to} <small>short</small></span></div>
        <svg viewBox="0 0 240 56" aria-hidden="true"><path d="M6 28 C 70 0, 160 56, 226 28" /><path class="head" d="M214 20 L230 28 L216 38" /></svg>
        <ul class="did">${p.did.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
        <span class="tag look-tag">${p.look} look</span>
      </div>
      <div class="side edited"><span class="label">What you get</span>
        <div class="phone"><video src="media/${p.id}.mp4" poster="media/${p.id}.jpg" muted loop playsinline preload="none" aria-label="The edited short"></video></div></div>
    </article>`).join('');
  document.querySelectorAll('.pair video').forEach(autoplay);
  document.querySelectorAll('.pair [data-audio]').forEach(b => b.addEventListener('click', () => playAudio(b.dataset.audio, b)));
  const waveWatch = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    waveWatch.unobserve(e.target);
    drawWave(e.target, e.target.dataset.wave).then(d => {
      const tag = document.querySelector(`[data-len="${e.target.dataset.wave}"]`);
      if (d && tag) tag.textContent = mmss(d);
    });
  }));
  document.querySelectorAll('canvas[data-wave]').forEach(c => waveWatch.observe(c));

  // ── POINT: the raw take and its cuts ────────────────────────────────────────────────────────────────
  const { source, cuts } = SITE.heroCuts;
  const track = $('.bar-track'), ruler = $('.bar-ruler'), head = $('.bar-head');
  cuts.forEach(c => {
    const b = document.createElement('b');
    b.style.left = `${(c.s / source) * 100}%`;
    b.style.width = `${((c.e - c.s) / source) * 100}%`;
    b.title = `cut ${(c.e - c.s).toFixed(2)} s`;
    track.appendChild(b);
  });
  [0, 5, 10, 15, 20, source].forEach(s => {
    const span = document.createElement('span');
    span.style.left = `${(s / source) * 100}%`;
    span.textContent = `${Math.round(s)}s`;
    ruler.appendChild(span);
  });
  const why = { lead_trim: 'before the first word', silence_trim: 'a pause between words', tail_trim: 'after the last word', ai_removed: 'a filler or a retake' };
  $('#cut-list').innerHTML = cuts.map(c =>
    `<li><span class="when">${fmt(c.s)}</span><span>${why[c.why] || 'dead air'}</span><span class="len">−${(c.e - c.s).toFixed(2)} s</span></li>`).join('');
  const kept = [];
  let from = 0;
  [...cuts].sort((a, b) => a.s - b.s).forEach(c => { if (c.s > from) kept.push([from, c.s]); from = Math.max(from, c.e); });
  if (from < source) kept.push([from, source]);
  const toSource = t => { let acc = 0; for (const [a, b] of kept) { if (t <= acc + (b - a)) return a + (t - acc); acc += b - a; } return source; };
  const ba = $('#ba-video');
  ba.loop = true;
  let mode = 'raw';
  const SRC = { raw: ['media/raw-clip4.mp4', 'media/raw-clip4.jpg'], edit: ['media/clip4-jewellery-ember.mp4', 'media/clip4-jewellery-ember.jpg'] };
  document.querySelectorAll('.toggle button').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('.toggle button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    [ba.src, ba.poster] = SRC[mode];
    ba.play().catch(() => {});
  }));
  (function playhead() {
    const t = mode === 'raw' ? ba.currentTime : toSource(ba.currentTime);
    head.style.left = `${Math.min(100, (t / source) * 100)}%`;
    requestAnimationFrame(playhead);
  })();
  autoplay(ba);

  // ── POINT: instructions — the line asked for, the moment it made ────────────────────────────────────
  const ins = SITE.instruction;
  $('#ins-said').textContent = ins.said;
  $('#ins-text').innerHTML = esc(ins.text).replace('Show the Google Pay, PhonePe and UPI logos when I say them.', '<mark>Show the Google Pay, PhonePe and UPI logos when I say them.</mark>');
  $('#ins-caption').textContent = `${ins.look} look · ${mmss(ins.from)}–${mmss(ins.to)} of the short: the logos land on “Google Pay” and “PhonePe” as they are said`;
  const insV = $('#ins-video');
  insV.src = `${ins.short}#t=${ins.from}`;
  insV.addEventListener('timeupdate', () => { if (insV.currentTime >= ins.to || insV.currentTime < ins.from - 0.5) insV.currentTime = ins.from; });
  autoplay(insV);
  const insWave = document.createElement('canvas');
  $('.voice-card .wave').appendChild(insWave);
  insWave.dataset.wave = ins.raw;
  waveWatch.observe(insWave);
  $('.voice-play').addEventListener('click', e => playAudio(ins.raw, e.currentTarget));

  // ── PAYOFF: the reel of real edits ──────────────────────────────────────────────────────────────────
  const reel = $('#reel');
  reel.innerHTML = SITE.shorts.map(s => `
    <button class="reel-item" type="button" data-id="${s.id}" aria-label="Watch ${esc(s.topic)}, ${s.look} look, with sound">
      <div class="phone"><video src="media/${s.id}.mp4" poster="media/${s.id}.jpg" muted loop playsinline preload="none"></video></div>
      <span class="look">${s.look}<em>${esc(s.input)}</em></span>
      <span class="what">${esc(s.topic)} · ${Math.round(s.len)} s</span>
    </button>`).join('');
  reel.querySelectorAll('video').forEach(autoplay);

  // the lightbox: a short with sound
  const box = $('#lightbox'), boxVideo = $('#lightbox-video'), boxMeta = $('#lightbox-meta');
  let opener = null;
  const close = () => { boxVideo.pause(); boxVideo.removeAttribute('src'); boxVideo.load(); box.hidden = true; opener?.focus(); };
  reel.addEventListener('click', e => {
    const item = e.target.closest('.reel-item');
    if (!item) return;
    const s = SITE.shorts.find(x => x.id === item.dataset.id);
    opener = item;
    boxVideo.src = `media/${s.id}.mp4`; boxVideo.poster = `media/${s.id}.jpg`;
    boxMeta.textContent = `${s.topic} — ${s.look} look · from ${s.input.toLowerCase()} · ${s.len.toFixed(1)} s`;
    box.hidden = false;
    $('.close', box).focus();
    boxVideo.play().catch(() => {});
  });
  $('.close', box).addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });

  // ── CTA: early access + an optional clip to edit ────────────────────────────────────────────────────
  const form = $('#access-form'), note = $('#form-note'), submit = $('#submit');
  $('#look-select').insertAdjacentHTML('beforeend', SITE.looks.map(l => `<option>${l}</option>`).join(''));
  const MAX_FILE = 500 * 1024 * 1024;
  const listFiles = (input, list) => {
    list.innerHTML = [...input.files].map(f => `<li>${esc(f.name)} · ${(f.size / 1048576).toFixed(1)} MB${f.size > MAX_FILE ? ' — too big (500 MB max)' : ''}</li>`).join('');
  };
  [['recording', '#files-recording', '#drop'], ['media', '#files-media', '#drop-media']].forEach(([name, list, drop]) => {
    const input = form.elements[name], zone = $(drop);
    input.addEventListener('change', () => listFiles(input, $(list)));
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, () => zone.classList.add('over')));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('over')));
  });
  const wantsEdit = () => form.recording.files.length > 0 || form.link.value.trim() !== '';
  const syncButton = () => { submit.textContent = wantsEdit() ? 'Get early access + edit my clip' : 'Get early access'; };
  form.addEventListener('input', syncButton); form.addEventListener('change', syncButton);

  // a file goes straight to storage through a signed URL the upload endpoint hands out (it never passes this page's server)
  async function upload(file) {
    const r = await fetch(SITE.uploadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', size: file.size }) });
    if (!r.ok) throw new Error('upload refused');
    const { url, path } = await r.json();
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!put.ok) throw new Error('upload failed');
    return { name: file.name, path, size: file.size };
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nameInput = form.elements['name'];               // (form.name is the form's own name attribute)
    const name = nameInput.value.trim(), email = form.email.value.trim();
    if (!name) { note.textContent = 'Add your name.'; nameInput.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'That email doesn’t look right — check it and try again.'; form.email.focus(); return; }
    const files = [...form.recording.files, ...form.media.files];
    if (files.some(f => f.size > MAX_FILE)) { note.textContent = 'One of the files is over 500 MB — send a shorter clip or a link.'; return; }
    if (wantsEdit() && !form.consent.checked) { note.textContent = 'To edit your clip, tick the box confirming it’s yours to share.'; form.consent.focus(); return; }
    if (!SITE.formEndpoint || (files.length && !SITE.uploadEndpoint)) {
      note.textContent = 'The sign-up isn’t connected yet — set formEndpoint and uploadEndpoint in data/site-data.js.'; return;
    }
    submit.disabled = true;
    try {
      const up = async list => { const out = []; for (const f of list) { note.textContent = `Uploading ${f.name}…`; out.push(await upload(f)); } return out; };
      const recording = wantsEdit() ? {
        files: await up([...form.recording.files]), link: form.link.value.trim(), instructions: form.instructions.value.trim(),
        media: await up([...form.media.files]), look: form.look.value || 'you choose', consent: form.consent.checked } : null;
      const body = { name, email, phone: form.phone.value.trim(), makes: form.makes.value,
        posts: [...form.querySelectorAll('input[name="posts"]:checked')].map(x => x.value), recording };
      const r = await fetch(SITE.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      note.textContent = recording ? `You’re in, ${name.split(' ')[0]}. We’ll edit your clip and write to ${email}.` : `You’re on the list. We’ll write to ${email}.`;
      form.reset(); ['#files-recording', '#files-media'].forEach(l => { $(l).innerHTML = ''; }); syncButton();
    } catch {
      note.textContent = 'That didn’t go through — try again in a moment.';
    } finally { submit.disabled = false; }
  });
})();
