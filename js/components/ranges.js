// 时间范围定义与序列过滤（macro/fund 卡片共用）
export const RANGES = [
  { key: '1M', days: 31 },
  { key: '3M', days: 92 },
  { key: '6M', days: 184 },
  { key: '1Y', days: 366 },
  { key: '3Y', days: 1097 },
  { key: '5Y', days: 1827 },
  { key: 'MAX', days: Infinity },
];

/** 按范围 key 过滤序列尾部（days 为回看天数） */
export function filterByRange(points, rangeKey) {
  const conf = RANGES.find((r) => r.key === rangeKey) || RANGES[RANGES.length - 1];
  if (!Number.isFinite(conf.days) || !points.length) return points;
  const lastMs = new Date(points[points.length - 1].date).getTime();
  const cutoff = lastMs - (conf.days - 1) * 86400000;
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}
