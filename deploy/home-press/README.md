# 官网首页美术与发布记录

2026-11-20 发布。桌面下载和 Windows / Linux 终端命令位于首屏，随后是四个可切换的工作台画面、带章节的演示、上手问答、三篇指南、版本更新与社区话题。首页信息顺序参考 [Hermes Agent 官网](https://hermes-agent.nousresearch.com/)。

## 角色原画

首屏直接使用 TAI-Switch 的 `design/ip/D-pinkdog-rig-v1/tail-matched-source.png`，导出为 `lolicode/assets/home-press-companion-v1.webp`。其正侧背设定是同目录的 `turnaround.png`。犬耳和尾巴均为可可棕主毛、米白毛尖。原画 SHA256 为 `50f26ac85079dda9f155b453840cd4652ff26fd0ae464d5b03c4e08a5891339b`，三视图为 `c6326b5eb24e57164edb79562522e1b29678b4e039f131e7729d9473c935918b`。

背景曲线由 `home-press-v1.js` 在画布尺寸变化时绘制。分享卡片 `lolicode/assets/home-press-share-v1.jpg` 用同一张角色原画、同一组线纹和网页字体排版，尺寸为 1200 × 630。

## 指南插画

内置 ImageGen 生成三联母图，按栏导出为 720 × 720 WebP。对应文件为 `lolicode/assets/home-guide-companion-v1.webp`、`lolicode/assets/home-guide-characters-v1.webp`、`lolicode/assets/home-guide-code-v1.webp`。

```text
Use case: illustration-story. Make ONE carefully art-directed horizontal triptych vignette plate from a Japanese illustrated book of a nocturnal programming atelier. Deliver a single extra-wide 3:1 panoramic printed sheet, three equal, evenly spaced and independently croppable vignettes aligned on one horizontal baseline against a continuous unbroken field of warm pale buttermilk ivory paper (#f4ead8). No dividers, borders, edge decoration or lettering anywhere. Each object cluster is completely isolated inside the middle 70 percent of its own third with generous margins around all sides. Same scale, same style, same camera angle: three-quarter tabletop view with small softly hatched shadows. LEFT THIRD: an oval antique gilt enamel cameo pendant with a charming profile of a curly-haired, floppy puppy-eared anime mascot in relief, attached to a sumptuous burgundy grosgrain bow and short chain. MIDDLE THIRD: a fan of three overlapping ivory character-story cards with finely printed celestial imagery, a crescent moon among rose vines and small star motifs, no letters or numbers at all. RIGHT THIRD: a single small vintage cream CRT terminal integrated with a short chunky ivory mechanical keyboard and blank soft rose phosphor screen, a few short abstract lines of light, no characters or glyphs. Style: exceptionally fine burgundy pen-and-ink copperplate outlines, Japanese vintage illustrated book illustration, controlled crosshatching, selective warm dusty rose and old-gold two-color letterpress with subtle offset registration. Flat color, almost imperceptible paper grain, confident silhouette, a tiny floating four-point brass star by each object. Understated, tactile, quiet luxury. Draw substantial elegant objects which read clearly as tiny editorial illustrations. No captions, no titles, no page numbers, no logos, no watermarks, no photography, no 3D rendering, no scenery, no dotted box edges, no extra objects crossing panel boundaries.
```

## 发布与回退

- 正式根页面位于 `/var/www/lolicode-site/releases/20261120-home-press-v9/index.html`，SHA256 为 `08530d44eb12a518257cbe8eaaae226ef9744e14ccdae47a92f5ff8df252da50`。
- 生产 Nginx snippet 的 SHA256 为 `eeb22f97134bfa35d64af122e13631212b07e2a687221ffd98229d5c0220a63c`。测试站配置已恢复到 `7b100ffa18ac9aeb7b6df73553e07f60b13991ad938fe2587162acb74766d321`。
- 私有恢复点位于 `/root/lolicode-20261120-home-press-v9/`，清单 SHA256 为 `bdcdba1edf7b154ab764ad3b7f327b437c8fe6e092fbcd07528742379f131d07`。在服务器上运行该目录的 `deploy.py rollback` 并传入清单 SHA，可在配置仍匹配时恢复上一版。
