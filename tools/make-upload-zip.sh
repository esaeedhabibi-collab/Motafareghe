#!/usr/bin/env bash
# فقط چیزهایی را زیپ می‌کند که روی هاست می‌روند: index.html، .htaccess و assets/ (نه docs، tools و یادداشت‌ها).
# اجرا از هر جا: tools/make-upload-zip.sh [مسیر-خروجی.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-mahtala-site.zip}"
rm -f "$out"
zip -r -X "$out" index.html .htaccess assets -x "*.DS_Store" > /dev/null
echo "ساخته شد: $out ($(stat -c %s "$out") بایت)"
unzip -l "$out" | tail -1
