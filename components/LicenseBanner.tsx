// ════════════════════════════════════════════════════════════════════════════
// LicenseBanner — شريط تنبيه ترخيص المصنع:
//  • وضع القراءة فقط (انتهى/موقوف) → شريط أحمر.
//  • قرب الانتهاء (≤ 5 أيام) → شريط برتقالي للتجديد.
// لا يظهر إطلاقاً إذا كان الإنفاذ مطفأ أو الترخيص سليماً وبعيداً عن الانتهاء.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useLicense } from '../src/context/LicenseContext';

const LicenseBanner: React.FC = () => {
  const { enforced, readOnly, license } = useLicense();
  if (!enforced) return null;

  if (readOnly) {
    return (
      <div className="w-full bg-rose-600 dark:bg-rose-800 text-white text-sm px-4 py-2 text-center">
        انتهت صلاحية ترخيص المصنع — الوضع الحالي: <strong>قراءة فقط</strong>. يمكنك الاطلاع على بياناتك دون إضافة جديدة. يرجى تجديد المفتاح.
      </div>
    );
  }

  if (license.active && license.daysLeft > 0 && license.daysLeft <= 5) {
    return (
      <div className="w-full bg-amber-500 dark:bg-amber-700 text-white text-sm px-4 py-2 text-center">
        اشتراك المصنع ينتهي خلال {license.daysLeft} أيام. يرجى التجديد لتفادي توقّف الإضافة.
      </div>
    );
  }

  return null;
};

export default LicenseBanner;
