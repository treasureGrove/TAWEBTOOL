# Grove Range — pass-1 evidence

## Result

Playable Three.js FPS mini-game **小树林靶场** integrated into the TA工具箱 sidebar menu, with server-backed leaderboard.

Local URLs used for QA:
- Game: `http://127.0.0.1:8080/tools_html/grove_range.html`
- Score API (via local static proxy → `127.0.0.1:8799`): `GET/POST /api/scores`

## Design artifacts

See `artifacts/game-progress.md` (brief, core loop, level plan, systems map).

## What ran

| Check | Command / method | Result |
|-------|------------------|--------|
| Server syntax | `node --check server/game_scores.mjs` `server/chat_proxy.mjs` `js/menu.js` | pass |
| Game parse | strip-import Function parse | pass |
| Score POST | PowerShell → `:8799/api/scores` | `{"ok":true,"rank":1,"personalBest":1280}` |
| Score GET | `:8799/api/scores?game=grove_range` | ranked list, accuracy derived |
| Canvas pixels | Playwright Chromium headless | menu + active-play non-blank |
| Test hooks | `seed` / `setState('active-play')` / `setPausedForScreenshot` | acknowledged |
| Interaction | 12 × mouse fire in `active-play` | `shots:12`, no page errors |
| Score submit from page | form → `POST /api/scores` | `已上榜 · 当前第 2 名 · QA教官` |
| Console/page errors | Playwright listeners | 0 |

## Measured canvas metrics (pass-1)

From `artifacts/pass-1/report.json` (1026×702 canvas):

| View | meanLuma | colorEntropy | edgeDensity | nonBlank |
|------|----------|--------------|-------------|----------|
| menu | 68.18 | 1.002 | 0.0154 | true |
| active-play | 22.27 | 1.017 | 0.0077 | true |

## Render diagnostics (active-play)

- draw calls ≈ 16–20
- triangles ≈ 640–936
- geometries ≈ 39–48
- textures 1
- well under budget for this scene class

## Controls exercised

- Start button → pointer-lock FPS session
- LMB fire (hitscan), RMB ADS, WASD, Shift sprint, Space dash, R reload, Esc pause
- Fail → after-action report → name → upload score → leaderboard
- LocalStorage fallback when API down (observed on first pass without proxy)

## Score API contract

- `GET /api/scores?game=grove_range&limit=10`
- `POST /api/scores` `{game,name,score,wave,kills,shots,hits,accuracy,durationMs}`
- Storage: `data/game_scores/entries.json` (gitignored body)
- nginx: `location /api/scores` → `127.0.0.1:8799`; raw `data/game_scores` denied

## Deployment notes

1. Deploy static files as usual (`tools_html/grove_range.html`, `js/grove_range.js`, `css/grove_range.css`, `js/menu.js`, `index.html`).
2. Merge `server/chat_proxy.mjs` + `server/game_scores.mjs` and restart the proxy on `8799`.
3. Merge `server/nginx_site.conf` (`/api/scores` + deny `data/game_scores`) and reload nginx.
4. Ensure `data/game_scores/` exists and is writable by the proxy user.

## Residual risks / known limits (iteration backlog)

- Desktop-first FPS (pointer lock). Touch twin-stick not in this slice.
- Hitscan has no wall penetration / cover occlusion ray (cover blocks movement only).
- Visuals are procedural low-cost kit — good clarity, not premium model density.
- Anti-cheat is rate clamp + daily IP cap only.
- QA screenshots live in `artifacts/pass-1/*.png` and `artifacts/pass-2/*.png`.

## Graphics pass-2 evidence (user: too dark / not facing targets / ugly assets)

| Check | Result |
|-------|--------|
| meanLuma (active-play) | 22.27 → **152.34** |
| lumaContrast | ~0 darkness compression → **66–82** |
| facingCos (nearest target) | **0.987** (was facing away: yaw=π) |
| Console/page errors | 0 |
| Surfaces upgraded | sky dome, ground tiles, crystal clusters, crates, paper target stands, 3 enemy silhouettes, carbine viewmodel, lighting stack |
| Screenshots | `artifacts/pass-2/menu.png`, `artifacts/pass-2/active-play.png` |
| Renderer | calls 209 · triangles 10058 · textures 4 |

References read this pass: `visual-scorecard.md`, `authoring-recipes.md`.

## Content pass-3 — zombies + input fixes

| Check | Result |
|-------|--------|
| Enemy family | walker / runner / spitter (procedural humanoids) |
| AI | walk toward player melee · runner sprint · spitter kite + bile |
| Headshot | head mesh `core` · feed「爆头」 |
| ADS stick | fixed via pointer buttons mask + blur/cancel release |
| Browser RMB menu/gestures | contextmenu/auxclick/gesturestart/wheel blocked in play |
| Smoke | nearestEnemy.type=walker, 4 enemies, facingCos 0.99, 0 errors |
| ADS regression | `artifacts/pass-3/ads-context.json` ok=true |
| Branding | 侧边栏/首页/页面文案 →「小树林尸潮」 |

## Visual harness decision

Worth adding later if the art pass multiplies surfaces; not required for this arcade slice.

## Bot playtest

Not run for this slice (non release-ready). Manual/scripted interaction path is covered above.
