import type { AppSettings } from '../types';

/**
 * Source unique pour l’état initial des réglages globaux (voir `DEFAULT_SETTINGS` dans App.tsx)
 * et pour les secours `DateTimePicker` quand `settings` n’est pas fourni (Magasin, Effectifs, …).
 */
export const DEFAULT_CALENDAR_APP_SETTINGS: AppSettings = {
  costMinute: 0.85,
  useCostMinute: true,
  cutRate: 12,
  packRate: 8,
  marginAtelier: 17.5,
  tva: 20,
  marginBoutique: 30,
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
  timeFormat: '24h',
  pauses: [{ id: '1', name: 'Pause Déjeuner', start: '12:00', end: '13:00', durationMin: 60 }],
  workingDays: [1, 2, 3, 4, 5],
  currency: 'MAD',
  chainsCount: 4,
  organigram: [],
  chainStaff: {},
  calendarExceptions: {},
  companyProfile: { companyName: '', legalName: '' },
  tasks: [],
  chainCapacityPerDay: {},
  chainMachines: {},
};
