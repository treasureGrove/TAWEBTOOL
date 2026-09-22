# 铅之圣咏 · 3D 废土鉴定当铺

固定柜台视角的浏览器游戏原型。玩家扮演废土鉴定师，在有限的背包里同时装工具和商品：选装备、检验证据、收购物品，再决定是否认证以及交给谁。

当前可玩内容为三天、九位来客，包含背包拖放与旋转、五种鉴定工具、经营结算、不同买家和多种结局。正常实时 3D 光照和材质，无 PS1 滤镜。

## 本地试玩

需要 Node.js 18 或更新版本，无需安装 npm 依赖。

```bash
cd games/lead-canticle/web
node server.mjs
```

然后打开 http://127.0.0.1:4173/ 。Windows 也可双击本目录的 `启动网页版.cmd`。

## 静态托管

`web/dist/` 是完整的静态游戏，无服务端业务依赖。Three.js 和许可证已经包含在内，不依赖外部 CDN。

如果将仓库部署到现有网站，访问 `/games/lead-canticle/` 会跳转到游戏入口 `/games/lead-canticle/web/dist/`。上传 GitHub 本身不等于已同步部署到线上服务器。

## 文件

- [操作与开发说明](web/README.md)
- `web/dist/`：页面、界面、3D 场景、游戏规则与内容。
- `web/tests/`：规则测试与静态资源检查。
- `web/server.mjs`：本地预览服务。
- `docs/gdd.md`、`docs/story-bible.md`：长期设计与故事草案，其中部分系统尚未实装。

```bash
cd web
node --test tests/engine.test.mjs
node tests/static-check.mjs
```

存档保存在当前浏览器的本地存储中，不上传服务器。旧 Godot 原型、参考游戏截图、临时文件和引擎缓存不包含在此目录。
