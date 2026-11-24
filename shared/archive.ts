import { Inflate, strFromU8 } from 'fflate';

export const archiveLimits = { compressed: 32 * 1024 * 1024, entries: 128, total: 80 * 1024 * 1024, source: 20 * 1024 * 1024, ratio: 200 };
export type ArchiveEntry = { name: string; bytes: Uint8Array };
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); return c >>> 0; });
function crc(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) c = (c >>> 8) ^ crcTable[(c ^ b) & 255]; return (c ^ 0xffffffff) >>> 0; }
export function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new Error('Cancelled.'); }

/** Never extract user paths. Validate the entire directory before inflating any entry. */
export async function extractArchive(bytes: Uint8Array, signal?: AbortSignal): Promise<{ files: ArchiveEntry[]; unsupported: string[] }> {
  const fail = () => { throw new Error('Unsafe, malformed, encrypted or oversized ZIP archive.'); };
  if (bytes.length > archiveLimits.compressed || bytes.length < 22) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => view.getUint16(p, true), u32 = (p: number) => view.getUint32(p, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) return fail();
  const count = u16(end + 10), directory = u32(end + 16), directorySize = u32(end + 12);
  if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count > archiveLimits.entries || directory + directorySize !== end) return fail();
  const entries: { name: string; size: number; compressed: number; method: number; offset: number; crc: number }[] = [];
  let p = directory, total = 0;
  const names = new Set<string>(), ranges: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    checkCancelled(signal);
    if (p + 46 > end || u32(p) !== 0x02014b50) return fail();
    const flags = u16(p + 8), method = u16(p + 10), compressed = u32(p + 20), size = u32(p + 24), len = u16(p + 28), extra = u16(p + 30), comment = u16(p + 32), local = u32(p + 42);
    if (p + 46 + len + extra + comment > end || local + 30 > directory) return fail();
    const nameBytes = bytes.subarray(p + 46, p + 46 + len), name = strFromU8(nameBytes);
    if (!name || /[\\\x00-\x1f:]/.test(name) || name.startsWith('/') || name.split('/').some(s => s === '..' || s === '.') || names.has(name)) return fail();
    names.add(name);
    const mode = u32(p + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000 || flags & (1 | 64) || ![0, 8].includes(method) || size === 0xffffffff || compressed === 0xffffffff || u16(p + 34)) return fail();
    total += size;
    if (size > archiveLimits.source || total > archiveLimits.total || size > Math.max(compressed, 1) * archiveLimits.ratio) return fail();
    if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== len) return fail();
    const start = local + 30, offset = start + len + u16(local + 28);
    if (offset + compressed > directory || nameBytes.some((b, j) => bytes[start + j] !== b) || ranges.some(([a, b]) => local < b && offset + compressed > a)) return fail();
    ranges.push([local, offset + compressed]);
    entries.push({ name, size, compressed, method, offset, crc: u32(p + 16) });
    p += 46 + len + extra + comment;
  }
  if (p !== end) return fail();
  const files: ArchiveEntry[] = [], unsupported: string[] = [];
  for (const entry of entries) {
    checkCancelled(signal);
    if (entry.name.endsWith('/')) continue;
    if (!/\.(fit|csv)$/i.test(entry.name)) { unsupported.push(entry.name); continue; }
    const output = new Uint8Array(entry.size); let written = 0;
    const append = (chunk: Uint8Array) => { written += chunk.length; if (written > entry.size || written > archiveLimits.source) return fail(); output.set(chunk, written - chunk.length); };
    if (entry.method === 0) append(bytes.subarray(entry.offset, entry.offset + entry.compressed));
    else {
      const inflater = new Inflate(append);
      for (let n = 0; n < entry.compressed; n += 1024) {
        checkCancelled(signal);
        inflater.push(bytes.subarray(entry.offset + n, entry.offset + Math.min(n + 1024, entry.compressed)), n + 1024 >= entry.compressed);
        if (n % 65536 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (written !== entry.size || crc(output) !== entry.crc) return fail();
    files.push({ name: entry.name, bytes: output });
  }
  return { files, unsupported };
}
