import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { RekenOutput } from '../types';

Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const fmtCurr = (val: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
const fmtPct = (val: number, digits = 2) =>
  new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(val / 100);

// Colors matching the UI (Tailwind palette)
const BLOEI_PETROL = '#0f494f';
const BLOEI_PINK = '#ff787c';
const GRAY_50: [number, number, number] = [249, 250, 251];
const GRAY_200: [number, number, number] = [229, 231, 235];
const GRAY_500: [number, number, number] = [107, 114, 128];
const GRAY_900: [number, number, number] = [17, 24, 39];
const RED_50: [number, number, number] = [254, 242, 242];
const RED_500: [number, number, number] = [239, 68, 68];
const RED_600: [number, number, number] = [220, 38, 38];
const RED_800: [number, number, number] = [153, 27, 27];
const GREEN_600: [number, number, number] = [22, 163, 74];

function drawRoundedRect(
  doc: jsPDF, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  r: number, 
  fillColor?: [number, number, number], 
  drawColor?: [number, number, number]
) {
  if (fillColor) doc.setFillColor(...fillColor);
  if (drawColor) {
    doc.setDrawColor(...drawColor);
    doc.setLineWidth(0.3);
  }
  const style = fillColor && drawColor ? 'FD' : fillColor ? 'F' : drawColor ? 'S' : '';
  if (style) doc.roundedRect(x, y, w, h, r, r, style);
}

function addMetricCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  subtitle: string
) {
  drawRoundedRect(doc, x, y, w, h, 3, [255, 255, 255], GRAY_200);

  doc.setFontSize(9);
  doc.setTextColor(...GRAY_500);
  doc.setFont('helvetica', 'normal');
  doc.text(title, x + 5, y + 8);
  
  doc.setFontSize(16);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + 5, y + 17);
  
  if (subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_500);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, x + 5, y + 23);
  }
}

async function renderChartToImage(createChart: (ctx: CanvasRenderingContext2D, plugin: any) => Chart): Promise<string> {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:450px;';
  document.body.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  wrapper.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    document.body.removeChild(wrapper);
    return '';
  }

  // Use a plugin to enforce white background since chart.js clears the canvas internally
  const customBgPlugin = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: (chart: any) => {
      const {ctx} = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    }
  };

  const chart = createChart(ctx, customBgPlugin);
  // Wait a bit for animations/rendering
  await new Promise((r) => setTimeout(r, 250));
  const img = chart.toBase64Image('image/jpeg', 0.85); // Compress to JPEG with 85% quality
  chart.destroy();
  document.body.removeChild(wrapper);
  return img;
}

function renderComponentChart(data: RekenOutput, startvermogen: number): Promise<string> {
  const stortingen = data.tijdlijn_cashflow_netto.reduce((sum, val) => sum + (val > 0 ? val : 0), 0);
  const onttrekkingen = Math.abs(data.verwachte_winst_netto - data.verwacht_eindvermogen_netto + startvermogen + stortingen);
  const chartData = {
    labels: ['Startvermogen', 'Stortingen', 'Rendement (Bruto)', 'Onttrekkingen', 'Kosten Impact', 'Netto Eindvermogen'],
    datasets: [{
      label: 'Bedrag',
      data: [
        startvermogen,
        stortingen,
        data.verwachte_winst_bruto,
        -onttrekkingen,
        -data.totale_kosten_impact,
        data.verwacht_eindvermogen_netto,
      ],
      backgroundColor: [BLOEI_PETROL, '#14b8a6', BLOEI_PINK, '#ffc701', '#b34025', BLOEI_PETROL],
      borderRadius: 6,
      borderSkipped: false,
    }],
  };
  return renderChartToImage((ctx, bgPlugin) =>
    new Chart(ctx, {
      type: 'bar',
      data: chartData,
      plugins: [bgPlugin],
      options: {
        animation: false,
        indexAxis: 'y',
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 2, // High-res output
        plugins: { legend: { display: false } },
        scales: {
          x: {
            border: { display: false },
            grid: {
              z: -1,
              color: (context: any) => {
                if (!context || context.tick === undefined) return 'transparent';
                if (Math.abs(context.tick.value) < 1) return '#374151'; 
                return 'transparent';
              },
              lineWidth: (context: any) => {
                if (context && context.tick !== undefined && Math.abs(context.tick.value) < 1) return 2; 
                return 1;
              }
            },
            ticks: { font: { size: 11 }, callback: (v: unknown) => { const n = Number(v); return n < 0 ? `€ -${Math.abs(n).toLocaleString('nl-NL')}` : `€ ${n.toLocaleString('nl-NL')}`; } },
          },
          y: {
            border: { display: false },
            grid: {
              z: -2,
              color: (context: any) => context.index === 0 ? 'transparent' : '#e5e7eb',
              lineWidth: 1,
            },
            ticks: { font: { size: 12, weight: 'bold' } },
          },
        },
      },
    })
  );
}

function renderVermogenChart(data: RekenOutput): Promise<string> {
  const labels = data.tijdlijn_datums.map((d: string) => {
    const parsed = new Date(d);
    return !Number.isNaN(parsed.getTime()) ? format(parsed, 'MMM yyyy', { locale: nl }) : '';
  });
  const chartData = {
    labels,
    datasets: [
      { label: 'Minder waarschijnlijk', data: data.tijdlijn_vermogen_p80_netto, borderColor: 'rgba(255,120,124,0)', backgroundColor: 'rgba(255,120,124,0.25)', fill: '+1', pointRadius: 0, tension: 0.1 },
      { label: 'ondergrens', data: data.tijdlijn_vermogen_p20_netto, borderColor: 'transparent', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.1 },
      { label: 'Waarschijnlijk', data: data.tijdlijn_vermogen_p60_netto, borderColor: 'rgba(15,73,79,0)', backgroundColor: BLOEI_PINK, fill: '+1', pointRadius: 0, tension: 0.1 },
      { label: 'ondergrens2', data: data.tijdlijn_vermogen_p40_netto, borderColor: 'transparent', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.1 },
    ],
  };
  return renderChartToImage((ctx, bgPlugin) =>
    new Chart(ctx, {
      type: 'line',
      data: chartData,
      plugins: [bgPlugin],
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 2, // High-res output
        plugins: {
          legend: { display: true, position: 'top', labels: { font: { size: 12 }, filter: (item) => !item.text.includes('ondergrens') } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 45, font: { size: 10 } } },
          y: { ticks: { font: { size: 10 }, callback: (v: unknown) => '€ ' + Number(v).toLocaleString('nl-NL') } },
        },
      },
    })
  );
}

function renderVerdelingChart(data: RekenOutput): Promise<string> {
  const percentielen = data.verdeling_eindvermogen_percentielen ?? [];
  if (percentielen.length === 0) return Promise.resolve('');
  
  const chartData = {
    datasets: [{
      label: 'Zekerheid',
      data: percentielen.map((vermogen: number, i: number) => ({
        x: Math.round(vermogen),
        y: 100 - (i + 1),
      })),
      borderColor: BLOEI_PINK,
      borderWidth: 3,
      pointRadius: 0,
      fill: false,
      tension: 0.4
    }]
  };

  return renderChartToImage((ctx, bgPlugin) =>
    new Chart(ctx, {
      type: 'line',
      data: chartData,
      plugins: [bgPlugin],
      options: {
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: {
            type: 'linear',
            grid: {
              display: false,
            },
            ticks: {
              font: { size: 10 },
              callback: (v: unknown) => {
                const num = Number(v);
                return '€ ' + num.toLocaleString('nl-NL');
              },
              maxRotation: 45,
            },
            border: { display: true, color: '#e5e7eb' },
            min: Math.floor(Math.min(...percentielen) / 1000) * 1000,
            max: Math.ceil(Math.max(...percentielen) / 1000) * 1000,
          },
          y: {
            min: 0,
            max: 100,
            grid: {
              color: (context: any) => context.tick && context.tick.value === 50 ? '#9ca3af' : '#e5e7eb',
              lineWidth: (context: any) => context.tick && context.tick.value === 50 ? 2 : 1,
            },
            ticks: {
              stepSize: 25,
              font: { size: 10 },
              callback: (v: unknown) => v + '%',
            },
            border: { display: true, color: '#e5e7eb' }
          }
        },
      }
    })
  );
}

export async function generateReportPdf(data: RekenOutput, startvermogen: number): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // Header
  doc.setFontSize(22);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Resultaten', margin, y + 8);
  
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_500);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gegenereerd op ${new Date().toLocaleDateString('nl-NL')} | Startvermogen: ${fmtCurr(startvermogen)}`, margin, y + 14);
  y += 24;

  // Metric cards - 4 in een rij
  const cardW = (contentWidth - 6) / 4;
  const cardH = 26;
  const metrics = [
    { title: 'Verwacht Eindvermogen', value: fmtCurr(data.verwacht_eindvermogen_netto), sub: 'Netto' },
    { title: 'Verwacht Rendement', value: fmtPct(data.verwacht_rendement_pct), sub: 'Gemiddeld per jaar' },
    { title: 'Pessimistisch', value: fmtCurr(data.verwacht_eindvermogen_p10_netto), sub: 'Bij tegenvallende markten' },
    { title: 'Kosten 1e Jaar', value: fmtCurr(data.kosten_eur_jaar1), sub: `${fmtPct(data.kosten_pct_jaar1, 2)} van inleg` },
  ];
  metrics.forEach((m, i) => {
    addMetricCard(doc, margin + i * (cardW + 2), y, cardW, cardH, m.title, m.value, m.sub);
  });
  y += cardH + 10;

  // Waarschuwingstekort
  if (data.faalkans > 0) {
    drawRoundedRect(doc, margin, y, contentWidth, 18, 3, RED_50, RED_500);
    // accent lijn
    doc.setFillColor(...RED_500);
    doc.rect(margin, y + 2, 2, 14, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(...RED_800);
    doc.setFont('helvetica', 'bold');
    doc.text('Waarschuwing: Mogelijke onttrekkingstekorten', margin + 8, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(`In ${fmtPct(data.faalkans * 100, 0)} van de scenario's is er onvoldoende saldo om alle gewenste opnames te doen.`, margin + 8, y + 13);
    y += 24;
  }

  // Twee kolommen: Kosten | Bruto vs Netto
  const colW = (contentWidth - 8) / 2;

  // Titles
  doc.setFontSize(12);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Verwachte kosten in de loop van de tijd', margin, y);
  doc.text('Bruto vs Netto Opbrengst', margin + colW + 8, y);
  y += 6;

  // Linker tabel
  autoTable(doc, {
    startY: y,
    head: [['Kostensoort', '% / jaar', 'Totaal betaald']],
    body: [
      ['Bloei beheervergoeding', fmtPct(data.gemiddelde_beheerkosten_pct, 2), fmtCurr(data.totale_beheerkosten_betaald)],
      ['Fondskosten (ETF\'s)', fmtPct(data.gemiddelde_fondskosten_pct, 2), fmtCurr(data.totale_fondskosten_betaald)],
      ['Transactiekosten (spread)', fmtPct(data.gemiddelde_spreadkosten_pct, 2), fmtCurr(data.totale_spreadkosten_betaald)],
      ['Totale kosten (cumulatief)', fmtPct(data.gemiddelde_totale_kosten_pct, 2), fmtCurr(data.totale_kosten_betaald)],
    ],
    theme: 'plain',
    headStyles: { fillColor: GRAY_50, textColor: GRAY_500, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: GRAY_500 },
    margin: { left: margin },
    tableWidth: colW,
    columnStyles: { 0: { cellWidth: colW * 0.5 }, 1: { cellWidth: colW * 0.25, halign: 'right' }, 2: { cellWidth: colW * 0.25, halign: 'right' } },
    didParseCell: function(d) {
      if (d.section === 'body' && d.row.index === 3) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.textColor = GRAY_900;
        d.cell.styles.fillColor = GRAY_50;
      }
    },
    willDrawCell: function(d) {
      doc.setDrawColor(...GRAY_200);
      doc.setLineWidth(0.1);
      doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
    }
  });
  const yAfterKostenTable = (doc as JsPDFWithAutoTable).lastAutoTable.finalY;

  // Let op tekst
  const warningText = `Let op: Naast de direct betaalde kosten (${fmtCurr(data.totale_kosten_betaald)}) is er ook sprake van misgelopen rendement over de onttrokken kosten (${fmtCurr(data.misgelopen_rendement_op_kosten)}). De totale impact van kosten op het eindvermogen is ${fmtCurr(data.totale_kosten_impact)}.`;
  
  doc.setFontSize(9);
  const textLines = doc.splitTextToSize(warningText, contentWidth + 40);
  const warningH = textLines.length * 4 + 6;
  
  doc.setTextColor(...GRAY_500);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(textLines, margin, yAfterKostenTable + 6);
  
  const yAfterKosten = yAfterKostenTable + warningH;

  // Rechter tabel
  autoTable(doc, {
    startY: y,
    body: [
      ['Verwacht eindvermogen (zonder kosten)', fmtCurr(data.verwacht_eindvermogen_bruto)],
      ['- Totale impact kosten (incl. gemist rendement)', fmtCurr(data.totale_kosten_impact)],
      ['Netto verwacht eindvermogen', fmtCurr(data.verwacht_eindvermogen_netto)],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9, textColor: GRAY_500 },
    margin: { left: margin + colW + 8 },
    tableWidth: colW,
    columnStyles: { 0: { cellWidth: colW * 0.6 }, 1: { cellWidth: colW * 0.4, halign: 'right', fontStyle: 'bold' } },
    didParseCell: function(d) {
      if (d.section === 'body') {
        if (d.row.index === 1) {
          d.cell.styles.textColor = RED_600;
        }
        if (d.row.index === 2) {
          d.cell.styles.fillColor = GRAY_50;
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.textColor = GRAY_900;
          d.cell.styles.fontSize = 11;
        }
      }
    },
    willDrawCell: function(d) {
      doc.setDrawColor(...GRAY_200);
      doc.setLineWidth(0.1);
      doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
    }
  });

  y = Math.max(yAfterKosten, (doc as JsPDFWithAutoTable).lastAutoTable.finalY) + 14;

  // Jaarlijks overzicht
  doc.setFontSize(12);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Voorbeeldscenario jaarlijks overzicht', margin, y);
  y += 6;

  const yearlyRows: string[][] = [];
  let year = 1;
  for (let i = 1; i < data.tijdlijn_datums.length; i += 12) {
    const endIdx = Math.min(i + 11, data.tijdlijn_datums.length - 1);
    const startIdx = i - 1;
    const beginVermogen = data.tijdlijn_vermogen_p50_netto[startIdx];
    const eindVermogen = data.tijdlijn_vermogen_p50_netto[endIdx];
    let cashflowJaar = 0;
    for (let m = i; m <= endIdx; m++) cashflowJaar += data.tijdlijn_cashflow_netto[m];
    const kostenStart = data.tijdlijn_kosten_cumulatief[startIdx];
    const kostenEind = data.tijdlijn_kosten_cumulatief[endIdx];
    let kostenJaar = kostenEind - kostenStart;
    let rendementJaar = eindVermogen - beginVermogen - cashflowJaar + kostenJaar;
    if (eindVermogen === 0) {
      if (beginVermogen === 0) cashflowJaar = rendementJaar = kostenJaar = 0;
      else if (rendementJaar > beginVermogen * 0.2) {
        rendementJaar = beginVermogen * (data.verwacht_rendement_pct / 100) * 0.5;
        cashflowJaar = eindVermogen - beginVermogen - rendementJaar + kostenJaar;
      }
    }
    yearlyRows.push([
      `Jaar ${year}`,
      fmtCurr(beginVermogen),
      (cashflowJaar > 0 ? '+' : '') + fmtCurr(cashflowJaar),
      (rendementJaar > 0 ? '+' : '') + fmtCurr(rendementJaar),
      '-' + fmtCurr(kostenJaar),
      fmtCurr(eindVermogen),
    ]);
    year++;
  }

  autoTable(doc, {
    startY: y,
    head: [['Jaar', 'Beginvermogen (p50)', 'Netto Cashflow', 'Rendement', 'Kosten', 'Eindvermogen (p50)']],
    body: yearlyRows,
    theme: 'plain',
    headStyles: { fillColor: GRAY_50, textColor: GRAY_500, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: GRAY_500 },
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    showHead: 'everyPage',
    didParseCell: function(d) {
      if (d.section === 'body') {
        // Alignment
        if (d.column.index > 0) d.cell.styles.halign = 'right';
        
        // Colors
        if (d.column.index === 2 || d.column.index === 3) {
          const raw = d.cell.raw as string;
          if (raw.includes('+') && !raw.includes('€ 0')) d.cell.styles.textColor = GREEN_600;
          else if (raw.includes('-') && !raw.includes('€ 0')) d.cell.styles.textColor = RED_600;
        }
        if (d.column.index === 4) {
          d.cell.styles.textColor = RED_600;
        }
        if (d.column.index === 5) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.textColor = GRAY_900;
        }
      }
      if (d.section === 'head' && d.column.index > 0) {
        d.cell.styles.halign = 'right';
      }
    },
    willDrawCell: function(d) {
      doc.setDrawColor(...GRAY_200);
      doc.setLineWidth(0.1);
      doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
    }
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 16;

  // Grafieken op aparte landscape pagina's
  const chartLandscapeW = 277;
  const chartLandscapeH = 130;

  doc.addPage('a4', 'l');
  doc.setFontSize(16);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Opbouw Componenten', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_500);
  doc.text('Verdeling van inkomende en uitgaande geldstromen.', 14, 28);
  const img1 = await renderComponentChart(data, startvermogen);
  if (img1) doc.addImage(img1, 'JPEG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.addPage('a4', 'l');
  doc.setFontSize(16);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Vermogensopbouw', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_500);
  doc.text('Verwachte vermogensontwikkeling met waarschijnlijkheidsbanden.', 14, 28);
  const img2 = await renderVermogenChart(data);
  if (img2) doc.addImage(img2, 'JPEG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.addPage('a4', 'l');
  doc.setFontSize(16);
  doc.setTextColor(...GRAY_900);
  doc.setFont('helvetica', 'bold');
  doc.text('Kansverdeling Eindvermogen', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_500);
  doc.text('Deze grafiek toont de zekerheid waarmee een bepaald eindvermogen wordt behaald.', 14, 28);
  const img3 = await renderVerdelingChart(data);
  if (img3) doc.addImage(img3, 'JPEG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.save('Bloei_Vermogensrapportage.pdf');
}
