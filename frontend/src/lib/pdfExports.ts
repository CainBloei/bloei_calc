import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// @ts-nocheck
import type { RekenOutput } from '../types';

export const generateResultsPDF = async (data: RekenOutput): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - 2 * margin;

      // Hulpfunctie om valuta en percentages te formatteren 
      // (zodat we dit niet dubbel hoeven te kopiëren uit je views)
      const fmtCurr = (val: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
      const fmtPct = (val: number) => new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val / 100);

      // Hulpfunctie voor Metric Cards
      const drawCard = (x: number, y: number, w: number, h: number, title: string, value: string, subtitle: string, isFirst: boolean = false) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, y, w, h, 2, 2, 'FD');

        if (isFirst) {
          doc.setFillColor(13, 148, 136); // bloei-petrol
          doc.rect(x, y, 1.5, h, 'F');
        }

        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
        doc.text(title, x + 5, y + 8);
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(17, 24, 39);
        doc.text(value, x + 5, y + 16);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(156, 163, 175);
        doc.text(subtitle, x + 5, y + 22);
      };

      // --- 1. HEADER ---
      doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(13, 148, 136);
      doc.text('Bloei Vermogensrapportage', margin, 22);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
      doc.text(`Gegenereerd op: ${new Date().toLocaleDateString('nl-NL')}`, margin, 28);
      doc.setDrawColor(229, 231, 235); doc.line(margin, 32, pageWidth - margin, 32);

      let currentY = 38;

      // --- 2. METRIC CARDS ---
      const cw = (contentWidth - 12) / 4; 
      const ch = 26;
      drawCard(margin, currentY, cw, ch, 'Eindvermogen', fmtCurr(data.verwacht_eindvermogen_netto), 'Netto', true);
      drawCard(margin + cw + 4, currentY, cw, ch, 'Verwacht Rendement', fmtPct(data.verwacht_rendement_pct), 'Gemiddeld per jaar');
      drawCard(margin + (cw + 4) * 2, currentY, cw, ch, 'Pessimistisch', fmtCurr(data.verwacht_eindvermogen_p10_netto), 'Tegenvallende markten');
      drawCard(margin + (cw + 4) * 3, currentY, cw, ch, 'Kosten 1e Jaar', fmtCurr(data.kosten_eur_jaar1), `${fmtPct(data.kosten_pct_jaar1)} van inleg`);
      
      currentY += ch + 8;

      // --- 3. WAARSCHUWING TEKORT ---
      if (data.faalkans > 0) {
        doc.setFillColor(254, 242, 242); doc.setDrawColor(239, 68, 68); doc.setLineWidth(0.5);
        doc.rect(margin, currentY, contentWidth, 14, 'FD');
        doc.setFillColor(239, 68, 68); doc.rect(margin, currentY, 1.5, 14, 'F');
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(153, 27, 27); 
        doc.text('Waarschuwing: Mogelijke onttrekkingstekorten', margin + 6, currentY + 6);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(185, 28, 28); 
        doc.text(`In ${Math.round(data.faalkans * 100)}% van de scenario's is er onvoldoende saldo om alle gewenste opnames te doen.`, margin + 6, currentY + 11);
        currentY += 20;
      }

      // --- 4. GRAFIEKEN ---
      const canvases = document.querySelectorAll('canvas');
      const chartTitles = ["Verwacht Vermogensverloop", "Verdeling Scenario's (S-Curve)", "Opbouw van het Vermogen"];
      canvases.forEach((canvas, index) => {
        if (currentY > pageHeight - 90) { doc.addPage(); currentY = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(17, 24, 39);
        doc.text(chartTitles[index] || `Grafiek ${index + 1}`, margin, currentY);
        currentY += 6;
        const chartImg = canvas.toDataURL('image/png', 1.0);
        const imgHeight = (canvas.height / canvas.width) * contentWidth;
        doc.addImage(chartImg, 'PNG', margin, currentY, contentWidth, imgHeight);
        currentY += imgHeight + 12;
      });

      // --- 5. TABELLEN (Kosten & Bruto/Netto) ---
      doc.addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(17, 24, 39);
      doc.text('Kostenanalyse en Netto Opbrengst', margin, 20);

      autoTable(doc, {
        startY: 25,
        head: [['Kostensoort', '% / jaar', 'Totaal betaald']],
        body: [
          ['Bloei beheervergoeding', fmtPct(data.gemiddelde_beheerkosten_pct), fmtCurr(data.totale_beheerkosten_betaald)],
          ['Fondskosten (ETF\'s)', fmtPct(data.gemiddelde_fondskosten_pct), fmtCurr(data.totale_fondskosten_betaald)],
          ['Transactiekosten (spread)', fmtPct(data.gemiddelde_spreadkosten_pct), fmtCurr(data.totale_spreadkosten_betaald)],
          ['Totale kosten (cumulatief)', fmtPct(data.gemiddelde_totale_kosten_pct), fmtCurr(data.totale_kosten_betaald)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: 'bold' },
        bodyStyles: { textColor: [55, 65, 81] }
      });

      const finalYNaKosten = (doc as any).lastAutoTable.finalY;

      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(153, 27, 27);
      const splitText = doc.splitTextToSize(`Let op: Naast de direct betaalde kosten (${fmtCurr(data.totale_kosten_betaald)}) is er ook sprake van misgelopen rendement over de onttrokken kosten (${fmtCurr(data.misgelopen_rendement_op_kosten)}). De totale impact van kosten op het eindvermogen is ${fmtCurr(data.totale_kosten_impact)}.`, contentWidth);
      doc.text(splitText, margin, finalYNaKosten + 8);
      
      autoTable(doc, {
        startY: finalYNaKosten + 12 + (splitText.length * 4),
        head: [['Bruto vs Netto Opbrengst', 'Bedrag']],
        body: [
          ['Verwacht eindvermogen (zonder kosten)', fmtCurr(data.verwacht_eindvermogen_bruto)],
          ['Totale impact kosten (inclusief misgelopen rendement)', `-${fmtCurr(data.totale_kosten_impact)}`],
          ['Netto verwacht eindvermogen', fmtCurr(data.verwacht_eindvermogen_netto)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128] },
        bodyStyles: { textColor: [17, 24, 39], fontStyle: 'bold' }
      });

      // --- 6. JAARLIJKSE DATA REKENMACHINE (voor PDF tabel) ---
      const yearlyBody = [];
      let year = 1;
      for (let i = 1; i < data.tijdlijn_datums.length; i += 12) {
        const endIdx = Math.min(i + 11, data.tijdlijn_datums.length - 1);
        const startIdx = i - 1;
        const beginVermogen = data.tijdlijn_vermogen_p50_netto[startIdx];
        const eindVermogen = data.tijdlijn_vermogen_p50_netto[endIdx];

        let cashflowJaar = 0;
        for (let m = i; m <= endIdx; m++) { cashflowJaar += data.tijdlijn_cashflow_netto[m]; }
        const kostenJaar = data.tijdlijn_kosten_cumulatief[endIdx] - data.tijdlijn_kosten_cumulatief[startIdx];
        let rendementJaar = eindVermogen - beginVermogen - cashflowJaar + kostenJaar;

        if (eindVermogen === 0) {
          if (beginVermogen === 0) {
            cashflowJaar = 0; rendementJaar = 0; 
          } else if (rendementJaar > beginVermogen * 0.2) {
            rendementJaar = beginVermogen * (data.verwacht_rendement_pct / 100) * 0.5;
            cashflowJaar = eindVermogen - beginVermogen - rendementJaar + kostenJaar;
          }
        }

        yearlyBody.push([
          `Jaar ${year}`,
          fmtCurr(beginVermogen),
          `${cashflowJaar > 0 ? '+' : ''}${fmtCurr(cashflowJaar)}`,
          `${rendementJaar > 0 ? '+' : ''}${fmtCurr(rendementJaar)}`,
          `-${fmtCurr(kostenJaar)}`,
          fmtCurr(eindVermogen)
        ]);
        year++;
      }

      doc.addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(17, 24, 39);
      doc.text('Voorbeeldscenario jaarlijks overzicht', margin, 20);

      autoTable(doc, {
        startY: 25,
        head: [['Jaar', 'Beginvermogen', 'Netto Cashflow', 'Rendement', 'Kosten', 'Eindvermogen']],
        body: yearlyBody,
        theme: 'striped',
        headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255] },
        bodyStyles: { textColor: [55, 65, 81] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: function(d) {
          if (d.section === 'body' && d.column.index === 5) d.cell.styles.fontStyle = 'bold';
          if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = [220, 38, 38];
        }
      });

      // --- 7. DISCLAIMER ---
      const finalYTable = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(8); doc.setTextColor(156, 163, 175);
      const disclaimer = "Deze berekening is een indicatie en gaat uit van aannames betreffende verwachte rendementen en kosten. Hier kunnen geen rechten aan worden ontleend.";
      doc.text(disclaimer, margin, finalYTable > pageHeight - 30 ? (doc.addPage(), 20) : finalYTable + 15, { maxWidth: contentWidth });

      doc.save('Bloei_Vermogensrapportage.pdf');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};