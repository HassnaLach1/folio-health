// ZIP "store" format: preserves original bytes without another runtime dependency.
export interface ArchiveEntry { name: string; bytes: Uint8Array; }
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function archive(entries: ArchiveEntry[]) {
  if (!entries.length || entries.length > 20) throw new Error('Select between 1 and 20 documents.');
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const [index, entry] of entries.entries()) {
    const name = new TextEncoder().encode(`${index + 1}-${entry.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0,180)}`);
    if (offset + entry.bytes.length > 100 * 1024 * 1024) throw new Error('Share fewer documents: the selection exceeds 100 MB.');
    const crc = crc32(entry.bytes), header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true); // 1980-01-01; no private source timestamps.
    h.setUint32(14, crc, true); h.setUint32(18, entry.bytes.length, true); h.setUint32(22, entry.bytes.length, true); h.setUint16(26, name.length, true);
    header.set(name, 30); chunks.push(header, entry.bytes);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, entry.bytes.length, true); c.setUint32(24, entry.bytes.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46); directory.push(central);
    offset += header.length + entry.bytes.length;
  }
  const directoryLength = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, directoryLength, true); e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directoryLength + end.length);
  let position = 0;
  for (const chunk of [...chunks, ...directory, end]) { output.set(chunk, position); position += chunk.length; }
  return output;
}
