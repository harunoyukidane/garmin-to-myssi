import { archiveLimits, checkCancelled } from './archive';
import { TripConfig } from './model';

const base = 'https://personal.connectapi.garmin.com';
const tokenPath = '/personalapitoken-service/personal-api/personal-api-key/token';
export const garminKeyUrl = 'https://connect.garmin.com/app/settings/personalApiToken';
export class GarminError extends Error { constructor(message: string, readonly authentication = false, readonly storage = false, readonly retryLater = false) { super(message); } }
export type Activity = { id: string; date: string };
type Request = typeof fetch;
export function createGarminApi(key: string, request: Request = fetch, downloadRequest: Request = request) {
  let token: string | undefined;
  const releases = new WeakMap<Response, () => void>();
  const release = (response: Response) => { releases.get(response)?.(); releases.delete(response); };
  async function http(path: string, method: string, authorization: string, signal?: AbortSignal, status?: (text: string) => void): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      checkCancelled(signal);
      const controller = new AbortController();
      const abort = () => controller.abort(); signal?.addEventListener('abort', abort);
      const timeout = setTimeout(abort, 30000);
      const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
      let response: Response;
      try { response = await (path.startsWith('/download-service/') ? downloadRequest : request)(base + path, { method, headers: { Authorization: authorization, Accept: '*/*' }, signal: controller.signal, redirect: 'error' }); }
      catch (e) { cleanup(); checkCancelled(signal); if (e instanceof GarminError) throw e; throw new GarminError('Garmin could not be reached. Check your connection and retry.'); }
      releases.set(response, cleanup);
      if (!response.ok) release(response);
      if (response.status === 401 || response.status === 403) return response;
      if (response.ok) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const guidance = response.headers.get('Retry-After');
        const seconds = guidance ? (/^\d+$/.test(guidance) ? Number(guidance) : (Date.parse(guidance) - Date.now()) / 1000) : 2 ** attempt;
        if (!Number.isFinite(seconds) || seconds > 30) throw new GarminError('Garmin requested a longer wait. Retry later.', false, false, true);
        status?.(`Garmin is busy. Retrying in ${Math.max(1, Math.ceil(seconds))} seconds…`);
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new Error('Cancelled.')); };
          const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, Math.max(1, seconds) * 1000);
          signal?.addEventListener('abort', cancel, { once: true });
          if (signal?.aborted) cancel();
        });
        continue;
      }
      throw new GarminError(`Garmin request failed (HTTP ${response.status}). ${response.status === 429 ? 'Request limit reached; retry later.' : 'Retry later.'}`, false, false, response.status === 429);
    }
  }
  async function authenticate(signal?: AbortSignal) {
    const response = await http(tokenPath, 'POST', `ApiKey ${key}`, signal);
    if (!response.ok) throw new GarminError('Garmin key rejected, expired or revoked. Replace the key in Settings.', true);
    let text: string;
    try { text = (await response.text()).trim(); } finally { release(response); }
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) throw new GarminError('Garmin returned an unsupported token format.');
    token = text;
  }
  async function get(path: string, signal?: AbortSignal, status?: (text: string) => void) {
    if (!token) await authenticate(signal);
    let response = await http(path, 'GET', `Bearer ${token}`, signal, status);
    if (response.status === 401) { token = undefined; await authenticate(signal); response = await http(path, 'GET', `Bearer ${token}`, signal, status); }
    if (response.status === 401 || response.status === 403) throw new GarminError('Garmin access was rejected. Replace the key in Settings or check its permissions.', true);
    return response;
  }
  async function json(path: string, signal?: AbortSignal, status?: (text: string) => void): Promise<any> {
    let response: Response | undefined;
    try { response = await get(path, signal, status); return await response.json(); }
    catch (e) { if (e instanceof GarminError || signal?.aborted) throw e; throw new GarminError('Garmin returned an unreadable response. Retry later.'); }
    finally { if (response) release(response); }
  }
  return {
    clear: () => { token = undefined; },
    validate: async (signal?: AbortSignal): Promise<string> => {
      const profile = await json('/userprofile-service/userprofile/settings', signal);
      const id = profile?.userData?.userProfilePK ?? profile?.userData?.userProfileId ?? profile?.userData?.id ?? profile?.userProfilePK ?? profile?.userProfileId ?? profile?.id;
      // The Personal API's UserSettingsDTO supplies displayName, not a numeric ID.
      // Retain numeric identities for existing connections; namespace the account
      // handle so it cannot collide with a numeric identity. Never use a key or
      // short-lived bearer token as the account identity.
      const displayName = profile?.displayName;
      const accountId = ['string', 'number'].includes(typeof id) && /^\d+$/.test(String(id)) ? String(id)
        : typeof displayName === 'string' && displayName.length > 0 && displayName.length <= 256 && displayName === displayName.trim() && !/[\u0000-\u001f\u007f]/.test(displayName) ? `displayName:${displayName}` : undefined;
      if (!accountId) throw new GarminError('Garmin did not provide a supported account identity. Connection was not saved.');
      const list = await json('/activitylist-service/activities/search/activities?start=0&limit=1', signal);
      if (!Array.isArray(list)) throw new GarminError('Garmin returned an unsupported activity list. Connection was not saved.');
      return accountId;
    },
    activities: async (config: TripConfig, signal?: AbortSignal, status?: (text: string) => void): Promise<Activity[]> => {
      const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
      const seen = new Set<string>(), result: Activity[] = [];
      for (let start = 0; start < 100000;) {
        checkCancelled(signal);
        const rows = await json(`/activitylist-service/activities/search/activities?start=${start}&limit=100&startDate=${shift(config.tripStartDate, -1)}&endDate=${shift(config.tripEndDate, 1)}`, signal, status);
        if (!Array.isArray(rows)) throw new GarminError('Unsupported activity pagination response. Sync is incomplete.');
        if (!rows.length) return result;
        let added = 0;
        for (const row of rows) {
          const id = String(row?.activityId);
          if (!/^\d+$/.test(id)) throw new GarminError('Garmin returned an activity without a supported identifier. Sync is incomplete.');
          if (!seen.has(id)) { seen.add(id); result.push({ id, date: typeof row.startTimeGMT === 'string' ? row.startTimeGMT : 'Date unavailable' }); added++; }
        }
        if (!added) throw new GarminError('Garmin repeated an activity page. Sync is incomplete; retry later.');
        // Continue until an empty page: do not assume Garmin honors the requested page size.
        if (rows.length > 100) throw new GarminError('Garmin returned an unsupported page size. Sync is incomplete.');
        start += rows.length;
      }
      throw new GarminError('Activity query limit reached. Choose a smaller trip window.');
    },
    download: async (id: string, signal?: AbortSignal, status?: (text: string) => void): Promise<Uint8Array> => {
      if (!/^\d+$/.test(id)) throw new GarminError('Invalid activity identifier.');
      const response = await get(`/download-service/files/activity/${id}`, signal, status);
      try {
      if (Number(response.headers.get('Content-Length')) > archiveLimits.compressed) throw new GarminError('Activity archive exceeds the 32 MB download limit.');
      // RN supports arrayBuffer; use streams when supplied by the runtime to bound reads sooner.
      const reader = response.body?.getReader?.();
      let bytes: Uint8Array;
      if (reader) {
        const chunks: Uint8Array[] = []; let size = 0;
        try { while (true) { checkCancelled(signal); const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > archiveLimits.compressed) throw new GarminError('Activity archive exceeds the 32 MB download limit.'); chunks.push(chunk.value); } }
        finally { await reader.cancel().catch(() => undefined); }
        bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      checkCancelled(signal);
      if (!bytes.length || bytes.length > archiveLimits.compressed) throw new GarminError('Activity archive is empty or exceeds the 32 MB download limit.');
      return bytes;
      } catch (e) { if (e instanceof GarminError || signal?.aborted) throw e; throw new GarminError('Activity download was interrupted. Retry this activity.'); }
      finally { release(response); }
    }
  };
}
export type GarminApi = ReturnType<typeof createGarminApi>;
