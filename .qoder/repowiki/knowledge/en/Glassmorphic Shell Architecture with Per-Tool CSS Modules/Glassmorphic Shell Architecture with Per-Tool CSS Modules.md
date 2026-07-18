---
kind: frontend_style
name: Glassmorphic Shell Architecture with Per-Tool CSS Modules
category: frontend_style
scope:
    - '**'
source_files:
    - css/common.css
    - css/index.css
    - css/chatgpt.css
    - css/ai_upscale.css
    - css/model_previewer.css
    - css/color_space_converter.css
    - css/TA_wiki.css
    - index.html
    - assets/images/background/index_bg.jpg
    - assets/images/background/pbr_bg.jpg
---

## System Overview

This repository uses a **vanilla CSS architecture** organized around a unified navigation shell (`common.css`) and per-tool module stylesheets. There is no CSS framework (Tailwind, Bootstrap) or preprocessor (Sass/Less). Styling relies on inline SVG icons, CSS custom properties (scoped to specific tools), glassmorphism effects, and a consistent teal accent color (#37b18c / #2fa888).

## Key Files and Packages

- **`css/common.css`** — Core shell layout: fixed left sidebar menu (18vw), top search bar, main content panel (#panel at 79vw), custom scrollbar styling, waifu mascot positioning, and category icon definitions via inline SVG data URIs.
- **`css/index.css`** — Homepage-specific styles: full-screen background image, glassy gradient text effect for the welcome title.
- **Per-tool CSS files** (e.g., `css/ai_upscale.css`, `css/chatgpt.css`, `css/model_previewer.css`, `css/color_space_converter.css`) — Each tool has its own dedicated stylesheet following a naming convention matching its HTML/JS counterpart.
- **Background assets** — Two shared background images in `assets/images/background/`: `index_bg.jpg` (homepage) and `pbr_bg.jpg` (most tools).

## Architecture and Conventions

### 1. Shell-and-Panel Layout Pattern

The application uses a **fixed three-zone layout** defined in `common.css`:
- **Left sidebar** (`.left_menu`, 18vw width): Contains collapsible category items with inline SVG icons. Uses CSS Grid for icon/title/submenu layout. Submenus animate open/closed via `max-height` transitions.
- **Top search bar** (`.top_search`, fixed at top): Semi-transparent white overlay with shadow, positioned above the main panel.
- **Main content panel** (`#panel`, 79vw width, offset from left): The primary workspace area where each tool's content is loaded. Has semi-transparent white background with rounded corners and box-shadow.

All tools inherit this shell structure. Individual tool pages include `common.css` plus their own module-specific CSS file.

### 2. Design Tokens via CSS Custom Properties

Design tokens are **not centralized**. Instead, they are defined locally within individual tool stylesheets using `:root` or scoped selectors:

- **Shared teal accent**: `#37b18c` (used in `common.css` for icons, scrollbars, hover states) and `#2fa888` (used in tool modules like `color_space_converter.css`, `compress_image.css`).
- **Tool-scoped tokens** (example from `chatgpt.css`):
  ```css
  --chat-surface: rgba(15, 23, 42, 0.55);
  --chat-border: rgba(148, 163, 184, 0.2);
  --chat-accent: #2563eb;
  ```
- **Tool-scoped tokens** (example from `color_space_converter.css`):
  ```css
  :root {
      --accent: #2fa888;
      --text-main: #233036;
      --card-bg: rgba(255, 255, 255, 0.68);
  }
  ```

This decentralized approach means each tool can define its own palette, but there is no global token system for cross-tool consistency.

### 3. Glassmorphism Visual Style

The dominant aesthetic is **glassmorphism**:
- Semi-transparent backgrounds: `rgba(255, 255, 255, 0.5–0.95)`
- Backdrop blur filters: `backdrop-filter: blur(10px)` (search results), `blur(12px)` (chat panel)
- Soft shadows: `box-shadow: 0px 6px 5px rgba(0, 0, 0, 0.3)`
- Rounded corners: `border-radius: 10px` (standard), `12px`–`16px` for cards/modals
- Gradient overlays: Linear gradients blending white/teal tones for depth

### 4. Typography

- **Primary font**: `"Yu Gothic UI"` applied globally via `* { font-family: "Yu Gothic UI"; }` in `common.css`
- **Fallback**: `sans-serif`
- **Code/monospace**: `Consolas, "SFMono-Regular", Menlo, Monaco, monospace` (used in chat message code blocks)
- No web fonts are loaded; the system relies on OS-installed fonts.

### 5. Responsive Strategy

Responsive design is **minimal and breakpoint-based**:
- Most tools include `@media (max-width: 1200px)` and `@media (max-width: 900px)` rules
- Common pattern: switch grid layouts from multi-column to single-column, hide side panels, reduce font sizes
- Example from `model_previewer.css`:
  ```css
  @media (max-width: 1200px) {
      .mp-layout { grid-template-columns: 260px minmax(0, 1fr); }
      .mp-right { display: none; }
  }
  ```
- No mobile-first approach; desktop layout is the default, with progressive simplification for smaller screens.

### 6. Icon System

Category icons in the left sidebar use **inline SVG data URIs** embedded directly in CSS:
```css
.icon-ai {
    background-image: url("data:image/svg+xml,%3Csvg ... %3E");
}
```
All icons share the same teal stroke color (`#37b18c`) and 24×24 viewBox. This avoids external icon font dependencies.

### 7. Scrollbar Customization

Custom WebKit scrollbar styling is defined globally in `common.css`:
- Thumb color: `rgba(55, 177, 140, 0.6)` with gradient variants for `#panel`
- Track: semi-transparent white with rounded corners
- Hover/active states with increased opacity and glow effects

## Rules Developers Should Follow

1. **File naming convention**: Each tool must have a CSS file named `<tool_name>.css` matching its HTML and JS files (e.g., `ai_upscale.html`, `ai_upscale.js`, `ai_upscale.css`).

2. **Include common.css first**: Every tool HTML file must link `css/common.css` before its module-specific stylesheet to ensure the shell layout loads correctly.

3. **Use the teal accent consistently**: Primary interactive elements should use `#37b18c` or `#2fa888` for borders, backgrounds, and hover states. Secondary actions use gray tones (`rgba(150, 150, 150, 0.65)`).

4. **Apply glassmorphism patterns**: Use semi-transparent white backgrounds (`rgba(255, 255, 255, 0.7–0.95)`) with `border-radius: 10px` and subtle box-shadows for cards and panels.

5. **Define local CSS variables for tool-specific themes**: If a tool needs a distinct color scheme (e.g., dark mode chat), define scoped custom properties rather than hardcoding values.

6. **Responsive breakpoints**: Use `1200px` and `900px` as standard breakpoints for layout adjustments. Avoid introducing new breakpoint values unless necessary.

7. **No external frameworks**: Do not import Tailwind, Bootstrap, Material-UI, or any CSS framework. All styling must be vanilla CSS.

8. **Background image convention**: Use `assets/images/background/pbr_bg.jpg` for tool pages and `index_bg.jpg` for the homepage. Set via `#main_bg` selector with `position: fixed` and `z-index: -1`.

9. **Scrollbar styling**: Rely on the global custom scrollbar rules in `common.css`. Override only if a specific component requires different dimensions (e.g., narrower scrollbars in file lists).

10. **Icon consistency**: New category icons should follow the existing inline SVG data URI pattern with `#37b18c` stroke color and 24×24 viewBox.