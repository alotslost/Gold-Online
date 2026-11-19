// 持仓盈亏面板（Tab 3）：持仓录入 → 逐日盈亏/成本单价双图 → 补仓模拟与记录
// 持仓与补仓存 localStorage（hjzx.position）；净值数据走当日缓存（fund.<code>.unit，与基金看板共享）
import { loadFundSeries } from '../datasource/fund.js';
import { loadWithCache } from '../store/localcache.js';
import { readPosition, writePosition, clearPosition } from '../store/position.js';
import { computePosition } from '../position/engine.js';
import { readWatchlist } from '../store/watchlist.js';
import { recognizeImage, extractPositionFields } from '../ocr/position-ocr.js';
import { createChart, renderSeries, setChartStatus } from '../components/linechart.js';
import { RANGES, filterByRange } from '../components/ranges.js';

const els = {};
const state = { pos: null, series: null, computed: null, range: '1Y' };

const fmt2 = (n) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n) => n.toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtRate = (r) => (r >= 0 ? '+' : '') + (r * 100).toFixed(2) + '%';

export function initPositionPanel() {
  Object.assign(els, {
    form: document.getElementById('position-form'),
    code: document.getElementById('pos-code'),
    principal: document.getElementById('pos-principal'),
    cost: document.getElementById('pos-cost'),
    opened: document.getElementById('pos-opened'),
    clearBtn: document.getElementById('pos-clear'),
    error: document.getElementById('pos-error'),
    placeholder: document.getElementById('pos-placeholder'),
    stats: document.getElementById('position-stats'),
    chartsWrap: document.getElementById('position-charts'),
    rangeBar: document.getElementById('pos-range'),
    pnlChart: document.getElementById('chart-pos-pnl'),
    costChart: document.getElementById('chart-pos-cost'),
    note: document.getElementById('pos-note'),
    topupCard: document.getElementById('topup-card'),
    topupForm: document.getElementById('topup-form'),
    topupAmount: document.getElementById('topup-amount'),
    topupDate: document.getElementById('topup-date'),
    topupError: document.getElementById('topup-error'),
    topupTbody: document.getElementById('topup-tbody'),
    topupEmpty: document.getElementById('topup-empty'),
    codeList: document.getElementById('pos-code-list'),
    ocrBtn: document.getElementById('pos-ocr-btn'),
    ocrFile: document.getElementById('pos-ocr-file'),
    ocrStatus: document.getElementById('pos-ocr-status'),
  });

  els.pnlChartObj = createChart(els.pnlChart);
  els.costChartObj = createChart(els.costChart);

  buildRangeBar();
  buildCodeDatalist();

  els.form.addEventListener('submit', onSave);
  els.clearBtn.addEventListener('click', onClear);
  els.topupForm.addEventListener('submit', onAddTopup);
  els.ocrBtn.addEventListener('click', () => els.ocrFile.click());
  els.ocrFile.addEventListener('change', () => {
    const f = els.ocrFile.files && els.ocrFile.files[0];
    if (f) handleOcrImport(f);
    els.ocrFile.value = '';
  });

  state.pos = readPosition();
  if (state.pos) fillFormFromPos();
  refresh();
}

// ---- 控件 ----

function buildRangeBar() {
  els.rangeBar.setAttribute('role', 'group');
  els.rangeBar.setAttribute('aria-label', '时间范围');
  const buttons = RANGES.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'range-btn' + (r.key === state.range ? ' is-active' : '');
    b.textContent = r.key;
    b.addEventListener('click', () => {
      if (!state.computed) return;
      state.range = r.key;
      buttons.forEach((x) => x.classList.toggle('is-active', x === b));
      paintCharts();
    });
    els.rangeBar.appendChild(b);
    return b;
  });
}

function buildCodeDatalist() {
  for (const f of readWatchlist()) {
    const opt = document.createElement('option');
    opt.value = f.code;
    opt.label = f.name;
    els.codeList.appendChild(opt);
  }
}

function fillFormFromPos() {
  els.code.value = state.pos.fundCode;
  els.principal.value = state.pos.principal;
  els.cost.value = state.pos.costPrice;
  els.opened.value = state.pos.openedAt || '';
}

function showError(msg) {
  els.error.textContent = msg || '';
  els.error.hidden = !msg;
}

function showTopupError(msg) {
  els.topupError.textContent = msg || '';
  els.topupError.hidden = !msg;
}

// ---- 事件 ----

function onSave(e) {
  e.preventDefault();
  showError('');
  const code = els.code.value.trim();
  const principal = Number(els.principal.value);
  const costPrice = Number(els.cost.value);
  const openedAt = els.opened.value || null;
  if (!/^\d{6}$/.test(code)) return showError('请输入 6 位数字基金代码');
  if (!(principal > 0)) return showError('投入本金需为大于 0 的数字');
  if (!(costPrice > 0)) return showError('持有成本单价需为大于 0 的数字');
  // 同一只基金保留补仓记录；换了基金则清空补仓（净值口径不同）
  const topups = state.pos && state.pos.fundCode === code ? state.pos.topups : [];
  try {
    state.pos = writePosition({ fundCode: code, principal, costPrice, openedAt, topups });
  } catch (err) {
    return showError(err.message);
  }
  refresh();
}

function onClear() {
  if (!state.pos) return;
  if (!window.confirm('确定清空持仓数据？持仓与补仓记录将被删除，且无法恢复。')) return;
  clearPosition();
  state.pos = null;
  state.series = null;
  state.computed = null;
  els.form.reset();
  els.topupDate.value = '';
  paintVisibility();
  els.pnlChartObj.clear();
  els.costChartObj.clear();
}

function onAddTopup(e) {
  e.preventDefault();
  showTopupError('');
  if (!state.pos) return showTopupError('请先保存持仓');
  const amount = Number(els.topupAmount.value);
  const date = els.topupDate.value || defaultTopupDate();
  if (!(amount > 0)) return showTopupError('补仓金额需为大于 0 的数字');
  if (!date) return showTopupError('请选择补仓日期');
  if (state.pos.openedAt && date < state.pos.openedAt) return showTopupError('补仓日期不能早于建仓日期');
  state.pos.topups.push({ date, amount });
  try {
    state.pos = writePosition(state.pos);
  } catch (err) {
    return showTopupError(err.message);
  }
  els.topupAmount.value = '';
  recompute(); // 净值已在内存，重算即可
}

// ---- 截图 OCR 导入（v1.1 提前实现）----

function ocrStatus(msg) {
  els.ocrStatus.textContent = msg;
}

async function handleOcrImport(file) {
  els.ocrBtn.disabled = true;
  try {
    const text = await recognizeImage(file, ocrStatus);
    window.__lastOcrText = text; // 调试用：留存原始识别文本
    const f = extractPositionFields(text);
    let principal = null;
    let cost = null;
    if (f.shares != null && f.holdingAmount != null && f.holdingProfit != null) {
      // 路径 1（首选）：本金 = 持有金额 − 持有收益（与支付宝账本口径完全一致）；成本单价 = 本金 ÷ 份额
      principal = Math.round((f.holdingAmount - f.holdingProfit) * 100) / 100;
      cost = Math.round((principal / f.shares) * 10000) / 10000;
    } else if (f.shares != null && f.costPrice != null) {
      // 路径 2（兑底）：本金 = 份额 × 成本单价（显示成本为四位舍入值，可能有分位误差）
      principal = Math.round(f.shares * f.costPrice * 100) / 100;
      cost = f.costPrice;
    }
    if (f.fundCode) els.code.value = f.fundCode;
    if (principal != null) {
      els.principal.value = principal;
      els.cost.value = cost;
    }
    const missing = [];
    if (!f.fundCode) missing.push('基金代码');
    if (principal == null) missing.push('本金/成本（需份额与成本，或份额与持有金额、收益）');
    ocrStatus(
      `识别完成：代码 ${f.fundCode ?? '未识别'} · 份额 ${f.shares ?? '未识别'} · 成本 ${f.costPrice ?? '未识别'} · 持有金额 ${f.holdingAmount ?? '未识别'} · 持有收益 ${f.holdingProfit ?? '未识别'}`
      + (principal != null ? ` → 本金 ${principal}、成本单价 ${cost} 已填入表单，请核对后点「保存持仓并计算」` : `；未识别：${missing.join('、')}，请手动填写`)
    );
  } catch (e) {
    ocrStatus('OCR 失败：' + (e && e.message ? e.message : e));
  } finally {
    els.ocrBtn.disabled = false;
  }
}

// ---- 数据与计算 ----

function defaultTopupDate() {
  if (state.series && state.series.points.length) return state.series.points[state.series.points.length - 1].date;
  return '';
}

async function refresh() {
  if (!state.pos) {
    paintVisibility();
    return;
  }
  paintVisibility();
  const code = state.pos.fundCode;
  setChartStatus(els.pnlChart, { state: 'loading' });
  setChartStatus(els.costChart, { state: 'loading' });
  try {
    const s = await loadWithCache(`fund.${code}.unit`, () => loadFundSeries(code, { kind: 'unit' }));
    if (!state.pos || state.pos.fundCode !== code) return; // 期间用户已改持仓
    state.series = s;
  } catch (err) {
    state.series = null;
    state.computed = null;
    paintVisibility();
    showError(`净值加载失败（${err.message}），请稍后重试`);
    return;
  }
  showError('');
  recompute();
}

function recompute() {
  if (!state.pos || !state.series) return;
  let pts = state.series.points;
  let openedAdjusted = false;
  if (state.pos.openedAt) {
    const sliced = pts.filter((p) => p.date >= state.pos.openedAt);
    if (sliced.length) pts = sliced;
    else openedAdjusted = true; // 建仓日期晚于最新净值日：退回全序列
  }
  state.computed = computePosition({
    principal: state.pos.principal,
    costPrice: state.pos.costPrice,
    topups: state.pos.topups,
    navPoints: pts,
  });
  state.openedAdjusted = openedAdjusted;
  paintVisibility();
  paintAll();
}

// ---- 绘制 ----

function paintVisibility() {
  const has = !!(state.pos && state.computed && state.computed.summary);
  els.placeholder.hidden = !!state.pos;
  els.stats.hidden = !has;
  els.chartsWrap.hidden = !has;
  els.topupCard.hidden = !state.pos;
  els.clearBtn.hidden = !state.pos;
  els.topupEmpty.hidden = !(state.pos && state.pos.topups.length === 0);
  els.topupTbody.innerHTML = '';
}

function paintAll() {
  paintStats();
  paintNote();
  paintCharts();
  paintTopups();
  if (!els.topupDate.value) els.topupDate.value = defaultTopupDate();
}

function paintStats() {
  const s = state.computed.summary;
  els.stats.innerHTML = '';
  const pnlCls = s.pnl >= 0 ? 'chg-up' : 'chg-down';
  const cells = [
    ['当前净值', fmt4(s.nav)],
    ['总份额（份）', fmt2(s.shares)],
    ['总投入（元）', fmt2(s.principal)],
    ['当前市值（元）', fmt2(s.marketValue)],
    ['浮动盈亏（元）', `<span class="${pnlCls}">${(s.pnl >= 0 ? '+' : '') + fmt2(s.pnl)}</span>`],
    ['盈亏率', `<span class="${pnlCls}">${fmtRate(s.pnlRate)}</span>`],
    ['当前成本单价', fmt4(s.costPrice)],
  ];
  for (const [label, valueHtml] of cells) {
    const div = document.createElement('div');
    div.className = 'stat';
    const l = document.createElement('div');
    l.className = 'stat-label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'stat-value';
    v.innerHTML = valueHtml; // 仅来自计算结果与有限标签，无用户输入
    div.append(l, v);
    els.stats.appendChild(div);
  }
}

function paintNote() {
  const first = state.computed.daily[0];
  const opened = state.pos.openedAt || `未填（模拟起点 ${first.date}）`;
  const adjusted = state.openedAdjusted ? '（建仓日期晚于最新净值日，已按全部数据展示）' : '';
  els.note.textContent = `基金：${state.series.name}（${state.pos.fundCode}）· 建仓日期：${opened}${adjusted} · 来源：天天基金 · 日频`;
}

function paintCharts() {
  if (!state.computed) return;
  const view = filterByRange(state.computed.daily, state.range);
  setChartStatus(els.pnlChart, { state: 'ok' });
  setChartStatus(els.costChart, { state: 'ok' });
  renderSeries(els.pnlChartObj, {
    name: '浮动盈亏',
    color: 'accent',
    points: view.map((d) => ({ date: d.date, value: d.pnl })),
  }, { unit: '元', area: true, zeroBase: true });
  renderSeries(els.costChartObj, {
    name: '持有成本单价',
    color: 'muted',
    step: 'end',
    dashed: true,
    points: view.map((d) => ({ date: d.date, value: d.costPrice })),
  }, { unit: '元' });
  // 数据就绪时容器才变为可见（隐藏期间初始化尺寸为 0），主动重绘一次确保铺满
  els.pnlChartObj.resize();
  els.costChartObj.resize();
}

function paintTopups() {
  els.topupTbody.innerHTML = '';
  const details = state.computed.topupDetails;
  for (const t of details) {
    const tr = document.createElement('tr');
    const cells = [
      t.date,
      t.effectiveDate,
      fmt2(t.amount),
      fmt4(t.navAtTopup ?? 0),
      fmt2(t.newShares ?? 0),
      fmt4(t.costPriceAfter ?? 0),
    ];
    cells.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });
    const tdOp = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'topup-del';
    del.textContent = '删除';
    del.addEventListener('click', () => removeTopup(t.date, t.amount));
    tdOp.appendChild(del);
    tr.appendChild(tdOp);
    els.topupTbody.appendChild(tr);
  }
}

function removeTopup(date, amount) {
  const idx = state.pos.topups.findIndex((t) => t.date === date && t.amount === amount);
  if (idx === -1) return;
  state.pos.topups.splice(idx, 1);
  state.pos = writePosition(state.pos);
  recompute();
}
