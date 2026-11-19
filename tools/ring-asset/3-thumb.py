import sys, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
a = im[..., 3]
ys, xs = np.where(a > 20)
pad = 14
im = im[max(ys.min()-pad,0):ys.max()+pad, max(xs.min()-pad,0):xs.max()+pad]
h, w = im.shape[:2]
s = 240 / max(w, h)
im = cv2.resize(im, (int(w*s), int(h*s)), interpolation=cv2.INTER_AREA)
cv2.imwrite(out, im); print('thumb', im.shape[1], im.shape[0])
