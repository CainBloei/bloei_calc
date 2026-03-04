// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { RekenOutput } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ComponentChartProps {
  data: RekenOutput;
  startvermogen: number;
}

export const ComponentChart: React.FC<ComponentChartProps> = ({ data, startvermogen }) => {
  // Aggregate totals
  const totalInleg = data.tijdlijn_cashflow_netto.reduce((sum, val) => sum + (val > 0 ? val : 0), 0);
  const totalOnttrekking = data.tijdlijn_cashflow_netto.reduce((sum, val) => sum + (val < 0 ? Math.abs(val) : 0), 0);
  
  const nettoInleg = startvermogen + totalInleg - totalOnttrekking;
  const rendementBruto = data.verwachte_winst_bruto; // Bruto profit
  const kostenImpact = data.totale_kosten_impact; // Total cost impact
  const rendementNetto = Math.max(0, rendementBruto - kostenImpact);

  // Drie positieve segmenten zodat de as bij 0 start en alle onderdelen zichtbaar zijn:
  // Onderaan: inleg, dan rendement na kosten, bovenaan: kosten. Totaal = inleg + bruto rendement.
  const chartData = {
    labels: ['Verwacht Eindvermogen'],
    datasets: [
      {
        label: 'Startvermogen + Netto Inleg',
        data: [nettoInleg],
        backgroundColor: '#0f494f', // bloei-petrol
        stack: 'Stack 0',
      },
      {
        label: 'Rendement',
        data: [rendementNetto],
        backgroundColor: '#ff787c', // bloei-pink
        stack: 'Stack 0',
      },
      {
        label: 'Kosten Impact',
        data: [kostenImpact],
        backgroundColor: '#9ca3af', // gray-400
        stack: 'Stack 0',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: false,
      },
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              // Show absolute value in tooltip for costs too
              label += new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.abs(context.parsed.y));
            }
            return label;
          }
        }
      },
    },
    scales: {
      x: {
        stacked: true,
        display: false, // Hide x axis completely as there is only 1 bar
      },
      y: {
        stacked: true,
        min: 0,
        ticks: {
          callback: function(value: any) {
            return '€ ' + value.toLocaleString('nl-NL');
          }
        }
      }
    }
  };

  return (
    <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600 mt-8">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Opbouw Componenten</h3>
      <p className="text-sm text-gray-500 mb-6">Visualisatie van inleg, rendement en kosten impact.</p>
      <div className="h-[300px]">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};
