import React, { useMemo, useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import type { RekenOutput } from '../types';

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => setIsDark(
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark') ||
      mq.matches
    );
    mq.addEventListener('change', handler);
    const observer = new MutationObserver(handler);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq.removeEventListener('change', handler);
      observer.disconnect();
    };
  }, []);

  return isDark;
}

interface Props {
  data: RekenOutput | null;
}

export const VerdelingChart: React.FC<Props> = ({ data }) => {
  const isDark = useIsDark();
  const chartData = useMemo(() => {
    if (!data?.verdeling_eindvermogen_percentielen) return [];
    
    // We mappen de 99 getallen naar een formaat dat Recharts snapt.
    // Index 0 = p1 (het slechtste scenario), Index 98 = p99 (het beste scenario)
    return data.verdeling_eindvermogen_percentielen.map((vermogen: number, index: number) => {
      const percentiel = index + 1;
      
      return {
        percentiel: percentiel,
        // Zekerheid: als we op p10 zitten, is er 90% kans dat het resultaat BETER is.
        // Dit leest voor veel gebruikers natuurlijker in een S-curve.
        zekerheid: 100 - percentiel, 
        vermogen: Math.round(vermogen),
      };
    });
  }, [data]);

  // Voor elke X-waarde (vermogen <= 0) bepalen we de min/max zekerheid,
  // zodat we in de tooltip een bereik kunnen tonen (bij gestapelde shortfall-percentielen).
  const certaintyRangeByVermogen = useMemo(() => {
    const map = new Map<number, { min: number; max: number }>();
    for (const point of chartData) {
      const v = point.vermogen;
      if (v > 0) continue;
      const z = point.zekerheid;
      const existing = map.get(v);
      if (!existing) {
        map.set(v, { min: z, max: z });
      } else {
        if (z < existing.min) existing.min = z;
        if (z > existing.max) existing.max = z;
      }
    }
    return map;
  }, [chartData]);

  if (!data || chartData.length === 0) return null;

  // Bepaal ronde tick-waarden voor de X-as (bijv. 100.000, 150.000, 200.000)
  const xAxisConfig = useMemo(() => {
    const values = chartData.map((d) => d.vermogen);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const range = dataMax - dataMin;

    // Kies een mooie stapgrootte: 25k, 50k, 100k, 250k, 500k, 1M
    const ref = range > 0 ? range : Math.max(dataMin, 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(ref)));
    const normalized = ref / magnitude;
    let step = magnitude;
    if (normalized <= 1.5) step = 0.25 * magnitude;
    else if (normalized <= 3) step = 0.5 * magnitude;
    else if (normalized <= 7) step = magnitude;
    else step = 2 * magnitude;

    const niceMin = Math.floor(dataMin / step) * step;
    const niceMax = Math.ceil(dataMax / step) * step;
    const ticks: number[] = [];
    for (let t = niceMin; t <= niceMax; t += step) {
      ticks.push(Math.round(t));
    }
    if (ticks.length === 0) ticks.push(Math.round(dataMin));
    // Domain op dataMin/dataMax zodat geen gat aan begin/einde; ticks blijven rond
    return { domain: [dataMin, dataMax] as [number, number], ticks };
  }, [chartData]);

  // Formatter voor de bedragen (bijv. € 150.000)
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('nl-NL', { 
      style: 'currency', 
      currency: 'EUR', 
      maximumFractionDigits: 0 
    }).format(value);

  // Formatter voor de X-as (bijv. € 150.000)
  const formatXAxis = (value: number) => formatCurrency(value);

  const tickColor = isDark ? '#a3a3a3' : '#6b7280';
  const gridColor = isDark ? '#404040' : '#e5e7eb';
  const refLineColor = isDark ? '#737373' : '#9ca3af';
  const tooltipStyle = isDark
    ? { borderRadius: '8px' as const, border: '1px solid #404040', backgroundColor: '#262626', color: '#e5e5e5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.4)' }
    : { borderRadius: '8px' as const, border: 'none', backgroundColor: '#ffffff', color: '#111827', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

  return (
    <div className="bg-white dark:bg-[#000000] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-600 mt-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
        Kansverdeling Eindvermogen
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Deze grafiek toont de zekerheid waarmee een bepaald eindvermogen wordt behaald.
      </p>
      
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart 
            data={chartData} 
            margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} opacity={isDark ? 0.5 : 0.4} />
            
            {/* X-as: Vermogen (ronde puntwaarden) */}
            <XAxis 
              dataKey="vermogen" 
              type="number" 
              domain={xAxisConfig.domain}
              ticks={xAxisConfig.ticks}
              tickFormatter={formatXAxis}
              tick={{ fill: tickColor, fontSize: 12 }}
              dy={10}
            />
            
            {/* Y-as: Zekerheid in procenten (0% tot 100%) */}
            <YAxis 
              dataKey="zekerheid" 
              domain={[0, 100]}
              tickFormatter={(val) => `${val}%`}
              tick={{ fill: tickColor, fontSize: 12 }}
              dx={-10}
            /> 
            
            <Tooltip 
              formatter={(value, name, props) => {
                const v = value as number;
                const n = (name ?? '') as string;
                if (typeof v !== 'number') return null;

                if (n === 'zekerheid') {
                  const vermogenX = (props && (props as any).payload && (props as any).payload.vermogen) as number | undefined;
                  if (typeof vermogenX === 'number' && vermogenX <= 0) {
                    const range = certaintyRangeByVermogen.get(vermogenX);
                    if (range && range.max !== range.min) {
                      // Toon het volledige bereik, bv. "99%–94% kans op méér"
                      return [`${range.max}%–${range.min}% kans op méér`, 'Zekerheid'];
                    }
                  }
                  return [`${v}% kans op méér`, 'Zekerheid'];
                }

                return [formatCurrency(v), 'Eindvermogen'];
              }}
              labelFormatter={(label) => `Bij een scenario van: ${formatCurrency(Number(label))}`}
              contentStyle={tooltipStyle}
              itemStyle={{ color: '#ff787c' }}
            />

            {/* Trek een hulplijn bij de 50% (Mediaan / Verwacht rendement) */}
            <ReferenceLine 
              y={50} 
              stroke={refLineColor} 
              strokeDasharray="3 3" 
              label={{ position: 'top', fill: tickColor, fontSize: 12 }} 
            />

            {/* De daadwerkelijke S-Curve Lijn */}
            <Line 
              type="monotone" 
              dataKey="zekerheid" 
              stroke="#ff787c"
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 6, fill: '#ff787c', stroke: isDark ? '#171717' : '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};