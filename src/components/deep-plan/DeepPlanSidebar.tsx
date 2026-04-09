'use client';

import { useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/currency';
import { CurrencyCode } from '@/lib/currency';
import WeatherBadge from '@/components/WeatherBadge';
import { City, Destination, TransportLeg } from '@/data/mockData';

/** Local info for destination countries */
const LOCAL_INFO: Record<string, { currency: string; timezone: string; emergency: string; language: string }> = {
  India: { currency: 'INR (₹)', timezone: 'IST +5:30', emergency: '112', language: 'Hindi / English' },
  France: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'French' },
  Germany: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'German' },
  Italy: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'Italian' },
  Spain: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'Spanish' },
  Netherlands: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'Dutch / English' },
  Belgium: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'Dutch / French' },
  Portugal: { currency: 'EUR (€)', timezone: 'WET +0', emergency: '112', language: 'Portuguese' },
  Austria: { currency: 'EUR (€)', timezone: 'CET +1', emergency: '112', language: 'German' },
  Greece: { currency: 'EUR (€)', timezone: 'EET +2', emergency: '112', language: 'Greek' },
  'Czech Republic': { currency: 'CZK (Kč)', timezone: 'CET +1', emergency: '112', language: 'Czech' },
  Czechia: { currency: 'CZK (Kč)', timezone: 'CET +1', emergency: '112', language: 'Czech' },
  Switzerland: { currency: 'CHF (Fr)', timezone: 'CET +1', emergency: '112', language: 'German / French / Italian' },
  'United Kingdom': { currency: 'GBP (£)', timezone: 'GMT +0', emergency: '999', language: 'English' },
  Thailand: { currency: 'THB (฿)', timezone: 'ICT +7', emergency: '191', language: 'Thai' },
  Japan: { currency: 'JPY (¥)', timezone: 'JST +9', emergency: '110', language: 'Japanese' },
  USA: { currency: 'USD ($)', timezone: 'EST/PST', emergency: '911', language: 'English' },
  'United States': { currency: 'USD ($)', timezone: 'EST/PST', emergency: '911', language: 'English' },
  Canada: { currency: 'CAD ($)', timezone: 'EST/PST', emergency: '911', language: 'English / French' },
  Australia: { currency: 'AUD ($)', timezone: 'AEST +10', emergency: '000', language: 'English' },
  'New Zealand': { currency: 'NZD ($)', timezone: 'NZST +12', emergency: '111', language: 'English' },
  Singapore: { currency: 'SGD ($)', timezone: 'SGT +8', emergency: '999', language: 'English / Malay / Chinese' },
  Malaysia: { currency: 'MYR (RM)', timezone: 'MYT +8', emergency: '999', language: 'Malay / English' },
  Indonesia: { currency: 'IDR (Rp)', timezone: 'WIB +7', emergency: '112', language: 'Indonesian' },
  Vietnam: { currency: 'VND (₫)', timezone: 'ICT +7', emergency: '113', language: 'Vietnamese' },
  'South Korea': { currency: 'KRW (₩)', timezone: 'KST +9', emergency: '112', language: 'Korean' },
  China: { currency: 'CNY (¥)', timezone: 'CST +8', emergency: '110', language: 'Mandarin' },
  Mexico: { currency: 'MXN ($)', timezone: 'CST -6', emergency: '911', language: 'Spanish' },
  Brazil: { currency: 'BRL (R$)', timezone: 'BRT -3', emergency: '190', language: 'Portuguese' },
  Argentina: { currency: 'ARS ($)', timezone: 'ART -3', emergency: '911', language: 'Spanish' },
  Colombia: { currency: 'COP ($)', timezone: 'COT -5', emergency: '123', language: 'Spanish' },
  Peru: { currency: 'PEN (S/)', timezone: 'PET -5', emergency: '105', language: 'Spanish' },
  Chile: { currency: 'CLP ($)', timezone: 'CLT -4', emergency: '131', language: 'Spanish' },
  'South Africa': { currency: 'ZAR (R)', timezone: 'SAST +2', emergency: '10111', language: 'English / Afrikaans / Zulu' },
  Egypt: { currency: 'EGP (E£)', timezone: 'EET +2', emergency: '122', language: 'Arabic' },
  Morocco: { currency: 'MAD (DH)', timezone: 'WET +0', emergency: '19', language: 'Arabic / French' },
  Turkey: { currency: 'TRY (₺)', timezone: 'TRT +3', emergency: '112', language: 'Turkish' },
  UAE: { currency: 'AED (د.إ)', timezone: 'GST +4', emergency: '999', language: 'Arabic / English' },
  'United Arab Emirates': { currency: 'AED (د.إ)', timezone: 'GST +4', emergency: '999', language: 'Arabic / English' },
  Philippines: { currency: 'PHP (₱)', timezone: 'PHT +8', emergency: '911', language: 'Filipino / English' },
  Cambodia: { currency: 'KHR (៛)', timezone: 'ICT +7', emergency: '117', language: 'Khmer' },
  Nepal: { currency: 'NPR (रू)', timezone: 'NPT +5:45', emergency: '100', language: 'Nepali' },
  'Sri Lanka': { currency: 'LKR (Rs)', timezone: 'IST +5:30', emergency: '119', language: 'Sinhala / Tamil' },
  Maldives: { currency: 'MVR (Rf)', timezone: 'MVT +5', emergency: '119', language: 'Dhivehi / English' },
  Sweden: { currency: 'SEK (kr)', timezone: 'CET +1', emergency: '112', language: 'Swedish' },
  Norway: { currency: 'NOK (kr)', timezone: 'CET +1', emergency: '112', language: 'Norwegian' },
  Denmark: { currency: 'DKK (kr)', timezone: 'CET +1', emergency: '112', language: 'Danish' },
  Poland: { currency: 'PLN (zł)', timezone: 'CET +1', emergency: '112', language: 'Polish' },
  Hungary: { currency: 'HUF (Ft)', timezone: 'CET +1', emergency: '112', language: 'Hungarian' },
};

/** Convert DD-MM-YYYY to YYYY-MM-DD for WeatherBadge */
function toIsoDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return ddmmyyyy;
}

interface DayData {
  day: number;
  date: string;
  city: string;
  stops: Array<{ type: string; name: string; mealType?: string; [key: string]: any }>;
  [key: string]: any;
}

interface SidebarProps {
  adjustedDays: DayData[];
  tripId: string | null;
  destinations: Destination[];
  transportLegs: TransportLeg[];
  from: City;
  bookingDocs: any[];
  totalNights: number;
  isLocalStay: boolean;
  flightCost: number;
  trainCost: number;
  hotelCost: number;
  attractionCost: number;
  foodCost: number;
  localTransportCost: number;
  totalDays: number;
  currency: CurrencyCode;
  setCurrency?: (c: CurrencyCode) => void;
  isReadOnly?: boolean;
  shareToken?: string;
}

export default memo(function DeepPlanSidebar({
  adjustedDays, tripId, destinations, transportLegs, from, bookingDocs,
  totalNights, isLocalStay,
  flightCost, trainCost, hotelCost, attractionCost, foodCost, localTransportCost,
  totalDays, currency, setCurrency, isReadOnly, shareToken,
}: SidebarProps) {
  const router = useRouter();

  const getLegCities = (legIdx: number) => {
    const fromCity = legIdx === 0 ? from : destinations[Math.min(legIdx - 1, destinations.length - 1)]?.city;
    const toCity = legIdx < destinations.length ? destinations[legIdx]?.city : from;
    return { fromCity, toCity };
  };

  const grandTotal = flightCost + trainCost + hotelCost + attractionCost + foodCost + localTransportCost;

  // Booking progress
  const { booked, total, pct, needAttention } = useMemo(() => {
    const docs = bookingDocs || [];
    const totalTransport = transportLegs.filter(l => l.selectedFlight || l.selectedTrain).length;
    const totalHotels = destinations.filter(d => d.nights > 0 && d.selectedHotel).length;
    const t = totalTransport + totalHotels;
    // Count items as "booked" only if they have an uploaded booking document
    const bookedTransport = transportLegs.filter((l, i) => {
      if (!l.selectedFlight && !l.selectedTrain) return false;
      const fromCity = i === 0 ? '' : (destinations[Math.min(i - 1, destinations.length - 1)]?.city?.parentCity || destinations[Math.min(i - 1, destinations.length - 1)]?.city?.name || '');
      const toCity = i < destinations.length ? (destinations[i]?.city?.parentCity || destinations[i]?.city?.name || '') : '';
      return docs.some((d: any) => d.docType === 'transport' && d.matchCities?.some((c: string) => c.toLowerCase().includes(fromCity.toLowerCase()) || c.toLowerCase().includes(toCity.toLowerCase())));
    }).length;
    const bookedHotels = destinations.filter(d => {
      if (d.nights <= 0 || !d.selectedHotel) return false;
      const cityKey = (d.city.parentCity || d.city.name).toLowerCase();
      return docs.some((doc: any) => doc.docType === 'hotel' && doc.matchCities?.some((c: string) => c.toLowerCase().includes(cityKey) || cityKey.includes(c.toLowerCase())));
    }).length;
    const b = bookedTransport + bookedHotels;
    return {
      booked: b, total: t,
      pct: t > 0 ? Math.round((b / t) * 100) : 0,
      needAttention: t - b,
    };
  }, [transportLegs, destinations, bookingDocs]);

  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (pct / 100) * circumference;

  const activityCount = adjustedDays.reduce((n, d) => n + d.stops.filter((s: any) => s.type === 'attraction' && !s.mealType && !s.name.startsWith('Free time') && !s.name.startsWith('Morning in')).length, 0);

  return (
    <aside className="hidden md:block md:w-[280px] md:flex-shrink-0 md:sticky md:top-16 space-y-4 print-hide md:max-h-[calc(100vh-80px)] md:overflow-y-auto md:pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
      {/* ═══ Trip Companion — hero utility card ═══ */}
      <div className="bg-gradient-to-br from-bg-surface to-bg-card/50 border border-border-subtle rounded-2xl shadow-md overflow-hidden">
        {/* Top section: stats grid */}
        <div className="px-4 pt-4 pb-3">
          <div className="grid grid-cols-4 gap-1 text-center">
            <div>
              <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{adjustedDays.length}</p>
              <p className="text-[9px] text-text-muted font-body mt-0.5">Days</p>
            </div>
            <div>
              <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{destinations.length}</p>
              <p className="text-[9px] text-text-muted font-body mt-0.5">Cities</p>
            </div>
            <div>
              <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{totalNights}</p>
              <p className="text-[9px] text-text-muted font-body mt-0.5">Nights</p>
            </div>
            <div>
              <p className="text-[18px] font-mono font-bold text-text-primary leading-none">{activityCount}</p>
              <p className="text-[9px] text-text-muted font-body mt-0.5">Activities</p>
            </div>
          </div>
        </div>

        {/* Booking progress bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted font-body">{booked}/{total} booked</span>
            {pct === 100 ? <span className="text-[10px] text-emerald-600 font-body font-medium">All set!</span> : needAttention > 0 ? <span className="text-[10px] text-amber-600 font-body">{needAttention} pending</span> : null}
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-emerald-400' : 'bg-accent-cyan'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Budget — total spend hero */}
        {grandTotal > 0 && (
          <div className="border-t border-border-subtle/60 px-4 py-3 bg-bg-surface/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-text-muted font-body">Est. Budget</span>
              {setCurrency && (
                <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
                  className="text-[10px] font-mono bg-transparent border border-border-subtle rounded px-1.5 py-0.5 text-text-muted cursor-pointer outline-none focus:border-accent-cyan">
                  {(['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB'] as CurrencyCode[]).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-accent-cyan font-mono font-bold text-[20px] leading-none mb-2">{formatPrice(grandTotal, currency)}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {flightCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Flights</span><span className="font-mono text-text-secondary">{formatPrice(flightCost, currency)}</span></div>}
              {trainCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Trains</span><span className="font-mono text-text-secondary">{formatPrice(trainCost, currency)}</span></div>}
              {hotelCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />Hotels</span><span className="font-mono text-text-secondary">{formatPrice(hotelCost, currency)}</span></div>}
              {attractionCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Attractions</span><span className="font-mono text-text-secondary">{formatPrice(attractionCost, currency)}</span></div>}
              {foodCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Food</span><span className="font-mono text-text-secondary">{formatPrice(foodCost, currency)}</span></div>}
              {localTransportCost > 0 && <div className="flex justify-between text-[10px]"><span className="text-text-muted font-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Transport</span><span className="font-mono text-text-secondary">{formatPrice(localTransportCost, currency)}</span></div>}
            </div>
          </div>
        )}
      </div>

      {/* Booking Warnings — softer amber */}
      {(destinations.some(d => d.nights > 0 && !d.selectedHotel) || (transportLegs.some(l => !l.selectedFlight && !l.selectedTrain) && !isLocalStay)) && (
        <div className="bg-amber-50/50 border border-amber-200/30 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="text-[11px] text-amber-700/80 font-body space-y-0.5">
              {destinations.some(d => d.nights > 0 && !d.selectedHotel) && <p>Some destinations need a hotel</p>}
              {transportLegs.some(l => !l.selectedFlight && !l.selectedTrain) && !isLocalStay && <p>Some transport legs are unselected</p>}
            </div>
          </div>
        </div>
      )}


      {/* Booking Checklist */}
      {(transportLegs.length > 0 || destinations.some(d => d.nights > 0)) && (
        <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 shadow-sm">
          <h3 className="font-display font-bold text-[14px] text-text-primary mb-3">Booking Checklist</h3>
          <div className="space-y-2 max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {transportLegs.map((leg, li) => {
              const { fromCity: fc, toCity: tc } = getLegCities(li);
              const fcName = fc?.parentCity || fc?.name || '?';
              const tcName = tc?.parentCity || tc?.name || '?';
              const isBooked = !!(leg.selectedFlight || leg.selectedTrain);
              const transportType = leg.selectedFlight ? 'Flight' : leg.selectedTrain ? 'Train' : leg.type === 'bus' ? 'Bus' : 'Transport';
              return (
                <div key={`cl-t-${li}`} className="flex items-center gap-2 text-[11px] font-body">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isBooked ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {isBooked ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    )}
                  </span>
                  <span className={`truncate ${isBooked ? 'text-text-secondary' : 'text-amber-700'}`}>
                    {transportType}: {fcName.length > 8 ? fcName.slice(0, 7) + '\u2026' : fcName} &rarr; {tcName.length > 8 ? tcName.slice(0, 7) + '\u2026' : tcName}
                  </span>
                </div>
              );
            })}
            {destinations.filter(d => d.nights > 0).map((dest, di) => {
              const isBooked = !!dest.selectedHotel;
              const cName = dest.city.parentCity || dest.city.name;
              return (
                <div key={`cl-h-${di}`} className="flex items-center gap-2 text-[11px] font-body">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isBooked ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {isBooked ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    )}
                  </span>
                  <span className={`truncate ${isBooked ? 'text-text-secondary' : 'text-amber-700'}`}>Hotel in {cName}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Destination Essentials — merged weather + local info */}
      {(() => {
        const firstDest = destinations[0];
        const country = firstDest?.city?.country || '';
        const info = LOCAL_INFO[country];
        return (
          <div className="bg-gradient-to-br from-bg-surface to-blue-50/30 border border-border-subtle rounded-xl p-4 shadow-sm">
            <h3 className="font-display font-bold text-[14px] text-text-primary mb-3 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Destination Essentials
            </h3>
            {/* Weather strip */}
            {adjustedDays.length > 0 && (
              <div className="grid grid-cols-5 gap-1.5 mb-3 pb-3 border-b border-border-subtle/50">
                {adjustedDays.slice(0, 5).map(d => {
                  const dIso = toIsoDate(d.date);
                  const dayLabel = (() => {
                    const parts = d.date.split('-');
                    if (parts.length !== 3) return '';
                    const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()] || '';
                  })();
                  return (
                    <div key={`wf-${d.day}`} className="flex flex-col items-center text-center">
                      <span className="text-[10px] font-body font-semibold text-text-primary">{dayLabel}</span>
                      <div className="my-1">{d.city ? <WeatherBadge city={d.city} date={dIso} shareToken={shareToken} /> : <span className="text-[10px] text-text-muted">--</span>}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Local info grid */}
            {info && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-2"><span className="text-[14px]">💱</span><div><p className="text-[10px] text-text-muted font-body">Currency</p><p className="text-[11px] text-text-primary font-body font-medium">{info.currency}</p></div></div>
                <div className="flex items-center gap-2"><span className="text-[14px]">🕐</span><div><p className="text-[10px] text-text-muted font-body">Timezone</p><p className="text-[11px] text-text-primary font-body font-medium">{info.timezone}</p></div></div>
                <div className="flex items-center gap-2"><span className="text-[14px]">🚨</span><div><p className="text-[10px] text-text-muted font-body">Emergency</p><p className="text-[11px] text-text-primary font-body font-medium">{info.emergency}</p></div></div>
                <div className="flex items-center gap-2"><span className="text-[14px]">🗣️</span><div><p className="text-[10px] text-text-muted font-body">Language</p><p className="text-[11px] text-text-primary font-body font-medium">{info.language}</p></div></div>
              </div>
            )}
          </div>
        );
      })()}
    </aside>
  );
});
