import * as SecureStore from 'expo-secure-store';

const slot = 'geonames-username';
export async function getGeoNamesUsername(): Promise<string> {
  return (await SecureStore.getItemAsync(slot))?.trim() || '';
}
export async function saveGeoNamesUsername(value: string): Promise<void> {
  const username = value.trim();
  if (username && !/^[A-Za-z0-9_.-]{1,100}$/.test(username)) throw new Error('Enter a valid GeoNames username (letters, numbers, dots, underscores or hyphens).');
  if (username) await SecureStore.setItemAsync(slot, username, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(slot);
}
