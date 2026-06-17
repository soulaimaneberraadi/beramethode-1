import React, { useState } from 'react';
import { Building2, User, ChevronRight, ChevronLeft, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

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

type Step = 1 | 2 | 3;

const SPECIALTIES = [
  'Confection',
  'Tricotage',
  'Tissage',
  'Broderie',
  'Teinture & Finition',
  'Maroquinerie',
  'Autre',
];

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Étape 2 — infos société
  const [companyName, setCompanyName] = useState('');
  const [specialty, setSpecialty] = useState('');

  // Étape 3 — compte admin
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Navigation ────────────────────────────────────────────────────────────
  const canProceedStep2 = companyName.trim().length >= 2 && specialty.trim().length > 0;
  const canProceedStep3 =
    adminName.trim().length >= 2 &&
    adminEmail.trim().includes('@') &&
    adminPassword.length >= 6 &&
    adminPassword === confirmPassword;

  const handleNext = () => {
    if (step === 2 && !canProceedStep2) return;
    if (step < 3) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
    setError(null);
  };

  // ── Soumission finale ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProceedStep3) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/setup/init', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          specialty: specialty.trim(),
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim().toLowerCase(),
          adminPassword,
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

  // ── Indicateur de progression ──────────────────────────────────────────────
  const StepDot = ({ n }: { n: Step }) => (
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
      {n < 3 && (
        <div
          className={`w-10 h-0.5 transition-all ${
            step > n ? 'bg-emerald-400' : 'bg-slate-200'
          }`}
        />
      )}
    </div>
  );

  // ── Champ texte réutilisable ───────────────────────────────────────────────
  const Field = ({
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    autoComplete,
    hint,
  }: {
    label: string;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoComplete?: string;
    hint?: string;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
      />
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-800 rounded-2xl mb-4 shadow-lg">
            <span className="text-emerald-400 font-black text-lg tracking-tight">BM</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">BERAMETHODE</h1>
          <p className="text-sm text-slate-500 mt-1">Configuration initiale</p>
        </div>

        {/* Carte principale */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {/* Indicateur d'étapes */}
          <div className="flex justify-center items-center mb-8">
            <StepDot n={1} />
            <StepDot n={2} />
            <StepDot n={3} />
          </div>

          {/* ── ÉTAPE 1 : Bienvenue ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 rounded-2xl mb-5">
                <Building2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Bienvenue !</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                C'est la première fois que vous lancez BERAMETHODE sur cet appareil.
                <br />
                Configurons votre espace de travail en <strong>3 étapes rapides</strong>.
              </p>
              <ul className="text-left text-sm text-slate-600 space-y-2 mb-8 bg-slate-50 rounded-xl p-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Informations de votre société
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Création du compte administrateur
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Démarrage de BERAMETHODE
                </li>
              </ul>
              <button
                type="button"
                onClick={handleNext}
                className="w-full py-3 px-6 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Commencer
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── ÉTAPE 2 : Société ────────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800">Votre société</h2>
                <p className="text-xs text-slate-500 mt-0.5">Ces informations apparaîtront sur vos documents</p>
              </div>
              <div className="space-y-4">
                <Field
                  label="Nom de la société"
                  value={companyName}
                  onChange={setCompanyName}
                  placeholder="Ex. : Confection Atlas SARL"
                  autoComplete="organization"
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Spécialité
                  </label>
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

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleBack}
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
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-800">Compte administrateur</h2>
                <p className="text-xs text-slate-500 mt-0.5">Ce compte aura accès à toutes les fonctionnalités</p>
              </div>

              <div className="space-y-4">
                <Field
                  label="Nom complet"
                  value={adminName}
                  onChange={setAdminName}
                  placeholder="Ex. : Mohammed Berraadi"
                  autoComplete="name"
                />
                <Field
                  label="Adresse e-mail"
                  type="email"
                  value={adminEmail}
                  onChange={setAdminEmail}
                  placeholder="admin@masociete.ma"
                  autoComplete="email"
                />
                <Field
                  label="Mot de passe"
                  type="password"
                  value={adminPassword}
                  onChange={setAdminPassword}
                  placeholder="Minimum 6 caractères"
                  autoComplete="new-password"
                  hint="Au moins 6 caractères"
                />
                <Field
                  label="Confirmer le mot de passe"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Répétez le mot de passe"
                  autoComplete="new-password"
                  hint={
                    confirmPassword && adminPassword !== confirmPassword
                      ? '⚠ Les mots de passe ne correspondent pas'
                      : undefined
                  }
                />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
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
                  disabled={!canProceedStep3 || loading}
                  className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Initialisation…
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4" />
                      Terminer
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          BERAMETHODE — Système de gestion textile
        </p>
      </div>
    </div>
  );
}
