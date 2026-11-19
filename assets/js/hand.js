// تشخیص دست داخل مرورگر کاربر (MediaPipe Hand Landmarker).
// همه‌ی فایل‌ها روی خود سایت هستند (assets/vendor/mediapipe)؛ از سرور گوگل چیزی لود نمی‌شود.
// عکس کاربر هیچ‌جا فرستاده نمی‌شود.

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;

let modelPromise = null;

export function loadHandModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(BASE + 'vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
      });
    })().catch((err) => {
      modelPromise = null; // دفعه‌ی بعد دوباره تلاش شود
      throw err;
    });
  }
  return modelPromise;
}

// خروجی: آرایه‌ای از دست‌ها؛ هر دست = { pts: [{x,y,z}...۲۱ نقطه، نرمال‌شده], label }
export async function detectHands(canvas) {
  const landmarker = await loadHandModel();
  const res = landmarker.detect(canvas);
  const labels = res.handedness || res.handednesses || [];
  return res.landmarks.map((pts, i) => ({
    pts,
    label: (labels[i] && labels[i][0] && labels[i][0].categoryName) || '',
  }));
}
