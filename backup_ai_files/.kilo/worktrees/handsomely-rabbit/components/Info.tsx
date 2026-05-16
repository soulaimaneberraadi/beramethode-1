
import React, { useState } from 'react';
import { 
  Mail, 
  Phone, 
  Globe, 
  Code, 
  Cpu, 
  Lightbulb, 
  Info as InfoIcon,
  CheckCircle2,
  Award,
  Briefcase
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

export default function Info() {
  const [lang, setLang] = useState<Lang>('fr');
  const t = CONTENT[lang];
  const isRTL = lang === 'ar';

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden relative group">
          <div className="h-40 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 relative">
             <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
             
             {/* Language Switcher */}
             <div className="absolute top-4 right-4 flex gap-2 z-10">
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
                   SB
                </div>
             </div>
             
             <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'} w-full pt-4 md:pt-0`}>
                <h1 className="text-4xl font-black text-slate-800 mb-2 drop-shadow-sm tracking-tight">Soulaiman Berraadi</h1>
                <div className="flex items-center gap-2 text-indigo-600 font-bold bg-indigo-50 px-4 py-1.5 rounded-full w-fit mb-6 shadow-sm border border-indigo-100">
                   <Code className="w-4 h-4" />
                   <span className="text-sm uppercase tracking-wide">{t.role}</span>
                </div>
                
                <div className={`flex flex-wrap gap-4 text-sm font-medium text-slate-600 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                   <a href="mailto:soulaimaneberraadi@gmail.com" className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 rounded-lg border border-slate-200 hover:border-indigo-200 hover:text-indigo-600 transition-all">
                      <Mail className="w-4 h-4" /> soulaimaneberraadi@gmail.com
                   </a>
                   <a href="tel:+212608793188" className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 rounded-lg border border-slate-200 hover:border-emerald-200 hover:text-emerald-600 transition-all">
                      <Phone className="w-4 h-4" /> 06 08 79 31 88
                   </a>
                </div>
             </div>
          </div>
        </div>

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

            {/* NEW: SKILLS SECTION */}
            <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group ${isRTL ? 'text-right' : 'text-left'}`}>
                <div className={`w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'ml-auto' : ''}`}>
                    <Award className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-3">{t.skillsTitle}</h2>
                <p className="text-slate-500 leading-relaxed text-sm font-medium">
                    {t.skillsDesc}
                </p>
            </div>

            {/* NEW: SERVICES SECTION */}
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
