/**
 * Les indicateurs du tableau de bord, calcules SUR L'APPAREIL.
 *
 * En mode statique (Vercel, telephone) il n'y a pas de serveur : `/api/*` est
 * servi depuis le stockage local. Or `/api/dashboard/kpis` n'y avait aucune
 * implementation — la requete tombait dans le cas « aucun magasin pour ce
 * chemin » et renvoyait un tableau vide. Tout le haut du tableau de bord
 * affichait donc « — » et « 0 » : OF en cours, effectif actif, valeur du stock,
 * avances. Non pas parce que les donnees manquaient — l'ecran Effectifs, lui,
 * les lit directement et les affiche — mais parce que personne ne les comptait.
 *
 * Ce module refait, a partir des memes donnees, ce que fait
 * `computeDashboardKPIs` cote serveur. La forme de la reponse est identique :
 * l'ecran ne sait pas d'ou vient le calcul.
 */

export interface SourcesKpis {
  planning: any[];
  suivis: any[];
  hrWorkers: any[];
  hrPointage: any[];
  hrAvances: any[];
  produits: any[];
  lots: any[];
  mouvements: any[];
  demandesAppro: any[];
}

const jour = (d: Date): string => d.toISOString().slice(0, 10);
const nombre = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
/** Une date au format ISO, quelle que soit la forme d'origine (`2026-09-03T08:00` → `2026-09-03`). */
const dateSeule = (v: unknown): string => String(v ?? '').slice(0, 10);
const centimes = (v: number): number => Math.round(v * 100) / 100;

const grouperSomme = (
  lignes: any[],
  cle: (l: any) => string,
  valeur: (l: any) => number,
): { date: string; total: number }[] => {
  const par = new Map<string, number>();
  for (const l of lignes) {
    const k = cle(l);
    if (!k) continue;
    par.set(k, (par.get(k) || 0) + valeur(l));
  }
  return [...par.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, total]) => ({ date, total }));
};

export const calculerKpisLocaux = (s: SourcesKpis) => {
  const aujourdhui = jour(new Date());
  const ilYA7Jours = jour(new Date(Date.now() - 6 * 86400000));
  const debutDuMois = aujourdhui.slice(0, 8) + '01';

  // ── Planning ───────────────────────────────────────────────────────────────
  const planning = Array.isArray(s.planning) ? s.planning.filter(Boolean) : [];
  const qteTotal = planning.reduce((n, e) => n + nombre(e.qteTotal), 0);
  const qteProduite = planning.reduce((n, e) => n + nombre(e.qteProduite), 0);

  // ── Effectifs ──────────────────────────────────────────────────────────────
  // `is_active` peut valoir 1 (colonne SQLite) ou true (objet JSON).
  const actifs = (s.hrWorkers || []).filter((w: any) => w && (w.is_active === 1 || w.is_active === true));
  const idsActifs = new Set(actifs.map((w: any) => String(w.id)));
  const pointageDuJour = (s.hrPointage || []).filter(
    (p: any) => p && dateSeule(p.date) === aujourdhui && idsActifs.has(String(p.worker_id)),
  );
  const presents = pointageDuJour.filter((p: any) => p.statut === 'PRESENT' || p.statut === 'RETARD').length;
  const totalEffectif = actifs.length;

  // ── Stock ──────────────────────────────────────────────────────────────────
  const lotsDisponibles = (s.lots || []).filter((l: any) => l && l.etat === 'disponible');
  const resteParProduit = new Map<string, number>();
  for (const l of lotsDisponibles) {
    const k = String(l.productId);
    resteParProduit.set(k, (resteParProduit.get(k) || 0) + nombre(l.quantiteRestante));
  }
  const valeurStock = lotsDisponibles.reduce(
    (n: number, l: any) => n + nombre(l.quantiteRestante) * nombre(l.prixUnitaire), 0,
  );
  const alertes = (s.produits || [])
    .filter((p: any) => p && nombre(p.stockAlerte) > 0
      && (resteParProduit.get(String(p.id)) || 0) <= nombre(p.stockAlerte))
    .map((p: any) => ({
      id: p.id, designation: p.designation, reference: p.reference,
      stockAlerte: nombre(p.stockAlerte), categorie: p.categorie,
      stock_actuel: resteParProduit.get(String(p.id)) || 0,
    }))
    .sort((a, b) => a.stock_actuel - b.stock_actuel)
    .slice(0, 5);

  // ── RH ─────────────────────────────────────────────────────────────────────
  const avances = (s.hrAvances || []).filter(
    (a: any) => a && (a.statut === 'APPROUVE' || a.statut === 'EN_COURS'),
  );

  // ── Courbes ────────────────────────────────────────────────────────────────
  const suivis7j = (s.suivis || []).filter((x: any) => x && dateSeule(x.date) >= ilYA7Jours);
  const chaineParPlanning = new Map<string, string>();
  for (const e of planning) if (e.id != null) chaineParPlanning.set(String(e.id), e.chaineId || '');

  const parChaine = new Map<string, { total: number; jours: number }>();
  for (const x of suivis7j) {
    const c = chaineParPlanning.get(String(x.planningId)) || '';
    if (!c) continue;
    const e = parChaine.get(c) || { total: 0, jours: 0 };
    e.total += nombre(x.pJournaliere); e.jours += 1;
    parChaine.set(c, e);
  }

  return {
    planning: {
      total: planning.length,
      en_cours: planning.filter((e: any) => e.status === 'IN_PROGRESS').length,
      termines: planning.filter((e: any) => e.status === 'DONE').length,
      qte_total: qteTotal,
      qte_produite: qteProduite,
      avancement: qteTotal > 0 ? Math.round((qteProduite / qteTotal) * 100) : 0,
    },
    effectifs: {
      total: totalEffectif,
      cdi: actifs.filter((w: any) => w.type_contrat === 'CDI').length,
      presents,
      absents: pointageDuJour.filter((p: any) => p.statut === 'ABSENT').length,
      retards: pointageDuJour.filter((p: any) => p.statut === 'RETARD').length,
      taux_presence: totalEffectif > 0 ? Math.round((presents / totalEffectif) * 100) : 0,
    },
    stock: {
      nb_produits: (s.produits || []).length,
      valeur_totale: centimes(valeurStock),
      nb_alertes: alertes.length,
      alertes,
    },
    rh: {
      avances_encours: centimes(avances.reduce((n: number, a: any) => n + nombre(a.solde_restant), 0)),
      demandes_attente: (s.demandesAppro || []).filter((d: any) => d && d.statut === 'attente').length,
    },
    charts: {
      prod_7j: grouperSomme(suivis7j, (x) => dateSeule(x.date), (x) => nombre(x.pJournaliere)),
      mouvements_7j: grouperSomme(
        (s.mouvements || []).filter((m: any) => m && m.type === 'entree' && dateSeule(m.date) >= ilYA7Jours),
        (m) => dateSeule(m.date), (m) => nombre(m.quantite),
      ).map(({ date, total }) => ({ date, total_entrees: total })),
      prod_par_chaine: [...parChaine.entries()]
        .map(([chaine, v]) => ({ chaine, total: v.total, jours: v.jours }))
        .sort((a, b) => b.total - a.total).slice(0, 8),
      spark_presence: grouperSomme(
        (s.hrPointage || []).filter((p: any) => p && dateSeule(p.date) >= ilYA7Jours
          && (p.statut === 'PRESENT' || p.statut === 'RETARD') && idsActifs.has(String(p.worker_id))),
        (p) => dateSeule(p.date), () => 1,
      ).map(({ date, total }) => ({ date, value: total })),
      spark_ofs: grouperSomme(
        planning.filter((e: any) => dateSeule(e.dateLancement) >= ilYA7Jours),
        (e) => dateSeule(e.dateLancement), () => 1,
      ).map(({ date, total }) => ({ date, value: total })),
      calendar_prod_days: [...new Set(
        (s.suivis || [])
          .filter((x: any) => x && dateSeule(x.date) >= debutDuMois)
          .map((x: any) => parseInt(dateSeule(x.date).slice(8, 10), 10)),
      )].filter((n) => Number.isFinite(n)),
    },
  };
};
