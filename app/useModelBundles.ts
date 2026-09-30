import { useCallback } from 'react';
import type { ModelData, PlanningEvent, SuiviData, DemandeAppro } from '../types';
import {
    TYPE_PAQUET, lirePaquet, preparerImport, resumerLiens, nomFichierPaquet,
    type EntreePaquet, type LiensModele, type LinkedSummary, type DeleteScope, type PaquetModeles,
} from '../lib/modelBundle';
import { rehydraterModeles } from '../lib/photosLocales';
import { creerModeleSurServeur } from '../lib/persistModel';
import { idsSupprimes } from '../lib/fusionLocale';
import { addTombstone } from '../src/lib/apiShim';
import { loadManualLinksByModel, saveManualLinksByModel } from './machineUtils';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

interface Props {
    user: any;
    models: ModelData[];
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    planningEvents: PlanningEvent[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    suivis: SuiviData[];
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    demandesAppro: DemandeAppro[];
    setDemandesAppro: React.Dispatch<React.SetStateAction<DemandeAppro[]>>;
    /** Suppression du modele lui-meme (serveur + pierre tombale + liens manuels). */
    deleteModel: (id: string) => void;
    showToast: (msg: string, type?: 'success' | 'error') => void;
}

/** Lecture d'une liste distante ; `null` si la page n'est pas joignable (hors ligne, droits). */
const lireListe = async (url: string): Promise<any[] | null> => {
    try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return null;
        const d = await r.json();
        return Array.isArray(d) ? d : null;
    } catch {
        return null;
    }
};

const memeModele = (v: unknown, id: string) => v != null && String(v) === String(id);

/**
 * Export / import / suppression d'un modele AVEC ce qui lui est lie ailleurs :
 * OF du Planning, suivis, demandes d'appro, commandes de sous-traitance,
 * releves du Suivi par poste et liens de l'Implantation.
 *
 * Chaque nature de ligne passe par le chemin que sa page utilise deja, pour
 * marcher de la meme facon en local (serveur de l'atelier) et sur Vercel :
 * Planning, suivis et demandes par l'etat de l'application (que ses effets
 * enregistrent), sous-traitance et suivi par poste par leurs adresses /api.
 */
export function useModelBundles({
    user, models, setModels, planningEvents, setPlanningEvents, suivis, setSuivis,
    demandesAppro, setDemandesAppro, deleteModel, showToast,
}: Props) {
    const { lang } = useLang();

    const lireDistants = useCallback(async () => {
        const [sousTraitance, postesSuivi] = await Promise.all([
            lireListe('/api/subcontract'),
            lireListe('/api/poste-suivi'),
        ]);
        return { sousTraitance: sousTraitance || [], postesSuivi: postesSuivi || [] };
    }, []);

    const liensDe = useCallback((id: string, distants: { sousTraitance: any[]; postesSuivi: any[] }): LiensModele => ({
        planning: planningEvents.filter(e => memeModele(e.modelId, id)),
        suivis: suivis.filter(s => memeModele(s.modelId, id)),
        demandes: demandesAppro.filter(d => memeModele(d.modelId, id)),
        sousTraitance: distants.sousTraitance.filter(o => memeModele(o?.modelId, id)),
        postesSuivi: distants.postesSuivi.filter(p => memeModele(p?.modelId, id)),
        liensImplantation: loadManualLinksByModel(id) || [],
    }), [planningEvents, suivis, demandesAppro]);

    const getLinkedSummary = useCallback(async (ids: string[]): Promise<LinkedSummary> => {
        const distants = await lireDistants();
        return resumerLiens(ids.map(id => liensDe(id, distants)));
    }, [lireDistants, liensDe]);

    const exportModels = useCallback(async (ids: string[]) => {
        const choisis = models.filter(m => ids.includes(m.id));
        if (choisis.length === 0) return;
        // Les photos peuvent n'etre que des references vers le stockage de
        // l'appareil : le fichier doit emporter les images elles-memes.
        let complets: ModelData[] = choisis;
        try { complets = await rehydraterModeles(choisis); } catch { /* on exporte sans rehydratation */ }
        const distants = await lireDistants();
        const entrees: EntreePaquet[] = complets.map(m => ({ modele: m, liens: liensDe(m.id, distants) }));
        const paquet: PaquetModeles = {
            type: TYPE_PAQUET, version: 1, exportedAt: new Date().toISOString(), app: 'BERAMETHODE', modeles: entrees,
        };
        const blob = new Blob([JSON.stringify(paquet, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomFichierPaquet(choisis);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const s = resumerLiens(entrees.map(e => e.liens));
        showToast(tx(lang, {
            fr: `${choisis.length} modèle(s) exporté(s) avec ${s.total} élément(s) lié(s).`,
            ar: `تم تصدير ${choisis.length} موديل مع ${s.total} عنصر مرتبط.`,
            en: `${choisis.length} model(s) exported with ${s.total} linked item(s).`,
            es: `${choisis.length} modelo(s) exportado(s) con ${s.total} elemento(s) vinculado(s).`,
            pt: `${choisis.length} modelo(s) exportado(s) com ${s.total} item(ns) vinculado(s).`,
            tr: `${choisis.length} model, ${s.total} bağlı öğeyle dışa aktarıldı.`,
        }));
    }, [models, lireDistants, liensDe, showToast, lang]);

    const importFiles = useCallback(async (files: File[]) => {
        const entrees: EntreePaquet[] = [];
        let illisibles = 0;
        for (const f of files) {
            try {
                const lues = lirePaquet(JSON.parse(await f.text()));
                if (lues.length === 0) illisibles++;
                entrees.push(...lues);
            } catch {
                illisibles++;
            }
        }
        if (entrees.length === 0) {
            showToast(tx(lang, {
                fr: 'Aucun modèle BERAMETHODE trouvé dans ce(s) fichier(s).',
                ar: 'لم يُعثر على أي موديل BERAMETHODE في هذا الملف.',
                en: 'No BERAMETHODE model found in the file(s).',
                es: 'No se encontró ningún modelo BERAMETHODE en el/los archivo(s).',
                pt: 'Nenhum modelo BERAMETHODE encontrado no(s) arquivo(s).',
                tr: 'Dosyalarda BERAMETHODE modeli bulunamadı.',
            }), 'error');
            return;
        }

        const occupes = {
            modeles: new Set<string>([...models.map(m => String(m.id)), ...idsSupprimes('models')]),
            planning: new Set<string>([...planningEvents.map(e => String(e.id)), ...idsSupprimes('planning')]),
            suivis: new Set<string>([...suivis.map(s => String(s.id)), ...idsSupprimes('suivi')]),
            demandes: new Set<string>([...demandesAppro.map(d => String(d.id)), ...idsSupprimes('demandes-appro')]),
        };
        const prepares = entrees.map(e => preparerImport(e, occupes));

        // Commandes de sous-traitance d'abord : le serveur leur donne son propre
        // identifiant, que la fiche du modele doit reprendre.
        let commandesEchouees = 0;
        for (const p of prepares) {
            for (const { ancienId, commande } of p.sousTraitance) {
                try {
                    const r = await fetch('/api/subcontract', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(commande),
                    });
                    if (!r.ok) { commandesEchouees++; continue; }
                    const rep = await r.json().catch(() => null);
                    const nouvelId = String(rep?.id ?? commande.id);
                    const st: any = p.modele.ficheData?.soustraitance;
                    if (st && ancienId && String(st.orderId) === ancienId) {
                        p.modele = { ...p.modele, ficheData: { ...p.modele.ficheData!, soustraitance: { ...st, orderId: nouvelId } } };
                    }
                } catch {
                    commandesEchouees++;
                }
            }
            // La fiche cite encore l'ancien numero : sa commande n'a pas pu etre
            // recreee. Elle ne doit pas pointer vers une commande qui n'existe pas ici.
            const st: any = p.modele.ficheData?.soustraitance;
            if (st?.orderId && p.sousTraitance.some(x => x.ancienId === String(st.orderId))) {
                p.modele = { ...p.modele, ficheData: { ...p.modele.ficheData!, soustraitance: { ...st, orderId: undefined } } };
            }
        }

        const nouveaux = prepares.map(p => p.modele);
        setModels(prev => [...nouveaux, ...prev]);
        const planning = prepares.flatMap(p => p.planning);
        const nouveauxSuivis = prepares.flatMap(p => p.suivis);
        const demandes = prepares.flatMap(p => p.demandes);
        if (planning.length) setPlanningEvents(prev => [...prev, ...planning]);
        if (nouveauxSuivis.length) setSuivis(prev => [...prev, ...nouveauxSuivis]);
        if (demandes.length) setDemandesAppro(prev => [...prev, ...demandes]);
        prepares.forEach(p => { if (p.liensImplantation.length) saveManualLinksByModel(p.modele.id, p.liensImplantation); });

        // Releves du suivi par poste : le serveur prend une enveloppe, le mode
        // Vercel une ligne a la fois.
        const postes = prepares.flatMap(p => p.postesSuivi);
        if (postes.length) {
            const envoyer = (corps: unknown) => fetch('/api/poste-suivi', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corps),
            }).catch(() => null);
            if (IS_STATIC) { for (const ps of postes) await envoyer(ps); }
            else await envoyer({ suivis: postes });
        }

        // Sans cette ecriture, la relecture du serveur au retour sur la page
        // effacerait les modeles importes.
        let modelesEchoues = 0;
        for (const m of nouveaux) {
            if (!(await creerModeleSurServeur(m, user))) modelesEchoues++;
        }

        const s = resumerLiens(prepares.map(p => ({
            planning: p.planning, suivis: p.suivis, demandes: p.demandes,
            sousTraitance: p.sousTraitance, postesSuivi: p.postesSuivi, liensImplantation: p.liensImplantation,
        })));
        const echecs = modelesEchoues + commandesEchouees + illisibles;
        showToast(tx(lang, {
            fr: `${nouveaux.length} modèle(s) importé(s) avec ${s.total} élément(s) lié(s)${echecs ? ` — ${echecs} élément(s) non enregistré(s)` : ''}.`,
            ar: `تم استيراد ${nouveaux.length} موديل مع ${s.total} عنصر مرتبط${echecs ? ` — ${echecs} عنصر لم يُحفظ` : ''}.`,
            en: `${nouveaux.length} model(s) imported with ${s.total} linked item(s)${echecs ? ` — ${echecs} item(s) not saved` : ''}.`,
            es: `${nouveaux.length} modelo(s) importado(s) con ${s.total} elemento(s) vinculado(s)${echecs ? ` — ${echecs} elemento(s) no guardado(s)` : ''}.`,
            pt: `${nouveaux.length} modelo(s) importado(s) com ${s.total} item(ns) vinculado(s)${echecs ? ` — ${echecs} item(ns) não salvo(s)` : ''}.`,
            tr: `${nouveaux.length} model, ${s.total} bağlı öğeyle içe aktarıldı${echecs ? ` — ${echecs} öğe kaydedilmedi` : ''}.`,
        }), echecs ? 'error' : 'success');
    }, [models, planningEvents, suivis, demandesAppro, setModels, setPlanningEvents, setSuivis, setDemandesAppro, user, showToast, lang]);

    /**
     * `model` : la fiche seule (toutes ses pages), le reste du programme garde
     * ses lignes. `all` : on retire aussi OF, suivis, demandes, commandes de
     * sous-traitance et releves par poste. Les factures ne sont JAMAIS
     * supprimees ici : ce sont des pieces comptables.
     */
    const deleteModelWithScope = useCallback(async (id: string, scope: DeleteScope = 'model') => {
        if (scope === 'all') {
            // Chaque suppression laisse sa pierre tombale : la synchro est une
            // union, sans elle le cloud reinstallerait les lignes effacees.
            const ofs = planningEvents.filter(e => memeModele(e.modelId, id));
            if (ofs.length) {
                ofs.forEach(e => { try { addTombstone('planning', String(e.id)); } catch { /* non bloquant */ } });
                setPlanningEvents(prev => prev.filter(e => !memeModele(e.modelId, id)));
            }
            const sv = suivis.filter(s => memeModele(s.modelId, id));
            if (sv.length) {
                sv.forEach(s => { try { addTombstone('suivi', String(s.id)); } catch { /* non bloquant */ } });
                setSuivis(prev => prev.filter(s => !memeModele(s.modelId, id)));
            }
            const da = demandesAppro.filter(d => memeModele(d.modelId, id));
            if (da.length) {
                da.forEach(d => { try { addTombstone('demandes-appro', String(d.id)); } catch { /* non bloquant */ } });
                setDemandesAppro(prev => prev.filter(d => !memeModele(d.modelId, id)));
            }
            const distants = await lireDistants();
            await Promise.all([
                ...distants.sousTraitance.filter(o => memeModele(o?.modelId, id))
                    .map(o => fetch(`/api/subcontract/${encodeURIComponent(o.id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)),
                ...distants.postesSuivi.filter(p => memeModele(p?.modelId, id))
                    .map(p => fetch(`/api/poste-suivi/${encodeURIComponent(p.id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)),
            ]);
        }
        deleteModel(id);
    }, [planningEvents, suivis, demandesAppro, setPlanningEvents, setSuivis, setDemandesAppro, lireDistants, deleteModel]);

    return { exportModels, importFiles, getLinkedSummary, deleteModelWithScope };
}
