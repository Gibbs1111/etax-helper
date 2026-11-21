import {
  getSettings,
  onSettingsChange,
  registerTampermonkeyMenu,
} from './core/settings.js';
import { isTopFrame } from './core/frame-bus.js';
import { lockSessionNow } from './security/session-unlock.js';
import { installNetworkProbe } from './features/session-timer/network-probe.js';
import { createQuickLoginFeature } from './features/quick-login/index.js';
import { createDatePresetsFeature } from './features/date-presets/index.js';
import { createTableEnhancerFeature } from './features/table-enhancer/index.js';
import { createSessionTimerFeature } from './features/session-timer/index.js';

/**
 * Điểm khởi chạy chính của eTax Helper:
 * 1. Gắn ngay network-probe tại document-start để không bỏ sót bất kỳ request XHR/HTMX/Fetch nào.
 * 2. Chờ DOMContentLoaded để khởi tạo Menu Tampermonkey (chỉ ở Top-Frame) và bật/tắt 4 tính năng theo cài đặt từng máy.
 */

// Bước 1: Gắn cảm biến mạng ngay ở document-start
installNetworkProbe();

function bootstrapUi() {
  const controllers = {
    quickLogin: createQuickLoginFeature(),
    datePresets: createDatePresetsFeature(),
    tableEnhancer: createTableEnhancerFeature(),
    sessionTimer: createSessionTimerFeature(),
  };

  const activeFlags = {
    quickLogin: false,
    datePresets: false,
    tableEnhancer: false,
    sessionTimer: false,
  };

  const applySettings = (settings) => {
    for (const [key, ctrl] of Object.entries(controllers)) {
      const shouldRun = Boolean(settings.features[key]);
      if (shouldRun && !activeFlags[key]) {
        activeFlags[key] = true;
        ctrl.start();
      } else if (!shouldRun && activeFlags[key]) {
        activeFlags[key] = false;
        ctrl.stop();
      }
    }
  };

  if (isTopFrame()) {
    registerTampermonkeyMenu({
      onLockVaultNow() {
        lockSessionNow();
        window.alert('Đã khóa danh sách MST & xóa phiên mã PIN. Lần chọn tiếp theo sẽ yêu cầu nhập lại PIN.');
      },
      onSettingsToggled(updated) {
        applySettings(updated);
      },
    });
  }

  applySettings(getSettings());
  onSettingsChange((nextSettings) => {
    applySettings(nextSettings);
    if (isTopFrame()) {
      registerTampermonkeyMenu({
        onLockVaultNow() {
          lockSessionNow();
          window.alert('Đã khóa danh sách MST & xóa phiên mã PIN.');
        },
        onSettingsToggled(updated) {
          applySettings(updated);
        },
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapUi, { once: true });
} else {
  bootstrapUi();
}
