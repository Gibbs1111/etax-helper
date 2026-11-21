/**
 * Bộ quan sát DOM tối ưu cho trang nặng (nhiều nghìn thẻ <option>/<li> ẩn trong bootstrap-select).
 * Dùng debounce + hỗ trợ cả sự kiện HTMX (`htmx:afterSwap`, `htmx:afterSettle`) để không gây lag trình duyệt.
 */

export function createDomWatcher(onScan, { debounceMs = 180 } = {}) {
  let timer = null;
  let observer = null;
  let active = false;

  const scheduleScan = () => {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (active) {
        try {
          onScan();
        } catch (err) {
          console.warn('[eTax Helper] Lỗi khi quét DOM:', err);
        }
      }
    }, debounceMs);
  };

  const onHtmxSwap = () => scheduleScan();

  return {
    start() {
      if (active) return;
      active = true;
      scheduleScan();

      if (typeof MutationObserver === 'function' && document.body) {
        observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
              scheduleScan();
              return;
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      document.addEventListener('htmx:afterSwap', onHtmxSwap);
      document.addEventListener('htmx:afterSettle', onHtmxSwap);
    },

    triggerNow() {
      if (!active) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      onScan();
    },

    stop() {
      active = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      document.removeEventListener('htmx:afterSwap', onHtmxSwap);
      document.removeEventListener('htmx:afterSettle', onHtmxSwap);
    },
  };
}
