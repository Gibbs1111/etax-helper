const PREFIX = '[eTax Helper]';
let debugEnabled = false;

export function setDebugMode(enabled) {
  debugEnabled = Boolean(enabled);
}

export function logDebug(...args) {
  if (debugEnabled) {
    console.debug(PREFIX, ...args);
  }
}

export function logInfo(...args) {
  console.info(PREFIX, ...args);
}

export function logWarn(...args) {
  console.warn(PREFIX, ...args);
}

export function logError(...args) {
  console.error(PREFIX, ...args);
}
