import * as FileSystem from 'expo-file-system';
import { createRepository } from '../../shared/repository';

export function appDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error('Local document storage is unavailable.');
  return `${FileSystem.documentDirectory}dive-log/`;
}
export async function ensureDirectories() {
  await FileSystem.makeDirectoryAsync(appDirectory(), { intermediates: true });
  await FileSystem.makeDirectoryAsync(`${appDirectory()}sources/`, { intermediates: true });
}
export const repository = createRepository({
  exists: async name => (await FileSystem.getInfoAsync(appDirectory() + name)).exists,
  read: name => FileSystem.readAsStringAsync(appDirectory() + name),
  write: (name, body) => FileSystem.writeAsStringAsync(appDirectory() + name, body),
  copy: (from, to) => FileSystem.copyAsync({ from: appDirectory() + from, to: appDirectory() + to }),
  remove: name => FileSystem.deleteAsync(appDirectory() + name, { idempotent: true }),
  move: (from, to) => FileSystem.moveAsync({ from: appDirectory() + from, to: appDirectory() + to })
});
