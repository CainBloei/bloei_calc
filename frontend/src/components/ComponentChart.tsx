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
  // 1. Berekeningen (dezelfde wiskundige truc als eerder voor perfecte data)
  const stortingen = data.tijdlijn_cashflow_netto.reduce((sum, val) => sum + (val > 0 ? val : 0), 0);
  const onttrekkingen = Math.abs(data.verwachte_winst_netto - data.verwacht_eindvermogen_netto + startvermogen + stortingen);

  const rendementBruto = data.verwachte_winst_bruto;
  const kostenImpact = data.totale_kosten_impact;
  const eindvermogen = data.verwacht_eindvermogen_netto;

  // 2. We zetten de data in een simpele array.
  // Onttrekkingen en kosten maken we negatief zodat ze naar links wijzen op de X-as.
  const chartData = {
    labels: [
      'Startvermogen', 
      'Stortingen', 
      'Rendement (Bruto)', 
      'Onttrekkingen', 
      'Kosten Impact', 
      'Netto Eindvermogen'
    ],
    datasets: [
      {
        label: 'Bedrag',
        data: [
          startvermogen, 
          stortingen, 
          rendementBruto, 
          -onttrekkingen, // Negatief voor weergave naar links
          -kostenImpact,  // Negatief voor weergave naar links
          eindvermogen
        ],
        backgroundColor: [
          '#0f494f', // bloei-petrol
          '#14b8a6', // teal-500
          '#ff787c', // bloei-pink
          '#ffc701', // yellow-500
          '#b34025', // red-500
          '#0f494f', // bloei-petrol (Eindvermogen zelfde kleur als start)
        ],
        borderRadius: 6, // Maakt de staafjes mooi afgerond
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const, // Dit draait de grafiek horizontaal!
    plugins: {
      title: {
        display: false,
      },
      legend: {
        display: false, // We verbergen de legenda, want de Y-as labels leggen het al uit
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            // We zorgen dat in de tooltip altijd een positief bedrag staat, ook bij kosten
            return ' € ' + Math.abs(context.raw).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          color: (context: any) => {
            if (context.tick.value === 0) return '#374151'; // Maak de 0-lijn iets donkerder/duidelijker
            return '#e5e7eb'; // Lichte grid lines voor de rest
          },
          lineWidth: (context: any) => {
            if (context.tick.value === 0) return 2;
            return 1;
          }
        },
        ticks: {
          callback: function(value: any) {
            // Laat op de X-as ook alles als positieve bedragen zien
            return '€ ' + Math.abs(value).toLocaleString('nl-NL');
          }
        }
      },
      y: {
        grid: {
          display: false, // Verberg de horizontale lijnen voor een schonere look
        },
        ticks: {
          font: {
            weight: 'bold',
          }
        }
      }
    }
  };

  return (
    <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600 mt-8">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Opbouw Componenten</h3>
      <p className="text-sm text-gray-500 mb-6">Verdeling van inkomende en uitgaande geldstromen.</p>
      <div className="h-[350px]">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};
