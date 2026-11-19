# agent.md — 黄金在线 项目导航与规范

> **每个开发会话的入口文件。** 先读本文件，再按「工作流」一节行动。

## 1. 项目一句话

个人黄金基金投资看板：宏观指数（金价/美联储利率/中国国债）+ 自选基金净值 + 持仓盈亏与补仓模拟。纯静态站点，部署 Gitee Pages，数据来自免费公开源，个人数据仅存浏览器 localStorage。

## 2. 文件路径地图

```
agent.md                # 本文件：导航与规范入口（勿随意改写）
docs/
  requirements.md       # 需求文档：功能需求 FR、非功能 NFR、数据源与验收标准
  product.md            # 产品文档：页面结构、模块交互、数据模型、异常边界
  roadmap.md            # 开发路线：里程碑 M0–M5、任务勾选、数据源实测结论
  completed.md          # 已完成功能清单：完成并验证一个功能就追加一行
index.html              # 站点入口（M0 起，置于仓库根：无构建链，静态托管直接发布根目录）
css/                    # 样式
js/                     # ES Modules（前端源码）
  datasource/           # 数据源适配层（基金/金价/FRED/国债，M1 起）
  components/           # 图表与通用组件
  store/                # localStorage 读写（key 前缀 hjzx.）
vendor/
  echarts/              # 本地化的 ECharts（echarts.min.js），不依赖运行时 CDN
data/                   # 降级方案的静态 JSON 快照（若 M1 启用）
scripts/                # 快照抓取脚本（若启用，python3）
```

- 文件命名：**一律英文小写**（md 与代码均如此）；md 文档集中在 `docs/`。
- 本文件与 docs 四件套是治理文件：调整需用户决定，不得顺手改写。

## 3. 工作流（节省上下文的核心机制）

1. **入口**：读本文件 → 读 `docs/roadmap.md` 找最靠前的未完成任务。
2. **按需读**：只读完成任务所需的文档章节（需求细节查 requirements.md，交互与数据结构查 product.md），不整卷重读。
3. **开发与验证**：遵守项目编码规则（先读现状、先取基线、跑同层校验、如实报告）。
4. **完成即记录**：功能验证通过后——
   - 在 `docs/completed.md` 追加一行（日期、功能、对应需求、验证方式）；
   - 在 `docs/roadmap.md` 勾选对应任务；
   - 下一轮从 roadmap 找后续任务，不再重复已完成的工作。
5. **中断**：在 roadmap.md 把进行中任务标 `[~]` 并注明停在哪一步、哪些改动已落盘。

## 4. 技术与环境约定

| 项 | 约定 |
|---|---|
| 架构 | 纯静态，无后端、无构建工具链；原生 HTML/CSS/JS + ECharts |
| 本地预览 | `python3 -m http.server 8000`，访问 `http://localhost:8000`（ES Modules 不能 file:// 直开） |
| 网络代理 | git SSH 推送（github.com:22）直连可用；github 网页与 raw.githubusercontent 访问不稳定，需本地代理 `http://127.0.0.1:7890`；Gitee/npm 境外资源同需要时可用代理 |
| 部署 | GitHub 仓库 alotslost/Gold-Online（SSH 推送直连可用）+ GitHub Pages 发布（push main 自动发布，免费版需公开仓库）；esa.jsonc 为 ESA Pages 遗留配置，在 GitHub Pages 下无作用、保留无害 |
| 个人数据 | localStorage，key 前缀 `hjzx.`；不采集不上传 |
| 平台 | macOS（darwin），shell=bash |

## 5. 关键业务口径（速查）

- 品种范围：国内场外基金（6 位代码）；不做场内股票/ETF、海外资产。
- 持仓语义：输入的是**投入本金（元）**与持有成本单价 → `份额 = 本金 ÷ 成本单价`。
- 补仓：`新份额 = 补仓金额 ÷ 补仓日净值`；`新成本单价 = 总投入 ÷ 总份额`。
- 数据源最终接入方式以 `docs/roadmap.md` §2「实测结论」为准，不得凭猜测接入。
