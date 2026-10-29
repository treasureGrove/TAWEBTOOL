# lolicode.com 根域软件官网

## 2026-10-20 樱桃工坊视觉更新（已上线）

官网与工具站已同步 `20261020-cherry-studio-v1`。首屏使用项目原有的粉发折耳
Q 版看板娘与樱桃书房素材，配合奶油色气泡、缎带胸针、圆角导航和轻柔鼠标视差。
新增夜色／奶油／渠道三种界面预览，支持图片淡入切换、方向键选择、弹窗放大、
Esc 关闭与焦点返回。滚动入场只播放一次；触屏不启用视差，系统减少动态效果时
停止入场、视差与切换动画。图片原稿保留，网页使用压缩后的 WebP 副本。

页面源码仍是 `lolicode/`，根域通过同一个构建器生成。素材来源：

- `companion.webp`：原 `lolicode/assets/maid.png`，720 × 768、142,730 bytes。
- `atelier-room.webp`：`TAI-Switch/src/assets/atelier/ribbon-atelier.png`，1100 × 619、93,506 bytes。
- `brooch.webp`：`TAI-Switch/src/assets/atelier/brooch-accent.png`，225 × 150、10,234 bytes。
- 两张新增界面图来自 `TAI-Switch/design/qa/atelier/refinement/`，标注为示例数据。

先完成本地预览，再在 `test.lolicode.com` 验证相同 payload。上线前已恢复测试站原配置，
SHA256 仍为 `23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485`。
本地、测试站、正式官网和工具站均通过 320／390／600／768／850／1024／1440px
真实浏览器检查，验证预览切换、键盘、弹窗、无 JS 阅读和减少动态效果，控制台无错误。
既有网站测试 146/146 通过，24 个线上静态文件的 SHA256 与准备产物逐一一致。

部署脚本为 `deploy-cherry-studio.py`，固定批次与基线，不可直接重跑覆盖后续更改。
根域目录为 `/var/www/lolicode-site/releases/20261020-cherry-studio-v1`；
首页 snippet 仅替换两处静态目录，SHA256 为
`6131b2aa90dd66e2184efa52a2387ee39c754b0aad624024c47246231f76ca93`。
主配置 SHA256 保持 `819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`。
当前下载脚本按线上原字节保留；两端正式清单 SHA256 仍为
`e04e3a488bc0c91632b35302f26ae33693163b7e9512131a7a4568b1b7113059`。
社区 `/all`、账户 API `/api`、`/sitemap.xml` 均返回 200，安装器入口返回同版本 GitHub 跳转。

私有备份在两台服务器的 `/root/lolicode-20261020-cherry-studio-v1/`。
根域回退使用该目录的 `deploy.py restore-production`，先核对本批次的已安装 SHA256；
若配置已被后续更新，脚本会拒绝覆盖。工具站原 HTML、CSS、motion.js 位于其
`tools-before/`；恢复前同样需要核对当前文件与本批次 manifest，不恢复下载清单。
公开验收回执见 `cherry-studio-20261020-proof.json`。

已于 2026-10-16 上线。页面唯一源码是 `lolicode/`；通过
`scripts/build-lolicode-home.mjs` 输出根域版本，不维护第二份页面。
社区入口为 `/all`，账户 API 与 Flarum 其它路由保持原配置。

服务器只新增精确 `/`、`/desktop-assets/` 和 `/downloads/` 路由。
图片与样式现为 `/var/www/lolicode-site/releases/20261017-tencent-options-v1`。
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

## 腾讯可选控件静态批次（已发布，入口仍隐藏）

`deploy-tencent-options.py` 发布已提交 `1a842285d0243da54607175f912b22e9e45649d6`
的可选腾讯控件。本轮只写两站静态文件，没有修改任何 feed、Tencent 后端、论坛或 API。
写入前核对公开固定 `updates/4.0.20-router.json` 的 SHA256
`4691d49885f5a2d9ceaf2962d2a9fe78368cc56ada5942d5f674ee1280190936`、冻结源提交及标准主安装器路由。
新批次为 `20261017-tencent-options-v1`，私有归档 SHA256
`3b6f6672b361426c96cb39ed4651a09acc97c754a39e39df9b874815d50628d7`。

根域新静态目录 `/var/www/lolicode-site/releases/20261017-tencent-options-v1`；
snippet 只替换两处原静态目录，已有三个 R2 exact location 字节完全保留。
更新前 snippet SHA256 为 `4b8afdcf35a65f1a42393f865bbabf9dbe11d51046bc8305b3ccdd23d70b6c9c`，
更新后为 `bf6b52f52564cbaf6bd7463235081ff20af5fb8771fb199fed70171b4af971c0`，
已通知独立 Tencent 后端部署流程重新核对该基线。主 Nginx 配置未变，`nginx -t` / reload 通过。
工具站在既有发布锁内依次更换 CSS、JavaScript、HTML，保留原文件的私有备份和条件回退。

线上根域 HTML SHA256：`9e7668d899e67970b43e72813575dcf29e84d5b79f21f2d89e1369511124022f`；
工具站 HTML：`0a5ea250704e6cc9070e2e43653963094793162aa45b1ef04c2139040bfd11d2`；
两站下载脚本：`c172ebb9f5a84e47083d73e945e6817525505f63b9f49fb5114192af6ef86c24`；
两站 CSS：`38e5ddb5d2950dc34431bcb8df87e97a7c7081e443e7d6edf9151e1fe00b505d`。

既有 144 项网站验收通过；本批次 5 项离线门槛 / 三文件回退检查、根域构建通过。
随后从两站实际线上 HTML / JS / CSS 和真实 feed 执行检查：Tencent 行与按钮隐藏、
无 href，自动与 GitHub URL 未变。主页资源、社区 `/all`、API `/api` 均返回 200；
两端 latest 仍为 4.0.20 / `4691d498...0190936`，本批次前后未改。
原 snippet、工具站三个旧文件均留在各服务器私有
`/root/lolicode-20261017-tencent-options-v1/`。回退前必须核对最新 snippet，
不得覆盖随后单独添加的 Tencent 服务路由。

## 2026-10-18 更新说明展示（已发布）

`deploy-release-notes.py` 是独立静态批次 `20261018-release-notes-v1`，只更新两站自有首页与样式、下载展示脚本。版本摘要变为真实列表，长说明默认折叠，保留原生键盘展开控件。发布文字只通过 `textContent` 创建节点，不解析外部 HTML 或自动生成链接；下载验证及渠道选项逻辑保持原样。

本地网站回归 145/145 通过；实际浏览器验证本地与生产的默认折叠、展开内容和原稳定下载链接，桌面没有横向溢出。尝试的 390px 视口覆盖未实际生效（页面仍报告 1280px），因此不宣称本轮完成手机宽度实测。生产截图保存在桌面工程本地 `release/acceptance/website-release-notes-live.jpg`。

上线前核对两台服务器现有文件和 Nginx 基线，payload 归档 SHA256 为 `f83990bd5133609ae48571014b85924e4a366e41d324e3ee5139cdc8222078b9`。根域静态目录切到 `/var/www/lolicode-site/releases/20261018-release-notes-v1`；snippet 只替换两处静态目录，现有下载路由保留，当前 SHA256 为 `d19eb29f4cf38bd9c2ab95c1c7b147182e637f3140acea9a1ecd1bfc9a985a8b`。主 Nginx 配置 SHA256 仍为 `819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`，检查和 reload 通过。工具站三个小文件在既有发布锁内原子替换，旧文件与原 snippet 备份留在各服务器 `/root/lolicode-20261018-release-notes-v1/`。

线上 HTML、JavaScript、CSS 均完整下载核对字节哈希；首页、社区 `/all`、API `/api` 可访问。两个稳定更新清单仍是 4.0.20 / `4691d49885f5a2d9ceaf2962d2a9fe78368cc56ada5942d5f674ee1280190936`，本次不上传二进制、不调整腾讯服务、不发布候选版到稳定渠道。回退时先检查当前 snippet 和文件哈希，不能直接覆盖随后运维变更。

## 2026-10-20 Lovely Studio 与界面演示视频（已发布）

根据 Hermes 的大幅主视觉、字体比例与分区节奏重新设计官网，采用 LoliCode 自有角色、樱桃红与奶油白。首屏后加入界面操作视频；下方保留界面切换、功能说明、上手步骤和真实发布信息。视频必须手动播放，首播前不加载 MP4；保留原生控制、错误提示与直链，后台标签暂停播放。桌面角色视差、滚动进入与悬停过渡支持减少动效设置。

视频使用真实 React 组件的隔离示例数据，连续展示模型/思考档选择、文件预览、渠道模型选择和明暗/装饰切换。片内持续标明示例性质，没有声称实际调用模型或完成编码任务。成片 43.433 秒、1600×1000、60fps、H.264/yuv420p、2,579,249 字节，faststart。原始采集 57.30fps，未使用光流插帧。MP4 SHA256 为 `5de623d629e23c3ed502b9990875c81a4df340614acc47d412bb1b1a2763ceba`。脚本与源帧证据在 `tmp/lolicode-studio-v2/video/`，资产在 `lolicode/assets/`。

批次 `20261020-lovely-studio-v2` 由 `deploy-lovely-studio.py` 发布。根域输出 18 文件、工具站更新 5 文件。新增 MP4、WebP 封面及 `poster` 根域路径转换；CSP 仅增加 `media-src 'self'`。根域切到 `/var/www/lolicode-site/releases/20261020-lovely-studio-v2`，生产 snippet SHA256 为 `e66cd95c9591ce509dba748aaf0d66b3b62ca5106898a2b5b36f1f855de0ae67`。主配置保持不变；测试站验证完成后已恢复原始配置。

本地 146 项既有测试通过；本地、测试站、两个正式入口均验证 320–1440px 无横向溢出、图集键盘操作、对话框焦点恢复、减少动效、无 JS 阅读和视频首播/重播/失败兜底。公网 23 份资源核对 SHA256、两站 MP4 Range 206 与 MIME 正常；影片自然播放至 ended，下载、社区 `/all`、`/api` 与 sitemap 正常。下载脚本及两站更新清单保留上线前字节，未发布工作区另有的下载校验修改。

核验记录见 `lovely-studio-20261020-proof.json`。两台服务器的私有备份均在 `/root/lolicode-20261020-lovely-studio-v2/`；`restore-production`、`restore-tools` 只在当前字节匹配时回退本批入口，不覆盖并发变化。工具站回退保留新增视频资源；不要直接重跑旧批次覆盖后续改动。

## 2026-10-20 Editorial Motion 与宽屏循环修正（已发布）

当前静态批次为 `20261020-editorial-motion-v2`，在 v1 动效基础上只增加饰带组
`min-width:100vw` 和 `justify-content:space-around`，并更新两站 HTML 的 CSS 缓存键。
CSS 为 `a72350d4466ec249…`，motion 保持 `6e93ac782670e2d8…`。当前视频在可见时静音循环播放，
离屏暂停；动效开关可以暂停环境动画，视频仍由自身控制。旧批次的手动首播说明仅适用于当时版本。

`deploy-editorial-motion-v2.py` 保存实际部署脚本，`editorial-motion-v2-20261020-receipt.json`
保存精简收据。根域目录为 `/var/www/lolicode-site/releases/20261020-editorial-motion-v2`，
当前 snippet SHA256 为 `f95d55e57825241d2f0a5f1b7fa0f3445cb1eb3df3eeec7b213877d918b6043d`。
生产只切换首页 root 与静态 assets alias 两处路径，后续下载、SEO、论坛路由和 CSP 字节保持；
工具站只替换 CSS 与 HTML。两站 downloads.js 保持 `4466ca7770d15a3a…`，稳定 feed 保持
`1a57ce7c52d8185c…`（产品 1.0.1、原生 4.1.1）。

测试站 27 资源和正式两站 54 资源 SHA/MIME、6 条新旧下载路由、三家搜索验证 meta、
视频 Range 206、SEO 状态、论坛/API/sitemap/robots 检查通过。实际浏览器确认 1280/1920
宽屏饰带每组覆盖可见宽度、动画运行、无横向溢出；正式视频播放和控制台无错误。
完整证据在 `tmp/lolicode-editorial-motion-v2-20261020/`。

测试站已恢复原配置 `23781dc75433dbff…`。两台服务器的私有备份位于
`/root/lolicode-20261020-editorial-motion-v2/`；回退动作仍为 `restore-production`、
`restore-tools`，必须保留脚本的当前字节校验与并发冲突拒绝。后续变更使用新不可变批次，
不要重跑本批次覆盖新配置或改写已冻结归档。

## 2026-10-27 官网品牌搜索迭代（已上线）

当前首页批次为 `20261027-brand-search-v1`：首屏明确 LoliCode 官网与 AI 编程助手，
统一搜索/分享摘要，关联品牌与软件结构化数据，并补充静态官方下载链接。
robots 保留原规则并声明产品 sitemap，真实 lastmod 更新为本轮日期。
仅三份文本文件有新内容，其余 25 份资源从线上原样复制。

现有 164 项网站测试、10 项部署离线检查以及测试站/正式站 HTTP 字节验证通过；
论坛/API/订阅/下载清单正常。测试站已恢复。当前主配置含 relay/companion，
SHA256 已是 `e401097065f05e3a4e9a6b180b33dec514966bd3526e5c68fa322c8fd27a5949`，
不能沿用早期批次的主配置基线。

部署、恢复点、真实 Search Console 基线和持续迭代约定见
[BRAND_SEARCH_ITERATION.md](BRAND_SEARCH_ITERATION.md)。
后续使用新批次和当时基线，不能直接重跑 `deploy-brand-search.py`。

同日第二轮已统一工具站产品副本的 canonical/og:url，修复社区 `/all` 独立 canonical，
并让 direct 性能镜像返回 noindex。软件首页视觉与标题保持第一轮；全部18项公网检查通过。
新代码、备份/回退路径、Bing基线和镜像专属Nginx include的同步约束，均见上述迭代记录。

同日第三轮当前静态批次为 `20261027-image-search-v1`：保留图标URL/全部图片字节，
新增主图与图标ImageObject、代表图标记和6张图片sitemap。Google接受sitemap刷新，
Bing显示Processing；这是通知和抓取条件通过，不代表已在图片搜索展示。
当前批次验证使用 `verify-image-search.py`，历史冻结检查器仍保留各自旧SHA。
