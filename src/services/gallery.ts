import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

export async function prepareGallery() {
  if (Platform.OS !== 'android' || typeof NativeModules.QrGallery?.savePng !== 'function') throw new Error('Gallery export requires the installed Android APK. Use Export to folder in other builds.');
  if (Number(Platform.Version) < 29) {
    const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
    if (!await PermissionsAndroid.check(permission)) {
      const result = await PermissionsAndroid.request(permission, { title: 'Save dive QR images', message: 'Save the generated QR images in Pictures so you can select them from MySSI’s gallery.', buttonPositive: 'Allow', buttonNegative: 'Cancel' });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Storage permission was not granted. You can use Export to folder instead.');
    }
  }
}
export async function writeGalleryImage(fileName: string, base64: string): Promise<void> {
  await NativeModules.QrGallery.savePng(base64, fileName);
}
