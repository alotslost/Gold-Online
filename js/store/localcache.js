// localStorage 缓存层（key 前缀 hjzx.cache.）
// 目的：同一天内刷新/重开页面直接复用缓存、不发请求，避免频繁拉取触发数据源 IP 风控；
//       接口临时失败时回退到当日（或最近一次）缓存，页面仍可用。手动刷新走 loader() 强制拉取。
const PREFIX = 'hjzx.cache.';

export function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 读缓存：{ fetchedOn, code, name, source, points: [[date, value], ...] } 或 null */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Array.isArray(entry.points)) return null;
    return entry;
  } catch (e) {
    return null; // 缓存损坏不影响功能
  }
}

/** 写缓存（紧凑格式：points 存 [date, value] 数组，省一半空间） */
export function cacheSet(key, series) {
  try {
    const entry = {
      fetchedOn: todayStr(),
      code: series.code,
      name: series.name,
      source: series.source,
      points: series.points.map((p) => [p.date, p.value]),
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // 存储配额满等：缓存只是优化，静默失败
  }
}

/** 缓存是否为今日数据 */
export function isFresh(key) {
  const c = cacheGet(key);
  return !!(c && c.fetchedOn === todayStr());
}

function expand(entry) {
  return { ...entry, points: entry.points.map(([date, value]) => ({ date, value })) };
}

/**
 * 带当日缓存的数据获取：
 * - 缓存为今日 → 直接返回，不发请求（fromCache=true）
 * - 缓存过期/不存在 → loader() 拉取并写缓存
 * - 拉取失败但有旧缓存 → 返回旧缓存并标 stale=true，由调用方决定是否后台重试
 */
export async function loadWithCache(key, loader) {
  const cached = cacheGet(key);
  if (cached && cached.fetchedOn === todayStr()) {
    return { ...expand(cached), fromCache: true, stale: false };
  }
  try {
    const series = await loader();
    cacheSet(key, series);
    return { ...series, fromCache: false, stale: false };
  } catch (e) {
    if (cached) {
      return { ...expand(cached), fromCache: true, stale: true };
    }
    throw e;
  }
}
