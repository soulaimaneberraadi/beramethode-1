import React from 'react';
import { motion, Variants } from 'framer-motion';
import { ArrowRight, LayoutDashboard, CalendarClock, LineChart, Sparkles } from 'lucide-react';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import { tx } from '../lib/i18n';

/**
 * Écran de bienvenue affiché UNE SEULE FOIS, juste après la création d'un
 * nouveau compte. Le déclenchement et la persistance (liée au compte) sont
 * gérés dans App.tsx via `bera_welcome_pending` + `bera_welcome_seen__<email>`.
 */
export default function Welcome({ userName, onStart }: { userName?: string; onStart: () => void }) {
  const { lang } = useLang();
  const isDark = useIsDark();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
  };
  const itemVariants: Variants = {
    hidden: { y: 24, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  };

  const firstName = (userName || '').trim().split(' ')[0];

  const features = [
    {
      icon: CalendarClock,
      title: tx(lang, { fr: 'Planification', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planejamento', tr: 'Planlama' }),
      desc: tx(lang, {
        fr: 'Ordonnancez votre production sur un Gantt intelligent.',
        ar: 'نظّم إنتاجك عبر مخطط Gantt ذكي.',
        en: 'Schedule your production on a smart Gantt.',
        es: 'Organiza tu producción en un Gantt inteligente.',
        pt: 'Organize sua produção num Gantt inteligente.',
        tr: 'Üretiminizi akıllı bir Gantt üzerinde planlayın.',
      }),
    },
    {
      icon: LayoutDashboard,
      title: tx(lang, { fr: 'Coûts & Méthodes', ar: 'التكاليف والطرق', en: 'Costs & Methods', es: 'Costos y métodos', pt: 'Custos e métodos', tr: 'Maliyet ve yöntemler' }),
      desc: tx(lang, {
        fr: 'Calculez le prix de revient au centime près.',
        ar: 'احسب سعر التكلفة بدقّة متناهية.',
        en: 'Compute the cost price down to the cent.',
        es: 'Calcula el precio de costo al céntimo.',
        pt: 'Calcule o preço de custo ao centavo.',
        tr: 'Maliyet fiyatını kuruşuna kadar hesaplayın.',
      }),
    },
    {
      icon: LineChart,
      title: tx(lang, { fr: 'Suivi & Rendement', ar: 'المتابعة والعائد', en: 'Tracking & Efficiency', es: 'Seguimiento y rendimiento', pt: 'Acompanhamento e rendimento', tr: 'Takip ve verimlilik' }),
      desc: tx(lang, {
        fr: 'Pilotez vos ateliers avec des KPI en temps réel.',
        ar: 'قُد ورشاتك بمؤشّرات أداء لحظية.',
        en: 'Drive your workshops with real-time KPIs.',
        es: 'Dirige tus talleres con KPI en tiempo real.',
        pt: 'Conduza suas oficinas com KPIs em tempo real.',
        tr: 'Atölyelerinizi gerçek zamanlı KPI’larla yönetin.',
      }),
    },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans dark:bg-dk-bg"
      style={{
        backgroundColor: isDark ? '#14211C' : '#f8fafc',
        backgroundSize: '24px 24px',
        backgroundImage: isDark
          ? 'radial-gradient(circle, #2E463C 1.5px, transparent 1.5px)'
          : 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
      }}
    >
      {/* Ambient decorative blobs */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, -30, 0], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-[20%] -right-[10%] w-[80%] h-[80%] rounded-full blur-[140px] bg-emerald-400/10"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], x: [0, 50, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[140px] bg-indigo-200/20"
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-lg w-full bg-white border border-slate-200/80 rounded-[32px] p-8 sm:p-10 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.08)] relative z-10 dark:bg-dk-surface dark:border-dk-border"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800/50 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            {tx(lang, { fr: 'Bienvenue', ar: 'مرحباً بك', en: 'Welcome', es: 'Bienvenido', pt: 'Bem-vindo', tr: 'Hoş geldiniz' })}
          </span>
        </motion.div>

        {/* Brand + greeting */}
        <motion.div variants={itemVariants} className="mt-6 text-center">
          <h1 className="select-none text-3xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text">
            BERA<span className="text-emerald-600 dark:text-emerald-400">METHODE</span>
          </h1>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-dk-text">
            {firstName
              ? tx(lang, {
                  fr: `Ravi de vous voir, ${firstName} !`,
                  ar: `سعداء بانضمامك، ${firstName}!`,
                  en: `Great to have you, ${firstName}!`,
                  es: `¡Encantados de verte, ${firstName}!`,
                  pt: `Que bom ter você, ${firstName}!`,
                  tr: `Aramıza hoş geldin, ${firstName}!`,
                })
              : tx(lang, {
                  fr: 'Votre compte est prêt !',
                  ar: 'حسابك جاهز!',
                  en: 'Your account is ready!',
                  es: '¡Tu cuenta está lista!',
                  pt: 'Sua conta está pronta!',
                  tr: 'Hesabınız hazır!',
                })}
          </h2>
          <p className="mt-3 text-sm text-slate-600 max-w-sm mx-auto dark:text-dk-text-soft">
            {tx(lang, {
              fr: "Voici un aperçu de ce que BERAMETHODE va faire pour votre atelier textile.",
              ar: 'إليك لمحة عمّا سيقدّمه BERAMETHODE لورشتك النسيجية.',
              en: "Here's a glimpse of what BERAMETHODE will do for your textile workshop.",
              es: 'Aquí tienes un vistazo de lo que BERAMETHODE hará por tu taller textil.',
              pt: 'Veja um resumo do que o BERAMETHODE fará pela sua oficina têxtil.',
              tr: 'İşte BERAMETHODE’un tekstil atölyeniz için yapacaklarına kısa bir bakış.',
            })}
          </p>
        </motion.div>

        {/* Feature list */}
        <div className="mt-8 space-y-3">
          {features.map((f, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/60 dark:border-dk-border dark:bg-dk-bg/40"
            >
              <div className="shrink-0 w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center dark:bg-emerald-900/40">
                <f.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-dk-text">{f.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500 leading-relaxed dark:text-dk-muted">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onStart}
          className="mt-8 w-full flex justify-center items-center gap-2 py-4 px-4 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg hover:shadow-emerald-500/20 transition-all duration-200 cursor-pointer"
        >
          {tx(lang, { fr: 'Commencer', ar: 'لنبدأ', en: 'Get started', es: 'Empezar', pt: 'Começar', tr: 'Başlayalım' })}
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </div>
  );
}
