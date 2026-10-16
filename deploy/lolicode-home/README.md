# lolicode.com 根域软件官网

已于 2026-10-16 上线。页面唯一源码是 `lolicode/`；通过
`scripts/build-lolicode-home.mjs` 输出根域版本，不维护第二份页面。
社区入口为 `/all`，账户 API 与 Flarum 其它路由保持原配置。

服务器只新增精确 `/`、`/desktop-assets/` 和 `/downloads/` 路由。
图片与样式在 `/var/www/lolicode-site/releases/20261016-home-v3`。
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
