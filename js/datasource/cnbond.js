// 数据源：中国国债收益率（东方财富 K 线 JSONP，M1 实测通过）
// 实测样例：171.CN10Y「中国10年期国债」897 点（2023-05-08 至 2026-11-19），收益率 %
// 已知限制：该源 10Y 自 2023-05 起；更长历史需另行评估快照方案
import { EM_KLINE_API, jsonp, klinesToPoints, makeSeries } from './util.js';

// 期限 → secid（仅 10Y 经 M1 实测验证，其余待验证后启用）
const TERM_SECIDS = {
  '10Y': { secid: '171.CN10Y', name: '中国10年期国债收益率' },
  // '5Y': { secid: '171.CN5Y', name: '中国5年期国债收益率' },   // 未实测
  // '1Y': { secid: '171.CN1Y', name: '中国1年期国债收益率' },   // 未实测
};

/**
 * 加载中国国债收益率序列（%）。
 * @param {{term?: '10Y'}} opts
 * @returns {Promise<Series>}
 */
export async function loadCnBondSeries({ term = '10Y' } = {}) {
  const conf = TERM_SECIDS[term];
  if (!conf) throw new Error('未知国债期限：' + term);
  const url = `${EM_KLINE_API}?secid=${conf.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53&klt=101&fqt=1&beg=0&end=20500101`;
  const data = await jsonp(url);
  const klines = data && data.data && data.data.klines;
  if (!klines || !klines.length) {
    throw new Error('国债收益率接口未返回数据（secid=' + conf.secid + '）');
  }
  return makeSeries(conf.secid, conf.name, 'eastmoney-kline', klinesToPoints(klines));
}
