import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasLocalDraftMarker, markPendingDraftAttachToEmail, notifyServerSessionEstablished } from '../../lib/dataIdentity';
import { Lock, Mail, ArrowRight, User } from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

// Icône Google officielle (multicolore)
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.966 11.966 0 0 0 12 0C7.33 0 3.29 2.523 1.123 6.252l4.143 3.513z" />
    <path fill="#4285F4" d="M23.49 12.275c0-.796-.073-1.56-.206-2.291H12v4.522h6.44a5.505 5.505 0 0 1-2.39 3.61l3.736 3.163c2.185-2.014 3.447-4.98 3.447-8.494z" />
    <path fill="#FBBC05" d="M5.266 14.235L1.123 17.748A11.967 11.967 0 0 0 12 24c3.24 0 5.957-1.077 7.943-2.918l-3.736-3.163a7.14 7.14 0 0 1-4.207 1.173 7.078 7.078 0 0 1-6.734-4.857z" />
    <path fill="#34A853" d="M5.266 9.765a7.012 7.012 0 0 0 0 4.47l-4.143 3.513a11.936 11.936 0 0 1 0-11.496l4.143 3.513z" />
  </svg>
);

// Délai max avant d'abandonner une tentative de connexion (serveur injoignable / réseau bloqué).
const LOGIN_TIMEOUT_MS = 15000;

// Course entre une promesse et un timeout : évite qu'un appel réseau bloqué fige l'UI à l'infini.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DOMException('Timeout', 'TimeoutError')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export default function Login({ onSwitch, onGuest }: { onSwitch: () => void, onGuest?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, staticLogin, signInWithGoogle } = useAuth();
  
  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showForgotPassword && resetStep === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [showForgotPassword, resetStep, timer]);

  const handleOtpChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return false;

    setOtp([...otp.map((d, idx) => (idx === index ? element.value : d))]);

    // Focus next input
    if (element.value && element.nextSibling) {
      (element.nextSibling as HTMLInputElement).focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.every(char => !isNaN(Number(char)))) {
      const newOtp = [...otp];
      pastedData.forEach((char, index) => {
        if (index < 6) newOtp[index] = char;
      });
      setOtp(newOtp);
      // Focus last filled input or the next empty one
      const nextIndex = Math.min(pastedData.length, 5);
      const inputs = document.querySelectorAll('input[name^="otp-"]');
      if (inputs[nextIndex]) (inputs[nextIndex] as HTMLInputElement).focus();
    }
  };

  const handleResendCode = async () => {
    setTimer(60);
    setCanResend(false);
    // Call API to resend code
    try {
      await fetch('/api/auth/forgot-password', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
    } catch (error) {
      console.error('Resend error:', error);
    }
  };

  const getMaskedEmail = (email: string) => {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    const maskedName = name.substring(0, 2) + '*'.repeat(Math.max(0, name.length - 2));
    return `${maskedName}@${domain}`;
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return 0;
    let strength = 0;
    if (password.length > 7) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength; // 0-4
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const loginErrorMessage = (data: unknown, fallback: string): string => {
    if (!data || typeof data !== 'object') return fallback;
    const d = data as Record<string, unknown>;
    const raw = d.message ?? d.error;
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return fallback;
    if (s === 'Invalid credentials') return 'E-mail ou mot de passe incorrect.';
    return s;
  };

  const networkErrorMessage = (err: unknown): string => {
    // Timeout (notre withTimeout) ou requête abandonnée (AbortController) : message clair.
    const name = err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return 'La connexion a expiré (délai dépassé). Vérifiez votre connexion Internet et réessayez.';
    }
    let msg = err instanceof Error ? err.message : String(err);
    msg = (msg || '').trim();
    // Message vide ou inexploitable ("{}", "[object Object]", page HTML d'erreur) :
    // ne jamais l'afficher tel quel à l'utilisateur.
    const isNetwork =
      !msg ||
      msg === '{}' ||
      msg === '[object Object]' ||
      msg.startsWith('<') ||
      msg === 'Failed to fetch' ||
      msg === 'Load failed' ||
      msg.startsWith('NetworkError');
    if (isNetwork) {
      // En mode statique (Supabase), aucun backend local n'est requis : un échec
      // réseau signifie que le service d'authentification Supabase est injoignable.
      if (staticLogin) {
        return (
          'Impossible de joindre le serveur d\'authentification. ' +
          'Vérifiez votre connexion Internet et réessayez dans quelques instants.'
        );
      }
      return (
        'Impossible de joindre le serveur. Lancez « npm run dev » puis ouvrez http://localhost:8000. ' +
        'Si vous utilisez uniquement « npm run dev:ui » (port 5173), le backend doit tourner sur le port 8000.'
      );
    }
    return msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (hasLocalDraftMarker()) {
        markPendingDraftAttachToEmail(email.trim());
      }

      if (staticLogin) {
        const result = await withTimeout(staticLogin(email, password), LOGIN_TIMEOUT_MS);
        if (!result.ok) throw new Error(result.message || 'E-mail ou mot de passe incorrect.');
        return;
      }

      // AbortController : coupe le fetch si le serveur ne répond pas dans le délai imparti.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
      try {
        const res = await fetch('/api/auth/login', {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(loginErrorMessage(data, 'E-mail ou mot de passe incorrect.'));
        }

        notifyServerSessionEstablished(data.user?.id ?? 0);
        login(data.user);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: unknown) {
      setError(networkErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!signInWithGoogle) return;
    setError('');
    setIsLoading(true);
    try {
      const result = await withTimeout(signInWithGoogle(), LOGIN_TIMEOUT_MS);
      if (!result.ok) {
        // En cas de succès le navigateur redirige vers Google : pas de reset ici.
        setError(result.message || 'Échec de la connexion avec Google.');
        setIsLoading(false);
      }
    } catch (err: unknown) {
      setError(networkErrorMessage(err));
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResetStep(2);
      setTimer(60);
      setCanResend(false);
    } catch (err: unknown) {
      setResetError(networkErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    const code = otp.join('');
    if (code.length !== 6) {
      setResetError('Please enter the complete 6-digit code');
      setResetLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/verify-code', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResetStep(3);
    } catch (err: unknown) {
      setResetError(networkErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    const code = otp.join('');
    try {
      const res = await fetch('/api/auth/reset-password', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowForgotPassword(false);
      setResetStep(1);
      setResetEmail('');
      setOtp(['', '', '', '', '', '']);
      setNewPassword('');
      setError('Password reset successfully. Please login.');
    } catch (err: unknown) {
      setResetError(networkErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  // Animation Variants for Progressive Loading
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center py-6 px-4 sm:py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans"
      style={{
        backgroundColor: '#f8fafc',
        backgroundSize: '24px 24px',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
      }}
    >
      {/* Ambient decorative mesh elements */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            rotate: [0, -30, 0],
            opacity: [0.4, 0.6, 0.4]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -right-[10%] w-[80%] h-[80%] rounded-full blur-[140px] bg-emerald-400/10"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            x: [0, 50, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[140px] bg-indigo-200/20"
        />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-md w-full bg-white border border-slate-200/80 rounded-3xl sm:rounded-[32px] p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.08)] relative z-10 transition-all duration-500"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          {/* Animated Logo & Brand */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="select-none text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              BERA<span className="text-emerald-600">METHODE</span>
            </h1>
            
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] mt-1.5 text-slate-500">
              Industrial Intelligence
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center text-slate-900">
            {showForgotPassword ? (resetStep === 3 ? 'New Password' : 'Reset Password') : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm text-center max-w-xs text-slate-600">
            {showForgotPassword 
              ? (resetStep === 1 ? 'Enter your email to receive a verification code' : resetStep === 2 ? `Enter the code sent to ${getMaskedEmail(resetEmail)}` : 'Create a strong password for your account')
              : 'Enter your credentials to access your industrial workspace'}
          </p>
        </motion.div>

        {showForgotPassword ? (
          <div className="mt-8 space-y-5">
            {resetStep === 1 && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
                  </div>
                  <input
                    type="email"
                    required
                    className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                    placeholder="Email address"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
                <AnimatePresence>
                  {resetError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 border-red-100 text-red-600">
                        {resetError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 hover:shadow-emerald-500/20 shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Verification Code'}
                </motion.button>
              </form>
            )}

            {resetStep === 2 && (
              <form onSubmit={handleVerifyCode} className="space-y-6">
                <div className="flex justify-center gap-2 sm:gap-3">
                  {otp.map((data, index) => (
                    <input
                      key={index}
                      name={`otp-${index}`}
                      type="text"
                      maxLength={1}
                      value={data}
                      onChange={(e) => handleOtpChange(e.target, index)}
                      onPaste={handleOtpPaste}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !data && index > 0) {
                          const inputs = document.querySelectorAll('input[name^="otp-"]');
                          if (inputs[index - 1]) (inputs[index - 1] as HTMLInputElement).focus();
                        }
                      }}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.15)] focus:outline-none transition-all duration-200"
                    />
                  ))}
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-slate-500">
                    Resend code in <span className="font-mono font-bold text-emerald-500">00:{timer.toString().padStart(2, '0')}</span>
                  </p>
                  {canResend && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="mt-2 text-sm font-medium text-emerald-600 hover:text-emerald-500 hover:underline"
                    >
                      Resend Code
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {resetError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 border-red-100 text-red-600">
                        {resetError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 hover:shadow-emerald-500/20 shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Verify Code'}
                </motion.button>
              </form>
            )}

            {resetStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
                  </div>
                  <input
                    type="password"
                    required
                    className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                
                {/* Password Strength Indicator */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-slate-550">
                    <span>Password Strength</span>
                    <span>{['Weak', 'Fair', 'Good', 'Strong'][passwordStrength - 1] || 'Too Weak'}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                    {[1, 2, 3, 4].map((level) => (
                      <div 
                        key={level}
                        className={`h-full flex-1 transition-all duration-300 ${
                          passwordStrength >= level 
                            ? (passwordStrength <= 2 ? 'bg-red-500' : passwordStrength === 3 ? 'bg-yellow-500' : 'bg-emerald-500') 
                            : 'bg-transparent'
                        }`}
                        style={{ opacity: passwordStrength >= level ? 1 : 0.2 }}
                      />
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {resetError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 border-red-100 text-red-600">
                        {resetError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/20 shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Reset Password'}
                </motion.button>
              </form>
            )}

            <div className="text-center mt-4">
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetStep(1);
                  setResetError('');
                  setOtp(['', '', '', '', '', '']);
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-800 hover:underline transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
                </div>
                <input
                  type="password"
                  required
                  className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-500 hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 border-red-100 text-red-600">
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/20 shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {(signInWithGoogle || onGuest) && (
              <motion.div variants={itemVariants} className="mt-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Or</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {signInWithGoogle && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="mt-4 w-full flex justify-center items-center gap-3 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 py-3.5 px-4 rounded-xl shadow-sm cursor-pointer text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <GoogleIcon className="w-5 h-5" />
                    Continuer avec Google
                  </motion.button>
                )}

                {onGuest && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={onGuest}
                    className="mt-3 w-full flex justify-center items-center gap-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 py-3.5 px-4 rounded-xl shadow-sm cursor-pointer text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200"
                  >
                    <User className="w-4 h-4" />
                    Continue as Guest
                  </motion.button>
                )}
              </motion.div>
            )}
          </form>
        )}
        
        <motion.div variants={itemVariants} className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Don't have an account?{' '}
            <button 
              onClick={onSwitch} 
              className="font-bold transition-colors hover:underline decoration-2 underline-offset-4 text-emerald-600 hover:text-emerald-500"
            >
              Create account
            </button>
          </p>
        </motion.div>
      </motion.div>

      {/* Footer Copyright */}
      <div className="absolute bottom-6 text-center w-full z-10">
         <p className="text-xs font-medium text-slate-600">© {new Date().getFullYear()} BeraMethode. Tous droits réservés.</p>
      </div>
    </div>
  );
}
