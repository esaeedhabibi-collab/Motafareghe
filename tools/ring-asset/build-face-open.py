"""Build a relightable ring face from a front-view product photo on a light background.
Outputs (in out_dir): NAME.png  = RGBA, colour with the studio lighting removed + alpha WITH holes
                      NAME-fill.png = alpha-only silhouette (holes filled) for the shadow under the ring
Usage: ring_asset2.py photo.png out_dir name [debug_dir]"""
import sys, json
import numpy as np, cv2

src, out_dir, name = sys.argv[1], sys.argv[2], sys.argv[3]
dbg = sys.argv[4] if len(sys.argv) > 4 else None
im = cv2.imread(src)
h, w = im.shape[:2]
f = im.astype(np.float32) / 255
mx, mn = f.max(2), f.min(2)
S = (mx - mn) / np.maximum(mx, 1e-3)
V = mx
hole_like = ((S < 0.10) & (V > 0.82)).astype(np.uint8)

def smooth(t): return t * t * (3 - 2 * t)
alpha_lat = smooth(np.clip((S - 0.04) / 0.20, 0, 1))
alpha_lat[V <= 0.82] = 1.0

# outer background = hole-like pixels connected to the border; the "lake" = the big enclosed opening of the ring
core = cv2.erode(hole_like, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(core, 4)
outer = np.zeros((h, w), bool); lake = np.zeros((h, w), bool)
for k in range(1, n):
    x, y, ww, hh, area = st[k]
    touches = x == 0 or y == 0 or x + ww >= w or y + hh >= h
    if touches: outer |= (lab == k)
    elif area > 260: lake |= (lab == k)
outer = cv2.dilate(outer.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & (hole_like > 0) | outer
lake = cv2.dilate(lake.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
sil = (~outer) & (~lake)
# keep the biggest piece
n, lab, st, _ = cv2.connectedComponentsWithStats(sil.astype(np.uint8), 8)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); sil = lab == k
cols = np.where(sil.any(0))[0]; x0, x1 = cols.min(), cols.max()
bottom = np.full(w, np.nan); top = np.full(w, np.nan)
for x in range(x0, x1 + 1):
    ys = np.where(sil[:, x])[0]; bottom[x] = ys.max()
    ly = np.where(lake[:, x])[0]
    top[x] = (ly.max() + 1) if ly.size else ys.min()
# columns beside the opening: continue the face's top rim with the slope it has at the opening's edge
has_lake = np.array([lake[:, x].any() for x in range(w)])
lx = np.where(has_lake)[0]
if lx.size > 20:
    cq = np.polyfit(lx, top[lx], 2)
    xl, xr = lx.min() + 6, lx.max() - 6
    for x in range(x0, x1 + 1):
        if x < xl:  top[x] = np.polyval(cq, xl) + (2 * cq[0] * xl + cq[1]) * (x - xl)
        elif x > xr: top[x] = np.polyval(cq, xr) + (2 * cq[0] * xr + cq[1]) * (x - xr)
        else: top[x] = np.polyval(cq, x)
    for x in range(x0, x1 + 1):
        ys = np.where(sil[:, x])[0]
        top[x] = min(max(top[x], ys.min()), bottom[x] - 8)
face = np.zeros((h, w), bool)
for x in range(x0, x1 + 1):
    face[int(round(top[x])):int(bottom[x]) + 1, x] = True
face &= sil
print('x range', x0, x1, 'bottom', np.nanmin(bottom), np.nanmax(bottom), 'top', np.nanmin(top), np.nanmax(top))

# straighten the bottom rim (camera looked slightly from above)
xs = np.arange(x0 + 10, x1 - 10)
co = np.polyfit(xs, bottom[xs], 4)
fit = np.polyval(co, np.arange(w)).astype(np.float32)
ymax = fit[x0:x1 + 1].max()
shift = ymax - fit; shift[:x0] = shift[x0]; shift[x1 + 1:] = shift[x1]
mxm = np.tile(np.arange(w, dtype=np.float32), (h, 1))
mym = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w)) - shift[None, :]
def warp(a):
    return cv2.remap(a.astype(np.float32), mxm, mym, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
al = alpha_lat * face
pm = f * al[..., None]
pm_w = np.dstack([warp(pm[..., i]) for i in range(3)])
al_w = np.clip(warp(al), 0, 1)
face_w = np.clip(warp(face.astype(np.float32)), 0, 1)
ys_, xs_ = np.where(face_w > 0.5)
y0, y1, xa, xb = ys_.min() - 2, ys_.max() + 3, xs_.min() - 2, xs_.max() + 3
pm_w, al_w, face_w = pm_w[y0:y1, xa:xb], al_w[y0:y1, xa:xb], face_w[y0:y1, xa:xb]
H, W = al_w.shape
col = np.where(al_w[..., None] > 0.02, pm_w / np.maximum(al_w[..., None], 0.02), 0)

# fix colour of the half-transparent edge pixels (they still contain the white background):
solid = (al_w > 0.9).astype(np.float32)
def blur(a, s): return cv2.GaussianBlur(a, (0, 0), s)
num = np.dstack([blur(col[..., i] * solid, 1.6) for i in range(3)]); den = np.maximum(blur(solid, 1.6), 1e-3)[..., None]
filled = num / den
need = (al_w < 0.9)[..., None]
col = np.where(need, filled, col)

# remove the studio lighting: keep fine detail, replace the broad light/dark areas
Y = 0.114 * col[..., 0] + 0.587 * col[..., 1] + 0.299 * col[..., 2]
wt = al_w * face_w
sig = max(6.0, 0.075 * W)
low = blur(Y * wt, sig) / np.maximum(blur(wt, sig), 1e-3)
low = np.maximum(low, 0.15)
Y_T = 0.74
alb = np.clip(col / low[..., None] * Y_T, 0, 1)
detail_clip = np.clip(Y / low, 0.4, 1.9)
print('asset', W, 'x', H, 'ratio H/W', round(H / W, 3), 'mean low', round(float((low * wt).sum() / wt.sum()), 3))

out_rgba = np.dstack([alb * 255, np.clip(wt, 0, 1) * 255]).astype(np.uint8)
fillmask = (cv2.GaussianBlur(cv2.erode((face_w > 0.5).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 0.7) * 255).astype(np.uint8)
cv2.imwrite(f'{out_dir}/{name}.png', out_rgba)
cv2.imwrite(f'{out_dir}/{name}-fill.png', np.dstack([np.zeros_like(fillmask)] * 3 + [fillmask]))
meta = {'aspect': round(H / W, 4), 'w': int(W), 'h': int(H)}
json.dump(meta, open(f'{out_dir}/{name}.meta.json', 'w'))
if dbg:
    vis = (f * 255).astype(np.uint8).copy()
    vis[outer] = (vis[outer] * 0.4 + np.array([255, 0, 0]) * 0.6).astype(np.uint8)
    vis[lake] = (vis[lake] * 0.4 + np.array([0, 255, 0]) * 0.6).astype(np.uint8)
    cv2.imwrite(f'{dbg}/{name}_masks.png', vis)
    bgc = np.zeros((H, W, 3), np.float32); bgc[:] = (150, 170, 215)
    a3 = (np.clip(wt, 0, 1))[..., None]
    cv2.imwrite(f'{dbg}/{name}_prev_albedo.png', (alb * 255 * a3 + bgc * (1 - a3)).astype(np.uint8))
    cv2.imwrite(f'{dbg}/{name}_prev_orig.png', (np.clip(col, 0, 1) * 255 * a3 + bgc * (1 - a3)).astype(np.uint8))
