import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, X } from 'lucide-react';

const SyncToast: React.FC = () => {
    const [msg, setMsg] = useState('');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onEnd = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail?.error) {
                if (timerRef.current) clearTimeout(timerRef.current);
                setMsg('');
                return;
            }

            if (timerRef.current) clearTimeout(timerRef.current);
            setMsg(String(detail.error));
            timerRef.current = setTimeout(() => setMsg(''), 6000);
        };

        window.addEventListener('beramethode:cloud-sync-end', onEnd);
        return () => {
            window.removeEventListener('beramethode:cloud-sync-end', onEnd);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const dismiss = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setMsg('');
    };

    if (!msg) return null;

    return (
        <div
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-2.5 rounded-xl shadow-2xl border transition-all duration-300 bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300"
            role="status"
            aria-live="polite"
        >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold whitespace-nowrap">{msg}</span>
            <button onClick={dismiss} className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};

export default SyncToast;
