import React, { useState } from 'react';
import { Lock, Key, ChevronRight, AlertCircle, ShieldCheck } from 'lucide-react';

const validateKey = async (key: string) => {
    // Basic format check
    const format = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!format.test(key)) return false;

    const parts = key.split('-');
    if (parts.length !== 4) return false;

    const p1 = parts[0];
    const p2 = parts[1];
    const p3 = parts[2];
    const expectedP4 = parts[3];

    // Simple SHA-256 equivalent for browser (Web Crypto API)
    const msgBuffer = new TextEncoder().encode(p1 + p2 + p3 + "BERAMETHODE_SECRET_V1");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex.substring(0, 4).toUpperCase() === expectedP4;
};

export default function LicenseScreen({ onValidated }: { onValidated: () => void }) {
    const [keyInput, setKeyInput] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleActivate = async () => {
        setLoading(true);
        setError(false);
        const isValid = await validateKey(keyInput.trim().toUpperCase());
        setLoading(false);

        if (isValid) {
            localStorage.setItem('beramethode_license_v1', 'VALID');
            onValidated();
        } else {
            setError(true);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden" dir="ltr">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/20 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]"></div>

            <div className="max-w-md w-full relative z-10 backdrop-blur-xl bg-slate-800/50 p-8 rounded-3xl border border-slate-700 shadow-2xl">
                <div className="flex flex-col items-center justify-center text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center rounded-2xl mb-4">
                        <Lock className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">BERA<span className="text-emerald-400">METHODE</span> V1</h1>
                    <p className="text-slate-400 text-sm mt-2">Activation du système requise</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Clé de Licence (License Key)</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Key className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                className={`block w-full pl-11 pr-4 py-4 bg-slate-900/50 border ${error ? 'border-red-500/50 focus:ring-red-500' : 'border-slate-700 focus:ring-emerald-500'} rounded-xl text-white font-mono tracking-widest outline-none transition-all placeholder:text-slate-600 focus:bg-slate-900`}
                            />
                        </div>
                        {error && (
                            <p className="flex items-center gap-1.5 text-red-400 text-xs mt-2 font-medium">
                                <AlertCircle className="w-4 h-4" /> Clé invalide ou expirée. Veuillez réessayer.
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleActivate}
                        disabled={loading || !keyInput}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)]"
                    >
                        {loading ? 'Vérification...' : 'Activer le Logiciel'}
                        {!loading && <ChevronRight className="w-5 h-5" />}
                    </button>
                </div>

                <div className="mt-8 text-center flex items-center justify-center gap-2 text-slate-500 text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Système de vérification hors-ligne cryptographiquement sécurisé</span>
                </div>
            </div>
        </div>
    );
}
