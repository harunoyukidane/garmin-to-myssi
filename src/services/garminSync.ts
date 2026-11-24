import * as FileSystem from 'expo-file-system';
import { Trip, ImportReport } from '../../shared/model';
import { Activity } from '../../shared/garminApi';
import { syncGarmin, SyncStorageError } from '../../shared/garminSync';
import { getGarminConnection } from './garminConnection';
import { importFile, prepareFile, temporarySources } from './fileImport';

type Transaction = (id: string, change: (trip: Trip) => Promise<Trip>) => Promise<void>;
export async function syncTrip(trip: Trip, transact: Transaction, signal: AbortSignal, progress: (text: string) => void, retry?: Activity[]) {
  const connection = await getGarminConnection();
  if (!connection) throw new Error('Connect Garmin in Settings first.');
  const accountId = connection.accountId;
  return syncGarmin({ api: connection.api, accountId, config: { ...trip.config }, signal, progress, retry,
    checkpoint: async (result, success) => {
      try { await transact(trip.id, async current => ({ ...current, garminSync: result, garminLastSuccess: success ? result.completedAt : current.garminLastSuccess })); }
      catch { throw new SyncStorageError('Could not save sync progress. Imports already committed are kept. Reload saved trips before retrying.'); }
    },
    commit: async (activity, bytes) => {
      const prepared = await temporarySources(bytes, `${activity.id}.zip`, signal);
      const copies: string[] = [];
      try {
        const fits = prepared.files.filter(f => /\.fit$/i.test(f.name));
        if (!fits.length) throw new Error('Activity archive contains no FIT files.');
        const files = await Promise.all(fits.map(prepareFile));
        if (signal.aborted) throw new Error('Cancelled.');
        let report: ImportReport = { accepted: 0, duplicates: 0, outsideTrip: 0, failures: [], conflicts: [] };
        // Parsing/copying and persistence run against the latest trip in one repository turn.
        try { await transact(trip.id, async current => {
          if (signal.aborted) throw new Error('Cancelled.');
          let next = current;
          for (const file of files) {
            const result = await importFile(next, file, undefined, false, { accountId, activityId: activity.id });
            next = result.trip; if (result.copiedUri) copies.push(result.copiedUri);
            report.accepted += result.report.accepted; report.duplicates += result.report.duplicates;
            report.conflicts.push(...result.report.conflicts); report.failures.push(...result.report.failures);
          }
          return next;
        }); }
        catch (e) { if (e instanceof Error && /Save failed|Load saved data|Trip no longer/.test(e.message)) throw new SyncStorageError('Activity could not be saved. Reload saved trips before retrying.'); throw e; }
        return report;
      } catch (e) {
        // A failed primary promotion may already reference these sources. Retain them on storage failures.
        if (!(e instanceof SyncStorageError)) for (const uri of copies) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        throw e;
      } finally { await prepared.cleanup().catch(() => undefined); }
    }
  });
}
