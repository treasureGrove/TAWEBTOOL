# LoliCode 官网产品首页

2026-11-20 发布。顶部横向导航，首屏提供 Windows 下载、Windows 与 Linux 的 CLI 安装命令，并展示小笨狗和可暂停的星轨动效。工作台演示接在首屏下方，近期话题位于指南之后。首屏的内容顺序参考了 Hermes Agent，配色取自 LoliCode 社区。

将上一个正式首页的 HTML 交给 `node deploy/home-product/prepare-payload.mjs PREVIOUS_HOME_HTML`。生成的 `tmp/home-product-payload` 包含首页补丁、一份样式和一份脚本。部署脚本校验正式站的首页与 Nginx 配置哈希，使用测试站预览，随后切换根首页与两条静态资源路由。原有指南内容按字节保留。

发布目录为 `/var/www/lolicode-site/releases/20261120-home-product-v4`。私有恢复点 `/root/lolicode-20261120-home-product-v4/` 保存配置、校验记录以及发布前的首页。使用本批清单 SHA 调用部署脚本的 `rollback` 动作，脚本会校验当前配置是否仍属于本批。

- 清单 SHA256 `dbbcfff0409bf6f8b7d215812c470aac0bdd61171ce494782a559a3a2c70c2da`
- 首页 SHA256 `d3293a98dc4810c391bcfdb9106d081c9d3fcbb93bf35956552bdb083be0431c`
- 生产 Nginx snippet SHA256 `84b4f71a15e5a5712780d892b450d3dd68e21d56a65c009a4b6e03a2574beaf1`

171 项下载、构建、动效、产品文案与社区数据检查通过。测试站配置已恢复。浏览器验证了桌面和手机排版、安装命令切换及复制、演示播放和社区话题。正式站验收了指南、论坛 API、桌面更新和 CLI 下载。
