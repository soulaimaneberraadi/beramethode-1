import { GoogleGenAI, Type } from "@google/genai";
import { Machine, Operation } from "../types";

// Schema strict pour la Gamme de Montage (Legacy - pour référence si besoin)
const operationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      order: { type: Type.NUMBER, description: "Numéro de séquence logique" },
      description: { type: Type.STRING, description: "Description technique précise (ex: Assemblage côté 4 fils)" },
      machineName: { type: Type.STRING, description: "Nom exact de la machine tiré de la base de données fournie" },
      length: { type: Type.NUMBER, description: "Longueur de la couture en CM. INDISPENSABLE pour les machines. Mettre 0 si opération manuelle." },
      stitchCount: { type: Type.NUMBER, description: "Densité de points (pts/cm)" },
      manualTime: { type: Type.NUMBER, description: "Temps de manipulation manuel (en cmin). Si machine: temps de prise/pose. Si manuel: temps total." },
    },
    required: ["order", "description", "machineName", "length", "stitchCount", "manualTime"],
  },
};

/**
 * Nouvelle fonction : L'IA lit la gamme faite par l'utilisateur pour "apprendre" et conseiller.
 */
export async function analyzeTextileContext(
  currentOperations: Operation[], 
  availableMachines: Machine[],
  userPrompt: string
) {
  try {
    const client = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 1. Contextualiser les données actuelles
    const machinesList = availableMachines.map(m => m.name).join(', ');
    const operationsText = currentOperations.length > 0 
      ? currentOperations.map(op => `${op.order}. ${op.description} [${op.machineName || 'MAN'}] (${op.time.toFixed(2)} min)`).join('\n')
      : "Aucune opération saisie pour le moment.";

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
      config: {
        temperature: 0.3,
      },
    });

    return response.text;

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Erreur IA : " + (error.message || "Service indisponible"));
  }
}

export async function generateTextileOperations(articleDescription: string, availableMachines: Machine[]) {
  // Legacy function kept for fallback if needed, but currently replaced by manual entry + analysis
  try {
    const client = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const machinesContext = availableMachines
      .filter(m => m.active)
      .map(m => `- ${m.name} (Code: ${m.classe}, Vitesse: ${m.speed} tr/min)`)
      .join('\n');

    const response = await client.models.generateContent({
      model: 'gemini-3.0-flash', 
      contents: `Rôle : Expert Méthode & Industrialisation Textile (GSD).
      CONTEXTE MACHINES : ${machinesContext}
      MISSION : Générer la Gamme de Montage pour : "${articleDescription}".
      Retourne le JSON strict.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: operationSchema,
        temperature: 0.1, 
      },
    });

    const text = response.text;
    if (!text) throw new Error("Réponse vide de l'IA");

    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Method Error:", error);
    throw new Error("Erreur IA : " + (error.message || "Service indisponible"));
  }
}