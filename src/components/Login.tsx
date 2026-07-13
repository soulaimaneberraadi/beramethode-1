import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasLocalDraftMarker, markPendingDraftAttachToEmail, notifyServerSessionEstablished } from '../../lib/dataIdentity';
import { Lock, Mail, ArrowRight, User, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { tx } from '../../lib/i18n';
import { useLang } from '../context/LanguageContext';
import { useIsDark } from '../context/ThemeContext';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, staticLogin, signInWithGoogle } = useAuth();
  const { lang } = useLang();
  const isDark = useIsDark();
  
  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
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
    if (s === 'Invalid credentials') return tx(lang, {fr:'E-mail ou mot de passe incorrect.',ar:'البريد الإلكتروني أو كلمة السر غير صحيحة.',en:'Incorrect email or password.',es:'Correo o contraseña incorrectos.',pt:'E-mail ou palavra-passe incorretos.',tr:'E-posta veya şifre hatalı.'});
    return s;
  };

  const networkErrorMessage = (err: unknown): string => {
    // Timeout (notre withTimeout) ou requête abandonnée (AbortController) : message clair.
    const name = err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return tx(lang, {fr:'La connexion a expiré (délai dépassé). Vérifiez votre connexion Internet et réessayez.',ar:'انتهت مهلة الاتصال. تحقّق من اتصالك بالإنترنت وحاول مجدّداً.',en:'The connection timed out. Check your Internet connection and try again.',es:'La conexión expiró. Verifique su conexión a Internet e inténtelo de nuevo.',pt:'A ligação expirou. Verifique a sua ligação à Internet e tente novamente.',tr:'Bağlantı zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.'});
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
        return tx(lang, {
          fr: 'Impossible de joindre le serveur d\'authentification. Vérifiez votre connexion Internet et réessayez dans quelques instants.',
          ar: 'تعذّر الوصول إلى خادم المصادقة. تحقّق من اتصالك بالإنترنت وحاول مجدّداً بعد لحظات.',
          en: 'Unable to reach the authentication server. Check your Internet connection and try again shortly.',
          es: 'No se pudo conectar con el servidor de autenticación. Verifique su conexión a Internet e inténtelo de nuevo en unos instantes.',
          pt: 'Não foi possível contactar o servidor de autenticação. Verifique a sua ligação à Internet e tente novamente dentro de momentos.',
          tr: 'Kimlik doğrulama sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edip birazdan tekrar deneyin.'
        });
      }
      return tx(lang, {
        fr: 'Impossible de joindre le serveur. Lancez « npm run dev » puis ouvrez http://localhost:8000. Si vous utilisez uniquement « npm run dev:ui » (port 5173), le backend doit tourner sur le port 8000.',
        ar: 'تعذّر الوصول إلى الخادم. شغّل « npm run dev » ثم افتح http://localhost:8000. إذا كنت تستعمل « npm run dev:ui » فقط (المنفذ 5173)، فيجب أن يعمل الخادم الخلفي على المنفذ 8000.',
        en: 'Unable to reach the server. Run "npm run dev" then open http://localhost:8000. If you only use "npm run dev:ui" (port 5173), the backend must run on port 8000.',
        es: 'No se pudo conectar con el servidor. Ejecute «npm run dev» y luego abra http://localhost:8000. Si solo usa «npm run dev:ui» (puerto 5173), el backend debe ejecutarse en el puerto 8000.',
        pt: 'Não foi possível contactar o servidor. Execute «npm run dev» e abra http://localhost:8000. Se utilizar apenas «npm run dev:ui» (porta 5173), o backend tem de correr na porta 8000.',
        tr: 'Sunucuya ulaşılamadı. "npm run dev" çalıştırın ve http://localhost:8000 adresini açın. Yalnızca "npm run dev:ui" (port 5173) kullanıyorsanız, arka uç 8000 portunda çalışmalıdır.'
      });
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
        if (result.user) login(result.user);
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
        setError(result.message || tx(lang, {fr:'Échec de la connexion avec Google.',ar:'فشل تسجيل الدخول عبر Google.',en:'Google sign-in failed.',es:'Error al iniciar sesión con Google.',pt:'Falha ao iniciar sessão com o Google.',tr:'Google ile giriş başarısız oldu.'}));
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
      className="min-h-screen flex items-center justify-center py-6 px-4 sm:py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans dark:bg-dk-bg"
      style={{
        backgroundColor: isDark ? '#14211C' : '#f8fafc',
        backgroundSize: '24px 24px',
        backgroundImage: isDark ? 'radial-gradient(circle, #2E463C 1.5px, transparent 1.5px)' : 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
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
        className="max-w-md w-full bg-white border border-slate-200/80 rounded-3xl sm:rounded-[32px] p-6 sm:p-10 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.08)] relative z-10 transition-all duration-500 dark:bg-dk-surface dark:border-dk-border"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          {/* Animated Logo & Brand */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="select-none text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text">
              BERA<span className="text-emerald-600 dark:text-emerald-400">METHODE</span>
            </h1>
            
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] mt-1.5 text-slate-500 dark:text-dk-muted">
              {tx(lang, {fr:'Intelligence Industrielle',ar:'الذكاء الصناعي',en:'Industrial Intelligence',es:'Inteligencia Industrial',pt:'Inteligência Industrial',tr:'Endüstriyel Zeka'})}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center text-slate-900 dark:text-dk-text">
            {showForgotPassword ? (resetStep === 3 ? tx(lang, {fr:'Nouveau mot de passe',ar:'كلمة سر جديدة',en:'New Password',es:'Nueva contraseña',pt:'Nova palavra-passe',tr:'Yeni Şifre'}) : tx(lang, {fr:'Réinitialiser le mot de passe',ar:'إعادة تعيين كلمة السر',en:'Reset Password',es:'Restablecer contraseña',pt:'Redefinir palavra-passe',tr:'Şifre Sıfırla'})) : tx(lang, {fr:'Bon retour',ar:'مرحباً بعودتك',en:'Welcome back',es:'Bienvenido de nuevo',pt:'Bem-vindo de volta',tr:'Hoş geldiniz'})}
          </h2>
          <p className="mt-2 text-sm text-center max-w-xs text-slate-600 dark:text-dk-text-soft">
            {showForgotPassword 
              ? (resetStep === 1 ? tx(lang, {fr:'Saisissez votre e-mail pour recevoir un code de vérification',ar:'أدخل بريدك الإلكتروني لاستلام رمز التحقق',en:'Enter your email to receive a verification code',es:'Introduzca su correo para recibir un código de verificación',pt:'Introduza o seu e-mail para receber um código de verificação',tr:'Doğrulama kodu almak için e-postanızı girin'}) : resetStep === 2 ? `${tx(lang, {fr:'Saisissez le code envoyé à ',ar:'أدخل الرمز المرسل إلى ',en:'Enter the code sent to ',es:'Introduzca el código enviado a ',pt:'Introduza o código enviado para ',tr:'Gönderilen kodu girin: '})}${getMaskedEmail(resetEmail)}` : tx(lang, {fr:'Créez un mot de passe fort pour votre compte',ar:'أنشئ كلمة سر قوية لحسابك',en:'Create a strong password for your account',es:'Cree una contraseña segura para su cuenta',pt:'Crie uma palavra-passe forte para a sua conta',tr:'Hesabınız için güçlü bir şifre oluşturun'}))
              : tx(lang, {fr:'Saisissez vos identifiants pour accéder à votre espace de travail',ar:'سجل الدخول للوصول إلى مساحة عملك',en:'Enter your credentials to access your industrial workspace',es:'Introduzca sus credenciales para acceder a su espacio de trabajo',pt:'Introduza as suas credenciais para aceder ao seu espaço de trabalho',tr:'Çalışma alanınıza erişmek için kimlik bilgilerinizi girin'})}
          </p>
        </motion.div>

        {showForgotPassword ? (
          <div className="mt-8 space-y-5">
            {resetStep === 1 && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600 dark:text-dk-muted" />
                  </div>
                  <input
                    type="email"
                    required
                    className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50 dark:bg-dk-bg/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm dark:border-dk-border dark:text-dk-text dark:bg-dk-bg/60 dark:focus:bg-dk-surface"
                    placeholder={tx(lang, {fr:'Adresse e-mail',ar:'البريد الإلكتروني',en:'Email address',es:'Correo electrónico',pt:'Endereço de e-mail',tr:'E-posta adresi'})}
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
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 dark:bg-red-900/30 border-red-100 text-red-600 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
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
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : tx(lang, {fr:'Envoyer le code de vérification',ar:'إرسال رمز التحقق',en:'Send Verification Code',es:'Enviar código de verificación',pt:'Enviar código de verificação',tr:'Doğrulama Kodu Gönder'})}
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
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border border-slate-200 bg-slate-50 dark:bg-dk-bg focus:bg-white text-slate-900 focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.15)] focus:outline-none transition-all duration-200 dark:border-dk-border dark:bg-dk-bg/60 dark:focus:bg-dk-surface dark:text-dk-text"
                    />
                  ))}
                </div>
                
                <div className="text-center">
          <p className="text-sm text-slate-500 dark:text-dk-muted">
                    {tx(lang, {fr:'Renvoyer le code dans',ar:'إعادة إرسال الرمز بعد',en:'Resend code in',es:'Reenviar código en',pt:'Reenviar código em',tr:'Kodu yeniden gönder'})} <span className="font-mono font-bold text-emerald-500">00:{timer.toString().padStart(2, '0')}</span>
                  </p>
                  {canResend && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {tx(lang, {fr:'Renvoyer le code',ar:'إعادة إرسال الرمز',en:'Resend Code',es:'Reenviar código',pt:'Reenviar código',tr:'Kodu Yeniden Gönder'})}
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
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 dark:bg-red-900/30 border-red-100 text-red-600 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
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
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : tx(lang, {fr:'Vérifier le code',ar:'تحقق من الرمز',en:'Verify Code',es:'Verificar código',pt:'Verificar código',tr:'Kodu Doğrula'})}
                </motion.button>
              </form>
            )}

            {resetStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600 dark:text-dk-muted" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    className="w-full pl-11 pr-12 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50 dark:bg-dk-bg/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm dark:border-dk-border dark:text-dk-text dark:bg-dk-bg/60 dark:focus:bg-dk-surface dark:placeholder:text-dk-muted"
                    placeholder={tx(lang, {fr:'Nouveau mot de passe',ar:'كلمة سر جديدة',en:'New Password',es:'Nueva contraseña',pt:'Nova palavra-passe',tr:'Yeni Şifre'})}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? tx(lang, {fr:'Masquer le mot de passe',ar:'إخفاء كلمة السر',en:'Hide password',es:'Ocultar contraseña',pt:'Ocultar palavra-passe',tr:'Şifreyi gizle'}) : tx(lang, {fr:'Afficher le mot de passe',ar:'إظهار كلمة السر',en:'Show password',es:'Mostrar contraseña',pt:'Mostrar palavra-passe',tr:'Şifreyi göster'})}
                    title={showNewPassword ? tx(lang, {fr:'Masquer le mot de passe',ar:'إخفاء كلمة السر',en:'Hide password',es:'Ocultar contraseña',pt:'Ocultar palavra-passe',tr:'Şifreyi gizle'}) : tx(lang, {fr:'Afficher le mot de passe',ar:'إظهار كلمة السر',en:'Show password',es:'Mostrar contraseña',pt:'Mostrar palavra-passe',tr:'Şifreyi göster'})}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-emerald-600 focus:outline-none focus:text-emerald-600 dark:text-dk-muted dark:hover:text-emerald-400 dark:focus:text-emerald-400"
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-slate-550 dark:text-dk-text-soft">
                    <span>{tx(lang, {fr:'Force du mot de passe',ar:'قوة كلمة السر',en:'Password Strength',es:'Fortaleza de la contraseña',pt:'Força da palavra-passe',tr:'Şifre Gücü'})}</span>
                    <span>{[tx(lang, {fr:'Faible',ar:'ضعيفة',en:'Weak',es:'Débil',pt:'Fraca',tr:'Zayıf'}), tx(lang, {fr:'Moyen',ar:'مقبولة',en:'Fair',es:'Aceptable',pt:'Razoável',tr:'Orta'}), tx(lang, {fr:'Bon',ar:'جيدة',en:'Good',es:'Buena',pt:'Boa',tr:'İyi'}), tx(lang, {fr:'Fort',ar:'قوية',en:'Strong',es:'Fuerte',pt:'Forte',tr:'Güçlü'})][passwordStrength - 1] || tx(lang, {fr:'Trop faible',ar:'ضعيفة جداً',en:'Too Weak',es:'Muy débil',pt:'Muito fraca',tr:'Çok zayıf'})}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex dark:bg-dk-border">
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
                      <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 dark:bg-red-900/30 border-red-100 text-red-600 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
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
                  {resetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : tx(lang, {fr:'Réinitialiser le mot de passe',ar:'إعادة تعيين كلمة السر',en:'Reset Password',es:'Restablecer contraseña',pt:'Redefinir palavra-passe',tr:'Şifre Sıfırla'})}
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
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 hover:underline transition-colors dark:text-dk-muted dark:hover:text-dk-text"
              >
                {tx(lang, {fr:'Retour à la connexion',ar:'العودة إلى تسجيل الدخول',en:'Back to Login',es:'Volver al inicio de sesión',pt:'Voltar ao início de sessão',tr:'Girişe Dön'})}
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 transition-colors duration-300 text-slate-400 dark:text-dk-muted group-focus-within:text-emerald-600" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50 dark:bg-dk-bg/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm dark:shadow-dk-sm dark:border-dk-border dark:text-dk-text dark:bg-dk-bg/60 dark:focus:bg-dk-surface dark:placeholder:text-dk-muted"
                  placeholder={tx(lang, {fr:'Adresse e-mail',ar:'البريد الإلكتروني',en:'Email address',es:'Correo electrónico',pt:'Endereço de e-mail',tr:'E-posta adresi'})}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 transition-colors duration-300 text-slate-400 dark:text-dk-muted group-focus-within:text-emerald-600" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full pl-11 pr-12 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50 dark:bg-dk-bg/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm dark:shadow-dk-sm dark:border-dk-border dark:text-dk-text dark:bg-dk-bg/60 dark:focus:bg-dk-surface dark:placeholder:text-dk-muted"
                  placeholder={tx(lang, {fr:'Mot de passe',ar:'كلمة السر',en:'Password',es:'Contraseña',pt:'Palavra-passe',tr:'Şifre'})}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? tx(lang, {fr:'Masquer le mot de passe',ar:'إخفاء كلمة السر',en:'Hide password',es:'Ocultar contraseña',pt:'Ocultar palavra-passe',tr:'Şifreyi gizle'}) : tx(lang, {fr:'Afficher le mot de passe',ar:'إظهار كلمة السر',en:'Show password',es:'Mostrar contraseña',pt:'Mostrar palavra-passe',tr:'Şifreyi göster'})}
                  title={showPassword ? tx(lang, {fr:'Masquer le mot de passe',ar:'إخفاء كلمة السر',en:'Hide password',es:'Ocultar contraseña',pt:'Ocultar palavra-passe',tr:'Şifreyi gizle'}) : tx(lang, {fr:'Afficher le mot de passe',ar:'إظهار كلمة السر',en:'Show password',es:'Mostrar contraseña',pt:'Mostrar palavra-passe',tr:'Şifreyi göster'})}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-emerald-600 focus:outline-none focus:text-emerald-600 dark:text-dk-muted dark:hover:text-emerald-400 dark:focus:text-emerald-400"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 hover:underline transition-colors"
                >
                  {tx(lang, {fr:'Mot de passe oublié ?',ar:'هل نسيت كلمة السر؟',en:'Forgot password?',es:'¿Olvidó su contraseña?',pt:'Esqueceu a palavra-passe?',tr:'Şifrenizi mi unuttunuz?'})}
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
                  <div className="p-3 rounded-xl text-sm text-center font-medium border bg-red-50 dark:bg-red-900/30 border-red-100 text-red-600 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
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
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/20 shadow-lg dark:shadow-dk-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {tx(lang, {fr:'Se connecter',ar:'تسجيل الدخول',en:'Sign in',es:'Iniciar sesión',pt:'Iniciar sessão',tr:'Oturum Aç'})} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {(signInWithGoogle || onGuest) && (
              <motion.div variants={itemVariants} className="mt-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-dk-border" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:'Ou',ar:'أو',en:'Or',es:'O',pt:'Ou',tr:'Veya'})}</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-dk-border" />
                </div>

                {signInWithGoogle && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="mt-4 w-full flex justify-center items-center gap-3 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 py-3.5 px-4 rounded-xl shadow-sm cursor-pointer text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed dark:border-dk-border dark:bg-dk-surface dark:text-dk-text-soft dark:hover:bg-dk-elevated/60"
                  >
                    <GoogleIcon className="w-5 h-5" />
                    {tx(lang, {fr:'Continuer avec Google',ar:'الاستمرار مع Google',en:'Continue with Google',es:'Continuar con Google',pt:'Continuar com Google',tr:'Google ile Devam Et'})}
                  </motion.button>
                )}

                {onGuest && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={onGuest}
                    className="mt-3 w-full flex justify-center items-center gap-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 py-3.5 px-4 rounded-xl shadow-sm cursor-pointer text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text-soft dark:hover:bg-dk-elevated/60"
                  >
                    <User className="w-4 h-4" />
                    {tx(lang, {fr:'Continuer en tant qu\'invité',ar:'متابعة كضيف',en:'Continue as Guest',es:'Continuar como invitado',pt:'Continuar como convidado',tr:'Misafir Olarak Devam Et'})}
                  </motion.button>
                )}
              </motion.div>
            )}
          </form>
        )}
        
        <motion.div variants={itemVariants} className="mt-8 text-center">
          <p className="text-sm text-slate-500 dark:text-dk-muted">
            {tx(lang, {fr:'Vous n\'avez pas de compte ?',ar:'ليس لديك حساب؟',en:'Don\'t have an account?',es:'¿No tiene una cuenta?',pt:'Não tem uma conta?',tr:'Hesabınız yok mu?'})}{' '}
            <button 
              onClick={onSwitch} 
              className="font-bold transition-colors hover:underline decoration-2 underline-offset-4 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
            >
              {tx(lang, {fr:'Créer un compte',ar:'إنشاء حساب',en:'Create account',es:'Crear cuenta',pt:'Criar conta',tr:'Hesap Oluştur'})}
            </button>
          </p>
        </motion.div>
      </motion.div>

      {/* Footer Copyright */}
      <div className="absolute bottom-6 text-center w-full z-10">
         <p className="text-xs font-medium text-slate-600 dark:text-dk-text-soft">© {new Date().getFullYear()} BeraMethode. {tx(lang, {fr:'Tous droits réservés.',ar:'جميع الحقوق محفوظة.',en:'All rights reserved.',es:'Todos los derechos reservados.',pt:'Todos os direitos reservados.',tr:'Tüm hakları saklıdır.'})}</p>
      </div>
    </div>
  );
}
