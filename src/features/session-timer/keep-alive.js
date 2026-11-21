import {
  KEEP_ALIVE_URL,
  isKeepAliveResponseAlive,
} from '../../adapters/etax-adapter.js';
import { getRawFetch } from './network-probe.js';

/**
 * Gửi yêu cầu giữ phiên ngầm (Silent Keep-Alive) chỉ đọc tới `GET /tthc/home`:
 * - Dùng hàm `fetch` gốc trước khi hook (không đụng `_csrf`, không đụng `dse_pageId`, không tự gây reset ảo).
 * - Trả về kết quả kiểm chứng phiên sống/hết hạn để Circuit Breaker ngắt ngay nếu server báo lỗi/redirect login.
 */
export async function sendSilentKeepAlive() {
  try {
    const rawFetch = getRawFetch();
    const response = await rawFetch(KEEP_ALIVE_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
    });

    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      return {
        ok: false,
        reason: `HTTP ${response.status}`,
        expired: response.status === 401 || response.status === 403,
      };
    }

    const html = await response.text();
    const alive = isKeepAliveResponseAlive(response.status, response.url, html);

    if (!alive) {
      return {
        ok: false,
        reason: 'Máy chủ chuyển về trang đăng nhập hoặc hết phiên',
        expired: true,
      };
    }

    return {
      ok: true,
      timestamp: Date.now(),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Lỗi kết nối mạng',
      expired: false,
    };
  }
}
