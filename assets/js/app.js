// ماه طلا: جریان صفحه‌ها (شروع ← دوربین یا گالری ← امتحان) و اتصال همه‌چیز.
import { loadHandModel, detectHands } from './hand.js';
import { pickHand, isDorsal, fingerGeometry, loadRing, drawRing } from './tryon.js';

const $ = (s) => document.querySelector(s);
const views = { start: $('#view-start'), camera: $('#view-camera'), tryon: $('#view-try') };
const canvas = $('#canvas');
const MAX_SIDE = 1600;

const state = {
  photo: null,      // بوم عکس کاربر (فقط داخل مرورگر)
  hand: null,
  geom: null,
  finger: 'ring',
  ring: null,
  rings: [],
  scale: 1,
  shift: 0,
  token: 0,         // برای نادیده‌گرفتن نتیجه‌ی قدیمی وقتی کاربر عکس جدید می‌دهد
};
if (location.search.includes('debug')) window.__mt = state;

// ---------- صفحه‌ها ----------
function show(name) {
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  $('#btn-back').hidden = name === 'start';
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function setStatus(text, retry) {
  const box = $('#status');
  if (!text) { box.hidden = true; return; }
  $('#status-text').textContent = text;
  $('#btn-status-retry').hidden = !retry;
  box.hidden = false;
}

// ---------- عکس ----------
function toWorkingCanvas(src, w, h) {
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function fileToCanvas(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const c = toWorkingCanvas(bmp, bmp.width, bmp.height);
    bmp.close && bmp.close();
    return c;
  } catch (_) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return toWorkingCanvas(img, img.naturalWidth, img.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// ---------- کشیدن ----------
function paint() {
  if (!state.photo) return;
  canvas.width = state.photo.width;
  canvas.height = state.photo.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(state.photo, 0, 0);
  if (state.geom && state.ring) drawRing(ctx, state.ring, state.geom, { scale: state.scale, shift: state.shift });
}

function computeGeometry() {
  state.geom = state.hand ? fingerGeometry(state.hand, state.finger, state.photo) : null;
  paint();
}

// ---------- پردازش عکس ----------
async function handlePhoto(photo) {
  const token = ++state.token;
  state.photo = photo; state.hand = null; state.geom = null;
  state.finger = 'ring'; state.scale = 1; state.shift = 0;
  $('#size').value = 100; $('#shift').value = 0;
  document.querySelector('input[name="finger"][value="ring"]').checked = true;
  $('#controls').hidden = true;
  show('tryon');
  paint();
  setStatus('در حال پیدا کردن دست. اولین بار چند ثانیه طول می‌کشه.');
  try {
    const hands = await detectHands(photo);
    if (token !== state.token) return;
    const hand = pickHand(hands, photo.width, photo.height);
    if (!hand) { setStatus('دست پیدا نشد. توی نور روشن‌تر و با دست باز دوباره عکس بگیرید.', true); return; }
    state.hand = hand;
    if (!state.ring) await selectRing(state.rings[0]);
    computeGeometry();
    setStatus('');
    // اگر کف دست دیده می‌شود، انگشتر هنوز نشان داده می‌شود ولی راهنمایی می‌کنیم
    $('#notice').hidden = isDorsal(hand, photo.width, photo.height) !== false;
    $('#controls').hidden = false;
  } catch (err) {
    console.error(err);
    if (token !== state.token) return;
    setStatus('آماده‌سازی انجام نشد. اینترنتتون رو چک کنید و صفحه رو رفرش کنید.', true);
  }
}

async function selectRing(def) {
  if (!def) return;
  if (!def.loaded) def.loaded = await loadRing(def);
  state.ring = def.loaded;
}

// ---------- ورودی‌ها ----------
async function onFile(file) {
  if (!file) return;
  try {
    handlePhoto(await fileToCanvas(file));
  } catch (err) {
    console.error(err);
    toast('این عکس باز نشد. یه عکس دیگه انتخاب کنید.');
  }
}

$('#btn-gallery').addEventListener('click', () => { loadHandModel().catch(() => {}); $('#file-gallery').click(); });
$('#file-gallery').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; onFile(f); });
$('#file-camera').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; onFile(f); });

// دوربین زنده با کادر راهنما. اگر نشد، دوربین خود گوشی باز می‌شود.
let stream = null;
function stopCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  $('#video').srcObject = null;
}
$('#btn-camera').addEventListener('click', async () => {
  loadHandModel().catch(() => {});
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#file-camera').click(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    const video = $('#video');
    video.srcObject = stream;
    await video.play();
    show('camera');
  } catch (err) {
    stopCamera();
    $('#file-camera').click();
  }
});
$('#btn-cam-close').addEventListener('click', () => { stopCamera(); show('start'); });
$('#btn-shot').addEventListener('click', () => {
  const v = $('#video');
  if (!v.videoWidth) return;
  const shot = toWorkingCanvas(v, v.videoWidth, v.videoHeight);
  stopCamera();
  handlePhoto(shot);
});

function toStart() { state.token++; stopCamera(); state.photo = null; show('start'); }
$('#btn-back').addEventListener('click', toStart);
$('#btn-new').addEventListener('click', toStart);
$('#btn-status-retry').addEventListener('click', toStart);

// ---------- کنترل‌ها ----------
document.querySelectorAll('input[name="finger"]').forEach((el) => {
  el.addEventListener('change', () => { state.finger = el.value; state.shift = 0; $('#shift').value = 0; computeGeometry(); });
});
$('#size').addEventListener('input', (e) => { state.scale = Number(e.target.value) / 100; paint(); });
$('#shift').addEventListener('input', (e) => { state.shift = Number(e.target.value) / 100; paint(); });

function buildRingTiles(list) {
  const box = $('#rings');
  box.textContent = '';
  list.forEach((r, i) => {
    const label = document.createElement('label');
    label.className = 'rop';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'ring'; input.value = r.id; input.checked = i === 0;
    const tile = document.createElement('span');
    tile.className = 'tile';
    const img = document.createElement('img');
    img.src = r.thumbUrl; img.alt = ''; img.loading = 'lazy';
    const name = document.createElement('span');
    name.textContent = r.name;
    tile.append(img, name);
    label.append(input, tile);
    input.addEventListener('change', async () => { await selectRing(r); paint(); });
    box.append(label);
  });
}

async function save() {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) { toast('ذخیره نشد. دوباره بزنید.'); return; }
  const file = new File([blob], 'mah-tala.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'mah-tala.png';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('عکس ذخیره شد.');
}
$('#btn-save').addEventListener('click', save);

// ---------- شروع ----------
(async function init() {
  try {
    const res = await fetch('assets/rings/rings.json');
    const data = await res.json();
    state.rings = data.rings.map((r) => ({
      ...r,
      faceUrl: new URL('assets/rings/' + r.face, location.href).href,
      thumbUrl: 'assets/rings/' + r.thumb,
    }));
    buildRingTiles(state.rings);
  } catch (err) {
    console.error(err);
  }
  show('start');
})();
