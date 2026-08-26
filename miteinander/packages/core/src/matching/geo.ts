import type { CoarseRegion, PreciseAddress } from '../domain/types';

const EARTH_RADIUS_KM = 6371;

/** Entfernung zwischen zwei groben Regionen (Haversine). */
export function distanceKm(a: CoarseRegion, b: CoarseRegion): number {
  const dLat = toRad(b.approxLat - a.approxLat);
  const dLon = toRad(b.approxLon - a.approxLon);
  const lat1 = toRad(a.approxLat);
  const lat2 = toRad(b.approxLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Entfernungen werden nie metergenau angezeigt. Aus einer exakten Zahl liesse
 * sich sonst per Triangulation die Wohnadresse rekonstruieren.
 */
export function coarseDistanceLabel(km: number): string {
  if (km < 2) return 'in Ihrer Nähe';
  if (km < 5) return 'etwa 5 km entfernt';
  if (km < 10) return 'etwa 10 km entfernt';
  if (km < 20) return 'etwa 20 km entfernt';
  if (km < 50) return 'etwa 50 km entfernt';
  return 'weiter entfernt';
}

/**
 * Rundet Koordinaten bewusst, bevor sie gespeichert werden. Zwei
 * Nachkommastellen entsprechen rund 1 km -- genug fuer Umkreissuche,
 * zu ungenau fuer eine Hausadresse.
 */
export function blurCoordinates(lat: number, lon: number): { approxLat: number; approxLon: number } {
  return {
    approxLat: Math.round(lat * 100) / 100,
    approxLon: Math.round(lon * 100) / 100,
  };
}

/** Aus einer exakten Adresse wird eine grobe Region. Der Rest bleibt getrennt gespeichert. */
export function toCoarseRegion(
  address: PreciseAddress,
  lat: number,
  lon: number,
): CoarseRegion {
  return {
    postalPrefix: address.postalCode.slice(0, 3),
    city: address.city,
    ...blurCoordinates(lat, lon),
  };
}
