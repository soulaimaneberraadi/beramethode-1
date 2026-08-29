import { Request, Response } from 'express';

let lastText = '';
let lastAt = 0;

export const customerDisplaySend = (req: Request, res: Response) => {
  const text = String(req.body?.text ?? '').slice(0, 80);
  const total = Number(req.body?.total) || 0;
  const currency = String(req.body?.currency ?? 'MAD').slice(0, 10);
  if (!text && total === 0) {
    return res.status(400).json({ message: 'Texte vide.' });
  }
  lastText = text || `TOTAL ${total.toFixed(2)} ${currency}`;
  lastAt = Date.now();
  res.json({ message: 'Affichage mis à jour.', text: lastText });
};

export const customerDisplayPoll = (req: Request, res: Response) => {
  res.json({ text: lastText, at: lastAt });
};
