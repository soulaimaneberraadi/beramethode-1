#!/usr/bin/env bash
# Auto-backup hook (PreCompact): يحفظ كل التغييرات ويرفعها لفرع backup
# قبل أن يضغط Claude Code السياق — حتى لا يضيع أي عمل.
# - commit محلي على الفرع الحالي (لا يلمس master عن بُعد).
# - push إلى فرع auto-backup فقط (لا ينشر على Vercel الإنتاجي).
set -u

BRANCH="auto-backup"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# لا تفعل شيئاً إذا لم تكن هناك تغييرات
if [ -z "$(git status --porcelain)" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

git add -A >/dev/null 2>&1
git commit -m "auto-save: context near full ${STAMP}" >/dev/null 2>&1

# رفع الحالة الحالية إلى فرع backup فقط (force = نسخة متجددة دائماً)
if git push --force origin "HEAD:refs/heads/${BRANCH}" >/dev/null 2>&1; then
  echo "{\"systemMessage\": \"✅ تم الحفظ التلقائي + رفع إلى فرع ${BRANCH} (${STAMP})\", \"suppressOutput\": true}"
else
  echo "{\"systemMessage\": \"⚠️ تم commit محلي لكن فشل الـ push إلى ${BRANCH} — تحقّق من اتصال GitHub\", \"suppressOutput\": true}"
fi
exit 0
