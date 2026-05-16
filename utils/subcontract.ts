export interface SubcontractSlot {
    startYmd: string;
    endYmd: string;
}

/** Fenêtre indicative sous-traitance (MVP : alignée sur la DDS). */
export function suggestSubcontractWindow(exportDdsYmd: string, _bufferDays = 0): SubcontractSlot {
    const y = exportDdsYmd.split('T')[0];
    return { startYmd: y, endYmd: y };
}
