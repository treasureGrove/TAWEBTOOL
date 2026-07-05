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

- Improve the wiki UI and reading flow.
- Add or refine builtin TA knowledge entries.
- Add, remove, or score collection sources.
- Tune DeepSeek prompts and filtering rules.
- Check server logs and cron status.
- Run `scripts/run_wiki_collect.sh` or `node scripts/wiki_collect.mjs`.

## Server Context

Production path:

```text
/www/wwwroot/tools.treasuregrove.art
```

Production cron:

```text
17 3 * * * /www/wwwroot/tools.treasuregrove.art/scripts/run_wiki_collect.sh >> /www/wwwroot/tools.treasuregrove.art/logs/wiki_collect.log 2>&1
```

## Safety

- Do not print `.env`, API keys, OpenCode auth JSON, SSH keys, or mail credentials.
- Do not restore the old `TA_wiki_admin` backend.
- Do not let the frontend call DeepSeek directly.
- Do not delete large amounts of wiki history unless the user explicitly asks.
- Keep updates deterministic: scripts and config files should explain what the AI is allowed to do.

