// 持仓数据存取（localStorage key：hjzx.position）
// 结构：{ fundCode, principal, costPrice, openedAt, topups: [{ date, amount }] }
const KEY = 'hjzx.position';

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fundCode = String(raw.fundCode || '');
  const principal = Number(raw.principal);
  const costPrice = Number(raw.costPrice);
  if (!/^\d{6}$/.test(fundCode)) return null;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(costPrice) || costPrice <= 0) return null;
  const openedAt = /^\d{4}-\d{2}-\d{2}$/.test(raw.openedAt || '') ? raw.openedAt : null;
  const topups = Array.isArray(raw.topups)
    ? raw.topups
        .filter((t) => t && /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0)
        .map((t) => ({ date: t.date, amount: Number(t.amount) }))
    : [];
  return { fundCode, principal, costPrice, openedAt, topups };
}

export function readPosition() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

export function writePosition(pos) {
  const clean = sanitize(pos);
  if (!clean) throw new Error('持仓数据不合法');
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch (e) { /* 配额满：静默 */ }
  return clean;
}

export function clearPosition() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* 忽略 */ }
}
