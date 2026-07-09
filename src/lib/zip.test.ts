import { describe, expect, it } from "vitest";

import { crc32, createZip } from "./zip";

const enc = new TextEncoder();

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8);
}
function u32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at]! |
      (bytes[at + 1]! << 8) |
      (bytes[at + 2]! << 16) |
      (bytes[at + 3]! << 24)) >>>
    0
  );
}

describe("crc32", () => {
  it("matches known IEEE 802.3 test vectors", () => {
    expect(crc32(enc.encode(""))).toBe(0);
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(
      crc32(enc.encode("The quick brown fox jumps over the lazy dog")),
    ).toBe(0x414fa339);
  });
});

describe("createZip", () => {
  it("writes a valid local header for a single stored entry", () => {
    const zip = createZip([{ name: "hello.txt", data: "hello" }]);
    // Local file header signature.
    expect(u32(zip, 0)).toBe(0x04034b50);
    // Stored (method 0), no compression.
    expect(u16(zip, 8)).toBe(0);
    // CRC + sizes match the payload.
    expect(u32(zip, 14)).toBe(crc32(enc.encode("hello")));
    expect(u32(zip, 18)).toBe(5); // compressed size
    expect(u32(zip, 22)).toBe(5); // uncompressed size
    expect(u16(zip, 26)).toBe("hello.txt".length);
    // Filename follows the 30-byte header.
    expect(new TextDecoder().decode(zip.subarray(30, 39))).toBe("hello.txt");
    // Payload is stored verbatim right after the name.
    expect(new TextDecoder().decode(zip.subarray(39, 44))).toBe("hello");
  });

  it("records every entry in the end-of-central-directory record", () => {
    const zip = createZip([
      { name: "a.md", data: "one" },
      { name: "b.md", data: "two" },
      { name: "recipes.json", data: "[]" },
    ]);
    // EOCD signature appears (search from the end).
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i -= 1) {
      if (u32(zip, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    expect(u16(zip, eocd + 8)).toBe(3); // entries on this disk
    expect(u16(zip, eocd + 10)).toBe(3); // total entries
    // Central directory offset points at a central header signature.
    const cdOffset = u32(zip, eocd + 16);
    expect(u32(zip, cdOffset)).toBe(0x02014b50);
  });

  it("round-trips UTF-8 filenames and content", () => {
    const zip = createZip([{ name: "café.md", data: "Crème brûlée" }]);
    // General-purpose bit 11 (UTF-8) is set.
    expect(u16(zip, 6) & 0x0800).toBe(0x0800);
    const nameLen = u16(zip, 26);
    const name = new TextDecoder().decode(zip.subarray(30, 30 + nameLen));
    expect(name).toBe("café.md");
  });

  it("produces an empty but valid archive for no entries", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22); // EOCD only
    expect(u32(zip, 0)).toBe(0x06054b50);
    expect(u16(zip, 10)).toBe(0);
  });
});
