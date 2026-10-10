import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import styles from './Charts.module.css';

/* Graphiques à une seule série, couleur d'accent : pas de légende, le titre de la carte nomme la série. */

export interface ColumnDatum {
  label: string;
  /** Précision sous l'étiquette (ex. délai de révision). */
  sublabel?: string;
  value: number;
}

/** Colonnes verticales : valeur au sommet, infobulle au survol et au focus. */
export function ColumnChart({ data, unit }: { data: ColumnDatum[]; unit: (n: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={styles.columns} role="list">
      {data.map((d, i) => (
        <div
          key={d.label}
          role="listitem"
          tabIndex={0}
          className={`${styles.column} ${active === i ? styles.activeColumn : ''}`}
          aria-label={`${d.label} : ${unit(d.value)}`}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
        >
          <div className={styles.plot}>
            <span className={styles.capValue}>{d.value}</span>
            <div className={styles.bar} style={{ height: `${(d.value / max) * 100}%` }} />
            {active === i && (
              <div className={styles.tooltip} role="tooltip">
                <strong>{unit(d.value)}</strong>
                <span>{d.label}</span>
              </div>
            )}
          </div>
          <span className={styles.axisLabel}>{d.label}</span>
          {d.sublabel && <span className={styles.axisSublabel}>{d.sublabel}</span>}
        </div>
      ))}
    </div>
  );
}

export interface ScorePoint {
  date: Date;
  correct: number;
  total: number;
}

const HEIGHT = 200;
const PAD = { top: 16, right: 48, bottom: 28, left: 40 };
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fullDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const percent = (p: ScorePoint) => Math.round((p.correct / p.total) * 100);

/** Largeur disponible d'un élément (le SVG est dessiné à sa taille réelle, sans déformation). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Score de chaque partie de Test (%), dans l'ordre chronologique : ligne de 2 px, points cerclés,
 * repère vertical qui suit le pointeur et s'aligne sur la partie la plus proche.
 */
export function ScoreLineChart({ points }: { points: ScorePoint[] }) {
  const [wrapperRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  // Parties réparties régulièrement : plusieurs Tests le même jour restent lisibles.
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (p: number) => PAD.top + (1 - p / 100) * innerH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(percent(p))}`).join(' ');
  const last = points.length - 1;

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const left = e.currentTarget.getBoundingClientRect().left;
    const pos = e.clientX - left;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - pos) < Math.abs(x(nearest) - pos)) nearest = i;
    setActive(nearest);
  }

  return (
    <div ref={wrapperRef} className={styles.lineWrapper}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          className={styles.line}
          role="img"
          aria-label={`Score des ${points.length} dernières parties de Test, de ${percent(points[0])} % à ${percent(points[last])} %`}
          onPointerMove={handleMove}
          onPointerLeave={() => setActive(null)}
        >
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(tick)} y2={y(tick)} className={styles.grid} />
              <text x={PAD.left - 8} y={y(tick)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                {tick} %
              </text>
            </g>
          ))}
          <text x={x(0)} y={HEIGHT - 6} className={styles.tick} textAnchor={points.length > 1 ? 'start' : 'middle'}>
            {dateFormat.format(points[0].date)}
          </text>
          {points.length > 1 && (
            <text x={x(last)} y={HEIGHT - 6} className={styles.tick} textAnchor="end">
              {dateFormat.format(points[last].date)}
            </text>
          )}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} className={styles.crosshair} />}
          <path d={path} className={styles.series} />
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(percent(p))} r={active === i ? 6 : 4} className={styles.point} />
          ))}
          {/* Valeur directe au dernier point seulement. */}
          <text x={x(last) + 10} y={y(percent(points[last]))} className={styles.endLabel} dominantBaseline="middle">
            {percent(points[last])} %
          </text>
        </svg>
      )}
      {active !== null && width > 0 && (
        <div
          className={styles.lineTooltip}
          role="tooltip"
          style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: y(percent(points[active])) - 12 }}
        >
          <strong>
            {points[active].correct} / {points[active].total} ({percent(points[active])} %)
          </strong>
          <span>{fullDateFormat.format(points[active].date)}</span>
        </div>
      )}
    </div>
  );
}
