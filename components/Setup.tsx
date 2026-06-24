import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { Building2, User, Users, StopCircle, ChevronRight, ChevronLeft, CheckCircle2, Loader2, AlertCircle, Eye, EyeOff, ImagePlus, ScrollText, X, Sun, Moon, Monitor, SlidersHorizontal } from 'lucide-react';
import { AccountType } from '../app/accountTypes';
import { useTheme } from '../src/context/ThemeContext';
import { DEFAULT_CALENDAR_APP_SETTINGS } from '../lib/defaultCalendarSettings';

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
    accent: 'bg-emerald-50 text-emerald-600',
  },
  {
    type: 'client',
    icon: Users,
    title: "Client / Donneur d'ordres",
    desc: 'Suivi des commandes de confection à distance.',
    accent: 'bg-blue-50 text-blue-600',
  },
  {
    type: 'personnel',
    icon: StopCircle,
    title: "Personnel / Bureau d'études",
    desc: 'Chronométrage indépendant et organisation des méthodes.',
    accent: 'bg-purple-50 text-purple-600',
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
            : 'bg-slate-100 text-slate-400 border border-slate-200'
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
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition ${error ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-emerald-400'} ${isPassword ? 'pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors"
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
        <p className="text-[11px] text-slate-400">{hint}</p>
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
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
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
                  ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                  : active
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
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
    if (!file.type.startsWith('image/')) { setError('Veuillez choisir un fichier image.'); return; }
    // On accepte n'importe quelle taille raisonnable : l'image est ensuite
    // redimensionnée et compressée côté client (logo léger pour documents & sync).
    if (file.size > 15 * 1024 * 1024) { setError('Image trop volumineuse (max 15 Mo).'); return; }
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError('Erreur lors de la lecture du fichier.');
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) { setError("Impossible de lire l'image."); return; }
      const img = new Image();
      img.onerror = () => setError("Impossible de lire l'image choisie.");
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
  const emailError = adminEmail.trim() && !emailValid ? 'Adresse e-mail invalide (ex. : nom@gmail.com)' : undefined;
  const passwordError = adminPassword.length > 0 && adminPassword.length < 6 ? 'Au moins 6 caractères' : undefined;
  const confirmError = confirmPassword.length > 0 && confirmPassword !== adminPassword ? 'Les mots de passe ne correspondent pas' : undefined;
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
        setError(data?.message || data?.error || 'Une erreur est survenue lors de l\'initialisation.');
        return;
      }
      if (!data?.user) {
        setError('Réponse serveur inattendue. Veuillez réessayer.');
        return;
      }
      onComplete(data.user as SetupUser);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez que l\'application est bien démarrée.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onMouseMove={handlePointerMove}
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4"
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
              <span className="text-slate-900">BERA</span>
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
          <p className="text-sm text-slate-500 mt-1">Configuration initiale</p>
        </div>

        {/* Carte principale */}
        <div dir="ltr" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
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
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-emerald-50 ring-1 ring-emerald-100 rounded-2xl">
                  <Building2 className="w-8 h-8 text-emerald-500" />
                </div>
              </motion.div>

              <motion.h2 variants={welcomeItem} className="text-2xl font-black text-slate-900 tracking-tight mb-2">Bienvenue !</motion.h2>
              <motion.p variants={welcomeItem} className="text-sm text-slate-500 leading-relaxed mb-7">
                C'est la première fois que vous lancez BERAMETHODE sur cet appareil.
                <br />
                Configurons votre espace de travail en <strong className="text-slate-700">4 étapes rapides</strong>.
              </motion.p>

              {/* Étapes numérotées */}
              <motion.ul variants={welcomeItem} className="text-left space-y-2 mb-6">
                {[
                  "Type d'activité",
                  'Vos informations & logo',
                  'Compte administrateur',
                  'Préférences',
                ].map((label, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 transition-opacity ${
                      i === 0 ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-sm text-slate-600">{label}</span>
                  </li>
                ))}
              </motion.ul>

              {/* Acceptation des CGU — texte complet consultable via le lien (modal) */}
              <motion.label variants={welcomeItem} className="flex items-start gap-2.5 text-left mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                />
                <span className="text-xs text-slate-600">
                  J'ai lu et j'accepte les{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                    className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                  >
                    Conditions Générales d'Utilisation
                  </button>.
                </span>
              </motion.label>

              <motion.div variants={welcomeItem}>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!acceptedTerms}
                  className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm shadow-emerald-600/25"
                >
                  Commencer
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ── ÉTAPE 2a : Choix du type d'activité ──────────────────────────── */}
          {step === 2 && !accountType && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800">Type d'activité</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sélectionnez votre profil pour adapter l'interface.</p>
              </div>

              <div className="space-y-2.5">
                {ACCOUNT_TYPE_CARDS.map(({ type, icon: Icon, title, desc, accent }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccountType(type)}
                    className="w-full text-left p-3.5 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-3"
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Retour
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2b : Informations + logo selon le type d'activité ──────── */}
          {step === 2 && accountType && (
            <div>
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {accountType === 'societe' && 'Votre société'}
                    {accountType === 'client' && 'Informations client'}
                    {accountType === 'personnel' && 'Profil indépendant'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Ces informations apparaîtront sur vos documents</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAccountType(null); setStep(1); }}
                  className="shrink-0 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Changer de type
                </button>
              </div>

              {/* Logo — apparaîtra sur les factures & documents */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  aria-label="Choisir le logo"
                  className="group relative w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/40 flex items-center justify-center overflow-hidden transition-colors shrink-0"
                >
                  {logo ? (
                    <img src={logo} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  )}
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="text-sm font-medium text-slate-700 hover:text-emerald-600 transition-colors"
                  >
                    {logo ? 'Changer le logo' : 'Ajouter un logo'}
                  </button>
                  <p className="text-xs text-slate-400 mt-0.5">Optionnel — apparaîtra sur vos documents.</p>
                </div>
              </div>

              {/* Erreur éventuelle (ex. fichier logo invalide) */}
              {error && (
                <div className="mb-5 flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Champs — Société */}
              {accountType === 'societe' && (
                <div className="space-y-4">
                  <Field
                    label="Nom de la société"
                    value={companyName}
                    onChange={setCompanyName}
                    placeholder="Ex. : Confection Atlas SARL"
                    autoComplete="organization"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Spécialité</label>
                    <select
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                    >
                      <option value="" disabled>Sélectionner une spécialité…</option>
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
                    label="Nom de la marque / client"
                    value={clientName}
                    onChange={setClientName}
                    placeholder="Ex. : Zara / Inditex Buying"
                    autoComplete="organization"
                  />
                  <Field
                    label="Région principale d'importation"
                    value={region}
                    onChange={setRegion}
                    placeholder="Ex. : Espagne / Europe"
                  />
                </div>
              )}

              {/* Champs — Personnel / indépendant */}
              {accountType === 'personnel' && (
                <div className="space-y-4">
                  <Field
                    label="Nom complet de l'expert"
                    value={expertName}
                    onChange={setExpertName}
                    placeholder="Ex. : Soulaimane Berraadi"
                    autoComplete="name"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Spécialisation principale</label>
                    <select
                      value={focusArea}
                      onChange={(e) => setFocusArea(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                    >
                      <option value="" disabled>Sélectionner une spécialisation…</option>
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
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceedStep2}
                  className="flex-[2] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  Continuer
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : Compte admin ───────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }}>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800">Compte administrateur</h2>
                <p className="text-xs text-slate-500 mt-0.5">Ce compte aura accès à toutes les fonctionnalités</p>
              </div>

              <div className="space-y-4">
                <Field
                  label="Nom complet"
                  value={adminName}
                  onChange={setAdminName}
                  placeholder="Ex. : Soulaimane Berraadi"
                  autoComplete="name"
                />
                <Field
                  label="Adresse e-mail"
                  type="email"
                  value={adminEmail}
                  onChange={setAdminEmail}
                  placeholder="exemple@gmail.com"
                  autoComplete="email"
                  error={emailError}
                />
                <Field
                  label="Téléphone personnel"
                  type="tel"
                  value={adminPhone}
                  onChange={setAdminPhone}
                  placeholder="Ex. : 06 12 34 56 78"
                  autoComplete="tel"
                  required={false}
                  hint="Optionnel"
                />
                <Field
                  label="Téléphone de la société"
                  type="tel"
                  value={companyPhone}
                  onChange={setCompanyPhone}
                  placeholder="Ex. : 05 22 00 00 00"
                  autoComplete="tel"
                  required={false}
                  hint="Optionnel"
                />
                <Field
                  label="Mot de passe"
                  type="password"
                  value={adminPassword}
                  onChange={setAdminPassword}
                  placeholder="Minimum 6 caractères"
                  autoComplete="new-password"
                  hint="Au moins 6 caractères"
                  error={passwordError}
                />
                <Field
                  label="Confirmer le mot de passe"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Répétez le mot de passe"
                  autoComplete="new-password"
                  error={confirmError}
                />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!canProceedStep3 && (
                <p className="mt-4 text-[11px] text-slate-400 text-center">
                  Renseignez un nom, un e-mail valide et un mot de passe (6+ caractères) identique pour continuer.
                  <br />Le téléphone reste optionnel.
                </p>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={!canProceedStep3}
                  className="flex-[2] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
                >
                  Continuer
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ── ÉTAPE 4 : Préférences (branchées sur les réglages existants) ──── */}
          {step === 4 && (
            <div>
              <div className="mb-6 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Préférences</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Valeurs par défaut — modifiables à tout moment dans Configuration.</p>
                </div>
              </div>

              <div className="space-y-5">
                <Seg<PrefLang>
                  label="Langue"
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
                  label="Thème"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { v: 'light', label: 'Clair', icon: Sun },
                    { v: 'dark', label: 'Sombre', icon: Moon },
                    { v: 'system', label: 'Auto', icon: Monitor },
                  ]}
                />
                <Seg<string>
                  label="Devise par défaut"
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
                <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 disabled:opacity-40"
                >
                  Passer
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
                      Initialisation…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Terminer
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          BERAMETHODE — Système de gestion textile
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
            className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <ScrollText className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-bold text-slate-800 truncate">Conditions Générales d'Utilisation</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                aria-label="Fermer"
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-xs leading-relaxed text-slate-600 space-y-3">
              <p className="text-[11px] text-slate-400">Version {CGU_VERSION} — {CGU_DATE}</p>
              {CGU_SECTIONS.map((s) => (
                <div key={s.title}>
                  <h4 className="font-semibold text-slate-700 mb-0.5">{s.title}</h4>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => { setAcceptedTerms(true); setShowTerms(false); }}
                className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                J'accepte
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
