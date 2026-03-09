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

// Bloei kleuren
const BLOEI_PETROL = '#0f494f';
const BLOEI_PINK = '#ff787c';
const BLOEI_TEAL = '#0d9488';
const GRAY_200: [number, number, number] = [229, 231, 235];
const GRAY_500: [number, number, number] = [107, 114, 128];
const GRAY_900: [number, number, number] = [17, 24, 39];
const RED_50: [number, number, number] = [254, 226, 226];
const RED_500: [number, number, number] = [239, 68, 68];

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.setDrawColor(GRAY_200[0], GRAY_200[1], GRAY_200[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, r, r, 'S');
}

function addMetricCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  subtitle: string,
  accentLeft = false
) {
  drawRoundedRect(doc, x, y, w, h, 2);
  if (accentLeft) {
    doc.setFillColor(...hexToRgb(BLOEI_TEAL));
    doc.rect(x, y, 2, h, 'F');
  }
  doc.setFontSize(9);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(title, x + (accentLeft ? 6 : 4), y + 8);
  doc.setFontSize(14);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + 4, y + 18);
  doc.setFontSize(8);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, x + 4, y + 24);
}

async function renderChartToImage(
  createChart: (ctx: CanvasRenderingContext2D) => Chart
): Promise<string> {
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

  const chart = createChart(ctx);
  await new Promise((r) => setTimeout(r, 150));
  const img = chart.toBase64Image('image/png');
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
      borderRadius: 8,
      borderSkipped: false,
    }],
  };
  return renderChartToImage((ctx) =>
    new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        indexAxis: 'y',
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            border: { display: false },
            grid: { color: '#e5e7eb' },
            ticks: { font: { size: 11 }, callback: (v: unknown) => { const n = Number(v); return n < 0 ? `€ -${Math.abs(n).toLocaleString('nl-NL')}` : `€ ${n.toLocaleString('nl-NL')}`; } },
          },
          y: {
            border: { display: false },
            grid: { color: '#e5e7eb' },
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
  return renderChartToImage((ctx) =>
    new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
        responsive: false,
        maintainAspectRatio: false,
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

function renderVerdelingChart(data: RekenOutput): string {
  const percentielen = data.verdeling_eindvermogen_percentielen ?? [];
  if (percentielen.length === 0) return '';
  const chartData = percentielen.map((vermogen: number, i: number) => ({
    x: Math.round(vermogen),
    y: 100 - (i + 1),
  }));
  const minX = Math.min(...chartData.map((d) => d.x));
  const maxX = Math.max(...chartData.map((d) => d.x));
  const rangeX = maxX - minX || 1;
  const w = 800;
  const h = 400;
  const pad = { left: 70, right: 50, top: 30, bottom: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px helvetica';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const pct = i * 25;
    const yy = pad.top + plotH - (pct / 100) * plotH;
    if (i > 0 && i < 4) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(w - pad.right, yy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillText(`${pct}%`, pad.left - 8, yy + 4);
  }
  ctx.textAlign = 'left';

  ctx.strokeStyle = BLOEI_PINK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  chartData.forEach((d, i) => {
    const px = pad.left + ((d.x - minX) / rangeX) * plotW;
    const py = pad.top + plotH - (d.y / 100) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.strokeStyle = '#9ca3af';
  ctx.setLineDash([3, 3]);
  const y50 = pad.top + plotH * 0.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, y50);
  ctx.lineTo(w - pad.right, y50);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#6b7280';
  ctx.font = '14px helvetica';
  ctx.textAlign = 'center';
  ctx.fillText('50%', w - pad.right + 15, y50 + 4);

  ctx.textAlign = 'left';
  ctx.fillText(fmtCurr(minX), pad.left, h - 5);
  ctx.textAlign = 'right';
  ctx.fillText(fmtCurr(maxX), w - pad.right, h - 5);

  return canvas.toDataURL('image/png');
}

export async function generateReportPdf(data: RekenOutput, startvermogen: number): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  doc.setFontSize(10);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gegenereerd op ${new Date().toLocaleDateString('nl-NL')} | Startvermogen: ${fmtCurr(startvermogen)}`, margin, y);
  y += 12;

  // Metric cards - 4 in een rij (2x2 op A4)
  const cardW = (contentWidth - 6) / 4;
  const cardH = 28;
  const metrics = [
    { title: 'Verwacht Eindvermogen', value: fmtCurr(data.verwacht_eindvermogen_netto), sub: 'Netto', accent: true },
    { title: 'Verwacht Rendement', value: fmtPct(data.verwacht_rendement_pct), sub: 'Gemiddeld per jaar', accent: false },
    { title: 'Pessimistisch', value: fmtCurr(data.verwacht_eindvermogen_p10_netto), sub: 'Bij tegenvallende markten', accent: false },
    { title: 'Kosten 1e Jaar', value: fmtCurr(data.kosten_eur_jaar1), sub: `${fmtPct(data.kosten_pct_jaar1, 2)} van inleg`, accent: false },
  ];
  metrics.forEach((m, i) => {
    addMetricCard(doc, margin + i * (cardW + 2), y, cardW, cardH, m.title, m.value, m.sub, m.accent);
  });
  y += cardH + 12;

  if (data.faalkans > 0) {
  doc.setFillColor(RED_50[0], RED_50[1], RED_50[2]);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
  doc.setDrawColor(RED_500[0], RED_500[1], RED_500[2]);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin, y + 18);
    doc.setFontSize(10);
    doc.setTextColor(127, 29, 29);
    doc.setFont('helvetica', 'bold');
    doc.text('Waarschuwing: Mogelijke onttrekkingstekorten', margin + 8, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(`In ${fmtPct(data.faalkans * 100, 0)} van de scenario's is er onvoldoende saldo om alle gewenste opnames te doen.`, margin + 8, y + 14);
    y += 24;
  }

  // Twee kolommen: Kosten | Bruto vs Netto
  const colW = (contentWidth - 8) / 2;
  const tableHead = { fillColor: [55, 65, 81] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, fontSize: 9 };

  doc.setFontSize(11);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Verwachte kosten in de loop van de tijd', margin, y);
  doc.text('Bruto vs Netto Opbrengst', margin + colW + 8, y);
  y += 8;

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
    headStyles: tableHead,
    bodyStyles: { fontSize: 9 },
    margin: { left: margin },
    tableWidth: colW,
    columnStyles: { 0: { cellWidth: colW * 0.5 }, 1: { cellWidth: colW * 0.25, halign: 'right' }, 2: { cellWidth: colW * 0.25, halign: 'right' } },
  });
  const yAfterKosten = (doc as JsPDFWithAutoTable).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    body: [
      ['Verwacht eindvermogen (zonder kosten)', fmtCurr(data.verwacht_eindvermogen_bruto)],
      ['- Totale impact kosten', fmtCurr(data.totale_kosten_impact)],
      ['Netto verwacht eindvermogen', fmtCurr(data.verwacht_eindvermogen_netto)],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9 },
    margin: { left: margin + colW + 8 },
    tableWidth: colW,
    columnStyles: { 0: { cellWidth: colW * 0.6 }, 1: { cellWidth: colW * 0.4, halign: 'right', fontStyle: 'bold' } },
  });
  y = Math.max(yAfterKosten, (doc as JsPDFWithAutoTable).lastAutoTable.finalY) + 6;

  doc.setFontSize(8);
  doc.setTextColor(127, 29, 29);
  doc.text(
    `Let op: Naast direct betaalde kosten (${fmtCurr(data.totale_kosten_betaald)}) ook misgelopen rendement (${fmtCurr(data.misgelopen_rendement_op_kosten)}). Totale impact: ${fmtCurr(data.totale_kosten_impact)}.`,
    margin,
    y,
    { maxWidth: contentWidth }
  );
  y += 14;

  // Jaarlijks overzicht
  doc.setFontSize(12);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Voorbeeldscenario jaarlijks overzicht', margin, y);
  y += 8;

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
      (cashflowJaar >= 0 ? '+' : '') + fmtCurr(cashflowJaar),
      (rendementJaar >= 0 ? '+' : '') + fmtCurr(rendementJaar),
      '-' + fmtCurr(kostenJaar),
      fmtCurr(eindVermogen),
    ]);
    year++;
  }

  autoTable(doc, {
    startY: y,
    head: [['Jaar', 'Beginvermogen', 'Netto Cashflow', 'Rendement', 'Kosten', 'Eindvermogen']],
    body: yearlyRows,
    theme: 'grid',
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' as const, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    showHead: 'everyPage',
  });
  y = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 16;

  // Grafieken op aparte landscape pagina's voor meer ruimte (800x400 px → ~260x130 mm)
  const chartLandscapeW = 277;
  const chartLandscapeH = 130;

  doc.addPage('a4', 'l');
  doc.setFontSize(14);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Opbouw Componenten', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.text('Verdeling van inkomende en uitgaande geldstromen.', 14, 28);
  const img1 = await renderComponentChart(data, startvermogen);
  if (img1) doc.addImage(img1, 'PNG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.addPage('a4', 'l');
  doc.setFontSize(14);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Vermogensopbouw', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.text('Verwachte vermogensontwikkeling met waarschijnlijkheidsbanden.', 14, 28);
  const img2 = await renderVermogenChart(data);
  if (img2) doc.addImage(img2, 'PNG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.addPage('a4', 'l');
  doc.setFontSize(14);
  doc.setTextColor(GRAY_900[0], GRAY_900[1], GRAY_900[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Kansverdeling Eindvermogen (S-Curve)', 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GRAY_500[0], GRAY_500[1], GRAY_500[2]);
  doc.text('Zekerheid waarmee een bepaald eindvermogen wordt behaald.', 14, 28);
  const img3 = renderVerdelingChart(data);
  if (img3) doc.addImage(img3, 'PNG', 14, 35, chartLandscapeW, chartLandscapeH);

  doc.save('Bloei_Vermogensrapportage.pdf');
}
