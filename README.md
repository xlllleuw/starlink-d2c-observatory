# Starlink D2C Observatory

Starlink Direct to Cell 网络可视化研究项目。提供二维／三维地球、卫星轨道、实时天空图、TAC 研究模型、国家合作频谱查询和精选研究资料。网站界面为英文，部署说明为中文。

[在线演示](https://starlink-d2c-observatory.xiaoboyu0925.chatgpt.site/dashboard) · [AI 下载与本地部署提示词](AI_SETUP_PROMPTS.md)

本项目为独立研究展示，不是 SpaceX、Starlink 或合作运营商的官方网站。

## 快速开始：本地运行（推荐）

### 1. 准备环境

- Windows、macOS 或 Linux。
- [Node.js](https://nodejs.org/) 22.13 或更高版本；建议安装当前 LTS。
- 支持 WebGL 的现代浏览器，建议启用硬件加速。
- 联网获取 OpenStreetMap 瓦片和最新星历。

**仓库已包含 `public/vendor/` 浏览器依赖和 `public/data/` 启动数据。普通本地运行不需要 `npm install`、pnpm、Python、数据库、API Key、域名或托管账号。**

### 2. 下载项目

在本项目 GitHub 页面选择 **Code → Download ZIP**，解压后进入包含 `README.md`、`public/`、`server/` 和 `scripts/` 的目录。

也可以复制 GitHub 页面上的实际仓库 HTTPS 地址：

```text
git clone https://github.com/xlllleuw/starlink-d2c-observatory.git
cd starlink-d2c-observatory
```

仓库地址：https://github.com/xlllleuw/starlink-d2c-observatory 。私有仓库需要访问权限；公开后其他用户可直接下载。

### 3. 启动

在项目根目录打开终端：

```text
node --version
node scripts/local-server.mjs
```

保持终端运行，在浏览器访问：

**http://127.0.0.1:4173/dashboard.html**

本地也支持 http://127.0.0.1:4173/ 。线上使用的 `/dashboard` 路径不适用于当前本地服务器，请使用上面的地址。停止服务按 `Ctrl+C`。

### 更改端口

Windows PowerShell：

```powershell
$env:PORT = '4174'
node scripts/local-server.mjs
```

macOS／Linux：

```sh
PORT=4174 node scripts/local-server.mjs
```

然后访问 http://127.0.0.1:4174/dashboard.html 。默认仅监听 `127.0.0.1`，供本机使用。

## 功能与操作

| 模块 | 操作 |
| --- | --- |
| 实时地球 | 切换 2D / 3D；拖动和缩放；43°轨道卫星为蓝色，53°为紫色 |
| 卫星详情 | 点击卫星查看轨道、高度、速度、倾角；选择观测位置后还显示仰角、方位角和斜距 |
| 观测位置 | 输入经纬度并点击 Apply coordinates，或在地球上选择位置；再次点击 Observer 取消选择 |
| Sky view | 显示选定位置地平线上方的卫星，每秒更新；北在上、东在右，中心为天顶；星点可点击 |
| 空白天空图 | 初始未选择观测位置、清空坐标或取消 Observer 时，仅显示天空坐标网格 |
| Countries & spectrum | 搜索国家、运营商或频段，查看服务阶段、上下行频率、Band 和 PLMN |
| 全国 TAC | 选择国家后显示所有与该国边界相交的模型单元；再次点击已选国家取消选择并隐藏全部 TAC |
| TAC 查询 | 搜索如 `TAC 55647`，或点击模型单元查看编号及中心坐标 |
| Research | 按发表日期倒序查看精选研究资料，支持关键词搜索和原文跳转 |

取消 Observer 也会隐藏全部 TAC 网格。重新选择国家或手动开启 TAC 图层可恢复显示。国界线始终显示。

## 数据与更新机制

### 星历与位置

- 主要来源：[CelesTrak Starlink TLE](https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle)，依据目录中的 `[DTC]` 标记识别卫星。
- 备用来源：[公开每日 TLE 镜像](https://huggingface.co/datasets/juliensimon/starlink-tle-latest)。
- 服务端缓存约 **2 小时**。刷新页面或点击刷新按钮会请求接口，但不会绕过尚未过期的缓存；上游失败时使用已有数据。
- 页面保持打开时，每 2 小时请求一次星历；卫星位置通过 SGP4 按当前 UTC **每秒计算**。
- 本地服务器按请求触发更新；关闭服务后不会继续后台下载。缓存主要保存在进程内，不能视为持续写入磁盘的数据归档。
- `public/data/orbits.json` 是启动快照，不保证始终最新；查看页面中的轨道历元、元素年龄和数据来源。

### TAC 与国家频谱

TAC 图层是论文推导的 Fibonacci／球面 Voronoi 候选模型，包含 65,536 个编号位置，纬度范围约 ±69.99°。全国网格通过模型单元与 Natural Earth 国界相交预计算，边界单元保留完整形状；高纬和小岛显示受模型范围及国界比例尺限制。

**TAC 模型不是运营商确认的实时波束边界；卫星几何可见也不代表实际服务可用。**

合作频谱数据目前整理为 31 个国家／地区、34 条运营商记录，依据项目确认的表 3.5 静态维护。阶段标签为 Commercial、Testing、Emergency，并非自动查询的实时开通状态；频率、PLMN 和阶段应结合原始申报及运营商资料使用。

### 研究资料

`public/data/news.json` 和 `/api/news` 是沿用的内部名称，当前仅提供精选研究资料，**没有新闻／社区订阅，也不自动抓取新论文**。列表仍包含行业实测报告及部分通用 DTC 研究，尚未完成“仅收录 Starlink DTC 学术论文”的全面筛选。

日期按原始页面或出版元数据核实；仅确认到月份时保留 `YYYY-MM`。`publicationDateSource` 等字段保留日期依据，不以会议年份替代已知在线发表日期。

## 项目结构

```text
public/
  dashboard.html          页面入口
  styles.css              样式
  js/                     地球交互、天空图、TAC、坐标及频谱模块
  data/                   星历快照、国家频谱、研究资料、TAC 和国界数据
  vendor/                 已打包的 Cesium 和 satellite.js 浏览器依赖及许可证
server/
  live-data.mjs           星历获取、校验与缓存
  news.mjs                精选研究数据适配器（历史命名）
scripts/
  local-server.mjs         无第三方 Node 依赖的本地服务器
  test-*.mjs               数据与逻辑检查
AI_SETUP_PROMPTS.md        可复制给 AI 的下载与运行提示词
```

普通使用不需要重建 TAC 或下载论文全文。本仓库只包含独立本地运行所需的程序与公开数据；作者工作区的论文原稿、数据生成工具及 Sites 托管框架未包含在内。

## 验证与排错

服务运行后访问 http://127.0.0.1:4173/api/health ，应返回包含 `ok: true` 的 JSON。

以下检查可直接在根目录执行：

```text
node --check public/js/app.js
node scripts/test-coordinates.mjs
node scripts/test-news.mjs
```

| 问题 | 处理方式 |
| --- | --- |
| 找不到 `node` | 安装 Node.js LTS，重新打开终端 |
| `EADDRINUSE` | 使用其他端口；不要直接终止不明进程 |
| 本地 `/dashboard` 返回 404 | 使用 `/dashboard.html` 或 `/` |
| 双击 HTML 后无法加载 | 通过本地 HTTP 服务访问，不使用 `file://` |
| 地球空白或加载失败 | 检查 WebGL、硬件加速，以及 `public/vendor/cesium/` 是否完整 |
| 地图瓦片不显示 | 检查浏览器能否访问 OpenStreetMap；本项目没有离线底图 |
| 星历日期较旧 | 检查上游连接及缓存周期；下载失败时会保留快照，实时传播不会让旧星历变新 |
| 需要代理访问上游 | 在支持该选项的 Node 版本中使用 `node --use-env-proxy scripts/local-server.mjs`，并按自己的环境设置代理；不要提交代理凭据 |

浏览器地图请求与 Node 服务端星历请求使用各自的网络环境；一方可访问不代表另一方也可访问。默认在线地图不需要 Google API Key 或 Cesium ion Token。

## 开发说明

修改 `public/` 后刷新浏览器；修改 `server/` 或启动数据后重启服务。也可运行 `npm start`，效果等同于 `node scripts/local-server.mjs`，无需先安装依赖。

浏览器依赖版本：Cesium 1.123.1、satellite.js 6.0.1。已提交构建资源，升级时须保留许可证并验证 Workers 和资源路径。

可选执行 `node scripts/check-orbits.mjs --refresh` 下载并写入本地星历快照；该命令会更新 `public/data/orbits.json` 和 `dtc-registry.json`。使用普通启动命令不会自动改写这两个文件。

## 许可、署名与发布状态

- 地图：[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，使用时保留署名并遵守[瓦片使用政策](https://operations.osmfoundation.org/policies/tiles/)，不要批量抓取瓦片。
- 国界：Natural Earth 公共领域数据，来源记录见 `public/data/country-boundaries-source.json`。
- Cesium 与 satellite.js：保留 `public/vendor/` 中对应的许可证文件。
- 论文、报告及其他第三方数据的权利归各自权利人；提供链接不意味着授权重新分发全文。

项目自有代码的开源许可证尚待作者选择，当前未添加 LICENSE。公开代码仓库与授予开源使用许可是两件事，正式发布前应补充所选许可证。不要把 `.env`、凭据、论文私有原稿、`node_modules/`、构建缓存或 `outputs/` 整体上传。本仓库暂未授予项目自有代码的开源许可。
