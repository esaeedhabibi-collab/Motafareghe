import sys, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src); h, w = im.shape[:2]
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(np.float32)
H, S, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
gold = (((H > 8) & (H < 70)) & (S > 0.22)) | (V < 0.55)
m = gold.astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab == k).astype(np.float32)
a = cv2.GaussianBlur(m, (0, 0), 0.8)
ys, xs = np.where(m > 0.5); pad = 10
y0, y1, x0, x1 = max(ys.min() - pad, 0), ys.max() + pad, max(xs.min() - pad, 0), xs.max() + pad
rgba = np.dstack([im, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
s = 240 / max(rgba.shape[:2]); rgba = cv2.resize(rgba, (int(rgba.shape[1] * s), int(rgba.shape[0] * s)), interpolation=cv2.INTER_AREA)
cv2.imwrite(out, rgba); print('thumb', rgba.shape[1], rgba.shape[0])
bgc = np.zeros(rgba.shape[:2] + (3,), np.float32); bgc[:] = (245, 240, 235)
aa = rgba[..., 3:4] / 255.0
cv2.imwrite(out.replace('.png', '_prev.png'), (rgba[..., :3] * aa + bgc * (1 - aa)).astype(np.uint8))
