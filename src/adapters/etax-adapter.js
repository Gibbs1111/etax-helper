/**
 * eTax Adapter — Toàn bộ selector DOM & pattern mạng đã được xác minh trực tiếp qua F12 (Giai đoạn 1).
 * Khi Tổng cục Thuế cập nhật giao diện, chỉ cần điều chỉnh duy nhất tệp này rồi build tăng PATCH version.
 */

export const DVC_ORIGIN = 'https://dichvucong.gdt.gov.vn';
export const ETAX_ORIGIN = 'https://thuedientu.gdt.gov.vn';
export const ALLOWED_ORIGINS = new Set([DVC_ORIGIN, ETAX_ORIGIN]);

export const KEEP_ALIVE_URL = `${DVC_ORIGIN}/tthc/home`;
export const DATE_FORMAT = 'DD/MM/YYYY';

const STATIC_ASSET_RE = /\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map|bmp)(?:\?|#|$)/i;
const IGNORED_PATH_PATTERNS = [
  /\/tthc\/login\/getCaptcha/i,
  /\/etaxnnt\/static\//i,
  /longpooling/i,
  /abn\.statInfo/i,
  /\/init\?data=/i,
];

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu, chữ thường để so khớp nhãn an toàn.
 */
export function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDvcOrigin(origin = location.origin) {
  return origin === DVC_ORIGIN;
}

export function isEtaxOrigin(origin = location.origin) {
  return origin === ETAX_ORIGIN;
}

export function isLoginPage(loc = location) {
  return loc.origin === DVC_ORIGIN && loc.pathname.includes('/tthc/login');
}

/**
 * Xác định trạng thái đã đăng nhập trên cổng chính dichvucong.gdt.gov.vn
 * (dựa trên F12 Bước 2: nút Đăng xuất `dangXuat()` và `.user-name` trong `.dropdown-menu`).
 */
export function isLoggedIn(doc = document, loc = location) {
  if (loc.origin !== DVC_ORIGIN || loc.pathname.includes('/login')) {
    return false;
  }
  return Boolean(
    doc.querySelector('a[hx-on\\:click*="dangXuat"], .dropdown-menu .user-name'),
  );
}

/**
 * Tìm khung Form Đăng nhập Doanh nghiệp trên dichvucong.gdt.gov.vn/tthc/login (F12 Bước 1).
 */
export function findLoginFormContext(doc = document) {
  const modalBodies = doc.querySelectorAll('.modal-body');
  for (const body of modalBodies) {
    const usernameInput = body.querySelector('input[name="tenDN"]');
    const passwordInput = body.querySelector('input[name="matKhau"]');
    if (!usernameInput || !passwordInput) continue;

    const ldapInput = body.querySelector('input[name="ldap"]');
    // Ưu tiên đúng modal Doanh nghiệp (ldap === "DN") nếu trường ldap tồn tại
    if (ldapInput && ldapInput.value && ldapInput.value.toUpperCase() !== 'DN') {
      continue;
    }

    const captchaInput = body.querySelector('input[name="captcha"]');
    return {
      container: body,
      ldapInput,
      usernameInput,
      passwordInput,
      captchaInput,
    };
  }
  return null;
}

function isInputVisible(el) {
  if (!el || el.disabled || el.type === 'hidden') return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/**
 * Quét toàn bộ cặp ô "Từ ngày – Đến ngày" trên màn hình hiện tại.
 * Hỗ trợ đầy đủ:
 *  - Mẫu A (dichvucong /tthc/tchs): `.row` chứa cặp `input.one-calendar` (`tuNgay`, `denNgay`)
 *  - Mẫu B (thuedientu iframe): `tr` chứa cặp `input.dateMSB` / `input.hasDatepicker` (kể cả nhiều hàng xếp chồng như Giấy nộp tiền)
 *  - Mẫu C (dự phòng): hàng `tr` / `.row` có cặp nhãn "Từ ngày" & "Đến ngày"
 */
export function findDateInputPairs(root = document) {
  const pairs = [];
  const seenFrom = new Set();

  const registerPair = (fromInput, toInput, rowEl, kind) => {
    if (!fromInput || !toInput || fromInput === toInput) return;
    if (seenFrom.has(fromInput)) return;
    if (!isInputVisible(fromInput) || !isInputVisible(toInput)) return;
    seenFrom.add(fromInput);
    pairs.push({ fromInput, toInput, rowEl, kind });
  };

  // Mẫu A: Cổng mới dichvucong (Bootstrap 5 + input.one-calendar)
  const dvcRows = root.querySelectorAll('.row');
  for (const row of dvcRows) {
    const calInputs = Array.from(row.querySelectorAll('input.one-calendar')).filter(isInputVisible);
    if (calInputs.length === 2) {
      registerPair(calInputs[0], calInputs[1], row, 'dvc-one-calendar');
    }
  }

  // Mẫu B: Iframe eTax thuedientu (table tr + input.dateMSB / hasDatepicker)
  const etaxRows = root.querySelectorAll('tr');
  for (const tr of etaxRows) {
    // Bỏ qua hàng đang bị ẩn hoàn toàn (style="display: none")
    const trStyle = window.getComputedStyle ? window.getComputedStyle(tr) : null;
    if (trStyle && trStyle.display === 'none') continue;

    const dateInputs = Array.from(
      tr.querySelectorAll('input.dateMSB, input.hasDatepicker'),
    ).filter(isInputVisible);
    if (dateInputs.length === 2) {
      registerPair(dateInputs[0], dateInputs[1], tr, 'etax-datepicker');
    }
  }

  // Mẫu C: Dự phòng theo nhãn "Từ ngày" & "Đến ngày" trên cùng một hàng
  const candidateRows = root.querySelectorAll('tr, .row');
  for (const row of candidateRows) {
    const textInputs = Array.from(
      row.querySelectorAll('input[type="text"], input:not([type])'),
    ).filter((el) => isInputVisible(el) && !seenFrom.has(el));
    if (textInputs.length !== 2) continue;

    const rowText = normalizeVietnamese(row.textContent);
    if (rowText.includes('tu ngay') && rowText.includes('den ngay')) {
      registerPair(textInputs[0], textInputs[1], row, 'heuristic-row');
    }
  }

  return pairs;
}

/**
 * Ghi giá trị vào ô input một cách chuẩn xác để cả Bootstrap/Parsley (`changeDate`)
 * lẫn jQuery UI Datepicker (`thuedientu`) đều nhận diện mà không kích hoạt vòng lặp `onblur -> focus()` của eTax cũ.
 */
export function setNativeInputValue(input, value, options = {}) {
  const { triggerInput = true, triggerChange = true, triggerBlur = false } = options;
  if (!input) return;

  const proto = window.HTMLInputElement ? window.HTMLInputElement.prototype : null;
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  if (triggerInput) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (triggerChange) {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (triggerBlur) {
    // Theo chuẩn DOM, sự kiện blur không bubble (bubbles: false)
    input.dispatchEvent(new Event('blur', { bubbles: false }));
  }

  // Xóa trạng thái lỗi đỏ Parsley cũ nếu có sau khi đã điền giá trị hợp lệ
  if (value && input.classList && input.classList.contains('is-invalid')) {
    input.classList.remove('is-invalid');
  }
}

/**
 * Kiểm tra một URL request XHR/Fetch có phải giao tiếp thực tế với máy chủ thuế hay không.
 * ĐÃ KHÓA CHẶT dựa trên F12 Bước 5 để loại bỏ hoàn toàn XHR nền của Kaspersky
 * (`longpooling`, `abn.statInfo`, `init?data=`) và mọi tài nguyên tĩnh.
 */
export function isRealTaxServerRequest(rawUrl, baseHref = 'https://dichvucong.gdt.gov.vn/') {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  let parsed;
  try {
    parsed = new URL(rawUrl, baseHref);
  } catch {
    return false;
  }

  if (!ALLOWED_ORIGINS.has(parsed.origin)) {
    return false;
  }

  const fullPath = `${parsed.pathname}${parsed.search}`;
  if (STATIC_ASSET_RE.test(parsed.pathname)) {
    return false;
  }
  for (const ignored of IGNORED_PATH_PATTERNS) {
    if (ignored.test(fullPath)) {
      return false;
    }
  }

  if (parsed.origin === DVC_ORIGIN) {
    return parsed.pathname.startsWith('/tthc/');
  }
  if (parsed.origin === ETAX_ORIGIN) {
    return parsed.pathname.startsWith('/etaxnnt/');
  }
  return false;
}

/**
 * Kiểm tra phản hồi HTML của Keep-Alive `GET /tthc/home` có xác nhận phiên còn sống hay không.
 */
export function isKeepAliveResponseAlive(status, finalUrl, bodyText) {
  if (status < 200 || status >= 300) return false;
  if (!finalUrl || finalUrl.includes('/login')) return false;
  const text = String(bodyText || '');
  if (text.includes('name="matKhau"') && !text.includes('dangXuat(')) {
    return false;
  }
  return text.includes('dangXuat(') || text.includes('user-name');
}
