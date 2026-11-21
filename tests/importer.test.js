import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAndAnalyzeFile,
  mergeCompanies,
  buildTemplateXlsxBytes,
  exportCompaniesToXlsxBytes,
  exportCompaniesToCsvBytes,
} from '../src/features/quick-login/importer.js';

test('Đọc & ghi vòng tròn file Excel (.xlsx) 5 cột, giữ nguyên số 0 đầu MST và tiếng Việt', async () => {
  const companies = [
    {
      mst: '0101234567',
      companyName: 'Công ty TNHH Thương Mại & Dịch Vụ An Bình',
      account: '0101234567-QL',
      password: 'Pass@123',
      note: 'Quý 1,2,3,4',
    },
    {
      mst: '0311223344',
      companyName: 'Công ty CP Đại Phát',
      account: '', // Để trống để kiểm tra tự ghép MST-QL
      password: 'Secret#99',
      note: '',
    },
  ];

  const xlsxBytes = exportCompaniesToXlsxBytes(companies);
  const result = await parseAndAnalyzeFile(xlsxBytes, 'danhsach.xlsx', [], { autoPadZero9: true });

  assert.equal(result.format, 'xlsx');
  assert.equal(result.summary.validCount, 2);
  assert.equal(result.summary.errorCount, 0);
  assert.equal(result.validItems[0].mst, '0101234567');
  assert.equal(result.validItems[0].companyName, 'Công ty TNHH Thương Mại & Dịch Vụ An Bình');
  assert.equal(result.validItems[0].account, '0101234567-QL');
  assert.equal(result.validItems[1].account, '0311223344-QL');
  assert.equal(result.summary.autoAccountCount, 1);
});

test('Template .xlsx mẫu đọc lại hợp lệ', async () => {
  const bytes = buildTemplateXlsxBytes();
  const res = await parseAndAnalyzeFile(bytes, 'template-import-mst.xlsx');
  assert.equal(res.format, 'xlsx');
  assert.equal(res.summary.validCount, 1);
  assert.equal(res.validItems[0].mst, '0101234567');
});

test('CSV xử lý lỗi Excel: MST 9 số tự thêm 0, chặn MST dạng khoa học E+, hỗ trợ dấu phẩy trong ngoặc kép', async () => {
  const csvText = [
    'Mã số thuế,Tên công ty,Tài khoản,Mật khẩu,Ghi chú',
    '101234567,"Công ty TNHH A, B và C",,MatKhau1,Nộp theo tháng',
    '1.01234E+09,Công ty Lỗi E+,0101234000-QL,MatKhau2,',
  ].join('\r\n');

  const bytes = new TextEncoder().encode(`\uFEFF${csvText}`);
  const res = await parseAndAnalyzeFile(bytes, 'test.csv', [], { autoPadZero9: true });

  assert.equal(res.format, 'csv');
  assert.equal(res.summary.validCount, 1);
  assert.equal(res.summary.errorCount, 1);
  assert.equal(res.validItems[0].mst, '0101234567');
  assert.equal(res.validItems[0].account, '0101234567-QL');
  assert.equal(res.validItems[0].companyName, 'Công ty TNHH A, B và C');
});

test('Chế độ Merge giữ công ty cũ và cập nhật công ty trùng Tài khoản; Replace thay thế toàn bộ', () => {
  const existing = [
    { id: '1', mst: '0100000001', companyName: 'Cty Cũ 1', account: '0100000001-QL', password: 'old', note: '' },
    { id: '2', mst: '0100000002', companyName: 'Cty Cũ 2', account: '0100000002-QL', password: 'old2', note: '' },
  ];
  const incoming = [
    { id: 'n1', mst: '0100000001', companyName: 'Cty Cũ 1 Mới', account: '0100000001-QL', password: 'new', note: 'updated' },
    { id: 'n2', mst: '0100000003', companyName: 'Cty Mới 3', account: '0100000003-QL', password: 'p3', note: '' },
  ];

  const merged = mergeCompanies(existing, incoming, 'merge');
  assert.equal(merged.length, 3);
  assert.equal(merged.find((c) => c.account === '0100000001-QL').password, 'new');
  assert.equal(merged.find((c) => c.account === '0100000001-QL').id, '1');

  const replaced = mergeCompanies(existing, incoming, 'replace');
  assert.equal(replaced.length, 2);
});

test('Chặn file .xls nhị phân cũ với hướng dẫn tiếng Việt rõ ràng', async () => {
  const fakeOle2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(
    () => parseAndAnalyzeFile(fakeOle2, 'old.xls'),
    (err) => /Excel 97–2003/.test(err.message),
  );
});

test('Xuất CSV UTF-8 BOM đọc lại nguyên vẹn', async () => {
  const list = [
    { mst: '0109988776', companyName: 'Công ty Cổ phần Thành Công', account: '0109988776-QL', password: 'Abc"123', note: 'Ghi chú, có dấu phẩy' },
  ];
  const csvBytes = exportCompaniesToCsvBytes(list);
  const res = await parseAndAnalyzeFile(csvBytes, 'backup.csv');
  assert.equal(res.summary.validCount, 1);
  assert.equal(res.validItems[0].password, 'Abc"123');
  assert.equal(res.validItems[0].note, 'Ghi chú, có dấu phẩy');
});
