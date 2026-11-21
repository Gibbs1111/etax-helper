import { isLoggedIn } from '../../adapters/etax-adapter.js';
import { STORAGE_KEYS, getValue, setValue } from '../../core/storage.js';
import { isTopFrame, subscribeServerActivity } from '../../core/frame-bus.js';
import { createDomWatcher } from '../../core/dom-observer.js';
import { sendSilentKeepAlive } from './keep-alive.js';
import { createTimerWidget } from './timer-widget.js';

const DEFAULT_CONFIG = {
  schemaVersion: 1,
  timeoutMinutes: 15,
  maxSilentKeepAlives: 3, // Tối đa 3 lần giữ phiên ngầm liên tiếp nếu hoàn toàn không có tương tác con người
};

const WARNING_THRESHOLD_SEC = 120; // Dưới 2 phút → đỏ nhấp nháy
const KEEP_ALIVE_THRESHOLD_SEC = 15; // Dưới 15 giây → gửi giữ phiên ngầm

function loadTimerConfig() {
  const saved = getValue(STORAGE_KEYS.TIMER_CONFIG, null);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_CONFIG };
  const mins = Number(saved.timeoutMinutes);
  return {
    schemaVersion: 1,
    timeoutMinutes: Number.isFinite(mins) && mins >= 1 && mins <= 120 ? mins : 15,
    maxSilentKeepAlives: Number(saved.maxSilentKeepAlives) || 3,
  };
}

function saveTimerConfig(cfg) {
  setValue(STORAGE_KEYS.TIMER_CONFIG, {
    schemaVersion: 1,
    timeoutMinutes: cfg.timeoutMinutes,
    maxSilentKeepAlives: cfg.maxSilentKeepAlives,
  });
}

function formatClockTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function createSessionTimerFeature() {
  let config = loadTimerConfig();
  let lastServerActivityAt = Date.now();
  let lastHumanInputAt = Date.now(); // CHỈ dùng cho Idle Cap (KHÔNG bao giờ reset đồng hồ!)
  let consecutiveUnattendedKeepAlives = 0;

  let keepAliveInFlight = false;
  let circuitOpenExpired = false;
  let idlePaused = false;
  let lastKeepAliveText = '';
  let lastResetText = formatClockTime(Date.now());

  let intervalId = null;
  let unsubBus = null;
  let loginWatcher = null;
  let widgetVisible = false;

  const onHumanInteraction = () => {
    lastHumanInputAt = Date.now();
    if (idlePaused) {
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
    }
  };

  const widget = createTimerWidget({
    onChangeMinutes(newMinutes) {
      config.timeoutMinutes = newMinutes;
      saveTimerConfig(config);
      lastServerActivityAt = Date.now();
      circuitOpenExpired = false;
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
      lastResetText = `${formatClockTime(Date.now())} (Đổi thành ${newMinutes}p)`;
      tick();
    },
    onManualResume() {
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
      tick();
    },
  });

  const handleServerActivity = (payload) => {
    const ts = payload?.timestamp || Date.now();
    if (ts < lastServerActivityAt) return;
    lastServerActivityAt = ts;
    circuitOpenExpired = false;
    idlePaused = false;
    consecutiveUnattendedKeepAlives = 0;
    lastResetText = `${formatClockTime(ts)} (${payload?.source || 'server'})`;
    tick();
  };

  const triggerSilentKeepAlive = async () => {
    if (keepAliveInFlight || circuitOpenExpired || idlePaused) return;

    // Kiểm tra Idle Cap: có tương tác con người từ lần keep-alive trước không?
    const hadHumanActivitySinceLastServer = lastHumanInputAt > lastServerActivityAt;
    if (!hadHumanActivitySinceLastServer) {
      if (consecutiveUnattendedKeepAlives >= config.maxSilentKeepAlives) {
        idlePaused = true;
        tick();
        return;
      }
      consecutiveUnattendedKeepAlives += 1;
    } else {
      consecutiveUnattendedKeepAlives = 0;
    }

    keepAliveInFlight = true;
    widget.update({ status: 'keeping-alive' });

    const res = await sendSilentKeepAlive();
    keepAliveInFlight = false;

    if (res.ok) {
      lastServerActivityAt = res.timestamp || Date.now();
      lastKeepAliveText = `Thành công lúc ${formatClockTime(lastServerActivityAt)}`;
      lastResetText = `${formatClockTime(lastServerActivityAt)} (keep-alive)`;
      tick();
    } else {
      lastKeepAliveText = `Dừng (${res.reason})`;
      if (res.expired) {
        circuitOpenExpired = true;
      } else {
        // Lỗi mạng/HTTP 429/5xx: ngắt Circuit Breaker tránh spam máy chủ thuế
        circuitOpenExpired = true;
      }
      tick();
    }
  };

  const tick = () => {
    if (!widgetVisible) return;

    const totalSec = config.timeoutMinutes * 60;
    const elapsedSec = Math.floor((Date.now() - lastServerActivityAt) / 1000);
    const remainingSeconds = Math.max(0, totalSec - elapsedSec);

    if (circuitOpenExpired) {
      widget.update({
        remainingSeconds: 0,
        timeoutMinutes: config.timeoutMinutes,
        status: 'expired',
        lastKeepAliveText,
        lastResetText,
      });
      return;
    }

    if (idlePaused) {
      widget.update({
        remainingSeconds,
        timeoutMinutes: config.timeoutMinutes,
        status: 'idle-paused',
        lastKeepAliveText,
        lastResetText,
      });
      return;
    }

    if (remainingSeconds <= KEEP_ALIVE_THRESHOLD_SEC && !keepAliveInFlight) {
      void triggerSilentKeepAlive();
    }

    const status = keepAliveInFlight
      ? 'keeping-alive'
      : remainingSeconds <= WARNING_THRESHOLD_SEC
        ? 'warning'
        : 'normal';

    widget.update({
      remainingSeconds,
      timeoutMinutes: config.timeoutMinutes,
      status,
      lastKeepAliveText,
      lastResetText,
    });
  };

  const syncLoginVisibility = () => {
    const loggedIn = isLoggedIn(document, location);
    if (loggedIn && !widgetVisible) {
      widgetVisible = true;
      widget.mount();
      tick();
    } else if (!loggedIn && widgetVisible) {
      widgetVisible = false;
      widget.unmount();
    }
  };

  return {
    start() {
      // Đồng hồ chỉ chạy & hiển thị duy nhất ở Top-Frame (dichvucong.gdt.gov.vn)
      if (!isTopFrame()) return;

      config = loadTimerConfig();
      unsubBus = subscribeServerActivity(handleServerActivity);

      window.addEventListener('pointerdown', onHumanInteraction, { passive: true });
      window.addEventListener('keydown', onHumanInteraction, { passive: true });
      window.addEventListener('scroll', onHumanInteraction, { passive: true });

      loginWatcher = createDomWatcher(syncLoginVisibility, { debounceMs: 250 });
      loginWatcher.start();

      intervalId = setInterval(tick, 1000);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (unsubBus) {
        unsubBus();
        unsubBus = null;
      }
      if (loginWatcher) {
        loginWatcher.stop();
        loginWatcher = null;
      }
      window.removeEventListener('pointerdown', onHumanInteraction);
      window.removeEventListener('keydown', onHumanInteraction);
      window.removeEventListener('scroll', onHumanInteraction);
      widgetVisible = false;
      widget.unmount();
    },
  };
}
