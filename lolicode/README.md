# LoliCode 下载与更新

本目录提供工具站的 LoliCode 下载页。应用检测地址固定为
`https://tools.treasuregrove.art/lolicode/updates/latest.json`。

发布文件来自 TAI-Switch 的签名发布工具。二进制放入
`releases/<version>/`，安装包由该版本清单中的 URL 指定；便携包名为
`LoliCode-Portable.zip`。版本目录发布后不可覆盖；文件校验并可公开下载后，
才原子替换 `updates/latest.json`，避免指向尚未上传的包。

动态发布文件不提交到工具站 Git。私钥始终留在发布机器的受限目录中；
服务器只托管签名、清单和公开安装包。
