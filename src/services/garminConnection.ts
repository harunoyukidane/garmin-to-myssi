import * as SecureStore from 'expo-secure-store';
import { createGarminApi } from '../../shared/garminApi';
import { garminDownload } from './garminDownload';

const slot = 'garmin-personal-connection';
let cached: { accountId: string; api: ReturnType<typeof createGarminApi> } | undefined;
export async function getGarminConnection() {
  if (cached) return cached;
  const raw = await SecureStore.getItemAsync(slot);
  if (!raw) return undefined;
  try { const value = JSON.parse(raw); if (typeof value.key !== 'string' || typeof value.accountId !== 'string') throw Error(); cached = { accountId: value.accountId, api: createGarminApi(value.key, fetch, garminDownload) }; return cached; }
  catch { throw new Error('Saved Garmin connection is unreadable. Replace the key in Settings.'); }
}
export async function connectGarmin(key: string, signal?: AbortSignal) {
  if (!key.trim()) throw new Error('Enter your Garmin Personal API key.');
  const api = createGarminApi(key.trim(), fetch, garminDownload);
  const accountId = await api.validate(signal);
  if (signal?.aborted) throw new Error('Cancelled.');
  // One secure record: a failed validation never replaces the working key.
  try { await SecureStore.setItemAsync(slot, JSON.stringify({ key: key.trim(), accountId }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
  catch { api.clear(); throw new Error('Secure storage failed. The Garmin connection was not replaced.'); }
  cached?.api.clear(); cached = { accountId, api }; return cached;
}
export async function disconnectGarmin() { await SecureStore.deleteItemAsync(slot); cached?.api.clear(); cached = undefined; }
