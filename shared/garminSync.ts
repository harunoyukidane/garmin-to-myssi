import { Activity, GarminApi, GarminError } from './garminApi';
import { ImportReport, SyncResult, TripConfig } from './model';

let active = false;
export class SyncStorageError extends Error {}
export async function syncGarmin(options: {
  api: GarminApi; accountId: string; config: TripConfig; signal: AbortSignal;
  retry?: Activity[]; progress: (message: string) => void;
  commit: (activity: Activity, bytes: Uint8Array) => Promise<ImportReport>;
  checkpoint: (result: SyncResult, fullySuccessful: boolean) => Promise<void>;
}): Promise<SyncResult> {
  if (active) throw new Error('Another Garmin sync is running.');
  active = true;
  const { api, accountId, signal, progress, checkpoint } = options;
  const result: SyncResult = { accountId, attemptedAt: new Date().toISOString(), added: 0, duplicates: 0, activities: 0, failures: [], conflicts: [], cancelled: false };
  try {
    await checkpoint({ ...result }, false);
    progress('Finding dives…');
    let activities: Activity[];
    try { activities = options.retry ?? await api.activities({ ...options.config }, signal, progress); }
    catch (e) {
      if (!signal.aborted) { result.queryFailed = true; result.failures.push({ activityId: 'query', date: '', reason: e instanceof GarminError ? e.message : 'Activity search failed. Check your connection and retry.' }); }
      activities = [];
    }
    for (const [i, activity] of activities.entries()) {
      if (signal.aborted) break;
      try {
        progress(`Downloading activity ${i + 1} of ${activities.length}`);
        const bytes = await api.download(activity.id, signal, progress);
        if (signal.aborted) break;
        progress(`Importing activity ${i + 1} of ${activities.length}`);
        const report = await options.commit(activity, bytes);
        result.added += report.accepted; result.duplicates += report.duplicates; result.activities++;
        result.conflicts.push(...report.conflicts.map(message => `Activity ${activity.id}: ${message}`));
        if (report.failures.length) result.failures.push({ activityId: activity.id, date: activity.date, reason: report.failures.join('\n') });
      } catch (e) {
        if (e instanceof SyncStorageError || (e instanceof GarminError && e.storage)) throw new SyncStorageError(`Activity ${activity.id} (${activity.date}) was not completed: ${e.message}`);
        if (signal.aborted) break;
        result.failures.push({ activityId: activity.id, date: activity.date, reason: e instanceof GarminError ? e.message : 'Activity file is corrupt, unsupported or could not be prepared. Try importing its original export manually.' });
        if (e instanceof GarminError && (e.authentication || e.retryLater)) {
          for (const pending of activities.slice(i + 1)) result.failures.push({ activityId: pending.id, date: pending.date, reason: e.authentication ? 'Not attempted because Garmin authentication failed. Replace the key and retry.' : 'Not attempted because Garmin requested a wait. Retry later.' });
          break;
        }
      }
      await checkpoint({ ...result, failures: [...result.failures], conflicts: [...result.conflicts] }, false);
    }
    result.cancelled = signal.aborted;
    result.completedAt = new Date().toISOString();
    await checkpoint(result, !result.cancelled && !result.failures.length && !result.conflicts.length && !options.retry);
    return result;
  } finally { active = false; }
}
