// هندسه‌ی انگشت و کشیدن انگشتر روی عکس.
// هیچ عددی از جنس قیمت/اندازه‌ی واقعی اینجا نیست؛ فقط نسبت‌های ظاهری.

// شماره‌ی نقطه‌ها در مدل دست: ۰ مچ، ۱–۴ شست، ۵–۸ اشاره، ۹–۱۲ وسط، ۱۳–۱۶ حلقه، ۱۷–۲۰ کوچک.
// mcp = مفصل کنار کف دست، pip = مفصل بعدی. t = جای معمول انگشتر روی این بند (۰ تا ۱).
// wf = ضریب پهنای انگشت نسبت به عرض کف دست.
export const FINGERS = {
  thumb:  { mcp: 2,  pip: 3,  t: 0.55, wf: 1.15, lenW: 1.30, nbr: null,    pf: 1.00 },
  index:  { mcp: 5,  pip: 6,  t: 0.46, wf: 1.00, lenW: 1.00, nbr: [9],     pf: 0.92 },
  middle: { mcp: 9,  pip: 10, t: 0.46, wf: 1.00, lenW: 1.00, nbr: [5, 13], pf: 0.90 },
  ring:   { mcp: 13, pip: 14, t: 0.46, wf: 0.95, lenW: 1.00, nbr: [9, 17], pf: 0.90 },
  pinky:  { mcp: 17, pip: 18, t: 0.48, wf: 0.80, lenW: 0.85, nbr: [13],    pf: 0.80 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pt = (hand, i, w, h) => ({ x: hand.pts[i].x * w, y: hand.pts[i].y * h });

// بزرگ‌ترین دستِ پیداشده
export function pickHand(hands, w, h) {
  let best = null, bestArea = -1;
  for (const hd of hands) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of hd.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const area = (x1 - x0) * w * (y1 - y0) * h;
    if (area > bestArea) { best = hd; bestArea = area; }
  }
  return best;
}

// پشت دست دیده می‌شود یا کف دست؟ از جهتِ «مچ ← اشاره» و «مچ ← کوچک» و برچسب چپ/راستِ مدل.
// (با سه عکس آزمایشی درست درآمد؛ اگر برچسب نبود، null یعنی نمی‌دانیم.)
export function isDorsal(hand, w, h) {
  if (hand.label !== 'Left' && hand.label !== 'Right') return null;
  const a = pt(hand, 0, w, h), i = pt(hand, 5, w, h), k = pt(hand, 17, w, h);
  const cross = (i.x - a.x) * (k.y - a.y) - (i.y - a.y) * (k.x - a.x);
  return (cross > 0) === (hand.label === 'Right');
}

// ---------- پیکسل‌های عکس (یک بار خوانده و نگه‌داشته می‌شود) ----------
function pixels(photo) {
  if (!photo.__px) {
    photo.__px = photo.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, photo.width, photo.height);
  }
  return photo.__px;
}
function rgbAt(px, x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= px.width || yi >= px.height) return null;
  const o = (yi * px.width + xi) * 4;
  return [px.data[o], px.data[o + 1], px.data[o + 2]];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// پهنای انگشت را از روی لبه‌های پوست اندازه می‌گیرد. اگر لبه‌ی روشنی پیدا نشد، null.
function measureAcross(px, cx, cy, n, prior) {
  const step = Math.max(1, prior / 70);
  const ref = [0, 0, 0];
  const centre = [];
  for (let s = -0.1 * prior; s <= 0.1 * prior; s += step) {
    const c = rgbAt(px, cx + n.x * s, cy + n.y * s);
    if (c) { centre.push(c); ref[0] += c[0]; ref[1] += c[1]; ref[2] += c[2]; }
  }
  if (centre.length < 3) return null;
  ref[0] /= centre.length; ref[1] /= centre.length; ref[2] /= centre.length;
  const std = Math.sqrt(centre.reduce((a, c) => a + dist(c, ref) ** 2, 0) / centre.length);
  const thr = Math.max(34, std * 2.6 + 16);
  const edge = (sign) => {
    let run = 0, first = 0;
    for (let s = 0.12 * prior; s <= 1.2 * prior; s += step) {
      const c = rgbAt(px, cx + n.x * s * sign, cy + n.y * s * sign);
      if (!c) return null;
      if (dist(c, ref) > thr) { if (run === 0) first = s; run++; if (run >= 3) return first; }
      else run = 0;
    }
    return null;
  };
  const eR = edge(+1), eL = edge(-1);
  if (eR == null || eL == null) return null;
  return { width: eL + eR, off: (eR - eL) / 2, ref };
}

// ---------- هندسه‌ی انگشت ----------
export function fingerGeometry(hand, key, photo) {
  const w = photo.width, h = photo.height, f = FINGERS[key];
  const a = pt(hand, f.mcp, w, h), b = pt(hand, f.pip, w, h);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };   // سمت ناخن
  const n = { x: -d.y, y: d.x };
  const i5 = pt(hand, 5, w, h), i17 = pt(hand, 17, w, h);
  const palmW = Math.hypot(i5.x - i17.x, i5.y - i17.y);
  // برآورد اولیه: میانگینِ «نسبت به طول بند» و «نسبت به عرض کف دست»
  const byLen = 0.45 * L * f.lenW;
  const byPalm = 0.29 * palmW * f.wf;
  let prior = 0.5 * byLen + 0.5 * byPalm;
  if (f.nbr) {
    // فاصله‌ی مفصل این انگشت تا مفصل انگشت‌های کناری؛ با خمیدگی و بازشدن انگشت‌ها عوض نمی‌شود
    const me = pt(hand, f.mcp, w, h);
    const pitch = f.nbr.reduce((acc, i) => { const q = pt(hand, i, w, h); return acc + Math.hypot(me.x - q.x, me.y - q.y); }, 0) / f.nbr.length;
    prior = 0.5 * (pitch * f.pf) + 0.25 * byLen + 0.25 * byPalm;
  }

  let cx = a.x + d.x * L * f.t, cy = a.y + d.y * L * f.t;
  let width = prior, measured = false;
  const px = pixels(photo);
  const found = [];
  for (const dt of [-0.12, 0, 0.12]) {
    const m = measureAcross(px, cx + d.x * L * dt, cy + d.y * L * dt, n, prior);
    if (m && m.width > 0.8 * prior && m.width < 1.25 * prior) found.push(m);
  }
  if (found.length) {
    found.sort((p, q) => p.width - q.width);
    const m = found[Math.floor(found.length / 2)];
    width = 0.5 * m.width + 0.5 * prior;
    const off = clamp(m.off, -0.15 * prior, 0.15 * prior);
    cx += n.x * off; cy += n.y * off;
    measured = true;
  }
  // روشنایی پوست همان نقطه، برای هماهنگ‌کردن انگشتر با عکس
  let sum = 0, cnt = 0;
  const skinAvg = { r: 0, g: 0, b: 0, n: 0 };
  for (let u = -0.3 * width; u <= 0.3 * width; u += Math.max(1, width / 12)) {
    for (let v = -0.25 * L; v <= 0.25 * L; v += Math.max(1, L / 12)) {
      const c = rgbAt(px, cx + n.x * u + d.x * v, cy + n.y * u + d.y * v);
      if (c) {
        sum += 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; cnt++;
        skinAvg.r += c[0]; skinAvg.g += c[1]; skinAvg.b += c[2]; skinAvg.n++;
      }
    }
  }
  const skinLum = cnt ? sum / cnt : 170;
  const skinRGB = skinAvg.n ? [skinAvg.r / skinAvg.n, skinAvg.g / skinAvg.n, skinAvg.b / skinAvg.n] : [200, 160, 135];
  return { key, cx, cy, d, n, L, fingerW: width, prior, measured, skinLum, skinRGB, angle: Math.atan2(d.x, -d.y) };
}

// ---------- انگشتر ----------
export async function loadRing(def) {
  const img = new Image();
  img.src = def.faceUrl;
  await img.decode();
  return { ...def, img };
}

function hqResize(src, w, h) {
  let cur = src, cw = src.naturalWidth || src.width, ch = src.naturalHeight || src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw / 2)); c.height = Math.max(1, Math.round(ch / 2));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
  return out;
}

// انگشتر را با اندازه‌ی نهایی آماده می‌کند: کوچک‌کردن باکیفیت، سایه‌روشنِ لبه‌ها (انگشتر دور انگشت می‌پیچد)
// و هماهنگ‌کردن روشنایی با عکس.
function buildSprite(ring, W, H, brightness, skinRGB) {
  const base = hqResize(ring.img, W, H);
  // کمی پررنگ‌تر و کنتراست بیشتر: طلا روی پوست زنده‌تر دیده می‌شود (اگر مرورگر فیلتر بوم را بلد باشد)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  if ('filter' in x) x.filter = 'saturate(1.25) contrast(1.1)';
  x.drawImage(base, 0, 0);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-atop';
  // تیره‌شدن دو لبه‌ی کناری
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(28,14,2,0.48)');
  g.addColorStop(0.08, 'rgba(28,14,2,0.18)');
  g.addColorStop(0.20, 'rgba(28,14,2,0)');
  g.addColorStop(0.80, 'rgba(28,14,2,0)');
  g.addColorStop(0.92, 'rgba(28,14,2,0.18)');
  g.addColorStop(1, 'rgba(28,14,2,0.48)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // فلز رنگ محیط را کمی برمی‌دارد: کمی از رنگ پوست همان عکس
  x.fillStyle = `rgba(${Math.round(skinRGB[0])},${Math.round(skinRGB[1])},${Math.round(skinRGB[2])},0.08)`;
  x.fillRect(0, 0, W, H);
  // کمی تیرگی بالا و پایین، چون لبه‌ی انگشتر از پوست فاصله ندارد
  const v = x.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(20,10,0,0.14)'); v.addColorStop(0.14, 'rgba(20,10,0,0)');
  v.addColorStop(0.86, 'rgba(20,10,0,0)'); v.addColorStop(1, 'rgba(20,10,0,0.16)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  if (brightness < 1) { x.fillStyle = `rgba(0,0,0,${(1 - brightness).toFixed(3)})`; x.fillRect(0, 0, W, H); }
  return c;
}

// opt: { scale (۱ = اندازه‌ی خودکار), shift (به واحد طول بند؛ مثبت = سمت ناخن) }
export function drawRing(ctx, ring, geom, opt) {
  const W = Math.max(8, Math.round(geom.fingerW * ring.spanFactor * opt.scale));
  const H = Math.max(6, Math.round(W * (ring.img.naturalHeight / ring.img.naturalWidth) * ring.vStretch));
  const brightness = clamp(Math.pow(geom.skinLum / 175, 0.55), 0.72, 1.06);
  const sk = geom.skinRGB.map((v) => Math.round(v / 8));
  const key = `${ring.id}|${W}|${H}|${brightness.toFixed(2)}|${sk.join(',')}`;
  if (!ring.__sprite || ring.__spriteKey !== key) { ring.__sprite = buildSprite(ring, W, H, brightness, geom.skinRGB); ring.__spriteKey = key; }
  const px = geom.cx + geom.d.x * geom.L * opt.shift;
  const py = geom.cy + geom.d.y * geom.L * opt.shift;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(geom.angle);
  // سایه‌ی نرمِ تماس: فقط روی خودِ انگشت (کادر انگشت بریده می‌شود تا روی پس‌زمینه سایه نیفتد)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-geom.fingerW * 0.52, -1.5 * geom.L, geom.fingerW * 1.04, 3 * geom.L);
  ctx.clip();
  ctx.shadowColor = 'rgba(35,15,5,0.5)';
  ctx.shadowBlur = Math.max(3, H * 0.3);
  ctx.drawImage(ring.__sprite, -W / 2, -H / 2);
  ctx.restore();
  // خودِ انگشتر؛ کمی نرم تا با وضوح عکس هماهنگ شود
  if ('filter' in ctx) ctx.filter = `blur(${(0.3 + W / 1800).toFixed(2)}px)`;
  ctx.drawImage(ring.__sprite, -W / 2, -H / 2);
  ctx.restore();
}
