// 黄金在线 · 入口模块
// 结构：js/main.js（Tab 切换 + 各面板初始化）、js/panels/（面板装配）、js/components/（图表组件）、js/datasource/（数据层）、js/store/（localStorage，M3 起）
import { initMacroPanel } from './panels/macro.js';
import { initFundsPanel } from './panels/funds.js';
import { initPositionPanel } from './panels/position.js';
import { initTheme } from './theme.js';
import { resizeAllCharts } from './components/linechart.js';

// 页面错误采集：便于验证与后续排查（读 window.__pageErrors）
window.__pageErrors = [];
window.addEventListener('error', (e) => {
  const stack = e.error && e.error.stack ? ' | stack: ' + String(e.error.stack).split('\n').slice(0, 3).join(' ⏎ ') : '';
  window.__pageErrors.push(`${e.message || '(no message)'} @ ${e.filename || '(no file)'}:${e.lineno}:${e.colno}${stack}`);
});

const tabs = document.querySelectorAll('#tabs .tab');
const panels = document.querySelectorAll('.panel');

function switchTab(name) {
  tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => {
    const show = p.id === `panel-${name}`;
    p.classList.toggle('is-active', show);
    if (show) p.removeAttribute('hidden');
    else p.setAttribute('hidden', '');
  });
  // 面板从隐藏变可见后，隐藏期间初始化的图表尺寸为 0，统一重绘（修复图表空白）
  resizeAllCharts();
}

tabs.forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// 主题初始化（先于面板：图表初始化时取到正确主题色）
initTheme();
// 宏观指数面板（M2）
initMacroPanel();
// 自选基金面板（M3）
initFundsPanel();
// 持仓盈亏面板（M4）
initPositionPanel();

// 骨架自检（控制台确认）
console.log('[hjzx] ready; echarts =', typeof window.echarts);
