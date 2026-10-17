# LoliCode 下载与更新

本目录提供工具站的 LoliCode 下载页。应用检测地址固定为
`https://tools.treasuregrove.art/lolicode/updates/latest.json`。

发布文件来自 TAI-Switch 的签名发布工具。二进制放入
`releases/<version>/`，安装包由该版本清单中的 URL 指定；便携包名为
`LoliCode-Portable.zip`。版本目录发布后不可覆盖；文件校验并可公开下载后，
才原子替换 `updates/latest.json`，避免指向尚未上传的包。

动态发布文件不提交到工具站 Git。私钥始终留在发布机器的受限目录中；
服务器只托管签名、清单和公开安装包。

## 官网页面

页面展示 4.0.18 的 Agent、模型渠道、工具执行、静态预览、本机基础记忆、
带参数的工作流与 Windows 闲时任务。记忆默认写入前确认，可编辑、删除或关闭，
不宣称兼容 Hermes 记忆插件或无限记忆；八类 CLI 技能按需下载，
不等同于完整的 JavaScript / MCP 插件宿主。macOS / Linux 仍待发布验收。
WorkBuddy、DeepSeek Harness、ZCode 与 MiMo 可复用聚合模型配置；
用量按实际本机记录读取，缺字段不记作零费用，也不当作官方账单。
UE 工具应用、酒馆应用、高级记忆和语音明确标注为规划。下载入口只从
`updates/latest.json` 读取 Windows x64 安装包与可选便携包，不为未发布平台生成链接。
发布服务不可用时禁用下载入口并提供重试，不回退到猜测的包地址。

静态资源来源：

- `assets/maid.png` 沿用原文件名，但内容已替换为项目已确认的粉发犬娘 Q 版：
  `TAI-Switch/src/assets/atelier/companion.png`。
- `assets/workbench.jpg` 来自
  `TAI-Switch/design/qa/atelier/refinement/workbench-dark.jpg`；页面注明真实界面预览与示例数据。
- `assets/logo.svg` 为代码绘制的酒红绶带与青绿宝石标记，未引入第三方图标包或字体服务。

资源来源、角色设计生成记录与许可影响继续以 LoliCode 仓库中的素材记录为准。
静态发布白名单需要包含新增的 `assets/workbench.jpg`；本说明文件不上传到更新服务。

## 从同一份源码构建根域首页

工具站的 `lolicode/index.html` 继续保留原下载地址。根域首页不维护第二套副本，
从仓库根目录运行：

```powershell
node scripts/build-lolicode-home.mjs --out-dir tmp/lolicode-home --forum-path /all
node --test scripts/tests/lolicode-downloads.test.mjs scripts/tests/lolicode-home-build.test.mjs
```

`--forum-path` 是社区现有入口的域内绝对路径，默认 `/all`。工具站源页面也固定链接到
`https://lolicode.com/all`，根域改为产品首页后不会把社区入口导回首页。
构建会转换 canonical、Open Graph 地址、全部社区链接与工具箱返回入口，
并把图片、样式与脚本统一指向 `/desktop-assets/`。输出目录只能为空目录或
本构建器已经标记的目录；不会删除其它文件。

发布时只上传输出的 `index.html` 与 `desktop-assets/`，不要上传本地归属标记
`.lolicode-home-build.json`。服务器需要独立配置根首页与静态路径，保留社区路由；
构建脚本不修改服务器、不部署或提交 Git。

页面通过 `lolicode-download-profile` 元信息选择内置配置：

- `tools`（源页面与缺省配置）：`./updates/latest.json`。
- `home`（根域构建）：`/downloads/updates/latest.json`。

脚本不接受页面指定的任意 feed URL。两种配置都只允许以下完整来源和路径组合，
版本号必须匹配当前清单；查询参数、fragment、userinfo、未知域名均拒绝：

- `https://tools.treasuregrove.art/lolicode/releases/<version>/`。
- `https://lolicode.com/downloads/releases/<version>/`。
- `https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v<version>/`，
  只允许该仓库、匹配版本的固定标签和直属发布附件，不接受 latest、源码或其它仓库路径。

根域 `/downloads/updates/latest.json` 继续由固定上游网关读取公开清单，
将安装包与便携包 URL 转换为上面的 GitHub Releases 直链。大文件由浏览器直接从
GitHub 下载，根域不再反向代理安装器或 ZIP，避免消耗官网服务器流量。
发布时须先把同一批安装包与便携包上传至对应的 `lolicode-v<version>` Release，
核对附件文件名、大小、SHA256 与原始签名一致，再开放根域清单。
两种旧下载来源仍在前端白名单中用于兼容历史清单；不会据此猜测未发布的附件。
构建输出不包含或生成安装包，旧客户端仍可使用原工具站更新地址。

## 可选 GitHub 备用安装器

清单可附带 `downloads.windows-x86_64-installer-github`，包含完整的
`url`、`name`、正整数 `bytes` 和 64 位十六进制 `sha256`。`name` 固定为
`LoliCode-<version>-Windows-x64-Setup.exe`；URL 必须逐字匹配同版本的公开
`treasureGrove/LoliCode-Releases` 仓库 `lolicode-v<version>` 标签下该附件。
不允许任意仓库、latest 链接、查询参数或 fragment。

页面只在整个清单验证通过后显示「GitHub 备用下载」；没有此字段时隐藏，
字段存在但不完整或不合规则所有下载入口一起停用，避免只启用部分错误清单。
SHA256 和字节数在页面中用于检查清单格式；文件实际哈希及 Tauri 签名验证由
发布验收和桌面更新器执行，网页不会宣称已验证用户下载文件的内容。
此变更保留原渠道兼容，尚未加入任何新的对象存储来源。

## 可选腾讯下载线路

`downloads.windows-x86_64-installer-tencent` 与
`downloads.windows-x86_64-portable-tencent` 可分别提供完整的
`url`、`name`、`bytes`、`sha256`。页面只接受固定自有入口
`https://lolicode.com/downloads/tencent/<version>/<name>`，安装器文件名为
`LoliCode-<version>-Windows-x64-Setup.exe`，便携包名为 `LoliCode-Portable.zip`。
不接受任意 COS / CDN 域名、端口、查询参数或 fragment。

腾讯安装器须与已经严格校验的 GitHub 安装器记录具有相同的文件名、字节数及
SHA256；它作为同一主安装包的身份锚，不改动 Tauri 主源的 URL / signature 合同。
主下载 URL 的文件名也必须是同版本标准安装器；无腾讯字段的旧清单保留原兼容行为。
腾讯便携包须与原 `windows-x86_64-portable` 的完整记录一致。
字段缺失则隐藏对应按钮；缺少身份锚、字段格式错误或内容身份不一致时，整份清单
停用。有效按钮位于单独的次级区域，供用户手动选择，不替换自动下载或 GitHub 入口。

本地支持不代表腾讯线路已经可用。只有实际公开入口及附件经完整验证后，发布流程
才可加入这些字段；本次没有虚构公开对象地址，也没有改动生产 feed。
这些检查只是比较清单中的发布身份元数据，不代表浏览器已校验实际二进制内容；
实际镜像全量 SHA256 与安装包签名仍由发布验收和桌面更新器验证。

当前腾讯 COS 的三个附件已完成回读哈希核对，存储桶仍为私有，匿名请求被拒绝。
CDN 已开通，公开下载域名的 DNS / HTTPS 和固定腾讯入口仍待最终验收。
腾讯字段没有加入生产清单；经过 144 项测试的静态控件已部署，但因为字段缺失，
腾讯行与两个按钮保持隐藏且没有 href。已使用两站线上脚本和真实生产清单确认这一行为，
既有自动路由和 GitHub 下载保持原状。不得在公开入口验证前添加腾讯字段。
