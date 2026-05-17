import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasLocalDraftMarker, markPendingDraftAttachToEmail, notifyServerSessionEstablished } from '../../lib/dataIdentity';
import { Lock, Mail, ArrowRight, User, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

export default function Login({ onSwitch, onGuest }: { onSwitch: () => void, onGuest?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, staticLogin } = useAuth();
  
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

  // Theme State: 'dark' or 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Auto-detect theme based on time
  useEffect(() => {
    const hour = new Date().getHours();
    setTheme(hour >= 6 && hour < 18 ? 'light' : 'dark');
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg === 'Failed to fetch' ||
      msg === 'Load failed' ||
      msg.startsWith('NetworkError')
    ) {
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
        const result = staticLogin(email, password);
        if (!result.ok) throw new Error(result.message || 'E-mail ou mot de passe incorrect.');
        return;
      }

      const res = await fetch('/api/auth/login', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(loginErrorMessage(data, 'E-mail ou mot de passe incorrect.'));
      }

      notifyServerSessionEstablished(data.user?.id ?? 0);
      login(data.user);
    } catch (err: unknown) {
      setError(networkErrorMessage(err));
    } finally {
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

  const isDark = theme === 'dark';

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
    <div className={`min-h-screen flex items-center justify-center py-6 px-4 sm:py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans transition-colors duration-1000 ${isDark ? 'bg-slate-900' : 'bg-[#f0f4f8]'}`}>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className={`absolute top-6 right-6 p-3 rounded-full backdrop-blur-md transition-all duration-500 z-50 ${isDark ? 'bg-white/10 text-yellow-400 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isDark ? 'sun' : 'moon'}
            initial={{ rotate: -180, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 180, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </motion.div>
        </AnimatePresence>
      </button>

      {/* Dynamic Background Mesh */}
      <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
        <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-1000 ${isDark ? 'bg-[#0f172a] opacity-90' : 'bg-[#ffffff] opacity-60'}`}></div>

        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, -45, 0],
            opacity: isDark ? [0.3, 0.5, 0.3] : [0.6, 0.8, 0.6]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className={`absolute -top-[20%] -right-[10%] w-[80%] h-[80%] rounded-full blur-[120px] transition-colors duration-1000 ${isDark ? 'bg-emerald-600/20' : 'bg-emerald-400/20'}`}
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            x: [0, 100, 0],
            opacity: isDark ? [0.2, 0.4, 0.2] : [0.5, 0.7, 0.5]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute bottom-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[120px] transition-colors duration-1000 ${isDark ? 'bg-indigo-600/20' : 'bg-teal-300/20'}`}
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={`max-w-md w-full backdrop-blur-2xl p-8 sm:p-10 rounded-3xl shadow-2xl border relative z-10 transition-all duration-500 ${
          isDark 
            ? 'bg-white/5 border-white/10 shadow-black/50' 
            : 'bg-white/60 border-white/40 shadow-slate-200/50'
        }`}
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          {/* Animated Logo */}
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-3 mb-8 cursor-default"
          >
            <div className={`w-14 h-14 bg-gradient-to-br rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-lg border transition-all duration-500 ${
              isDark 
                ? 'from-emerald-400 to-emerald-600 shadow-emerald-500/20 border-emerald-400/30' 
                : 'from-emerald-500 to-emerald-600 shadow-emerald-500/20 border-emerald-400/30'
            }`}>
                B
            </div>
            <div className="flex flex-col">
              <span className={`font-extrabold text-3xl tracking-tight leading-none transition-colors duration-500 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  BERA<span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>METHODE</span>
              </span>
              <span className={`text-[10px] font-medium uppercase tracking-[0.2em] mt-1 transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Industrial Intelligence
              </span>
            </div>
          </motion.div>

          <h2 className={`text-3xl font-bold tracking-tight text-center transition-colors duration-500 ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {showForgotPassword ? (resetStep === 3 ? 'New Password' : 'Reset Password') : 'Welcome back'}
          </h2>
          <p className={`mt-2 text-sm text-center max-w-xs transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                    <Mail className={`h-5 w-5 transition-colors duration-300 ${isDark ? 'text-slate-400 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'}`} />
                  </div>
                  <input
                    type="email"
                    required
                    className={`block w-full pl-11 pr-4 py-4 rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-200 sm:text-sm shadow-inner ${
                      isDark 
                        ? 'bg-slate-800/50 border border-slate-700/50 text-white focus:bg-slate-800 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
                        : 'bg-white border border-slate-200 text-slate-900 focus:bg-white focus:ring-emerald-500/30 focus:border-emerald-500'
                    }`}
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
                      <div className={`p-3 rounded-xl text-sm text-center font-medium border ${
                        isDark 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-red-50 border-red-100 text-red-600'
                      }`}>
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
                  className={`w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed ${
                    isDark
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-900/20'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-500/20'
                  }`}
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
                      className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-lg border-2 focus:outline-none transition-all duration-200 ${
                        isDark
                          ? 'bg-slate-900/80 border-slate-700 text-white focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                          : 'bg-white border-slate-200 text-slate-900 focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                      }`}
                    />
                  ))}
                </div>
                
                <div className="text-center">
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Resend code in <span className="font-mono font-bold text-emerald-500">00:{timer.toString().padStart(2, '0')}</span>
                  </p>
                  {canResend && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="mt-2 text-sm font-medium text-emerald-500 hover:text-emerald-400 hover:underline"
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
                      <div className={`p-3 rounded-xl text-sm text-center font-medium border ${
                        isDark 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-red-50 border-red-100 text-red-600'
                      }`}>
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
                  className={`w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed ${
                    isDark
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-900/20'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-500/20'
                  }`}
                >
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Verify Code'}
                </motion.button>
              </form>
            )}

            {resetStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className={`h-5 w-5 transition-colors duration-300 ${isDark ? 'text-slate-400 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'}`} />
                  </div>
                  <input
                    type="password"
                    required
                    className={`block w-full pl-11 pr-4 py-4 rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-200 sm:text-sm shadow-inner ${
                      isDark 
                        ? 'bg-slate-800/50 border border-slate-700/50 text-white focus:bg-slate-800 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
                        : 'bg-white border border-slate-200 text-slate-900 focus:bg-white focus:ring-emerald-500/30 focus:border-emerald-500'
                    }`}
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                
                {/* Password Strength Indicator */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
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
                      <div className={`p-3 rounded-xl text-sm text-center font-medium border ${
                        isDark 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-red-50 border-red-100 text-red-600'
                      }`}>
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
                  className={`w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed ${
                    isDark
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-900/20'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-500/20'
                  }`}
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
                className={`text-sm font-medium hover:underline ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
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
                  <Mail className={`h-5 w-5 transition-colors duration-300 ${isDark ? 'text-slate-400 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'}`} />
                </div>
                <input
                  type="email"
                  required
                  className={`block w-full pl-11 pr-4 py-4 rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-200 sm:text-sm shadow-inner ${
                    isDark 
                      ? 'bg-slate-800/50 border border-slate-700/50 text-white focus:bg-slate-800 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
                      : 'bg-white border border-slate-200 text-slate-900 focus:bg-white focus:ring-emerald-500/30 focus:border-emerald-500'
                  }`}
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors duration-300 ${isDark ? 'text-slate-400 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'}`} />
                </div>
                <input
                  type="password"
                  required
                  className={`block w-full pl-11 pr-4 py-4 rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-200 sm:text-sm shadow-inner ${
                    isDark 
                      ? 'bg-slate-800/50 border border-slate-700/50 text-white focus:bg-slate-800 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
                      : 'bg-white border border-slate-200 text-slate-900 focus:bg-white focus:ring-emerald-500/30 focus:border-emerald-500'
                  }`}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className={`text-sm font-medium hover:underline ${isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'}`}
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
                  <div className={`p-3 rounded-xl text-sm text-center font-medium border ${
                    isDark 
                      ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                      : 'bg-red-50 border-red-100 text-red-600'
                  }`}>
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02, boxShadow: isDark ? "0 0 20px rgba(16, 185, 129, 0.4)" : "0 10px 20px -5px rgba(59, 130, 246, 0.4)" }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className={`w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-900/20'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 focus:ring-emerald-500 shadow-emerald-500/20'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {onGuest && (
              <motion.div variants={itemVariants} className="mt-6">
                <div className="flex items-center gap-3">
                  <div className={`h-px flex-1 ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`} />
                  <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Or</span>
                  <div className={`h-px flex-1 ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`} />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02, backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)" }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={onGuest}
                  className={`mt-4 w-full flex justify-center items-center gap-2 py-3.5 px-4 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ${
                    isDark
                      ? 'border-slate-700 bg-slate-800/30 text-slate-300 hover:text-white hover:border-slate-600 focus:ring-emerald-500'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 focus:ring-emerald-500 shadow-sm'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Continue as Guest
                </motion.button>
              </motion.div>
            )}
          </form>
        )}
        
        <motion.div variants={itemVariants} className="mt-8 text-center">
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Don't have an account?{' '}
            <button 
              onClick={onSwitch} 
              className={`font-bold transition-colors hover:underline decoration-2 underline-offset-4 ${
                isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'
              }`}
            >
              Create account
            </button>
          </p>
        </motion.div>
      </motion.div>

      {/* Footer Copyright */}
      <div className="absolute bottom-6 text-center w-full z-10">
         <p className={`text-xs font-medium transition-colors duration-500 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>© {new Date().getFullYear()} BeraMethode. Tous droits réservés.</p>
      </div>
    </div>
  );
}
