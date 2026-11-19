// 宏观指数面板（Tab 1）：金价 / 美联储利率 / 中国国债 三图表
// 每图独立时间范围切换；数据整段加载一次缓存在内存，切范围只重渲染不重拉；
// localStorage 当日缓存（js/store/localcache.js）：同一天内刷新/重开不发请求，防 IP 风控；
// 「刷新」按钮强制重新拉取；金价卡支持 USD/盎司 ↔ RMB/克 双数据源右对齐切换。
import { loadGoldSeries, loadFedRateSeries, loadCnBondSeries } from '../datasource/index.js';
import { createChart, renderSeries, setChartStatus } from '../components/linechart.js';
import { RANGES, filterByRange } from '../components/ranges.js';
import { loadWithCache, cacheSet, cacheGet } from '../store/localcache.js';

// 卡片配置：key、图表容器、单位切换（金卡多市场）或单数据源、默认范围、是否阶梯线
const CARDS = [
  {
    key: 'gold', chartId: 'chart-gold', defaultRange: '1Y', step: false,
    // 多市场数据源（右对齐切换，默认 RMB/克，用户指定 2026-11-19）：伦敦金现接口无数据，上金所为主、COMEX 为备
    markets: {
      sge: {
        label: 'RMB/克', cacheKey: 'macro.gold.sge',
        loader: () => loadGoldSeries({ market: 'sge' }),
        unit: '元/克', sourceText: '来源：东方财富行情（上金所黄金9999）· 日频',
      },
      comex: {
        label: 'USD/盎司', cacheKey: 'macro.gold',
        loader: () => loadGoldSeries({ market: 'comex' }),
        unit: 'USD/oz', sourceText: '来源：东方财富行情（COMEX 黄金主力）· 日频',
      },
    },
  },
  {
    key: 'fed', chartId: 'chart-fed',
    loader: () => loadFedRateSeries(),
    cacheKey: 'macro.fed',
    unit: '%', defaultRange: '3Y', step: true,
    sourceText: '来源：纽约联储（联邦基金有效利率 EFFR）· 日频',
  },
  {
    key: 'cnbond', chartId: 'chart-cnbond',
    loader: () => loadCnBondSeries(),
    cacheKey: 'macro.cnbond',
    unit: '%', defaultRange: 'MAX', step: false,
    sourceText: '来源：东方财富行情（中国 10 年期国债收益率）· 日频',
  },
];

export function initMacroPanel() {
  CARDS.forEach(mountCard);
}

function mountCard(conf) {
  const chartEl = document.getElementById(conf.chartId);
  if (!chartEl) return;

  const card = chartEl.closest('.card');
  const noteEl = card.querySelector('.card-source');
  const chart = createChart(chartEl);
  const state = {
    points: null,
    range: conf.defaultRange,
    market: conf.markets ? Object.keys(conf.markets)[0] : null,
  };
  // 当前生效的市场配置（多市场卡）或卡片本身（单数据源卡）
  const mconf = () => (conf.markets ? conf.markets[state.market] : conf);

  // 金价卡：标题右侧单位/市场切换（右对齐）
  let rangeBar = null;
  if (conf.markets) {
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = card.querySelector('.card-title');
    title.before(head); // 先占住标题原位置
    head.appendChild(title); // 再把标题移入 head（自动从原位置移除）
    const marketBar = document.createElement('div');
    marketBar.className = 'mode-bar';
    marketBar.setAttribute('role', 'group');
    marketBar.setAttribute('aria-label', '数据单位');
    const marketBtns = Object.entries(conf.markets).map(([key, m]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'range-btn' + (key === state.market ? ' is-active' : '');
      b.textContent = m.label;
      b.addEventListener('click', async () => {
        if (state.market === key || b.disabled) return;
        state.market = key;
        marketBtns.forEach((x) => x.classList.toggle('is-active', x === b));
        marketBtns.forEach((x) => (x.disabled = true));
        noteEl.textContent = m.sourceText + '（切换中…）';
        await load(false);
        marketBtns.forEach((x) => (x.disabled = false));
      });
      marketBar.appendChild(b);
      return b;
    });
    head.appendChild(marketBar);
  }

  // 时间范围按钮条 + 强制刷新按钮
  rangeBar = document.createElement('div');
  rangeBar.className = 'range-bar';
  rangeBar.setAttribute('role', 'group');
  rangeBar.setAttribute('aria-label', '时间范围');
  const buttons = RANGES.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'range-btn' + (r.key === state.range ? ' is-active' : '');
    b.textContent = r.key;
    b.addEventListener('click', () => {
      if (!state.points) return;
      state.range = r.key;
      buttons.forEach((x) => x.classList.toggle('is-active', x === b));
      render();
    });
    rangeBar.appendChild(b);
    return b;
  });
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'range-btn refresh-btn';
  refreshBtn.textContent = '刷新';
  refreshBtn.title = '强制重新拉取最新数据';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    noteEl.textContent = mconf().sourceText + '（更新中…）';
    await load(true);
    refreshBtn.disabled = false;
  });
  rangeBar.appendChild(refreshBtn);
  chartEl.before(rangeBar);

  function render() {
    const view = filterByRange(state.points, state.range);
    renderSeries(chart, { ...conf.series, points: view }, { step: conf.step, unit: mconf().unit });
  }

  function apply(series, { fromCache = false, fetchedOn = '', stale = false } = {}) {
    conf.series = series;
    state.points = series.points;
    setChartStatus(chartEl, { state: 'ok' });
    const m = mconf();
    const last = series.points[series.points.length - 1];
    const suffix = fromCache ? `（缓存 ${fetchedOn}${stale ? ' · 更新中' : ''}）` : '';
    noteEl.textContent = `${m.sourceText} · 最新 ${last.date}${suffix}`;
    render();
  }

  async function load(force = false) {
    try {
      const mc = mconf();
      if (force) {
        const series = await mc.loader();
        cacheSet(mc.cacheKey, series);
        apply(series);
        return;
      }
      const res = await loadWithCache(mc.cacheKey, mc.loader);
      apply(res, { fromCache: res.fromCache, fetchedOn: res.fetchedOn, stale: res.stale });
      if (res.stale) {
        // 旧缓存先展示，后台拉新
        try {
          const fresh = await mc.loader();
          cacheSet(mc.cacheKey, fresh);
          apply(fresh);
        } catch (e) {
          noteEl.textContent = `${mc.sourceText} · 最新（缓存 ${res.fetchedOn} · 更新失败）`;
        }
      }
    } catch (e) {
      setChartStatus(chartEl, { state: 'error', message: `数据源暂时不可用（${e.message}）` });
      noteEl.textContent = mconf().sourceText;
      rangeBar.querySelectorAll('.range-btn:not(.refresh-btn)').forEach((b) => (b.disabled = true));
    }
  }

  // 首次加载：无缓存显示 loading，有缓存直接渲染
  if (!cacheGet(mconf().cacheKey)) {
    setChartStatus(chartEl, { state: 'loading' });
  }
  load(false);
}
