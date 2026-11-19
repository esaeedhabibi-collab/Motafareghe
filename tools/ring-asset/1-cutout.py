import sys
import numpy as np, cv2
src, out, prev = sys.argv[1], sys.argv[2], sys.argv[3]
im = cv2.imread(src)
h, w = im.shape[:2]
f = im.astype(np.float32)
m = np.concatenate([f[:, :60], f[:, -60:]], axis=1)
bg = np.median(m, axis=1)
bg = cv2.GaussianBlur(bg.reshape(h,1,3), (1,0), 25).reshape(h,3)
diff = np.max(bg[:,None,:] - f, axis=2)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
S_, V_ = hsv[...,1].astype(int), hsv[...,2].astype(int)
core = (((S_ > 45) & (V_ > 90)) | (diff > 40)).astype(np.uint8)
core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13)))
n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
core = (lab == k).astype(np.uint8)
sure_fg = cv2.erode(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))
prob = cv2.dilate(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
gc = np.full((h,w), cv2.GC_BGD, np.uint8)
gc[prob>0] = cv2.GC_PR_BGD
gc[core>0] = cv2.GC_PR_FGD
gc[sure_fg>0] = cv2.GC_FGD
bgm = np.zeros((1,65)); fgm = np.zeros((1,65))
cv2.grabCut(im, gc, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
mask = ((gc==cv2.GC_FGD)|(gc==cv2.GC_PR_FGD)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
mask = (lab == k).astype(np.uint8)
mask = cv2.erode(mask, np.ones((2,2),np.uint8))
alpha = cv2.GaussianBlur(mask.astype(np.float32), (0,0), 0.9)
cv2.imwrite(out, np.dstack([im, (alpha*255).astype(np.uint8)]))
ys, xs = np.where(mask>0)
print('bbox x', xs.min(), xs.max(), 'y', ys.min(), ys.max(), 'area', int(mask.sum()))
bgc = np.zeros_like(im); bgc[:] = (70, 90, 120)
cv2.imwrite(prev, (im*alpha[...,None] + bgc*(1-alpha[...,None])).astype(np.uint8))
