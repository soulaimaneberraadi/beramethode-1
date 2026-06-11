import React, { useState, useEffect } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number | string;
    /** Reçoit la valeur numérique (clampée à `min`) — pour les setters simples. */
    onValueChange?: (n: number) => void;
    /** Passe l'évènement natif (e.target.name / e.target.value) — pour les handlers par nom. */
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    min?: number;
};

/**
 * Input numérique sans « 0 collant » : affiché vide quand la valeur vaut 0
 * (placeholder au lieu d'un 0 forcé devant la saisie) et géré en texte pour
 * pouvoir être effacé librement. La valeur remonte via `onChange` (évènement
 * natif, pour les handlers par `name`) et/ou `onValueChange` (nombre clampé).
 */
const NumberInput: React.FC<Props> = ({ value, onValueChange, onChange, min = 0, ...rest }) => {
    const toStr = (v: number | string) => (v === 0 || v === '0' || v === '' || v == null ? '' : String(v));
    const [str, setStr] = useState<string>(toStr(value));

    // Resync si la valeur change depuis l'extérieur (et diffère de la saisie en cours).
    useEffect(() => {
        const parsed = parseFloat(str);
        const cur = isNaN(parsed) ? 0 : parsed;
        if (cur !== Number(value)) setStr(toStr(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <input
            type="number"
            min={min}
            value={str}
            onChange={(e) => {
                setStr(e.target.value);
                if (onChange) onChange(e);
                if (onValueChange) {
                    const n = parseFloat(e.target.value);
                    onValueChange(isNaN(n) ? min : Math.max(min, n));
                }
            }}
            {...rest}
        />
    );
};

export default NumberInput;
