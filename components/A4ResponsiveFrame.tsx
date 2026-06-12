import React, { useEffect, useRef, useState } from 'react';

/**
 * Affiche une fiche conçue pour une largeur fixe A4 (794px ≈ 21cm) et la met à
 * l'échelle pour REMPLIR exactement la largeur disponible, sans la déformer.
 *
 * - Grand écran : si la place ≥ 794px → échelle 1 (taille réelle).
 * - Mobile : réduit proportionnellement (le design reste identique au PDF, ni
 *   étiré ni allongé — juste plus petit).
 *
 * Implémentation déterministe : un cadre de dimensions « mises à l'échelle »
 * réserve la place exacte, et la fiche (origine haut-gauche) le remplit. Aucun
 * débordement, aucun espace vide.
 */
const A4_WIDTH = 794;   // 21cm @ 96dpi
const A4_HEIGHT = 1123; // 29.7cm @ 96dpi — feuille A4 entière

const A4ResponsiveFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [innerHeight, setInnerHeight] = useState(0);

    useEffect(() => {
        const measure = () => {
            const outer = outerRef.current;
            const inner = innerRef.current;
            if (!outer || !inner) return;
            const avail = outer.getBoundingClientRect().width;
            if (avail > 0) setScale(Math.min(1, avail / A4_WIDTH));
            // Hauteur réelle (non mise à l'échelle) de la fiche.
            setInnerHeight(inner.offsetHeight);
        };
        measure();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        if (ro && outerRef.current) ro.observe(outerRef.current);
        if (ro && innerRef.current) ro.observe(innerRef.current);
        window.addEventListener('resize', measure);
        return () => {
            if (ro) ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    return (
        <div ref={outerRef} className="w-full">
            {/* Cadre qui réserve la place exacte de la fiche mise à l'échelle */}
            <div style={{ width: A4_WIDTH * scale, height: innerHeight * scale, margin: '0 auto', position: 'relative' }}>
                <div
                    ref={innerRef}
                    className="bg-white shadow-lg"
                    style={{
                        width: A4_WIDTH,
                        // Feuille A4 entière : si le contenu est court, la page reste
                        // complète (blanc en bas, comme un vrai papier A4).
                        minHeight: A4_HEIGHT,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
};

export default A4ResponsiveFrame;
