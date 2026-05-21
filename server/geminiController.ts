import { Request, Response } from 'express';
import {
  analyzeTextileContextServer,
  suggestTextileVocabularyServer,
  generateTextileOperationsServer,
  optimizePlanningServer,
} from './geminiAi';

export const postAnalyzeTextile = async (req: Request, res: Response) => {
  try {
    const { currentOperations, availableMachines, userPrompt } = req.body;
    if (typeof userPrompt !== 'string') {
      return res.status(400).json({ message: 'userPrompt requis' });
    }
    const text = await analyzeTextileContextServer(
      Array.isArray(currentOperations) ? currentOperations : [],
      Array.isArray(availableMachines) ? availableMachines : [],
      userPrompt
    );
    res.json({ text });
  } catch (e: any) {
    console.error('postAnalyzeTextile:', e);
    res.status(500).json({ message: e?.message || 'Erreur IA' });
  }
};

export const postSuggestVocabulary = async (req: Request, res: Response) => {
  try {
    const { contextText, existingVocabulary, limit } = req.body;
    if (typeof contextText !== 'string') {
      return res.status(400).json({ message: 'contextText requis' });
    }
    const words = await suggestTextileVocabularyServer(
      contextText,
      Array.isArray(existingVocabulary) ? existingVocabulary : [],
      typeof limit === 'number' ? limit : 10
    );
    res.json({ words });
  } catch (e: any) {
    console.error('postSuggestVocabulary:', e);
    res.status(500).json({ message: e?.message || 'Erreur IA' });
  }
};

export const postGenerateOperations = async (req: Request, res: Response) => {
  try {
    const { articleDescription, availableMachines } = req.body;
    if (typeof articleDescription !== 'string') {
      return res.status(400).json({ message: 'articleDescription requis' });
    }
    const data = await generateTextileOperationsServer(
      articleDescription,
      Array.isArray(availableMachines) ? availableMachines : []
    );
    res.json(data);
  } catch (e: any) {
    console.error('postGenerateOperations:', e);
    res.status(500).json({ message: e?.message || 'Erreur IA' });
  }
};

export const postOptimizePlanning = async (req: Request, res: Response) => {
  try {
    const { events, machines, settings } = req.body;
    const result = await optimizePlanningServer(
      Array.isArray(events) ? events : [],
      Array.isArray(machines) ? machines : [],
      settings || {}
    );
    res.json(result);
  } catch (e: any) {
    console.error('postOptimizePlanning error:', e);
    res.status(500).json({ message: e?.message || 'Erreur IA lors de l\'optimisation' });
  }
};
