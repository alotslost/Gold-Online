// 数据源：国内场外基金净值（天天基金 pingzhongdata，script 注入，M1 实测通过）
// 实测样例：161116 易方达黄金主题人民币A，3644 点（2011-05-05 至今），单位净值 + 累计净值齐全
import { loadScript, makeSeries, tsToLocalDate } from './util.js';

const PZD_URL = (code) => `https://fund.eastmoney.com/pingzhongdata/${code}.js`;

/**
 * 加载基金净值序列。
 * @param {string} code 6 位基金代码
 * @param {{kind?: 'unit'|'acc'}} opts kind='unit' 单位净值（默认）；'acc' 累计净值
 * @returns {Promise<Series>} { code, name, source, points }
 */
export async function loadFundSeries(code, { kind = 'unit' } = {}) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error('基金代码需为 6 位数字：' + code);
  }
  // pingzhongdata 以 var 声明全局变量，无法 delete，改为置空防止旧数据残留
  window.fS_name = undefined;
  window.fS_code = undefined;
  window.Data_netWorthTrend = undefined;
  window.Data_ACWorthTrend = undefined;

  try {
    await loadScript(PZD_URL(code));
  } catch (e) {
    // 不存在的代码会返回 404，走脚本 onerror，与网络异常无法区分，合并提示
    throw new Error(`未找到基金 ${code}（或网络异常），请检查代码是否正确`);
  }

  if (window.fS_code !== code) {
    throw new Error(`未找到基金 ${code}，请检查代码是否正确`);
  }
  const name = window.fS_name || code;
  const source = 'fund-pingzhongdata';

  if (kind === 'acc') {
    // 累计净值格式：[[ts, value], ...]
    const raw = window.Data_ACWorthTrend || [];
    const points = raw
      .filter((r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[1]) && r[1] > 0)
      .map((r) => ({ date: tsToLocalDate(r[0]), value: r[1] }));
    return makeSeries(code, name + '（累计净值）', source, points);
  }

  // 单位净值格式：[{ x: ts, y: nav, equityReturn, unitMoney }, ...]
  const raw = window.Data_netWorthTrend || [];
  const points = raw
    .filter((r) => r && Number.isFinite(r.y) && r.y > 0)
    .map((r) => ({ date: tsToLocalDate(r.x), value: r.y }));
  return makeSeries(code, name, source, points);
}
