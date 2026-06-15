/**
 * Gemini calls — server-side only (API key from process.env, never sent to the browser).
 * Includes: auto-retry on 429 + offline textile fallback when quota exhausted.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Machine, Operation } from '../types';

function getGeminiApiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY?.trim() || process.env.API_KEY?.trim();
  return k || undefined;
}

// ─── Retry wrapper ───
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status || e?.code;
      if (status === 429 && i < maxRetries) {
        const wait = Math.min(2000 * Math.pow(2, i), 30000);
        console.log(`[Gemini] 429 rate-limit, retry ${i + 1}/${maxRetries} in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries exceeded');
}

// ─── Offline Fallback Knowledge Base ───
const TEXTILE_VOCABULARY = [
  'Surpiquage', 'Rabattage', 'Rempliage', 'Assemblage', 'Coulissage',
  'Nervure', 'Passepoil', 'Ourlet', 'Bâtissage', 'Fronçage',
  'Crantage', 'Thermocollage', 'Repassage', 'Empilement', 'Patronage',
  'Gradation', 'Matelassage', 'Découpage', 'Entoilage', 'Boutonnière',
  'Surfilage', 'Piqûre', 'Parementure', 'Doublure', 'Encolure',
  'Empiècement', 'Poignet', 'Ceinture', 'Braguette', 'Passant',
  'Gousset', 'Poche', 'Renfort', 'Biais', 'Élastique',
  'Fermeture', 'Rivet', 'Pressionage', 'Étiquetage', 'Emballage',
];

function fallbackAnalyze(operations: Operation[], userPrompt: string): string {
  const nbOps = operations.length;
  const promptLower = userPrompt.toLowerCase();

  if (nbOps === 0) {
    return `🤖 **Assistant Méthode (Mode hors-ligne)**\n\n` +
      `Votre gamme est vide pour le moment. Voici comment commencer :\n\n` +
      `1. **Identifiez l'article** — Quel type de vêtement ? (T-shirt, pantalon, chemise...)\n` +
      `2. **Listez les composants** — Devant, dos, manches, col, poignets, etc.\n` +
      `3. **Créez les opérations de préparation** — Thermocollage, surfilage des bords\n` +
      `4. **Opérations d'assemblage** — Épaules, côtés, manches\n` +
      `5. **Finitions** — Ourlets, boutonnières, repassage, contrôle qualité\n\n` +
      `💡 *L'IA Gemini est temporairement indisponible (quota API). Les suggestions avancées seront disponibles dès que le quota se réinitialise.*`;
  }

  const totalTime = operations.reduce((s, op) => s + (op.time || 0), 0);
  const machines = [...new Set(operations.map((op) => op.machineName || 'MAN'))];
  const avgTime = nbOps > 0 ? totalTime / nbOps : 0;

  // Detect what user is asking
  if (promptLower.includes('analyse') || promptLower.includes('analyser') || promptLower.includes('résumé')) {
    return `🤖 **Analyse de votre gamme (Mode hors-ligne)**\n\n` +
      `📊 **Résumé :**\n` +
      `- **${nbOps}** opérations au total\n` +
      `- **Temps total :** ${totalTime.toFixed(2)} min\n` +
      `- **Temps moyen/opération :** ${avgTime.toFixed(2)} min\n` +
      `- **Machines utilisées :** ${machines.join(', ')}\n\n` +
      `📋 **Observations :**\n` +
      (avgTime > 2 ? `- ⚠️ Temps moyen élevé (${avgTime.toFixed(2)} min). Vérifiez les opérations longues.\n` : '') +
      (machines.length === 1 ? `- ⚠️ Une seule machine utilisée. Vérifiez si d'autres machines pourraient optimiser.\n` : '') +
      `- Vérifiez l'équilibrage entre postes pour optimiser le flux.\n\n` +
      `💡 *Mode hors-ligne — quota Gemini temporairement épuisé.*`;
  }

  if (promptLower.includes('équilibr') || promptLower.includes('equilibr') || promptLower.includes('balance')) {
    const machineGroups: Record<string, number> = {};
    operations.forEach((op) => {
      const m = op.machineName || 'MAN';
      machineGroups[m] = (machineGroups[m] || 0) + (op.time || 0);
    });
    let balanceText = '';
    for (const [m, t] of Object.entries(machineGroups)) {
      balanceText += `- **${m}** : ${t.toFixed(2)} min (${((t / totalTime) * 100).toFixed(1)}%)\n`;
    }
    return `🤖 **Équilibrage (Mode hors-ligne)**\n\n` +
      `⏱️ **Temps total :** ${totalTime.toFixed(2)} min\n\n` +
      `📊 **Répartition par machine :**\n${balanceText}\n` +
      `💡 Pour un bon équilibrage, chaque poste devrait être ≤ takt time.\n\n` +
      `*Mode hors-ligne — quota Gemini temporairement épuisé.*`;
  }

  // Generic response
  return `🤖 **Assistant Méthode (Mode hors-ligne)**\n\n` +
    `Votre gamme contient **${nbOps} opérations** pour un temps total de **${totalTime.toFixed(2)} min**.\n` +
    `Machines : ${machines.join(', ')}\n\n` +
    `Votre question : "${userPrompt}"\n\n` +
    `Je suis en mode hors-ligne (quota Gemini épuisé). Je peux vous aider avec :\n` +
    `- Tapez **"analyse"** pour un résumé de votre gamme\n` +
    `- Tapez **"équilibrage"** pour la répartition par machine\n\n` +
    `💡 *L'IA complète sera disponible dès la réinitialisation du quota API.*`;
}

function fallbackVocabulary(contextText: string, existing: string[], limit: number): string[] {
  const existingLower = new Set(existing.map((v) => (v || '').toLowerCase()));
  return TEXTILE_VOCABULARY
    .filter((w) => !existingLower.has(w.toLowerCase()))
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);
}

function fallbackGenerateOperations(description: string, machines: Machine[]) {
  const descLower = description.toLowerCase();
  const activeMachines = machines.filter((m) => m.active);
  const piqueuse = activeMachines.find((m) => /piqu|301|lockstitch/i.test(m.name)) || { name: 'Piqueuse plate' };
  const surjeteuse = activeMachines.find((m) => /surjet|504|overlock/i.test(m.name)) || { name: 'Surjeteuse' };
  const recouvreuse = activeMachines.find((m) => /recouvr|flatlock|600/i.test(m.name)) || { name: 'Recouvreuse' };

  // Basic T-shirt template as default
  const ops = [
    { order: 1, description: 'Préparation — Thermocollage encolure', machineName: 'Presse', length: 30, stitchCount: 0, manualTime: 15 },
    { order: 2, description: 'Surfilage bords devant + dos', machineName: surjeteuse.name, length: 120, stitchCount: 4, manualTime: 10 },
    { order: 3, description: 'Assemblage épaules', machineName: surjeteuse.name, length: 24, stitchCount: 4, manualTime: 8 },
    { order: 4, description: 'Pose col / encolure', machineName: recouvreuse.name, length: 42, stitchCount: 5, manualTime: 12 },
    { order: 5, description: 'Montage manches', machineName: surjeteuse.name, length: 80, stitchCount: 4, manualTime: 10 },
    { order: 6, description: 'Fermeture côtés', machineName: surjeteuse.name, length: 90, stitchCount: 4, manualTime: 8 },
    { order: 7, description: 'Ourlet bas', machineName: recouvreuse.name, length: 90, stitchCount: 5, manualTime: 10 },
    { order: 8, description: 'Ourlet manches', machineName: recouvreuse.name, length: 56, stitchCount: 5, manualTime: 10 },
    { order: 9, description: 'Pose étiquette', machineName: piqueuse.name, length: 6, stitchCount: 4, manualTime: 8 },
    { order: 10, description: 'Contrôle qualité + repassage', machineName: 'Manuel', length: 0, stitchCount: 0, manualTime: 30 },
  ];
  return ops;
}

// ─── Schema ───
const operationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      order: { type: Type.NUMBER, description: 'Numéro de séquence logique' },
      description: { type: Type.STRING, description: 'Description technique précise' },
      machineName: { type: Type.STRING, description: 'Nom exact de la machine' },
      length: { type: Type.NUMBER, description: 'Longueur de la couture en CM' },
      stitchCount: { type: Type.NUMBER, description: 'Densité de points (pts/cm)' },
      manualTime: { type: Type.NUMBER, description: 'Temps de manipulation manuel (en cmin)' },
    },
    required: ['order', 'description', 'machineName', 'length', 'stitchCount', 'manualTime'],
  },
};

// ─── Exported Functions (Gemini with fallback) ───

export async function analyzeTextileContextServer(
  currentOperations: Operation[],
  availableMachines: Machine[],
  userPrompt: string
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallbackAnalyze(currentOperations, userPrompt);

  try {
    return await withRetry(async () => {
      const client = new GoogleGenAI({ apiKey });
      const operationsText =
        currentOperations.length > 0
          ? currentOperations
              .map((op) => `${op.order}. ${op.description} [${op.machineName || 'MAN'}] (${op.time.toFixed(2)} min)`)
              .join('\n')
          : 'Aucune opération saisie pour le moment.';

      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Tu es un Expert Méthode Textile (GSD).
      
      CONTEXTE - L'UTILISATEUR A SAISI CETTE GAMME MANUELLEMENT :
      ${operationsText}
      
      TA MISSION :
      1. "Lire" et "Comprendre" la gamme ci-dessus.
      2. Répondre à la demande de l'utilisateur : "${userPrompt}".
      3. Si l'utilisateur demande une analyse, identifie le type de vêtement, critique l'équilibrage ou suggère des améliorations.
      4. Si la gamme est vide, propose de l'aide pour commencer.

      Ton ton doit être professionnel, encourageant et technique. Tu es l'assistant, pas le créateur.`,
        config: { temperature: 0.3 },
      });

      const text = response.text;
      if (!text) throw new Error('Réponse vide de l\'IA');
      return text;
    });
  } catch (e: any) {
    console.warn('[Gemini] analyzeTextile fallback:', e?.status || e?.message);
    return fallbackAnalyze(currentOperations, userPrompt);
  }
}

export async function suggestTextileVocabularyServer(
  contextText: string,
  existingVocabulary: string[] = [],
  limit: number = 10
): Promise<string[]> {
  const apiKey = getGeminiApiKey();
  const safeLimit = Math.max(3, Math.min(20, Math.floor(limit)));
  if (!apiKey) return fallbackVocabulary(contextText, existingVocabulary, safeLimit);

  try {
    return await withRetry(async () => {
      const client = new GoogleGenAI({ apiKey });
      const existingSample = existingVocabulary.filter(Boolean).slice(0, 120).join(', ');

      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Tu es expert methode textile.
Propose ${safeLimit} mots techniques utiles pour une gamme de confection textile.
Contraines:
- Reponse en FR, termes courts, pratiques atelier.
- IMPORTANT: un seul mot par element (pas d'expression, pas de phrase, pas d'espace).
- Eviter les doublons exacts.
- Eviter les termes deja presents si possible.
- Retourne UNIQUEMENT un JSON array de strings.

Contexte saisie utilisateur:
${contextText}

Vocabulaire existant (a eviter):
${existingSample || 'Aucun'}`,
        config: {
          temperature: 0.25,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      });

      const text = response.text;
      if (!text) return [];
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];

      const seen = new Set<string>();
      const existingLower = new Set(existingVocabulary.map((v) => (v || '').toLowerCase()));

      return parsed
        .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v: string) => v.length >= 4)
        .filter((v: string) => !/\s/.test(v))
        .filter((v: string) => /^[A-Za-zÀ-ÿ0-9'-]+$/.test(v))
        .filter((v: string) => {
          const key = v.toLowerCase();
          if (seen.has(key) || existingLower.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, safeLimit);
    });
  } catch (e: any) {
    console.warn('[Gemini] suggestVocabulary fallback:', e?.status || e?.message);
    return fallbackVocabulary(contextText, existingVocabulary, safeLimit);
  }
}

/** Legacy / optional — kept for API completeness */
export async function generateTextileOperationsServer(articleDescription: string, availableMachines: Machine[]) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallbackGenerateOperations(articleDescription, availableMachines);

  try {
    return await withRetry(async () => {
      const client = new GoogleGenAI({ apiKey });
      const machinesContext = availableMachines
        .filter((m) => m.active)
        .map((m) => `- ${m.name} (Code: ${m.classe}, Vitesse: ${m.speed} tr/min)`)
        .join('\n');

      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Rôle : Expert Méthode & Industrialisation Textile (GSD).
      CONTEXTE MACHINES : ${machinesContext}
      MISSION : Générer la Gamme de Montage pour : "${articleDescription}".
      Retourne le JSON strict.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: operationSchema,
          temperature: 0.1,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Réponse vide de l\'IA');
      return JSON.parse(text);
    });
  } catch (e: any) {
    console.warn('[Gemini] generateOperations fallback:', e?.status || e?.message);
    return fallbackGenerateOperations(articleDescription, availableMachines);
  }
}

function fallbackOptimizePlanning(events: any[], machines: any[], settings: any): any {
  const suggestions: any[] = [];
  const actions: any[] = [];
  let analysis = "🤖 **Analyse de planification (Mode hors-ligne / Quota épuisé)**\n\n";

  const brokenMachines = machines.filter(m => m.status === 'PANNE' || m.active === false);
  const activeEvents = events.filter(e => e.status !== 'DONE' && e.status !== 'COMPLETED');

  if (brokenMachines.length > 0) {
    analysis += `⚠️ **Alerte Machines :** ${brokenMachines.length} machine(s) indisponible(s) (PANNE / INACTIVE) :\n`;
    brokenMachines.forEach(m => {
      analysis += `- Machine **${m.name}** (Classe: ${m.classe}) sur la chaîne **${m.chainId || 'Non spécifiée'}**\n`;
    });
    analysis += `\n`;
  }

  for (const ev of activeEvents) {
    const chainId = ev.chaineId || ev.chainId;
    const modelName = ev.modelName || ev.modelId;
    
    const hasBrokenMachine = brokenMachines.some(m => m.chainId === chainId);
    if (hasBrokenMachine) {
      const alternativeChains = ['CHAINE 1', 'CHAINE 2', 'CHAINE 3'].filter(c => c !== chainId);
      const targetChain = alternativeChains[0] || 'CHAINE 2';
      
      suggestions.push({
        eventId: ev.id,
        modelName,
        chaineId: chainId,
        message: `L'OF **${modelName}** (${ev.clientName || 'Client'}) est planifié sur la chaîne **${chainId}** qui a des machines en panne. Il est recommandé de le déplacer sur la chaîne **${targetChain}**.`,
        type: 'MOVE_EVENT'
      });

      actions.push({
        type: 'MOVE_EVENT',
        eventId: ev.id,
        targetChainId: targetChain
      });
    }
  }

  for (const ev of activeEvents) {
    if (ev.estimatedEndDate && ev.dateExport && ev.estimatedEndDate > ev.dateExport) {
      suggestions.push({
        eventId: ev.id,
        modelName: ev.modelName || ev.modelId,
        chaineId: ev.chaineId || ev.chainId,
        message: `L'OF **${ev.modelName || ev.modelId}** dépasse la date limite de livraison client (${ev.dateExport}). Il est recommandé d'allouer plus de capacité ou de le diviser.`,
        type: 'SPLIT_EVENT'
      });
    }
  }

  if (suggestions.length === 0) {
    analysis += "✅ **Aucun conflit majeur détecté.** Le planning actuel semble équilibré en termes de capacité machine et de délais de livraison.\n";
  } else {
    analysis += `💡 **Recommandations d'optimisation :**\n`;
    suggestions.forEach((s, idx) => {
      analysis += `${idx + 1}. ${s.message}\n`;
    });
  }

  return {
    analysis,
    suggestions,
    actions
  };
}

export async function optimizePlanningServer(
  events: any[],
  machines: any[],
  settings: any
): Promise<any> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallbackOptimizePlanning(events, machines, settings);

  try {
    return await withRetry(async () => {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Tu es un expert en planification industrielle dans une usine de confection textile (ERP BERAMETHODE).
        
        DONNÉES DU PLANNING ACTUEL :
        - Événements / Ordres de Fabrication (OFs) planifiés :
        ${JSON.stringify(events.map(e => ({
          id: e.id,
          modelName: e.modelName || e.modelId,
          clientName: e.clientName,
          chaineId: e.chaineId || e.chainId,
          startDate: e.startDate || e.dateLancement,
          endDate: e.estimatedEndDate || e.dateExport,
          deadline: e.dateExport,
          quantity: e.qteTotal || e.totalQuantity,
          status: e.status
        })))}
        
        - Liste des Machines et leur statut :
        ${JSON.stringify(machines.map(m => ({
          name: m.name,
          classe: m.classe,
          status: m.status,
          chainId: m.chainId,
          downtimeStart: m.downtimeStartYmd,
          downtimeEnd: m.downtimeEndYmd
        })))}
        
        TA MISSION :
        1. Analyser le planning actuel pour détecter des goulots d'étranglement :
           - Des retards : lorsque la date de fin estimée (endDate) dépasse la date limite demandée par le client (deadline).
           - Des pannes : lorsqu'un OF est planifié sur une chaîne (chaineId) pendant une période de panne ou maintenance d'une machine requise sur cette chaîne.
           - Surcharge de chaîne : lorsqu'une chaîne a trop d'événements superposés.
        2. Proposer un plan d'optimisation intelligent pour rééquilibrer le planning :
           - Déplacer un événement vers une autre chaîne compatible et moins chargée.
           - Modifier les dates de début si nécessaire.
           - Suggérer de diviser (split) un grand lot si cela peut accélérer le processus.
        3. Rédiger un court texte d'analyse générale en français.
        4. Fournir une liste d'actions structurées à appliquer.
        
        Format de retour : Tu dois retourner STRICTEMENT un objet JSON avec la structure spécifiée dans le schéma.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING, description: 'General optimization report in French' },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    eventId: { type: Type.STRING },
                    modelName: { type: Type.STRING },
                    chaineId: { type: Type.STRING },
                    message: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['MOVE_EVENT', 'SPLIT_EVENT'] },
                  },
                  required: ['eventId', 'modelName', 'chaineId', 'message', 'type'],
                },
              },
              actions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['MOVE_EVENT'] },
                    eventId: { type: Type.STRING },
                    targetChainId: { type: Type.STRING },
                    targetStartDate: { type: Type.STRING },
                    targetEndDate: { type: Type.STRING },
                  },
                  required: ['type', 'eventId', 'targetChainId'],
                },
              },
            },
            required: ['analysis', 'suggestions', 'actions'],
          },
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Réponse vide de l\'IA');
      return JSON.parse(text);
    });
  } catch (e: any) {
    console.warn('[Gemini] optimizePlanning fallback:', e?.status || e?.message);
    return fallbackOptimizePlanning(events, machines, settings);
  }
}

