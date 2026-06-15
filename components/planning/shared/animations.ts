/** Animations CSS centralisées — injectées une seule fois via <PlanningAnimations />. */
export const PLANNING_ANIMATIONS_CSS = `
@keyframes planning-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}
@keyframes planning-fade-up {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes planning-slide-in-right {
    from { transform: translateX(16px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes planning-slide-in-up {
    from { transform: translateY(100%); opacity: 0.6; }
    to { transform: translateY(0); opacity: 1; }
}
@keyframes planning-scale-in {
    from { opacity: 0; transform: scale(0.97) translateY(2px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes planning-pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(33, 73, 193, 0.35); }
    100% { box-shadow: 0 0 0 8px rgba(33, 73, 193, 0); }
}

/* Apparition séquentielle des barres OF — stagger via animation-delay */
.planning-event-bar {
    animation: planning-fade-up 200ms cubic-bezier(0.4, 0, 0.2, 1) backwards;
}
.planning-row {
    animation: planning-fade-in 240ms ease-out backwards;
}

/* Hover preview sur cellule timeline vide */
.planning-cell-hover::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 6px;
    border: 1.5px dashed rgba(15, 23, 42, 0.18);
    pointer-events: none;
    animation: planning-fade-in 120ms ease-out;
}
`;
