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
