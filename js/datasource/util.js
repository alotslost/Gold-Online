// 数据源公共工具：脚本注入 / JSONP / 序列规整
// 统一序列结构（见 docs/product.md §4.1）：
//   { code, name, source, points: [{ date: 'YYYY-MM-DD', value: number }] }

// 东方财富 K 线 JSONP 接口（fields2=f51 日期, f53 收盘价）
export const EM_KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

// 通过 <script> 注入加载跨域 JS（无 CORS 约束），超时拒绝
export function loadScript(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let done = false;
    const timer = setTimeout(() => finish(new Error('请求超时（> ' + timeoutMs + 'ms）')), timeoutMs);
    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.remove();
      err ? reject(err) : resolve();
    }
    s.onload = () => finish(null);
    s.onerror = () => finish(new Error('脚本加载失败（网络或接口不可用）'));
    s.src = url;
    document.head.appendChild(s);
  });
}

// JSONP：追加 cb=<随机回调名>，返回回调数据
export function jsonp(url, { cbParam = 'cb', timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'hjzx' + Math.random().toString(36).slice(2, 10);
    const timer = setTimeout(() => { cleanup(); reject(new Error('请求超时（> ' + timeoutMs + 'ms）')); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    window[cb] = (data) => { cleanup(); resolve(data); };
    const s = document.createElement('script');
    s.src = url + (url.includes('?') ? '&' : '?') + cbParam + '=' + cb;
    s.onerror = () => { cleanup(); reject(new Error('脚本加载失败（网络或接口不可用）')); };
    document.head.appendChild(s);
  });
}

// 东方财富 K 线 klines（"YYYY-MM-DD,close"）→ points
export function klinesToPoints(klines) {
  const points = (klines || [])
    .map((line) => {
      const [date, close] = line.split(',');
      return { date, value: Number(close) };
    })
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value) && p.value > 0);
  return dedupeAndSort(points);
}

// 规整：按日期去重、升序排列
export function dedupeAndSort(points) {
  const map = new Map();
  for (const p of points) map.set(p.date, p.value); // 后写覆盖，保留最新值
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
}

// 时间戳（ms）→ 本地时区日期字符串（避免 toISOString 的 UTC 偏移导致日期差一天）
export function tsToLocalDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 组装统一序列
export function makeSeries(code, name, source, points) {
  return { code, name, source, points: dedupeAndSort(points) };
}
