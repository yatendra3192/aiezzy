/**
 * Time utilities for itinerary calculations.
 * All times stored as "HH:MM" 24-hour format internally.
 * Minutes-since-midnight used for arithmetic.
 */

export function parseTime(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function formatTime24(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function timeStr12(timeStr: string): string {
  return formatTime12(parseTime(timeStr));
}

export function subtractMinutes(timeStr: string, mins: number): string {
  if (!timeStr) return '00:00';
  return formatTime24(parseTime(timeStr) - mins);
}

export function addMinutes(timeStr: string, mins: number): string {
  if (!timeStr) return '00:00';
  return formatTime24(parseTime(timeStr) + mins);
}

/** Parse duration strings like "9h 5m", "2 hr 38 min", "27 min", "4 days 8 hr" */
export function parseDurationMinutes(durStr: string): number {
  let total = 0;
  const dayMatch = durStr.match(/(\d+)\s*day/);
  const hourMatch = durStr.match(/(\d+)\s*h/);
  const minMatch = durStr.match(/(\d+)\s*m(?:in)?/);
  if (dayMatch) total += parseInt(dayMatch[1]) * 24 * 60;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total || 60; // fallback 1 hour
}

/** Check-in buffer times (minutes before departure you must arrive at terminal) */
export const BUFFER = {
  internationalFlight: 150,  // 2.5 hours
  domesticFlight: 90,        // 1.5 hours
  train: 30,                 // 30 min
  bus: 20,                   // 20 min
};

export function isInternational(fromCountry: string, toCountry: string): boolean {
  return fromCountry !== toCountry;
}

/** Get the buffer time for a transport type */
export function getBufferMinutes(
  type: 'flight' | 'train' | 'bus' | 'drive',
  fromCountry: string,
  toCountry: string
): number {
  if (type === 'flight') {
    return isInternational(fromCountry, toCountry) ? BUFFER.internationalFlight : BUFFER.domesticFlight;
  }
  if (type === 'train') return BUFFER.train;
  if (type === 'bus') return BUFFER.bus;
  return 0;
}

/** Calculate "leave by" time: departureTime - buffer - travelToTerminal */
export function calculateLeaveByTime(
  departureTime: string,
  bufferMinutes: number,
  travelToTerminalMinutes: number
): string {
  const depMins = parseTime(departureTime);
  const leaveMins = depMins - bufferMinutes - travelToTerminalMinutes;
  return formatTime24(leaveMins);
}

/** Format date from ISO "2026-05-22" plus day offset to "DD-MM-YYYY" */
export function addDaysToDate(isoDate: string, days: number): string {
  if (!isoDate) return '01-01-2026';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '01-01-2026';
  d.setDate(d.getDate() + days);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Check if minutes go past midnight (negative or > 1440) */
export function dayOffset(startMins: number, endMins: number): string {
  if (endMins < startMins) return ' +1 day';
  return '';
}
