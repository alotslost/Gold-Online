// 主题切换：默认跟随系统亮暗色（prefers-color-scheme），右上角按钮手动切换并记忆（localStorage hjzx.theme）。
// 手动设定后不再跟随系统；主题变化时广播 hjzx-theme-change 事件，图表组件监听后统一重绘。
const KEY = 'hjzx.theme';

export function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const system = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const stored = localStorage.getItem(KEY);
  const apply = (t, announce = true) => {
    document.documentElement.dataset.theme = t;
    syncBtn();
    if (announce) document.dispatchEvent(new CustomEvent('hjzx-theme-change'));
  };
  const syncBtn = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.title = dark ? '切换到浅色模式' : '切换到深色模式';
  };

  // 初始：手动记忆优先，否则跟随系统（不广播，面板初始化时自然取到当前主题）
  apply(stored === 'light' || stored === 'dark' ? stored : system(), false);

  // 跟随系统：仅在用户未手动设定时生效
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(KEY)) apply(system());
  });

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
  });

  syncBtn();
}
