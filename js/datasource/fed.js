// 数据源：美联储利率（纽约联储官方 EFFR，fetch + CORS，M1 实测通过）
// 实测样例：last/250.json 返回 250 个交易日；口径为联邦基金有效利率（EFFR，%），目标区间中枢
// 说明：FRED fredgraph.csv 实测被 CORS 拦截，改用 NY Fed 官方 API（EFFR 自 2016 年起有完整日度数据）
const NYFED_SEARCH = (start, end) =>
  `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${start}&endDate=${end}`;
const NYFED_LAST = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/250.json';

import { dedupeAndSort } from './util.js';

// fetch + JSON 解析，带一次重试（M2 实测遇到瞬时网络抖动导致两端点同时失败）
async function fetchJson(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((res) => setTimeout(res, 800));
    }
  }
  throw lastErr;
}

function localIsoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rowsToPoints(rows) {
  return (rows || [])
    .filter((r) => r && r.effectiveDate && r.percentRate != null && Number.isFinite(Number(r.percentRate)))
    .map((r) => ({ date: r.effectiveDate, value: Number(r.percentRate) }));
}

/**
 * 加载美联储利率序列（EFFR，%）。
 * @returns {Promise<Series>}
 */
export async function loadFedRateSeries() {
  let rows = [];
  try {
    // 优先拉全历史（2016 年起 EFFR 日度数据）
    const j = await fetchJson(NYFED_SEARCH('2016-01-01', localIsoToday()));
    rows = j.refRates || [];
  } catch (e) { /* 降级到 last/250 */ }
  if (!rows.length) {
    const j = await fetchJson(NYFED_LAST);
    rows = j.refRates || [];
    if (!rows.length) throw new Error('纽约联储接口未返回有效数据');
  }
  const points = rowsToPoints(rows);
  if (!points.length) throw new Error('纽约联储接口未返回有效数据');
  return {
    code: 'US_EFFR',
    name: '美联储联邦基金有效利率（EFFR）',
    source: 'nyfed-effr',
    points: dedupeAndSort(points), // API 返回为降序，统一规整为升序
  };
}
