// 数据源聚合入口：统一导出四个源加载器与快照降级读取
// M1 实测结论（详见 docs/roadmap.md §2）：四源均可浏览器直连，快照降级暂不启用，但保留读取能力
export { loadFundSeries } from './fund.js';
export { loadGoldSeries } from './gold.js';
export { loadFedRateSeries } from './fed.js';
export { loadCnBondSeries } from './cnbond.js';

// 快照降级：读取仓库内 data/<name>.json（结构同统一序列），供未来某源被 CORS/改版拦截时切换
export async function loadSnapshotSeries(name) {
  const r = await fetch(`data/${name}.json`);
  if (!r.ok) throw new Error(`数据快照不存在：data/${name}.json`);
  const s = await r.json();
  if (!s || !Array.isArray(s.points)) throw new Error(`数据快照格式错误：data/${name}.json`);
  return s;
}
