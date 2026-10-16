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

页面展示目前已经发布的 Agent、模型渠道、工具执行和静态预览能力；
UE 工具应用、酒馆应用、记忆和语音明确标注为规划。下载入口只从
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
