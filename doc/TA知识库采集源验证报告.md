# TA 知识库采集源验证报告（2026-09-16）

对 80+ 个候选 RSS/Atom 地址逐个抓取验证，用于扩充 `data/wiki_sources.json`，
其中 **12 个已采用**（下方 Accepted — core list）。
关键结论：`realtimerendering.com`、`demofox.org`、`interplayoflight`、`vulkan.org` 等优质图形学博客
被 Cloudflare JS 挑战挡住（HTTP 403），当前采集器无法取得；以后若要接入需要浏览器渲染方案。

---

# Verified RSS/Atom feeds for the TA / real-time rendering knowledge base

Probe date: 2026-09-16. Every URL below was fetched over HTTPS with a Node `fetch()` run using full
browser-like headers, then parsed with the same regex rules the collector uses
(`<item>` / `<entry>` blocks; `<title>`, `<link>`, `<pubDate>` / `<updated>`, `<description>` / `<summary>`,
`<content:encoded>` / `<content>`). Item counts are what the feed returned in one request, not the archive size.

## Accepted — core list

| URL | type | item count | newest item date | newest item title | relevance |
|---|---|---|---|---|---|
| https://gpuopen.com/feed/ | RSS 2.0 | 10 | 2026-09-09 | Temporally stable generative illumination with a one-step diffusion model | AMD GPUOpen: GI, ray tracing, FSR, GPU profilers/tooling, DirectX 12 & Vulkan graphics research. Highest signal-to-noise of the set. |
| https://developer.nvidia.com/blog/category/graphics/feed/ | Atom | 100 | 2026-09-02 | NVIDIA PAIR Virtual Inference Router Expands Available Compute on Your Local Network | NVIDIA graphics blog. Mixed: path tracing, DLSS, Vulkan descriptor heaps alongside some AI/enterprise posts — keyword filter recommended. |
| https://developer.nvidia.com/blog/tag/ray-tracing/feed/ | Atom | 100 | 2026-08-27 | Path Tracing Optimizations in Indiana Jones™: Opacity MicroMaps and Compaction of Dynamic BLASs | NVIDIA ray-tracing tag. Tighter, purely RT/path-tracing; overlaps the graphics feed — use one or the other. |
| https://devblogs.microsoft.com/directx/feed/ | RSS 2.0 | 10 | 2026-06-18 | DirectX Dump Files Preview Now Available! | DirectX/D3D12 runtime, Agility SDK, Shader Model 6.10, GPU crash tooling. Ships `<content:encoded>` full HTML. |
| https://devblogs.microsoft.com/pix/feed/ | RSS 2.0 | 10 | 2026-06-18 | PIX 2606.18-preview: DirectX Dump Files and more | PIX GPU debugger/profiler releases and D3D12 preview features. Overlaps the DirectX blog when both cover the same release. |
| https://www.unrealengine.com/en-US/rss | Atom | 10 | 2026-09-03 | Stepping inside a retro anime-inspired game: a look into the rendering of Orbitals | Epic's official feed: tech blogs (custom shaders, Lumen/MegaLights, Nanite, material editor), sample projects, engine releases. Also carries events/interviews — filter by title. |
| https://godotengine.org/rss.xml | RSS 2.0 | 15 | 2026-09-15 | Dev snapshot: Godot 4.8 dev 6 | Godot engine blog incl. renderer internals (CPU-side rendering optimization, screen-space contact shadows, Vulkan/Metal fixes). Very large `<description>` payloads (~16-19 KB/item). |
| https://blog.selfshadow.com/feed/ | RSS 2.0 | 34 | 2026-07-26 | SIGGRAPH 2026 Links | Ian McAuley "Self Shadow" — PBR, shading models, material/look-dev pipelines. Low post frequency (SIGGRAPH-driven), but the source is canonical for TA. |
| https://www.jendrikillner.com/post/index.xml | RSS 2.0 | 472 | 2026-09-06 | Graphics Programming weekly - Issue 454 - September 6th, 2026 | Weekly curation of real-time rendering / GPU articles with summaries. Already aggregated, so it duplicates other sources but is broadly useful. |
| https://webgpufundamentals.org/atom.xml | Atom | 64 | 2026-08-22 | WebGPU Post Processing - 1D Lookup Tables (1D-LUT) | WebGPU/WGSL lesson updates incl. post-processing, compute. No `<summary>`/`<content>` — title + link + date only, so the collector stores no body text. |
| https://www.khronos.org/feeds/blog_feed | Atom | 15 | 2026-08-28 | OpenVX 1.3.2 Released: More Precise Errors, Better Consistency, and Groundwork for 2.0 | Khronos blog: Vulkan ray tracing/AI extensions, shader ecosystem survey, OpenCL cooperative matrix, glTF PBR & volumetric. Standards-side graphics. |
| https://www.khronos.org/feeds/news_feed | RSS 2.0 | 10 | 2026-09-15 | The Khronos Group Establishes European Entity | Khronos news incl. Vulkan/OpenGL/WebGPU-adjacent items. Contains corporate/press items ("Establishes European Entity") — needs title filtering. |
| https://www.reddit.com/r/GraphicsProgramming/.rss | Atom | 25 | 2026-09-16 | WebGL2 Tutorial: How to Create a Dependency-Free Development Environment for GLSL Shaders | r/GraphicsProgramming: GLSL/DirectX/WebGL/wgpu posts, papers, demos. High volume, community quality varies; occasional rate limiting (HTTP 429 on rapid repeats). |
| https://discourse.threejs.org/latest.rss | RSS 2.0 | 30 | 2026-09-16 | I want to create a top shooting zombie game that looks real like a human being with many resources like guns ask cutlass that you can use to shoot the zombie with a plane White Snow and brown background in a forex and 60 site | three.js forum: WebGL/WebGPU, TSL shaders, post-processing/bloom problems. Some off-topic beginner posts; require keyword scoring. |
| https://asawicki.info/news_rss.php | Atom | 10 | 2026-06-18 | First Look at Epic Games Lore VCS | Adam Sawicki (GPU memory/D3D12/Vulkan expert) — GPU allocators, DirectX tooling, plus general dev posts. Ships full `<content type="html">`. |
| https://realtimevfx.com/latest.rss | RSS 2.0 | 30 | 2026-09-15 | How to make alpha mask | Real-Time VFX forum: materials, alpha masking, Niagara/particle authoring — directly TA-facing. Also carries job posts; filter `[HIRING]`. |
| https://forums.unrealengine.com/c/development-discussion/rendering/37.rss | RSS 2.0 | 25 | 2026-09-15 | Do Level Variant Sets not function in multiplayer? | Unreal Engine Rendering sub-forum. Live rendering troubleshooting; mixed difficulty, useful for real production issues. |
| https://www.fxguide.com/feed/ | RSS 2.0 | 15 | 2026-09-09 | VFXShow 309: The End of Oak Street | VFX industry technical breakdowns/analysis. Adjacent (film-side), less real-time; include only if film VFX counts as TA. |

## Accepted — lower priority / duplicates

| URL | type | item count | newest item date | newest item title | note |
|---|---|---|---|---|---|
| https://blog.unity.com/feed | RSS 2.0 | 50 | 2026-09-30 | CICD Made Easier with Unity CLI | Unity Blog. Only ~2/25 recent items were rendering/TA-relevant (rest is CI, VR case studies, live-ops). Dates have no time-of-day and can be date-ahead. Use only with strict keyword filtering. |
| https://unity.com/blog/feed | RSS 2.0 | 50 | 2026-09-30 | CICD Made Easier with Unity CLI | Byte-identical response to `blog.unity.com/feed` — pick one. |
| https://forums.unrealengine.com/latest.rss | RSS 2.0 | 30 | 2026-09-16 | 3DMASTER025 - Wooden Lattice Trellis with White Wall Planters 3D Model | All-forums firehose; dominated by marketplace/asset spam. Prefer the rendering sub-forum feed instead. |
| https://therealmjp.github.io/index.xml | RSS 2.0 | 94 | 2025-09-07 | Ten Years of D3D12 | "The Real MJP" (ex-Uber/Epic, D3D12/AMD authoring). Excellent D3D12/shader content but newest post is ~1 year old (slightly past the 6-month bar). |
| https://raphlinus.github.io/feed.xml | Atom | 10 | 2025-03-21 | I want a good parallel computer | Raph Levien: GPU compute (piet-gpu), shaders, parallelism. Excellent but ~18 months stale. |
| https://blog.csdn.net/qq_33060405/rss/list | RSS 2.0 | 20 | 2026-09-15 | 无锁队列：不用锁，怎么把东西从一个线程递给另一个线程 | Chinese-language engine-dev blog. Active and technical (Unity GUID internals, threading) but 0/20 recent posts were rendering-specific. |
| https://ph3at.github.io/feed.xml | Atom | 5 | 2025-07-23 | Evaluating VS Code LLM Agents on a Simple Web Site Update Task | PH3 (Windows input latency, game dev). Stale ~14 months and current posts are not rendering. |

## Rejected (fetched and failed, or failed the requirements)

- `https://www.realtimerendering.com/blog/feed/` — HTTP 403, Cloudflare "Just a moment..." JS challenge. Not fetchable.
- `https://blogs.windows.com/windowsdeveloper/feed/` — HTTP 403, Cloudflare challenge.
- `https://www.khronos.org/feed/` — HTTP 404 (page not found). Use `feeds/blog_feed` / `feeds/news_feed` instead.
- `https://www.khronos.org/blog/feed/`, `https://www.khronos.org/blog/rss`, `https://www.khronos.org/blog/feed.xml` — HTTP 200 but HTML, 0 items.
- `https://www.shadertoy.com/rss` — HTTP 403 ("Bad request"); Shadertoy exposes no usable feed.
- `https://webgpufundamentals.org/rss.xml` — HTTP 404; the real feed is `atom.xml` (accepted above).
- `https://github.blog/feed/` — valid RSS (10 items, 2026-09-11, "Marketing ops as code…") but content is platform/AI/marketing, not graphics-relevant.
- `https://vulkan.org/feed` — 403 (Cloudflare). `https://docs.vulkan.org/feed.xml` — 403. No Vulkan site feed reachable; Khronos blog feed covers Vulkan.
- `https://www.unrealengine.com/en-US/feed` — 403 Cloudflare challenge; `https://www.unrealengine.com/en-US/rss` is the working endpoint.
- `https://developer.nvidia.com/blog/category/game-development/feed/` — HTTP 200 but an empty Atom feed (0 entries).
- `https://www.intel.com/.../graphics/feed.xml` — HTTP 404. Intel graphics has no discoverable working feed.
- `https://www.imaginationtech.com/feed/`, `https://www.imaginationtech.com/blog/` — HTTP 403 Cloudflare.
- `https://developer.qualcomm.com/blog/feed` — HTTP 404.
- `https://blog.demofox.org/feed/` and `/index.xml` — HTTP 403 "Checking your browser / JavaScript required" (DDoS-GUESS). Excellent content, not machine-fetchable.
- `https://interplayoflight.wordpress.com/feed/`, `https://blog.molecular-matters.com/feed/` — HTTP 403 JS challenge (WordPress/Cloudflare).
- `https://blog.selfshadow.com/index.xml` — HTTP 200, same 34 items as `/feed/`; use one (both work).
- `https://www.jendrikillner.com/rss.xml` — HTTP 404; correct path is `/post/index.xml`.
- `https://community.khronos.org/c/vulkan/15.rss` — valid RSS but newest item is 2021-05-25 → dead forum.
- `https://www.gamedeveloper.com/rss.xml` and `/rss/feed` — HTTP 403 Cloudflare. `https://www.gamedev.net/rss/` — HTTP 403.
- `https://80.lv/feed` — valid RSS, 10 items, newest 2026-09-16, but it is an art/industry news magazine (news + tutorials blurbs), not rendering tech.
- `https://www.pcgamer.com/rss` — valid RSS 2.0 (50 items) but consumer gaming news, irrelevant.
- `https://news.ycombinator.com/rss` — valid RSS 2.0 (30 items, 2026-09-16) but a general front page, not graphics.
- `https://www.4gamer.net/rss/index.xml` — valid RSS 2.0 (100 items, JP, 2026-09-16) but consumer game news.
- `https://blogs.nvidia.com/feed/` — valid RSS (18 items, 2026-09-16) but corporate/PR (Earth-2 weather, earnings) — marketing feed, rejected per requirements.
- `https://www.cgpersia.com/feed/` — valid RSS (20 items, 2026-09-16) but it is an asset-download/piracy-adjacent site, not a knowledge feed.
- `https://www.cgchannel.com/feed/` — valid RSS but newest item 2024-09-29 → dead.
- `https://www.3dgep.com/feed/` — valid RSS but newest item 2021-06-01 → dead.
- `https://learnopengl.com/feed.xml` / `rss.xml` — HTTP 200 but HTML, no feed.
- `https://www.scratchapixel.com/rss.xml` — HTTP 404. `https://thebookofshaders.com/feed.xml` — HTTP 404.
- `https://gamedev.js.org/feed.xml` — HTTP 404. `https://enginearchitecture.org/feed` + `/feed.xml` + `/rss.xml` — 404.
- `https://www.thetenthplanet.de/feed.xml` — DNS/TLS failure (fetch failed); site has no reachable feed.
- `https://www.wihbe.com/rss/`, `https://newsletter.getlukas.dev/feed`, `https://blog.raymondchen.org/feed`, `https://www.andrewkorth.com/feed.xml`, `https://sagacity.dev/feed.xml`, `https://mlb.tools/feed.xml` — fetch failed (DNS/TLS/timeout), never reached the site.
- `https://developer.arm.com/community/feeds/news` — request timeout.
- `https://www.reddit.com/r/WebGPU/.rss` — HTTP 429 rate-limited on both attempts; assuming GraphQL-free endpoint it should work on retry, but unverified.
- `https://www.gdcvault.com/rss/gdcvault.xml`, `https://www.gdcvault.com/feeds/gdcvault`, `https://gnomon.io/feed/`, `https://webgpureport.org/`, `https://www.jiqizhixin.com/rss`, `https://www.zhihu.com/rss` — HTTP 200 but no items / HTML instead of XML.
- `https://catlikecoding.com/unity/tutorials/rss`, `https://sidefx.com/rss.xml`, `https://developer.valvesoftware.com/feed`, `https://www.adriancourreges.com/feed.xml`, `https://filmicworlds.com/feed/`, `https://alextardif.com/feed.xml` + `/rss.xml`, `https://agraphicsguynotes.com/feed.xml`, `https://therealmjp.github.io/feed.xml`, `https://advanced-rendering-course.github.io/feed.xml`, `https://gitea.com/xjayleex/GameProgrammer/raw/branch/master/feed.xml` — HTTP 404 (no feed at that path).
- `https://www.chrismcguire.net/blog/feed/` — HTTP 403 Cloudflare.
- `https://gpuopen.com/learn/feed.xml` — HTTP 404; the working GPUOpen feed is `https://gpuopen.com/feed/`.

## Collector implementation notes

1. **Feed URL is not always the URL you type.** `https://gpuopen.com/feed/` 301s to `https://gpuopen.com/feed.xml`; `https://www.unrealengine.com/en-US/rss` redirects to `.../rss?lang=en-US`. Follow redirects and store the final URL.
2. **CDATA is pervasive.** Unity, NVIDIA and webgpufundamentals return `<![CDATA[...]]>` around `<title>`. Unwrap CDATA *before* the title regex or titles get stored with literal `<![CDATA[`.
3. **Atom `<link href="...">` vs RSS `<link>text</link>`.** Must handle both element forms, and prefer the `href` when it is an absolute URL.
4. **Several accepted feeds carry no body text**: `webgpufundamentals.org/atom.xml` has no `<summary>`/`<content>`. If the DeepSeek summary prompt requires a description, either fetch the linked page or skip such items.
5. **Guard against Cloudflare-protected hosts.** 15+ otherwise-good graphics blogs (realtimerendering.com, demofox.org, interplayoflight, molecular-matters, vulkan.org, unrealengine.com/feed) answer with a JS challenge. They will fail intermittently; treat a 403-with-HTML as "skip", not as an error worth retrying hard.
6. **Rate limits:** reddit RSS returned 429 on back-to-back requests — fetch it at most once per run and set a real User-Agent.
7. **Duplication:** `unity.com/blog/feed` == `blog.unity.com/feed`; `selfshadow.com/feed/` == `/index.xml`; NVIDIA graphics vs ray-tracing tag overlap heavily. Keep one of each.
8. **Date granularity:** Unity uses date-only `pubDate` (midnight GMT, sometimes ahead of the current date), so "newest item" can look like it is in the future. Do not reject on that.
