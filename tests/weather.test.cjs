const { test } = require('node:test');
const assert = require('node:assert/strict');
const { coordinates, diveCoordinates, lookupCoordinates, locationCandidates, clearLocation, weatherTemperature, enrichTrip, applyEnrichment } = require('../shared/enrichment.ts');
const { diveLocalTime, diveInstant, diveOffset } = require('../shared/diveTime.ts');
const { tripDives, mergeDives, correctDive, effective } = require('../shared/domain.ts');
const { ssiPayload } = require('../shared/ssiQr.ts');
const { parseCsv, suggestMapping } = require('../shared/parsers/csv.ts');
const at = '2026-05-23T00:15:00.000Z';
const config = { tripStartDate: '2026-05-23', tripEndDate: '2026-05-24', utcOffsetMinutes: 0 };
function trip(records) {
  return mergeDives({ id: 't', config, dives: [], files: [], audit: [], createdAt: at, updatedAt: at }, records.map((r, i) => ({ startTime: at, durationSec: 1800, maxDepthM: 20, sourceId: String(i), ...r })), 'f', { accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] }, true);
}
const site = (name, lat = 1, lon = 104, tags = {}) => ({ lat, lon, tags: { name, sport: 'scuba_diving', ...tags } });

test('single-lap FIT retains session-only exit GPS and records when end timestamp equals start', () => {
  const { Encoder } = require('@garmin/fitsdk');
  const { parseFit } = require('../shared/parsers/fit.ts');
  const e = new Encoder(), start = new Date(at);
  const semicircle = n => Math.round(n * 2147483648 / 180);
  e.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 1, timeCreated: start });
  e.writeMesg({ mesgNum: 18, messageIndex: 0, sport: 'diving', subSport: 'singleGasDiving', startTime: start, timestamp: start, numLaps: 1, totalElapsedTime: 1800, endPositionLat: semicircle(2.81), endPositionLong: semicircle(104.13) });
  e.writeMesg({ mesgNum: 19, messageIndex: 0, startTime: start, timestamp: start, totalElapsedTime: 1800 });
  e.writeMesg({ mesgNum: 268, referenceMesg: 'lap', referenceIndex: 0, timestamp: start, bottomTime: 1700, maxDepth: 20 });
  e.writeMesg({ mesgNum: 20, timestamp: new Date(Date.parse(at) + 60000), depth: 10, temperature: 26 });
  const d = parseFit(e.close()).dives[0];
  assert.ok(Math.abs(d.garminStats.exitLatitude - 2.81) < 0.000001);
  assert.ok(Math.abs(d.garminStats.exitLongitude - 104.13) < 0.000001);
  assert.equal(d.garminStats.entryLatitude, undefined);
  assert.equal(d.waterTempC, 26);
});

test('destination time zone supplies local date before lookup and GPS zone takes priority', () => {
  const d = trip([{}]).dives[0];
  const c = { ...config, destinationTimeZone: 'Indian/Maldives' };
  assert.equal(diveOffset(d, c), 300);
  assert.equal(diveOffset({ ...d, enrichment: { timeZone: 'Asia/Kuala_Lumpur' } }, c), 480);
});

test('coordinates select complete valid entry, exit, then legacy pairs without mixing fields', () => {
  assert.equal(coordinates(NaN, 10), undefined); assert.equal(coordinates(91, 10), undefined);
  assert.deepEqual(coordinates(0, 0), { latitude: 0, longitude: 0 });
  const stats = { entryLatitude: 1, entryLongitude: 2, exitLatitude: 3, exitLongitude: 4, latitude: 5, longitude: 6 };
  assert.deepEqual(diveCoordinates(stats), { latitude: 1, longitude: 2 });
  assert.deepEqual(diveCoordinates({ ...stats, entryLongitude: 999 }), { latitude: 3, longitude: 4 });
  assert.deepEqual(diveCoordinates({ ...stats, entryLongitude: undefined, exitLatitude: undefined }), { latitude: 5, longitude: 6 });
});

test('nearest-in-time GPS fallback is independent of array order', () => {
  const t = trip([{ startTime: '2026-05-23T01:00:00Z', garminStats: { latitude: 1, longitude: 2 } }, { startTime: '2026-05-23T04:00:00Z', garminStats: { latitude: 3, longitude: 4 } }, { startTime: '2026-05-23T03:40:00Z' }]);
  assert.deepEqual(lookupCoordinates(t.dives[2], t), { point: { latitude: 3, longitude: 4 }, fallback: true });
});

test('OSM excludes shops and distant sites, ranks boundaries, and leaves ambiguous matches for selection', () => {
  const point = { latitude: 1, longitude: 104 };
  assert.deepEqual(locationCandidates(point, [site('Dive Shop', 1, 104, { shop: 'scuba_diving' }), site('Far site', 1.02, 104)]), []);
  const nearby = locationCandidates(point, [site('One', 1, 104.0001), site('Two', 1, 104.0002)]);
  assert.equal(nearby.length, 2); assert.equal(clearLocation(nearby), undefined);
  const polygon = { tags: { name: 'Reef boundary', natural: 'reef' }, center: { lat: 2, lon: 104 }, geometry: [{ lat: 0.99, lon: 103.99 }, { lat: 1.01, lon: 103.99 }, { lat: 1.01, lon: 104.01 }, { lat: 0.99, lon: 104.01 }, { lat: 0.99, lon: 103.99 }] };
  assert.equal(locationCandidates(point, [polygon])[0].distanceM, 0);
  assert.equal(clearLocation(locationCandidates(point, [polygon])), 'Reef boundary');
  assert.equal(locationCandidates(point, [site('Exact'), { lat: 1, lon: 104.01, tags: { name: 'Island', place: 'island' } }], true)[0].name, 'Island');
});

test('geographic time zones handle midnight, DST, offsets and explicit corrections consistently in QR', () => {
  const d = { startTime: '2026-03-08T06:30:00Z', enrichment: { timeZone: 'America/New_York' } };
  assert.equal(diveLocalTime(d, config), '2026-03-08 01:30:00');
  assert.equal(diveLocalTime({ ...d, startTime: '2026-03-08T07:30:00Z' }, config), '2026-03-08 03:30:00');
  assert.equal(diveOffset(d, config), -300);
  assert.equal(diveOffset({ ...d, startTime: '2026-07-01T06:30:00Z' }, config), -240);
  assert.equal(diveLocalTime({ ...d, timeZoneOverride: 'Asia/Singapore' }, config), '2026-03-08 14:30:00');
  const t = trip([{ startTime: '2026-05-22T18:00:00Z', enrichment: { timeZone: 'Asia/Singapore' } }]);
  assert.equal(tripDives(t).length, 1);
  assert.match(ssiPayload(tripDives(t)[0], config), /datetime:202605230200/);
});

test('CSV naive timestamps retain their wall clock and explicit offsets never convert twice', () => {
  const text = 'startTime,entryLatitude,entryLongitude,exitLatitude,exitLongitude\n2026-05-23 08:15,1,104,2,105\n2026-05-23T08:15+08:00,1,104,2,105';
  const parsed = parseCsv(text, suggestMapping(text.split('\n')[0].split(',')), 0);
  assert.deepEqual(parsed.errors, []);
  const [naive, explicit] = parsed.dives.map(d => ({ ...d, enrichment: { timeZone: 'Asia/Singapore' } }));
  assert.equal(diveInstant(naive, config), at); assert.equal(diveLocalTime(naive, config), '2026-05-23 08:15:00');
  assert.equal(diveInstant(explicit, config), at); assert.equal(explicit.sourceLocalTime, undefined);
  assert.equal(naive.recordedStartTime, '2026-05-23 08:15');
  assert.equal(naive.garminStats.exitLongitude, 105);
  assert.equal(naive.startTime, '2026-05-23T08:15:00.000Z');
});

test('historical temperatures select the containing UTC hour and reject missing units, null, or today substitution', () => {
  const hour = Date.parse('2026-05-23T00:00:00Z') / 1000;
  const data = { hourly_units: { temperature_2m: '\u00b0C' }, hourly: { time: [hour, hour + 3600], temperature_2m: [0, 25] } };
  assert.deepEqual(weatherTemperature(data, at), { airTempC: 0, weatherHour: '2026-05-23T00:00:00.000Z' });
  assert.equal(weatherTemperature(data, '2026-05-24T00:15:00Z'), undefined);
  data.hourly.temperature_2m[0] = null; assert.equal(weatherTemperature(data, at), undefined);
});

test('enrichment batches shared points/hours, preserves manual corrections and water, and uses broad missing-GPS names', async () => {
  let t = trip([{ garminStats: { entryLatitude: 1, entryLongitude: 104 }, waterTempC: 23 }, { startTime: '2026-05-23T00:20:00Z' }]);
  const id = t.dives[0].id;
  t = correctDive(t, id, 'locationName', 'My location'); t.dives[0].ssiAirTempC = 31; t.dives[0].airTempManual = true;
  let weatherCalls = 0, zoneCalls = 0, locationCalls = 0;
  const providers = {
    destination: async () => undefined,
    locations: async points => { locationCalls++; assert.equal(points.length, 1); return [site('Exact site'), { lat: 1, lon: 104, tags: { name: 'Broad island', place: 'island' } }]; },
    zone: async () => { zoneCalls++; return 'Asia/Singapore'; },
    weather: async (p, date) => { weatherCalls++; assert.equal(date, '2026-05-23'); return { hourly_units: { temperature_2m: '\u00b0C' }, hourly: { time: [Date.parse('2026-05-23T00:00Z') / 1000], temperature_2m: [27] } }; }
  };
  const enriched = applyEnrichment(t, await enrichTrip(t, providers));
  assert.equal(locationCalls, 1); assert.equal(zoneCalls, 1); assert.equal(weatherCalls, 1);
  assert.equal(effective(enriched.dives[0]).locationName, 'My location');
  assert.equal(enriched.dives[0].ssiAirTempC, 31); assert.equal(enriched.dives[0].waterTempC, 23);
  assert.equal(enriched.dives[0].enrichment.airTempC, 27);
  assert.equal(enriched.dives[1].enrichment.locationName, 'Broad island');
  assert.equal(enriched.dives[1].enrichment.fallback, true);
});

test('provider failures keep dives usable and destination fallback is only used without any GPS', async () => {
  const t = trip([{}]); t.config = { ...config, destination: 'Island' };
  let destinationCalls = 0;
  const providers = { destination: async () => { destinationCalls++; return { latitude: 1, longitude: 104 }; }, locations: async () => { throw Error('offline'); }, zone: async () => { throw Error('offline'); }, weather: async () => { throw Error('offline'); } };
  const next = applyEnrichment(t, await enrichTrip(t, providers));
  assert.equal(destinationCalls, 1); assert.equal(next.dives[0].enrichment.airTempC, undefined);
  assert.equal(next.dives[0].enrichment.errors.length, 3);
  assert.equal(tripDives(next).length, 1);
  t.dives[0].garminStats = { latitude: 1, longitude: 104 };
  await enrichTrip(t, providers); assert.equal(destinationCalls, 1);
});

function nativeProviders() {
  const Module = require('node:module'), originalLoad = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'expo-secure-store') return { getItemAsync: async () => null };
    return originalLoad.call(this, name, ...args);
  };
  try { return require('../src/services/enrichment.ts').providers; }
  finally { Module._load = originalLoad; }
}

test('weather service requests historical dates with UTC epoch hours and uses no phone-location API', async () => {
  const original = global.fetch;
  const providers = nativeProviders();
  const urls = [];
  global.fetch = async url => { urls.push(url); return Response.json({ timezone: 'Asia/Singapore', hourly_units: { temperature_2m: '\u00b0C' }, hourly: { time: [], temperature_2m: [] } }); };
  try {
    await providers.weather({ latitude: 1.23, longitude: 104.56 }, '2020-01-02');
    assert.match(urls[0], /^https:\/\/archive-api.open-meteo.com/);
    assert.match(urls[0], /start_date=2020-01-02&end_date=2020-01-02/);
    assert.match(urls[0], /timezone=GMT&timeformat=unixtime/);
    assert.doesNotMatch(urls[0], /current=/);
  } finally { global.fetch = original; }
});

test('location lookup identifies the app and falls back after an upstream server error', async () => {
  const original = global.fetch, calls = [];
  const providers = nativeProviders();
  global.fetch = async (url, init) => {
    calls.push(url);
    assert.match(init.headers['User-Agent'], /DiveLogTransfer/);
    return calls.length === 1 ? new Response('', { status: 502 }) : Response.json({ elements: [site('Coral reef')] });
  };
  try {
    const result = await providers.locations([{ latitude: 1, longitude: 104 }]);
    assert.equal(result[0].tags.name, 'Coral reef');
    assert.match(calls[0], /overpass-api.de/);
    assert.match(calls[1], /overpass.private.coffee/);
  } finally { global.fetch = original; }
});


test('FIT entry and exit pairs survive independently, including an invalid entry', () => {
  const { Encoder } = require('@garmin/fitsdk');
  const { parseFit } = require('../shared/parsers/fit.ts');
  const e = new Encoder();
  const semicircle = value => Math.round(value * 2147483648 / 180);
  e.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 1, timeCreated: new Date(at) });
  e.writeMesg({ mesgNum: 18, messageIndex: 0, sport: 'diving', subSport: 'singleGasDiving', startTime: new Date(at), timestamp: new Date(Date.parse(at) + 1800000), maxDepth: 20, totalTimerTime: 1800, startPositionLat: semicircle(1), startPositionLong: semicircle(104), endPositionLat: semicircle(2), endPositionLong: semicircle(105) });
  const d = parseFit(e.close()).dives[0];
  assert.ok(Math.abs(d.garminStats.entryLatitude - 1) < 0.000001);
  assert.ok(Math.abs(d.garminStats.exitLatitude - 2) < 0.000001);
  assert.ok(Math.abs(d.garminStats.exitLongitude - 105) < 0.000001);
  assert.ok(Math.abs(diveCoordinates({ ...d.garminStats, entryLatitude: 100 }).latitude - 2) < 0.000001);
});

test('manual temperature precedence and omission survive enrichment persistence', () => {
  const { ssiAirTemperature } = require('../shared/ssiQr.ts');
  const { decodeStore } = require('../shared/repository.ts');
  let t = trip([{ enrichment: { airTempC: 25, timeZone: 'Asia/Singapore', coordinates: { latitude: 1, longitude: 104 }, weatherHour: '2026-05-23T00:00:00Z' } }]);
  t.files = [{ id: 'f', name: 'source.fit', uri: 'file:///source.fit', fingerprint: 'hash', importedAt: at }];
  t.ssiAirTempC = 30;
  assert.equal(ssiAirTemperature(t.dives[0], t), 30);
  t.dives[0].ssiAirTempC = 0; t.dives[0].airTempManual = true;
  assert.equal(ssiAirTemperature(t.dives[0], t), 0);
  t.dives[0].ssiAirTempC = undefined;
  t = decodeStore(JSON.stringify({ schemaVersion: 2, trips: [t] })).trips[0];
  assert.equal(ssiAirTemperature(t.dives[0], t), undefined);
  t.dives[0].airTempManual = false; delete t.ssiAirTempC;
  assert.equal(ssiAirTemperature(t.dives[0], t), 25);
  const invalid = structuredClone(t); invalid.dives[0].enrichment.timeZone = 'Invalid/Zone';
  assert.throws(() => decodeStore(JSON.stringify({ schemaVersion: 2, trips: [invalid] })), /time zone/);
});

test('selected destination coordinates work offline and stale historical hours are cleared after time correction', async () => {
  const t = trip([{ sourceLocalTime: '2026-05-23T08:15', enrichment: { timeZone: 'UTC', airTempC: 20, weatherHour: '2026-05-23T08:00:00.000Z', coordinates: { latitude: 1, longitude: 104 } } }]);
  t.config = { ...config, destination: 'Selected island', destinationCoordinates: { latitude: 1, longitude: 104 }, timeZoneOverride: 'Asia/Singapore' };
  const providers = { destination: async () => { throw Error('should not geocode selected destination'); }, locations: async () => [], zone: async () => 'Asia/Singapore', weather: async () => undefined };
  const result = await enrichTrip(t, providers);
  assert.equal(result.get(t.dives[0].id).airTempC, undefined);
  assert.deepEqual(result.get(t.dives[0].id).coordinates, { latitude: 1, longitude: 104 });
});

test('optional Google proxy combines features and geographic names, filters distant businesses, and limits requests', async () => {
  const { createGoogleLocationHandler } = await import('../scripts/google-location-proxy.mjs');
  let calls = 0;
  const handler = createGoogleLocationHandler({ key: 'server-secret', dailyLimit: 2, fetcher: async (url, init) => {
    calls++;
    if (String(url).includes('places.googleapis')) return Response.json({ places: [
      { displayName: { text: 'Near reef' }, types: ['natural_feature'], location: { latitude: 1, longitude: 104 } },
      { displayName: { text: 'Far reef' }, types: ['natural_feature'], location: { latitude: 2, longitude: 104 } },
      { displayName: { text: 'Dive shop' }, types: ['store', 'natural_feature'], location: { latitude: 1, longitude: 104 } }
    ] });
    return Response.json({ status: 'OK', results: [{ address_components: [{ long_name: 'Island area', types: ['locality'] }] }] });
  } });
  function response() { return { headers: {}, status: 200, body: '', setHeader(k, v) { this.headers[k] = v; }, writeHead(s) { this.status = s; }, end(body) { this.body = body; } }; }
  const req = { method: 'GET', url: '/?latitude=1&longitude=104' }, res = response();
  await handler(req, res);
  assert.deepEqual(JSON.parse(res.body).names, ['Near reef', 'Island area']);
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.ok(!res.body.includes('server-secret'));
  const denied = response(); await handler(req, denied); assert.equal(denied.status, 503); assert.equal(calls, 2);
  const broad = response();
  const broadHandler = createGoogleLocationHandler({ key: 'server-secret', fetcher: async url => { assert.ok(!String(url).includes('places.googleapis')); return Response.json({ status: 'OK', results: [{ address_components: [{ long_name: 'Broad island', types: ['locality'] }] }] }); } });
  await broadHandler({ ...req, url: req.url + '&broadOnly=1' }, broad);
  assert.deepEqual(JSON.parse(broad.body).names, ['Broad island']);
});
