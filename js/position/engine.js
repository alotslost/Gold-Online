// 持仓盈亏计算引擎（纯函数，无 DOM 依赖，便于对账测试）
// 口径（docs/requirements.md FR-03）：
//   份额 = 投入本金 ÷ 持有成本单价
//   浮动盈亏(d) = 总份额 × 净值(d) − 总投入；盈亏率 = 浮动盈亏 ÷ 总投入
//   补仓：新增份额 = 补仓金额 ÷ 补仓日净值；新成本单价 = 总投入 ÷ 总份额
// 补仓日期非交易日时，顺延到下一个有净值的交易日；晚于最新净值日则取最新净值日。

/**
 * 将任意日期解析为有效净值日：第一个 >= 该日期的净值日；没有则取最后一个净值日。
 * @param {Array<{date: string, value: number}>} navPoints 升序净值序列
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string|null}
 */
export function resolveNavDate(navPoints, dateStr) {
  if (!navPoints || !navPoints.length) return null;
  const found = navPoints.find((p) => p.date >= dateStr);
  return (found || navPoints[navPoints.length - 1]).date;
}

/**
 * 计算持仓的逐日状态与汇总指标。
 * @param {{principal: number, costPrice: number, topups?: Array<{date: string, amount: number}>, navPoints: Array<{date: string, value: number}>}} input
 *   navPoints 应为已按建仓日期截断的净值序列（由调用方负责）
 * @returns {{daily: Array, topupDetails: Array, summary: object|null}}
 *   daily: [{ date, nav, shares, principal, costPrice, pnl, pnlRate }]
 *   topupDetails: [{ date, amount, effectiveDate, navAtTopup, newShares, costPriceAfter }]
 */
export function computePosition(input) {
  const { principal, costPrice, topups = [], navPoints } = input;
  if (!navPoints || !navPoints.length) {
    return { daily: [], topupDetails: [], summary: null };
  }

  let shares = principal / costPrice;
  let principalTotal = principal;

  // 解析补仓生效日并按日分组
  const resolved = topups
    .map((t) => ({ ...t, effectiveDate: resolveNavDate(navPoints, t.date) }))
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1));
  const topupsByDate = new Map();
  for (const t of resolved) {
    const arr = topupsByDate.get(t.effectiveDate) || [];
    arr.push(t);
    topupsByDate.set(t.effectiveDate, arr);
  }

  const daily = [];
  for (const p of navPoints) {
    const todays = topupsByDate.get(p.date);
    if (todays) {
      for (const t of todays) {
        const newShares = t.amount / p.value;
        shares += newShares;
        principalTotal += t.amount;
        t.navAtTopup = p.value;
        t.newShares = newShares;
        t.costPriceAfter = principalTotal / shares;
      }
    }
    const pnl = shares * p.value - principalTotal;
    daily.push({
      date: p.date,
      nav: p.value,
      shares,
      principal: principalTotal,
      costPrice: principalTotal / shares,
      pnl,
      pnlRate: pnl / principalTotal,
    });
  }

  const last = daily[daily.length - 1] || null;
  const summary = last
    ? {
        nav: last.nav,
        shares: last.shares,
        principal: last.principal,
        marketValue: last.shares * last.nav,
        pnl: last.pnl,
        pnlRate: last.pnlRate,
        costPrice: last.costPrice,
      }
    : null;

  return { daily, topupDetails: resolved, summary };
}
