const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { extractArchive, archiveLimits } = require('../shared/archive.ts');
const { createGarminApi, GarminError } = require('../shared/garminApi.ts');
const { syncGarmin, SyncStorageError } = require('../shared/garminSync.ts');
const { decodeStore, createRepository } = require('../shared/repository.ts');
const { mergeDives, correctDive, tripDives } = require('../shared/domain.ts');
const config = { tripStartDate: '2026-05-23', tripEndDate: '2026-05-24', utcOffsetMinutes: 480, ssiStartDiveNumber: 1 };
const at = '2026-05-23T00:00:00.000Z';
const trip = () => ({ id: 'trip', config, dives: [], files: [], audit: [], createdAt: at, updatedAt: at });
const report = () => ({ accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const jwt = 'eyJhIjoiYiJ9.eyJleHAiOjQwMDAwMDAwMDB9.signature';

test('ZIP extracts multiple FIT and CSV entries, reports nested archives and preserves exact bytes', async () => {
  const bytes = Uint8Array.from({ length: 4000 }, (_, i) => i % 251);
  const zip = zipSync({ 'folder/dive.fit': bytes, 'other.fit': Uint8Array.of(1, 2, 3), 'mapping.csv': strToU8('startTime,maxDepthM\n'), 'nested.zip': Uint8Array.of(0) });
  const result = await extractArchive(zip);
  assert.deepEqual(result.files.map(f => f.name), ['folder/dive.fit', 'other.fit', 'mapping.csv']);
  assert.deepEqual(result.files[0].bytes, bytes); assert.deepEqual(result.unsupported, ['nested.zip']);
});
test('ZIP rejects traversal, drive paths, encryption, CRC damage, truncated headers and bombs', async () => {
  for (const name of ['../evil.fit', '/evil.fit', 'C:evil.fit', 'folder/../../evil.fit', 'a\\evil.fit']) await assert.rejects(extractArchive(zipSync({ [name]: Uint8Array.of(1) })), /ZIP/);
  const original = zipSync({ 'dive.fit': strToU8('divedata') }, { level: 0 });
  const encrypted = original.slice(); const view = new DataView(encrypted.buffer);
  view.setUint16(6, 1, true);
  for (let i = 0; i < encrypted.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 8, 1, true);
  await assert.rejects(extractArchive(encrypted), /ZIP/);
  const corrupt = original.slice(); corrupt[38] ^= 255; await assert.rejects(extractArchive(corrupt), /ZIP/);
  for (const length of [0, 21, original.length - 1]) await assert.rejects(extractArchive(original.slice(0, length)), /ZIP/);
  await assert.rejects(extractArchive(zipSync({ 'bomb.fit': new Uint8Array(1024 * 1024) })), /ZIP/);
  await assert.rejects(extractArchive(new Uint8Array(archiveLimits.compressed + 1)), /ZIP/);
  await assert.rejects(extractArchive(zipSync(Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`${i}.fit`, Uint8Array.of(i)])))), /ZIP/);
});
test('ZIP checks actual output against declared metadata and supports cancellation', async () => {
  const zip = zipSync({ 'dive.fit': strToU8('abcdefg') }, { level: 0 });
  const view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
  await assert.rejects(extractArchive(zip), /ZIP/);
  const cancel = new AbortController(); cancel.abort(); await assert.rejects(extractArchive(zip, cancel.signal), /Cancelled/);
});
test('Personal API validates identity and activity access with no secret in diagnostics', async () => {
  const calls = [];
  const api = createGarminApi('secret-key', async (url, options) => {
    calls.push({ url, options });
    if (url.includes('personalapitoken')) return new Response(jwt);
    if (url.includes('userprofile')) return json({ userData: { userProfilePK: 123 } });
    return json([]);
  });
  assert.equal(await api.validate(), '123');
  assert.equal(calls[0].options.headers.Authorization, 'ApiKey secret-key');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${jwt}`);
  const bad = createGarminApi('secret-key', async () => new Response('secret-key', { status: 401 }));
  await assert.rejects(bad.validate(), e => e.authentication && !e.message.includes('secret-key'));
  const unknown = createGarminApi('key', async url => url.includes('personalapitoken') ? new Response(jwt) : json({}));
  await assert.rejects(unknown.validate(), /account identity/);
});
test('Personal API accepts documented settings handles and keeps account identities distinct', async () => {
  const validate = (profile, list = []) => createGarminApi('secret-key', async url =>
    url.includes('personalapitoken') ? new Response(jwt) : json(url.includes('userprofile') ? profile : list)).validate();
  assert.equal(await validate({ displayName: 'c1d2e3f4-account-handle', measurementSystem: 'metric' }), 'displayName:c1d2e3f4-account-handle');
  assert.equal(await validate({ displayName: '123' }), 'displayName:123');
  assert.equal(await validate({ userData: { userProfilePK: 123 }, displayName: 'handle' }), '123');
  assert.notEqual(await validate({ displayName: 'first-account' }), await validate({ displayName: 'second-account' }));
  for (const displayName of [undefined, null, '', '   ', ' handle ', 'bad\nhandle', 'x'.repeat(257), 123, {}]) {
    await assert.rejects(validate({ displayName }), /account identity/);
  }
  await assert.rejects(validate({ displayName: 'handle' }, {}), /activity list/);
});

test('Personal API renews tokens once, broadens trip dates and reads short pages until empty', async () => {
  let tokens = 0, pages = 0, rejected = false;
  const api = createGarminApi('key', async url => {
    if (url.includes('personalapitoken')) { tokens++; return new Response(jwt); }
    if (!rejected) { rejected = true; return new Response('', { status: 401 }); }
    if (url.includes('start=0&')) { assert.match(url, /startDate=2026-05-22&endDate=2026-05-25/); pages++; return json([{ activityId: 1 }]); }
    if (url.includes('start=1&')) { pages++; return json([{ activityId: 2 }]); }
    pages++; return json([]);
  });
  assert.deepEqual((await api.activities(config)).map(a => a.id), ['1', '2']); assert.equal(tokens, 2); assert.equal(pages, 3);
  const repeat = createGarminApi('key', async url => url.includes('personalapitoken') ? new Response(jwt) : json([{ activityId: 1 }]));
  await assert.rejects(repeat.activities(config), /repeated/);
});
test('rate limit honors long retry guidance without retrying early; oversized streamed download rejected', async () => {
  let calls = 0;
  const limited = createGarminApi('key', async url => { calls++; return url.includes('personalapitoken') ? new Response(jwt) : new Response('', { status: 429, headers: { 'Retry-After': '90' } }); });
  await assert.rejects(limited.activities(config), /longer wait/); assert.equal(calls, 2);
  const huge = createGarminApi('key', async url => url.includes('personalapitoken') ? new Response(jwt) : new Response('x', { headers: { 'Content-Length': String(archiveLimits.compressed + 1) } }));
  await assert.rejects(huge.download('1'), /32 MB/);
});
test('sync keeps committed activities, continues corrupt downloads and retries selected failures', async () => {
  const committed = [], checkpoints = [];
  const api = { activities: async () => [{ id: '1', date: at }, { id: '2', date: at }, { id: '3', date: at }], download: async id => { if (id === '2') throw new GarminError('Download failed.'); return Uint8Array.of(Number(id)); } };
  const options = { api, accountId: 'a', config, signal: new AbortController().signal, progress: () => {}, commit: async a => { committed.push(a.id); return { ...report(), accepted: 2 }; }, checkpoint: async (r, success) => checkpoints.push({ r: structuredClone(r), success }) };
  const result = await syncGarmin(options);
  assert.deepEqual(committed, ['1', '3']); assert.equal(result.added, 4); assert.equal(result.failures.length, 1); assert.equal(checkpoints.at(-1).success, false);
  api.download = async () => Uint8Array.of(2);
  await syncGarmin({ ...options, retry: [{ id: '2', date: at }] }); assert.deepEqual(committed, ['1', '3', '2']);
});
test('sync cancellation finishes current commit, storage failure stops new work, and query failure is not empty success', async () => {
  const abort = new AbortController(); let commits = 0;
  const options = { api: { activities: async () => [{ id: '1', date: at }, { id: '2', date: at }], download: async () => Uint8Array.of(1) }, accountId: 'a', config, signal: abort.signal, progress: () => {}, commit: async () => { commits++; abort.abort(); return { ...report(), accepted: 1 }; }, checkpoint: async () => {} };
  const result = await syncGarmin(options); assert.equal(result.cancelled, true); assert.equal(result.added, 1); assert.equal(commits, 1);
  await assert.rejects(syncGarmin({ ...options, signal: new AbortController().signal, commit: async () => { throw new SyncStorageError('Disk full'); } }), /Disk full/);
  const failed = await syncGarmin({ ...options, signal: new AbortController().signal, api: { ...options.api, activities: async () => { throw new GarminError('Offline'); } } });
  assert.equal(failed.queryFailed, true); assert.equal(failed.failures[0].activityId, 'query');
});
test('sync stops all further downloads when Garmin asks for a longer wait', async () => {
  let downloads = 0;
  const result = await syncGarmin({ accountId: 'a', config, signal: new AbortController().signal, progress: () => {}, checkpoint: async () => {}, commit: async () => { throw Error('Must not import'); },
    api: { activities: async () => [{ id: '1', date: at }, { id: '2', date: at }], download: async () => { downloads++; throw new GarminError('Retry later.', false, false, true); } }
  });
  assert.equal(downloads, 1); assert.equal(result.failures.length, 2); assert.match(result.failures[1].reason, /Not attempted/);
});
test('schema migration retains sources/edits and remote per-dive identities do not collapse activity dives', () => {
  const t = trip(); const origin = { accountId: '123', activityId: '1' };
  let r = report(); let next = mergeDives(t, [{ startTime: at, durationSec: 10, garmin: { ...origin, diveId: 'lap1' } }, { startTime: '2026-05-23T01:00:00.000Z', durationSec: 20, garmin: { ...origin, diveId: 'lap2' } }], 'file', r);
  next.files = [{ id: 'file', name: 'x.fit', uri: 'file:///x.fit', fingerprint: 'hash', importedAt: at, garmin: origin }];
  next = correctDive(next, next.dives[0].id, 'locationName', 'Edited'); next.dives[0].ssiTypeOverride = 8; next.dives[0].ssiMarkedSavedAt = at;
  const migrated = decodeStore(JSON.stringify({ schemaVersion: 1, trips: [next] })); assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.trips[0], { ...JSON.parse(JSON.stringify(next)), ssiDefaults: require('../shared/ssiConditions.ts').defaultSsiConditions });
  r = report(); const repeated = mergeDives(next, next.dives, 'new', r); assert.equal(r.duplicates, 2); assert.equal(repeated.dives.length, 2);
  assert.equal(tripDives(repeated)[0].locationName, 'Edited'); assert.equal(repeated.dives[0].ssiTypeOverride, 8); assert.equal(repeated.dives[0].ssiMarkedSavedAt, at);
  r = report(); mergeDives(next, [{ startTime: at, durationSec: 99, garmin: { ...origin, diveId: 'lap1' } }], 'new', r); assert.equal(r.conflicts.length, 1);
  for (const changed of [{ startTime: '2026-05-23T02:00:00.000Z' }, { maxWaterTempC: 29 }, { garminStats: { avgDepthM: 15 } }]) {
    r = report(); mergeDives(next, [{ startTime: at, durationSec: 10, garmin: { ...origin, diveId: 'lap1' }, ...changed }], 'new', r); assert.equal(r.conflicts.length, 1); assert.equal(r.accepted, 0);
  }
  r = report(); mergeDives(next, [{ startTime: '2026-05-23T03:00:00.000Z', durationSec: 99, garmin: { ...origin, accountId: '456', diveId: 'lap1' } }], 'new', r); assert.equal(r.accepted, 1);
});
