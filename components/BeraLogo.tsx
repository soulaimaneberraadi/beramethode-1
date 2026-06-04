import React from 'react';

interface BeraLogoProps {
    className?: string;
    /** opacité du trait diagonal « méthode » */
    accentOpacity?: number;
}

/**
 * Monogramme BERAMETHODE dessiné en SVG (aucune image externe).
 * Le « B » est tracé en currentColor + une diagonale « méthode/fil »
 * en rappel de l'identité industrielle. Utilise text-white (ou autre)
 * sur le parent pour colorer le monogramme.
 */
const BeraLogo: React.FC<BeraLogoProps> = ({ className = 'w-9 h-9', accentOpacity = 0.4 }) => (
    <svg
        viewBox="0 0 40 40"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="BERAMETHODE"
    >
        {/* Trait diagonal « méthode » (fil / précision) */}
        <path
            d="M29 6 L17 34"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={accentOpacity}
        />
        {/* Monogramme « B » */}
        <g
            stroke="currentColor"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        >
            {/* Colonne verticale */}
            <path d="M13 8 V34" />
            {/* Boucle supérieure */}
            <path d="M13 8 H22 a6.5 6.5 0 0 1 0 13 H13" />
            {/* Boucle inférieure */}
            <path d="M13 21 H24 a6.5 6.5 0 0 1 0 13 H13" />
        </g>
    </svg>
);

export default BeraLogo;
