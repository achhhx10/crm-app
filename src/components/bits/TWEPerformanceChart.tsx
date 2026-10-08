import React, { useEffect, useRef, useState } from 'react';
import type { PerformanceData } from '../../types';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function readVar(name: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const match = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) return `hsl(${raw})`;
  const [r, g, b] = hslToRgb(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  return alpha === undefined
    ? `rgba(${r}, ${g}, ${b}, 1)`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TWEPerformanceChart({ data }: { data: PerformanceData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let chartInstance: { dispose: () => void } | null = null;

    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const dark = theme === 'dark';
    const seriesColor = readVar(dark ? '--accent' : '--primary');
    const highlightColor = readVar(dark ? '--success' : '--accent');
    const tickColor = readVar('--muted-foreground');
    const gridColor = readVar('--muted-foreground', 0.18);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      const { default: TWEChart } = await import(
        'tw-elements/dist/src/js/data/chart/charts.js'
      );
      if (disposed || !canvasRef.current || !canvasRef.current.isConnected) return;

      chartInstance = new TWEChart(
        canvasRef.current,
        {
          type: 'bar',
          data: {
            labels: data.map((d) => d.name),
            datasets: [
              {
                label: 'Appels',
                data: data.map((d) => d.totalCalls),
                backgroundColor: seriesColor,
                borderRadius: 4,
                barPercentage: 0.55,
                categoryPercentage: 0.8,
              },
              {
                label: 'RDV obtenus',
                data: data.map((d) => d.rdvObtained),
                backgroundColor: highlightColor,
                borderRadius: 4,
                barPercentage: 0.55,
                categoryPercentage: 0.8,
              },
            ],
          },
        },
        {
          indexAxis: 'y',
          maintainAspectRatio: false,
          responsive: true,
          animation: { duration: reduce ? 0 : 900 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: readVar('--card'),
              borderColor: readVar('--border'),
              borderWidth: 1,
              titleColor: readVar('--foreground'),
              bodyColor: readVar('--foreground'),
              padding: 10,
              cornerRadius: 6,
              displayColors: false,
              callbacks: {
                label: (context: { dataset?: { label?: string }; formattedValue: string }) =>
                  `${context.dataset?.label}: ${context.formattedValue}`,
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: true, color: gridColor, borderDash: [2, 4] },
              border: { display: false },
              ticks: { color: tickColor, font: { family: "'Inter', sans-serif", size: 11 } },
            },
            y: {
              stacked: true,
              grid: { display: false },
              border: { display: false },
              ticks: { color: tickColor, font: { family: "'Inter', sans-serif", size: 11 } },
            },
          },
        }
      );
    })();

    return () => {
      disposed = true;
      if (chartInstance) chartInstance.dispose();
    };
  }, [data, theme]);

  return (
    <div className="relative h-64">
      <canvas
        ref={canvasRef}
        data-te-dark-ticks-color={readVar('--muted-foreground')}
        data-te-dark-grid-lines-color={readVar('--muted-foreground', 0.18)}
        data-te-dark-label-color={readVar('--foreground')}
      />
    </div>
  );
}