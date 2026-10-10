# 鹈鹕骑行 (A Pelican on a Bicycle)

一只鹈鹕骑着复古自行车，沿黄金时刻的海岸公路前行。全部几何、羽毛、海浪与云都是
代码即时生成的程序化 3D 场景，**零外部模型与贴图**，由 **Claude Sonnet 5.5** 制作。

网站入口：<https://tools.treasuregrove.art/tools_html/pelican.html>（也会在首页
「游戏」分类与左侧导航中出现；搜索 `鹈鹕` / `pelican` / `claude sonnet 5.5` 均可命中）。

## 目录结构

```text
games/pelican/
  index.html        游戏页面（含站点 SEO 元信息，直接部署即可访问）
  dist/pelican.js   esbuild 打包产物（three.js 已内联，经典 <script>，可 file:// 打开）
  src/              源码：场景、鹈鹕、自行车、地形、氛围、UI
  build.mjs         esbuild 构建脚本
  tools/shot.mjs    无头 Chrome 截图工具（需要 puppeteer-core）
```

## 进入方式

- 入口页 `/tools_html/pelican.html` 是站点标准工具页：左侧导航 + 顶部搜索保持可用，
  **游戏本体在 `#panel` 窗口里以内嵌 iframe 呈现**（`css/pelican.css` 负责让 panel 去内边距、
  iframe 铺满），因此不会离开工具箱的框架。设备不支持 WebGL 时，入口页会移除 iframe 并显示
  「暂不可用 + 返回工具箱」的兜底提示。
- 部署时需同时同步 `tools_html/pelican.html`、`css/pelican.css` 与整个 `games/pelican/`
  目录（含 `dist/pelican.js`），无需重启后端服务。
- 该游戏的登记信息在 `js/menu.js`（`MENU_DATA` 的「游戏」分类，决定侧边导航与全局搜索）与
  `js/index.js`（`TOOL_DESC`，决定首页卡片描述），静态兜底卡片在 `index.html`；
  搜索关键词中的「Claude Sonnet 5.5」写在 `js/menu.js`，改关键词时这几处要同步。
- 窄屏（≤980px）沿用站点既有布局：左侧仍保留 76px 导航栏，因此 panel 会比手机屏窄
  （iPhone 13 约 282px 宽），游戏本身可玩但视野偏窄；若日后合并工具目录/设备适配改版
  （移动端侧栏收纳为抽屉），panel 会自动变成整屏宽度。

## 本地重新构建

```bash
cd games/pelican
npm install
npm run build     # 重新生成 dist/pelican.js
npm run watch     # 开发时监听
```

源码的原始开发目录是 `D:\projectGithub\GithubTest\this\pelican`；此处保留一份完整
源码副本，便于在本站直接迭代。
