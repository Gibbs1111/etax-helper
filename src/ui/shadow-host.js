/**
 * Shadow DOM Host — Cô lập hoàn toàn CSS giao diện của eTax Helper khỏi Bootstrap 5 & CSS cũ của eTax.
 * Dùng tông màu xanh thương hiệu gốc của Cổng Dịch vụ công Thuế (#006FBC).
 */

export const SHARED_SHADOW_CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px;
  color: #1f2937;
  box-sizing: border-box;
}
*, *::before, *::after {
  box-sizing: border-box;
  font-family: inherit;
}
.eh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1f2937;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  line-height: 1.3;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.eh-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.eh-btn-primary {
  background: #006FBC;
  border-color: #006FBC;
  color: #ffffff;
}
.eh-btn-primary:hover {
  background: #005a99;
  border-color: #005a99;
  color: #ffffff;
}
.eh-btn-danger {
  background: #fff1f2;
  border-color: #fecdd3;
  color: #be123c;
}
.eh-btn-danger:hover {
  background: #ffe4e6;
  border-color: #fda4af;
}
.eh-btn-sm {
  padding: 3px 8px;
  font-size: 12px;
}
.eh-input, .eh-select {
  width: 100%;
  padding: 6px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  outline: none;
}
.eh-input:focus, .eh-select:focus {
  border-color: #006FBC;
  box-shadow: 0 0 0 2px rgba(0, 111, 188, 0.16);
}
.eh-muted {
  color: #64748b;
  font-size: 12px;
}
.eh-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.eh-success {
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.eh-warning {
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
`;

export function createShadowMount(tagName = 'div', extraCss = '', hostAttributes = {}, options = {}) {
  const { guardBootstrapFocusTrap = false } = options;
  const host = document.createElement(tagName);
  host.setAttribute('data-etax-helper', '1');
  for (const [k, v] of Object.entries(hostAttributes)) {
    host.setAttribute(k, v);
  }
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${SHARED_SHADOW_CSS}\n${extraCss}`;
  shadow.appendChild(style);
  const root = document.createElement('div');
  shadow.appendChild(root);

  let cleanup = () => {};

  if (guardBootstrapFocusTrap) {
    // Bootstrap 5 Modal (.modal.show) gắn FocusTrap trên `document` (sự kiện `focusin` & `keydown` Tab/Esc)
    // nên khi mở hộp thoại của eTax Helper đè lên trên modal đăng nhập, Bootstrap sẽ cướp lại con trỏ chuột.
    // Chặn sự kiện `focusin` ở pha capture trên `window` (chỉ khi target nằm trong Shadow host của chúng ta)
    // và chặn bubble `keydown` trên `host` để mọi ô nhập & phím Tab/Esc hoạt động bình thường 100%.
    const isInsideHost = (event) => {
      if (event.target === host || (event.target instanceof Node && host.contains(event.target))) {
        return true;
      }
      if (typeof event.composedPath === 'function') {
        return event.composedPath().includes(host);
      }
      return false;
    };

    const pageWin = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;

    const onWindowFocusIn = (event) => {
      if (isInsideHost(event)) {
        event.stopImmediatePropagation();
      }
    };

    const onHostFocusInBubble = (event) => {
      event.stopPropagation();
    };

    const onHostKeyDown = (event) => {
      if (event.key === 'Tab' || event.key === 'Escape') {
        event.stopPropagation();
      }
    };

    pageWin.addEventListener('focusin', onWindowFocusIn, true);
    host.addEventListener('focusin', onHostFocusInBubble, false);
    host.addEventListener('keydown', onHostKeyDown, false);

    cleanup = () => {
      pageWin.removeEventListener('focusin', onWindowFocusIn, true);
      host.removeEventListener('focusin', onHostFocusInBubble, false);
      host.removeEventListener('keydown', onHostKeyDown, false);
    };
  }

  return { host, shadow, root, cleanup };
}

export function triggerFileDownload(bytes, fileName, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 500);
}
