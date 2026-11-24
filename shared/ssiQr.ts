import qrcode from 'qrcode-generator';
import { Dive, SequencedDive, Trip, TripConfig } from './model';
import { diveLocalTime } from './diveTime';
import { conditionFields, conditionOptions, resolveSsiConditions, SsiConditions } from './ssiConditions';

// Compact SSI dive-sharing fields observed in the public Garmin/Suunto helpers.
// https://github.com/shaevitz/suunto-to-ssi-qr/blob/main/web-core.mjs
export function ssiPayload(dive: SequencedDive, config: TripConfig, defaults?: SsiConditions): string {
  const diveType = (dive.diveKind === 'freedive' ? 6 : dive.diveKind === 'ccr' ? 8 : 0);
  if (dive.maxDepthM === undefined || !Number.isFinite(dive.maxDepthM) || dive.maxDepthM < 0) throw new Error('Add a valid maximum depth before creating the SSI code.');
  if (dive.durationSec === undefined || !Number.isFinite(dive.durationSec) || dive.durationSec <= 0) throw new Error('Add a valid duration before creating the SSI code.');
  const minutes = Math.round(dive.durationSec / 60);
  if (minutes < 1) throw new Error('SSI QR duration must round to at least one minute.');
  const datetime = diveLocalTime(dive, config).slice(0, 16).replace(/[- :]/g, '');
  const fields = ['dive', 'noid', `dive_type:${diveType}`, `divetime:${minutes}`, `datetime:${datetime}`, `depth_m:${dive.maxDepthM.toFixed(1)}`, 'user_firstname:', 'user_lastname:'];
  if (dive.waterTempC !== undefined && Number.isFinite(dive.waterTempC)) fields.push(`watertemp_c:${Number(dive.waterTempC.toFixed(1))}`);
  if (dive.maxWaterTempC !== undefined && Number.isFinite(dive.maxWaterTempC)) fields.push(`watertemp_max_c:${Number(dive.maxWaterTempC.toFixed(1))}`);
  if (dive.garminStats?.waterType === 'fresh') fields.push('var_watertype_id:4');
  if (dive.garminStats?.waterType === 'salt') fields.push('var_watertype_id:5');
  const conditions = resolveSsiConditions(dive.ssiConditions, dive.ssiConditionOverrides, defaults);
  for (const key of conditionFields) if (conditions[key] != null) fields.push(`${conditionOptions[key].qr}:${conditions[key]}`);
  if (dive.ssiAirTempC !== undefined) {
    if (!Number.isFinite(dive.ssiAirTempC) || dive.ssiAirTempC < -100 || dive.ssiAirTempC > 70) throw new Error('Enter a valid air temperature.');
    fields.push(`airtemp_c:${Number(dive.ssiAirTempC.toFixed(1))}`);
  }
  return fields.join(';');
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(value: number): Uint8Array { return Uint8Array.of(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255); }
function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0)); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; } return output;
}
function chunk(type: string, bytes: Uint8Array): Uint8Array {
  const content = concat(Uint8Array.from([...type].map(c => c.charCodeAt(0))), bytes);
  return concat(u32(bytes.length), content, u32(crc32(content)));
}
export function bytesBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? alphabet[c & 63] : '=');
  }
  return result;
}
export function qrPng(payload: string, scale = 8): { base64: string; width: number } {
  if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new Error('Invalid QR image scale.');
  const qr = qrcode(0, 'M'); qr.addData(payload, 'Byte'); qr.make();
  const count = qr.getModuleCount(), width = (count + 8) * scale;
  // Grayscale PNG with a four-module white quiet zone.
  const raw = new Uint8Array((width + 1) * width);
  for (let y = 0; y < width; y++) {
    const row = Math.floor(y / scale) - 4;
    for (let x = 0; x < width; x++) {
      const col = Math.floor(x / scale) - 4;
      raw[y * (width + 1) + x + 1] = row >= 0 && col >= 0 && row < count && col < count && qr.isDark(row, col) ? 0 : 255;
    }
  }
  // Stored DEFLATE blocks need no native compression module or Node runtime.
  const blocks: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  for (let offset = 0; offset < raw.length; offset += 65535) {
    const length = Math.min(65535, raw.length - offset), last = offset + length === raw.length;
    blocks.push(Uint8Array.of(last ? 1 : 0, length & 255, length >> 8, (~length) & 255, ((~length) >> 8) & 255), raw.slice(offset, offset + length));
  }
  let a = 1, b = 0; for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  blocks.push(u32(((b << 16) | a) >>> 0));
  const png = concat(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', concat(u32(width), u32(width), Uint8Array.of(8, 0, 0, 0, 0))), chunk('IDAT', concat(...blocks)), chunk('IEND', new Uint8Array()));
  return { base64: bytesBase64(png), width };
}

export function ssiAirTemperature(dive: Dive, trip: Pick<Trip, 'ssiAirTempC'>): number | undefined {
  return dive.ssiAirTempC ?? (dive.airTempManual ? undefined : trip.ssiAirTempC ?? dive.enrichment?.airTempC);
}
