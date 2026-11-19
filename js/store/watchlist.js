// 「个人基金」列表存取（localStorage key：hjzx.watchlist）
const KEY = 'hjzx.watchlist';

export function readWatchlist() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((x) => x && /^\d{6}$/.test(x.code)).map((x) => ({ code: x.code, name: x.name || x.code }))
      : [];
  } catch (e) {
    return [];
  }
}

function writeWatchlist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) { /* 配额满：静默 */ }
}

export function isWatched(code) {
  return readWatchlist().some((f) => f.code === code);
}

export function addToWatchlist(code, name) {
  const list = readWatchlist();
  if (!list.some((f) => f.code === code)) {
    list.push({ code, name: name || code });
    writeWatchlist(list);
  }
}

export function removeFromWatchlist(code) {
  writeWatchlist(readWatchlist().filter((f) => f.code !== code));
}
