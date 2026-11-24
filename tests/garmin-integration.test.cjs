const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const { Encoder } = require('@garmin/fitsdk');
const { zipSync } = require('fflate');
const { correctDive } = require('../shared/domain.ts');
const files = new Map(); let secret, rejectKey = false, rejectStore = false, downloadBytes, advertised, paused = false;
const native = {
  documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: async () => {}, getFreeDiskStorageAsync: async () => 1024 ** 3,
  getInfoAsync: async uri => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, md5: createHash('md5').update(files.get(uri)).digest('hex') } : { exists: false },
  writeAsStringAsync: async (uri, data, options) => files.set(uri, Buffer.from(data, options?.encoding === 'base64' ? 'base64' : 'utf8')),
  readAsStringAsync: async (uri, options) => { if (!files.has(uri)) throw Error('Missing file'); return files.get(uri).toString(options?.encoding === 'base64' ? 'base64' : 'utf8'); },
  copyAsync: async ({ from, to }) => { if (!files.has(from)) throw Error('Missing file'); files.set(to, Buffer.from(files.get(from))); },
  deleteAsync: async uri => { for (const path of files.keys()) if (path === uri || path.startsWith(uri)) files.delete(path); },
  createDownloadResumable: (url, uri, options, progress) => ({
    pauseAsync: async () => { paused = true; },
    downloadAsync: async () => { paused = false; progress({ totalBytesWritten: 0, totalBytesExpectedToWrite: advertised ?? downloadBytes.length }); if (paused) return undefined; files.set(uri, Buffer.from(downloadBytes)); return { uri, status: 200, headers: {} }; }
  })
};
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'expo-file-system') return native;
  if (name === 'expo-document-picker') return {};
  if (name === 'expo-secure-store') return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked', getItemAsync: async () => secret, setItemAsync: async (_, value) => { if (rejectStore) throw Error('Storage failed'); secret = value; }, deleteItemAsync: async () => { secret = undefined; } };
  return originalLoad.call(this, name, ...args);
};
const { connectGarmin, getGarminConnection, disconnectGarmin } = require('../src/services/garminConnection.ts');
const { syncTrip } = require('../src/services/garminSync.ts');
const { importFile, prepareFile } = require('../src/services/fileImport.ts');
const { garminDownload } = require('../src/services/garminDownload.ts');
Module._load = originalLoad;

global.fetch = async (url, options) => {
  if (url.includes('personalapitoken')) return rejectKey ? new Response('do-not-expose-key', { status: 401 }) : new Response('header.payload.signature');
  if (url.includes('userprofile')) return Response.json({ displayName: 'test-account-handle', measurementSystem: 'metric' });
  return Response.json(url.includes('start=0&') ? [{ activityId: 99, startTimeGMT: '2026-05-23 00:00:00' }] : []);
};
const at = '2026-05-23T00:00:00.000Z';
const makeTrip = () => ({ id: 'trip', config: { tripStartDate: '2026-05-23', tripEndDate: '2026-05-24', utcOffsetMinutes: 480, ssiStartDiveNumber: 1 }, dives: [], files: [], audit: [], createdAt: at, updatedAt: at });
function fixture() {
  const encoder = new Encoder();
  encoder.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 123, timeCreated: new Date(at) });
  for (let i = 0; i < 2; i++) {
    const startTime = new Date(Date.parse(at) + i * 3600000), timestamp = new Date(startTime.getTime() + 1800000);
    encoder.writeMesg({ mesgNum: 18, messageIndex: i, sport: 'diving', subSport: 'singleGasDiving', startTime, timestamp, totalTimerTime: 1800 });
    encoder.writeMesg({ mesgNum: 268, referenceMesg: 'session', referenceIndex: i, timestamp, maxDepth: 20 + i, bottomTime: 1740 });
  }
  return encoder.close();
}
test('secure replacement validates before persistence, and disconnect removes local credentials', async () => {
  const connection = await connectGarmin('do-not-expose-key'); assert.equal(connection.accountId, 'displayName:test-account-handle'); const previous = secret;
  rejectKey = true; await assert.rejects(connectGarmin('rejected'), /key rejected/i); assert.equal(secret, previous); rejectKey = false;
  rejectStore = true; await assert.rejects(connectGarmin('replacement'), /Secure storage failed/); rejectStore = false;
  assert.equal(secret, previous); assert.equal((await getGarminConnection()).accountId, 'displayName:test-account-handle');
  await disconnectGarmin(); assert.equal(secret, undefined); assert.equal(await getGarminConnection(), undefined);
});
test('native bounded download, sync, original FIT manual import and repeat sync preserve measurements and edits', async () => {
  await connectGarmin('do-not-expose-key');
  const fit = fixture(); downloadBytes = zipSync({ 'activity.fit': fit });
  let saved = makeTrip();
  const transact = async (_, change) => { saved = await change(saved); };
  const result = await syncTrip(saved, transact, new AbortController().signal, () => {});
  assert.equal(result.added, 2); assert.equal(result.failures.length, 0); assert.equal(saved.files.length, 1);
  assert.deepEqual(saved.dives.map(d => d.maxDepthM), [20, 21]); assert.equal(saved.files[0].garmin.activityId, '99');
  assert.equal(new Set(saved.dives.map(d => d.garmin.diveId)).size, 2);
  saved = correctDive(saved, saved.dives[0].id, 'locationName', 'Corrected reef'); saved.dives[0].ssiTypeOverride = 8; saved.dives[0].ssiMarkedSavedAt = at;
  files.set('file:///manual.fit', Buffer.from(fit));
  const manual = await importFile(saved, await prepareFile({ uri: 'file:///manual.fit', name: 'manual.fit' }));
  assert.equal(manual.report.duplicates, 2); saved = manual.trip;
  const repeated = await syncTrip(saved, transact, new AbortController().signal, () => {});
  assert.equal(repeated.added, 0); assert.equal(repeated.duplicates, 2); assert.equal(saved.dives[0].corrections.locationName, 'Corrected reef');
  assert.equal(saved.dives[0].ssiTypeOverride, 8); assert.equal(saved.dives[0].ssiMarkedSavedAt, at);
  assert.equal(JSON.stringify(saved).includes('do-not-expose-key'), false);
  assert.equal([...files.keys()].some(path => path.startsWith('file:///cache/garmin-')), false);
  advertised = 33 * 1024 * 1024;
  await assert.rejects(garminDownload('https://personal.connectapi.garmin.com/download-service/files/activity/99', {}), /32 MB/); advertised = undefined;
});
test('an activity with one good and one corrupt FIT commits no partial dives', async () => {
  downloadBytes = zipSync({ 'good.fit': fixture(), 'bad.fit': Uint8Array.of(1, 2, 3) });
  let saved = makeTrip();
  const result = await syncTrip(saved, async (_, change) => { saved = await change(saved); }, new AbortController().signal, () => {});
  assert.equal(result.added, 0); assert.equal(result.failures.length, 1); assert.equal(saved.dives.length, 0); assert.equal(saved.files.length, 0);
  assert.equal([...files.keys()].some(path => path.startsWith('file:///cache/garmin-')), false);
  await disconnectGarmin();
});
