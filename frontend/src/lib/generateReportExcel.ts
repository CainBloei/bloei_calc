import * as XLSX from 'xlsx';
import type { RekenOutput } from '../types';

export function generateReportExcel(data: RekenOutput, startvermogen: number): void {
  // 1. Overzicht / Metrics sheet
  const metricsData = [
    ['BLOEI VERMOGENSRAPPORTAGE'],
    [],
    ['ALGEMEEN'],
    ['  Gegenereerd op', new Date().toLocaleDateString('nl-NL')],
    ['  Startvermogen', startvermogen],
    [],
    ['SAMENVATTING RESULTATEN'],
    ['  Verwacht eindvermogen (netto)', data.verwacht_eindvermogen_netto],
    ['  Pessimistisch eindvermogen (p10)', data.verwacht_eindvermogen_p10_netto],
    ['  Verwacht rendement per jaar', data.verwacht_rendement_pct / 100], 
    ['  Kosten 1e jaar (€)', data.kosten_eur_jaar1],
    ['  Kosten 1e jaar (% van inleg)', data.kosten_pct_jaar1 / 100],
    [],
    ['VERWACHTE KOSTEN OVER DE LOOPTIJD', '% per jaar', 'Totaal betaald'],
    ['  Bloei beheervergoeding', data.gemiddelde_beheerkosten_pct / 100, data.totale_beheerkosten_betaald],
    ['  Fondskosten (ETF\'s)', data.gemiddelde_fondskosten_pct / 100, data.totale_fondskosten_betaald],
    ['  Transactiekosten (spread)', data.gemiddelde_spreadkosten_pct / 100, data.totale_spreadkosten_betaald],
    ['  Totale kosten (cumulatief)', data.gemiddelde_totale_kosten_pct / 100, data.totale_kosten_betaald],
    [],
    ['BRUTO VS NETTO OPBRENGST', 'Bedrag'],
    ['  Verwacht eindvermogen (zonder kosten)', data.verwacht_eindvermogen_bruto],
    ['  Totale impact kosten (incl. gemist rendement)', -data.totale_kosten_impact],
    ['  Netto verwacht eindvermogen', data.verwacht_eindvermogen_netto]
  ];

  const wsMetrics = XLSX.utils.aoa_to_sheet(metricsData);

  // Set column widths for readability
  wsMetrics['!cols'] = [
    { wch: 45 },
    { wch: 20 },
    { wch: 20 }
  ];

  // Apply basic formatting for currencies and percentages using openxml formats
  const fmtCurrency = '"€"#,##0';
  const fmtPercent = '0.00%';
  
  // Format specific cells in metrics sheet
  for (let r = 0; r < metricsData.length; r++) {
    for (let c = 0; c < 3; c++) {
      const cellRef = XLSX.utils.encode_cell({r, c});
      if (!wsMetrics[cellRef]) continue;
      
      const val = wsMetrics[cellRef].v;
      if (typeof val === 'number') {
        const rowLabel = metricsData[r][0] ? metricsData[r][0].toString() : '';
        const isKostenSection = ['beheervergoeding', 'Fondskosten', 'Transactiekosten', 'Totale kosten'].some(k => rowLabel.includes(k));
        
        if (rowLabel.includes('%') || rowLabel.includes('rendement per jaar') || (c === 1 && isKostenSection)) {
          wsMetrics[cellRef].z = fmtPercent;
        } else if (!rowLabel.includes('Gegenereerd op')) {
          wsMetrics[cellRef].z = fmtCurrency;
        }
      }
    }
  }

  // 2. Jaarlijks Overzicht sheet
  const yearlyHeader = ['Jaar', 'Beginvermogen (p50)', 'Netto Cashflow', 'Rendement', 'Kosten', 'Eindvermogen (p50)'];
  const yearlyData: any[][] = [yearlyHeader];

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

    yearlyData.push([
      year,
      beginVermogen,
      cashflowJaar,
      rendementJaar,
      -kostenJaar,
      eindVermogen
    ]);
    year++;
  }

  const wsYearly = XLSX.utils.aoa_to_sheet(yearlyData);
  wsYearly['!cols'] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 }
  ];

  // Apply formatting to Yearly sheet
  for (let r = 1; r < yearlyData.length; r++) { // Skip header row
    for (let c = 1; c < 6; c++) { // Format all columns except Year (0)
      const cellRef = XLSX.utils.encode_cell({r, c});
      if (wsYearly[cellRef] && typeof wsYearly[cellRef].v === 'number') {
        wsYearly[cellRef].z = fmtCurrency;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMetrics, 'Samenvatting');
  XLSX.utils.book_append_sheet(wb, wsYearly, 'Jaarlijks Overzicht');

  // 3. Maandelijkse Scenario Data sheet
  const monthlyHeader = [
    'Maand / Datum',
    'Vermogen P10 (Netto)',
    'Vermogen P20 (Netto)',
    'Vermogen P40 (Netto)',
    'Vermogen P50 (Netto)',
    'Vermogen P60 (Netto)',
    'Vermogen P80 (Netto)',
    'Vermogen P90 (Netto)',
    'Beleggingsprofiel',
    'Cumulatieve Kosten'
  ];
  
  const monthlyData: any[][] = [monthlyHeader];

  for (let i = 0; i < data.tijdlijn_datums.length; i++) {
    monthlyData.push([
      data.tijdlijn_datums[i],
      data.tijdlijn_vermogen_p10_netto[i],
      data.tijdlijn_vermogen_p20_netto[i],
      data.tijdlijn_vermogen_p40_netto[i],
      data.tijdlijn_vermogen_p50_netto[i],
      data.tijdlijn_vermogen_p60_netto[i],
      data.tijdlijn_vermogen_p80_netto[i],
      data.tijdlijn_vermogen_p90_netto[i],
      data.tijdlijn_profiel[i],
      data.tijdlijn_kosten_cumulatief[i]
    ]);
  }

  const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData);
  wsMonthly['!cols'] = [
    { wch: 15 }, // Datum
    { wch: 20 }, // P10
    { wch: 20 }, // P20
    { wch: 20 }, // P40
    { wch: 20 }, // P50
    { wch: 20 }, // P60
    { wch: 20 }, // P80
    { wch: 20 }, // P90
    { wch: 20 }, // Profiel
    { wch: 20 }  // Kosten
  ];
  
  // Apply formatting for Monthly sheet
  for (let r = 1; r < monthlyData.length; r++) {
    for (let c = 1; c < monthlyData[r].length; c++) {
      if (c !== 8) { // Skip profiel column
        const cellRef = XLSX.utils.encode_cell({r, c});
        if (wsMonthly[cellRef] && typeof wsMonthly[cellRef].v === 'number') {
          wsMonthly[cellRef].z = fmtCurrency;
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Maandelijkse Data');

  // 4. Kansverdeling Eindvermogen (S-Curve data) sheet
  const distributionHeader = [
    'Percentiel',
    'Zekerheid (%)',
    'Eindvermogen (Netto)'
  ];
  
  const distributionData: any[][] = [distributionHeader];
  
  // verdeling_eindvermogen_percentielen contains p1 through p99
  if (data.verdeling_eindvermogen_percentielen && data.verdeling_eindvermogen_percentielen.length > 0) {
    data.verdeling_eindvermogen_percentielen.forEach((vermogen: number, index: number) => {
      const percentiel = index + 1;
      const zekerheid = (100 - percentiel) / 100; // Format for Excel percentages
      distributionData.push([
        percentiel,
        zekerheid,
        vermogen
      ]);
    });
  }

  const wsDistribution = XLSX.utils.aoa_to_sheet(distributionData);
  wsDistribution['!cols'] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 25 }
  ];
  
  // Apply formatting for Distribution sheet
  for (let r = 1; r < distributionData.length; r++) {
    const zekerheidCell = XLSX.utils.encode_cell({r, c: 1});
    if (wsDistribution[zekerheidCell] && typeof wsDistribution[zekerheidCell].v === 'number') {
      wsDistribution[zekerheidCell].z = fmtPercent;
    }
    
    const eindvermogenCell = XLSX.utils.encode_cell({r, c: 2});
    if (wsDistribution[eindvermogenCell] && typeof wsDistribution[eindvermogenCell].v === 'number') {
      wsDistribution[eindvermogenCell].z = fmtCurrency;
    }
  }

  XLSX.utils.book_append_sheet(wb, wsDistribution, 'Kansverdeling Eindvermogen');

  // Generate Excel file and trigger download
  XLSX.writeFile(wb, 'Bloei_Vermogensrapportage.xlsx');
}
