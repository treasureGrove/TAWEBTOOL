# TA 知识库需求

## 目标

TA 知识库是 TAWEBTOOL 的技术美术阅读与速查模块。它应该像 wiki/documentation，而不是后台维护页面或文章搜索结果页。

## 产品原则

- 不做浏览器后台人工维护 HTML。
- 服务器自动采集和更新。
- DeepSeek 参与文章筛选、分类、标签、文章阐述和 TA 落地建议。
- OpenCode/Codex 这类 agent 可以维护框架、规则、来源和内置知识，但必须基于项目文件中的显式规则工作。
- 内容宁缺毋滥，优先收录能指导项目落地的文章。

## 内容结构

每条自动文章应包含：

- 自动归纳
- 原文摘录
- 文章阐述
- TA 视角
- 元信息

内置知识应覆盖：

- 渲染基础
- Shader模板
- 贴图与材质
- 光照与阴影
- 后处理
- 性能优化
- 图形API
- 资产管线
- 流程规范

## 前台交互

- panel 内采用文档站布局。
- 左侧是可搜索条目列表。
- 中间是正文阅读区。
- 宽屏右侧显示本文目录和相关条目。
- 顶部保留搜索、分类、来源筛选和专题入口。
- 不显示后台维护入口。

## 自动更新

服务器路径：

```text
/www/wwwroot/tools.treasuregrove.art
```

定时任务：

```text
17 3 * * * /www/wwwroot/tools.treasuregrove.art/scripts/run_wiki_collect.sh >> /www/wwwroot/tools.treasuregrove.art/logs/wiki_collect.log 2>&1
```

运行脚本：

```text
/www/wwwroot/tools.treasuregrove.art/scripts/run_wiki_collect.sh
```

## Agent 维护方式

Agent 后续维护前应先阅读：

- `doc/TA知识库需求.md`
- `doc/TA知识库自动更新说明.md`
- `data/wiki_memory.json`
- `data/wiki_sources.json`
- `scripts/wiki_collect.mjs`
- `tools_html/TA_wiki.html`
- `js/ta_wiki.js`
- `css/TA_wiki.css`

Agent 可以：

- 调整 UI 框架和交互。
- 增加内置知识条目。
- 优化 DeepSeek 提示词和筛选规则。
- 新增高质量来源。
- 读取服务器日志排查失败源。

Agent 不应：

- 恢复后台维护入口。
- 未经确认删除大量历史知识。
- 把 token 写进仓库。
- 让前台直接依赖 DeepSeek API。
