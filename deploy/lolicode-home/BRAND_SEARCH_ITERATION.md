# LoliCode 官网搜索迭代

## 目标与当前基线

用户于 2026-10-27 授权持续改进官网的自然搜索曝光、官方品牌辨识与点击意愿。
优先品牌词：LoliCode、LoliCode 官网、LoliCode 下载、LoliCode AI 编程助手。
不要把同名 Gitee/SCUI、LOLCODE 或 OpenBullet 项目标成本站关联实体。

2026-10-27 已通过当前浏览器的现有登录状态访问 **Google Search Console**，
资源为 `https://lolicode.com/`。不需要索要用户密码，也没有导出会话或令牌。
效果页选择「28 天」「网页精确等于 https://lolicode.com/」「网络搜索」：
首页 3 次展示、0 次点击、CTR 0%、平均排名 3.3；图表实际数据日期为
2026-10-19 至 25，上次更新约 3.5 小时前。这是改动前报告，样本很小，不能推断改动效果。
查询表为空不等于没有展示；Google 可能不展示低量查询。
站点级未过滤报告为 4 次展示、0 次点击，不得与首页指标混用。

可从 `https://search.google.com/search-console` 选择该资源、效果、28 天，再按网页
筛选首页。后续运行若现有登录失效，应记录访问不可用，不复制认证材料或自动重建权限。
不要因未配置 API 就认定浏览器后台不可访问。基线截图和页面证据保存在
`tmp/lolicode-brand-search-20261027/gsc-homepage-before.{png,txt}`。

服务器日志另有聚合口径：2026-10-13 至 26，首页搜索来源 GET 200/304 请求 8 次
（Google 7、百度 1），过滤已知自动化 UA；不输出 IP、UA、完整 referrer 或搜索词。
这不是 Search Console 展示、CTR 或独立用户，不能与后台点击数对等。
10 月 16 日前根路径还是论坛，最早日志也从 13 日 00:03:54 才保留；比较应选可比窗口。

```powershell
python deploy/lolicode-home/measure-search-traffic.py --output tmp/search-traffic-YYYY-MM-DD.json
```

## 2026-10-27 已上线批次

批次 `20261027-brand-search-v1`。首屏 H1 加入 LoliCode，明确「官方网站」「AI 编程助手
与桌面 Agent」；统一 description 与 Open Graph 标题摘要，关联真实 Organization、
WebSite、WebPage、SoftwareApplication；补充无需 JS 的官方最新发布链接与页脚域名。
沿用原 title：`LoliCode 官网｜AI 编程助手与桌面 Agent · Windows 下载`。

产品 sitemap 的真实修改日期更新为 2026-10-27，robots 保留全部原规则并追加
`Sitemap: https://lolicode.com/sitemap-desktop.xml`。原社区 sitemap 仍保留。
Google Search Console 原有 desktop sitemap 已成功收录 1 个 URL，最近读取是 10 月 25 日；
本轮又于 10 月 27 日提交，界面确认「已成功提交站点地图」。提交不等于重新抓取已完成。
首页 URL 检查确认已收录、允许抓取/索引、Google 规范地址为本站根域；旧抓取时间为
2026-10-20 17:37:39（界面时间）。本轮点击请求编入索引后，Google 完成实际网址测试，
确认「已请求编入索引」「已将网址添加到优先抓取队列中」。没有重复提交。
回执截图为同证据目录 `gsc-sitemap-submitted.png` 与 `gsc-indexing-requested.png`。

只有 index.html、sitemap-desktop.xml、robots.txt 是新内容，25 份资源从当前线上逐字节
复制，避免发布工作区另有的下载脚本/动效改动。实际源码 `lolicode/index.html` 和
`lolicode/sitemap-desktop.xml` 定向同步了本轮修改，原有未提交工作保留，没有混合提交。
准备脚本 `prepare-brand-search.py` 从已捕获的线上 HTML 生成三文件 payload。

新站目录 `/var/www/lolicode-site/releases/20261027-brand-search-v1`。
私有恢复点 `/root/lolicode-20261027-brand-search-v1/`，含部署脚本、冻结清单及配置前后副本。
主 Nginx 配置 SHA256 仍为
`e401097065f05e3a4e9a6b180b33dec514966bd3526e5c68fa322c8fd27a5949`，
不要沿用旧文档中 relay/companion 加入前的主配置哈希。
当前首页 snippet SHA256：
`4a26ece2fa421f97f13f40da3e00973ab9510f2df89bad42c5f0e063613d71e7`。
manifest SHA256：`3b3ce89292c3014c2f82bd0c7300ae30a0c269c9e5d556a2007642a642337688`。

本轮使用静态首页专用部署流程的维护锁、私有配置备份、不可变目录与条件回退；
没有运行旧全站备份脚本或切换论坛维护开关。Nginx 检查后 reload；测试站先预览、
确认 noindex，再恢复原测试配置 SHA256
`23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485`。
生产的下载路由/清单/签名、favicon、CSP、论坛、API、relay/companion 及其他服务保留。

验证：现有 Node 网站测试 164/164 通过；部署回退/冲突离线检查 10 项通过；
预览与生产 25 份资源均通过真实 HTTP SHA256 校验；首页 HTML、结构化数据关联、
canonical、sitemap、robots、社区、API、Atom 与更新清单通过。桌面浏览器首屏与下载
版本加载正常，截图为 `tmp/lolicode-brand-search-20261027/production.png`。
本轮未声明手机浏览器实测。详细 JSON 为同目录 preview-proof/production-proof。

回退仅在本批次仍是当前配置、且没有后续并发更改时执行：

```sh
python3 /root/lolicode-20261027-brand-search-v1/deploy.py restore-production
```

新迭代必须重新采集当前基线和新批次，不可盲目重跑冻结脚本。

## 持续执行与下一轮

当前聊天定期跟进已启用，名称「迭代 LoliCode 官网搜索表现」，每周二、五 10:00，
Asia/Singapore。依赖本机文件和 SSH，电脑与桌面应用需保持运行。
只在有意义的改动、可靠指标变化、故障或必要用户操作时通知。
现有服务器每日 08:45 的 SEO 检查/变更提交继续运行，不另装重复任务。

新首页通过现有 CLI dry-run，但 10 月 27 日提交额度已经由早晨任务使用，
本轮不绕过限额；10 月 28 日 08:45 的既有任务可提交新 digest 到 IndexNow。
Google 通过本轮 Search Console sitemap/URL 检查流程处理，不使用不适用于普通页面的 Indexing API。
百度 API HTTPS 仍因主机名证书校验失败，保留严格 TLS，不能改 HTTP 或忽略校验。
相关故障不表示 IndexNow/Google sitemap 同时失败。

标题/摘要至少观察至 2026-11-10 后再评估效果；检查可以更频繁，避免无数据时反复改标题。
下一轮先检查 Google 重新抓取时间、展示词与首页 CTR；样本不足时继续收集。
工具站重复页 canonical 已在下面的第二轮统一；后续维护不能恢复为工具站自身地址。
有实证支持时完善上手说明或真实功能内容，不添加虚构评分、认证、用户数或不相关热词。

官方规则参考：
[Google 标题链接](https://developers.google.com/search/docs/appearance/title-link)、
[站点名称](https://developers.google.com/search/docs/appearance/site-names)、
[Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)。

## 2026-10-27 第二轮：分开官网、社区与镜像

用户再次要求持续迭代。没有重改标题/摘要，也没有重复请求 Google 索引或安装重复定时任务。
Google 最近抓取时间仍显示 10 月 20 日 17:37:39，公开搜索结果仍有旧社区缓存；
本轮完成的是确定的技术问题修复，不能据此声称曝光、点击已经上涨。

### 工具站产品副本

工具站可用现有公钥别名 `ssh tools`；站目录为 `/www/wwwroot/tools.treasuregrove.art/lolicode`。
批次 `20261027-canonical-tools-v1` 只替换 live HTML 中 canonical 与 og:url 两个地址，
都指向 `https://lolicode.com/`，其他 HTML 字节不变；下载脚本、CSS、动效、版本清单及 sitemap
五项原字节已通过公网 SHA256 验证。当前 HTML SHA256：
`4ab1c229ab586ad09a1987aeb88c622db56977f14b89300c680b6fe19edea361`。
私有备份 `/root/lolicode-20261027-canonical-tools-v1/`；部署脚本
`deploy-canonical-tools.py` 支持 check/apply/restore，使用既有 `.publish-lock`，不重启服务。
10 项离线回退/并发行为检查通过，公网回执 `canonical-tools-20261027-proof.json`。

本地源页也已统一 canonical/og:url，构建器严格检查唯一正确地址，拒绝旧工具站/外域/重复标记。
修改涉及 `lolicode/index.html`、`scripts/build-lolicode-home.mjs` 与既有构建测试，
164 项网站测试通过。改前副本在 `tmp/lolicode-canonical-20261027/before-source/`。
工具站这批只部署两个 head 字段，未整页部署本地其他改动。

### 社区 /all

原 Flarum core 默认 `/all` 是站点首页，导致 `/all` 的 canonical 被写成根域软件官网。
通过现有 ResourceHub 的 `DiscussionSearchMeta` 回调，仅对路由名 index、路径严格 `/all`
设置独立 URL；分页由框架继续生成 `/all?page=2` 和 prev/next，其他路由保留。
当前共享 PHP SHA256：`45762654a68960e6a8d0849606d3d5410558844ba9d738433a666579b0c77057`。
源码及部署工具在另一个工作目录：
`D:/projectGithub/lolicode.com/resource-hub/src/Search/DiscussionSearchMeta.php` 与
`D:/projectGithub/lolicode.com/deploy/forum-canonical-20261027/`。

先通过现有 `lolicode-forum-backup.service` 完成备份，Result=success、ExecMainStatus=0；
新恢复点 `/var/backups/lolicode-forum/backup-20261027T125909Z-98984b75`，含代码归档、数据库
归档与 complete.json。没有用旧库覆盖线上新数据。
共享扩展有 81 个冻结文件；测试站先切到隔离副本验证，再恢复原 vendor 软链，
等 FPM realpath 缓存更新后才生产。生产持既有维护锁，只撤销自己创建且 token/inode/时间
均匹配的短时维护 flag；原公告、state/config 不变。只原子替换一个 PHP 文件，等待
OPcache 自动重验，不清整站缓存、不重启 FPM、不以 root 跑 Flarum CLI。
8 例真实 Flarum/PSR 类型回归、维护 flag 所有权检查以及实际 /all/分页/API/Atom/sitemap
验证通过；软件首页 SHA256 仍为 `5a371960...328d95`。私有配置/原代码恢复点为
`/root/lolicode-forum-canonical-20261027/`，有 production-proof.json 与条件回退脚本。
恢复守卫另已通过5项/81文件的并发行为验证：正常恢复及异常回退都在维护前、维护内核对完整
库存，后续其他扩展文件有变化时保留现场。私有 `deploy.executed.py` 保存实际执行版；
当前加固版 `deploy.py` SHA 为 `50cb9e710ffeb198bc7857e91dbaaf97e05b4d90265236acb6ab14fd771e6586`，
上传后已只读确认线上81文件库存一致、维护关闭。恢复时用加固版，不用已执行归档版。

### direct 性能镜像

镜像原是旧论坛列表，仍声明根域软件官网 canonical，而且允许搜索收录。
已部署 `20261027-mirror-noindex-v1`，direct HTTPS 响应添加
`X-Robots-Tag: noindex, nofollow`。为覆盖 Nginx 子 location 的 add_header 继承行为，
direct 使用独立的 `/etc/nginx/snippets/direct-noindex-flarum-20261027.conf`；
它完整保留原共享规则，仅给五类静态 location 额外补同一 noindex 头。
原共享 `/var/www/forum/.nginx.conf`、主域、维护规则、PHP/数据库均未修改。
direct.conf 当前 SHA256 `26689dd05e9eddc5519b72c4e70c5b34cde016bca52af91458e7b854830b8c17`，
专属 include SHA256 `fc2ec28b6657823843bc8264b109a4439fda7de755cd2e2be8967059beaba2fd`。

**后续共享 .nginx.conf 更新时必须同步重建镜像专属 include**，不能遗漏新的安全规则。
当前原共享 SHA 为 `2cccc136040476deed8aa9d00e26ccca4a3a02ab95e68943fb763d820a54187a`；
部署脚本每次 check/preview/apply/restore 都检查共享文件漂移，发现不一致就拒绝继续。
新批次要重新冻结当时配置，不能盲目重跑旧批次。

私有恢复点 `/root/lolicode-20261027-mirror-noindex-v1/`。预览使用私有完整 Nginx 配置
执行 `nginx -t`，不替换正式配置；初次发现 fastcgi_params 相对路径在私有目录解析，
已补上同字节冻结依赖并通过预检，再在 `nginx -t` 通过后 reload。10 项离线行为检查通过。
公网镜像首页、/all、API、sitemap、robots 和实际静态文件均有 noindex，主域正常可收录。
总回执为 `search-entries-20261027-proof.json`，18 项真实公网检查全部通过。

### 搜索后台与后续观察

现有浏览器同样可访问 Bing Webmaster Tools，无需新建授权。30 天站点级报告
（9 月 27 日至 10 月 26 日、All）为 31 次展示/3 次点击/9.68% CTR；另在3个月关键词报告
中，lolicode 为 8 展示/3 点击/37.50% CTR/均排2.87。这些是本轮之前的数据，不是首页增长。
页面明细没有首页；URL Inspection 却明确确认首页已收录、抓取/索引允许、上次抓取
Today at 16:37。20:54 的 Live URL 测试也确认可被索引；结构化数据 insights 加载失败，
不代表页面结构化数据已被 Bing 判无效。产品 sitemap 已存在、成功、发现1网址，最近抓取
10 月 24 日；没有重复提交。证据在 `tmp/lolicode-canonical-20261027/bing-*`。

百度后台没有现有登录会话，保持原 API TLS 故障记录，不索要/复制用户密码。
下一轮先核对 Google/Bing 新抓取、首页实际展现与品牌词落地页；保留至少14天标题观察期。
另可评估 Bing 仍有 /api 历史搜索记录的索引策略，先核实再改，不能把 robots 禁爬误当去索引。

## 2026-10-27 第三轮：图标与首页图片搜索

用户明确要求图标和首页图片也能被搜索发现。已部署静态批次
`20261027-image-search-v1`，目录 `/var/www/lolicode-site/releases/20261027-image-search-v1`。
只改首页 HTML 与产品 sitemap 两份文本，原28文件中的其余26份（含25份assets和robots）
保持字节一致，没有改图、换图标URL、发布新安装包或修改下载校验脚本。

现有48/192/512方形图标与/favicon.ico原已可公开抓取；192px首页rel=icon保持稳定。
Organization.logo通过`#app-icon`引用512px ImageObject，保持其作为品牌图标的身份；
新`#hero-image` ImageObject为实际720×768主图，WebPage.primaryImageOfPage和og:image
均指向该主图，带真实品牌描述和尺寸。SoftwareApplication新增三张真实界面截图URL。
主图img src仅去除旧查询参数，与元信息和sitemap使用同一稳定URL；原alt已含LoliCode，保留。
不对装饰图片硬塞关键词，不编造版权/许可、评分或价格。

新增`robots: index, follow, max-image-preview:large`；测试站与预览资源的HTTP noindex
仍具更严格效力。测试站robots正文保留原规则，并非必须Disallow全站；保护依靠既有noindex头。
图片sitemap在原主页url下增加6个image:image/image:loc，包含图标、主图、三张界面图和
演示封面；不使用已弃用image:title/caption/license。lastmod仍为实际日期2026-10-27。

当前首页SHA256 `09bc41b4cd2dab702a5b409296d972fe27b725856f999c9e71a10e6d087c872a`，
产品sitemap SHA256 `51c9a257e837da10628de4a7919c7c4d9b02a3f8cf3c09499eba00773b7a2e02`。
manifest SHA256 `a2ace7b2de4ddb48a7c48f9de0ab4463ab9fad50ae3ec87abdc85da9e87032ab`。
首页snippet仅切换4处静态目录，当前SHA256
`721a1db8dbc5be4d539ce237a23a8181981b0fcb2bf4032e3b04d1a63a952725`。
favicon固定alias、CSP、下载段、社区/镜像与维护规则字节保留，主配置SHA不变。

私有恢复点 `/root/lolicode-20261027-image-search-v1/`；回退前核对当前配置，再执行
`python3 /root/lolicode-20261027-image-search-v1/deploy.py restore-production`。
工具为prepare-image-search.py、deploy-image-search.py、verify-image-search.py。
新批次必须用当时基线；**旧brand-search/search-entries冻结验证器不是当前批次的健康检查**，
它们仍保留历史SHA。当前批次的验证命令为：

```powershell
python deploy/lolicode-home/verify-image-search.py lolicode.com
```

164项既有网站测试、构建、12项部署离线行为检查通过。预览及生产实际以Googlebot/
Googlebot-Image User-Agent取回HTML、6张图片、4个favicon链接（生产另含favicon.ico），
验证HTTP200、MIME、尺寸、SHA、robots允许、无noindex；预览反向验证noindex保护。
同时检查canonical、两份ImageObject关联、OG尺寸、图片sitemap命名空间及社区/API/feed/
原sitemap/更新清单。真实浏览器确认主图/图标和下载版本仍正常。测试站已恢复原配置。
现有每日SEO CLI dry-run通过（新digest127cce03...a6ac02），未绕过当天提交限额。

本轮因新增六张图片条目，已刷新现有同一个产品sitemap：Google界面确认已成功提交；
Bing通过既有条目的Re-submit后显示2026-10-27 Submitted/Processing。没有新建重复sitemap
或重复请求首页URL索引。接收/Processing不是图片已收录或搜索结果已展示。
回执、预览/生产HTTP证明与截图在 `tmp/lolicode-image-search-20261027/`，汇总回执
`image-search-20261027-proof.json`。

已保存Google Search Console「图片」「主页精确URL」「28天」独立基线：0展示、0点击；
图表实际数据仍为10月19至25。它不能与网络搜索3次展示混算，也不能据0展示推断未收录。
现有同一聊天自动化已补充图片与favicon的持续检查、图片报告与实际展示证据要求，
原周二/周五10:00、静默无变化策略不变。后续只有实际搜索展示证据才报告图片可见。

规则依据：[Google favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)、
[图片发现与代表图](https://developers.google.com/search/docs/appearance/google-images)、
[图片sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)。
Google明确说明符合favicon条件也不能保证展示；搜索系统处理需要时间，不能承诺即时收录。

## 2026-10-28：扩展搜索平台覆盖

用户要求尽量覆盖百度、Google、360、2345、搜狗等。公开 robots.txt 已列出
`https://lolicode.com/sitemap-desktop.xml` 和论坛索引 `https://lolicode.com/sitemap.xml`，
两者实测 HTTP 200、XML 可解析；后者指向 `/sitemap-0.xml`。
Google Search Console 的产品地图显示成功（上次读取 10 月 27 日，发现 1 个网页）；
本轮补交论坛索引，确认“已成功处理站点地图索引”，该时点详情发现网页数为 0，
后续应检查子地图和实际索引，不将处理成功等同网页收录。
Bing 既有产品地图显示 Success，本轮论坛索引提交成功并显示 Processing。
回执截图在 `tmp/lolicode-image-search-20261027/`，文件名含 `forum-sitemap`。

百度、360、搜狗和额外检查的神马站长平台当前浏览器均未登录，不能声称已提交。
搜狗官方说明 sitemap 权限采用邀请制，登录和站点验证之后还需检查实际权限。
2345 旧官方帮助页描述网址导航申请，未找到可验证的独立 sitemap 提交入口，
不能将网址导航申请冒充 sitemap 推送；其浏览器可使用不同搜索引擎。
10 月 28 日 08:45 既有自动任务的公开状态：IndexNow received、百度 failed、
Google sitemap_available_no_api；任务退出码 3。百度此前有 HTTPS 证书主机名不匹配
的记录，本轮未确认新根因，不绕过 TLS，不重复消耗当天配额。
已更新现有聊天自动化以跟踪这些平台的处理结果与权限缺口，不新建定时任务。

IndexNow 官方 FAQ 说明提交至一个参与端点后会共享给支持 IndexNow 的搜索引擎，
包括 Bing、Naver、Yandex 等；10 月 28 日已有首页 received 记录。
此处是首页 URL 更新通知，不是对各平台单独提交 sitemap 的证明，也不证明收录。
来源：https://www.indexnow.org/faq 。

用户于 10 月 28 日登录百度搜索资源平台；当前账号已有 `https://lolicode.com/` 站点。
普通收录的 sitemap 面板显示每日提交上限 0、余额 0、存量文件上限 0，输入和提交按钮
均被禁用，列表为空；快速抓取面板显示当前站点暂无权限。百度明确提示不要提交
索引型 sitemap，因此如将来开放权限，应提交产品地图与论坛子地图 `/sitemap-0.xml`，
而不是索引 `/sitemap.xml`，并先核实当时的平台规则和站点内容。尚未向百度提交 sitemap。

用户登录 360 站长平台并完成添加网站步骤；站点管理显示 `lolicode.com`，
但备案状态为“未检测到备案”，验证按钮禁用并提示“未检测到备案信息，无法验证”。
Sitemap 页仅提示添加网站，没有可提交的已验证站点。没有提交 360 地图；
备案状态必须由平台及用户的实际资质决定，不推测、不编造备案号。

搜狗：用户登录后新增 `https://lolicode.com`，先使用论坛备份服务成功备份，
将平台实际下载的验证文件放入测试站并检查返回字节一致，再使用论坛维护锁与
短时自有维护标志，以独占创建方式放入 `/var/www/forum/public/sogousiteverification.txt`。
首页、论坛、测试验证文件访问正常；平台已确认“已验证根目录 / 高级管理员”。
此文件应保留以维持验证，不能在部署或清理时删除。拥有者资质页要求 ICP 备案号、
备案截图、主办方等真实材料，本轮未提交。资源收录页面支持提交具体 URL，明确不接受
sitemap 文件，是否成功以平台回执为准；独立 sitemap 功能仍须核实实际权限。
用户完成验证码并提交首页与社区 `/all`，搜狗资源收录界面显示“成功提交”。
这是 URL 提交回执，不是 sitemap 提交或已收录的证明，勿重复提交相同链接。

神马：用户登录后添加了正确的 `lolicode.com`（软件类），下载官方验证文件；
论坛备份服务成功，测试站确认文件可访问且字节一致，持论坛维护锁短暂维护后
独占创建 `/var/www/forum/public/shenma-site-verification.txt`，公网 HTTPS 返回 200
且内容一致。神马验证仍提示失败；Nginx 日志显示其发起 HTTP 请求得到 301，
没有看到它继续请求 HTTPS，是可能原因，不能断言平台内部原因。暂未修改 HTTP
强制跳转策略，也未提交神马 sitemap。文件保留供后续验证。初次添加时平台输入框
把示例文字当作实际值，产生一条带示例文字的无权限错误站点记录；随后已正确添加，
错误记录未删除。不要当作真实站点或提交对象。

Yandex：用户登录并自行确认平台协议及验证；先用论坛备份服务完成备份，
测试站验证通过后，在论坛维护锁内短时维护并独占创建官方文件
`/var/www/forum/public/yandex_647ad0707426ff84.html`。正式 HTTPS 响应与下载文件一致，
平台账号显示 Owner，验证成功。站点地图工具当时显示 read-only，明确无法添加或
重新抓取文件；未向 Yandex 单独提交 sitemap。robots 已公开地图，现有 IndexNow
通知不等于 sitemap 提交或收录，后续平台恢复后核实并提交。截图为
`tmp/lolicode-image-search-20261027/yandex-sitemap-readonly-20261028.png`。
Naver 首页可打开，但本轮站长工具登录跳转在内置浏览器超时，尚未登录或提交地图。

用户随后要求每天自动处理提交和配额。已将本聊天现有 `lolicode` 自动化改为每天
10:00（Asia/Singapore），检查各平台权限、配额、地图处理状态和新内容；有可用权限时
按官方规则提交新增或实质更新内容，避免重复提交及绕过验证码、限额或 TLS 校验。
保留服务器原有每天 08:45 的检查与符合条件的首页推送，无新增重复服务器任务。
10 月 28 日该任务 IndexNow 为 received、百度 failed；百度当日 sitemap 配额为 0。
聊天自动化仍需本机及应用运行，不能将它误称为服务器常驻任务。

## 2026-10-28：AI 搜索发现基线

用户希望在按实际需求提问时，AI 搜索能够发现并引用官网。robots 通配规则允许公开首页；
用 OAI-SearchBot、ChatGPT-User、GPTBot、Googlebot、bingbot、PerplexityBot 的 UA
模拟请求首页均 HTTP 200、无 X-Robots-Tag noindex。仅证明当前请求和规则可访问，
不证明真实爬虫已经访问或 AI 已推荐。未改 GPTBot 的训练抓取政策。
首页已有可见文字说明 Windows 安装与便携版、模型渠道、项目读写与工具执行、预览、
本地记忆及规划中的功能，部分功能标题偏品牌表达。后续优先依据真实产品材料补充
针对用户需求的原创使用说明和限制，不虚构支持平台、费用、功能或第三方评价，
不为 AI 生成大量同质页面；保留现有标题/摘要观察窗口。

对 10 月 15–28 日现有 nginx 分站日志做不输出 IP、关键词或个人数据的聚合，仅统计首页
非机器人 GET 请求：能直接识别的 ChatGPT、Perplexity、Copilot 来源均为 0。日志覆盖
14 个日期、10 月 28 日为未结束的当日；来源可能因隐私、跳转或缺失 referrer 而漏计，
请求数不是唯一访客数，也不能由零推断无人通过 AI 查找或推荐。可用时在后台查看
Google 生成式 AI 效果与 Bing AI Performance；现有每天聊天自动化已纳入 AI 搜索核查。
依据 https://help.openai.com/en/articles/12627856 与
https://developers.google.com/search/docs/appearance/ai-features ，以及
https://developers.google.com/search/docs/fundamentals/ai-optimization-guide 。

用户进一步要求允许 DeepSeek、ZCode 等 AI/Agent 抓取。2026-10-28 复查 robots.txt
通配规则允许首页，仍限制管理、账号等路径；分别以 ClaudeBot、Claude-SearchBot、
Claude-User、OAI-SearchBot、ChatGPT-User、PerplexityBot、Googlebot、bingbot 以及仅作
测试字符串的 DeepSeekBot、ZCode 模拟访问首页均返回 200、无 X-Robots-Tag noindex。
模拟字符串不证明 DeepSeek 或 ZCode 官方采用该名称，也不证明真实服务访问或收录。
未找到可核实的 DeepSeek/ZCode 专用爬虫规则，通配规则已经覆盖其他用户代理，因此
不新增可能覆盖原禁止路径的独立组、不改生产配置或关闭安全防护。每日自动化已加入
AI/Agent 可访问性及官方标识核查。

## 2026-10-28：AI 编程需求首页内容

用户要求持续优化 AI 搜索相关需求。静态批次 `20261028-ai-discovery-v1` 仅改
首页功能区两处可见文字：明确打开已有项目、阅读代码、解释结构、定位问题、实现页面，
以及修改后预览并检查结果；内容均基于已有产品功能。保留标题、摘要、图标、结构化数据、
下载及其他资源；产品 sitemap lastmod 按实际变更更新为 2026-10-28。
首页 SHA256 `ef1d215658c17503d2b924f0347ba8eee041d83f80ef0fb91b951f84d11f9701`，
sitemap SHA256 `579a412b453a63d6476b3120d013d7476acb35ae26f14c421e46efdbda36ba02`，
manifest SHA256 `b9de636a5a6e853c7046b82e51f52d2ef880ae1487cce8b45720168a450ad794`。

冻结当时真实线上基线后部署：先在 test 上验证 HTML/XML 字节、noindex、社区/API/sitemap
和浏览器功能区视觉，恢复预览配置，再通过已有锁切换正式静态目录。12 项部署离线检查、
9 项首页构建/产品边界测试通过；正式首页及 sitemap 字节、OAI-SearchBot 模拟访问、
robots、社区、feed、资源、两个站长验证文件、1.0.3 下载跳转和手机入口通过。
预览配置已恢复，nginx/PHP-FPM active，维护关闭。新配置 snippet SHA256
`ea151531772e5472a826c7459056b2d54f21ee85c6fc4fa2e6249866f67e66ff`；保留后续新增的
1.0.3 下载路由与 companion 手机端配置。私有恢复点 `/root/lolicode-20261028-ai-discovery-v1/`，
按现有条件校验后用该目录 `deploy.py restore-production` 回退；冻结脚本在
`deploy/lolicode-home/deploy-ai-discovery.py`，旧批次校验器不能验证新首页哈希。
每日 SEO dry-run 检测到新 digest，今日额度已使用，交由下一次合规运行处理。
既有每日聊天自动化继续跟踪 AI 搜索和真实引流；新内容尚无可归因的效果数据，
不声称已经增加推荐、展示或点击。

### 同日 Google 品牌词核查

用户报告在 Google 搜索 `lolicode` 找不到官网；实看其当前第一屏结果，首页没有
`lolicode.com`，有 Gitee、GitHub 与其他同名项目。该观察仅适用于当时搜索环境，
不推断所有地点、设备或更后页的排名。Google Search Console 检查首页显示已编入索引，
规范网址为 `https://lolicode.com/`，2026-10-27 20:46:29 Googlebot 智能手机抓取成功，
已抓取 HTML 确有软件官网 title/description（并非能证明搜索结果已更新）。
10 月 28 日 13:50 实时测试显示可编入索引；由于当天 11:31 已上线首页新文字，
通过 Search Console 对该实质变更提交一次重新索引请求，界面确认加入优先抓取队列，
截图 `tmp/lolicode-ai-discovery-20261028/google-reindex-request.png`。不得重复请求，
等待重新抓取并核对品牌词表现；收录、抓取成功及排队均不保证搜索排名或结果显示。

### 2026-10-29 例行跟踪

Google Search Console 显示官网首页已索引，最近抓取为 10 月 28 日 13:53:15，
晚于当日 11:31 的文案更新；抓取成功、规范网址为官网。10 月 29 日在本次浏览器环境
搜索 `lolicode`，首页结果仍未看到官网，不能外推其他地区或后续页。没有再次请求索引。
Bing 显示 10 月 28 日提交的论坛 sitemap 索引现为 Success（原为 Processing）；
产品 sitemap 也显示 Success。Bing AI Performance 的三个月站点级图表显示 10 月 26 日
2 次 citations，但页面和查询明细均无数据、图表汇总的 Cited Pages 显示 0；因此只能
记录该平台报告的站点级指标，不可断言引用了首页或归因于 10 月 28 日的修改。
10 月 29 日 08:45 服务器任务 IndexNow 为 received，百度仍 failed，状态没有修复；
Yandex 地图工具仍为只读。官网、机器人规则、两份地图、图标、主图及站长验证文件
公网可访问，产品 sitemap 仍含 6 张图。首页、地图与上轮哈希一致；未修改站点内容或配置。
