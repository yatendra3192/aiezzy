import jsPDF from 'jspdf';
import { Destination, TransportLeg } from '@/data/mockData';

interface TripPDFData {
  from: { name: string; parentCity?: string; fullName?: string };
  fromAddress: string;
  destinations: Destination[];
  transportLegs: TransportLeg[];
  departureDate: string;
  adults: number;
  children: number;
  infants: number;
  tripType: 'roundTrip' | 'oneWay';
  currency: string;
  formatPrice: (amount: number) => string;
}

// Colors
const CORAL = [232, 101, 74] as const;
const TEAL = [13, 148, 136] as const;
const DARK = [30, 30, 30] as const;
const GRAY = [120, 120, 120] as const;
const LIGHT_BG = [250, 247, 242] as const;
const WHITE = [255, 255, 255] as const;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Currency symbol map for PDF-safe ASCII rendering
const CURRENCY_ASCII: Record<string, string> = {
  INR: 'Rs.', USD: '$', EUR: 'EUR ', GBP: 'GBP ', JPY: 'JPY ',
  AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ', THB: 'THB ',
};

function pdfPrice(formatted: string, currency: string): string {
  // Replace Unicode currency symbols with ASCII equivalents
  const ascii = CURRENCY_ASCII[currency] || currency + ' ';
  // Strip common Unicode currency symbols and replace with ASCII
  return formatted
    .replace(/₹/g, 'Rs.')
    .replace(/€/g, 'EUR ')
    .replace(/£/g, 'GBP ')
    .replace(/¥/g, 'JPY ')
    .replace(/[^\x00-\x7F]/g, '') // Strip any remaining non-ASCII
    || `${ascii}${formatted.replace(/[^\d.,]/g, '')}`;
}

export function exportTripPDFFromData(data: TripPDFData, filename: string) {
  const fp = (amount: number): string => pdfPrice(data.formatPrice(amount), data.currency);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const margin = 15;

  // Truncate text to fit within maxWidth (mm)
  const truncate = (text: string, maxWidth: number, fontSize: number): string => {
    pdf.setFontSize(fontSize);
    if (pdf.getTextWidth(text) <= maxWidth) return text;
    let t = text;
    while (t.length > 3 && pdf.getTextWidth(t + '...') > maxWidth) t = t.slice(0, -1);
    return t + '...';
  };
  const contentW = W - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > H - 15) {
      pdf.addPage();
      y = margin;
      // Page footer line
      return true;
    }
    return false;
  };

  const drawLine = (yPos: number, color: readonly [number, number, number] = GRAY) => {
    pdf.setDrawColor(...color);
    pdf.setLineWidth(0.3);
    pdf.line(margin, yPos, W - margin, yPos);
  };

  // ═══════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════
  pdf.setFillColor(...CORAL);
  pdf.rect(0, 0, W, 28, 'F');

  pdf.setTextColor(...WHITE);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('AIEzzy Trip Plan', margin, 12);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const destNames = data.destinations.map(d => d.city.parentCity || d.city.name);
  const routeSummary = `${data.from.parentCity || data.from.name} >${destNames.join(' >')}${data.tripType === 'roundTrip' ? ` >${data.from.parentCity || data.from.name}` : ''}`;
  pdf.text(routeSummary, margin, 19);

  pdf.setFontSize(8);
  const travelers = `${data.adults} adult${data.adults > 1 ? 's' : ''}${data.children > 0 ? `, ${data.children} children` : ''}${data.infants > 0 ? `, ${data.infants} infants` : ''}`;
  pdf.text(`${fmtDate(data.departureDate)}  |  ${travelers}  |  ${data.tripType === 'roundTrip' ? 'Round Trip' : 'One Way'}`, margin, 25);

  y = 35;

  // ═══════════════════════════════════════════════════════════════════
  // TRIP OVERVIEW TABLE
  // ═══════════════════════════════════════════════════════════════════
  pdf.setTextColor(...DARK);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Trip Overview', margin, y);
  y += 7;

  const totalNights = data.destinations.reduce((s, d) => s + d.nights, 0);
  const flightCost = data.transportLegs.filter(l => l.selectedFlight).reduce((s, l) => s + l.selectedFlight!.pricePerAdult, 0) * data.adults;
  const trainCost = data.transportLegs.filter(l => l.selectedTrain).reduce((s, l) => s + l.selectedTrain!.price, 0) * data.adults;
  const hotelCost = data.destinations.filter(d => d.selectedHotel && d.nights > 0).reduce((s, d) => {
    const extras = d.additionalHotels || [];
    const extraNights = extras.reduce((es, h) => es + h.nights, 0);
    const primaryNights = d.nights - extraNights;
    return s + d.selectedHotel!.pricePerNight * Math.max(0, primaryNights) + extras.reduce((es, h) => es + h.hotel.pricePerNight * h.nights, 0);
  }, 0);
  const totalCost = flightCost + trainCost + hotelCost;

  // Overview stats
  pdf.setFillColor(245, 245, 240);
  pdf.roundedRect(margin, y, contentW, 14, 2, 2, 'F');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  const stats = [
    `${data.destinations.length} Cities`,
    `${totalNights} Nights`,
    `${data.transportLegs.filter(l => l.selectedFlight).length} Flights`,
    `${data.transportLegs.filter(l => l.selectedTrain).length} Trains`,
  ];
  const statX = margin + 5;
  pdf.setTextColor(...TEAL);
  stats.forEach((stat, i) => {
    pdf.text(stat, statX + i * 38, y + 6);
  });
  pdf.setTextColor(...CORAL);
  pdf.setFontSize(10);
  pdf.text(`Total: ${fp(totalCost)}`, W - margin - 5, y + 6, { align: 'right' });

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...GRAY);
  const breakdown = [];
  if (flightCost > 0) breakdown.push(`Flights: ${fp(flightCost)}`);
  if (trainCost > 0) breakdown.push(`Trains: ${fp(trainCost)}`);
  if (hotelCost > 0) breakdown.push(`Hotels: ${fp(hotelCost)}`);
  pdf.text(breakdown.join('  |  '), W - margin - 5, y + 11, { align: 'right' });

  y += 20;

  // ═══════════════════════════════════════════════════════════════════
  // ITINERARY — Day by Day
  // ═══════════════════════════════════════════════════════════════════
  pdf.setTextColor(...DARK);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Detailed Itinerary', margin, y);
  y += 3;
  drawLine(y);
  y += 5;

  let dayOffset = 0;

  // Starting point
  checkPage(10);
  pdf.setFillColor(...CORAL);
  pdf.circle(margin + 3, y + 1.5, 2.5, 'F');
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('1', margin + 1.8, y + 2.5);

  pdf.setTextColor(...DARK);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Departure: ${data.from.parentCity || data.from.name}`, margin + 9, y + 2.5);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...GRAY);
  if (data.fromAddress) pdf.text(data.fromAddress, margin + 9, y + 6);
  y += 10;

  for (let di = 0; di < data.destinations.length; di++) {
    const dest = data.destinations[di];
    const leg = data.transportLegs[di];
    const arrDate = addDays(data.departureDate, dayOffset);

    // ── Transport to this destination ──
    if (leg) {
      checkPage(20);
      // Transport line
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.line(margin + 3, y, margin + 3, y + 8);
      pdf.setLineDashPattern([], 0);

      const transportIcon = leg.selectedFlight ? 'FLIGHT' : leg.selectedTrain ? 'TRAIN' : leg.type.toUpperCase();
      pdf.setFillColor(240, 240, 235);
      pdf.roundedRect(margin + 9, y, contentW - 9, leg.selectedFlight || leg.selectedTrain ? 16 : 8, 1.5, 1.5, 'F');

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...TEAL);
      pdf.text(`${transportIcon}  |  ${leg.duration || '~'}`, margin + 12, y + 4);

      if (leg.selectedFlight) {
        const f = leg.selectedFlight;
        const maxNameW = contentW - 50; // Leave space for price on right
        pdf.setTextColor(...DARK);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(truncate(`${f.airline} ${f.flightNumber}`, maxNameW, 8), margin + 12, y + 9);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...GRAY);
        pdf.text(truncate(`${f.departure} > ${f.arrival}  |  ${f.duration}  |  ${f.stops}`, maxNameW, 7), margin + 12, y + 13);

        pdf.setTextColor(...CORAL);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${fp(f.pricePerAdult)} /pax`, W - margin - 5, y + 9, { align: 'right' });

        y += 19;
      } else if (leg.selectedTrain) {
        const t = leg.selectedTrain;
        const maxNameW = contentW - 50;
        pdf.setTextColor(...DARK);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(truncate(`${t.operator || t.trainName} ${t.trainNumber}`, maxNameW, 8), margin + 12, y + 9);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...GRAY);
        pdf.text(truncate(`${t.departure} > ${t.arrival}  |  ${t.duration}  |  ${t.fromStation} > ${t.toStation}`, maxNameW, 7), margin + 12, y + 13);

        pdf.setTextColor(...CORAL);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${fp(t.price)} /pax`, W - margin - 5, y + 9, { align: 'right' });

        y += 19;
      } else {
        y += 11;
      }
    }

    // ── Destination City ──
    checkPage(35);
    const stopNum = di + 2;
    pdf.setFillColor(...CORAL);
    pdf.circle(margin + 3, y + 1.5, 2.5, 'F');
    pdf.setTextColor(...WHITE);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(stopNum), stopNum > 9 ? margin + 1.3 : margin + 1.8, y + 2.5);

    pdf.setTextColor(...DARK);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(dest.city.parentCity || dest.city.name, margin + 9, y + 3);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...GRAY);
    pdf.text(`${arrDate}  |  ${dest.nights} night${dest.nights !== 1 ? 's' : ''}`, margin + 9, y + 7.5);

    // Country
    if (dest.city.country) {
      pdf.text(`${dest.city.country}`, W - margin - 5, y + 3, { align: 'right' });
    }

    y += 11;

    // Places
    if (dest.places && dest.places.length > 0) {
      const cityLower = dest.city.name.toLowerCase();
      const meaningful = dest.places.filter(p => p.name.toLowerCase() !== cityLower);
      if (meaningful.length > 0) {
        checkPage(5 + meaningful.length * 4);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...TEAL);
        pdf.text('Places to visit:', margin + 9, y);
        y += 4;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...DARK);
        dest.places.forEach(p => {
          pdf.text(`  •  ${p.name} (${p.nights}N)`, margin + 9, y);
          y += 3.5;
        });
        y += 1;
      }
    }

    // Hotel(s)
    if (dest.selectedHotel && dest.nights > 0) {
      checkPage(18);
      const extras = dest.additionalHotels || [];
      const extraNights = extras.reduce((s, h) => s + h.nights, 0);
      const primaryNights = Math.max(1, dest.nights - extraNights);
      const checkIn = new Date(data.departureDate);
      checkIn.setDate(checkIn.getDate() + dayOffset);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + primaryNights);
      const fmtD = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      // Primary hotel
      pdf.setFillColor(245, 245, 240);
      pdf.roundedRect(margin + 9, y, contentW - 9, 14, 1.5, 1.5, 'F');

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...DARK);
      pdf.text(dest.selectedHotel.name, margin + 12, y + 5);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...GRAY);
      const ratingStr = dest.selectedHotel.rating > 0 ? `Rating: ${dest.selectedHotel.rating}  |  ` : '';
      pdf.text(`${ratingStr}Check-in ${fmtD(checkIn)} >Check-out ${fmtD(checkOut)}  |  ${primaryNights}N`, margin + 12, y + 9.5);

      pdf.setTextColor(...CORAL);
      pdf.setFont('helvetica', 'bold');
      const hotelTotal = dest.selectedHotel.pricePerNight * primaryNights;
      pdf.text(`${fp(dest.selectedHotel.pricePerNight)}/night x${primaryNights} = ${fp(hotelTotal)}`, W - margin - 5, y + 5, { align: 'right' });

      y += 17;

      // Additional hotels
      for (const stay of extras) {
        checkPage(14);
        const addCheckIn = new Date(checkOut);
        const addCheckOut = new Date(addCheckIn);
        addCheckOut.setDate(addCheckOut.getDate() + stay.nights);

        pdf.setFillColor(245, 245, 240);
        pdf.roundedRect(margin + 9, y, contentW - 9, 14, 1.5, 1.5, 'F');

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...DARK);
        pdf.text(stay.hotel.name, margin + 12, y + 5);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...GRAY);
        pdf.text(`Check-in ${fmtD(addCheckIn)} >Check-out ${fmtD(addCheckOut)}  |  ${stay.nights}N`, margin + 12, y + 9.5);

        pdf.setTextColor(...CORAL);
        pdf.setFont('helvetica', 'bold');
        const addTotal = stay.hotel.pricePerNight * stay.nights;
        pdf.text(`${fp(stay.hotel.pricePerNight)}/night x${stay.nights} = ${fp(addTotal)}`, W - margin - 5, y + 5, { align: 'right' });

        y += 17;
        checkOut.setDate(checkOut.getDate() + stay.nights);
      }
    } else if (dest.nights === 0) {
      pdf.setFontSize(7);
      pdf.setTextColor(...GRAY);
      pdf.setFont('helvetica', 'italic');
      pdf.text('Pass through (0 nights)', margin + 9, y);
      y += 5;
    }

    dayOffset += dest.nights > 0 ? dest.nights : 0;
    // Add travel day
    dayOffset++;

    y += 2;
  }

  // ── Return leg (round trip) ──
  if (data.tripType === 'roundTrip' && data.transportLegs.length > data.destinations.length) {
    const returnLeg = data.transportLegs[data.transportLegs.length - 1];
    if (returnLeg) {
      checkPage(25);

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.line(margin + 3, y, margin + 3, y + 8);
      pdf.setLineDashPattern([], 0);

      const transportIcon = returnLeg.selectedFlight ? 'FLIGHT' : returnLeg.selectedTrain ? 'TRAIN' : 'DRIVE';
      pdf.setFillColor(240, 240, 235);
      pdf.roundedRect(margin + 9, y, contentW - 9, returnLeg.selectedFlight || returnLeg.selectedTrain ? 16 : 8, 1.5, 1.5, 'F');

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...TEAL);
      pdf.text(`RETURN ${transportIcon}  |  ${returnLeg.duration || '~'}`, margin + 12, y + 4);

      if (returnLeg.selectedFlight) {
        const f = returnLeg.selectedFlight;
        const maxNameW = contentW - 50;
        pdf.setTextColor(...DARK);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(truncate(`${f.airline} ${f.flightNumber}`, maxNameW, 8), margin + 12, y + 9);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...GRAY);
        pdf.text(truncate(`${f.departure} > ${f.arrival}  |  ${f.duration}  |  ${f.stops}`, maxNameW, 7), margin + 12, y + 13);
        pdf.setTextColor(...CORAL);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${fp(f.pricePerAdult)} /pax`, W - margin - 5, y + 9, { align: 'right' });
        y += 19;
      } else if (returnLeg.selectedTrain) {
        const t = returnLeg.selectedTrain;
        const maxNameW = contentW - 50;
        pdf.setTextColor(...DARK);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(truncate(`${t.operator || t.trainName} ${t.trainNumber}`, maxNameW, 8), margin + 12, y + 9);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...GRAY);
        pdf.text(truncate(`${t.departure} > ${t.arrival}  |  ${t.duration}`, maxNameW, 7), margin + 12, y + 13);
        pdf.setTextColor(...CORAL);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${fp(t.price)} /pax`, W - margin - 5, y + 9, { align: 'right' });
        y += 19;
      } else {
        y += 11;
      }

      // Home arrival
      const homeNum = data.destinations.length + 2;
      pdf.setFillColor(...CORAL);
      pdf.circle(margin + 3, y + 1.5, 2.5, 'F');
      pdf.setTextColor(...WHITE);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      pdf.text(String(homeNum), homeNum > 9 ? margin + 1.3 : margin + 1.8, y + 2.5);

      pdf.setTextColor(...DARK);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Return: ${data.from.parentCity || data.from.name}`, margin + 9, y + 3);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...GRAY);
      pdf.text(addDays(data.departureDate, dayOffset), margin + 9, y + 7);

      y += 12;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // COST BREAKDOWN TABLE
  // ═══════════════════════════════════════════════════════════════════
  checkPage(40);
  y += 5;
  pdf.setTextColor(...DARK);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Cost Breakdown', margin, y);
  y += 3;
  drawLine(y);
  y += 5;

  // Table header
  pdf.setFillColor(240, 240, 235);
  pdf.rect(margin, y, contentW, 6, 'F');
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...DARK);
  // Column positions — right-align Per Pax and Total to prevent overlap
  const col1 = margin + 3;         // Item
  const col2 = margin + 55;        // Details
  const col3 = W - margin - 38;    // Per Pax (right-aligned)
  const col4 = W - margin - 5;     // Total (right-aligned)
  const col2MaxW = col3 - col2 - 5; // Max width for details column

  pdf.text('Item', col1, y + 4);
  pdf.text('Details', col2, y + 4);
  pdf.text('Per Pax', col3, y + 4, { align: 'right' });
  pdf.text('Total', col4, y + 4, { align: 'right' });
  y += 8;

  // Flight rows
  data.transportLegs.forEach((leg, i) => {
    if (!leg.selectedFlight) return;
    checkPage(7);
    const f = leg.selectedFlight;
    const fromC = i === 0 ? (data.from.parentCity || data.from.name) : (data.destinations[Math.min(i - 1, data.destinations.length - 1)]?.city?.name || '');
    const toC = i < data.destinations.length ? (data.destinations[i]?.city?.name || '') : (data.from.parentCity || data.from.name);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...DARK);
    pdf.text(truncate(`Flight: ${fromC} > ${toC}`, col2 - col1 - 3, 7), col1, y + 3);
    pdf.setTextColor(...GRAY);
    pdf.text(truncate(`${f.airline} ${f.flightNumber}`, col2MaxW, 7), col2, y + 3);
    pdf.text(fp(f.pricePerAdult), col3, y + 3, { align: 'right' });
    pdf.setTextColor(...DARK);
    pdf.setFont('helvetica', 'bold');
    pdf.text(fp(f.pricePerAdult * data.adults), col4, y + 3, { align: 'right' });
    y += 6;
    drawLine(y - 1, [230, 230, 225]);
  });

  // Train rows
  data.transportLegs.forEach((leg, i) => {
    if (!leg.selectedTrain) return;
    checkPage(7);
    const t = leg.selectedTrain;
    const fromC = i === 0 ? (data.from.parentCity || data.from.name) : (data.destinations[Math.min(i - 1, data.destinations.length - 1)]?.city?.name || '');
    const toC = i < data.destinations.length ? (data.destinations[i]?.city?.name || '') : (data.from.parentCity || data.from.name);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...DARK);
    pdf.text(truncate(`Train: ${fromC} > ${toC}`, col2 - col1 - 3, 7), col1, y + 3);
    pdf.setTextColor(...GRAY);
    pdf.text(truncate(`${t.operator || t.trainName}`, col2MaxW, 7), col2, y + 3);
    pdf.text(fp(t.price), col3, y + 3, { align: 'right' });
    pdf.setTextColor(...DARK);
    pdf.setFont('helvetica', 'bold');
    pdf.text(fp(t.price * data.adults), col4, y + 3, { align: 'right' });
    y += 6;
    drawLine(y - 1, [230, 230, 225]);
  });

  // Hotel rows
  data.destinations.forEach(dest => {
    if (!dest.selectedHotel || dest.nights <= 0) return;
    checkPage(7);
    const extras = dest.additionalHotels || [];
    const extraNights = extras.reduce((s, h) => s + h.nights, 0);
    const primaryNights = Math.max(1, dest.nights - extraNights);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...DARK);
    pdf.text(truncate(`Hotel: ${dest.city.name}`, col2 - col1 - 3, 7), col1, y + 3);
    pdf.setTextColor(...GRAY);
    pdf.text(truncate(`${dest.selectedHotel.name} (${primaryNights}N)`, col2MaxW, 7), col2, y + 3);
    pdf.text(`${fp(dest.selectedHotel.pricePerNight)}/n`, col3, y + 3, { align: 'right' });
    pdf.setTextColor(...DARK);
    pdf.setFont('helvetica', 'bold');
    pdf.text(fp(dest.selectedHotel.pricePerNight * primaryNights), col4, y + 3, { align: 'right' });
    y += 6;
    drawLine(y - 1, [230, 230, 225]);

    // Additional hotels
    extras.forEach(stay => {
      checkPage(7);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...DARK);
      pdf.text(truncate(`Hotel: ${dest.city.name}`, col2 - col1 - 3, 7), col1, y + 3);
      pdf.setTextColor(...GRAY);
      pdf.text(truncate(`${stay.hotel.name} (${stay.nights}N)`, col2MaxW, 7), col2, y + 3);
      pdf.text(`${fp(stay.hotel.pricePerNight)}/n`, col3, y + 3, { align: 'right' });
      pdf.setTextColor(...DARK);
      pdf.setFont('helvetica', 'bold');
      pdf.text(fp(stay.hotel.pricePerNight * stay.nights), col4, y + 3, { align: 'right' });
      y += 6;
      drawLine(y - 1, [230, 230, 225]);
    });
  });

  // Total row
  y += 2;
  pdf.setFillColor(...CORAL);
  pdf.rect(margin, y, contentW, 8, 'F');
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ESTIMATED TOTAL', margin + 3, y + 5.5);
  pdf.text(fp(totalCost), W - margin - 5, y + 5.5, { align: 'right' });

  y += 14;

  // ═══════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════
  checkPage(10);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...GRAY);
  pdf.text('Prices are estimates and may vary at booking. Generated by AIEzzy (aiezzy.com)', margin, y);
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, W - margin - 5, y, { align: 'right' });

  pdf.save(filename);
}

// Keep legacy export for backward compat
export async function exportTripPDF(elementId: string, filename: string) {
  const html2canvas = (await import('html2canvas')).default;
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#FAF7F2' });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 10;
  pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - 20;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;
  }
  pdf.save(filename);
}
