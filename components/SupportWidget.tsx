import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, X, ChevronLeft, Send } from 'lucide-react';
import { supabase } from '../src/lib/supabaseClient';
import {
  listMyTickets,
  listMessages,
  sendUserMessage,
  markTicketReadByUser,
  subscribeUserSupport,
  countUnreadForUser,
  isUnreadForUser,
} from '../src/lib/support';
import type { SupportTicket, SupportMessage } from '../src/lib/supportTypes';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

interface Props {
  user?: { id?: string | number; email?: string } | null;
}

const STATUS_LABEL = (lang: string): Record<string, string> => ({
  nouveau: tx(lang, {fr:"Nouveau",ar:"جديد",en:"New",es:"Nuevo",pt:"Novo",tr:"Yeni"}),
  en_cours: tx(lang, {fr:"En cours",ar:"قيد المعالجة",en:"In progress",es:"En curso",pt:"Em andamento",tr:"Devam ediyor"}),
  resolu: tx(lang, {fr:"Résolu",ar:"تم الحل",en:"Resolved",es:"Resuelto",pt:"Resolvido",tr:"Çözüldü"}),
});
const STATUS_CLS: Record<string, string> = {
  nouveau: 'bg-red-50 text-red-600',
  en_cours: 'bg-amber-50 text-amber-600',
  resolu: 'bg-emerald-50 text-emerald-600',
};

const fmt = (iso?: string) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
};

const SupportWidget: React.FC<Props> = ({ user }) => {
  const { lang } = useLang();
  const [userId, setUserId] = useState<string | null>(user?.id ? String(user.id) : null);
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const activeRef = useRef<SupportTicket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  activeRef.current = active;

  // Résout l'identité (prop sinon session Supabase).
  useEffect(() => {
    if (userId) return;
    supabase.auth.getUser().then(({ data }) => { if (data.user?.id) setUserId(data.user.id); }).catch(() => {});
  }, [userId]);

  const refreshTickets = useCallback(async () => {
    setTickets(await listMyTickets());
  }, []);

  const openTicket = useCallback(async (t: SupportTicket) => {
    setActive(t);
    if (t.id) {
      setMessages(await listMessages(t.id));
      await markTicketReadByUser(t.id);
      setTickets(prev => prev.map(x => x.id === t.id ? { ...x, user_last_read_at: new Date().toISOString() } : x));
    }
  }, []);

  // Chargement initial + temps réel (Broadcast).
  useEffect(() => {
    if (!userId) return;
    refreshTickets();
    const unsub = subscribeUserSupport(userId, async () => {
      await refreshTickets();
      const cur = activeRef.current;
      if (cur?.id) setMessages(await listMessages(cur.id));
    });
    return unsub;
  }, [userId, refreshTickets]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!active?.id || !text.trim() || sending) return;
    setSending(true);
    const ok = await sendUserMessage(active.id, text);
    if (ok) {
      setText('');
      setMessages(await listMessages(active.id));
    }
    setSending(false);
  };

  const unread = countUnreadForUser(tickets);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Support / Messages"
        className="relative hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 text-gray-400 hover:text-emerald-600 hover:border-emerald-100 transition-colors cursor-pointer"
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => { setOpen(false); setActive(null); }} />
          <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-xl z-[91] overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
            {/* En-tête */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              {active ? (
                <button onClick={() => setActive(null)} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
                  <ChevronLeft className="w-4 h-4" /> {tx(lang, {fr:"Retour",ar:"رجوع",en:"Back",es:"Volver",pt:"Voltar",tr:"Geri"})}
                </button>
              ) : (
                <span className="text-sm font-bold text-slate-800">{tx(lang, {fr:"Support",ar:"الدعم الفني",en:"Support",es:"Soporte",pt:"Suporte",tr:"Destek"})}</span>
              )}
              <button onClick={() => { setOpen(false); setActive(null); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Liste des tickets */}
            {!active && (
              <div className="overflow-auto">
                {tickets.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">{tx(lang, {fr:"Aucun message pour le moment.",ar:"لا توجد رسائل حالياً.",en:"No messages yet.",es:"Ningún mensaje por ahora.",pt:"Nenhuma mensagem no momento.",tr:"Henüz mesaj yok."})}</div>
                ) : tickets.map(t => (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t)}
                    className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 items-start"
                  >
                    <span className="text-base shrink-0">{t.kind === 'connexion' ? '📡' : t.kind === 'question' ? '💬' : '⚠️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_CLS[t.status] || ''}`}>{STATUS_LABEL(lang)[t.status] || t.status}</span>
                        {isUnreadForUser(t) && <span className="w-2 h-2 rounded-full bg-red-500" />}
                      </div>
                      <p className="text-sm text-slate-700 truncate mt-0.5">{t.message}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fmt(t.last_message_at)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Fil de discussion */}
            {active && (
              <>
                <div className="flex-1 overflow-auto p-3 space-y-2 bg-slate-50">
                  <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{active.message}</span>
                    {active.view && <span className="ml-1">· {active.view}</span>}
                  </div>
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                        {m.text}
                        <div className={`text-[10px] mt-0.5 ${m.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'}`}>{fmt(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <div className="p-2 border-t border-slate-100 flex gap-2 shrink-0">
                  <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                    placeholder={tx(lang, {fr:"Écrire un message…",ar:"اكتب رسالة…",en:"Write a message…",es:"Escribir un mensaje…",pt:"Escrever uma mensagem…",tr:"Bir mesaj yazın…"})}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-300"
                  />
                  <button onClick={handleSend} disabled={sending || !text.trim()}
                    className="px-3 rounded-lg bg-emerald-600 text-white disabled:opacity-40 flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SupportWidget;
