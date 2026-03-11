import React from 'react';
import { ComponentChart } from './ComponentChart';
import { VermogenChart } from './VermogenChart';
import { VerdelingChart } from './VerdelingChart';
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
}

export const ResultsView: React.FC<ResultsViewProps> = ({ data, startvermogen }) => {
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

        {data.faalkans > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Waarschuwing: Mogelijke onttrekkingstekorten
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>
                    In {formatPct(data.faalkans * 100, 0)} van de scenario's is er onvoldoende saldo om alle gewenste opnames te doen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* MiFID II Kosten Breakdown */}
          {/* html2pdf-pagebreak-avoid zorgt dat dit blok niet doormidden wordt geknipt op de PDF */}
          <div className="html2pdf-pagebreak-avoid bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Verwachte kosten in de loop van de tijd</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-[#000000] dark:text-white">
                  <tr>
                    <th className="px-4 py-3 rounded-tl">Kostensoort</th>
                    <th className="px-4 py-3 text-right">% / jaar</th>
                    <th className="px-4 py-3 text-right rounded-tr">Totaal betaald</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-600 dark:text-gray-400">
                  <tr className="bg-white dark:bg-[#000000]">
                    <td className="px-4 py-3 font-medium">Bloei beheervergoeding</td>
                    <td className="px-4 py-3 text-right">{formatPct(data.gemiddelde_beheerkosten_pct, 2)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.totale_beheerkosten_betaald)}</td>
                  </tr>
                  <tr className="bg-white dark:bg-[#000000]">
                    <td className="px-4 py-3 font-medium">Fondskosten (ETF's)</td>
                    <td className="px-4 py-3 text-right">{formatPct(data.gemiddelde_fondskosten_pct, 2)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.totale_fondskosten_betaald)}</td>
                  </tr>
                  <tr className="bg-white dark:bg-[#000000]">
                    <td className="px-4 py-3 font-medium">Transactiekosten (spread)</td>
                    <td className="px-4 py-3 text-right">{formatPct(data.gemiddelde_spreadkosten_pct, 2)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.totale_spreadkosten_betaald)}</td>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-[#000000] dark:text-white font-bold">
                    <td className="px-4 py-3">Totale kosten (cumulatief)</td>
                    <td className="px-4 py-3 text-right">{formatPct(data.gemiddelde_totale_kosten_pct, 2)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.totale_kosten_betaald)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
              <span className="font-semibold">Let op:</span> Naast de direct betaalde kosten ({formatCurrency(data.totale_kosten_betaald)}) is er ook sprake van misgelopen rendement over de onttrokken kosten ({formatCurrency(data.misgelopen_rendement_op_kosten)}). De totale impact van kosten op het eindvermogen is {formatCurrency(data.totale_kosten_impact)}.
            </div>
          </div>

          {/* Bruto / Netto Waterfall Placeholder */}
          <div className="html2pdf-pagebreak-avoid bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bruto vs Netto Opbrengst</h3>
             <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-600">
                   <tr>
                      <td className="px-4 py-3 font-medium">Verwacht eindvermogen (zonder kosten)</td>
                      <td className="px-4 py-3 text-right dark:text-white mb-4 font-bold">{formatCurrency(data.verwacht_eindvermogen_bruto)}</td>
                   </tr>
                   <tr>
                      <td className="px-4 py-3 font-medium text-red-600">- Totale impact kosten (inclusief misgelopen rendement)</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(data.totale_kosten_impact)}</td>
                   </tr>
                   <tr className="bg-gray-50 dark:bg-[#000000] text-lg">
                      <td className="px-4 py-4 font-bold text-gray-900 dark:text-white mb-4">Netto verwacht eindvermogen</td>
                      <td className="px-4 py-4 text-right dark:text-white mb-4 font-bold">{formatCurrency(data.verwacht_eindvermogen_netto)}</td>
                   </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Cashflow per Year Table - volledig uitgeklapt bij print/PDF */}
        <div className="html2pdf-pagebreak-avoid bg-white dark:bg-[#000000] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-neutral-600">
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
