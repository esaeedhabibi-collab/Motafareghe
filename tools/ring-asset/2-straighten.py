import sys, json
import numpy as np, cv2
src, out_png, out_prev = sys.argv[1], sys.argv[2], sys.argv[3]
rgba = cv2.imread(src, cv2.IMREAD_UNCHANGED)
h, w = rgba.shape[:2]
bgr = rgba[..., :3]; a = rgba[..., 3].astype(np.float32) / 255
solid = a > 0.5
cols = np.where(solid.any(axis=0))[0]
x0, x1 = cols.min(), cols.max()
yb = np.full(w, np.nan)
for x in range(x0, x1 + 1):
    ys = np.where(solid[:, x])[0]
    yb[x] = ys.max()
xs = np.arange(x0 + 12, x1 - 12)
co = np.polyfit(xs, yb[xs], 4)
fit = np.polyval(co, np.arange(w)).astype(np.float32)
res = yb[xs] - np.polyval(co, xs)
print('x range', x0, x1, 'bottom y min/max (raw)', np.nanmin(yb), np.nanmax(yb), 'fit resid max', np.abs(res).max().round(1))
ymax = np.nanmax(fit[x0:x1 + 1])
shift = (ymax - fit)  # move column content down by this much
shift[:x0] = shift[x0]; shift[x1 + 1:] = shift[x1]
mx = np.tile(np.arange(w, dtype=np.float32), (h, 1))
my = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w)) - shift[None, :]
rgba_f = rgba.astype(np.float32)
# premultiply for clean remap
pm = rgba_f.copy(); pm[..., :3] *= (rgba_f[..., 3:4] / 255)
warped = cv2.remap(pm, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
al = np.clip(warped[..., 3] / 255, 0, 1)
col = np.where(al[..., None] > 1e-3, warped[..., :3] / np.maximum(warped[..., 3:4] / 255, 1e-3), 0)
# keep only the lowest contiguous run in each column (drops the inner back arch)
solid2 = al > 0.4
keep = np.zeros_like(solid2)
GAP = 10
for x in range(w):
    ys = np.where(solid2[:, x])[0]
    if ys.size == 0: continue
    top = ys[-1]; prev = ys[-1]
    for y in ys[::-1]:
        if prev - y > GAP: break
        top = y; prev = y
    keep[top:, x] = True
al = al * cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.8)
# straight top rim: clip everything above the plate's top edge measured in the middle columns
sol = al > 0.4
mid = np.arange(int(x0 + 0.3*(x1-x0)), int(x0 + 0.7*(x1-x0)))
tops = [np.where(sol[:, x])[0].min() for x in mid if sol[:, x].any()]
top_line = int(np.median(tops))
print('top line', top_line)
al[:max(top_line - 1, 0), :] = 0
# soften corners
yy, xx = np.where(al > 0.4)
cy0, cy1, cx0, cx1 = yy.min(), yy.max(), xx.min(), xx.max()
R_ = 16
m = np.zeros_like(al)
cv2.rectangle(m, (cx0, cy0), (cx1, cy1), 1.0, -1)
rr = np.zeros_like(al)
cv2.rectangle(rr, (cx0 + R_, cy0), (cx1 - R_, cy1), 1.0, -1)
cv2.rectangle(rr, (cx0, cy0 + R_), (cx1, cy1 - R_), 1.0, -1)
for (cx, cy) in [(cx0 + R_, cy0 + R_), (cx1 - R_, cy0 + R_), (cx0 + R_, cy1 - R_), (cx1 - R_, cy1 - R_)]:
    cv2.circle(rr, (cx, cy), R_, 1.0, -1)
al = al * cv2.GaussianBlur(rr, (0, 0), 1.0)
ys, xs2 = np.where(al > 0.4)
y0, y1, xa, xb = ys.min() - 2, ys.max() + 3, xs2.min() - 2, xs2.max() + 3
# deep black mirror reflections on the polished plate read as holes at small size: lift them toward dark bronze (BGR)
lum = 0.114 * col[..., 0] + 0.587 * col[..., 1] + 0.299 * col[..., 2]
k = np.clip((78 - lum) / 78, 0, 1)[..., None] * 0.75
bronze = np.array([38, 82, 128], np.float32)
col = col * (1 - k) + bronze * k
out = np.dstack([np.clip(col, 0, 255), al * 255])[y0:y1, xa:xb].astype(np.uint8)
cv2.imwrite(out_png, out)
print('asset size', out.shape[1], 'x', out.shape[0])
bgc = np.zeros((out.shape[0], out.shape[1], 3), np.float32); bgc[:] = (150, 170, 215)  # skin-like (BGR)
aa = out[..., 3:4].astype(np.float32) / 255
cv2.imwrite(out_prev, (out[..., :3] * aa + bgc * (1 - aa)).astype(np.uint8))
