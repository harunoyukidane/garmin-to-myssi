const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let savedUsername, rejectStore = false;
Module._load = function(name, ...args) {
  if (name === 'expo-secure-store') return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked',
    getItemAsync: async () => savedUsername,
    setItemAsync: async (_, value) => { if (rejectStore) throw Error('Storage failed'); savedUsername = value; },
    deleteItemAsync: async () => { savedUsername = undefined; }
  };
  return originalLoad.call(this, name, ...args);
};
const { getGeoNamesUsername, saveGeoNamesUsername } = require('../src/services/geoNamesSettings.ts');
const { providers } = require('../src/services/enrichment.ts');
Module._load = originalLoad;
const { geoNamesCandidates } = require('../shared/geonames.ts');
const { enrichTrip, applyEnrichment } = require('../shared/enrichment.ts');
const { effective } = require('../shared/domain.ts');
const point = { latitude: 2.810430256649852, longitude: 104.13499474525452 };
const island = { name: 'Pulau Rengis', lat: '2.8096', lng: '104.1331', fcode: 'ISL' };
function trip(corrections = {}) {
  return { config: { tripStartDate: '2026-09-27', tripEndDate: '2026-09-27', utcOffsetMinutes: 480 }, dives: [{ id: 'd', startTime: '2026-09-27T03:52:48.000Z', garminStats: { exitLatitude: point.latitude, exitLongitude: point.longitude }, original: { waterTempC: 29 }, corrections }] };
}
const weather = { hourly_units: { temperature_2m: '°C' }, hourly: { time: [Date.parse('2026-09-27T03:00:00Z') / 1000], temperature_2m: [28] } };
test('GeoNames keeps nearby geographic features and excludes businesses, invalid and distant results', () => {
  const result = geoNamesCandidates(point, { geonames: [island, { ...island, name: 'Hotel', fcode: 'HTL' }, { ...island, lat: '' }, { ...island, lat: '95' }, { ...island, lat: '20' }, { ...island, name: 'Distant rock', lat: '2.9', fcode: 'RK' }, island] });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Pulau Rengis');
  assert.equal(result[0].distanceM, 230);
  assert.equal(result[0].broad, true);
  assert.throws(() => geoNamesCandidates(point, { status: { value: 10 } }), /unavailable/);
  assert.throws(() => geoNamesCandidates(point, {}), /Invalid/);
});
test('automatic enrichment resolves the sample without Overpass and preserves manual corrections', async () => {
  const t = trip({ locationName: 'My corrected name' });
  const result = await enrichTrip(t, {
    geographicNames: async () => geoNamesCandidates(point, { geonames: [island] }),
    locations: async () => { assert.fail('A clear GeoNames match must not wait on Overpass'); },
    zone: async () => 'Asia/Kuala_Lumpur', weather: async () => weather
  });
  const d = applyEnrichment(t, result).dives[0];
  assert.equal(d.enrichment.locationName, 'Pulau Rengis');
  assert.equal(d.enrichment.airTempC, 28);
  assert.deepEqual(d.enrichment.errors, []);
  assert.equal(effective(d).locationName, 'My corrected name');
  assert.equal(effective(d).waterTempC, 29);
});
test('GeoNames failure falls back to OSM and does not stop weather', async () => {
  const result = await enrichTrip(trip(), {
    geographicNames: async () => { throw Error('Quota'); },
    locations: async () => [{ lat: point.latitude, lon: point.longitude, tags: { name: 'Mapped reef', natural: 'reef' } }],
    zone: async () => 'Asia/Kuala_Lumpur', weather: async () => weather
  });
  assert.equal(result.get('d').locationName, 'Mapped reef');
  assert.equal(result.get('d').airTempC, 28);
});
test('missing GPS uses broad GeoNames areas, not the neighbouring dive rock', async () => {
  const t = trip(); t.dives.push({ ...t.dives[0], id: 'missing', garminStats: undefined });
  const result = await enrichTrip(t, {
    geographicNames: async () => [{ name: 'Small rock', kind: 'rock', broad: false, distanceM: 0 }, { name: 'Island', kind: 'island', broad: true, distanceM: 300 }],
    locations: async () => [], zone: async () => 'Asia/Kuala_Lumpur', weather: async () => weather
  });
  assert.equal(result.get('missing').locationName, 'Island');
});
test('GeoNames service sends account, feature filters and HTTPS, caches successful lookups', async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async url => {
    calls++; const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://secure.geonames.org');
    assert.equal(parsed.searchParams.get('username'), savedUsername);
    assert.ok(parsed.searchParams.getAll('featureCode').includes('RFC'));
    return Response.json({ geonames: [island] });
  };
  try {
    await saveGeoNamesUsername(' test-user ');
    assert.equal((await providers.geographicNames(point))[0].name, 'Pulau Rengis');
    await providers.geographicNames(point);
    assert.equal(calls, 1);
    await saveGeoNamesUsername('another-user');
    await providers.geographicNames(point);
    assert.equal(calls, 2, 'Changing accounts must not reuse another account cache');
    await saveGeoNamesUsername('');
    assert.deepEqual(await providers.geographicNames(point), []);
    assert.equal(calls, 2, 'Disabled GeoNames must not make requests or return cached names');
  } finally { global.fetch = original; }
});

test('GeoNames settings trim, persist, clear, and preserve saved value on failure', async () => {
  await saveGeoNamesUsername(' saved-user ');
  assert.equal(await getGeoNamesUsername(), 'saved-user');
  await assert.rejects(saveGeoNamesUsername('invalid user'), /valid GeoNames/);
  rejectStore = true;
  try { await assert.rejects(saveGeoNamesUsername('replacement'), /Storage failed/); }
  finally { rejectStore = false; }
  assert.equal(await getGeoNamesUsername(), 'saved-user');
  await saveGeoNamesUsername('  ');
  assert.equal(await getGeoNamesUsername(), '');
});
