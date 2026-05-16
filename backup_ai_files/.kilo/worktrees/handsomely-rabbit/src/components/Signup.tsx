import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, User, Github, Chrome, ArrowRight, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Signup({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      login(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isDark = theme === 'dark';

  // Animation Variants for Progressive Loading
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans transition-colors duration-1000 ${isDark ? 'bg-slate-900' : 'bg-[#f0f4f8]'}`}>
      
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
            Create account
          </h2>
          <p className={`mt-2 text-sm text-center max-w-xs transition-colors duration-500 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Join us to start optimizing your industrial workflow
          </p>
        </motion.div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className={`h-5 w-5 transition-colors duration-300 ${isDark ? 'text-slate-400 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'}`} />
              </div>
              <input
                type="text"
                required
                className={`block w-full pl-11 pr-4 py-4 rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-200 sm:text-sm shadow-inner ${
                  isDark 
                    ? 'bg-slate-800/50 border border-slate-700/50 text-white focus:bg-slate-800 focus:ring-emerald-500/50 focus:border-emerald-500/50' 
                    : 'bg-white border border-slate-200 text-slate-900 focus:bg-white focus:ring-emerald-500/30 focus:border-emerald-500'
                }`}
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
                Sign up <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>


        </form>
        
        <motion.div variants={itemVariants} className="mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className={`h-px flex-1 ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`} />
          </div>
          <p className={`text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Already have an account?{' '}
            <button 
              onClick={onSwitch} 
              className={`font-bold transition-colors hover:underline decoration-2 underline-offset-4 ${
                isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'
              }`}
            >
              Sign in
            </button>
          </p>
        </motion.div>
      </motion.div>
      
      {/* Footer Copyright */}
      <div className="absolute bottom-6 text-center w-full z-10">
         <p className={`text-xs font-medium transition-colors duration-500 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>© {new Date().getFullYear()} BeraMethode. All rights reserved.</p>
      </div>
    </div>
  );
}
