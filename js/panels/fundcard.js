// 基金数据看板卡片：名称/代码、最新净值与日涨跌、净值+累计净值双线图、时间范围切换、保存/移出按钮
// 数据走当日缓存（loadWithCache），同一天内重复打开/刷新不发请求
import { loadFundSeries } from '../datasource/fund.js';
import { createChart, renderSeries, setChartStatus } from '../components/linechart.js';
import { RANGES, filterByRange } from '../components/ranges.js';
import { loadWithCache } from '../store/localcache.js';
import { isWatched, addToWatchlist, removeFromWatchlist } from '../store/watchlist.js';

/**
 * 创建一张基金看板卡片（异步加载数据后自动渲染）。
 * @param {{code: string, name?: string}} fund
 * @returns {HTMLElement}
 */
export function createFundCard({ code, name, mode = 'nav' }) {
  const card = document.createElement('div');
  card.className = 'card fund-card';
  card.dataset.fundCode = code;

  // 头部：标题 + 保存按钮（DOM API 构建，避免名称注入 HTML）
  const head = document.createElement('div');
  head.className = 'fund-head';
  const title = document.createElement('h2');
  title.className = 'card-title';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'fund-name';
  nameSpan.textContent = name || ('基金 ' + code);
  const codeSpan = document.createElement('span');
  codeSpan.className = 'fund-code';
  codeSpan.textContent = code;
  title.append(nameSpan, codeSpan);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.type = 'button';
  head.append(title, saveBtn);
  card.appendChild(head);

  const infoEl = document.createElement('div');
  infoEl.className = 'fund-info';
  infoEl.textContent = '加载中…';
  card.appendChild(infoEl);

  const chartEl = document.createElement('div');
  chartEl.className = 'chart';
  card.appendChild(chartEl);

  const noteEl = document.createElement('p');
  noteEl.className = 'card-source';
  card.appendChild(noteEl);

  const chart = createChart(chartEl);
  const state = { unit: null, acc: null, accIdentical: false, chg: null, mode, range: '1Y' };

  // 时间范围按钮条
  const bar = document.createElement('div');
  bar.className = 'range-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '时间范围');
  const buttons = RANGES.map((r) => {
    const b = document.createElement('button');
    b.className = 'range-btn' + (r.key === state.range ? ' is-active' : '');
    b.textContent = r.key;
    b.addEventListener('click', () => {
      if (!state.unit) return;
      state.range = r.key;
      buttons.forEach((x) => x.classList.toggle('is-active', x === b));
      render();
    });
    bar.appendChild(b);
    return b;
  });
  chartEl.before(bar);

  function render() {
    if (state.mode === 'chg') {
      if (!state.chg) return;
      renderSeries(chart, { name: (state.unit.name || name || code) + '（日涨跌）', points: filterByRange(state.chg, state.range) }, { unit: '%', zeroBase: true });
      return;
    }
    const list = [{ ...state.unit, points: filterByRange(state.unit.points, state.range) }];
    if (state.acc && !state.accIdentical) list.push({ ...state.acc, points: filterByRange(state.acc.points, state.range) });
    renderSeries(chart, list, { unit: '元' });
  }

  // 由单位净值序列派生日涨跌序列（%，相对前一交易日）
  function deriveChgPoints(points) {
    const out = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].value;
      if (prev > 0) out.push({ date: points[i].date, value: (points[i].value / prev - 1) * 100 });
    }
    return out;
  }

  // 切换折线数据类型（'nav' 单位净值 / 'chg' 日涨跌），由板块切换标签调用
  card.setMode = (m) => {
    state.mode = m;
    render();
  };

  // 判断累计净值是否与单位净值逐日一致（无分红基金两者相同，无需画两条重合线）
  function computeAccIdentical() {
    if (!state.acc) return false;
    const amap = new Map(state.acc.points.map((p) => [p.date, p.value]));
    let checked = 0, diff = 0;
    for (const p of state.unit.points) {
      if (amap.has(p.date)) {
        checked++;
        if (Math.abs(amap.get(p.date) - p.value) > 0.0001) diff++;
      }
    }
    return checked > 0 && diff === 0;
  }

  function updateInfo(fromCache, fetchedOn) {
    const pts = state.unit.points;
    const last = pts[pts.length - 1];
    let chgHtml = '';
    if (pts.length >= 2) {
      const chg = (last.value / pts[pts.length - 2].value - 1) * 100;
      const cls = chg >= 0 ? 'chg-up' : 'chg-down';
      const sign = chg >= 0 ? '+' : '';
      chgHtml = ` · 日涨跌 <span class="${cls}">${sign}${chg.toFixed(2)}%</span>`;
    }
    infoEl.innerHTML = `最新净值 <strong>${last.value.toFixed(4)}</strong>（${last.date}）${chgHtml}`;
    const suffix = fromCache ? `（缓存 ${fetchedOn}）` : '';
    const accNote = state.accIdentical ? ' · 无分红记录，累计净值与单位净值一致' : '';
    noteEl.textContent = `来源：天天基金 · 日频${accNote}${suffix}`;
  }

  function syncSaveBtn() {
    const saved = isWatched(code);
    saveBtn.textContent = saved ? '移出' : '保存';
    saveBtn.classList.toggle('is-saved', saved);
    saveBtn.title = saved ? '从「个人基金」移出' : '保存到「个人基金」';
  }
  saveBtn.addEventListener('click', () => {
    if (isWatched(code)) {
      removeFromWatchlist(code);
    } else {
      addToWatchlist(code, (state.unit && state.unit.name) || name || code);
    }
    syncSaveBtn();
    document.dispatchEvent(new CustomEvent('watchlist-changed'));
  });
  syncSaveBtn();

  // 加载：单位净值必需，累计净值尽力
  const pUnit = loadWithCache(`fund.${code}.unit`, () => loadFundSeries(code, { kind: 'unit' }));
  const pAcc = loadWithCache(`fund.${code}.acc`, () => loadFundSeries(code, { kind: 'acc' }));
  Promise.allSettled([pUnit, pAcc]).then(([uR, aR]) => {
    if (uR.status === 'rejected') {
      infoEl.textContent = '加载失败';
      setChartStatus(chartEl, { state: 'error', message: `净值加载失败（${uR.reason && uR.reason.message}）` });
      bar.querySelectorAll('.range-btn').forEach((b) => (b.disabled = true));
      return;
    }
    const u = uR.value;
    state.unit = u;
    if (aR.status === 'fulfilled') state.acc = aR.value;
    state.accIdentical = computeAccIdentical();
    state.chg = deriveChgPoints(u.points);
    // 名称以接口返回为准
    nameSpan.textContent = u.name || name || code;
    setChartStatus(chartEl, { state: 'ok' });
    updateInfo(u.fromCache, u.fetchedOn);
    render();
  });

  return card;
}
