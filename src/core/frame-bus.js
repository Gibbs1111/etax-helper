import { ALLOWED_ORIGINS, DVC_ORIGIN } from '../adapters/etax-adapter.js';
import { STORAGE_KEYS, setValue, addValueChangeListener } from './storage.js';

const MSG_TYPE_ACTIVITY = 'ETAX_HELPER_SERVER_ACTIVITY';

export function isTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

/**
 * Báo tín hiệu giao tiếp thực với máy chủ thuế từ bất kỳ frame nào (kể cả iframe thuedientu.gdt.gov.vn)
 * về đồng hồ trung tâm ở Top-Frame (dichvucong.gdt.gov.vn).
 */
export function notifyServerActivity(source, detail = '') {
  const payload = {
    type: MSG_TYPE_ACTIVITY,
    source,
    detail,
    origin: location.origin,
    timestamp: Date.now(),
  };

  // Kênh 1: postMessage trực tiếp lên Top-Frame (khóa đúng origin dichvucong)
  if (!isTopFrame()) {
    try {
      window.top.postMessage(payload, DVC_ORIGIN);
    } catch {
      // Dự phòng đã có Kênh 2 qua GM_setValue bên dưới
    }
  }

  // Kênh 2: Đồng bộ xuyên origin & xuyên tab qua GM_setValue
  setValue(STORAGE_KEYS.LAST_ACTIVITY, payload);
}

/**
 * Lắng nghe tín hiệu giao tiếp máy chủ tại Top-Frame.
 */
export function subscribeServerActivity(handler) {
  const onMessage = (event) => {
    if (!ALLOWED_ORIGINS.has(event.origin)) return;
    const data = event.data;
    if (!data || data.type !== MSG_TYPE_ACTIVITY) return;
    handler(data);
  };

  window.addEventListener('message', onMessage);

  const gmId = addValueChangeListener(STORAGE_KEYS.LAST_ACTIVITY, (_k, _oldVal, newVal) => {
    if (!newVal || newVal.type !== MSG_TYPE_ACTIVITY) return;
    handler(newVal);
  });

  return () => {
    window.removeEventListener('message', onMessage);
    void gmId;
  };
}
