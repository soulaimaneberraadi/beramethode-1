/**
 * Client-side AI helpers — calls go through the server; no API key in the browser bundle.
 */
import type { Machine, Operation } from '../types';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { message?: string };
      if (err?.message) msg = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function analyzeTextileContext(
  currentOperations: Operation[],
  availableMachines: Machine[],
  userPrompt: string
): Promise<string> {
  const data = await postJson<{ text: string }>('/api/ai/analyze-textile', {
    currentOperations,
    availableMachines,
    userPrompt,
  });
  return data.text;
}

export async function generateTextileOperations(articleDescription: string, availableMachines: Machine[]) {
  return postJson<unknown>('/api/ai/generate-operations', {
    articleDescription,
    availableMachines,
  });
}

export async function suggestTextileVocabulary(
  contextText: string,
  existingVocabulary: string[] = [],
  limit: number = 10
): Promise<string[]> {
  const data = await postJson<{ words: string[] }>('/api/ai/suggest-vocabulary', {
    contextText,
    existingVocabulary,
    limit,
  });
  return Array.isArray(data.words) ? data.words : [];
}
