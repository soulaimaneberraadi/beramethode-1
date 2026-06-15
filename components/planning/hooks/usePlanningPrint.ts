import { useCallback } from 'react';

/** Imprime la vue Gantt courante via la boîte de dialogue navigateur (Ctrl+P → PDF). */
export function usePlanningPrint() {
    return useCallback(() => {
        const original = document.title;
        const now = new Date();
        document.title = `Planning ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
        const style = document.createElement('style');
        style.id = '__planning_print_style__';
        style.textContent = `
            @media print {
                @page { size: A3 landscape; margin: 12mm; }
                body { background: white !important; }
                .no-print, header > *:first-child + * { display: none !important; }
                aside { display: none !important; }
            }
        `;
        document.head.appendChild(style);
        window.print();
        setTimeout(() => {
            document.head.removeChild(style);
            document.title = original;
        }, 500);
    }, []);
}
