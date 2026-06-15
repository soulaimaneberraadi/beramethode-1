import db from './db';
import type { SageTimeRulesOptions } from '../lib/sageTimeRules';
import { getDefaultSageTimeOptions } from '../lib/sageTimeRules';

function readAppSettingString(ownerId: number, key: string): string | undefined {
    try {
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ? AND owner_id = ?').get(key, ownerId) as
            | { value: string }
            | undefined;
        if (row?.value == null) return undefined;
        const raw = String(row.value);
        try {
            return JSON.parse(raw) as string;
        } catch {
            return raw;
        }
    } catch {
        return undefined;
    }
}

/** Modes + bornes lues : `app_settings` puis variables d’environnement. */
export function getSageRulesForUser(ownerId: number): SageTimeRulesOptions {
    const d = getDefaultSageTimeOptions();
    const envR = process.env.HR_SAGE_ROUNDING;
    const envS = process.env.HR_SAGE_WORKDAY_START;
    const envOff = process.env.HR_SAGE_APPLY;
    const r = envR ?? readAppSettingString(ownerId, 'hr_sage_rounding') ?? '15';
    const ws = envS ?? readAppSettingString(ownerId, 'hr_sage_workday_start') ?? d.workdayStart;
    const apply = envOff != null ? envOff !== 'false' : readAppSettingString(ownerId, 'hr_sage_apply') !== 'false';
    const roundMinutes = Math.min(60, Math.max(1, parseInt(String(r), 10) || 15));
    const wsn = /^\d{1,2}:\d{2}/.test(String(ws)) ? String(ws).match(/^\d{1,2}:\d{2}/)![0] : d.workdayStart;
    return {
        roundMinutes,
        mode: 'nearest',
        workdayStart: wsn,
        disabled: !apply,
    };
}
