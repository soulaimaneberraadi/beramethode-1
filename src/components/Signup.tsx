import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { tx } from '../../lib/i18n';
import { notifyServerSessionEstablished } from '../../lib/dataIdentity';
import { Lock, Mail, User, ArrowRight } from 'lucide-react';
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

export default function Signup({ onSwitch, onGuest }: { onSwitch: () => void; onGuest?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { lang } = useLang();
  const { login, signup, signInWithGoogle } = useAuth();

  const handleGoogleLogin = async () => {
    if (!signInWithGoogle) return;
    setError('');
    setIsLoading(true);
    const result = await signInWithGoogle();
    if (!result.ok) {
      setError(result.message || tx(lang, {fr:'Échec de la connexion avec Google.',ar:'فشل تسجيل الدخول عبر Google.',en:'Google sign-in failed.',es:'Error al iniciar sesión con Google.',pt:'Falha ao entrar com o Google.',tr:'Google ile giriş başarısız.'}));
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Static mode (Vercel) → use Supabase signup directly
      if (signup) {
        const result = await signup(email, password, name);
        if (!result.ok) throw new Error(result.message || tx(lang, {fr:'Échec inscription.',ar:'فشل التسجيل.',en:'Signup failed.',es:'Error al registrarse.',pt:'Falha no cadastro.',tr:'Kayıt başarısız.'}));
        if (result.requiresConfirmation) {
          setConfirmationSent(true);
          return;
        }
        // Session established → onAuthStateChange will set the user automatically
        return;
      }

      // Legacy backend mode
      const res = await fetch('/api/auth/register', { credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || tx(lang, {fr:'Échec inscription.',ar:'فشل التسجيل.',en:'Registration failed.',es:'Error al registrarse.',pt:'Falha no registro.',tr:'Kayıt başarısız.'}));
      }

      notifyServerSessionEstablished(data.user?.id ?? 0);
      login(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans"
      style={{
        backgroundColor: '#f8fafc',
        backgroundSize: '24px 24px',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)'
      }}
    >
      {/* Ambient decorative blobs */}
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
        className="max-w-md w-full bg-white border border-slate-200/80 rounded-[32px] p-8 sm:p-10 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.08)] relative z-10 transition-all duration-500"
      >
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          {/* Animated Logo & Brand */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="select-none text-3xl font-extrabold tracking-tight text-slate-900">
              BERA<span className="text-emerald-600">METHODE</span>
            </h1>
            
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] mt-1.5 text-slate-500">
              Industrial Intelligence
            </span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-center text-slate-900">
            {tx(lang, {fr:'Créer un compte',ar:'إنشاء حساب',en:'Create account',es:'Crear cuenta',pt:'Criar conta',tr:'Hesap oluştur'})}
          </h2>
          <p className="mt-2 text-sm text-center max-w-xs text-slate-600">
            {tx(lang, {fr:'Rejoignez-nous pour optimiser votre flux industriel',ar:'انضم إلينا لبدء تحسين سير عملك الصناعي',en:'Join us to start optimizing your industrial workflow',es:'Únete para optimizar tu flujo de trabajo industrial',pt:'Junte-se a nós para otimizar seu fluxo de trabalho industrial',tr:'Endüstriyel iş akışınızı optimize etmek için bize katılın'})}
          </p>
        </motion.div>

        {/* Email confirmation pending screen */}
        {confirmationSent && (
          <motion.div variants={itemVariants} className="mt-8 text-center p-6 rounded-2xl bg-emerald-50/50 border border-emerald-100/80 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
              <Mail className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{tx(lang, {fr:'Vérifiez votre boîte mail',ar:'تحقق من بريدك الإلكتروني',en:'Check your inbox',es:'Revisa tu bandeja de entrada',pt:'Verifique sua caixa de entrada',tr:'E-posta kutunuzu kontrol edin'})}</h3>
            <p className="text-sm text-slate-600">
              {tx(lang, {fr:'Un lien de confirmation a été envoyé à ',ar:'تم إرسال رابط التأكيد إلى ',en:'A confirmation link has been sent to ',es:'Se ha enviado un enlace de confirmación a ',pt:'Um link de confirmação foi enviado para ',tr:'Onay bağlantısı gönderildi: '})}
              <span className="font-semibold text-emerald-600">{email}</span>.<br />
              {tx(lang, {fr:'Cliquez sur ce lien puis revenez vous connecter.',ar:'انقر على الرابط ثم عد لتسجيل الدخول.',en:'Click the link, then come back to sign in.',es:'Haz clic en el enlace y vuelve para iniciar sesión.',pt:'Clique no link e volte para fazer login.',tr:'Bağlantıya tıklayın ve giriş yapmak için geri dönün.'})}
            </p>
            <button
              onClick={onSwitch}
              className="mt-4 w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-[0_10px_20px_rgba(16,185,129,0.15)] hover:shadow-[0_15px_30px_rgba(16,185,129,0.25)] transition-all cursor-pointer"
            >
              {tx(lang, {fr:'Aller à la connexion',ar:'الذهاب إلى تسجيل الدخول',en:'Go to sign in',es:'Ir a iniciar sesión',pt:'Ir para o login',tr:'Giriş yapmaya git'})}
            </button>
          </motion.div>
        )}

        <form className={`mt-8 space-y-5 ${confirmationSent ? 'hidden' : ''}`} onSubmit={handleSubmit}>
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
              </div>
              <input
                type="text"
                required
                className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                placeholder={tx(lang, {fr:'Nom complet',ar:'الاسم الكامل',en:'Full Name',es:'Nombre completo',pt:'Nome completo',tr:'Ad Soyad'})}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 transition-colors duration-300 text-slate-400 group-focus-within:text-emerald-600" />
              </div>
              <input
                type="email"
                required
                className="w-full pl-11 pr-4 py-4 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 bg-slate-50/50 focus:bg-white placeholder-slate-400 sm:text-sm transition-all duration-200 shadow-sm"
                placeholder={tx(lang, {fr:'Adresse email',ar:'البريد الإلكتروني',en:'Email address',es:'Correo electrónico',pt:'Endereço de email',tr:'E-posta adresi'})}
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
                placeholder={tx(lang, {fr:'Mot de passe',ar:'كلمة المرور',en:'Password',es:'Contraseña',pt:'Senha',tr:'Şifre'})}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
            className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 hover:shadow-emerald-500/20 shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {tx(lang, {fr:'Créer le compte',ar:'إنشاء الحساب',en:'Create account',es:'Crear cuenta',pt:'Criar conta',tr:'Hesap oluştur'})} <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>

          {(signInWithGoogle || onGuest) && (
            <motion.div variants={itemVariants} className="mt-6">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{tx(lang, {fr:'Ou',ar:'أو',en:'Or',es:'O',pt:'Ou',tr:'Veya'})}</span>
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
                  {tx(lang, {fr:'Continuer avec Google',ar:'المتابعة عبر Google',en:'Continue with Google',es:'Continuar con Google',pt:'Continuar com Google',tr:'Google ile devam et'})}
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
                  {tx(lang, {fr:'Continuer en tant qu\'invité',ar:'المتابعة كزائر',en:'Continue as guest',es:'Continuar como invitado',pt:'Continuar como convidado',tr:'Misafir olarak devam et'})}
                </motion.button>
              )}
            </motion.div>
          )}

        </form>

        <motion.div variants={itemVariants} className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            {tx(lang, {fr:'Vous avez déjà un compte ?',ar:'هل لديك حساب بالفعل؟',en:'Already have an account?',es:'¿Ya tienes una cuenta?',pt:'Já tem uma conta?',tr:'Zaten hesabınız var mı?'})}{' '}
            <button 
              onClick={onSwitch} 
              className="font-bold transition-colors hover:underline decoration-2 underline-offset-4 text-emerald-600 hover:text-emerald-500"
            >
              {tx(lang, {fr:'Se connecter',ar:'تسجيل الدخول',en:'Sign in',es:'Iniciar sesión',pt:'Entrar',tr:'Giriş yap'})}
            </button>
          </p>
        </motion.div>
      </motion.div>

      {/* Footer Copyright */}
      <div className="absolute bottom-6 text-center w-full z-10">
         <p className="text-xs font-medium text-slate-600">{tx(lang, {fr:`© ${new Date().getFullYear()} BeraMethode. Tous droits réservés.`,ar:`© ${new Date().getFullYear()} BeraMethode. جميع الحقوق محفوظة.`,en:`© ${new Date().getFullYear()} BeraMethode. All rights reserved.`,es:`© ${new Date().getFullYear()} BeraMethode. Todos los derechos reservados.`,pt:`© ${new Date().getFullYear()} BeraMethode. Todos os direitos reservados.`,tr:`© ${new Date().getFullYear()} BeraMethode. Tüm hakları saklıdır.`})}</p>
      </div>
    </div>
  );
}
