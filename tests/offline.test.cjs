const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Encoder } = require('@garmin/fitsdk');
const { validDate, validateConfig, tripDives, mergeDives, correctDive, base64Bytes, missingFields } = require('../shared/domain.ts');
const { csvRows, parseCsv, suggestMapping, parseTimestamp } = require('../shared/parsers/csv.ts');
const { parseFit } = require('../shared/parsers/fit.ts');
const { createRepository, decodeStore } = require('../shared/repository.ts');
const config = { tripStartDate: '2026-05-23', tripEndDate: '2026-05-24', ssiStartDiveNumber: 42, utcOffsetMinutes: 480 };
const at = '2026-05-23T00:00:00.000Z';
const makeTrip = () => ({ id: 'trip1', config, dives: [], files: [], audit: [], createdAt: at, updatedAt: at });
const report = () => ({ accepted: 0, duplicates: 0, outsideTrip: 0, conflicts: [], failures: [] });
const record = (startTime = at, extra = {}) => ({ startTime, maxDepthM: 20, durationSec: 1800, waterTempC: 0, locationName: 'Reef', ...extra });
function imported(records) {
  return { ...mergeDives(makeTrip(), records, 'file1', report()), files: [{ id: 'file1', uri: 'file:///source.fit', name: 'source.fit', fingerprint: 'hash', importedAt: at }] };
}
function memoryFiles(initial = {}) {
  const values = new Map(Object.entries(initial)); let fail = '';
  return { values, fail: value => { fail = value; },
    exists: async n => values.has(n), read: async n => { if (!values.has(n)) throw Error('Missing'); return values.get(n); },
    write: async (n, text) => { if (fail === `write:${n}`) throw Error('Disk full'); values.set(n, text); },
    copy: async (a, b) => values.set(b, values.get(a)),
    remove: async n => { values.delete(n); },
    move: async (a, b) => { if (fail === 'move') throw Error('Interrupted'); values.set(b, values.get(a)); values.delete(a); }
  };
}
test('calendar validation rejects rollover dates and legacy numbering and invalid offset', () => {
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('05/23/2026'), false);
  assert.equal(validateConfig({ ...config, ssiStartDiveNumber: 1.2 }).length, 0);
  assert.ok(validateConfig({ ...config, utcOffsetMinutes: 841 }).length);
  assert.ok(validateConfig({ ...config, tripEndDate: '2026-05-22' }).length);
});
test('inclusive trip dates use trip offset and numbering sorts actual instants', () => {
  const trip = imported([record('2026-05-24T15:59:59.000Z'), record('2026-05-22T16:00:00.000Z'), record('2026-05-24T16:00:00.000Z'), record('2026-05-22T15:59:59.000Z')]);
  const dives = tripDives(trip); assert.equal(dives.length, 2);
  assert.deepEqual(dives.map(d => d.sequence), [1, 2]);
  assert.equal(dives[0].startTime, '2026-05-22T16:00:00.000Z');
  assert.equal(tripDives({ ...trip, config: { ...config, tripEndDate: '2026-05-25' } }).length, 3);
});
test('CSV handles BOM, Unicode, newlines, quoted text, imperial units and clock durations', () => {
  const text = '\uFEFFDate,Time,Depth,Temp,Place,Notes\r\n2026-05-23 08:00:00,01:02:03,100,32,"礁, Reef","one\n""two"""\r\n';
  const mapping = { start: 'Date', duration: 'Time', depth: 'Depth', temperature: 'Temp', location: 'Place', notes: 'Notes', durationUnit: 'clock', depthUnit: 'ft', temperatureUnit: 'F' };
  const result = parseCsv(text, mapping, 480); assert.deepEqual(result.errors, []);
  assert.equal(result.dives[0].startTime, at); assert.equal(result.dives[0].durationSec, 3723);
  assert.equal(result.dives[0].maxDepthM, 30.48); assert.equal(result.dives[0].waterTempC, 0);
  assert.equal(result.dives[0].notes, 'one\n"two"'); assert.equal(result.dives[0].locationName, '礁, Reef');
});
test('CSV reports invalid rows while retaining valid rows and never silently chooses ambiguous units', () => {
  const text = 'startTime,maxDepthM,durationSec\n2026-05-23 08:00,20,100\n2026-02-30 08:00,20,100\n2026-05-23 09:00,-2,100\n2026-05-23 10:00,20,NaN';
  const result = parseCsv(text, suggestMapping(csvRows(text)[0]), 480);
  assert.equal(result.dives.length, 1); assert.equal(result.errors.length, 3);
  assert.throws(() => csvRows('startTime\n"unclosed'), /Unclosed/);
  assert.throws(() => parseTimestamp('05/23/2026 08:00', 480));
  assert.equal(suggestMapping(['Date', 'Max Depth']).depth, '');
  assert.equal(parseTimestamp('2026-05-23T08:00:00+08:00', 0), at);
});
test('repeat imports and uncertain collisions preserve existing corrections', () => {
  const first = record(at, { sourceId: 'garmin1' }); let trip = imported([first]);
  trip = correctDive(trip, trip.dives[0].id, 'locationName', 'Corrected reef');
  let r = report(); trip = mergeDives(trip, [first], 'file2', r); assert.equal(r.duplicates, 1); assert.equal(trip.dives.length, 1);
  assert.equal(tripDives(trip)[0].locationName, 'Corrected reef');
  r = report(); mergeDives(trip, [record(at, { durationSec: 99 })], 'file2', r); assert.equal(r.conflicts.length, 1);
  r = report(); mergeDives(trip, [{ ...first, durationSec: 99 }], 'file2', r); assert.equal(r.conflicts.length, 1);
  r = report(); mergeDives(trip, [record(at)], 'file2', r); assert.equal(r.duplicates, 1);
});
test('corrections validate numeric values, preserve zero/negative temperatures, and clear optional fields', () => {
  let trip = imported([record()]); const id = trip.dives[0].id;
  trip = correctDive(trip, id, 'waterTempC', -2); trip = correctDive(trip, id, 'locationName', null);
  assert.equal(tripDives(trip)[0].waterTempC, -2); assert.ok(!missingFields(tripDives(trip)[0]).includes('location'));
  assert.equal(trip.dives[0].original.locationName, 'Reef'); assert.equal(trip.audit.length, 2);
  for (const value of [NaN, Infinity, -1, 0, null]) assert.throws(() => correctDive(trip, id, 'durationSec', value));
  assert.equal(tripDives(correctDive(trip, id, 'maxDepthM', 0))[0].maxDepthM, 0);
});
test('repository persists and reloads complete records and serializes concurrent writes', async () => {
  const files = memoryFiles(); const repo = createRepository(files); await repo.load();
  await Promise.all([repo.update(s => ({ ...s, trips: [imported([record()])] })), repo.update(s => ({ ...s, trips: s.trips.map(t => correctDive(t, t.dives[0].id, 'notes', 'Saved')) }))]);
  const reopened = await createRepository(files).load(); assert.equal(tripDives(reopened.data.trips[0])[0].notes, 'Saved');
});
test('interrupted primary promotion recovers the backup and blocks writes until reload', async () => {
  const files = memoryFiles(); const repo = createRepository(files); await repo.load();
  await repo.update(s => ({ ...s, trips: [imported([record()])] }));
  files.fail('move'); await assert.rejects(repo.update(s => ({ ...s, trips: [] })), /Save failed/);
  await assert.rejects(repo.update(s => s), /Load saved data/);
  files.fail(''); const restored = await repo.load(); assert.equal(restored.data.trips.length, 1); assert.match(restored.warning, /Recovered/);
});
test('corrupt data never silently resets and future schemas cannot be overwritten by a backup', async () => {
  const backup = JSON.stringify({ schemaVersion: 1, trips: [imported([record()])] });
  const restored = await createRepository(memoryFiles({ 'store.json': 'bad', 'backup.json': backup })).load(); assert.equal(restored.data.trips.length, 1);
  await assert.rejects(createRepository(memoryFiles({ 'store.json': 'bad' })).load(), /preserved/);
  await assert.rejects(createRepository(memoryFiles({ 'pending.json': '{}' })).load(), /preserved/);
  await assert.rejects(createRepository(memoryFiles({ 'store.json': '{"schemaVersion":3,"trips":[]}', 'backup.json': backup })).load(), /Unsupported/);
  assert.throws(() => decodeStore('{"schemaVersion":1,"trips":[{}]}'));
});
function fitFixture({ sport = 'diving', subSport = 'singleGasDiving', summary = true, lap = false } = {}) {
  const encoder = new Encoder();
  const startTime = new Date(at), timestamp = new Date(Date.parse(at) + 1800000);
  encoder.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 123, timeCreated: startTime });
  encoder.writeMesg({ mesgNum: 18, messageIndex: 0, sport, subSport, startTime, timestamp, totalTimerTime: 1800 });
  if (lap) encoder.writeMesg({ mesgNum: 19, messageIndex: 0, startTime, timestamp, totalTimerTime: 1800 });
  if (summary) encoder.writeMesg({ mesgNum: 268, referenceMesg: lap ? 'lap' : 'session', referenceIndex: 0, timestamp, maxDepth: 24.3, bottomTime: 1740 });
  encoder.writeMesg({ mesgNum: 20, timestamp: new Date(Date.parse(at) + 10000), depth: 10, temperature: 0 });
  return encoder.close();
}
test('FIT SDK binary decoding extracts session and lap dive summaries with scaled units', () => {
  for (const lap of [false, true]) {
    const result = parseFit(fitFixture({ lap })); assert.deepEqual(result.errors, []); assert.equal(result.dives.length, 1);
    assert.equal(result.dives[0].startTime, at); assert.equal(result.dives[0].maxDepthM, 24.3); assert.equal(result.dives[0].durationSec, 1740); assert.equal(result.dives[0].waterTempC, 0);
  }
});
test('FIT rejects corruption and avoids converting running activities into dives', () => {
  assert.equal(parseFit(fitFixture({ sport: 'running', subSport: 'generic', summary: false })).dives.length, 0);
  assert.throws(() => parseFit(Uint8Array.from([1, 2, 3])));
  const bytes = fitFixture(); bytes[bytes.length - 1] ^= 1; assert.throws(() => parseFit(bytes), /checksum/);
  assert.equal(parseFit(fitFixture({ subSport: 'apneaDiving', summary: false })).dives.length, 0);
});
test('base64 FIT reads do not require Node Buffer on the phone', () => {
  const bytes = fitFixture(); assert.deepEqual(base64Bytes(Buffer.from(bytes).toString('base64')), bytes);
  assert.throws(() => base64Bytes('%%%'), /Invalid/);
});
test('uncertain matches can be explicitly retained as separate dives without replacing corrections', () => {
  let trip = imported([record()]); trip = correctDive(trip, trip.dives[0].id, 'notes', 'Keep this');
  const r = report(); const merged = mergeDives(trip, [record(at, { durationSec: 600 })], 'file2', r, true);
  assert.equal(r.accepted, 1); assert.equal(merged.dives.length, 2); assert.equal(tripDives(merged).find(d => d.id === trip.dives[0].id).notes, 'Keep this');
});
test('disk full before promotion leaves saved primary intact and failed reload keeps writes blocked', async () => {
  const files = memoryFiles(); const repo = createRepository(files); await repo.load(); await repo.update(s => ({ ...s, trips: [imported([record()])] }));
  files.fail('write:pending.json'); await assert.rejects(repo.update(s => ({ ...s, trips: [] })), /Save failed/);
  files.fail(''); const saved = await repo.load(); assert.equal(saved.data.trips.length, 1);
  files.values.set('store.json', 'corrupt'); files.values.delete('backup.json');
  await assert.rejects(repo.load(), /preserved/); await assert.rejects(repo.update(s => s), /Load saved data/);
});
test('repository rejects invalid stored config rather than exposing it to screens', () => {
  const trip = imported([record()]); trip.config = { ...config, tripStartDate: '2026-02-30' };
  assert.throws(() => decodeStore(JSON.stringify({ schemaVersion: 1, trips: [trip] })), /Invalid saved trip settings/);
});
test('partial FIT files cannot be imported even with an intact FIT header', () => {
  const bytes = fitFixture(); assert.throws(() => parseFit(bytes.slice(0, bytes.length - 5)));
});
test('two diving sessions are retained as separate normalized dives', () => {
  const encoder = new Encoder();
  encoder.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', timeCreated: new Date(at) });
  for (let i = 0; i < 2; i++) {
    const startTime = new Date(Date.parse(at) + i * 3600000), timestamp = new Date(startTime.getTime() + 1800000);
    encoder.writeMesg({ mesgNum: 18, messageIndex: i, sport: 'diving', subSport: 'singleGasDiving', startTime, timestamp, totalTimerTime: 1800 });
    encoder.writeMesg({ mesgNum: 268, referenceMesg: 'session', referenceIndex: i, timestamp, maxDepth: 20 + i, bottomTime: 1700 + i });
  }
  const result = parseFit(encoder.close()); assert.equal(result.dives.length, 2); assert.deepEqual(result.errors, []);
  assert.equal(result.dives[1].maxDepthM, 21); assert.equal(result.dives[1].durationSec, 1701);
});
const { ssiPayload, qrPng, bytesBase64 } = require('../shared/ssiQr.ts');
const { inflateSync, crc32: independentCrc } = require('node:zlib');
const jsQR = require('jsqr');
const { exportAllQr, qrFileName } = require('../shared/qrBatch.ts');

test('gallery captions contain corrected location, trip sequence and local date without changing SSI payload', async () => {
  let trip = imported([record()]);
  trip = correctDive(trip, trip.dives[0].id, 'locationName', 'Coral reef');
  let caption;
  await exportAllQr(trip, async (_, base64, text) => {
    caption = text;
    const png = decodePng(base64);
    assert.doesNotMatch(jsQR(png.rgba, png.width, png.height).data, /Coral reef|Dive 1/);
  });
  assert.match(caption, /^Dive 1\nCoral reef\n2026-05-23 08:00:00\n20.0 m · 30 min$/);
});

test('FIT preserves additional measurements and GPS while QR uses only supported fields', () => {
  const encoder = new Encoder(); const startTime = new Date(at), timestamp = new Date(Date.parse(at) + 1800000);
  encoder.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', timeCreated: startTime });
  encoder.writeMesg({ mesgNum: 258, waterType: 'salt' });
  encoder.writeMesg({ mesgNum: 18, messageIndex: 0, sport: 'diving', subSport: 'singleGasDiving', startTime, timestamp,
    startPositionLat: Math.round(1.25 * 2147483648 / 180), startPositionLong: Math.round(103.5 * 2147483648 / 180), avgHeartRate: 80, maxHeartRate: 110 });
  encoder.writeMesg({ mesgNum: 268, referenceMesg: 'session', referenceIndex: 0, timestamp, maxDepth: 24, bottomTime: 1700,
    avgDepth: 12.5, surfaceInterval: 3600, endCns: 7, o2Toxicity: 10 });
  for (const [seconds, depth, temperature] of [[0, 0, 35], [10, 8, 24], [20, 12, 27]])
    encoder.writeMesg({ mesgNum: 20, timestamp: new Date(Date.parse(at) + seconds * 1000), depth, temperature });
  const result = parseFit(encoder.close()); assert.deepEqual(result.errors, []);
  const dive = result.dives[0]; assert.equal(dive.waterTempC, 24); assert.equal(dive.maxWaterTempC, 27);
  assert.equal(dive.garminStats.avgDepthM, 12.5); assert.equal(dive.garminStats.surfaceIntervalSec, 3600);
  assert.ok(Math.abs(dive.garminStats.latitude - 1.25) < 0.000001); assert.ok(Math.abs(dive.garminStats.longitude - 103.5) < 0.000001);
  assert.equal(dive.garminStats.avgHeartRateBpm, 80); assert.equal(dive.garminStats.endCnsPercent, 7);
  const trip = imported([dive]); const reloaded = decodeStore(JSON.stringify({ schemaVersion: 1, trips: [trip] })).trips[0];
  const payload = ssiPayload(tripDives(reloaded)[0], config);
  assert.match(payload, /watertemp_max_c:27/); assert.match(payload, /var_watertype_id:5/); assert.ok(!payload.includes('site:'));
});

test('batch QR export ignores legacy type overrides, continues after individual failures and supports cancellation', async () => {
  const trip = imported([record(), record('2026-05-23T01:00:00.000Z', { maxDepthM: undefined }), record('2026-05-23T02:00:00.000Z')]);
  trip.dives[0].ssiTypeOverride = 2;
  const saved = [], progress = [];
  const result = await exportAllQr(trip, async (name, base64) => { saved.push(name); const png = decodePng(base64); assert.match(jsQR(png.rgba, png.width, png.height).data, /dive_type:0/); }, p => progress.push(p.processed));
  assert.equal(result.total, 3); assert.equal(result.saved, 2); assert.equal(result.failures[0].sequence, 2);
  assert.equal(progress.at(-1), 3); assert.equal(new Set(saved).size, 2);
  assert.match(qrFileName(42, at), /^ssi-dive-000042-[A-Za-z0-9]+\.png$/);
  let count = 0;
  const cancelled = await exportAllQr(trip, async () => { count++; }, undefined, () => count === 1);
  assert.equal(cancelled.saved, 1); assert.equal(cancelled.cancelled, true);
  const failed = await exportAllQr(imported([record()]), async () => { throw Error('No storage'); });
  assert.equal(failed.saved, 0); assert.match(failed.failures[0].reason, /No storage/);
});

test('legacy SSI data stays loadable while old numbering and type choices are ignored', () => {
  const trip = imported([record()]); trip.dives[0].ssiTypeOverride = 4;
  const loaded = decodeStore(JSON.stringify({ schemaVersion: 1, trips: [trip] }));
  assert.match(ssiPayload(tripDives(loaded.trips[0])[0], config), /dive_type:0/);
  trip.dives[0].ssiTypeOverride = 3; assert.throws(() => decodeStore(JSON.stringify({ schemaVersion: 1, trips: [trip] })), /SSI dive type/);
  trip.dives[0].ssiTypeOverride = 0; trip.config = { ...config, ssiStartDiveNumber: Number.MAX_SAFE_INTEGER };
  assert.equal(decodeStore(JSON.stringify({ schemaVersion: 1, trips: [trip] })).trips.length, 1);
});
function decodePng(base64) {
  const bytes = Buffer.from(base64, 'base64');
  assert.deepEqual([...bytes.slice(0, 8)], [137,80,78,71,13,10,26,10]);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20); let offset = 8; const data = [];
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 0);
  while (offset < bytes.length) { const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8); assert.equal(bytes.readUInt32BE(offset + 8 + length), independentCrc(bytes.subarray(offset + 4, offset + 8 + length))); if (type === 'IDAT') data.push(bytes.slice(offset + 8, offset + 8 + length)); offset += 12 + length; }
  const raw = inflateSync(Buffer.concat(data)), rgba = new Uint8ClampedArray(width * height * 4);
  assert.equal(raw.length, (width + 1) * height);
  for (let y = 0; y < height; y++) { assert.equal(raw[y * (width + 1)], 0); for (let x = 0; x < width; x++) { const i = (y * width + x) * 4, value = raw[y * (width + 1) + x + 1]; rgba[i] = rgba[i + 1] = rgba[i + 2] = value; rgba[i + 3] = 255; } }
  return { rgba, width, height, raw };
}
test('SSI QR payload carries corrected measurements and local time without identifiers or verification', () => {
  let trip = imported([record()]); trip = correctDive(trip, trip.dives[0].id, 'maxDepthM', 24.35); trip = correctDive(trip, trip.dives[0].id, 'durationSec', 1740);
  const payload = ssiPayload(tripDives(trip)[0], config);
  assert.equal(payload, 'dive;noid;dive_type:0;divetime:29;datetime:202605230800;depth_m:24.4;user_firstname:;user_lastname:;watertemp_c:0;var_weather_id:1;var_entry_id:22;var_water_body_id:13;var_current_id:7;var_surface_id:11;var_divetype_id:24');
  assert.ok(!payload.includes('user_master_id')); assert.ok(!payload.includes('user_leader_id')); assert.ok(!payload.includes('site:'));
  assert.match(ssiPayload({ ...tripDives(trip)[0], diveKind: 'freedive' }, config), /dive_type:6/);
  assert.match(ssiPayload({ ...tripDives(trip)[0], diveKind: 'ccr' }, config), /dive_type:8/);
  assert.match(ssiPayload({ ...tripDives(trip)[0], ssiTypeOverride: 2 }, config), /dive_type:0/);

  assert.throws(() => ssiPayload({ ...tripDives(trip)[0], durationSec: undefined }, config));
  assert.throws(() => ssiPayload({ ...tripDives(trip)[0], maxDepthM: undefined }, config));
});
test('exported PNG QR images decode independently to the precise SSI payload', () => {
  const payload = ssiPayload(tripDives(imported([record()]))[0], config);
  for (const scale of [4, 8]) {
    const image = qrPng(payload, scale); const decoded = decodePng(image.base64);
    assert.equal(image.width, decoded.width); assert.equal(jsQR(decoded.rgba, decoded.width, decoded.height).data, payload);
    // Quiet-zone pixels stay white to support reliable camera scanning.
    assert.equal(decoded.raw[1], 255);
  }
});
test('portable base64 writer matches standard encoding for every padding length', () => {
  for (let length = 0; length < 20; length++) { const bytes = Uint8Array.from({ length }, (_, i) => i * 13 & 255); assert.equal(bytesBase64(bytes), Buffer.from(bytes).toString('base64')); }
});

test('SSI conditions use recorded values before defaults and explicit dive amendments first', () => {
  const dive = { ...tripDives(imported([record()]))[0], ssiConditions: { weather: 3, current: 8 }, ssiConditionOverrides: { weather: 2, surface: null }, ssiAirTempC: 0 };
  const payload = ssiPayload(dive, config, { weather: 1, current: 7, entry: 21 });
  assert.match(payload, /var_weather_id:2(?:;|$)/);
  assert.match(payload, /var_current_id:8(?:;|$)/);
  assert.match(payload, /var_entry_id:21(?:;|$)/);
  assert.doesNotMatch(payload, /var_surface_id:/);
  assert.match(payload, /airtemp_c:0(?:;|$)/);
  assert.equal((payload.match(/var_weather_id:/g) || []).length, 1);
  assert.throws(() => ssiPayload({ ...dive, ssiConditionOverrides: { entry: 999 } }, config), /Invalid SSI/);
  assert.throws(() => ssiPayload({ ...dive, ssiAirTempC: NaN }, config), /air temperature/);
});

test('existing trips get independent default snapshots and persisted trips retain amendments', () => {
  const loaded = decodeStore(JSON.stringify({ schemaVersion: 2, ssiDefaults: { weather: 3 }, trips: [imported([record()])] }));
  assert.equal(loaded.trips[0].ssiDefaults.weather, 3);
  loaded.ssiDefaults.weather = 2;
  const reloaded = decodeStore(JSON.stringify(loaded));
  assert.equal(reloaded.trips[0].ssiDefaults.weather, 3);
  reloaded.trips[0].ssiDefaults.entry = 21;
  reloaded.trips[0].ssiAirTempC = 31.5;
  reloaded.trips[0].dives[0].ssiConditionOverrides = { current: 6 };
  const persisted = decodeStore(JSON.stringify(reloaded));
  assert.equal(persisted.trips[0].ssiDefaults.entry, 21);
  assert.equal(persisted.trips[0].ssiAirTempC, 31.5);
  assert.equal(persisted.trips[0].dives[0].ssiConditionOverrides.current, 6);
  assert.throws(() => decodeStore(JSON.stringify({ ...loaded, ssiDefaults: { weather: '1' } })), /Invalid SSI/);
  assert.throws(() => decodeStore(JSON.stringify({ ...loaded, trips: [{ ...loaded.trips[0], ssiAirTempC: 999 }] })), /air temperature/);
});

test('batch QR images carry trip settings, dive amendments and trip air temperature', async () => {
  const trip = imported([record()]);
  trip.ssiDefaults = { weather: 2, entry: 21 };
  trip.ssiAirTempC = 31;
  trip.dives[0].ssiConditionOverrides = { current: 6 };
  const result = await require('../shared/qrBatch.ts').exportAllQr(trip, async (_, base64) => {
    const png = decodePng(base64);
    const payload = jsQR(png.rgba, png.width, png.height).data;
    assert.match(payload, /var_weather_id:2(?:;|$)/);
    assert.match(payload, /var_entry_id:21(?:;|$)/);
    assert.match(payload, /var_current_id:6(?:;|$)/);
    assert.match(payload, /airtemp_c:31(?:;|$)/);
  });
  assert.equal(result.saved, 1); assert.deepEqual(result.failures, []);
});
test('CSV apnea classification transfers as freediving while skydiving is excluded', () => {
  const text = 'Activity Type,startTime,durationSec,maxDepthM\nApnea,2026-05-23T00:00:00Z,180,15\nSky Diving,2026-05-23T01:00:00Z,180,15\nRunning,2026-05-23T02:00:00Z,180,15';
  const result = parseCsv(text, suggestMapping(csvRows(text)[0]), 480);
  assert.equal(result.dives.length, 1); assert.equal(result.dives[0].diveKind, 'freedive');
  assert.match(ssiPayload(tripDives(imported(result.dives))[0], config), /dive_type:6/);
});
