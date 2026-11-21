import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRealTaxServerRequest,
  isKeepAliveResponseAlive,
} from '../src/adapters/etax-adapter.js';

test('Chấp nhận đúng các request nghiệp vụ thực tế của dichvucong & thuedientu', () => {
  assert.equal(
    isRealTaxServerRequest('/tthc/ho-so/search?tuNgay=01/11/2026', 'https://dichvucong.gdt.gov.vn/tthc/tchs'),
    true,
  );
  assert.equal(
    isRealTaxServerRequest('https://dichvucong.gdt.gov.vn/tthc/home', 'https://dichvucong.gdt.gov.vn/tthc/tchs'),
    true,
  );
  assert.equal(
    isRealTaxServerRequest(
      '/etaxnnt/Request?dse_operationName=corpQueryTaxProc',
      'https://thuedientu.gdt.gov.vn/etaxnnt/',
    ),
    true,
  );
});

test('LOẠI BỎ hoàn toàn XHR nền của Kaspersky & tài nguyên tĩnh / Captcha (F12 Bước 5)', () => {
  const kasperskyUrls = [
    'https://dichvucong.gdt.gov.vn/init?data=eyJ1cmwiOiJodHRwczovL3RodWVkaWVudHUuZ2R0...',
    'https://dichvucong.gdt.gov.vn/longpooling?get&nocache=1a83f&tm=2026-11-21T11:31:24.504Z',
    'https://dichvucong.gdt.gov.vn/abn.statInfo?tm=2026-11-21T11:31:24.916Z',
    'https://gc.kis.v2.scr.kaspersky-labs.com/longpooling?get',
    'https://dichvucong.gdt.gov.vn/tthc/login/getCaptcha?1795254964127',
    'https://thuedientu.gdt.gov.vn/etaxnnt/static/images/default/button_date.gif',
    'https://dichvucong.gdt.gov.vn/tthc/assets/app.min.js',
    'https://dichvucong.gdt.gov.vn/tthc/assets/style.css',
  ];

  for (const url of kasperskyUrls) {
    assert.equal(
      isRealTaxServerRequest(url, 'https://dichvucong.gdt.gov.vn/tthc/home'),
      false,
      `Phải bỏ qua URL không phải nghiệp vụ: ${url}`,
    );
  }
});

test('Kiểm chứng phản hồi Keep-Alive phân biệt đúng phiên sống vs phiên hết hạn', () => {
  const aliveHtml = '<html><body><a hx-on:click="dangXuat()">Đăng xuất</a></body></html>';
  assert.equal(isKeepAliveResponseAlive(200, 'https://dichvucong.gdt.gov.vn/tthc/home', aliveHtml), true);

  const loginRedirectHtml = '<html><body><input name="tenDN"><input name="matKhau"></body></html>';
  assert.equal(isKeepAliveResponseAlive(200, 'https://dichvucong.gdt.gov.vn/tthc/login', loginRedirectHtml), false);
  assert.equal(isKeepAliveResponseAlive(200, 'https://dichvucong.gdt.gov.vn/tthc/home', loginRedirectHtml), false);
  assert.equal(isKeepAliveResponseAlive(401, 'https://dichvucong.gdt.gov.vn/tthc/home', ''), false);
});
