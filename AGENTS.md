# TAWEBTOOL Agent Guide

## Role

You are allowed to maintain the TA Wiki system in this project. Treat the wiki as an automated documentation product, not as a browser-admin CMS.

## Read First

Before changing the TA Wiki, read:

- `doc/TA知识库需求.md`
- `doc/TA知识库自动更新说明.md`
- `data/wiki_memory.json`
- `data/wiki_sources.json`
- `scripts/wiki_collect.mjs`
- `tools_html/TA_wiki.html`
- `js/ta_wiki.js`
- `css/TA_wiki.css`

## Allowed Work

- Add or refine builtin TA knowledge entries.
- Add, remove, or score collection sources.
- Tune DeepSeek prompts and filtering rules.
- Check server logs and cron status.
- Run `scripts/run_wiki_collect.sh` or `node scripts/wiki_collect.mjs`.
- Improve the wiki UI and reading flow **only when the user asks for it in that
  conversation**, and commit those changes on their own (see 提交边界).

## 提交边界

定时任务（cron）只允许提交采集流水线自己产出的文件：

```text
data/ta_wiki_entries.json
assets/images/wiki
```

其余文件（`css/`、`js/`、`tools_html/`、`scripts/`、`doc/`、`AGENTS.md`、
`.gitignore`、`data/wiki_sources.json`、`data/wiki_memory.json`）都必须人工确认后单独提交。

原因：2026-07-05 的定时任务把工作区里尚未提交的前端改版（`.wiki-panel` 从 flex 改成
固定行数的 grid）连数据一起打包进了「自动更新 TA Wiki 知识库」提交（`8e12425`），
改动的真实来源被提交信息掩盖，随之而来的行数不匹配导致知识库正文区被压成 0 高，
直到 2026-09-29 才被发现。`scripts/opencode_wiki_maintainer.sh` 里的 `git add`
已收窄到上面的最小集合，并在检测到其它未提交改动时只输出警告、不提交。

## Server Context

Production path:

```text
/www/wwwroot/tools.treasuregrove.art
```

Production cron (actual crontab entry):

```text
17 3 * * * /www/wwwroot/tools.treasuregrove.art/scripts/opencode_wiki_maintainer.sh >> /www/wwwroot/tools.treasuregrove.art/logs/wiki_maintainer.cron.log 2>&1
```

该脚本内部再调用 `scripts/run_wiki_collect.sh`，采集入口仍是后者。

## Safety

- Do not print `.env`, API keys, OpenCode auth JSON, SSH keys, or mail credentials.
- Do not restore the old `TA_wiki_admin` backend.
- Do not let the frontend call DeepSeek directly.
- Do not delete large amounts of wiki history unless the user explicitly asks.
- Keep updates deterministic: scripts and config files should explain what the AI is allowed to do.

