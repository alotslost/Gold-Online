// 自选基金面板（Tab 2）：顶部查询框 + 默认黄金基金看板 + 「个人基金」板块（localStorage 持久化）
import { createFundCard } from './fundcard.js';
import { disposeChart } from '../components/linechart.js';
import { readWatchlist } from '../store/watchlist.js';

// 默认展示的主要黄金基金（产品确认：黄金ETF + 联接A/C）
const DEFAULT_FUNDS = [
  { code: '518880', name: '华安黄金ETF' },
  { code: '000216', name: '华安黄金ETF联接A' },
  { code: '000217', name: '华安黄金ETF联接C' },
  { code: '008702', name: '华夏黄金ETF联接C' },
];

/** 清空容器：先销毁其中 ECharts 实例防泄漏 */
function clearGrid(el) {
  el.querySelectorAll('.chart').forEach((c) => disposeChart(c));
  el.innerHTML = '';
}

export function initFundsPanel() {
  const form = document.getElementById('fund-search-form');
  const input = document.getElementById('fund-code-input');
  const errEl = document.getElementById('fund-search-error');
  const resultEl = document.getElementById('fund-query-result');
  const boardEl = document.getElementById('board-gold');
  const mineEl = document.getElementById('board-mine');
  const mineEmptyEl = document.getElementById('mine-empty');

  // 折线数据类型切换（黄金基金看板标题右侧）：'nav' 单位净值 / 'chg' 日涨跌
  let boardMode = 'nav';
  const modeBar = document.getElementById('board-gold-mode');
  const MODES = [
    { key: 'nav', label: '单位净值' },
    { key: 'chg', label: '日涨跌' },
  ];
  const modeButtons = MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'range-btn' + (m.key === boardMode ? ' is-active' : '');
    b.textContent = m.label;
    b.addEventListener('click', () => {
      if (boardMode === m.key) return;
      boardMode = m.key;
      modeButtons.forEach((x) => x.classList.toggle('is-active', x === b));
      boardEl.querySelectorAll('.fund-card').forEach((el) => el.setMode && el.setMode(boardMode));
    });
    modeBar.appendChild(b);
    return b;
  });

  function renderMine() {
    clearGrid(mineEl);
    const list = readWatchlist();
    mineEmptyEl.hidden = list.length > 0;
    list.forEach((f) => mineEl.appendChild(createFundCard(f)));
  }

  // 默认黄金看板（卡片带当前板块数据类型）
  DEFAULT_FUNDS.forEach((f) => boardEl.appendChild(createFundCard({ ...f, mode: boardMode })));
  // 个人基金板块
  renderMine();
  document.addEventListener('watchlist-changed', renderMine);

  // 顶部查询
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const code = input.value.trim();
    if (!/^\d{6}$/.test(code)) {
      errEl.textContent = '请输入 6 位数字基金代码';
      errEl.hidden = false;
      return;
    }
    clearGrid(resultEl);
    resultEl.appendChild(createFundCard({ code }));
    input.value = '';
  });
}
