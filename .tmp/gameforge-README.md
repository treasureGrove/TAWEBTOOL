# GameForge Runner

Lightweight server-side playtest runner for Web games.

## Run

```bash
cd /opt/gameforge-runner
npm run playtest -- --url=https://example.com/game --name=my-game
```

Outputs:

- `reports/<timestamp>/report.json`
- `reports/<timestamp>/codex-instruction.md`
- screenshots before and after interaction
- `reports/latest/*` mirror for Codex polling

## Codex Loop

The server does not push directly into Codex. Codex should poll this path over SSH:

```text
/opt/gameforge-runner/reports/latest/codex-instruction.md
```
