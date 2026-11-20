# 社区布局官网首页

2026-11-20 发布。首页采用社区的酒红侧栏、紧凑欢迎横幅和奶油色卡片。桌面版、CLI 与公共话题靠前展示，演示和指南在下面。手机侧栏折为顶部导航，星光和缎带可暂停。

用更新前的正式首页作为 `node deploy/home-portal/prepare-payload.mjs PREVIOUS_HOME_HTML` 的输入。脚本验证上一版 SHA256，只替换首页顶部和样式引用，并生成 `tmp/home-portal-payload`。原页面中的指南等内容由现网基线保留。

生产目录 `/var/www/lolicode-site/releases/20261120-home-community-portal-v3`。恢复点 `/root/lolicode-20261120-home-community-portal-v3/` 保存前后配置和发布回执。脚本的 `rollback` 动作使用本批清单 SHA，并要求当前配置仍匹配本批。

- 清单 SHA256 `cbf4458c8cec4c03d02e1fcf482e240128f57c2d078c6b41934b85b87a3ff776`
- 首页 SHA256 `258c2cd5c2bf84af9bbf791de6ea159c3a2bacd556797075e22a8bd9c4b2cf22`
- 本批 Nginx snippet SHA256 `fd91a9face558ef92d5b0915ef60e3d020ef43e85ae68c4f7c2c08167a3b2ac6`

171 项现有下载、构建、社区数据和动效回归通过。测试站已恢复。正式浏览器验证了桌面与手机布局、3 条话题和讨论链接、桌面版本与下载菜单、演示播放。效果图在忽略目录 `artifacts/community-portal/`。
