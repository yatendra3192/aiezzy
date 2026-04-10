/**
 * Session-level store for uploaded booking documents.
 * Uses blob URLs (persist across SPA navigation, lost on page refresh).
 * Kept outside React state to avoid serialization/performance issues.
 */

interface BookingFile {
  name: string;
  url: string;       // blob URL from URL.createObjectURL()
  mimeType: string;
}

const store = {
  files: [] as BookingFile[],
  // Maps lowercase city name → array of file indices
  cityMap: {} as Record<string, number[]>,
};

export function setBookingFiles(files: BookingFile[]) {
  // Revoke old blob URLs to free memory
  store.files.forEach(f => { try { URL.revokeObjectURL(f.url); } catch {} });
  store.files = files;
}

export function setBookingCityMap(map: Record<string, number[]>) {
  store.cityMap = map;
}

/** Get booking files that match a city name (case-insensitive) */
export function getBookingFilesForCity(city: string): BookingFile[] {
  const key = city.toLowerCase();
  // Check exact match first, then partial
  const indices = store.cityMap[key]
    || Object.entries(store.cityMap)
        .filter(([k]) => k.includes(key) || key.includes(k))
        .flatMap(([, v]) => v);
  const unique = Array.from(new Set(indices));
  return unique.map(i => store.files[i]).filter(Boolean);
}

export function hasBookingFiles(): boolean {
  return store.files.length > 0;
}

export function clearBookingStore() {
  store.files.forEach(f => { try { URL.revokeObjectURL(f.url); } catch {} });
  store.files = [];
  store.cityMap = {};
}
