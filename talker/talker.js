// Talker front end. Three jobs:
//  1. send the text to the local server, get back audio + mouth cues
//  2. play the audio
//  3. on every animation frame, look up which cue the audio is currently in
//     and show that mouth shape
const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 185;

let shapes = {}, cues = [], words = [], duration = 0, lastWord = -1;
const audio = new Audio();

// ---------- placeholder face ----------
const face = $('face');
const el = (name, attrs = {}, parent = face) => {
  const e = document.createElementNS(SVG, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
};
el('ellipse', { cx: 200, cy: 150, rx: 150, ry: 140, fill: 'none', stroke: '#2a2a2a' });
const clip = el('clipPath', { id: 'mouthClip' });
const clipShape = el('ellipse', {}, clip);
const inside = el('g', { 'clip-path': 'url(#mouthClip)' });
const mouthFill = el('ellipse', { fill: '#111' }, inside);
const teethTop = el('rect', { fill: '#fff' }, inside);
const teethBottom = el('rect', { fill: '#fff' }, inside);
const tongue = el('ellipse', { fill: '#E8350A' }, inside);
const lips = el('ellipse', { fill: 'none', stroke: '#fff', 'stroke-width': 3 });

function setShape(name) {
  const s = shapes[name];
  if (!s || setShape.current === name) return;
  setShape.current = name;
  const rx = s.w / 2, ry = s.h / 2;
  for (const e of [clipShape, mouthFill, lips]) { e.setAttribute('cx', CX); e.setAttribute('cy', CY); e.setAttribute('rx', rx); e.setAttribute('ry', ry); }
  const tt = s.teethTop || 0, tb = s.teethBottom || 0;
  Object.entries({ x: CX - rx, width: s.w }).forEach(([k, v]) => { teethTop.setAttribute(k, v); teethBottom.setAttribute(k, v); });
  teethTop.setAttribute('y', CY - ry); teethTop.setAttribute('height', tt);
  teethBottom.setAttribute('y', CY + ry - tb); teethBottom.setAttribute('height', tb);
  tongue.setAttribute('display', s.tongue ? 'inline' : 'none');
  if (s.tongue) {
    tongue.setAttribute('cx', CX); tongue.setAttribute('rx', rx * 0.55); tongue.setAttribute('ry', ry * 0.4);
    tongue.setAttribute('cy', s.tongue === 'up' ? CY - ry + tt + ry * 0.3 : CY + ry * 0.6);
  }
  document.querySelectorAll('#shapes button').forEach(b => b.classList.toggle('on', b.dataset.shape === name));
}

// ---------- playback loop ----------
function frame() {
  if (cues.length && !audio.paused) {
    const t = audio.currentTime + $('lead').value / 1000;
    setShape(cueAt(t)?.shape ?? 'rest');
  }
  if (duration) {
    $('playhead').style.left = (audio.currentTime / duration * 100) + '%';
    highlightWord(audio.currentTime);
  }
  requestAnimationFrame(frame);
}

// Binary search: the cue whose start <= t < end.
function cueAt(t) {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < cues[mid].start) hi = mid - 1;
    else if (t >= cues[mid].end) lo = mid + 1;
    else return cues[mid];
  }
  return null;
}

function highlightWord(t) {
  let idx = -1;
  for (let i = 0; i < words.length; i++) if (words[i].start <= t) idx = i; else break;
  if (idx === lastWord) return;
  const spans = $('words').querySelectorAll('.w');
  if (spans[lastWord]) spans[lastWord].classList.remove('on');
  if (spans[idx]) spans[idx].classList.add('on');
  lastWord = idx;
}

// ---------- UI ----------
function renderResult(r) {
  cues = r.cues; words = r.words; duration = r.duration; lastWord = -1;
  const tl = $('timeline');
  tl.querySelectorAll('.cue, .run').forEach(n => n.remove());
  for (const c of cues) {
    const d = document.createElement('div');
    d.className = 'cue' + (c.shape === 'rest' ? ' rest' : '');
    d.style.left = (c.start / duration * 100) + '%';
    d.style.width = ((c.end - c.start) / duration * 100) + '%';
    d.title = `${c.shape}  ${c.start.toFixed(2)}–${c.end.toFixed(2)}s`;
    d.textContent = shapes[c.shape]?.label ?? c.shape;
    tl.appendChild(d);
  }
  for (const run of r.speechRuns) {
    const d = document.createElement('div');
    d.className = 'run';
    d.style.left = (run.start / duration * 100) + '%';
    d.style.width = ((run.end - run.start) / duration * 100) + '%';
    tl.appendChild(d);
  }
  $('words').replaceChildren(...words.flatMap(w => {
    const s = document.createElement('span');
    s.className = 'w'; s.textContent = w.text;
    return [s, document.createTextNode(' ')];
  }));
}

function status(msg, err = false) { $('status').textContent = msg; $('status').className = err ? 'err' : ''; }

async function speak() {
  $('speak').disabled = true;
  audio.pause();
  status('Generating speech…');
  try {
    const res = await fetch('api/speak', { method: 'POST', body: JSON.stringify({
      text: $('text').value, voice: $('voice').value, rate: +$('rate').value, backend: $('backend').value }) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error);
    // Download the audio fully first so seeking works and playback is instant.
    const blob = await (await fetch(r.audioUrl)).blob();
    audio.src = URL.createObjectURL(blob);
    renderResult(r);
    status([`${r.duration.toFixed(1)} s · ${r.cues.length} mouth cues · timing: ${r.backend} (${r.timingMs} ms)`, ...r.notes].join(' · '));
    $('toggle').disabled = $('restart').disabled = false;
    await audio.play().catch(() => status('Press Restart to play.'));
  } catch (e) {
    status(e.message, true);
  }
  $('speak').disabled = false;
}

// Pre-recorded mode (the public site): no server, so the audio and the cues for
// every backend were generated ahead of time (scripts/export-static.mjs).
// Changing backend just swaps the cues; the audio keeps playing.
let samples = [], loadedSample = null;
async function playStatic(restart = true) {
  const id = $('sample').value;
  const r = await (await fetch(`samples/${id}/${$('backend').value}.json`)).json();
  if (loadedSample !== id) {
    audio.src = URL.createObjectURL(await (await fetch(r.audioUrl)).blob());
    loadedSample = id;
  }
  renderResult(r);
  status(`${r.duration.toFixed(1)} s · ${r.cues.length} mouth cues · timing: ${r.backend}`);
  $('toggle').disabled = $('restart').disabled = false;
  if (restart) { audio.currentTime = 0; await audio.play().catch(() => status('Press Restart to play.')); }
}

async function init() {
  shapes = (await (await fetch('config/mouth-shapes.json')).json()).shapes;
  for (const [name, s] of Object.entries(shapes)) {
    const b = document.createElement('button');
    b.textContent = s.label; b.dataset.shape = name;
    b.onclick = () => { audio.pause(); setShape(name); };
    $('shapes').appendChild(b);
  }
  setShape('rest');

  // Is the local helper server there? If not, fall back to pre-recorded mode.
  let voices = null;
  try { const res = await fetch('api/voices'); if (res.ok) voices = await res.json(); } catch {}

  if (voices) {
    $('voice').innerHTML = voices.map(v => `<option value="${v.name}">${v.name} (${v.locale})</option>`).join('');
    $('voice').value = voices.find(v => v.name === 'Samantha')?.name ?? voices[0]?.name;
    $('file').onchange = async e => { const f = e.target.files[0]; if (f) $('text').value = await f.text(); };
    $('speak').onclick = speak;
  } else {
    document.body.className = 'static';
    samples = await (await fetch('samples/index.json')).json();
    $('sample').innerHTML = samples.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    const showText = () => { $('text').value = samples.find(s => s.id === $('sample').value).text; };
    showText();
    $('text').readOnly = true;
    $('speak').textContent = 'Play';
    $('speak').onclick = () => playStatic(true);
    $('sample').onchange = () => { audio.pause(); showText(); playStatic(true); };
    $('backend').onchange = () => { if (loadedSample) playStatic(false); };
  }
  $('toggle').onclick = () => audio.paused ? audio.play() : audio.pause();
  $('restart').onclick = () => { audio.currentTime = 0; audio.play(); };
  $('lead').oninput = e => { $('leadval').textContent = e.target.value; };
  $('timeline').onclick = e => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = (e.clientX - r.left) / r.width * duration;
  };
  audio.onpause = () => { $('toggle').textContent = 'Play'; };
  audio.onplay = () => { $('toggle').textContent = 'Pause'; };
  audio.onended = () => setShape('rest');
  frame();
}
init();
