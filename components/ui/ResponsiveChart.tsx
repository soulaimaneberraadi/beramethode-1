import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

type ResponsiveChartProps = {
  /** Le graphe Recharts (LineChart, AreaChart, PieChart, ComposedChart, ...) */
  children: React.ReactElement;
  /** Classe optionnelle pour le conteneur mesuré (par défaut : remplit le parent) */
  className?: string;
};

/**
 * Enveloppe sûre autour de Recharts <ResponsiveContainer>.
 *
 * Recharts émet l'avertissement « The width(-1) and height(-1) of chart should be
 * greater than 0 » lorsqu'un graphe est monté alors que son conteneur est masqué
 * (display:none, onglet inactif, panneau replié, modal pas encore ouverte). Dans ce
 * cas le ResizeObserver renvoie une taille négative.
 *
 * Ici on mesure d'abord le conteneur et on ne monte le graphe QUE lorsque la taille
 * est positive. L'avertissement disparaît, et le graphe s'affiche dès que son parent
 * devient visible.
 */
export const ResponsiveChart: React.FC<ResponsiveChartProps> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setReady(w > 0 && h > 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className ?? 'w-full h-full'} dark:text-dk-muted`}>
      {ready && (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default ResponsiveChart;
