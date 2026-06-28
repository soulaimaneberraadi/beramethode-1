import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';

export default function NetworkAccessPanel({ isDark }: { isDark: boolean }) {
  const { lang } = useLang();
  const [addresses, setAddresses] = useState<string[]>([]);
  const [port, setPort] = useState<number>(8000);
  const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(
    typeof window !== 'undefined' && window.innerWidth < 640
  );

  useEffect(() => {
    fetch('/api/network-info')
      .then(r => {
        if (!r.ok) throw new Error('offline');
        return r.json();
      })
      .then(data => {
        setAddresses(data.addresses || []);
        setPort(data.port || 8000);
        setStatus('online');
      })
      .catch(() => setStatus('offline'));
  }, []);

  const copyIp = async (ip: string) => {
    const url = `http://${ip}:${port}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 2000);
    } catch {
      // ignore
    }
  };

  const dotColor = status === 'online' ? 'bg-emerald-500' : status === 'offline' ? 'bg-red-500' : 'bg-amber-500';
  const statusLabel = status === 'online' ? tx(lang, {fr:"Connecté au serveur",ar:"متصل بالخادم",en:"Connected to server",es:"Conectado al servidor",pt:"Conectado ao servidor",tr:"Sunucuya bağlı"}) : status === 'offline' ? tx(lang, {fr:"Hors ligne",ar:"غير متصل",en:"Offline",es:"Fuera de línea",pt:"Offline",tr:"Çevrimdışı"}) : tx(lang, {fr:"Connexion…",ar:"جارٍ الاتصال…",en:"Connecting…",es:"Conectando…",pt:"Conectando…",tr:"Bağlanıyor…"});

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className={`fixed bottom-4 right-4 z-20 rounded-2xl backdrop-blur-xl border shadow-lg max-w-xs ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-white/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl ${
          collapsed ? '' : 'rounded-b-none border-b ' + (isDark ? 'border-white/10' : 'border-slate-200/60')
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${dotColor} ${status === 'loading' ? 'animate-pulse' : ''}`} />
        {status === 'offline' ? (
          <WifiOff className={`w-3.5 h-3.5 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
        ) : (
          <Wifi className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
        )}
        <span className={`text-xs font-bold uppercase tracking-wider flex-1 text-left ${
          isDark ? 'text-slate-200' : 'text-slate-700'
        }`}>
          {statusLabel}
        </span>
        {addresses.length > 0 && (
          <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {collapsed ? '▴' : '▾'}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && status === 'online' && addresses.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1.5">
              {addresses.map((ip) => {
                const isCopied = copiedIp === ip;
                return (
                  <button
                    key={ip}
                    onClick={() => copyIp(ip)}
                    className={`w-full flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg transition-all ${
                      isDark
                        ? 'bg-slate-800/60 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                    title={tx(lang, {fr:"Cliquer pour copier",ar:"انقر للنسخ",en:"Click to copy",es:"Clic para copiar",pt:"Clique para copiar",tr:"Kopyalamak için tıkla"})}
                  >
                    <span className="flex-1 text-left truncate">http://{ip}:{port}</span>
                    {isCopied ? (
                      <span className="flex items-center gap-1 text-emerald-500 font-sans font-semibold">
                        <Check className="w-3 h-3" /> {tx(lang, {fr:"Copié",ar:"تم النسخ",en:"Copied",es:"Copiado",pt:"Copiado",tr:"Kopyalandı"})}
                      </span>
                    ) : (
                      <Copy className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    )}
                  </button>
                );
              })}
              <p className={`text-[10px] pt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {tx(lang, {fr:"Tapez cette adresse depuis un autre appareil sur le même WiFi.",ar:"اكتب هذا العنوان من جهاز آخر على نفس WiFi",en:"Type this address from another device on the same WiFi",es:"Escriba esta dirección desde otro dispositivo en el mismo WiFi",pt:"Digite este endereço de outro dispositivo no mesmo WiFi",tr:"Aynı WiFi üzerindeki başka bir cihazdan bu adresi yazın"})}
              </p>
            </div>
          </motion.div>
        )}
        {!collapsed && status === 'offline' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className={`px-4 py-3 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {tx(lang, {fr:"Le serveur ne répond pas. Vérifiez que",ar:"الخادم لا يستجيب. تأكد من أن",en:"The server is not responding. Make sure",es:"El servidor no responde. Verifique que",pt:"O servidor não responde. Verifique se",tr:"Sunucu yanıt vermiyor. Şunun çalıştığından emin olun:"})} <code className="font-mono">npm run dev</code> {tx(lang, {fr:"est lancé.",ar:"قيد التشغيل.",en:"is running.",es:"está en ejecución.",pt:"está em execução.",tr:"çalışıyor."})}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
