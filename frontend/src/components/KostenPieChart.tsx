import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { RekenOutput } from '../types';
import { formatCurrency } from './ResultsView';

const PIE_COLORS = ['#0f494f', '#4b777b', '#87a4a7', '#c3d1d3'];

export const KostenPieChart: React.FC<{ data: RekenOutput }> = ({ data }) => {
  const pieData = useMemo(() => {
    const entries = [
      { name: 'Beheervergoeding', value: data.totale_beheerkosten_betaald },
      { name: "Fondskosten", value: data.totale_fondskosten_betaald },
      { name: 'Transactiekosten', value: data.totale_spreadkosten_betaald },
      { name: 'Misgelopen rendement', value: data.misgelopen_rendement_op_kosten },
    ];
    return entries.filter((e) => e.value > 0);
  }, [data]);

  const total = pieData.reduce((sum, e) => sum + e.value, 0);

  if (total === 0) {
    return <p className="text-sm text-gray-500">Geen kosten berekend.</p>;
  }

  return (
    <div className="flex flex-col items-center">
      <div className="h-52 w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius={100}
              paddingAngle={0}
              label={false}
              stroke="none"
            >
              {pieData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, props) => {
                const v = value as number;
                const name = (props && (props as any).name) as string | undefined;
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
                const label = name ?? 'Kostenpost';
                return [`${formatCurrency(v)} (${pct}%)`, label];
              }}
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#ffffff',
                color: '#111827',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full mt-4 space-y-2">
        {pieData.map((entry, index) => {
          const pct = ((entry.value / total) * 100).toFixed(1);
          return (
            <div key={entry.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                />
                <span className="text-gray-600 dark:text-gray-400">{entry.name}</span>
              </div>
              <span className="font-medium text-gray-800 dark:text-gray-200 ml-2 whitespace-nowrap">
                {formatCurrency(entry.value)}{' '}
                <span className="text-gray-400 dark:text-gray-500 font-normal">({pct}%)</span>
              </span>
            </div>
          );
        })}
        <div className="pt-2 border-t border-gray-200 dark:border-neutral-600 flex items-center justify-between text-sm font-bold">
          <span className="text-gray-800 dark:text-gray-200">Totale kostenimpact</span>
          <span className="text-gray-900 dark:text-white">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
};

