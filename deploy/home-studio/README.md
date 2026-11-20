# 官网首屏和工作台短片

2026-11-20 发布。首页用酒红织纹、香槟金压纹和可暂停的走光承托小笨狗。新影片沿用同一套视觉，提供 1080p 桌面版与 540p 手机版。两版均为 54 秒。

片中工作台镜头取自已发布的 LoliCode 1.1.4 演示。修复前后的页面截图与测试结果来自隔离的待办示例复跑。同一行条件修改将测试结果由 2 项通过、1 项失败改为 3 项通过，确认了全部、待办和已完成三个筛选的结果。背景音乐从原片重混。剪辑脚本和录制素材留在本机 `tmp/home-studio/`。

## 底图生成提示词

使用内置 ImageGen 生成，项目资源为 `lolicode/assets/home-20261120-studio.webp`。

```text
Use case: ads-marketing. Generate a wide landscape background artwork for the LoliCode AI coding product homepage and video title cards, intended to sit behind live text and an existing pink character cutout. Full-bleed 2:1 composition. Art direction: a refined dark cherry-wine silk book cover, very fine tactile jacquard grain, antique champagne-gold hot foil, a soft pool of deep ruby light. On the RIGHT only, centered at x=76% y=51%, compose a large circular medallion stage with an almost-empty shaded interior for the character, two thin hand-engraved concentric rings, sparse celestial pinpoints, very fine botanical scrollwork apparently pressed into the fabric along the outer radius. A few carefully placed luminous gold highlights accent the ring, with subtle occlusion and cloth folds. On the LEFT 54%, keep the entire background consistently dark burgundy and very quiet with just a whisper of woven texture, providing high contrast for light Chinese type. The visual should feel bespoke, tactile, understated, and editorial, in the spirit of fine perfume packaging photographed in a dark studio. Palette strict black cherry #320e1c, wine #64172e, rosewood #812d47, subtle antique gold #bd936e. Frame details fade into dark wine toward the corners and left. Avoid excessive glitter, neon, sci-fi circuitry, hard shadows, image borders, symmetry across the whole canvas, chunky flourishes, large circles on the left, text, logos, UI, lettering, character, and watermark.
```

## 发布记录

- 首页目录 `/var/www/lolicode-site/releases/20261120-home-studio-v6`，首页 SHA256 `efee5c7ac09235186e8257c6c7dafb5fa12025cebe27665053623ab1e56c7546`。
- 私有恢复点 `/root/lolicode-20261120-home-studio-v6/`，清单 SHA256 `93aece8ff85b29f09db6ca20989d21cb25356679af650137da8cb08e36e5c6b4`。
- 生产 Nginx snippet SHA256 `3ceb93b81b2315f7a92b055cec086645c7ea9944fc3e56b1133cbef51096f20a`。使用本批部署脚本与清单 SHA 可执行条件回退。
- 171 项相关回归通过。预览和正式站验证了桌面与手机播放、动效暂停、下载与原有指南，测试站已恢复。
