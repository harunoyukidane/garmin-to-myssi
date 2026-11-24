import { Coordinates, LocationCandidate } from './model';
import { coordinates, distance } from './enrichment';

// Only geographic features useful for a dive; hotels and businesses are excluded.
export const geoNamesFeatures: Record<string, { kind: string; broad: boolean }> = {
  ISL: { kind: 'island', broad: true }, ISLS: { kind: 'islands', broad: true },
  ATOL: { kind: 'atoll', broad: true }, BAY: { kind: 'bay', broad: true },
  BAYS: { kind: 'bay', broad: true }, COVE: { kind: 'cove', broad: true },
  LGN: { kind: 'lagoon', broad: true }, RF: { kind: 'reef', broad: false },
  RFC: { kind: 'reef', broad: false }, BCH: { kind: 'beach', broad: false },
  BCHS: { kind: 'beach', broad: false }, PT: { kind: 'headland', broad: false },
  PTS: { kind: 'headland', broad: false }, RK: { kind: 'rock', broad: false },
  RKS: { kind: 'rocks', broad: false }
};
export function geoNamesCandidates(point: Coordinates, data: any): LocationCandidate[] {
  if (data?.status) throw new Error('GeoNames lookup unavailable. Check account access or quota.');
  if (!Array.isArray(data?.geonames)) throw new Error('Invalid GeoNames response.');
  const candidates: LocationCandidate[] = [];
  for (const row of data.geonames) {
    if (!row || typeof row !== 'object') continue;
    const feature = Object.prototype.hasOwnProperty.call(geoNamesFeatures, row.fcode) ? geoNamesFeatures[row.fcode] : undefined;
    if (!feature || typeof row.name !== 'string' || !row.name.trim()) continue;
    if (row.lat == null || row.lng == null || String(row.lat).trim() === '' || String(row.lng).trim() === '') continue;
    const position = coordinates(Number(row.lat), Number(row.lng));
    if (!position) continue;
    const meters = distance(point, position);
    if (meters > (feature.broad ? 15000 : 2000)) continue;
    candidates.push({ name: row.name.trim(), ...feature, distanceM: Math.round(meters) });
  }
  return candidates.sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name))
    .filter((c, i, all) => all.findIndex(v => v.name === c.name) === i);
}
