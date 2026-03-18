import React from 'react';
import { ComponentChart } from './ComponentChart';
import { VermogenChart } from './VermogenChart';
import { VerdelingChart } from './VerdelingChart';
import { KostenPieChart } from './KostenPieChart';
import type { RekenOutput } from '../types';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-[#000000] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-600 ${className}`}>
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{subtitle}</p>}
    </div>
  );
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(val);
};

export const formatPct = (val: number, fractionDigits: number = 2) => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(val / 100);
};

interface ResultsViewProps {
  data: RekenOutput;
  startvermogen: number;
  periodiekeOnttrekkingMaandelijks: number;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  data,
  startvermogen,
  periodiekeOnttrekkingMaandelijks,
}) => {
  const hasPeriodiekeOnttrekking = periodiekeOnttrekkingMaandelijks > 0;
  const inkomensdoelHaalbaar = data.faalkans <= 0.01;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 bg-gray-50 dark:bg-transparent p-1">
        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            title="Verwacht Eindvermogen" 
            value={formatCurrency(data.verwacht_eindvermogen_netto)} 
            subtitle="Netto"
            className="border-l-4 border-l-bloei-petrol"
          />
          <MetricCard 
            title="Verwacht Rendement" 
            value={formatPct(data.verwacht_rendement_pct)} 
            subtitle="Gemiddeld per jaar"
          />
          <MetricCard 
            title="Pessimistisch" 
            value={formatCurrency(data.verwacht_eindvermogen_p10_netto)} 
            subtitle="Bij tegenvallende markten"
          />
          <MetricCard 
            title="Kosten 1e Jaar" 
            value={formatCurrency(data.kosten_eur_jaar1)} 
            subtitle={`${formatPct(data.kosten_pct_jaar1, 2)} van inleg`}
          />
        </div>

        {(hasPeriodiekeOnttrekking || data.haalbaarheid_doelvermogen_pct != null) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasPeriodiekeOnttrekking && (
              <MetricCard
                title="Inkomensdoelstelling (99% zekerheid)"
                value={inkomensdoelHaalbaar ? 'Haalbaar' : 'Niet haalbaar'}
                subtitle={`Faalkans: ${formatPct(data.faalkans * 100, 0)}`}
                className={inkomensdoelHaalbaar ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}
              />
            )}

            {data.haalbaarheid_doelvermogen_pct != null && (
              <MetricCard
                title="Kans op behalen doelvermogen"
                value={formatPct(data.haalbaarheid_doelvermogen_pct, 0)}
                subtitle="Op basis van netto eindvermogen"
                className="border-l-4 border-l-bloei-petrol"
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* MiFID II Kosten Breakdown */}
          <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Verwachte kosten in de loop van de tijd</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-[#000000] dark:text-white">
                  <tr>
                    <th rowSpan={2} className="px-4 py-2 align-center rounded-tl border-b border-gray-200 dark:border-neutral-600">Kostensoort</th>
                    <th colSpan={2} className="px-4 py-2 text-center border-b border-gray-200 dark:border-neutral-600 border-l border-r">Eerste jaar</th>
                    <th rowSpan={2} className="px-4 py-2 text-center align-bottom rounded-tr border-b border-gray-200 dark:border-neutral-600">Langjarig gemiddelde</th>
                  </tr>
                  <tr>
                    <th className="px-4 py-2 text-center border-b border-gray-200 dark:border-neutral-600 border-l">%</th>
                    <th className="px-4 py-2 text-center border-b border-gray-200 dark:border-neutral-600 border-r">€</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-600 dark:text-gray-400">
                  {(() => {
                    const totalPct = data.gemiddelde_totale_kosten_pct;
                    const ratio = (componentPct: number) => totalPct > 0 ? componentPct / totalPct : 0;
                    const rows = [
                      { label: 'Bloei beheervergoeding', avgPct: data.gemiddelde_beheerkosten_pct },
                      { label: "Fondskosten", avgPct: data.gemiddelde_fondskosten_pct },
                      { label: 'Transactiekosten (spread)', avgPct: data.gemiddelde_spreadkosten_pct },
                    ];
                    return (
                      <>
                        {rows.map((row) => (
                          <tr key={row.label} className="bg-white dark:bg-[#000000]">
                            <td className="px-4 py-3 font-medium">{row.label}</td>
                            <td className="px-4 py-3 text-right border-l border-gray-100 dark:border-neutral-700">{formatPct(ratio(row.avgPct) * data.kosten_pct_jaar1, 2)}</td>
                            <td className="px-4 py-3 text-right border-r border-gray-100 dark:border-neutral-700">{formatCurrency(ratio(row.avgPct) * data.kosten_eur_jaar1)}</td>
                            <td className="px-4 py-3 text-center">{formatPct(row.avgPct, 2)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 dark:bg-[#000000] dark:text-white font-bold">
                          <td className="px-4 py-3">Totale kosten</td>
                          <td className="px-4 py-3 text-right border-l border-gray-100 dark:border-neutral-700">{formatPct(data.kosten_pct_jaar1, 2)}</td>
                          <td className="px-4 py-3 text-right border-r border-gray-100 dark:border-neutral-700">{formatCurrency(data.kosten_eur_jaar1)}</td>
                          <td className="px-4 py-3 text-center">{formatPct(data.gemiddelde_totale_kosten_pct, 2)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kostenopbouw taartdiagram */}
          <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Kostenopbouw</h3>
            <KostenPieChart data={data} />
          </div>

        </div>

        {/* Cashflow per Year Table */}
        <div className="bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Voorbeeldscenario jaarlijks overzicht</h3>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-[#000000] dark:text-white sticky top-0">
                <tr>
                  <th className="px-4 py-3 dark:text-gray-400 rounded-tl">Jaar</th>
                  <th className="px-4 py-3 text-right">Beginvermogen (p50)</th>
                  <th className="px-4 py-3 text-right">Netto Cashflow</th>
                  <th className="px-4 py-3 text-right">Rendement</th>
                  <th className="px-4 py-3 text-right">Kosten</th>
                  <th className="px-4 py-3 text-right rounded-tr">Eindvermogen (p50)</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-600">
                {(() => {
                  const yearlyData = [];
                  let year = 1;
                  
                  for (let i = 1; i < data.tijdlijn_datums.length; i += 12) {
                    const endIdx = Math.min(i + 11, data.tijdlijn_datums.length - 1);
                    const startIdx = i - 1; 
                    
                    const beginVermogen = data.tijdlijn_vermogen_p50_netto[startIdx];
                    const eindVermogen = data.tijdlijn_vermogen_p50_netto[endIdx];
                    
                    let cashflowJaar = 0;
                    for (let m = i; m <= endIdx; m++) {
                      cashflowJaar += data.tijdlijn_cashflow_netto[m];
                    }
                    
                    const kostenStart = data.tijdlijn_kosten_cumulatief[startIdx];
                    const kostenEind = data.tijdlijn_kosten_cumulatief[endIdx];
                    let kostenJaar = kostenEind - kostenStart;
                    
                    let rendementJaar = eindVermogen - beginVermogen - cashflowJaar + kostenJaar;

                    if (eindVermogen === 0) {
                      if (beginVermogen === 0) {
                        cashflowJaar = 0;
                        rendementJaar = 0;
                        kostenJaar = 0;
                      } else if (rendementJaar > beginVermogen * 0.2) {
                        rendementJaar = beginVermogen * (data.verwacht_rendement_pct / 100) * 0.5;
                        cashflowJaar = eindVermogen - beginVermogen - rendementJaar + kostenJaar;
                      }
                    }

                    yearlyData.push(
                      <tr key={`year-${year}`} className="bg-white dark:bg-[#000000] hover:bg-gray-50 dark:hover:bg-[#000000] transition-colors">
                        <td className="px-4 py-3 dark:text-gray-400 font-medium">Jaar {year}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(beginVermogen)}</td>
                        <td className={`px-4 py-3 text-right ${cashflowJaar > 0 ? 'text-green-600' : cashflowJaar < 0 ? 'text-red-600' : ''}`}>
                          {cashflowJaar > 0 ? '+' : ''}{formatCurrency(cashflowJaar)}
                        </td>
                        <td className={`px-4 py-3 text-right ${rendementJaar > 0 ? 'text-green-600' : rendementJaar < 0 ? 'text-red-600' : ''}`}>
                          {rendementJaar > 0 ? '+' : ''}{formatCurrency(rendementJaar)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">-{formatCurrency(kostenJaar)}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(eindVermogen)}</td>
                      </tr>
                    );
                    year++;
                  }
                  return yearlyData;
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grafieken */}
        <ComponentChart data={data} startvermogen={startvermogen} />
        <VermogenChart data={data} />
        <VerdelingChart data={data} />
    </div>
  );
};
