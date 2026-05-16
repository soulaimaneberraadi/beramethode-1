/** Résultat moteur H.N. / H.S. / travail (pointage) — partagé serveur / tests. */
export interface HeuresResult {
    normales: number;
    supp25: number;
    supp50: number;
    travaillees: number;
}

export function calculerHeures(
    entree: string | null,
    sortie: string | null,
    pauseDebut: string | null,
    pauseFin: string | null,
    dateStr: string,
): HeuresResult {
    if (!entree || !sortie) {
        return { normales: 0, supp25: 0, supp50: 0, travaillees: 0 };
    }

    const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h + m / 60;
    };

    let tEnt = parseTime(entree);
    let tSor = parseTime(sortie);
    if (tSor < tEnt) tSor += 24;

    const calcOverlap = (start: number, end: number, intervals: number[][]) => {
        let overlap = 0;
        for (const [iStart, iEnd] of intervals) {
            const s = Math.max(start, iStart);
            const e = Math.min(end, iEnd);
            if (e > s) overlap += e - s;
        }
        return overlap;
    };

    const nightIntervals = [
        [0, 6],
        [21, 30],
        [45, 54],
    ];
    let totalNight = calcOverlap(tEnt, tSor, nightIntervals);
    let totalTime = tSor - tEnt;

    if (pauseDebut && pauseFin) {
        let pEnt = parseTime(pauseDebut);
        let pSor = parseTime(pauseFin);
        if (pSor < pEnt) pSor += 24;

        if (pEnt < tEnt && pEnt + 24 <= tSor) {
            pEnt += 24;
            pSor += 24;
        }

        const pauseNight = calcOverlap(pEnt, pSor, nightIntervals);
        const pauseTotal = Math.max(0, pSor - pEnt);

        totalNight = Math.max(0, totalNight - pauseNight);
        totalTime = Math.max(0, totalTime - pauseTotal);
    }

    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    let normales = 0;
    let supp25 = 0;
    let supp50 = 0;

    if (isWeekend) {
        supp50 = totalTime;
    } else {
        const actualNight = totalNight;
        const actualDay = Math.max(0, totalTime - actualNight);

        supp50 += actualNight;

        let remaining = actualDay;

        normales = Math.min(8, remaining);
        remaining -= normales;

        const possible25 = Math.min(2, remaining);
        supp25 += possible25;
        remaining -= possible25;

        supp50 += remaining;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
        normales: round2(normales),
        supp25: round2(supp25),
        supp50: round2(supp50),
        travaillees: round2(totalTime),
    };
}
