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
        {tx(lang, {fr: 'La licence de l\'usine a expiré — statut actuel : ', ar: 'انتهت صلاحية ترخيص المصنع — الوضع الحالي: ', en: 'Factory license has expired — current status: ', es: 'La licencia de la fábrica ha expirado — estado actual: ', pt: 'A licença da fábrica expirou — status atual: ', tr: 'Fabrika lisansı süresi doldu — mevcut durum: '})}
        <strong>{tx(lang, {fr: 'Lecture seule', ar: 'قراءة فقط', en: 'Read-only', es: 'Solo lectura', pt: 'Somente leitura', tr: 'Salt okunur'})}</strong>
        {tx(lang, {fr: '. Vous pouvez consulter vos données sans en ajouter de nouvelles. Veuillez renouveler la clé.', ar: '. يمكنك الاطلاع على بياناتك دون إضافة جديدة. يرجى تجديد المفتاح.', en: '. You can view your data without adding new ones. Please renew the key.', es: '. Puede consultar sus datos sin añadir nuevos. Por favor, renueve la clave.', pt: '. Você pode consultar seus dados sem adicionar novos. Por favor, renove a chave.', tr: '. Verilerinizi görüntüleyebilir ancak yeni ekleyemezsiniz. Lütfen anahtarı yenileyin.'})}
      </div>
    );
  }

  if (license.active && license.daysLeft > 0 && license.daysLeft <= 5) {
    return (
      <div className="w-full bg-amber-500 dark:bg-amber-700 text-white text-sm px-4 py-2 text-center">
        {tx(lang, {fr: 'L\'abonnement de l\'usine expire dans ', ar: 'اشتراك المصنع ينتهي خلال ', en: 'Factory subscription expires in ', es: 'La suscripción de la fábrica vence en ', pt: 'A assinatura da fábrica expira em ', tr: 'Fabrika aboneliği '})}
        {license.daysLeft}
        {tx(lang, {fr: ' jours. Veuillez renouveler pour éviter l\'arrêt du module.', ar: ' أيام. يرجى التجديد لتفادي توقّف الإضافة.', en: ' days. Please renew to avoid module suspension.', es: ' días. Renueve para evitar la suspensión del módulo.', pt: ' dias. Renove para evitar a suspensão do módulo.', tr: ' gün içinde sona eriyor. Modülün durdurulmaması için lütfen yenileyin.'})}
      </div>
    );
  }

  return null;
};

export default LicenseBanner;
