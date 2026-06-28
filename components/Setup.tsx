import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { Building2, User, Users, StopCircle, ChevronRight, ChevronLeft, CheckCircle2, Loader2, AlertCircle, Eye, EyeOff, ImagePlus, ScrollText, X, Sun, Moon, Monitor, SlidersHorizontal } from 'lucide-react';
import { AccountType } from '../app/accountTypes';
import { useTheme, useIsDark } from '../src/context/ThemeContext';
import { DEFAULT_CALENDAR_APP_SETTINGS } from '../lib/defaultCalendarSettings';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

type PrefLang = 'fr' | 'ar' | 'en' | 'es' | 'pt' | 'tr';

// Animation d'entrée rapide (plus réactive).
const welcomeContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.02, delayChildren: 0 } },
};
const welcomeItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

/**
 * Données renvoyées par POST /api/setup/init en cas de succès.
 * Le serveur renvoie { user: { id, email, name, role } }.
 */
interface SetupUser {
  id: number | string;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

interface Props {
  /** Appelé quand le setup réussit — transmet l'utilisateur admin créé. */
  onComplete: (user: SetupUser) => void;
}

type Step = 1 | 2 | 3 | 4;

const SPECIALTIES = [
  'Confection',
  'Tricotage',
  'Tissage',
  'Broderie',
  'Teinture & Finition',
  'Maroquinerie',
  'Linge de maison',
  'Tapis & Zerbia',
  'Coussins & Articles rembourrés',
  'Rideaux & Voilage',
  'Matelas & Literie',
  'Ameublement & Tapisserie',
  'Textile technique & Bâches',
  'Autre',
];

const FOCUS_AREAS = [
  'Chronométrage & Étude de temps',
  'Implantation & Équilibrage (SAM/CPM)',
  'Méthodes & Industrialisation',
  'Autre',
];

// Cartes de sélection du type de compte (étape 2).
const ACCOUNT_TYPE_CARDS: {
  type: AccountType;
  icon: typeof Building2;
  title: string;
  desc: string;
  accent: string;
}[] = [
  {
    type: 'societe',
    icon: Building2,
    title: 'Société / Usine',
    desc: "Gestion d'ateliers, suivi d'efficacité et calcul du prix de revient.",
    accent: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  },
  {
    type: 'client',
    icon: Users,
    title: "Client / Donneur d'ordres",
    desc: 'Suivi des commandes de confection à distance.',
    accent: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  },
  {
    type: 'personnel',
    icon: StopCircle,
    title: "Personnel / Bureau d'études",
    desc: 'Chronométrage indépendant et organisation des méthodes.',
    accent: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  },
];

// ── Indicateur d'étape ────────────────────────────────────────────────────────
// Défini au niveau module (pas dans Setup) : sinon le composant est recréé à
// chaque frappe et l'<input> perd le focus après 1 caractère.
function StepDot({ n, step }: { n: Step; step: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
          step > n
            ? 'bg-emerald-500 text-white'
            : step === n
            ? 'bg-slate-800 text-white'
            : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted border border-slate-200 dark:border-dk-border'
        }`}
      >
        {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      {n < 4 && (
        <div className={`w-7 h-0.5 transition-all ${step > n ? 'bg-emerald-400' : 'bg-slate-200'}`} />
      )}
    </div>
  );
}

// ── Champ texte réutilisable (niveau module : préserve le focus) ───────────────
function Field({
  label, type = 'text', value, onChange, placeholder, autoComplete, hint, required = true, error,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword && show ? 'text' : type;
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 dark:text-dk-text-soft uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition ${error ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 dark:border-dk-border focus:ring-emerald-400'} ${isPassword ? 'pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 dark:text-dk-muted hover:text-slate-600 transition-colors"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p className="text-[11px] text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400 dark:text-dk-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// ── Traînée de fumée émeraude ────────────────────────────────────────────────
// Chaque segment suit le curseur avec un ressort plus mou (plus de retard) →
// l'ensemble forme une queue qui s'étire au mouvement et se replie au repos.
// Du « rir1 » (tête, dense) vers la « queue » (large, diffuse, transparente).
const SMOKE_TRAIL: { size: number; stiffness: number; base: number; alpha: number }[] = [
  { size: 300, stiffness: 240, base: 0.55, alpha: 0.55 },
  { size: 300, stiffness: 150, base: 0.42, alpha: 0.42 },
  { size: 300, stiffness: 95, base: 0.32, alpha: 0.34 },
  { size: 300, stiffness: 62, base: 0.24, alpha: 0.26 },
  { size: 300, stiffness: 42, base: 0.17, alpha: 0.20 },
  { size: 300, stiffness: 28, base: 0.12, alpha: 0.15 },
];

function SmokeDot({
  pointerX, pointerY, intensity, cfg, index,
}: {
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  intensity: MotionValue<number>;
  cfg: (typeof SMOKE_TRAIL)[number];
  index: number;
}) {
  const sx = useSpring(pointerX, { stiffness: cfg.stiffness, damping: 26, mass: 0.5 });
  const sy = useSpring(pointerY, { stiffness: cfg.stiffness, damping: 26, mass: 0.5 });
  const x = useTransform(sx, (v) => v - cfg.size / 2);
  const y = useTransform(sy, (v) => v - cfg.size / 2);
  const opacity = useTransform(intensity, (v) => v * (cfg.base / 0.5));
  return (
    <motion.div
      aria-hidden
      style={{ x, y, opacity }}
      className="pointer-events-none absolute top-0 left-0"
    >
      {/* Ondulation interne : la fumée s'élève et serpente (queue mouvante). */}
      <motion.div
        className="blur-2xl rounded-full"
        style={{
          width: cfg.size,
          height: cfg.size,
          background: `radial-gradient(circle, rgba(16,185,129,${cfg.alpha}) 0%, rgba(5,150,105,0) 70%)`,
        }}
        animate={{ x: [0, 9, -7, 4, 0], y: [0, -20, -9, -16, 0], scale: [1, 1.14, 0.95, 1.07, 1] }}
        transition={{ duration: 7 + index * 1.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.18 }}
      />
    </motion.div>
  );
}

// ── Contrôle segmenté réutilisable (étape 4 — Paramètres) ────────────────────
function Seg<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { v: T; label: string; icon?: typeof Sun; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600 dark:text-dk-text-soft uppercase tracking-wide">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((o) => {
          const active = value === o.v;
          const Icon = o.icon;
          return (
            <button
              key={String(o.v)}
              type="button"
              disabled={o.disabled}
              onClick={() => { if (!o.disabled) onChange(o.v); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                o.disabled
                  ? 'bg-slate-50 dark:bg-dk-bg text-slate-300 dark:text-dk-muted border-slate-100 dark:border-dk-border cursor-not-allowed'
                  : active
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:border-slate-300'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Conditions Générales d'Utilisation (affichées et acceptées à l'étape 1) ──
const CGU_VERSION = '1.0';
const CGU_DATE = '23 juin 2026';
const CGU_SECTIONS: { title: string; body: string }[] = [
  { title: '1. Objet et acceptation', body: "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'utilisation du logiciel BERAMETHODE, système de gestion destiné à l'industrie textile. En cochant la case d'acceptation et en poursuivant la configuration, l'utilisateur reconnaît avoir lu, compris et accepté sans réserve l'intégralité des présentes CGU." },
  { title: "2. Licence d'utilisation", body: "BERAMETHODE est concédé sous licence, et non vendu. L'éditeur accorde un droit d'utilisation personnel, non exclusif et non cessible, limité à la durée et au périmètre définis par la clé de licence (nombre de postes, modules, durée). Toute utilisation au-delà de ces limites est interdite." },
  { title: '3. Utilisation autorisée', body: "L'utilisateur s'engage à utiliser le logiciel conformément à sa destination professionnelle. Sont interdits la décompilation, l'ingénierie inverse, la copie, la revente, la location ou toute tentative de contourner les mécanismes de licence ou de sécurité." },
  { title: '4. Propriété et responsabilité des données', body: "Les données saisies (modèles, coûts, ressources humaines, stocks, production) demeurent la propriété exclusive de l'utilisateur. Le logiciel fonctionnant en mode local, l'utilisateur est seul responsable de la sauvegarde, de l'intégrité et de la confidentialité de ses données." },
  { title: '5. Protection des données personnelles', body: "Le traitement des données personnelles est effectué conformément à la loi n° 09-08 et aux recommandations de la CNDP. L'utilisateur, en tant que responsable de traitement, garantit disposer des bases légales nécessaires pour les données qu'il saisit." },
  { title: '6. Synchronisation cloud et services tiers', body: "Certaines fonctions optionnelles reposent sur des services tiers : Supabase (synchronisation et sauvegarde cloud) et Google Gemini (assistance par intelligence artificielle). En les activant, l'utilisateur accepte que les données concernées transitent par ces services, soumis à leurs propres conditions. Ces fonctions peuvent être désactivées." },
  { title: '7. Propriété intellectuelle', body: "Le logiciel, son code, son interface, ses marques et sa documentation demeurent la propriété exclusive de l'éditeur. Aucune disposition des présentes ne confère à l'utilisateur un droit de propriété sur le logiciel." },
  { title: '8. Exactitude des calculs', body: "BERAMETHODE fournit des outils d'aide au calcul (prix de revient, temps, équilibrage, rendement). Ces résultats constituent une aide à la décision ; l'utilisateur demeure seul responsable de la vérification et de la validation des chiffres avant tout usage commercial, contractuel ou comptable." },
  { title: '9. Absence de garantie et limitation de responsabilité', body: "Le logiciel est fourni « en l'état ». L'éditeur ne saurait être tenu responsable des dommages directs ou indirects (pertes de données, pertes d'exploitation, erreurs de calcul, décisions de gestion) résultant de l'utilisation ou de l'impossibilité d'utiliser le logiciel." },
  { title: '10. Confidentialité de la clé de licence', body: "La clé de licence est strictement personnelle. L'utilisateur s'engage à en préserver la confidentialité et assume la responsabilité de toute utilisation effectuée au moyen de sa clé." },
  { title: '11. Durée, suspension et résiliation', body: "L'accès est conditionné par la validité de la licence. À l'expiration, en cas de suspension ou de révocation, l'accès peut être limité à un mode lecture seule ou interrompu, sans que les données locales de l'utilisateur ne soient supprimées par l'éditeur." },
  { title: '12. Mises à jour', body: "L'éditeur peut proposer des mises à jour visant à améliorer ou corriger le logiciel. Certaines mises à jour peuvent être nécessaires au bon fonctionnement ou à la sécurité." },
  { title: '13. Droit applicable', body: "Les présentes CGU sont régies par le droit marocain. Tout litige relèvera de la compétence des tribunaux compétents du Royaume du Maroc." },
  { title: '14. Contact', body: "Pour toute question relative aux présentes conditions : contactberamethode@gmail.com." },
];

export default function Setup({ onComplete }: Props) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const [step, setStep] = useState<Step>(1);

  // ── Traînée de fumée pilotée par la souris ─────────────────────────────────
  // pointerX/Y = position brute du curseur ; chaque segment (SmokeDot) la suit
  // avec son propre retard. intensity « respire » : vive au mouvement, douce au repos.
  const pointerX = useMotionValue(-9999);
  const pointerY = useMotionValue(-9999);
  const intensity = useMotionValue(0.12); // présence douce au repos
  const glowOpacity = useSpring(intensity, { stiffness: 90, damping: 22 });
  const idleTimer = useRef<number | null>(null);

  const handlePointerMove = (e: React.MouseEvent) => {
    pointerX.set(e.clientX);
    pointerY.set(e.clientY);
    intensity.set(0.5);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // À l'arrêt, retour en douceur à une lueur de repos (jamais totalement éteinte).
    idleTimer.current = window.setTimeout(() => intensity.set(0.12), 400);
  };

  // Étape 2 — type de compte choisi (null = écran de sélection)
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  // Logo de la société / personne — base64 (apparaîtra sur factures & documents).
  const [logo, setLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Réinitialise pour autoriser la re-sélection du même fichier après un échec.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(tx(lang,{fr:'Veuillez choisir un fichier image.',ar:'الرجاء اختيار ملف صورة.',en:'Please choose an image file.',es:'Por favor, elija un archivo de imagen.',pt:'Por favor, escolha um ficheiro de imagem.',tr:'Lütfen bir resim dosyası seçin.'})); return; }
    // On accepte n'importe quelle taille raisonnable : l'image est ensuite
    // redimensionnée et compressée côté client (logo léger pour documents & sync).
    if (file.size > 15 * 1024 * 1024) { setError(tx(lang,{fr:'Image trop volumineuse (max 15 Mo).',ar:'الصورة كبيرة جدًا (الحد الأقصى 15 ميغا).',en:'Image too large (max 15 MB).',es:'Imagen demasiado grande (máx. 15 MB).',pt:'Imagem demasiado grande (máx. 15 MB).',tr:'Resim çok büyük (maks. 15 MB).'})); return; }
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError(tx(lang,{fr:'Erreur lors de la lecture du fichier.',ar:'خطأ أثناء قراءة الملف.',en:'Error reading file.',es:'Error al leer el archivo.',pt:'Erro ao ler o ficheiro.',tr:'Dosya okunurken hata.'}));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) { setError(tx(lang,{fr:"Impossible de lire l'image.",ar:"تعذر قراءة الصورة.",en:"Could not read the image.",es:"No se pudo leer la imagen.",pt:"Não foi possível ler a imagem.",tr:"Resim okunamadı."})); return; }
      const img = new Image();
      img.onerror = () => setError(tx(lang,{fr:"Impossible de lire l'image choisie.",ar:"تعذر قراءة الصورة المختارة.",en:"Could not read the selected image.",es:"No se pudo leer la imagen seleccionada.",pt:"Não foi possível ler a imagem selecionada.",tr:"Seçilen resim okunamadı."}));
      img.onload = () => {
        const MAX = 512; // dimension max du logo
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setLogo(src); return; } // repli : image brute
        ctx.drawImage(img, 0, 0, width, height);
        // PNG (transparence) pour png/webp/gif ; JPEG plus léger sinon.
        const keepAlpha = /image\/(png|webp|gif)/.test(file.type);
        const out = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
        setLogo(out);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Étape 2 — infos société
  const [companyName, setCompanyName] = useState('');
  const [specialty, setSpecialty] = useState('');

  // Étape 2 — infos client (donneur d'ordres)
  const [clientName, setClientName] = useState('');
  const [region, setRegion] = useState('');

  // Étape 2 — infos personnel / indépendant (méthodes & chrono)
  const [expertName, setExpertName] = useState('');
  const [focusArea, setFocusArea] = useState('');

  // Étape 3 — compte admin
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');     // optionnel
  const [companyPhone, setCompanyPhone] = useState(''); // optionnel
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape 1 — acceptation obligatoire des CGU ; lecture du texte via un modal.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Étape 4 — Paramètres essentiels (branchés sur les réglages EXISTANTS).
  // Thème : ThemeContext (bera_theme). Devise/TVA : beramethode_settings.
  // Langue : bera_lang. Aucun stockage parallèle → pas de divergence.
  const { theme, setTheme } = useTheme();
  const [prefLang, setPrefLang] = useState<PrefLang>('fr');
  const [prefCurrency, setPrefCurrency] = useState<string>(DEFAULT_CALENDAR_APP_SETTINGS.currency || 'MAD');

  // ── Navigation ────────────────────────────────────────────────────────────
  // Validation de l'étape 2 selon le type de compte choisi.
  const canProceedStep2 =
    accountType === 'societe'
      ? companyName.trim().length >= 2 && specialty.trim().length > 0
      : accountType === 'client'
      ? clientName.trim().length >= 2 && region.trim().length > 0
      : accountType === 'personnel'
      ? expertName.trim().length >= 2 && focusArea.trim().length > 0
      : false;
  // Validation e-mail stricte : un simple '@' ne suffit pas (ex. « khbs2gmail.com »).
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim());
  const emailError = adminEmail.trim() && !emailValid ? tx(lang,{fr:'Adresse e-mail invalide (ex. : nom@gmail.com)',ar:'\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d (\u0645\u062b\u0627\u0644: example@gmail.com)',en:'Invalid email address (e.g.: name@gmail.com)',es:'Direcci\u00f3n de correo inv\u00e1lida (ej.: nombre@gmail.com)',pt:'Endere\u00e7o de email inv\u00e1lido (ex.: nome@gmail.com)',tr:'Ge\u00e7ersiz e-posta adresi (\u00f6rn: ad@gmail.com)'}) : undefined;
  const passwordError = adminPassword.length > 0 && adminPassword.length < 6 ? tx(lang,{fr:'Au moins 6 caractères',ar:'\u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 6 \u0623\u062d\u0631\u0641',en:'At least 6 characters',es:'Al menos 6 caracteres',pt:'Pelo menos 6 caracteres',tr:'En az 6 karakter'}) : undefined;
  const confirmError = confirmPassword.length > 0 && confirmPassword !== adminPassword ? tx(lang,{fr:'Les mots de passe ne correspondent pas',ar:'\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0633\u0631 \u0644\u0627 \u062a\u062a\u0637\u0627\u0628\u0642',en:'Passwords do not match',es:'Las contrase\u00f1as no coinciden',pt:'As palavras-passe n\u00e3o coincidem',tr:'\u015eifreler e\u015fle\u015fmiyor'}) : undefined;
  const canProceedStep3 =
    adminName.trim().length >= 2 &&
    emailValid &&
    adminPassword.length >= 6 &&
    adminPassword === confirmPassword;

  const handleNext = () => {
    if (step === 1 && !acceptedTerms) return; // CGU obligatoires
    if (step === 2 && !canProceedStep2) return;
    if (step === 3 && !canProceedStep3) return; // compte admin valide avant l'étape 4
    if (step < 4) setStep((s) => (s + 1) as Step);
  };

  // Persiste les préférences de l'étape 4 dans les réglages EXISTANTS
  // (localStorage), repris par App au montage + relus dans onComplete.
  const persistPreferences = () => {
    try {
      localStorage.setItem('bera_lang', prefLang);
      const raw = localStorage.getItem('beramethode_settings');
      const base = raw ? JSON.parse(raw) : DEFAULT_CALENDAR_APP_SETTINGS;
      const next = { ...DEFAULT_CALENDAR_APP_SETTINGS, ...base, currency: prefCurrency };
      localStorage.setItem('beramethode_settings', JSON.stringify(next));
    } catch { /* non bloquant : valeurs par défaut conservées */ }
    // Le thème est déjà appliqué/persisté en direct via ThemeContext (bera_theme).
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
    setError(null);
  };

  // ── Soumission finale ──────────────────────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canProceedStep3) return;
    persistPreferences(); // devise/TVA/langue/thème → réglages existants
    setError(null);
    setLoading(true);
    // Map des champs selon le type de compte vers le contrat serveur
    // (companyName est requis côté serveur quel que soit le type).
    // Numéros optionnels stockés dans profile_meta (aucun changement de schéma).
    const phoneMeta = {
      ...(adminPhone.trim() ? { adminPhone: adminPhone.trim() } : {}),
      ...(companyPhone.trim() ? { companyPhone: companyPhone.trim() } : {}),
    };
    const hasPhones = Object.keys(phoneMeta).length > 0;
    const payload =
      accountType === 'client'
        ? {
            accountType,
            companyName: clientName.trim(),
            specialty: null,
            profileMeta: { region: region.trim(), ...phoneMeta },
          }
        : accountType === 'personnel'
        ? {
            accountType,
            companyName: expertName.trim(),
            specialty: focusArea.trim(),
            profileMeta: { focusArea: focusArea.trim(), ...phoneMeta },
          }
        : {
            accountType: 'societe' as const,
            companyName: companyName.trim(),
            specialty: specialty.trim(),
            profileMeta: hasPhones ? phoneMeta : null,
          };
    try {
      const res = await fetch('/api/setup/init', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          logo,
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim().toLowerCase(),
          adminPassword,
          acceptedTermsVersion: CGU_VERSION,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || data?.error || tx(lang,{fr:'Une erreur est survenue lors de l\'initialisation.',ar:'\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062a\u0647\u064a\u0626\u0629.',en:'An error occurred during initialization.',es:'Se produjo un error durante la inicializaci\u00f3n.',pt:'Ocorreu um erro durante a inicializa\u00e7\u00e3o.',tr:'Ba\u015flatma s\u0131ras\u0131nda bir hata olu\u015ftu.'}));
        return;
      }
      if (!data?.user) {
        setError(tx(lang,{fr:'Réponse serveur inattendue. Veuillez réessayer.',ar:'\u0627\u0633\u062a\u062c\u0627\u0628\u0629 \u063a\u064a\u0631 \u0645\u062a\u0648\u0642\u0639\u0629 \u0645\u0646 \u0627\u0644\u062e\u0627\u062f\u0645. \u064a\u0631\u062c\u0649 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.',en:'Unexpected server response. Please try again.',es:'Respuesta del servidor inesperada. Por favor, int\u00e9ntelo de nuevo.',pt:'Resposta inesperada do servidor. Por favor, tente novamente.',tr:'Beklenmeyen sunucu yan\u0131t\u0131. L\u00fctfen tekrar deneyin.'}));
        return;
      }
      onComplete(data.user as SetupUser);
    } catch {
      setError(tx(lang,{fr:'Impossible de joindre le serveur. Vérifiez que l\'application est bien démarrée.',ar:'تعذر الاتصال بالخادم. تأكد من أن التطبيق قيد التشغيل.',en:'Could not reach the server. Make sure the application is running.',es:'No se pudo conectar con el servidor. Asegúrese de que la aplicación esté funcionando.',pt:'Não foi possível contactar o servidor. Certifique-se de que a aplicação está em execução.',tr:'Sunucuya ulaşılamadı. Uygulamanın çalıştığından emin olun.'}));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onMouseMove={handlePointerMove}
      className={`relative min-h-screen overflow-hidden flex items-center justify-center p-4 ${isDark ? 'bg-dk-bg' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}
    >
      {/* Traînée de fumée émeraude — de la queue (rendue d'abord, dessous) vers
          la tête (rendue en dernier, au-dessus du curseur). */}
      {[...SMOKE_TRAIL].reverse().map((cfg, i) => {
        const index = SMOKE_TRAIL.length - 1 - i; // 0 = tête, dernier = queue
        return (
          <SmokeDot
            key={index}
            index={index}
            cfg={cfg}
            pointerX={pointerX}
            pointerY={pointerY}
            intensity={glowOpacity}
          />
        );
      })}
      <div className="relative z-10 w-full max-w-md">
        {/* Titre */}
        <div className="text-center mb-8">
          {/* Input fichier (déclenché par le bouton logo de l'étape 1). */}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickLogo}
            className="hidden"
          />
          <div className="relative inline-block">
            {/* Halo doux qui « respire » derrière le logo — discret, équilibré. */}
            <motion.div
              aria-hidden
              className="absolute -inset-x-6 -inset-y-3 -z-10 bg-emerald-300/25 blur-2xl rounded-full"
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.92, 1.04, 0.92] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <h1 className="relative text-3xl font-black tracking-tight mb-1">
              <span className={`${isDark ? 'text-dk-text' : 'text-slate-900 dark:text-dk-text'}`}>BERA</span>
              {/* Bascule de lumière qui traverse doucement « METHODE ». */}
              <motion.span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(110deg, #047857 35%, #6ee7b7 50%, #047857 65%)',
                  backgroundSize: '250% 100%',
                }}
                animate={{ backgroundPosition: ['150% 0', '-150% 0'] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
              >
                METHODE
              </motion.span>
            </h1>
          </div>
          <p className={`text-sm mt-1 ${isDark ? 'text-dk-muted' : 'text-slate-500 dark:text-dk-muted'}`}>{tx(lang,{fr:'Configuration initiale',ar:'\u0627\u0644\u062a\u0647\u064a\u0626\u0629 \u0627\u0644\u0623\u0648\u0644\u064a\u0629',en:'Initial setup',es:'Configuraci\u00f3n inicial',pt:'Configura\u00e7\u00e3o inicial',tr:'\u0130lk kurulum'})}</p>
        </div>

        {/* Carte principale */}
        <div dir="ltr" className={`rounded-2xl shadow-sm dark:shadow-dk-sm p-8 ${isDark ? 'bg-dk-surface border border-dk-border' : 'bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border'}`}>
          {/* Indicateur d'étapes */}
          <div className="flex justify-center items-center mb-8">
            <StepDot n={1} step={step} />
            <StepDot n={2} step={step} />
            <StepDot n={3} step={step} />
            <StepDot n={4} step={step} />
          </div>

          {/* ── ÉTAPE 1 : Bienvenue ─────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div className="text-center" variants={welcomeContainer} initial="hidden" animate="show">
              {/* Icône hero avec halo doux */}
              <motion.div variants={welcomeItem} className="relative inline-flex items-center justify-center mb-5">
                <div className="absolute inset-0 bg-emerald-200/50 blur-2xl rounded-full" aria-hidden />
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-100 rounded-2xl">
                  <Building2 className="w-8 h-8 text-emerald-500" />
                </div>
              </motion.div>

              <motion.h2 variants={welcomeItem} className="text-2xl font-black text-slate-900 dark:text-dk-text tracking-tight mb-2">{tx(lang,{fr:'Bienvenue !',ar:'\u0623\u0647\u0644\u0627 \u0648\u0633\u0647\u0644\u0627 !',en:'Welcome!',es:'\u00a1Bienvenido!',pt:'Bem-vindo!',tr:'Ho\u015f geldiniz!'})}</motion.h2>
              <motion.p variants={welcomeItem} className="text-sm text-slate-500 dark:text-dk-muted leading-relaxed mb-7">
                {tx(lang,{fr:'C\'est la premi\u00e8re fois que vous lancez BERAMETHODE sur cet appareil.',ar:'\u0647\u0630\u0647 \u0647\u064a \u0627\u0644\u0645\u0631\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0627\u0644\u062a\u064a \u062a\u0642\u0648\u0645 \u0641\u064a\u0647\u0627 \u0628\u062a\u0634\u063a\u064a\u0644 BERAMETHODE \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062c\u0647\u0627\u0632.',en:'This is the first time you launch BERAMETHODE on this device.',es:'Es la primera vez que inicia BERAMETHODE en este dispositivo.',pt:'\u00c9 a primeira vez que inicia o BERAMETHODE neste dispositivo.',tr:'BERAMETHODE\'yi bu cihazda ilk kez ba\u015flat\u0131yorsunuz.'})}
                <br />
                {tx(lang,{fr:'Configurons votre espace de travail en ',ar:'\u0644\u0646\u0642\u0645 \u0628\u062a\u0647\u064a\u0626\u0629 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644 \u0641\u064a ',en:'Set up your workspace in ',es:'Configuremos su espacio de trabajo en ',pt:'Vamos configurar o seu espa\u00e7o de trabalho em ',tr:'\u00c7al\u0131\u015fma alan\u0131n\u0131z\u0131 \u015fu kadar ad\u0131mda yap\u0131land\u0131ral\u0131m: '})}<strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:'4 \u00e9tapes rapides',ar:'4 \u062e\u0637\u0648\u0627\u062a \u0633\u0631\u064a\u0639\u0629',en:'4 quick steps',es:'4 pasos r\u00e1pidos',pt:'4 passos r\u00e1pidos',tr:'4 h\u0131zl\u0131 ad\u0131m'})}</strong>.
              </motion.p>

              {/* Étapes numérotées */}
              <motion.ul variants={welcomeItem} className="text-left space-y-2 mb-6">
                  {[
                    tx(lang,{fr:'Type d\'activité',ar:'\u0646\u0648\u0639 \u0627\u0644\u0646\u0634\u0627\u0637',en:'Activity type',es:'Tipo de actividad',pt:'Tipo de atividade',tr:'Faaliyet türü'}),
                    tx(lang,{fr:'Vos informations & logo',ar:'\u0645\u0639\u0644\u0648\u0645\u0627\u062a\u0643 \u0648\u0627\u0644\u0634\u0639\u0627\u0631',en:'Your info & logo',es:'Su información y logo',pt:'As suas informações e logótipo',tr:'Bilgileriniz ve logo'}),
                    tx(lang,{fr:'Compte administrateur',ar:'\u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0633\u0624\u0648\u0644',en:'Admin account',es:'Cuenta de administrador',pt:'Conta de administrador',tr:'Yönetici hesabı'}),
                    tx(lang,{fr:'Préférences',ar:'التفضيلات',en:'Preferences',es:'Preferencias',pt:'Preferências',tr:'Tercihler'}),
              ].map((label, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 bg-slate-50 dark:bg-dk-bg rounded-xl px-4 py-3 border border-slate-100 dark:border-dk-border transition-opacity ${
                      i === 0 ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-sm text-slate-600 dark:text-dk-text-soft">{label}</span>
                  </li>
                ))}
              </motion.ul>

              {/* Acceptation des CGU — texte complet consultable via le lien (modal) */}
              <motion.label variants={welcomeItem} className="flex items-start gap-2.5 text-left mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 dark:text-emerald-400 focus:ring-emerald-400"
                />
                <span className="text-xs text-slate-600 dark:text-dk-text-soft">
                  {tx(lang,{fr:'J\'ai lu et j\'accepte les ',ar:'\u0644\u0642\u062f \u0642\u0631\u0623\u062a \u0648\u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 ',en:'I have read and accept the ',es:'He le\u00eddo y acepto los ',pt:'Li e aceito os ',tr:'Okudum ve kabul ediyorum: '})}{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                    className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                  >
                    {tx(lang,{fr:'Conditions Générales d\'Utilisation',ar:'الشروط العامة للاستخدام',en:'Terms and Conditions',es:'Términos y Condiciones de Uso',pt:'Termos e Condições de Utilização',tr:'Kullanım Şartları'})}
                  </button>.
                </span>
              </motion.label>

              <motion.div variants={welcomeItem}>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!acceptedTerms}
                  className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm dark:shadow-dk-sm shadow-emerald-600/25"
                >
                  {tx(lang,{fr:'Commencer',ar:'البدء',en:'Start',es:'Comenzar',pt:'Começar',tr:'Başla'})}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ── ÉTAPE 2a : Choix du type d'activité ──────────────────────────── */}
          {step === 2 && !accountType && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Type d\'activit\u00e9',ar:'\u0646\u0648\u0639 \u0627\u0644\u0646\u0634\u0627\u0637',en:'Activity type',es:'Tipo de actividad',pt:'Tipo de atividade',tr:'Faaliyet t\u00fcr\u00fc'})}</h2>
                <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'S\u00e9lectionnez votre profil pour adapter l\'interface.',ar:'\u0627\u062e\u062a\u0631 \u0645\u0644\u0641\u0643 \u0644\u062a\u0643\u064a\u064a\u0641 \u0627\u0644\u0648\u0627\u062c\u0647\u0629.',en:'Select your profile to adapt the interface.',es:'Seleccione su perfil para adaptar la interfaz.',pt:'Selecione o seu perfil para adaptar a interface.',tr:'Aray\u00fcz\u00fc uyarlamak i\u00e7in profilinizi se\u00e7in.'})}</p>
              </div>

              <div className="space-y-2.5">
                {ACCOUNT_TYPE_CARDS.map(({ type, icon: Icon, title, desc, accent }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccountType(type)}
                    className="w-full text-left p-3.5 border border-slate-200 dark:border-dk-border rounded-xl hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors flex items-center gap-3"
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-dk-text">{title}</h4>
                      <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-dk-muted hover:text-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2b : Informations + logo selon le type d'activité ──────── */}
          {step === 2 && accountType && (
            <div>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-dk-text">
                    {accountType === 'societe' && tx(lang,{fr:'Votre soci\u00e9t\u00e9',ar:'\u0634\u0631\u0643\u062a\u0643',en:'Your company',es:'Su empresa',pt:'A sua empresa',tr:'\u015eirketiniz'})}
                    {accountType === 'client' && tx(lang,{fr:'Informations client',ar:'\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0639\u0645\u064a\u0644',en:'Client information',es:'Informaci\u00f3n del cliente',pt:'Informa\u00e7\u00f5es do cliente',tr:'M\u00fc\u015fteri bilgileri'})}
                    {accountType === 'personnel' && tx(lang,{fr:'Profil ind\u00e9pendant',ar:'\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0633\u062a\u0642\u0644',en:'Freelance profile',es:'Perfil independiente',pt:'Perfil independente',tr:'Serbest \u00e7al\u0131\u015fan profili'})}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'Ces informations appara\u00eetront sur vos documents',ar:'\u0633\u062a\u0638\u0647\u0631 \u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0639\u0644\u0649 \u0645\u0633\u062a\u0646\u062f\u0627\u062a\u0643',en:'This information will appear on your documents',es:'Esta informaci\u00f3n aparecer\u00e1 en sus documentos',pt:'Estas informa\u00e7\u00f5es aparecer\u00e3o nos seus documentos',tr:'Bu bilgiler belgelerinizde g\u00f6r\u00fcnecek'})}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAccountType(null); setStep(1); }}
                  className="shrink-0 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {tx(lang,{fr:'Changer de type',ar:'\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0646\u0648\u0639',en:'Change type',es:'Cambiar tipo',pt:'Alterar tipo',tr:'T\u00fcr\u00fc de\u011fi\u015ftir'})}
                </button>
              </div>

              {/* Logo — apparaîtra sur les factures & documents */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border rounded-xl">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  aria-label={tx(lang,{fr:'Choisir le logo',ar:'\u0627\u062e\u062a\u0631 \u0627\u0644\u0634\u0639\u0627\u0631',en:'Choose logo',es:'Elegir logotipo',pt:'Escolher log\u00f3tipo',tr:'Logo se\u00e7'})}
                  className="group relative w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 dark:border-dk-border hover:border-emerald-400 bg-white dark:bg-dk-surface hover:bg-emerald-50/40 flex items-center justify-center overflow-hidden transition-colors shrink-0"
                >
                  {logo ? (
                    <img src={logo} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-slate-400 dark:text-dk-muted group-hover:text-emerald-500 transition-colors" />
                  )}
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="text-sm font-medium text-slate-700 dark:text-dk-text-soft hover:text-emerald-600 transition-colors"
                  >
                    {logo ? tx(lang,{fr:'Changer le logo',ar:'\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0634\u0639\u0627\u0631',en:'Change logo',es:'Cambiar logotipo',pt:'Alterar log\u00f3tipo',tr:'Logoyu de\u011fi\u015ftir'}) : tx(lang,{fr:'Ajouter un logo',ar:'\u0625\u0636\u0627\u0641\u0629 \u0634\u0639\u0627\u0631',en:'Add a logo',es:'A\u00f1adir logotipo',pt:'Adicionar log\u00f3tipo',tr:'Logo ekle'})}
                  </button>
                  <p className="text-xs text-slate-400 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'Optionnel \u2014 appara\u00eetra sur vos documents.',ar:'\u0627\u062e\u062a\u064a\u0627\u0631\u064a \u2014 \u0633\u064a\u0638\u0647\u0631 \u0639\u0644\u0649 \u0645\u0633\u062a\u0646\u062f\u0627\u062a\u0643.',en:'Optional \u2014 will appear on your documents.',es:'Opcional \u2014 aparecer\u00e1 en sus documentos.',pt:'Opcional \u2014 aparecer\u00e1 nos seus documentos.',tr:'\u0130ste\u011fe ba\u011fl\u0131 \u2014 belgelerinizde g\u00f6r\u00fcnecek.'})}</p>
                </div>
              </div>

              {/* Erreur éventuelle (ex. fichier logo invalide) */}
              {error && (
                <div className="mb-5 flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Champs — Société */}
              {accountType === 'societe' && (
                <div className="space-y-4">
                  <Field
                    label={tx(lang,{fr:'Nom de la soci\u00e9t\u00e9',ar:'\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629',en:'Company name',es:'Nombre de la empresa',pt:'Nome da empresa',tr:'\u015eirket ad\u0131'})}
                    value={companyName}
                    onChange={setCompanyName}
                    placeholder={tx(lang,{fr:'Ex. : Confection Atlas SARL',ar:'\u0645\u062b\u0627\u0644: Confection Atlas SARL',en:'E.g.: Confection Atlas SARL',es:'Ej.: Confection Atlas SARL',pt:'Ex.: Confection Atlas SARL',tr:'\u00d6rn: Confection Atlas SARL'})}
                    autoComplete="organization"
                  />
                  <div className="flex flex-col gap-1">
                    label={tx(lang,{fr:'Sp\u00e9cialit\u00e9',ar:'\u0627\u0644\u062a\u062e\u0635\u0635',en:'Specialty',es:'Especialidad',pt:'Especialidade',tr:'Uzmanl\u0131k'})}
                    <select
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                    >
                      <option value="" disabled>{tx(lang,{fr:'S\u00e9lectionner une sp\u00e9cialit\u00e9\u2026',ar:'\u0627\u062e\u062a\u0631 \u062a\u062e\u0635\u0635\u0627\u064b\u2026',en:'Select a specialty\u2026',es:'Seleccione una especialidad\u2026',pt:'Selecione uma especialidade\u2026',tr:'Bir uzmanl\u0131k se\u00e7in\u2026'})}</option>
                      {SPECIALTIES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Champs — Client */}
              {accountType === 'client' && (
                <div className="space-y-4">
                  <Field
                    label={tx(lang,{fr:'Nom de la marque / client',ar:'\u0627\u0633\u0645 \u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629 / \u0627\u0644\u0639\u0645\u064a\u0644',en:'Brand / client name',es:'Nombre de la marca / cliente',pt:'Nome da marca / cliente',tr:'Marka / m\u00fc\u015fteri ad\u0131'})}
                    value={clientName}
                    onChange={setClientName}
                    placeholder={tx(lang,{fr:'Ex. : Zara / Inditex Buying',ar:'\u0645\u062b\u0627\u0644: Zara / Inditex Buying',en:'E.g.: Zara / Inditex Buying',es:'Ej.: Zara / Inditex Buying',pt:'Ex.: Zara / Inditex Buying',tr:'\u00d6rn: Zara / Inditex Buying'})}
                    autoComplete="organization"
                  />
                  <Field
                    label={tx(lang,{fr:'R\u00e9gion principale d\'importation',ar:'\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629 \u0644\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f',en:'Main import region',es:'Regi\u00f3n principal de importaci\u00f3n',pt:'Regi\u00e3o principal de importa\u00e7\u00e3o',tr:'Ana ithalat b\u00f6lgesi'})}
                    value={region}
                    onChange={setRegion}
                    placeholder={tx(lang,{fr:'Ex. : Espagne / Europe',ar:'\u0645\u062b\u0627\u0644: \u0625\u0633\u0628\u0627\u0646\u064a\u0627 / \u0623\u0648\u0631\u0648\u0628\u0627',en:'E.g.: Spain / Europe',es:'Ej.: Espa\u00f1a / Europa',pt:'Ex.: Espanha / Europa',tr:'\u00d6rn: \u0130spanya / Avrupa'})}
                  />
                </div>
              )}

              {/* Champs — Personnel / indépendant */}
              {accountType === 'personnel' && (
                <div className="space-y-4">
                  <Field
                    label={tx(lang,{fr:'Nom complet de l\'expert',ar:'\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u062e\u0628\u064a\u0631',en:'Expert full name',es:'Nombre completo del experto',pt:'Nome completo do perito',tr:'Uzman\u0131n tam ad\u0131'})}
                    value={expertName}
                    onChange={setExpertName}
                    placeholder={tx(lang,{fr:'Ex. : Soulaimane Berraadi',ar:'\u0645\u062b\u0627\u0644: Soulaimane Berraadi',en:'E.g.: Soulaimane Berraadi',es:'Ej.: Soulaimane Berraadi',pt:'Ex.: Soulaimane Berraadi',tr:'\u00d6rn: Soulaimane Berraadi'})}
                    autoComplete="name"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-dk-text-soft uppercase tracking-wide">{tx(lang,{fr:'Sp\u00e9cialisation principale',ar:'\u0627\u0644\u062a\u062e\u0635\u0635 \u0627\u0644\u0631\u0626\u064a\u0633\u064a',en:'Main specialization',es:'Especializaci\u00f3n principal',pt:'Especializa\u00e7\u00e3o principal',tr:'Ana uzmanl\u0131k'})}</label>
                    <select
                      value={focusArea}
                      onChange={(e) => setFocusArea(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                    >
                      <option value="" disabled>{tx(lang,{fr:'S\u00e9lectionner une sp\u00e9cialisation\u2026',ar:'\u0627\u062e\u062a\u0631 \u062a\u062e\u0635\u0635\u0627\u064b\u2026',en:'Select a specialization\u2026',es:'Seleccione una especializaci\u00f3n\u2026',pt:'Selecione uma especializa\u00e7\u00e3o\u2026',tr:'Bir uzmanl\u0131k se\u00e7in\u2026'})}</option>
                      {FOCUS_AREAS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setAccountType(null)}
                  className="flex-1 py-2.5 px-4 border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceedStep2}
                  className="flex-[2] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  {tx(lang,{fr:'Continuer',ar:'متابعة',en:'Continue',es:'Continuar',pt:'Continuar',tr:'Devam et'})}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : Compte admin ───────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }}>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Compte administrateur',ar:'\u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0633\u0624\u0648\u0644',en:'Admin account',es:'Cuenta de administrador',pt:'Conta de administrador',tr:'Y\u00f6netici hesab\u0131'})}</h2>
                <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'Ce compte aura acc\u00e8s \u00e0 toutes les fonctionnalit\u00e9s',ar:'\u0633\u064a\u0643\u0648\u0646 \u0644\u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628 \u062f\u0633\u062a\u0648\u062d \u0625\u0644\u0649 \u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0638\u0627\u0626\u0641',en:'This account will have access to all features',es:'Esta cuenta tendr\u00e1 acceso a todas las funciones',pt:'Esta conta ter\u00e1 acesso a todas as funcionalidades',tr:'Bu hesab\u0131n t\u00fcm \u00f6zelliklere eri\u015fimi olacak'})}</p>
              </div>

              <div className="space-y-4">
                <Field
                  label={tx(lang,{fr:'Nom complet',ar:'\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644',en:'Full name',es:'Nombre completo',pt:'Nome completo',tr:'Ad Soyad'})}
                  value={adminName}
                  onChange={setAdminName}
                  placeholder={tx(lang,{fr:'Ex. : Soulaimane Berraadi',ar:'مثال: Soulaimane Berraadi',en:'E.g.: Soulaimane Berraadi',es:'Ej.: Soulaimane Berraadi',pt:'Ex.: Soulaimane Berraadi',tr:'Örn: Soulaimane Berraadi'})}
                  autoComplete="name"
                />
                <Field
                  label={tx(lang,{fr:'Adresse e-mail',ar:'\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',en:'Email address',es:'Direcci\u00f3n de correo',pt:'Endere\u00e7o de email',tr:'E-posta adresi'})}
                  type="email"
                  value={adminEmail}
                  onChange={setAdminEmail}
                  placeholder={tx(lang,{fr:'exemple@gmail.com',ar:'\u0645\u062b\u0627\u0644@gmail.com',en:'example@gmail.com',es:'ejemplo@gmail.com',pt:'exemplo@gmail.com',tr:'ornek@gmail.com'})}
                  autoComplete="email"
                  error={emailError}
                />
                <Field
                  label={tx(lang,{fr:'T\u00e9l\u00e9phone personnel',ar:'\u0627\u0644\u0647\u0627\u062a\u0641 \u0627\u0644\u0634\u062e\u0635\u064a',en:'Personal phone',es:'Tel\u00e9fono personal',pt:'Telem\u00f3vel pessoal',tr:'Ki\u015fisel telefon'})}
                  type="tel"
                  value={adminPhone}
                  onChange={setAdminPhone}
                  placeholder={tx(lang,{fr:'Ex. : 06 12 34 56 78',ar:'\u0645\u062b\u0627\u0644: 06 12 34 56 78',en:'E.g.: 06 12 34 56 78',es:'Ej.: 06 12 34 56 78',pt:'Ex.: 06 12 34 56 78',tr:'\u00d6rn: 06 12 34 56 78'})}
                  autoComplete="tel"
                  required={false}
                  hint={tx(lang,{fr:'Optionnel',ar:'\u0627\u062e\u062a\u064a\u0627\u0631\u064a',en:'Optional',es:'Opcional',pt:'Opcional',tr:'\u0130ste\u011fe ba\u011fl\u0131'})}
                />
                <Field
                  label={tx(lang,{fr:'T\u00e9l\u00e9phone de la soci\u00e9t\u00e9',ar:'\u0647\u0627\u062a\u0641 \u0627\u0644\u0634\u0631\u0643\u0629',en:'Company phone',es:'Tel\u00e9fono de la empresa',pt:'Telefone da empresa',tr:'\u015eirket telefonu'})}
                  type="tel"
                  value={companyPhone}
                  onChange={setCompanyPhone}
                  placeholder={tx(lang,{fr:'Ex. : 05 22 00 00 00',ar:'\u0645\u062b\u0627\u0644: 05 22 00 00 00',en:'E.g.: 05 22 00 00 00',es:'Ej.: 05 22 00 00 00',pt:'Ex.: 05 22 00 00 00',tr:'\u00d6rn: 05 22 00 00 00'})}
                  autoComplete="tel"
                  required={false}
                  hint="Optionnel"
                />
                <Field
                  label={tx(lang,{fr:'Mot de passe',ar:'\u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631',en:'Password',es:'Contrase\u00f1a',pt:'Palavra-passe',tr:'\u015eifre'})}
                  type="password"
                  value={adminPassword}
                  onChange={setAdminPassword}
                  placeholder={tx(lang,{fr:'Minimum 6 caract\u00e8res',ar:'\u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 6 \u0623\u062d\u0631\u0641',en:'At least 6 characters',es:'M\u00ednimo 6 caracteres',pt:'M\u00ednimo 6 caracteres',tr:'En az 6 karakter'})}
                  autoComplete="new-password"
                  hint={tx(lang,{fr:'Au moins 6 caract\u00e8res',ar:'\u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 6 \u0623\u062d\u0631\u0641',en:'At least 6 characters',es:'Al menos 6 caracteres',pt:'Pelo menos 6 caracteres',tr:'En az 6 karakter'})}
                  error={passwordError}
                />
                <Field
                  label={tx(lang,{fr:'Confirmer le mot de passe',ar:'\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631',en:'Confirm password',es:'Confirmar contrase\u00f1a',pt:'Confirmar palavra-passe',tr:'\u015eifreyi onayla'})}
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={tx(lang,{fr:'R\u00e9p\u00e9tez le mot de passe',ar:'\u0623\u0639\u062f \u0625\u062f\u062e\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631',en:'Repeat password',es:'Repita la contrase\u00f1a',pt:'Repita a palavra-passe',tr:'\u015eifreyi tekrarlay\u0131n'})}
                  autoComplete="new-password"
                  error={confirmError}
                />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!canProceedStep3 && (
                <p className="mt-4 text-[11px] text-slate-400 dark:text-dk-muted text-center">
                  {tx(lang,{fr:'Renseignez un nom, un e-mail valide et un mot de passe (6+ caractères) identique pour continuer.',ar:'أدخل اسماً وبريداً إلكترونياً صالحاً وكلمة سر (6+ أحرف) متطابقة للمتابعة.',en:'Enter a name, a valid email and a matching password (6+ characters) to continue.',es:'Introduzca un nombre, un correo válido y una contraseña (6+ caracteres) coincidente para continuar.',pt:'Introduza um nome, um e-mail válido e uma palavra-passe (6+ caracteres) correspondente para continuar.',tr:'Devam etmek için bir ad, geçerli bir e-posta ve eşleşen bir şifre (6+ karakter) girin.'})}
                  <br />{tx(lang,{fr:'Le téléphone reste optionnel.',ar:'الهاتف اختياري.',en:'Phone is optional.',es:'El teléfono sigue siendo opcional.',pt:'O telefone continua opcional.',tr:'Telefon isteğe bağlıdır.'})}
                </p>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center justify-center gap-1.5 transition-colors text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                </button>
                <button
                  type="submit"
                  disabled={!canProceedStep3}
                  className="flex-[2] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  {tx(lang,{fr:'Continuer',ar:'متابعة',en:'Continue',es:'Continuar',pt:'Continuar',tr:'Devam et'})}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ── ÉTAPE 4 : Préférences (branchées sur les réglages existants) ──── */}
          {step === 4 && (
            <div>
              <div className="mb-6 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Pr\u00e9f\u00e9rences',ar:'\u0627\u0644\u062a\u0641\u0636\u064a\u0644\u0627\u062a',en:'Preferences',es:'Preferencias',pt:'Prefer\u00eancias',tr:'Tercihler'})}</h2>
                  <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'Valeurs par d\u00e9faut \u2014 modifiables \u00e0 tout moment dans Configuration.',ar:'\u0627\u0644\u0642\u064a\u0645 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629 \u2014 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062a\u063a\u064a\u064a\u0631 \u0641\u064a \u0623\u064a \u0648\u0642\u062a \u0645\u0646 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a.',en:'Default values \u2014 can be changed anytime in Settings.',es:'Valores por defecto \u2014 modificables en cualquier momento en Configuraci\u00f3n.',pt:'Valores predefinidos \u2014 alter\u00e1veis a qualquer momento na Configura\u00e7\u00e3o.',tr:'Varsay\u0131lan de\u011ferler \u2014 Ayarlar\'dan her zaman de\u011fi\u015ftirilebilir.'})}</p>
                </div>
              </div>

              <div className="space-y-5">
                <Seg<PrefLang>
                  label={tx(lang,{fr:'Langue',ar:'\u0627\u0644\u0644\u063a\u0629',en:'Language',es:'Idioma',pt:'Idioma',tr:'Dil'})}
                  value={prefLang}
                  onChange={setPrefLang}
                  options={[
                    { v: 'fr', label: 'Français' },
                    { v: 'ar', label: 'العربية' },
                    { v: 'en', label: 'English' },
                    { v: 'es', label: 'Español' },
                    { v: 'pt', label: 'Português' },
                    { v: 'tr', label: 'Türkçe' },
                  ]}
                />
                <Seg
                  label={tx(lang,{fr:'Th\u00e8me',ar:'\u0627\u0644\u0645\u0646\u0638\u0631',en:'Theme',es:'Tema',pt:'Tema',tr:'Tema'})}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { v: 'light', label: tx(lang,{fr:'Clair',ar:'\u0641\u0627\u062a\u062d',en:'Light',es:'Claro',pt:'Claro',tr:'A\u00e7\u0131k'}), icon: Sun },
                    { v: 'dark', label: tx(lang,{fr:'Sombre',ar:'\u062f\u0627\u0643\u0646',en:'Dark',es:'Oscuro',pt:'Escuro',tr:'Koyu'}), icon: Moon },
                    { v: 'system', label: tx(lang,{fr:'Auto',ar:'\u062a\u0644\u0642\u0627\u0626\u064a',en:'System',es:'Auto',pt:'Auto',tr:'Sistem'}), icon: Monitor },
                  ]}
                />
                <Seg<string>
                  label={tx(lang,{fr:'Devise par d\u00e9faut',ar:'\u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629',en:'Default currency',es:'Moneda por defecto',pt:'Moeda predefinida',tr:'Varsay\u0131lan para birimi'})}
                  value={prefCurrency}
                  onChange={setPrefCurrency}
                  options={[
                    { v: 'MAD', label: 'MAD (د.م.)' },
                    { v: 'EUR', label: 'EUR (€)' },
                    { v: 'USD', label: 'USD ($)' },
                  ]}
                />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center justify-center gap-1.5 transition-colors text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading}
                  className="text-xs text-slate-500 dark:text-dk-muted hover:text-slate-700 transition-colors px-2 disabled:opacity-40"
                >
                  {tx(lang,{fr:'Passer',ar:'تخطي',en:'Skip',es:'Saltar',pt:'Saltar',tr:'Atla'})}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading}
                  className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {tx(lang,{fr:'Initialisation\u2026',ar:'\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u0647\u064a\u0626\u0629\u2026',en:'Initializing\u2026',es:'Inicializando\u2026',pt:'A inicializar\u2026',tr:'Ba\u015flat\u0131l\u0131yor\u2026'})}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {tx(lang,{fr:'Terminer',ar:'إنهاء',en:'Finish',es:'Finalizar',pt:'Terminar',tr:'Bitir'})}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className={`text-center text-xs mt-4 ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>
          {tx(lang,{fr:'BERAMETHODE \u2014 Syst\u00e8me de gestion textile',ar:'BERAMETHODE \u2014 \u0646\u0638\u0627\u0645 \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0633\u0648\u062c\u0627\u062a',en:'BERAMETHODE \u2014 Textile management system',es:'BERAMETHODE \u2014 Sistema de gesti\u00f3n textil',pt:'BERAMETHODE \u2014 Sistema de gest\u00e3o t\u00eaxteis',tr:'BERAMETHODE \u2014 Tekstil y\u00f6netim sistemi'})}
        </p>
      </div>

      {/* ── Modal : texte complet des Conditions Générales d'Utilisation ──────── */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setShowTerms(false)}
        >
          <motion.div
            dir="ltr"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-xl dark:shadow-dk-elevated overflow-hidden ${isDark ? 'bg-dk-surface border border-dk-border' : 'bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border'}`}
          >
            <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? 'border-dk-border' : 'border-slate-100 dark:border-dk-border'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <ScrollText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-dk-text truncate">{tx(lang,{fr:'Conditions G\u00e9n\u00e9rales d\'Utilisation',ar:'\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0639\u0627\u0645\u0629 \u0644\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645',en:'Terms and Conditions',es:'T\u00e9rminos y Condiciones de Uso',pt:'Termos e Condi\u00e7\u00f5es de Utiliza\u00e7\u00e3o',tr:'Kullan\u0131m \u015eartlar\u0131'})}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                aria-label={tx(lang,{fr:'Fermer',ar:'\u0625\u063a\u0644\u0627\u0642',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
                className="text-slate-400 dark:text-dk-muted hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={`overflow-y-auto px-5 py-4 text-xs leading-relaxed space-y-3 ${isDark ? 'text-dk-text' : 'text-slate-600 dark:text-dk-text-soft'}`}>
              <p className="text-[11px] text-slate-400 dark:text-dk-muted">Version {CGU_VERSION} — {CGU_DATE}</p>
              {CGU_SECTIONS.map((s) => (
                <div key={s.title}>
                  <h4 className="font-semibold text-slate-700 dark:text-dk-text-soft mb-0.5">{s.title}</h4>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-dk-border">
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="flex-1 py-2.5 px-4 border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors text-sm"
              >
                {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
              </button>
              <button
                type="button"
                onClick={() => { setAcceptedTerms(true); setShowTerms(false); }}
                className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                {tx(lang,{fr:'J\'accepte',ar:'أوافق',en:'I accept',es:'Acepto',pt:'Aceito',tr:'Kabul ediyorum'})}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
