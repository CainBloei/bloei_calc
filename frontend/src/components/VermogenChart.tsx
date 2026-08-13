import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { RekenOutput } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface VermogenChartProps {
  data: RekenOutput;
}

export const VermogenChart: React.FC<VermogenChartProps> = ({ data }) => {
  // Format labels from trusted date strings. Always use date-fns format to avoid XSS from raw API data.
  const labels = data.tijdlijn_datums.map((d: string) => {
    const parsed = new Date(d);
    const valid = !Number.isNaN(parsed.getTime());
    return valid ? format(parsed, 'MMM yyyy', { locale: nl }) : '';
  });

  const chartData = {
    labels,
    datasets: [
      // Zeer onwaarschijnlijk band (p1-p90)
      {
        label: 'Zeer onwaarschijnlijk',
        data: data.tijdlijn_vermogen_p90_netto,
        borderColor: 'rgba(255, 120, 124, 0)', // onzichtbare lijn
        backgroundColor: 'rgba(255, 120, 124, 0.10)', // buitenste, lichtste roze waaier
        fill: '+1', // vult naar de onderliggende p1-lijn
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
      {
        label: 'Zeer onwaarschijnlijk (ondergrens)',
        data: data.tijdlijn_vermogen_p1_netto,
        borderColor: 'rgba(0, 0, 0, 0)',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
      // Minder waarschijnlijk band
      {
        label: 'Minder waarschijnlijk',
        data: data.tijdlijn_vermogen_p80_netto,
        borderColor: 'rgba(255, 120, 124, 0)', // onzichtbare lijn
        backgroundColor: 'rgba(255, 120, 124, 0.25)', // middelste roze waaier
        fill: '+1', // vult naar de onderliggende p20-lijn
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
      {
        label: 'Minder waarschijnlijk (ondergrens)',
        data: data.tijdlijn_vermogen_p20_netto,
        borderColor: 'rgba(0, 0, 0, 0)',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
      // Waarschijnlijk band
      {
        label: 'Waarschijnlijk',
        data: data.tijdlijn_vermogen_p60_netto,
        borderColor: 'rgba(255, 120, 124, 0)', // onzichtbare rand
        backgroundColor: 'rgba(255, 120, 124, 1)', // binnenste, meest intense roze waaier
        fill: '+1', // vult naar de onderliggende p40-lijn
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
      {
        label: 'Waarschijnlijk (ondergrens)',
        data: data.tijdlijn_vermogen_p40_netto,
        borderColor: 'rgba(0, 0, 0, 0)',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 10,
          boxHeight: 10,
          filter: function(item: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Verberg de technische ondergrens-series in de legenda
            return !item.text.includes('ondergrens');
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            const datasetLabel = context.dataset.label || '';
            const chart = context.chart;
            const index = context.dataIndex;

            // Toon alleen dezelfde items als in de legenda (geen ondergrenzen)
            if (datasetLabel.includes('ondergrens')) {
              return '';
            }

            const formatCurrency = (value: number) =>
              new Intl.NumberFormat('nl-NL', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(value);

            // Toon bandbreedte voor de waaiers
            if (datasetLabel === 'Zeer onwaarschijnlijk') {
              const upper = context.parsed.y;
              const lowerDataset = chart.data.datasets.find(
                (ds: any) => ds.label === 'Zeer onwaarschijnlijk (ondergrens)'
              );
              const lower = lowerDataset?.data?.[index];

              if (upper !== null && lower !== undefined) {
                return `${datasetLabel}: ${formatCurrency(lower)} - ${formatCurrency(upper)}`;
              }
            }

            if (datasetLabel === 'Minder waarschijnlijk') {
              const upper = context.parsed.y;
              const lowerDataset = chart.data.datasets.find(
                (ds: any) => ds.label === 'Minder waarschijnlijk (ondergrens)'
              );
              const lower = lowerDataset?.data?.[index];

              if (upper !== null && lower !== undefined) {
                return `${datasetLabel}: ${formatCurrency(lower)} - ${formatCurrency(upper)}`;
              }
            }

            if (datasetLabel === 'Waarschijnlijk') {
              const upper = context.parsed.y;
              const lowerDataset = chart.data.datasets.find(
                (ds: any) => ds.label === 'Waarschijnlijk (ondergrens)'
              );
              const lower = lowerDataset?.data?.[index];

              if (upper !== null && lower !== undefined) {
                return `${datasetLabel}: ${formatCurrency(lower)} - ${formatCurrency(upper)}`;
              }
            }

            // Fallback: enkelvoudige waarde
            let label = datasetLabel;
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += formatCurrency(context.parsed.y);
            }
            return label;
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 10,
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          display: false,
        }
      },
      y: {
        ticks: {
          callback: function(value: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            return '€ ' + value.toLocaleString('nl-NL');
          }
        }
      }
    }
  };

  return (
    <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 pr-16">Vermogensopbouw</h3>
      <div className="h-[400px]">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};
