import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // 8-bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // default compression
  ihdr[11] = 0; // default filter
  ihdr[12] = 0; // no interlace

  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(rowBytes * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outerR = size * 0.48;
  const innerR = size * 0.38;

  const micTop = size * 0.22;
  const micBottom = size * 0.58;
  const micHalfW = size * 0.11;
  const stemTop = size * 0.62;
  const stemBottom = size * 0.78;
  const baseTop = size * 0.80;
  const baseBottom = size * 0.84;
  const baseHalfW = size * 0.18;

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 0, g = 0, b = 0, a = 0;
      if (dist <= outerR) {
        // Dark ring background
        r = 15; g = 15; b = 18; a = 255;
        if (dist <= innerR) {
          const inMicBody = (Math.abs(dx) <= micHalfW) && (y >= micTop) && (y <= micBottom);
          const inMicTopCap = (Math.hypot(dx, y - micTop) <= micHalfW) && (y <= micTop);
          const inMicBottomCap = (Math.hypot(dx, y - micBottom) <= micHalfW) && (y >= micBottom);
          const inStem = (Math.abs(dx) <= size * 0.03) && (y >= stemTop) && (y <= stemBottom);
          const inBase = (Math.abs(dx) <= baseHalfW) && (y >= baseTop) && (y <= baseBottom);

          if (inMicBody || inMicTopCap || inMicBottomCap || inStem || inBase) {
            r = 239; g = 68; b = 68; a = 255;
          } else {
            r = 20; g = 20; b = 24; a = 255;
          }
        }
      }
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [16, 48, 128]) {
  const png = makeIcon(size);
  writeFileSync(join(iconsDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png (${png.length} bytes)`);
}
