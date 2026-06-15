import React from 'react';
import { PLANNING_ANIMATIONS_CSS } from './animations';

/** Injecte les keyframes CSS du module Planning une seule fois. */
export default function PlanningAnimations() {
    return <style>{PLANNING_ANIMATIONS_CSS}</style>;
}
