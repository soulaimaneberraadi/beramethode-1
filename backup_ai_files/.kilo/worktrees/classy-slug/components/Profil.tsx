import React, { useState } from 'react';
import { useAuth } from '../src/context/AuthContext';
import {
  Mail,
  Phone,
  Globe,
  Code,
  Cpu,
  Lightbulb,
  Award,
  Briefcase,
  Shield,
  Zap,
  Users,
  Copy,
  CheckCircle2
} from 'lucide-react';

type Lang = 'fr' | 'ar' | 'en' | 'es';

const CONTENT = {
  fr: {
    role: "Fondateur & Créateur",
    goalTitle: "Objectif du Programme",
    goalDesc: "BERAMETHODE est une solution experte pour l'industrialisation textile. Elle vise à simplifier le calcul des temps (GSD), l'équilibrage des chaînes et le calcul de coût de revient.",
    howTitle: "Comment ça marche ?",
    howDesc: "Commencez par l'Atelier pour créer un nouveau modèle. Définissez la gamme, analysez l'équilibrage et calculez les coûts. Sauvegardez ensuite votre travail dans la Bibliothèque.",
    contactTitle: "Contact",
    rights: "Tous droits réservés",
    skillsTitle: "Expertise & Compétences",
    skillsDesc: "Ingénierie Textile • Méthodes GSD • Optimisation des Processus • Lean Manufacturing • Gestion de Production",
    servicesTitle: "Services Proposés",
    servicesDesc: "Consulting Industriel • Formation Technique • Développement de Logiciels sur Mesure • Audit d'Atelier"
  },
  ar: {
    role: "المؤسس والمطور",
    goalTitle: "هدف البرنامج",
    goalDesc: "BERAMETHODE هو حل متكامل لصناعة النسيج. يهدف إلى تسهيل حساب التوقيت (GSD)، موازنة خطوط الإنتاج، وحساب تكلفة الدقيقة بدقة عالية.",
    howTitle: "كيف يعمل؟",
    howDesc: "ابدأ من 'الورشة' لإنشاء موديل جديد. حدد مراحل العمل، قم بتحليل التوازن وحساب التكاليف. ثم احفظ عملك في المكتبة للرجوع إليه لاحقاً.",
    contactTitle: "تواصل معي",
    rights: "جميع الحقوق محفوظة",
    skillsTitle: "الخبرات والمهارات",
    skillsDesc: "هندسة النسيج • طرق GSD • تحسين العمليات • التصنيع الرشيق (Lean) • إدارة الإنتاج",
    servicesTitle: "الخدمات المقدمة",
    servicesDesc: "استشارات صناعية • تدريب تقني • تطوير برمجيات مخصصة • تدقيق الورش والمصانع"
  },
  en: {
    role: "Founder & Creator",
    goalTitle: "Program Goal",
    goalDesc: "BERAMETHODE is an expert solution for textile industrialization. It aims to simplify time calculation (GSD), line balancing, and costing.",
    howTitle: "How it works?",
    howDesc: "Start in the Studio to create a new style. Define operations, analyze balancing, and calculate costs. Then save your work to the Library.",
    contactTitle: "Contact",
    rights: "All rights reserved",
    skillsTitle: "Expertise & Skills",
    skillsDesc: "Textile Engineering • GSD Methods • Process Optimization • Lean Manufacturing • Production Management",
    servicesTitle: "Services Offered",
    servicesDesc: "Industrial Consulting • Technical Training • Custom Software Development • Workshop Auditing"
  },
  es: {
    role: "Fundador y Creador",
    goalTitle: "Objetivo del Programa",
    goalDesc: "BERAMETHODE es una solución experta para la industrialización textil. Su objetivo es simplificar el cálculo de tiempos (GSD), el equilibrado de líneas y el cálculo de costes.",
    howTitle: "¿Cómo funciona?",
    howDesc: "Comience en el Taller para crear un nuevo modelo. Defina la gama, analice el equilibrio y calcule los costos. Luego guarde su trabajo en la Biblioteca.",
    contactTitle: "Contacto",
    rights: "Todos los derechos reservados",
    skillsTitle: "Experiencia y Habilidades",
    skillsDesc: "Ingeniería Textil • Métodos GSD • Optimización de Procesos • Lean Manufacturing • Gestión de Producción",
    servicesTitle: "Servicios Ofrecidos",
    servicesDesc: "Consultoría Industrial • Formación Técnica • Desarrollo de Software a Medida • Auditoría de Talleres"
  }
};

export default function Profil() {
  const [lang, setLang] = useState<Lang>('fr');
  const { user, login } = useAuth(); // Access Auth Context
  const t = CONTENT[lang];
  const isRTL = lang === 'ar';
  const [copied, setCopied] = useState(false);

  const inviteLink = "https://beramethode.pro/invite?token=XyZ1239";

  const handleBecomeAdmin = async () => {
    try {
      const res = await fetch('/api/setup-admin', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        login(data.user);
        alert("Félicitations ! Vous êtes maintenant Administrateur. Vous avez accès au tableau de bord.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* HEADER CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden relative group">
          <div className="h-40 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 relative">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

            {/* Language Switcher - Bypassed for now */}
            <div className="absolute top-4 right-4 flex gap-2 z-10 hidden">
              {['fr', 'ar', 'en', 'es'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l as Lang)}
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition-all ${lang === l ? 'bg-white text-indigo-900 shadow-lg scale-105' : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="px-8 pb-8 pt-0 relative flex flex-col md:flex-row items-start md:items-end gap-6 -mt-16">
            <div className="w-32 h-32 rounded-2xl bg-white p-1.5 shadow-2xl shrink-0 rotate-3 transition-transform group-hover:rotate-0 duration-500">
              <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-4xl border border-slate-200 relative overflow-hidden">
                {user?.name ? user.name.substring(0, 2).toUpperCase() : 'SB'}
              </div>
            </div>

            <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'} w-full pt-4 md:pt-0`}>
              <h1 className="text-4xl font-black text-slate-800 mb-2 drop-shadow-sm tracking-tight">{user?.name || 'Soulaiman Berraadi'}</h1>
              <div className="flex items-center gap-2 text-indigo-600 font-bold bg-indigo-50 px-4 py-1.5 rounded-full w-fit mb-6 shadow-sm border border-indigo-100">
                <Code className="w-4 h-4" />
                <span className="text-sm uppercase tracking-wide">{user?.role === 'admin' ? 'Administrateur' : t.role}</span>
              </div>

              <div className={`flex flex-wrap gap-4 text-sm font-medium text-slate-600 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                <a href={`mailto:${user?.email || 'soulaimaneberraadi@gmail.com'}`} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 rounded-lg border border-slate-200 hover:border-indigo-200 hover:text-indigo-600 transition-all">
                  <Mail className="w-4 h-4" /> {user?.email || 'soulaimaneberraadi@gmail.com'}
                </a>
                {/* Only show phone for default profile or if user adds it later */}
                {!user && (
                  <a href="tel:+212608793188" className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 rounded-lg border border-slate-200 hover:border-emerald-200 hover:text-emerald-600 transition-all">
                    <Phone className="w-4 h-4" /> 06 08 79 31 88
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ACCOUNT LIMITS & BILLING SECTION */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Détails de l'Abonnement
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current Plan */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Plan Actuel</span>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-black text-slate-800">{user?.role === 'admin' ? 'Premium' : 'Gratuit'}</span>
              </div>
              <p className="text-sm font-medium text-slate-600 mb-4">
                {user?.role === 'admin' ? "Accès illimité à toutes les fonctionnalités." : "Fonctionnalités basiques limitées."}
              </p>
              <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors text-sm">
                Mettre à niveau (Pro)
              </button>
            </div>

            {/* Usage Limits */}
            <div className="md:col-span-2 space-y-4 pt-1">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-bold text-slate-700">Modèles Créés</span>
                  <span className="text-sm font-bold text-slate-500">12 / {user?.role === 'admin' ? '∞' : '5'}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${user?.role === 'admin' ? 'bg-indigo-500 w-[15%]' : 'bg-red-500 w-full'}`}></div>
                </div>
                {!user || user.role !== 'admin' && (
                  <p className="text-xs text-red-500 mt-1 font-medium">Limite atteinte pour le plan gratuit.</p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-bold text-slate-700">Utilisateurs Invités</span>
                  <span className="text-sm font-bold text-slate-500">2 / {user?.role === 'admin' ? '10' : '1'}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${user?.role === 'admin' ? 'bg-indigo-500 w-[20%]' : 'bg-red-500 w-full'}`}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TEAM INVITATION SECTION (ADMIN ONLY) */}
        {user?.role === 'admin' && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Inviter un Collaborateur / Client
            </h2>
            <p className="text-sm text-indigo-700 mb-4">
              Partagez ce lien avec vos clients ou membres d'équipe pour leur donner accès au suivi de production en direct (Live View).
            </p>

            <div className="flex items-center gap-3">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 bg-white border border-indigo-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 outline-none select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors shrink-0"
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier le lien'}
              </button>
            </div>
          </div>
        )}

        {/* ADMIN ACTIVATION SECTION - Only visible if NOT admin */}
        {user && user.role !== 'admin' && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-2xl border border-purple-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-purple-900">Mode Administrateur</h3>
              <p className="text-purple-700 text-sm">Activez les droits d'administration pour accéder au tableau de bord et gérer les utilisateurs.</p>
            </div>
            <button
              onClick={handleBecomeAdmin}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 hover:shadow-purple-300 active:scale-95"
            >
              <Shield className="w-4 h-4" />
              Activer Admin
            </button>
          </div>
        )}

        {/* INFO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* GOAL SECTION */}
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className={`w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'ml-auto' : ''}`}>
              <Lightbulb className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-3">{t.goalTitle}</h2>
            <p className="text-slate-500 leading-relaxed text-sm">
              {t.goalDesc}
            </p>
          </div>

          {/* HOW IT WORKS SECTION */}
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className={`w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'ml-auto' : ''}`}>
              <Cpu className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-3">{t.howTitle}</h2>
            <p className="text-slate-500 leading-relaxed text-sm">
              {t.howDesc}
            </p>
          </div>

          {/* SKILLS SECTION */}
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className={`w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'ml-auto' : ''}`}>
              <Award className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-3">{t.skillsTitle}</h2>
            <p className="text-slate-500 leading-relaxed text-sm font-medium">
              {t.skillsDesc}
            </p>
          </div>

          {/* SERVICES SECTION */}
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className={`w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'ml-auto' : ''}`}>
              <Briefcase className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-3">{t.servicesTitle}</h2>
            <p className="text-slate-500 leading-relaxed text-sm font-medium">
              {t.servicesDesc}
            </p>
          </div>

        </div>

        {/* FOOTER */}
        <div className="text-center py-8 text-slate-400 text-xs">
          <p>© {new Date().getFullYear()} Soulaiman Berraadi. {t.rights}.</p>
          <div className="mt-2 flex justify-center gap-4 opacity-50">
            <Globe className="w-4 h-4" />
            <Code className="w-4 h-4" />
          </div>
        </div>

      </div>
    </div>
  );
}