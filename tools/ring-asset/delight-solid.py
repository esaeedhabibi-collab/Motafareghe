"""Turn an existing solid ring-face RGBA (studio lighting baked in) into albedo + footprint mask.
Usage: delight.py in.png out_albedo.png out_fill.png"""
import sys
import numpy as np, cv2
src, out_a, out_f = sys.argv[1:4]
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
col = im[..., :3].astype(np.float32) / 255
al = im[..., 3].astype(np.float32) / 255
H, W = al.shape
Y = 0.114 * col[..., 0] + 0.587 * col[..., 1] + 0.299 * col[..., 2]
sig = max(6.0, 0.075 * W)
b = lambda a: cv2.GaussianBlur(a, (0, 0), sig)
low = np.maximum(b(Y * al) / np.maximum(b(al), 1e-3), 0.15)
alb = np.clip(col / low[..., None] * 0.74, 0, 1)
cv2.imwrite(out_a, np.dstack([alb * 255, al * 255]).astype(np.uint8))
fm = cv2.GaussianBlur(cv2.erode((al > 0.5).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 0.7)
fm8 = (fm * 255).astype(np.uint8)
cv2.imwrite(out_f, np.dstack([np.zeros_like(fm8)] * 3 + [fm8]))
print('ok', W, H)
