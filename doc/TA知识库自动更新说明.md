# TA 知识库自动更新说明

TA 知识库不再通过浏览器后台人工维护，也不依赖 GitHub。推荐模式是：

1. 服务器定时执行采集脚本。
2. DeepSeek 负责文章筛选、分类、标签和内容整理。
3. 脚本生成静态 JSON。
4. 前台只读 JSON 和内置种子知识库。

前台读取两类数据：

- `js/ta_wiki_data.js`：随项目发布的内置种子知识库，覆盖常用图形学、Shader、材质、性能和资产规范基础条目。
- `data/ta_wiki_entries.json`：服务器自动采集生成的外部文章和 AI 整理条目。

## 前台阅读模式

前台不再只是“搜索硬切列表”。当前按三种内容模式组织：

- 基础知识：项目内置、稳定、可直接检索的 TA 知识条目。
- 外部文章：从 RSS 和固定图形学/渲染技术页面采集的原文资料。
- AI整理：DeepSeek 判断值得收录后生成的摘要、文章阐述和 TA 落地建议。

页面还会提供专题入口、高频标签、来源质量状态和相关条目，方便按主题连续阅读。

## 自动采集流程

采集入口是 `scripts/wiki_collect.mjs`，采集源配置在 `data/wiki_sources.json`。

```powershell
node scripts/wiki_collect.mjs
```

脚本会读取 RSS 和固定技术页面，筛选图形学、渲染、Shader、GPU、资产管线和性能优化相关内容，然后合并写入 `data/ta_wiki_entries.json`。

每条自动采集内容会包含：

- 自动归纳：用于列表和文章开头的短摘要。
- 原文摘录：从原文或 README 中抽取和图形学/TA 关键词更相关的片段。
- 文章阐述：用规则把文章映射到材质、Shader、性能、资产管线等 TA 语境。
- TA 视角：落地到项目时应该检查的版本、平台、成本和收益。

## DeepSeek 筛选与生成

脚本支持把文章筛选、分类、标签、文章阐述和 TA 视角交给 DeepSeek。推荐在服务器环境变量中配置：

```bash
export WIKI_AI_API_KEY="你的 DeepSeek 或 OpenCode 中配置的 DeepSeek Token"
export WIKI_AI_BASE_URL="https://api.deepseek.com"
export WIKI_AI_MODEL="deepseek-v4-flash"
export WIKI_AI_FILTER="1"
```

如果 OpenCode 已经把 token 写进 shell 环境，也可以把 `WIKI_AI_API_KEY` 指向对应变量，例如：

```bash
export WIKI_AI_API_KEY="$DEEPSEEK_API_KEY"
```

脚本会先采集候选文章，再让 DeepSeek 判断是否适合进入 TA 知识库，并生成：

- 是否收录。
- 相关性评分和置信度。
- 内容类型，例如教程、技术文章、规范、工具文档、性能分析。
- 分类和标签。
- 自动归纳。
- 文章阐述。
- TA 视角。

没有配置 token 时，脚本会回退到本地关键词筛选和规则阐述，但默认规则更严格：需要达到 `WIKI_MIN_RELEVANCE_SCORE`，默认值为 `5`。

## 是否需要 AI Agent

当前不需要常驻 AI Agent。默认方案是“定时任务 + 采集脚本 + DeepSeek API”：

- 自有 Linux 服务器：用 cron 定时执行 `node scripts/wiki_collect.mjs`。
- Windows 服务器：用任务计划程序定时执行同一条命令。

AI Agent 只适合作为可选增强，例如：

- 对长文章做更高质量的中文总结。
- 把多篇文章归并成专题。
- 自动判断重复内容和过期内容。
- 生成更接近人工知识库风格的“实践建议”。

不要把前台页面改成依赖后台人工维护，也不需要长期运行一个能写数据库的管理后台。

## Linux cron 示例

```bash
cd /path/to/TAWEBTOOL
WIKI_AI_API_KEY="$DEEPSEEK_API_KEY" WIKI_AI_MODEL="deepseek-v4-flash" WIKI_AI_FILTER="1" node scripts/wiki_collect.mjs
```

每天凌晨 3:20 更新：

```cron
20 3 * * * cd /path/to/TAWEBTOOL && WIKI_AI_API_KEY="$DEEPSEEK_API_KEY" WIKI_AI_MODEL="deepseek-v4-flash" WIKI_AI_FILTER="1" node scripts/wiki_collect.mjs >> logs/wiki_collect.log 2>&1
```

## 当前服务器

目标服务器 IP：`124.223.29.60`。

部署时需要确认：

- SSH 用户名。
- 登录方式：密码或私钥。
- 站点目录，例如 `/var/www/TAWEBTOOL`。
- OpenCode/DeepSeek token 在服务器上暴露的环境变量名。

## 扩展来源

新增来源只改 `data/wiki_sources.json`，不需要开发维护后台。当前支持：

- `rss`：技术博客或官方更新源。
- `page`：固定图形学知识页面。
- `github_repo`：脚本仍支持，但默认不启用，避免知识库混入普通仓库说明。
