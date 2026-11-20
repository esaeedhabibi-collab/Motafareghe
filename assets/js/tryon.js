// هندسه‌ی انگشت و کشیدن انگشتر روی عکس.
// هیچ عددی از جنس قیمت/اندازه‌ی واقعی اینجا نیست؛ فقط نسبت‌های ظاهری.

// شماره‌ی نقطه‌ها در مدل دست: ۰ مچ، ۱–۴ شست، ۵–۸ اشاره، ۹–۱۲ وسط، ۱۳–۱۶ حلقه، ۱۷–۲۰ کوچک.
// mcp = مفصل کنار کف دست، pip = مفصل بعدی. t = جای معمول انگشتر روی این بند (۰ تا ۱).
// wf = ضریب پهنای انگشت نسبت به عرض کف دست.
export const FINGERS = {
  thumb:  { mcp: 2,  pip: 3,  t: 0.50, wf: 1.15, lenW: 1.30, nbr: null,    pf: 1.00 },
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
  const sideLum = (u0, u1) => {
    let t = 0, c = 0;
    for (let u = u0; u <= u1; u += Math.max(1, width / 14)) {
      for (let v = -0.2 * L; v <= 0.2 * L; v += Math.max(1, L / 10)) {
        const q = rgbAt(px, cx + n.x * u + d.x * v, cy + n.y * u + d.y * v);
        if (q) { t += 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]; c++; }
      }
    }
    return c ? t / c : null;
  };
  const sl = sideLum(-0.45 * width, -0.15 * width), sr = sideLum(0.15 * width, 0.45 * width);
  const lateral = sl && sr ? clamp(((sr - sl) / (sr + sl)) * 3, -0.6, 0.6) : 0;   // مثبت: سمت راستِ انگشتر روشن‌تر است
  const skinRGB = skinAvg.n ? [skinAvg.r / skinAvg.n, skinAvg.g / skinAvg.n, skinAvg.b / skinAvg.n] : [200, 160, 135];
  return { key, cx, cy, d, n, L, fingerW: width, prior, measured, skinLum, skinRGB, lateral, angle: Math.atan2(d.x, -d.y) };
}

// ---------- انگشتر ----------
export async function loadRing(def) {
  const load = async (url) => { const im = new Image(); im.src = url; await im.decode(); return im; };
  const img = await load(def.faceUrl);
  const fillImg = def.fillUrl ? await load(def.fillUrl) : null;
  return { ...def, img, fillImg };
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
  const x = out.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
  return out;
}

const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// جهت نور در چارچوب خودِ انگشتر (x = عرض انگشت، y = امتداد انگشت به سمت ناخن، z = سمت دوربین).
// پیش‌فرض: نور از بالا و چپِ عکس (مثل نور پنجره)؛ با روشن‌تر بودن یک سمت انگشت اصلاح می‌شود.
function lightDir(geom) {
  const th = geom.angle, lx = -0.32, ly = -0.5;
  let sx = lx * Math.cos(th) + ly * Math.sin(th);
  const sy = -lx * Math.sin(th) + ly * Math.cos(th);
  sx = clamp(sx + geom.lateral, -0.75, 0.75);
  const sz = Math.sqrt(Math.max(0.12, 1 - sx * sx - sy * sy));
  const m = Math.hypot(sx, sy, sz);
  return [sx / m, sy / m, sz / m];
}

// وضوح: کوچک‌کردنِ عکس انگشتر ریزه‌کاری مشبک را محو می‌کند؛ کمی تیزش می‌کنیم (اگر مرورگر فیلتر بوم را بلد باشد)
function sharpen(canvas, W, H, amount, radius) {
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  if (!('filter' in cx)) return;
  const b = document.createElement('canvas');
  b.width = W; b.height = H;
  const bx = b.getContext('2d', { willReadFrequently: true });
  bx.filter = `blur(${radius.toFixed(2)}px)`;
  bx.drawImage(canvas, 0, 0);
  const a = cx.getImageData(0, 0, W, H), bd = bx.getImageData(0, 0, W, H).data, d = a.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) continue;
    for (let k = 0; k < 3; k++) d[i + k] = clamp(d[i + k] + amount * (d[i + k] - bd[i + k]), 0, 255);
  }
  cx.putImageData(a, 0, 0);
}

// حالت قدیمی: عکس تخت با کمی تیرگی کنارها (برای انگشتری که فقط عکس تمام‌نور دارد)
function buildFlatSprite(ring, W, H, brightness, skinRGB) {
  const base = hqResize(ring.img, W, H);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  if ('filter' in x) x.filter = 'saturate(1.25) contrast(1.1)';
  x.drawImage(base, 0, 0);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(28,14,2,0.48)');
  g.addColorStop(0.08, 'rgba(28,14,2,0.18)');
  g.addColorStop(0.20, 'rgba(28,14,2,0)');
  g.addColorStop(0.80, 'rgba(28,14,2,0)');
  g.addColorStop(0.92, 'rgba(28,14,2,0.18)');
  g.addColorStop(1, 'rgba(28,14,2,0.48)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = `rgba(${Math.round(skinRGB[0])},${Math.round(skinRGB[1])},${Math.round(skinRGB[2])},0.08)`;
  x.fillRect(0, 0, W, H);
  const v = x.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(20,10,0,0.14)'); v.addColorStop(0.14, 'rgba(20,10,0,0)');
  v.addColorStop(0.86, 'rgba(20,10,0,0)'); v.addColorStop(1, 'rgba(20,10,0,0.16)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  if (brightness < 1) { x.fillStyle = `rgba(0,0,0,${(1 - brightness).toFixed(3)})`; x.fillRect(0, 0, W, H); }
  return c;
}

// حالت اصلی: انگشتر را مثل یک استوانه‌ی دور انگشت دوباره نورپردازی می‌کند.
// عکس انگشتر (آلبدو) نورِ استودیو را ندارد؛ نور و سایه از روی عکس دستِ کاربر حدس زده می‌شود:
// جهت نور، روشنایی، رنگ پوست (کنارها پوست را بازتاب می‌دهند)، درخشش و برق لبه‌ها.
function buildRelitSprite(ring, W, H, geom) {
  const albedo = hqResize(ring.img, W, H);
  const actx = albedo.getContext('2d', { willReadFrequently: true });
  const id = actx.getImageData(0, 0, W, H);
  const px = id.data;
  const fill = ring.fillImg ? hqResize(ring.fillImg, W, H).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data : null;
  const Ld = lightDir(geom);
  const hv = [Ld[0], Ld[1], Ld[2] + 1];
  const hm = Math.hypot(hv[0], hv[1], hv[2]); hv[0] /= hm; hv[1] /= hm; hv[2] /= hm;
  const sk = geom.skinRGB.map((v) => v / 255);
  const exposure = clamp(0.55 + 0.45 * (geom.skinLum / 190), 0.62, 1.12);

  for (let y = 0; y < H; y++) {
    const v = ((y + 0.5) / H) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (px[i + 3] === 0) continue;
      const u = ((x + 0.5) / W) * 2 - 1;
      // سطح: استوانه‌ی دور انگشت، کمی برآمده در عرض نوار
      let nx = u, ny = 0.28 * v, nz = Math.sqrt(Math.max(0.04, 1 - u * u));
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const diff = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]);
      const ndh = Math.max(0, nx * hv[0] + ny * hv[1] + nz * hv[2]);
      const spec = Math.pow(ndh, 56) * 0.5;
      const edge = smooth(0.5, 1.0, Math.abs(u));            // کنارها که به پشتِ انگشت می‌پیچند
      let lit = (0.50 + 0.62 * diff) * exposure * (1 - 0.42 * edge);
      // لبه‌ی نوار: لبه‌ای که رو به نور است برق می‌زند، لبه‌ی مقابل کمی تیره‌تر
      if (fill) {
        const fa = fill[i + 3];
        const up = y >= 2 ? fill[((y - 2) * W + x) * 4 + 3] : 0;
        const dn = y < H - 2 ? fill[((y + 2) * W + x) * 4 + 3] : 0;
        if (fa > 60) {
          const topEdge = Math.max(0, dn - up) / 255, botEdge = Math.max(0, up - dn) / 255;
          const lu = Math.max(0, -Ld[1]), ld = Math.max(0, Ld[1]);
          lit *= 1 + topEdge * (0.55 * lu - 0.15 * ld) + botEdge * (0.55 * ld - 0.15 * lu);
        }
      }
      const a0 = px[i] / 255, a1 = px[i + 1] / 255, a2 = px[i + 2] / 255;
      const k = 0.42 * edge;
      // طلای سایه‌خورده قهوه‌ای-نارنجی می‌شود، نه زیتونی: آبی و سبز زودتر از قرمز کم می‌شوند
      const lr = Math.pow(lit, 0.85), lg = lit, lb = Math.pow(lit, 1.3);
      let r = a0 * lr * (1 - k) + a0 * sk[0] * 1.35 * exposure * k;
      let g = a1 * lg * (1 - k) + a1 * sk[1] * 1.35 * exposure * k;
      let b = a2 * lb * (1 - k) + a2 * sk[2] * 1.35 * exposure * k;
      r += spec * (0.60 + 0.40 * a0); g += spec * (0.52 + 0.40 * a1); b += spec * (0.36 + 0.40 * a2);
      // طلا رنگ‌های غنی دارد؛ کمی پررنگ‌تر
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * 1.18; g = (l + (g - l) * 1.18) * 0.955; b = (l + (b - l) * 1.18) * 0.92;
      px[i] = clamp(r * 255, 0, 255); px[i + 1] = clamp(g * 255, 0, 255); px[i + 2] = clamp(b * 255, 0, 255);
      // دو سر انگشتر کم‌کم محو می‌شود، چون به پشتِ انگشت می‌پیچد
      px[i + 3] = px[i + 3] * (1 - 0.85 * smooth(0.93, 1.0, Math.abs(u)));
    }
  }
  actx.putImageData(id, 0, 0);
  sharpen(albedo, W, H, 1.6, clamp(W / 110, 0.55, 1.2));

  // زیرِ انگشتر: ردپای تیره (سوراخ‌های مشبک تاریک‌تر از پوست دیده می‌شوند)
  let under = null;
  if (fill) {
    under = document.createElement('canvas');
    under.width = W; under.height = H;
    const ux = under.getContext('2d');
    const uid = ux.createImageData(W, H);
    // از لابه‌لای مشبک، پوستِ سایه‌خورده با بازتاب طلا دیده می‌شود (نه سیاه و نه خاکستری)
    const goldDark = [165, 112, 40];
    const dark = geom.skinRGB.map((c, k) => c * 0.18 + goldDark[k] * 0.40);
    for (let i = 0; i < W * H; i++) {
      uid.data[i * 4] = dark[0]; uid.data[i * 4 + 1] = dark[1]; uid.data[i * 4 + 2] = dark[2];
      uid.data[i * 4 + 3] = fill[i * 4 + 3] * 0.86;
    }
    ux.putImageData(uid, 0, 0);
  }
  return { sprite: albedo, under, light: Ld };
}

// opt: { scale (۱ = اندازه‌ی خودکار), shift (به واحد طول بند؛ مثبت = سمت ناخن) }
export function drawRing(ctx, ring, geom, opt) {
  const W = Math.max(8, Math.round(geom.fingerW * ring.spanFactor * opt.scale));
  const H = Math.max(6, Math.round(W * (ring.img.naturalHeight / ring.img.naturalWidth) * ring.vStretch));
  const px = geom.cx + geom.d.x * geom.L * opt.shift;
  const py = geom.cy + geom.d.y * geom.L * opt.shift;
  const relit = ring.mode === 'relight';
  const sk = geom.skinRGB.map((v) => Math.round(v / 8));
  const key = relit
    ? `${ring.id}|${W}|${H}|${Math.round(geom.angle * 14)}|${Math.round(geom.lateral * 10)}|${Math.round(geom.skinLum / 6)}|${sk.join(',')}`
    : `${ring.id}|${W}|${H}|${Math.round(geom.skinLum / 6)}|${sk.join(',')}`;
  if (!ring.__built || ring.__builtKey !== key) {
    if (relit) ring.__built = buildRelitSprite(ring, W, H, geom);
    else {
      const brightness = clamp(Math.pow(geom.skinLum / 175, 0.55), 0.72, 1.06);
      ring.__built = { sprite: buildFlatSprite(ring, W, H, brightness, geom.skinRGB), under: null, light: null };
    }
    ring.__builtKey = key;
  }
  const { sprite, under, light } = ring.__built;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(geom.angle);
  // سایه‌ی نرمِ تماس و ردپای تیره: فقط روی خودِ انگشت (کادر انگشت بریده می‌شود تا روی پس‌زمینه سایه نیفتد)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-geom.fingerW * 0.53, -1.5 * geom.L, geom.fingerW * 1.06, 3 * geom.L);
  ctx.clip();
  const th = geom.angle;
  let ox = 0, oy = 0;
  if (light) {   // سایه از سمت نور دور می‌شود؛ جابه‌جایی سایه در دستگاه مختصاتِ عکس حساب می‌شود
    const sx = -light[0] * H * 0.20, sy = -light[1] * H * 0.20;
    ox = sx * Math.cos(th) - sy * Math.sin(th); oy = sx * Math.sin(th) + sy * Math.cos(th);
  }
  ctx.shadowColor = relit ? 'rgba(30,12,4,0.58)' : 'rgba(35,15,5,0.5)';
  ctx.shadowBlur = Math.max(3, H * (relit ? 0.40 : 0.30));
  ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
  ctx.drawImage(under || sprite, -W / 2, -H / 2);
  ctx.restore();
  // خودِ انگشتر؛ کمی نرم تا با وضوح عکس هماهنگ شود
  if ('filter' in ctx) ctx.filter = `blur(${(0.12 + W / 4000).toFixed(2)}px)`;
  ctx.drawImage(sprite, -W / 2, -H / 2);
  ctx.restore();
}
