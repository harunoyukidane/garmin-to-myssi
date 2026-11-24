import * as FileSystem from 'expo-file-system';
import { archiveLimits } from '../../shared/archive';
import { GarminError } from '../../shared/garminApi';
import { base64Bytes } from '../../shared/domain';
import { newId } from '../../shared/model';

/** Native disk download bounds memory even on RN versions without fetch streams. */
export const garminDownload: typeof fetch = async (url, options) => {
  if (!FileSystem.cacheDirectory) throw new GarminError('Temporary storage is unavailable.', false, true);
  const root = `${FileSystem.cacheDirectory}garmin-download-${newId()}/`;
  const signal = options?.signal;
  let oversized = false;
  if (signal?.aborted) throw new Error('Cancelled.');
  try {
    if (await FileSystem.getFreeDiskStorageAsync() < archiveLimits.compressed) throw new GarminError('Free at least 32 MB of storage before syncing.', false, true);
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    let task: FileSystem.DownloadResumable;
    const pause = () => { void task.pauseAsync().catch(() => undefined); };
    task = FileSystem.createDownloadResumable(String(url), `${root}activity.zip`, { headers: options?.headers as Record<string, string> }, event => {
      if (event.totalBytesWritten > archiveLimits.compressed || event.totalBytesExpectedToWrite > archiveLimits.compressed) { oversized = true; pause(); }
    });
    signal?.addEventListener('abort', pause, { once: true });
    try {
      if (signal?.aborted) throw new Error('Cancelled.');
      const result = await task.downloadAsync();
      if (oversized) throw new GarminError('Activity archive exceeds the 32 MB download limit.');
      if (signal?.aborted || !result) throw new Error('Download stopped.');
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.isDirectory || info.size > archiveLimits.compressed) throw new GarminError('Activity archive is unavailable or exceeds the 32 MB download limit.');
      // Error bodies are never read or exposed in diagnostics.
      const bytes = result.status >= 200 && result.status < 300 ? base64Bytes(await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 })) : new Uint8Array();
      return { status: result.status, ok: result.status >= 200 && result.status < 300, headers: new Headers(result.headers), body: null, arrayBuffer: async () => bytes.buffer } as Response;
    } finally { signal?.removeEventListener('abort', pause); }
  } catch (e) {
    if (oversized) throw new GarminError('Activity archive exceeds the 32 MB download limit.');
    if (e instanceof GarminError || signal?.aborted) throw e;
    if (e instanceof Error && /ENOSPC|disk full|no space|permission|EACCES/i.test(e.message)) throw new GarminError('Activity could not be written to temporary storage. Free space and retry.', false, true);
    throw new GarminError('Activity download was interrupted. Check your connection and retry.');
  } finally { await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => undefined); }
};
