// 通用折线图组件（封装 ECharts，vendor 全局脚本注入 window.echarts）
// 配色从 CSS 变量读取（--accent/--text-2/--grid），随主题自动适配；
// 监听 hjzx-theme-change 事件，主题切换时对所有存活图表重绘。
const GRID = { left: 56, right: 18, top: 24, bottom: 40 };

// 存活图表登记表：页签切换 resize、主题切换重绘
const liveCharts = new Set(); // { chart, seriesInput, opts }

function chartTheme() {
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {
    accent: css('--accent') || '#0071E3',
    muted: css('--text-2') || '#98989D',
    text: css('--text-2') || '#98989D',
    grid: css('--grid') || 'rgba(0,0,0,0.06)',
  };
}

// 序列可携带 color: 'accent' | 'muted' | 具体色值；未携带时按序取默认色板
function resolveColor(c, theme, fallback) {
  if (c == null) return fallback;
  if (c === 'accent') return theme.accent;
  if (c === 'muted') return theme.muted;
  return c;
}

/** 在容器上初始化 ECharts 实例 */
export function createChart(el) {
  const chart = window.echarts.init(el);
  liveCharts.add({ chart });
  // 容器尺寸变化时自动重绘（窗口缩放等）
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
  } else {
    window.addEventListener('resize', () => chart.resize());
  }
  return chart;
}

/** 所有存活图表重绘（页签从隐藏变可见后调用，修复 0 尺寸空白） */
export function resizeAllCharts() {
  liveCharts.forEach(({ chart }) => chart.resize());
}

// 主题切换 → 用各自最后一次渲染参数重绘全部图表
document.addEventListener('hjzx-theme-change', () => {
  liveCharts.forEach(({ chart, seriesInput, opts }) => {
    if (seriesInput) renderSeries(chart, seriesInput, opts || {});
  });
});

/** 销毁实例（重挂载前调用，防泄漏） */
export function disposeChart(el) {
  const inst = window.echarts.getInstanceByDom(el);
  if (inst) {
    for (const item of liveCharts) {
      if (item.chart === inst) liveCharts.delete(item);
    }
    inst.dispose();
  }
}

/**
 * 在图表容器上显示状态浮层。
 * @param {HTMLElement} el 图表容器
 * @param {{state: 'loading'|'error'|'ok', message?: string}} s state='ok' 时移除浮层
 */
export function setChartStatus(el, { state, message }) {
  el.querySelectorAll(':scope > .chart-status').forEach((n) => n.remove());
  if (state === 'ok') return;
  const div = document.createElement('div');
  div.className = 'chart-status' + (state === 'error' ? ' is-error' : '');
  div.textContent = state === 'loading' ? '加载中…' : (message || '数据源暂时不可用');
  el.appendChild(div);
}

/**
 * 渲染折线图。seriesInput 传单个序列或序列数组（多序列自动加图例，第 2 条起用虚线）。
 * @param {{name?: string, color?: 'accent'|'muted'|string, step?: 'end', dashed?: boolean, points: [{date, value}]}|Array} seriesInput
 * @param {{step?: boolean, unit?: string, zeroBase?: boolean, area?: boolean}} opts
 *   step=true 用阶梯线；unit 用于悬浮提示单位；zeroBase=true 时 y 轴强制含 0；area=true 时首序列填充面积
 */
export function renderSeries(chart, seriesInput, { step = false, unit = '', zeroBase = false, area = false } = {}) {
  const th = chartTheme();
  const list = Array.isArray(seriesInput) ? seriesInput : [seriesInput];
  const multi = list.length > 1;
  chart.clear();
  chart.setOption({
    legend: multi
      ? { top: 0, right: 8, itemWidth: 16, textStyle: { color: th.text, fontSize: 11 } }
      : undefined,
    grid: { ...GRID, top: multi ? 34 : 24 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(255, 255, 255, 0.02)', // 占位，实际样式由 ECharts 主题决定
      valueFormatter: (v) => (unit ? `${v} ${unit}` : String(v)),
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: th.grid } },
      axisLabel: { hideOverlap: true, color: th.text, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      scale: !zeroBase, // zeroBase=true（涨跌幅/盈亏）时 y 轴默认含 0
      axisLabel: { color: th.text, fontSize: 11 },
      splitLine: { lineStyle: { color: th.grid } },
    },
    series: list.map((s, i) => {
      const color = resolveColor(s.color, th, i === 0 ? th.accent : th.muted);
      const stepOpt = s.step != null ? s.step : (step ? 'end' : undefined);
      const dashed = s.dashed != null ? s.dashed : i > 0;
      return {
        name: s.name || '',
        type: 'line',
        showSymbol: false,
        sampling: 'lttb', // 大序列（9000+ 点）降采样保渲染流畅
        step: stepOpt,
        data: s.points.map((p) => [p.date, p.value]),
        lineStyle: { width: multi ? 1.4 : 1.6, color, type: dashed ? 'dashed' : 'solid' },
        itemStyle: { color },
        areaStyle: area && i === 0 ? { opacity: 0.12, color } : undefined,
      };
    }),
  });
  // 记录渲染参数，供主题切换重绘
  for (const item of liveCharts) {
    if (item.chart === chart) {
      item.seriesInput = seriesInput;
      item.opts = { step, unit, zeroBase, area };
    }
  }
}
