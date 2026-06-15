import type { Machine } from '../types';

export type MachineQrPayloadOptions = {
  /** Raison sociale / site — renforçage traçabilité étiquette. */
  companyName?: string;
};

/** Payload compact pour QR (scan → identification machine dans l'atelier). */
export function buildMachineQrPayload(
  m: Pick<Machine, 'id' | 'name' | 'matricule' | 'classe'>,
  opts?: MachineQrPayloadOptions
): string {
  const cn = (opts?.companyName || '').trim();
  const payload: Record<string, string | number> = {
    v: 1,
    app: 'BERAMETHODE',
    id: m.id,
    n: (m.name || '').trim(),
    c: (m.classe || '').trim(),
    mat: (m.matricule || '').trim(),
  };
  if (cn) payload.cn = cn;
  return JSON.stringify(payload);
}

export type ParsedMachineQr = {
  id: string;
  name: string;
  matricule: string;
  classe: string;
};

/** Interprète le texte brut d’un QR étiquette (JSON BERAMETHODE). */
export function parseMachineQrFromString(raw: string): ParsedMachineQr | null {
  const s = raw.trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (String(o.app || '') !== 'BERAMETHODE') return null;
    const id = String(o.id || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(o.n || '').trim(),
      matricule: String(o.mat || '').trim(),
      classe: String(o.c || '').trim(),
    };
  } catch {
    return null;
  }
}

/** Décode un QR depuis une photo (Chrome : BarcodeDetector). */
export async function tryDecodeQrFromImageFile(file: File): Promise<string | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  type Detector = { detect: (bmp: ImageBitmap) => Promise<{ rawValue?: string }[]> };
  try {
    const BD = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new BD({ formats: ['qr_code'] });
    const bmp = await createImageBitmap(file);
    try {
      const codes = await detector.detect(bmp);
      return codes[0]?.rawValue?.trim() || null;
    } finally {
      bmp.close?.();
    }
  } catch {
    return null;
  }
}
