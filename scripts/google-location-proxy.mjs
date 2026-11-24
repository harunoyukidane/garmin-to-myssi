// Deploy behind HTTPS and an authenticated/rate-limited gateway. Never bundle this key in Expo.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createGoogleLocationHandler({ key, dailyLimit = 100, fetcher = fetch } = {}) {
  let day = '', used = 0;
  async function request(url, options) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; used = 0; }
    if (++used > dailyLimit) throw new Error('Daily provider request limit reached.');
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Google lookup unavailable.');
    return response.json();
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    try {
      if (req.method !== 'GET' || !key) { res.writeHead(503); res.end('{}'); return; }
      const url = new URL(req.url, 'https://localhost');
      if (!url.searchParams.has('latitude') || !url.searchParams.has('longitude')) throw new Error('Missing coordinates.');
      const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid coordinates.');
      const places = url.searchParams.get('broadOnly') === '1' ? { places: [] } : await request('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.types,places.location,places.attributions' },
        body: JSON.stringify({ textQuery: 'dive site reef beach', pageSize: 10, locationBias: { circle: { center: { latitude, longitude }, radius: 500 } } })
      });
      // Text-search bias is not a distance restriction. Check every returned position and omit businesses.
      const names = (places.places || []).filter(p => {
        const lat = p.location?.latitude, lon = p.location?.longitude;
        const meters = Math.hypot((lat - latitude) * 111195, (lon - longitude) * 111195 * Math.cos(latitude * Math.PI / 180));
        return meters <= 500 && !(p.attributions?.length) && (p.types || []).some(t => ['natural_feature', 'beach'].includes(t)) && !(p.types || []).some(t => ['store', 'school', 'travel_agency', 'sporting_goods_store'].includes(t));
      }).map(p => p.displayName?.text).filter(Boolean);
      const geo = await request(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&result_type=locality|administrative_area_level_2|administrative_area_level_1&key=${encodeURIComponent(key)}`);
      if (geo.status !== 'OK' && geo.status !== 'ZERO_RESULTS') throw new Error('Google geocoding unavailable.');
      const broad = geo.results?.[0]?.address_components?.find(c => c.types?.some(t => ['locality', 'administrative_area_level_2', 'administrative_area_level_1'].includes(t)))?.long_name;
      res.end(JSON.stringify({ names: [...new Set([...names, broad].filter(Boolean))].slice(0, 4) }));
    } catch { res.writeHead(503); res.end(JSON.stringify({ names: [] })); }
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const limit = Number(process.env.GOOGLE_DAILY_REQUEST_LIMIT || 100);
  if (!process.env.GOOGLE_MAPS_API_KEY || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Set GOOGLE_MAPS_API_KEY and a positive GOOGLE_DAILY_REQUEST_LIMIT.');
  createServer(createGoogleLocationHandler({ key: process.env.GOOGLE_MAPS_API_KEY, dailyLimit: limit })).listen(Number(process.env.PORT || 8787), '127.0.0.1');
}
