// Aether Shorts landing — no build step, no dependencies. Data comes from data/site-data.js (window.SITE).
(() => {
  const SITE = window.SITE || { heroWords: { words: [] }, heroCuts: { source: 1, cuts: [] }, shorts: [] };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

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
  row.innerHTML = words.map(w => `<span>${w.t.replace(/[<>&]/g, '')}</span>`).join('');
  ticker.appendChild(row);
  const spans = [...row.children];
  let last = -1;
  const follow = () => {
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
  };
  requestAnimationFrame(follow);
  const sound = $('.sound');
  sound.addEventListener('click', () => {
    hero.muted = !hero.muted;
    sound.setAttribute('aria-pressed', String(!hero.muted));
    sound.textContent = hero.muted ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-label', hero.muted ? 'Sound on' : 'Sound off');
    if (!hero.muted) hero.play().catch(() => {});
  });

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

  // what the edit keeps of the raw take, so the edited short's time can be shown on the raw bar
  const kept = [];
  let from = 0;
  [...cuts].sort((a, b) => a.s - b.s).forEach(c => { if (c.s > from) kept.push([from, c.s]); from = Math.max(from, c.e); });
  if (from < source) kept.push([from, source]);
  const toSource = t => { let acc = 0; for (const [a, b] of kept) { if (t <= acc + (b - a)) return a + (t - acc); acc += b - a; } return source; };

  const ba = $('#ba-video');
  ba.loop = true;
  let mode = 'raw';
  const SRC = { raw: 'media/raw-clip4.mp4', edit: 'media/clip4-jewellery-ember.mp4' };
  const POSTER = { raw: 'media/raw-clip4.jpg', edit: 'media/clip4-jewellery-ember.jpg' };
  document.querySelectorAll('.toggle button').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('.toggle button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    ba.src = SRC[mode]; ba.poster = POSTER[mode];
    ba.play().catch(() => {});
  }));
  const playhead = () => {
    const t = mode === 'raw' ? ba.currentTime : toSource(ba.currentTime);
    head.style.left = `${Math.min(100, (t / source) * 100)}%`;
    requestAnimationFrame(playhead);
  };
  requestAnimationFrame(playhead);

  // ── PAYOFF: the reel of real edits ──────────────────────────────────────────────────────────────────
  const reel = $('#reel');
  reel.innerHTML = SITE.shorts.map(s => `
    <button class="reel-item" type="button" data-id="${s.id}" aria-label="Watch ${s.topic}, ${s.look} look, with sound">
      <div class="phone"><video src="media/${s.id}.mp4" poster="media/${s.id}.jpg" muted loop playsinline preload="none"></video></div>
      <span class="look">${s.look}<em>${s.input}</em></span>
      <span class="what">${s.topic} · ${Math.round(s.len)} s</span>
    </button>`).join('');

  // ── every preview plays only while it is on screen (a page of eleven videos stays light) ───────────
  const watch = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.4 && !reduced) v.play().catch(() => {});
    else v.pause();
  }), { threshold: [0, 0.4] });
  document.querySelectorAll('#hero-video, #ba-video, .input-card video, .reel video').forEach(v => watch.observe(v));
  if (reduced) { hero.pause(); }

  // ── the lightbox: a short with sound ────────────────────────────────────────────────────────────────
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

  // ── CTA: early access. Posts to SITE.formEndpoint when one is set (see README); until then it says so ─
  const form = $('#access-form'), note = $('#form-note');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'That email doesn’t look right — check it and try again.'; return; }
    if (!SITE.formEndpoint) { note.textContent = 'The sign-up isn’t connected yet — set formEndpoint in data/site-data.js.'; return; }
    try {
      const r = await fetch(SITE.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!r.ok) throw new Error(String(r.status));
      note.textContent = `You’re on the list. We’ll write to ${email}.`;
      form.reset();
    } catch {
      note.textContent = 'That didn’t go through — try again in a moment.';
    }
  });
})();
