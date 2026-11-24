import { Decoder, Stream } from '@garmin/fitsdk';
import { GarminStats, ImportedDive } from '../model';

type Message = Record<string, unknown>;
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
function instant(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return undefined;
}
function index(value: unknown): number | undefined {
  const n = number(value); return n === undefined ? undefined : n & 0x0fff;
}
export function parseFit(bytes: Uint8Array): { dives: ImportedDive[]; errors: string[] } {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) throw new Error('Not a FIT file.');
  if (!decoder.checkIntegrity()) throw new Error('FIT file is truncated or failed its checksum. Export the original file again.');
  const decoded = decoder.read({ applyScaleAndOffset: true, convertDateTimesToDates: true, convertTypesToStrings: true, includeUnknownData: false });
  if (decoded.errors.length) throw new Error(`FIT decoding failed: ${decoded.errors.map(e => e.message).join('; ')}`);
  const messages = decoded.messages as unknown as Record<string, Message[] | undefined>;
  const sessions = messages.sessionMesgs || [], laps = messages.lapMesgs || [], summaries = messages.diveSummaryMesgs || [];
  const dives: ImportedDive[] = [], errors: string[] = [];
  const usedSessions = new Set<number>();
  function dive(summary: Message, parent: Message, label: string) {
    const startTime = instant(parent.startTime);
    if (!startTime) { errors.push(`${label}: missing valid start time.`); return; }
    const maxDepthM = number(summary.maxDepth) ?? number(parent.maxDepth);
    const durationSec = number(summary.bottomTime) ?? number(parent.totalTimerTime);
    if ((maxDepthM !== undefined && maxDepthM < 0) || (durationSec !== undefined && durationSec <= 0)) { errors.push(`${label}: invalid depth or duration.`); return; }
    const timestamp = instant(parent.timestamp);
    const end = timestamp && timestamp > startTime ? timestamp : new Date(Date.parse(startTime) + (number(parent.totalElapsedTime) ?? durationSec ?? 0) * 1000).toISOString();
    const records = (messages.recordMesgs || []).filter(r => {
      const t = instant(r.timestamp); return t && t >= startTime && end && t <= end;
    });
    const temperatures = records.filter(r => (number(r.depth) || 0) > 0).map(r => number(r.temperature)).filter((n): n is number => n !== undefined);
    const coordinate = (value: unknown, limit: number) => {
      const raw = number(value); if (raw === undefined) return undefined;
      const degrees = raw * 180 / 2147483648;
      return Math.abs(degrees) <= limit ? degrees : undefined;
    };
    // FIT coordinates use semicircles. Never treat an activity name as a dive-site name.
    const gpsRecord = records.find(r => coordinate(r.positionLat, 90) !== undefined && coordinate(r.positionLong, 180) !== undefined);
    const pair = (lat: unknown, lon: unknown) => {
      const latitude = coordinate(lat, 90), longitude = coordinate(lon, 180);
      return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
    };
    const entry = pair(parent.startPositionLat, parent.startPositionLong) ?? pair(gpsRecord?.positionLat, gpsRecord?.positionLong);
    const lastGps = [...records].reverse().find(r => pair(r.positionLat, r.positionLong));
    const exit = pair(parent.endPositionLat, parent.endPositionLong) ?? pair(lastGps?.positionLat, lastGps?.positionLong);
    const settings = messages.diveSettingsMesgs || [];
    const timedSettings = settings.filter(s => { const t = instant(s.timestamp); return t && t <= startTime; }).sort((a, b) => String(instant(a.timestamp)).localeCompare(String(instant(b.timestamp))));
    const waterType = (timedSettings[timedSettings.length - 1] ?? (settings.length === 1 ? settings[0] : undefined))?.waterType;
    const garminStats: GarminStats = {
      avgDepthM: number(summary.avgDepth) ?? number(parent.avgDepth),
      surfaceIntervalSec: number(summary.surfaceInterval) ?? number(parent.surfaceInterval),
      avgHeartRateBpm: number(parent.avgHeartRate), maxHeartRateBpm: number(parent.maxHeartRate),
      endCnsPercent: number(summary.endCns), oxygenToxicityOtu: number(summary.o2Toxicity),
      ...(entry ? { entryLatitude: entry.latitude, entryLongitude: entry.longitude, ...entry } : {}),
      ...(exit ? { exitLatitude: exit.latitude, exitLongitude: exit.longitude } : {}),
      ...(waterType === 'fresh' || waterType === 'salt' ? { waterType } : {})
    };
    // Preserve the lowest observed submerged temperature for the SSI water-temperature field.
    dives.push({ startTime, recordedStartTime: startTime, diveKind: /apnea/i.test(String(parent.subSport || '')) ? 'freedive' : /ccr/i.test(String(parent.subSport || '')) ? 'ccr' : 'scuba', maxDepthM, durationSec,
      waterTempC: temperatures.length ? temperatures.reduce((min, value) => Math.min(min, value), Infinity) : undefined,
      maxWaterTempC: temperatures.length ? temperatures.reduce((max, value) => Math.max(max, value), -Infinity) : undefined, garminStats });
  }
  // Lap summaries represent individual dives in activities containing multiple dives.
  for (const summary of summaries.filter(s => s.referenceMesg === 'lap' || s.referenceMesg === 19)) {
    const lapIndex = index(summary.referenceIndex);
    const lap = laps.find((l, i) => (index(l.messageIndex) ?? i) === lapIndex);
    if (!lap) { errors.push('Dive summary refers to an unavailable lap.'); continue; }
    const start = instant(lap.startTime);
    const owner = sessions.findIndex(s => {
      const first = instant(s.startTime), last = instant(s.timestamp); return start && first && last && start >= first && start <= last;
    });
    if (owner >= 0) usedSessions.add(owner);
    // Session GPS is safe to inherit only when this session contains one lap.
    const session = sessions[owner];
    const singleLap = session && (session.numLaps === 1 || (sessions.length === 1 && laps.length === 1));
    const gpsParent = (prefix: string) => {
      const lat = number(lap[`${prefix}PositionLat`]), lon = number(lap[`${prefix}PositionLong`]);
      return lat !== undefined && lon !== undefined && Math.abs(lat * 180 / 2147483648) <= 90 && Math.abs(lon * 180 / 2147483648) <= 180 ? lap : singleLap ? session : {};
    };
    const entryParent = gpsParent('start'), exitParent = gpsParent('end');
    dive(summary, { ...session, ...lap, startPositionLat: entryParent.startPositionLat, startPositionLong: entryParent.startPositionLong, endPositionLat: exitParent.endPositionLat, endPositionLong: exitParent.endPositionLong,
      avgHeartRate: lap.avgHeartRate, maxHeartRate: lap.maxHeartRate }, `Dive lap ${lapIndex}`);
  }
  sessions.forEach((session, i) => {
    if (usedSessions.has(i)) return;
    const sessionIndex = index(session.messageIndex) ?? i;
    const summary = summaries.find(s => (s.referenceMesg === 'session' || s.referenceMesg === 18) && index(s.referenceIndex) === sessionIndex);
    const isDiving = ['singleGasDiving', 'multiGasDiving', 'gaugeDiving', 'apneaDiving', 'apneaHunting', 'ccrDiving'].includes(String(session.subSport || '')) || session.sport === 'diving';
    if (!summary && !isDiving) return;
    if (/apnea/i.test(String(session.subSport || '')) && !summary) { errors.push('Apnea activity has no supported dive summaries; individual dives cannot be identified.'); return; }
    dive(summary || {}, session, `Dive session ${sessionIndex}`);
  });
  if (summaries.length && !dives.length && !errors.length) errors.push('Dive summaries do not reference supported session or lap records.');
  return { dives, errors };
}
