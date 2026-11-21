import { isRealTaxServerRequest } from '../../adapters/etax-adapter.js';
import { notifyServerActivity } from '../../core/frame-bus.js';

/**
 * Cảm biến giao tiếp máy chủ (chạy ở document-start trên cả dichvucong.gdt.gov.vn & iframe thuedientu.gdt.gov.vn):
 * - Chỉ báo reset đồng hồ khi có giao tiếp THỰC TẾ với máy chủ thuế:
 *   1. Tải trang / tải iframe mới.
 *   2. XHR (bao gồm HTMX) hoặc Fetch gửi tới endpoint thật của cổng thuế (đã chặn XHR nền của Kaspersky!).
 *   3. Submit form truyền thống.
 * - KHÔNG báo reset theo thao tác click chuột, di chuột hay gõ phím thuần túy.
 */

let installed = false;
let capturedNativeFetch = null;

function getPageWindow() {
  try {
    return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  } catch {
    return window;
  }
}

/**
 * Trả về hàm fetch gốc (chưa qua hook) để `keep-alive.js` tự kiểm chứng phản hồi sống/chết
 * mà không tự kích hoạt reset đồng hồ sớm trước khi biết phiên còn hiệu lực hay không.
 */
export function getRawFetch() {
  if (capturedNativeFetch) return capturedNativeFetch;
  return window.fetch.bind(window);
}

export function installNetworkProbe() {
  if (installed) return;
  installed = true;

  const pageWin = getPageWindow();
  try {
    capturedNativeFetch = (window.fetch || pageWin.fetch).bind(window);
  } catch {
    capturedNativeFetch = null;
  }

  // 1. Báo hiệu mỗi khi một trang/iframe thật của cổng thuế được tải mới
  if (isRealTaxServerRequest(location.href, location.href)) {
    notifyServerActivity('navigation', location.pathname);
  }

  // 2. Hook XMLHttpRequest trên page context (bắt mọi lệnh HTMX & AJAX eTax)
  try {
    const XHR = pageWin.XMLHttpRequest;
    if (XHR && XHR.prototype && !XHR.prototype.__etaxHelperHooked) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;

      XHR.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__etaxHelperUrl = typeof url === 'string' ? url : String(url || '');
        this.__etaxHelperMethod = method || 'GET';
        return origOpen.call(this, method, url, ...rest);
      };

      XHR.prototype.send = function patchedSend(...args) {
        const targetUrl = this.__etaxHelperUrl || '';
        if (isRealTaxServerRequest(targetUrl, location.href)) {
          notifyServerActivity('xhr', `${this.__etaxHelperMethod} ${targetUrl}`);
        }
        return origSend.apply(this, args);
      };

      XHR.prototype.__etaxHelperHooked = true;
    }
  } catch {
    // Bỏ qua an toàn nếu trình duyệt không cho bọc XHR
  }

  // 3. Hook window.fetch trên page context
  try {
    if (typeof pageWin.fetch === 'function' && !pageWin.fetch.__etaxHelperHooked) {
      const origFetch = pageWin.fetch.bind(pageWin);
      const wrappedFetch = function patchedFetch(input, init) {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : '';
        if (isRealTaxServerRequest(rawUrl, location.href)) {
          notifyServerActivity('fetch', rawUrl);
        }
        return origFetch(input, init);
      };
      wrappedFetch.__etaxHelperHooked = true;
      pageWin.fetch = wrappedFetch;
    }
  } catch {
    // ignore
  }

  // 4. Bắt Submit Form truyền thống (đặc biệt trên iframe thuedientu.gdt.gov.vn)
  document.addEventListener(
    'submit',
    (event) => {
      if (event.defaultPrevented) return;
      const form = event.target;
      const action = (form && form.getAttribute && form.getAttribute('action')) || location.href;
      if (isRealTaxServerRequest(action, location.href)) {
        notifyServerActivity('form-submit', action);
      }
    },
    false,
  );
}
