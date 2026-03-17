import { Destination, TransportLeg, City } from '@/data/mockData';

interface TripData {
  from: City;
  fromAddress: string;
  destinations: Destination[];
  transportLegs: TransportLeg[];
  departureDate: string;
  adults: number;
  tripType: 'roundTrip' | 'oneWay';
}

/**
 * Format a JS Date to an iCalendar DTSTART/DTEND string (YYYYMMDDTHHMMSS)
 */
function formatICSDate(date: Date, time?: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (time) {
    const parts = time.split(':');
    const h = String(parts[0]).padStart(2, '0');
    const min = String(parts[1] || '00').padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00`;
  }
  return `${y}${m}${d}`;
}

/**
 * Format a JS Date as an all-day iCalendar value (YYYYMMDD)
 */
function formatICSAllDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Escape special characters for iCalendar text fields
 */
function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Generate a unique ID for each iCalendar event
 */
function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}@aiezzy.com`;
}

/**
 * Calculate departure date for a given leg index (same logic as route page)
 */
function calcDepartureDate(
  stopIdx: number,
  departureDate: string,
  destinations: Destination[],
  transportLegs: TransportLeg[]
): Date {
  const d = new Date(departureDate);
  for (let s = 0; s < stopIdx; s++) {
    // Add nights at destination s
    if (s > 0 && s - 1 < destinations.length) {
      d.setDate(d.getDate() + (destinations[s - 1]?.nights || 1));
    }
    // Add travel day for overnight transport
    const tLeg = s < transportLegs.length ? transportLegs[s] : null;
    if (tLeg) {
      const sel = tLeg.selectedFlight || tLeg.selectedTrain;
      if (sel) {
        const depH = parseInt(sel.departure?.split(':')[0] || '0');
        const arrH = parseInt(sel.arrival?.split(':')[0] || '0');
        const durMatch = sel.duration?.match(/(\d+)h/);
        const durHrs = durMatch ? parseInt(durMatch[1]) : 0;
        if ((sel as any).isNextDay || durHrs >= 12 || (arrH < depH && durHrs > 2)) {
          d.setDate(d.getDate() + 1);
        }
      }
    }
  }
  // Add nights at the current stop
  if (stopIdx > 0 && stopIdx - 1 < destinations.length) {
    d.setDate(d.getDate() + (destinations[stopIdx - 1]?.nights || 0));
  }
  return d;
}

/**
 * Parse duration string like "2h 30m" or "14h 5m" into minutes
 */
function parseDurationMinutes(duration: string): number {
  const hMatch = duration.match(/(\d+)\s*h/);
  const mMatch = duration.match(/(\d+)\s*m/);
  return (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0);
}

/**
 * Generate an .ics file string from trip data
 */
export function generateICS(trip: TripData): string {
  const events: string[] = [];
  const now = new Date();
  const timestamp = formatICSDate(now, `${now.getHours()}:${now.getMinutes()}`);

  // Build calendar name from trip cities
  const cityNames = trip.destinations.map(d => d.city.name).join(', ');
  const calName = `AIEzzy - ${trip.from.name} to ${cityNames}`;

  // Process transport legs for flight events
  trip.transportLegs.forEach((leg, i) => {
    if (!leg.selectedFlight && !leg.selectedTrain) return;

    const legDate = calcDepartureDate(i, trip.departureDate, trip.destinations, trip.transportLegs);
    const fromCity = i === 0 ? trip.from : trip.destinations[Math.min(i - 1, trip.destinations.length - 1)]?.city;
    const toCity = i < trip.destinations.length ? trip.destinations[i]?.city : trip.from;
    const fromName = fromCity?.name || 'Origin';
    const toName = toCity?.name || 'Destination';

    if (leg.selectedFlight) {
      const f = leg.selectedFlight;
      const depTime = f.departure || '00:00';
      const durMin = parseDurationMinutes(f.duration || '0h');
      const depDate = new Date(legDate);
      const [dh, dm] = depTime.split(':').map(Number);
      depDate.setHours(dh, dm, 0, 0);
      const arrDate = new Date(depDate.getTime() + durMin * 60 * 1000);

      const summary = escapeICS(`${f.airline} ${f.flightNumber} - ${fromName} to ${toName}`);
      const location = escapeICS(f.route || `${fromName} - ${toName}`);
      const description = escapeICS(
        `Flight: ${f.airline} ${f.flightNumber}\\n` +
        `Route: ${f.route || `${fromName} - ${toName}`}\\n` +
        `Duration: ${f.duration}\\n` +
        `Stops: ${f.stops}\\n` +
        `Price: INR ${f.pricePerAdult.toLocaleString()} per adult`
      );

      events.push(
        'BEGIN:VEVENT',
        `UID:${generateUID()}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART:${formatICSDate(depDate, `${depDate.getHours()}:${depDate.getMinutes()}`)}`,
        `DTEND:${formatICSDate(arrDate, `${arrDate.getHours()}:${arrDate.getMinutes()}`)}`,
        `SUMMARY:${summary}`,
        `LOCATION:${location}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    if (leg.selectedTrain) {
      const t = leg.selectedTrain;
      const depTime = t.departure || '00:00';
      const durMin = parseDurationMinutes(t.duration || '0h');
      const depDate = new Date(legDate);
      const [dh, dm] = depTime.split(':').map(Number);
      depDate.setHours(dh, dm, 0, 0);
      const arrDate = new Date(depDate.getTime() + durMin * 60 * 1000);

      const summary = escapeICS(`${t.operator}${t.trainNumber ? ` ${t.trainNumber}` : ''} - ${fromName} to ${toName}`);
      const location = escapeICS(`${t.fromStation || fromName} to ${t.toStation || toName}`);
      const description = escapeICS(
        `Train: ${t.operator}${t.trainName ? ` (${t.trainName})` : ''}\\n` +
        `From: ${t.fromStation || fromName}\\n` +
        `To: ${t.toStation || toName}\\n` +
        `Duration: ${t.duration}\\n` +
        `Price: INR ${t.price.toLocaleString()} per person`
      );

      events.push(
        'BEGIN:VEVENT',
        `UID:${generateUID()}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART:${formatICSDate(depDate, `${depDate.getHours()}:${depDate.getMinutes()}`)}`,
        `DTEND:${formatICSDate(arrDate, `${arrDate.getHours()}:${arrDate.getMinutes()}`)}`,
        `SUMMARY:${summary}`,
        `LOCATION:${location}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }
  });

  // Process destinations for hotel events
  trip.destinations.forEach((dest, i) => {
    if (!dest.selectedHotel) return;

    const h = dest.selectedHotel;
    // Check-in date = departure date of the leg arriving at this destination + travel time
    // Simplified: use the leg index (i) to get the arrival date at this destination
    const arrivalDate = calcDepartureDate(i, trip.departureDate, trip.destinations, trip.transportLegs);
    // The arrival date calculation already accounts for travel, but we need the date
    // when the traveler arrives (before adding this destination's nights).
    // calcDepartureDate(i+1) includes this dest's nights, so subtract to get check-in.
    // Actually, calcDepartureDate(i) gives the departure date of leg i.
    // The traveler arrives at dest i on the same day as leg i departure (or +1 for overnight).
    // For hotel, check-in = arrival at destination, check-out = check-in + nights.

    // We need to recalculate without adding the current destination's nights
    const checkIn = new Date(arrivalDate);
    // For the first destination, check-in = departure date (traveler arrives same day typically)
    // The calcDepartureDate for leg i already gives the travel date for leg i
    // The traveler checks into the hotel on arrival, which is the date of leg i departure
    // (unless overnight, which calcDepartureDate already handles for subsequent legs)

    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + dest.nights);

    const summary = escapeICS(`Hotel: ${h.name}`);
    const location = escapeICS(dest.city.name);
    const description = escapeICS(
      `Hotel: ${h.name}\\n` +
      `City: ${dest.city.name}\\n` +
      `Rating: ${h.rating}/5\\n` +
      `Price: INR ${h.pricePerNight.toLocaleString()}/night\\n` +
      `Nights: ${dest.nights}\\n` +
      `Total: INR ${(h.pricePerNight * dest.nights).toLocaleString()}`
    );

    events.push(
      'BEGIN:VEVENT',
      `UID:${generateUID()}`,
      `DTSTAMP:${timestamp}`,
      `DTSTART;VALUE=DATE:${formatICSAllDay(checkIn)}`,
      `DTEND;VALUE=DATE:${formatICSAllDay(checkOut)}`,
      `SUMMARY:${summary}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${description}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  });

  if (events.length === 0) return '';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AIEzzy//Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(calName)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return ics;
}

/**
 * Trigger a download of the .ics file
 */
export function downloadICS(icsContent: string, filename: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
