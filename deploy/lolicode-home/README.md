# lolicode.com 根域软件官网

已于 2026-10-16 上线。页面唯一源码是 `lolicode/`；通过
`scripts/build-lolicode-home.mjs` 输出根域版本，不维护第二份页面。
社区入口为 `/all`，账户 API 与 Flarum 其它路由保持原配置。

服务器只新增精确 `/`、`/desktop-assets/` 和 `/downloads/` 路由。
图片与样式现为 `/var/www/lolicode-site/releases/20261017-release20-v2`。
安装器/便携包直连公开的 `treasureGrove/LoliCode-Releases`；兼容下载路径返回
302，不代理大文件。只有不足 2KB 的公开版本清单经固定上游网关读取。
网关不转发 Cookie、Authorization 或请求体，且启用上游 TLS 证书校验。

## 本轮部署工具与回退

`deploy.py` 是本轮审阅过的固定批次工具，包含部署前 Nginx 配置 SHA256。
它校验完整 payload 清单，只写自有静态目录和新的 Nginx snippet；使用现有论坛
维护锁，保留小型私有配置备份，先 `nginx -t` 再 reload。失败或回退时核对配置
哈希，不覆盖并发运维改动。它不运行旧全站备份脚本、不触碰数据库、定时器或维护开关。
新部署应审阅并更新批次、基线与清单，不能盲目重跑旧批次。

测试站预览通过后已恢复原配置；生产首页仍运行。原预览配置 SHA256 为
`23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485`，恢复后相同。
生产配置当前 SHA256 为
`819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`。

本轮生产路由回退（需先检查当前状态；若后续配置被改过，工具会拒绝覆盖）：

```sh
python3 /root/lolicode-home-20261016-v3/deploy.py restore-production
```

`switch-tools.py` 只迁移原工具站的 HTML、兼容下载脚本和可变最新清单。
它先验证匿名 GitHub 附件元数据，再取得既有发布锁并检查基线；先更新兼容页面/脚本，
最后原子切换清单。旧签名、安装包、版本目录与其它工具站文件均不改。
原三个小文件的备份在工具服务器 root 私有
`/root/lolicode-site-backups/20261016-github-downloads/`。

后续发布必须先上传对应 GitHub Release 并验证匿名下载及 SHA256，再切最新清单。
Windows 签名仍由原 LoliCode 更新公钥验证；不要修改现有用户的更新源或覆盖版本附件。

## 2026-10-17 动效迭代

`deploy-motion.py` 是独立的静态资源批次，不修改更新清单、论坛、API 或数据库。
根域静态文件现为 `/var/www/lolicode-site/releases/20261017-motion-v1`；原 Nginx 主配置 SHA256 不变，
原有首页 snippet 中的两个静态目录切到此版本，snippet SHA256 为
`28c6fff3bed475ccd3f9ce016cdafd9634a6ca75aeeff1083e7f8829da43f95f`。
切换前通过 payload 哈希和配置基线校验，切换后 `nginx -t`、reload 通过；原 snippet 保存在
`/root/lolicode-20261017-motion-v1/production-snippet.before`。回退前必须核对当前 snippet 哈希，
只恢复此文件并检查、reload，不恢复整个旧站配置。

工具站同步了 HTML、样式和新增的 `motion.js`，原文件私有备份为同批次的 `tools-before/`。
入口、下载脚本和签名源保持兼容。线上首页、社区 `/all`、API `/api`、更新清单均返回 200。

动效使用渐进入场、轻量悬停与区段导航提示；没有循环背景动画或自动播放。
首屏始终直接显示，脚本/IntersectionObserver 不可用时内容保持可读，键盘焦点会立即显示目标，
开启系统减少动态效果后停止所有动画。浏览器实测桌面及 390px 宽无横向溢出、控制台无错误，
安装按钮仍直连已发布的 GitHub 附件。Node 验收 47/47 通过。

## 4.0.18 官网文案批次（已发布）

`deploy-release18.py` 是独立批次 `20261017-release18-v1`。它沿用上面的当前生产
主配置、首页 snippet 和工具站首页 SHA256 作为基线，只更新自有静态首页。
不会写入 `updates/latest.json`、二进制、论坛、API、数据库或定时任务。
运行前只读检查固定工具站 feed 已公开签名的 4.0.18 安装包；检查失败时不写入。
已在桌面端 4.0.18 正式发布及签名验证通过后执行本批次。

本轮文案区分已实现的本机基础记忆与规划中的高级记忆，说明带参数工作流、
执行历史、停止任务和 Windows 闲时执行，以及八类按需添加的 CLI 技能。
外部应用配置覆盖 WorkBuddy、DeepSeek Harness、ZCode 与 MiMo；用量来自已有记录，
不将缺失费用当作零，也不宣称完整官方账单或 Hermes 插件兼容。
保留原动效、模型选择、GitHub 直链下载和社区入口；macOS / Linux 仍标为准备中。

本地验收命令：

```powershell
node scripts/build-lolicode-home.mjs --out-dir tmp/lolicode-release18-v1/home --forum-path /all
node --test scripts/tests/lolicode-downloads.test.mjs scripts/tests/lolicode-home-build.test.mjs scripts/tests/lolicode-motion.test.mjs scripts/tests/lolicode-product-copy.test.mjs
```

Node 验收 50/50 通过，部署脚本 Python 语法检查通过。部署 payload 在
`tmp/lolicode-release18-v1/`，包含固定文件清单与 SHA256；不上传构建器的本地归属标记。
根域生产静态目录为 `/var/www/lolicode-site/releases/20261017-release18-v1`，
首页 SHA256 为 `04420f8a2fd630ac306493f2dbe47fbe71fa376f657a887f9bd2c65489429be8`。
主 Nginx 配置 SHA256 仍为 `819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`，
首页 snippet SHA256 更新为 `876705197648cf6fc56eac72af8590ff10b1979a2391bb9458f60bf5d048e876`；
`nginx -t` 与 reload 通过。原 snippet 私有备份为
`/root/lolicode-20261017-release18-v1/production-snippet.before`，其 SHA256 为上轮
`28c6fff3bed475ccd3f9ce016cdafd9634a6ca75aeeff1083e7f8829da43f95f`。
回退前核对当前主配置和 snippet 哈希，只恢复这份 snippet，再检查配置及 reload。

工具站只替换 `index.html`，SHA256 为
`6904047cd8e39c08f535c576802e3a4ba5079f88cb95458ff16af6c80c91ce96`，
原文件在工具服务器 `/root/lolicode-20261017-release18-v1/tools-index.before`。
根域首页、社区 `/all`、API `/api`、动效脚本及两个站点的更新清单均匿名返回 200；
更新清单依旧为 4.0.18，SHA256 `d5cbb1a497a9008bdb361458a53046d30840ba2d4a1373b6a7a6ecc243636ff7`，
本批次前后未变。首页线上字节与本地准备产物一致。
不能直接重跑本批次覆盖后续改动；下一次部署需新的批次与当前基线。

## 4.0.20 GitHub 备用入口批次（已发布）

`deploy-release20.py` 是独立静态批次 `20261017-release20-v2`，从上面的实际生产
目录与配置哈希建立基线。仅发布已经提交的 GitHub 备用入口、对应下载脚本与根域
静态构建，不添加尚未确认的 R2 / COS 来源，不写版本清单。

写入前只读检查已公开的不可变 `updates/4.0.20.json`，精确核对 SHA256
`7ec40f2b4553f8acd208a27464142a6cbe249769dfbb38fb5ce36531d226a23d`、
冻结源提交 `cbad951e112055ca13a9970353e664e8974f968f` 与签名字段。安装器 URL 必须为
`https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v4.0.20/LoliCode-4.0.20-Windows-x64-Setup.exe`。
包下载和签名验收由发布流程先完成，获确认后才运行本批次。
根域切换采用新不可变目录及 `nginx -t` / reload；工具站在现有发布锁内先更新
兼容旧 HTML 的下载脚本，再原子替换 HTML。失败时只在写入内容仍匹配本批次时回退，
不覆盖并发修改。原文件保存在各服务器 `/root/lolicode-20261017-release20-v2/`。

准备目录 `tmp/lolicode-release20-v2/` 包含 7 个根域静态文件、工具站 HTML 和
下载脚本，以及按文件 SHA256 的清单；打包排除构建器本地归属标记。
下载脚本相关 86 项既有验收已通过；本批次 Python 语法、根域构建和发布门槛 /
双文件成功替换 / 写入失败回退 / 基线冲突保留的 8 项离线检查通过，均在临时目录执行，
没有访问或写入生产。放行后再核对线上 HTML / JS、首页 / 社区 / API / feed。

在不可变 4.0.20 发布物验收后已完成两站静态部署。根域新首页 SHA256 为
`4e9c067b29da6713f5e5cbc2805a6a5f4c68b25906a9eeb4cf0d15f76bfd5010`；工具站 HTML 为
`513a5f958c2b2a46b2bd73d5f35bc99e6fd9cde63b1954e72ddba4ddec295368`，两站下载脚本均为
`77fd52fbe4fc016f55735424c4cd2693e1ef3007c23d200f4cf3bb93ad7456ae`。
静态切换后的 snippet SHA256 是 `d40f1245515531566354ba2c6dda0a5a9edfb073c8e3dbe48b6951fa74cbd4c4`。
此后独立下载路由批次追加三个 exact location，变为
`4b8afdcf35a65f1a42393f865bbabf9dbe11d51046bc8305b3ccdd23d70b6c9c`，见
`deploy/download-router/README.md`。主 Nginx 配置未变。
首页、下载脚本、社区、API 均匿名 200；本批次结束时两端 latest 仍为
4.0.16 / `13a7972b79ee0ea67deb582de2314602a472aa9b9a453c7a578b1ec8f07a59cc`，
由独立发布验收流程最后切换。不要直接恢复静态批次备份覆盖后加的下载路由。
