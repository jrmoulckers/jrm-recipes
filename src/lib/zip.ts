/**
 * A tiny, dependency-free ZIP writer (issue #420).
 *
 * "Download my whole cookbook" must work entirely on our own servers with no
 * third party involved (a wary user's whole reason for wanting a backup), so we
 * assemble the archive ourselves instead of pulling in a zip dependency. Entries
 * are STORED (no compression) which keeps the format trivial and 100%
 * interoperable — recipe Markdown/JSON is small, so the size cost is negligible
 * and every OS (Windows Explorer, macOS, `unzip`) opens it.
 *
 * Implements just the subset of the ZIP spec (APPNOTE) we need: a local file
 * header + data per entry, a central directory, and an end-of-central-directory
 * record. Filenames are treated as UTF-8 (general-purpose bit 11 set).
 */

export type ZipEntry = {
  /** Path within the archive, e.g. "recipes/banana-bread.md". */
  name: string;
  /** File contents. Strings are encoded as UTF-8. */
  data: string | Uint8Array;
};

const encoder = new TextEncoder();

// Precomputed CRC-32 (IEEE 802.3, polynomial 0xEDB88320) lookup table.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

/**
 * Build a STORED (uncompressed) ZIP archive from the given entries.
 *
 * Fixed DOS timestamp (1980-01-01) keeps output deterministic; the spec forbids
 * a zero date, so the minimum valid value is used.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021; // 1980-01-01
  const UTF8_FLAG = 0x0800; // general-purpose bit 11: filename is UTF-8

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = toBytes(entry.data);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name + data).
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed to extract (2.0)
    lv.setUint16(6, UTF8_FLAG, true); // general purpose bit flag
    lv.setUint16(8, 0, true); // compression method: 0 = stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size (== uncompressed, stored)
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    localChunks.push(local, dataBytes);

    // Central directory header (46 bytes + name).
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central file header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed to extract
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true); // compression method
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra field length
    cv.setUint16(32, 0, true); // file comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal file attributes
    cv.setUint32(38, 0, true); // external file attributes
    cv.setUint32(42, offset, true); // relative offset of local header
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
  const centralOffset = offset;

  // End of central directory record (22 bytes, no archive comment).
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // number of this disk
  ev.setUint16(6, 0, true); // disk with central directory
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true); // archive comment length

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [...localChunks, ...centralChunks, eocd]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
