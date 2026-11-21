/**
 * Bộ đọc/ghi Excel (.xlsx) & CSV thuần JavaScript (Zero Dependencies, 100% Client-Side):
 * - Đọc .xlsx chuẩn OOXML bằng ZIP Central Directory + DecompressionStream('deflate-raw') (Chrome/Edge) hoặc zlib (Node test).
 * - Ghi .xlsx chuẩn OOXML định dạng sẵn kiểu Text (@) cho cả 5 cột để Excel KHÔNG tự cắt số 0 đầu của MST.
 * - Đọc .csv (hỗ trợ UTF-8 BOM, dấu phẩy/chấm phẩy, ô có dấu ngoặc kép) và file .xls dạng HTML/TSV.
 */

// ==================== CRC32 (cho tạo file ZIP/.xlsx chuẩn) ====================
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ==================== XML Helpers ====================
function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str) {
  return String(str ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function colLettersToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function indexToColLetters(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ==================== Decompression (Browser + Node) ====================
async function inflateRawBytes(compressedBytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    let totalLen = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  // Fallback môi trường Node.js (khi chạy Unit Test)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const zlib = await import('node:zlib');
    return new Uint8Array(zlib.inflateRawSync(compressedBytes));
  }
  throw new Error('Trình duyệt không hỗ trợ giải nén file .xlsx (DecompressionStream).');
}

// ==================== ZIP Reader (Central Directory) ====================
async function readZipEntries(uint8) {
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);

  // Tìm End of Central Directory (0x06054b50) từ cuối file
  let eocdOffset = -1;
  const minOffset = Math.max(0, uint8.length - 65557);
  for (let i = uint8.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('File .xlsx không đúng định dạng nén ZIP hợp lệ.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map();

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error('Cấu trúc thư mục tệp .xlsx bị lỗi.');
    }
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(uint8.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // Đọc Local File Header để lấy đúng offset bắt đầu dữ liệu nén
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = uint8.subarray(dataStart, dataStart + compSize);

    entries.set(fileName, { method, rawSlice });
  }

  const readText = async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    let bytes;
    if (entry.method === 0) {
      bytes = entry.rawSlice;
    } else if (entry.method === 8) {
      bytes = await inflateRawBytes(entry.rawSlice);
    } else {
      throw new Error(`Không hỗ trợ phương thức nén ZIP (${entry.method}) trong file .xlsx.`);
    }
    return decoder.decode(bytes);
  };

  return { entries, readText };
}

function parseSharedStringsXml(xml) {
  if (!xml) return [];
  const strings = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let siMatch;
  while ((siMatch = siRe.exec(xml)) !== null) {
    const inner = siMatch[1];
    let combined = '';
    let tMatch;
    tRe.lastIndex = 0;
    while ((tMatch = tRe.exec(inner)) !== null) {
      combined += unescapeXml(tMatch[1]);
    }
    strings.push(combined);
  }
  return strings;
}

function resolveFirstSheetPath(workbookXml, relsXml) {
  if (workbookXml && relsXml) {
    const sheetMatch = workbookXml.match(/<sheet\b[^>]*r:id="([^"]+)"/i);
    if (sheetMatch) {
      const rId = sheetMatch[1];
      const relRe = new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*Target="([^"]+)"`, 'i');
      const relReAlt = new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rId}"`, 'i');
      const relMatch = relsXml.match(relRe) || relsXml.match(relReAlt);
      if (relMatch) {
        const target = relMatch[1].replace(/^\/+/, '');
        return target.startsWith('xl/') ? target : `xl/${target}`;
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

function parseSheetXml(sheetXml, sharedStrings) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(sheetXml)) !== null) {
    const rowBody = rowMatch[1];
    const rowValues = [];
    let cellMatch;
    cellRe.lastIndex = 0;
    let fallbackCol = 0;

    while ((cellMatch = cellRe.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const cellInner = cellMatch[2];

      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1].toUpperCase()) : fallbackCol;
      fallbackCol = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/i);
      const cellType = typeMatch ? typeMatch[1] : '';

      let val = '';
      if (cellType === 's') {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const sIdx = vMatch ? parseInt(vMatch[1].trim(), 10) : -1;
        val = sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
      } else if (cellType === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tMatch;
        while ((tMatch = tRe.exec(cellInner)) !== null) {
          val += unescapeXml(tMatch[1]);
        }
      } else if (cellType === 'b') {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        val = vMatch && vMatch[1].trim() === '1' ? 'TRUE' : 'FALSE';
      } else {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        val = vMatch ? unescapeXml(vMatch[1]) : '';
      }

      while (rowValues.length < colIdx) rowValues.push('');
      rowValues[colIdx] = val;
    }

    if (rowValues.some((cell) => String(cell || '').trim() !== '')) {
      rows.push(rowValues);
    }
  }
  return rows;
}

export async function parseXlsxBytes(uint8) {
  const zip = await readZipEntries(uint8);
  const workbookXml = await zip.readText('xl/workbook.xml');
  const relsXml = await zip.readText('xl/_rels/workbook.xml.rels');
  const sharedStringsXml = await zip.readText('xl/sharedStrings.xml');
  const sheetPath = resolveFirstSheetPath(workbookXml, relsXml);
  const sheetXml = (await zip.readText(sheetPath)) || (await zip.readText('xl/worksheets/sheet1.xml'));
  if (!sheetXml) {
    throw new Error('Không tìm thấy trang tính (Sheet 1) trong file .xlsx.');
  }
  const sharedStrings = parseSharedStringsXml(sharedStringsXml);
  return parseSheetXml(sheetXml, sharedStrings);
}

// ==================== CSV / HTML-Table Parser ====================
function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs >= 4 && tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas && semis >= 3) return ';';
  return ',';
}

export function parseCsvText(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseHtmlTableText(htmlText) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(htmlText)) !== null) {
    const cols = [];
    let cellMatch;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
      const stripped = cellMatch[1].replace(/<[^>]+>/g, '');
      cols.push(unescapeXml(stripped).trim());
    }
    if (cols.some((c) => c !== '')) rows.push(cols);
  }
  return rows;
}

/**
 * Đọc thống nhất file .xlsx, .csv (hoặc .xls dạng HTML/TSV) từ Uint8Array + tên file.
 */
export async function parseSpreadsheetFileBytes(uint8, fileName = '') {
  const lower = String(fileName || '').toLowerCase();

  // Kiểm tra magic bytes ZIP ("PK\x03\x04") → .xlsx
  const isZip =
    uint8.length >= 4 &&
    uint8[0] === 0x50 &&
    uint8[1] === 0x4b &&
    uint8[2] === 0x03 &&
    uint8[3] === 0x04;

  // Kiểm tra magic bytes OLE2 nhị phân cũ (Excel 97-2003 .xls: D0 CF 11 E0)
  const isLegacyBinaryXls =
    uint8.length >= 4 &&
    uint8[0] === 0xd0 &&
    uint8[1] === 0xcf &&
    uint8[2] === 0x11 &&
    uint8[3] === 0xe0;

  if (isZip || lower.endsWith('.xlsx')) {
    if (!isZip) {
      throw new Error('File có đuôi .xlsx nhưng nội dung không phải tệp Excel hợp lệ.');
    }
    return { format: 'xlsx', rows: await parseXlsxBytes(uint8) };
  }

  if (isLegacyBinaryXls) {
    throw new Error(
      'File đang ở định dạng Excel 97–2003 cũ (.xls nhị phân). Bạn vui lòng mở bằng Excel → chọn Lưu thành (Save As) → chọn "Excel Workbook (*.xlsx)" hoặc "CSV UTF-8" rồi nhập lại nhé!',
    );
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  if (/<table\b/i.test(text) && /<tr\b/i.test(text)) {
    return { format: 'html-xls', rows: parseHtmlTableText(text) };
  }
  return { format: 'csv', rows: parseCsvText(text) };
}

// ==================== ZIP / XLSX Writer (Tạo file mẫu & xuất sao lưu chuẩn Text @) ====================
function createStoredZipBytes(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes =
      typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const checksum = crc32(dataBytes);

    // Local File Header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Stored (no compression)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    // Central Directory Header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    localChunks.push(lh, dataBytes);
    centralChunks.push(ch);
    offset += lh.length + dataBytes.length;
  }

  let cdSize = 0;
  for (const ch of centralChunks) cdSize += ch.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + cdSize + eocd.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of localChunks) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const part of centralChunks) {
    result.set(part, pos);
    pos += part.length;
  }
  result.set(eocd, pos);
  return result;
}

/**
 * Tạo file .xlsx chuẩn 5 cột với định dạng Text (@ - numFmtId=49) cho toàn bộ cột A..E
 * để kế toán gõ MST bắt đầu bằng số 0 không bao giờ bị Excel tự cắt mất số 0 đầu.
 */
export function buildXlsxBytes(rows, { sheetName = 'DanhSachMST', preformatBlankRows = 0 } = {}) {
  const xmlRows = [];
  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 1;
    const styleId = r === 0 ? 1 : 2; // 1 = Header xanh #006FBC chữ trắng đậm; 2 = Text (@)
    const cols = rows[r] || [];
    const cellXml = [];
    for (let c = 0; c < Math.max(5, cols.length); c++) {
      const ref = `${indexToColLetters(c)}${rowNum}`;
      const val = cols[c] ?? '';
      cellXml.push(`<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${escapeXml(val)}</t></is></c>`);
    }
    xmlRows.push(`<row r="${rowNum}">${cellXml.join('')}</row>`);
  }

  // Tạo sẵn các dòng trống đã gán style Text (@) trong file mẫu để kế toán nhập tay giữ nguyên số 0 đầu
  for (let k = 0; k < preformatBlankRows; k++) {
    const rowNum = rows.length + 1 + k;
    const cellXml = [];
    for (let c = 0; c < 5; c++) {
      const ref = `${indexToColLetters(c)}${rowNum}`;
      cellXml.push(`<c r="${ref}" s="2"/>`);
    }
    xmlRows.push(`<row r="${rowNum}">${cellXml.join('')}</row>`);
  }

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols>' +
    '<col min="1" max="1" width="18" customWidth="1" style="2"/>' +
    '<col min="2" max="2" width="38" customWidth="1" style="2"/>' +
    '<col min="3" max="3" width="22" customWidth="1" style="2"/>' +
    '<col min="4" max="4" width="20" customWidth="1" style="2"/>' +
    '<col min="5" max="5" width="30" customWidth="1" style="2"/>' +
    '</cols>' +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    '</worksheet>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF006FBC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const wbRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  return createStoredZipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: wbRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ]);
}

export function buildCsvBytes(rows) {
  const escapeCell = (val) => {
    const s = String(val ?? '');
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
  return new TextEncoder().encode(`\uFEFF${body}`);
}
