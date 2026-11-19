// 数据源：黄金价格（东方财富 K 线 JSONP，M1 实测通过）
// 实测样例：COMEX黄金 101.GC00Y 9320 点（1990-01-03 至今）；黄金9999 118.AU9999 5566 点
// 说明：伦敦金现（XAU 现货）在该接口未提供（119.XAU 等候选均无数据），故默认 COMEX 主力合约
import { EM_KLINE_API, jsonp, klinesToPoints, makeSeries } from './util.js';

// market → { secid, name, unit }（'london' 无数据，勿启用）
const GOLD_MARKETS = {
  comex: { secid: '101.GC00Y', name: 'COMEX黄金', unit: 'USD/oz' },
  sge: { secid: '118.AU9999', name: '黄金9999（上金所）', unit: '元/克' },
};

/**
 * 加载黄金价格序列。
 * @param {{market?: 'comex'|'sge'}} opts
 * @returns {Promise<Series>}
 */
export async function loadGoldSeries({ market = 'comex' } = {}) {
  const conf = GOLD_MARKETS[market];
  if (!conf) throw new Error('未知黄金市场：' + market);
  const url = `${EM_KLINE_API}?secid=${conf.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53&klt=101&fqt=1&beg=0&end=20500101`;
  const data = await jsonp(url);
  const klines = data && data.data && data.data.klines;
  if (!klines || !klines.length) {
    throw new Error('黄金行情接口未返回数据（secid=' + conf.secid + '）');
  }
  return makeSeries(conf.secid, conf.name + '（' + conf.unit + '）', 'eastmoney-kline', klinesToPoints(klines));
}
