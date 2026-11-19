// 截图 OCR 导入持仓（v1.1 功能提前实现，2026-11-19）
// 本地识别：Tesseract.js + chi_sim（模型与 wasm 已本地化到 vendor/tesseract/），数据不出浏览器。
// 安全约定：识别结果只负责「填入表单」，由用户核对后手动点「保存持仓并计算」落库，禁止直接写库。
const LIB_URL = 'vendor/tesseract/tesseract.min.js';

let workerPromise = null;
let progressCb = null;

function loadLib() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = LIB_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('OCR 组件加载失败（vendor/tesseract/tesseract.min.js 不可用）'));
    document.head.appendChild(s);
  });
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('chi_sim', 1 /* OEM.LSTM_ONLY */, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract/core/',
      langPath: 'vendor/tesseract/lang/',
      gzip: false, // tessdata_fast 的 .traineddata 为未压缩格式
      logger: (m) => {
        if (progressCb) progressCb(m);
      },
    });
  }
  return workerPromise;
}

/**
 * 识别图片，返回全文文本。
 * @param {File|Blob|string} image 文件对象或 URL
 * @param {(status: string) => void} [onStatus] 进度回调
 */
export async function recognizeImage(image, onStatus) {
  progressCb = (m) => {
    if (!onStatus) return;
    const pct = m.progress != null ? ' ' + Math.round(m.progress * 100) + '%' : '';
    onStatus(`OCR ${m.status}${pct}`);
  };
  await loadLib();
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return data.text;
}

/**
 * 从 OCR 文本提取支付宝/天天基金资产详情的关键字段。
 * @param {string} text
 * @returns {{fundCode: ?string, shares: ?number, costPrice: ?number, holdingAmount: ?number, holdingProfit: ?number}}
 */
export function extractPositionFields(text) {
  const t = String(text)
    .replace(/，/g, ',')
    .replace(/[−–—]/g, '-') // OCR 常把负号识别为多种横线字符，统一为 '-'
    .replace(/[\u00A0\u3000]/g, ' ');
  const num = (s) => {
    const n = Number(String(s).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const pick = (re) => {
    const m = t.match(re);
    return m ? num(m[1]) : null;
  };

  // 基金代码：首个独立出现的 6 位数字（0/1/3 开头常见）
  let fundCode = null;
  const codeMatch = t.match(/(?:^|[\s:：])([013]\d{5})(?=$|[\s。．,.])/m);
  if (codeMatch) fundCode = codeMatch[1];

  const shares = pick(/持有份额[\s:：]*([\d,]+\.\d{1,4})/);
  const costPrice = pick(/持有成本[\s:：]*([\d]+\.\d{1,4})/);
  const holdingAmount = pick(/持有金额[\s:：]*([\d,]+\.\d{2})/);
  // 持有收益（注意排除「持有收益率」）；同行匹配失败时跨行提取：
  // 标签行「… 持有收益(元) … 收益率」与数值行分行时，按标签序号取数值行中第 N 个非百分比数字
  let holdingProfit = pick(/持有收益\s*[（(]\s*元\s*[)）]\s*[:：]?\s*(-?[\d,]+\.\d{2})/);
  if (holdingProfit == null) holdingProfit = pick(/持有收益(?!率)\s*[:：]?\s*(-?[\d,]+\.\d{2})/);
  if (holdingProfit == null) {
    // 跨行提取：标签行「昨日收益(元) … 持有收益(元) … 收益率」与数值行分行时，
    // 按标签行中「持有收益(元)」前有几个收益类标签，取数值行对应序号的非百分比数字
    const lines = t.split('\n');
    const li = lines.findIndex((l) => /持有收益\s*[（(]\s*元\s*[)）]/.test(l));
    if (li !== -1 && lines[li + 1]) {
      const labelRow = lines[li];
      const pos = labelRow.search(/持有收益/);
      const order = (labelRow.slice(0, pos).match(/收益/g) || []).length;
      const nums = (lines[li + 1].match(/-?[\d,]+\.\d{2}(?!\s*%)/g) || []).map(num).filter((n) => n != null);
      if (nums.length > order) holdingProfit = nums[order];
    }
  }

  return { fundCode, shares, costPrice, holdingAmount, holdingProfit };
}
