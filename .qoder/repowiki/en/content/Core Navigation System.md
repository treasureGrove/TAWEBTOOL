# Core Navigation System

<cite>
**Referenced Files in This Document**
- [menu.js](file://js/menu.js)
- [common.css](file://css/common.css)
- [index.css](file://css/index.css)
- [index.html](file://index.html)
- [local_workbench.js](file://js/local_workbench.js)
- [chatgpt.html](file://tools_html/chatgpt.html)
- [ai_upscale.html](file://tools_html/ai_upscale.html)
- [waifu.js](file://js/waifu.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document describes the core navigation system that powers the application’s menu architecture, global search, and UI layout. It explains how the menu data is structured, how the sidebar and search are built and rendered, and how the system integrates with tool pages via the workbench framework. It also covers event handling, responsive design, and practical guidance for extending the menu with new tools.

## Project Structure
The navigation system spans a small set of JavaScript and CSS assets, plus HTML entry points for tools. The central JavaScript module defines the menu data and implements rendering, accordion behavior, and global search. CSS files define the responsive layout and visual states. Tool pages embed the navigation and delegate tool-specific UI to the workbench.

```mermaid
graph TB
subgraph "Entry Pages"
IDX["index.html"]
TH1["tools_html/chatgpt.html"]
TH2["tools_html/ai_upscale.html"]
end
subgraph "Navigation Core"
MJ["js/menu.js"]
LWB["js/local_workbench.js"]
end
subgraph "Styles"
CC["css/common.css"]
IC["css/index.css"]
end
subgraph "Live2D Widget"
WJ["js/waifu.js"]
end
IDX --> MJ
TH1 --> MJ
TH2 --> MJ
MJ --> CC
MJ --> IC
TH1 --> LWB
TH2 --> LWB
IDX --> WJ
TH1 --> WJ
TH2 --> WJ
```

**Diagram sources**
- [index.html:12-22](file://index.html#L12-L22)
- [chatgpt.html:15-25](file://tools_html/chatgpt.html#L15-L25)
- [ai_upscale.html:12-162](file://tools_html/ai_upscale.html#L12-L162)
- [menu.js:268-272](file://js/menu.js#L268-L272)
- [common.css:7-58](file://css/common.css#L7-L58)
- [index.css:14-41](file://css/index.css#L14-L41)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)
- [waifu.js:3-17](file://js/waifu.js#L3-L17)

**Section sources**
- [index.html:12-22](file://index.html#L12-L22)
- [chatgpt.html:15-25](file://tools_html/chatgpt.html#L15-L25)
- [ai_upscale.html:12-162](file://tools_html/ai_upscale.html#L12-L162)
- [menu.js:268-272](file://js/menu.js#L268-L272)
- [common.css:7-58](file://css/common.css#L7-L58)
- [index.css:14-41](file://css/index.css#L14-L41)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)
- [waifu.js:3-17](file://js/waifu.js#L3-L17)

## Core Components
- Menu data and rendering: Centralized menu definition drives the sidebar and search indexing.
- Sidebar accordion: Click-to-expand categories with single-open behavior.
- Global search: Live filtering of categories and items with keyboard shortcuts and dropdown results.
- Workbench integration: Tool pages embed the navigation and delegate UI to the workbench.
- Responsive layout: Fixed-position panels with percentage-based widths and media queries in tool-specific styles.

Key responsibilities:
- Single source of truth for menu items and categories.
- Lightweight DOM manipulation for menu and search UI.
- Minimal coupling to tool pages; tools only declare intent via dataset attributes.

**Section sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [menu.js:46-68](file://js/menu.js#L46-L68)
- [menu.js:80-103](file://js/menu.js#L80-L103)
- [menu.js:107-272](file://js/menu.js#L107-L272)
- [common.css:7-58](file://css/common.css#L7-L58)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)

## Architecture Overview
The navigation system initializes on DOMContentLoaded, injecting the menu into the left sidebar and setting up the top search bar. Tool pages include the same navigation script and rely on the workbench to render tool-specific UI inside a dedicated panel element.

```mermaid
sequenceDiagram
participant Doc as "Document"
participant Menu as "menu.js"
participant DOM as "DOM"
participant CSS as "common.css"
Doc->>Menu : "DOMContentLoaded"
Menu->>DOM : "injectMenu()"
Menu->>DOM : "initLeftMenu()"
Menu->>DOM : "initTopSearch()"
Menu->>CSS : "applies layout and states"
Note over Menu,DOM : "Menu items and search results rendered dynamically"
```

**Diagram sources**
- [menu.js:268-272](file://js/menu.js#L268-L272)
- [common.css:7-58](file://css/common.css#L7-L58)

## Detailed Component Analysis

### Menu Data and Rendering
- Menu data is a flat array of categories, each containing items with label, href, and optional keywords. This serves as the single source of truth for both the sidebar and search indexing.
- The renderer builds nested HTML lists, adding a data attribute used for client-side search matching.
- Path prefixing ensures correct linking whether the app runs from the root or a subdirectory.

Implementation highlights:
- Building HTML from MENU_DATA and injecting into the left sidebar container.
- Using a data attribute to precompute searchable terms for fast filtering.

**Section sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [menu.js:46-68](file://js/menu.js#L46-L68)
- [menu.js:112-115](file://js/menu.js#L112-L115)
- [menu.js:117-135](file://js/menu.js#L117-L135)

### Sidebar Accordion Behavior
- Clicking a category toggles its submenu open/closed.
- Only one category remains open at a time; others are automatically closed.
- Visual feedback via CSS classes toggled on the clicked item and its siblings.

Event handling:
- Delegated click listener on the root menu element.
- Conditional handling to avoid toggling when clicking inner links.

**Section sources**
- [menu.js:80-103](file://js/menu.js#L80-L103)
- [common.css:154-162](file://css/common.css#L154-L162)
- [common.css:178-181](file://css/common.css#L178-L181)

### Global Search Implementation
- Search indexing:
  - Precomputes a flat list of items with normalized keywords combining label, category, href basename, and configured keywords.
  - Prefixes hrefs based on deployment context.
- Live filtering:
  - Listens to input and focus events.
  - Filters the precomputed list and renders a dropdown with up to a fixed number of results.
  - Highlights matches in the title and updates the sidebar to show only matching categories/items.
- Keyboard support:
  - Enter selects the first match.
  - Escape clears the input and closes the dropdown.

Rendering and UX:
- Dropdown appended to the search wrapper with accessibility attributes.
- Results include title and metadata; selection navigates to the matched href.

**Section sources**
- [menu.js:107-164](file://js/menu.js#L107-L164)
- [menu.js:165-185](file://js/menu.js#L165-L185)
- [menu.js:187-221](file://js/menu.js#L187-L221)
- [menu.js:223-266](file://js/menu.js#L223-L266)
- [common.css:317-376](file://css/common.css#L317-L376)

### Workbench Integration and Tool Pages
- Tool pages include the navigation script and a panel element with a dataset indicating the tool key.
- The workbench initializes the panel, builds a base shell, and dispatches to a tool-specific initializer based on the key.
- Some tools are fully local; others may fall back to external resources if local scripts are missing.

Integration points:
- Tool pages embed the same navigation and styles.
- Workbench determines whether to initialize a local tool or render a fallback.

**Section sources**
- [chatgpt.html:15-25](file://tools_html/chatgpt.html#L15-L25)
- [ai_upscale.html:12-162](file://tools_html/ai_upscale.html#L12-L162)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)

### Responsive Design and Layout
- Left sidebar and top search use fixed positioning and percentage-based widths to adapt to viewport size.
- Tool-specific CSS often includes media queries to adjust layouts for smaller screens.
- Scrollbars and backdrop effects are styled consistently across components.

Layout anchors:
- Left menu positioned at the left edge with full height.
- Top search fixed near the top center.
- Panel content area occupies the remaining space.

**Section sources**
- [common.css:7-58](file://css/common.css#L7-L58)
- [common.css:317-376](file://css/common.css#L317-L376)
- [index.css:14-41](file://css/index.css#L14-L41)

### Singleton Pattern for Menu Management
- The menu system does not implement a traditional singleton class. Instead, it relies on a single global data array and a set of functions operating on the DOM.
- Initialization occurs once on DOMContentLoaded, ensuring the menu is injected and event listeners attached exactly once per page load.
- There is no explicit module export or private scope enforcing uniqueness; the pattern emerges from the single-use lifecycle and shared global state.

Implications:
- Easy to extend by adding new items to the global data array.
- No runtime instantiation or disposal concerns.

**Section sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [menu.js:268-272](file://js/menu.js#L268-L272)

### Event Handling Mechanisms
- DOMContentLoaded triggers initialization of menu injection, accordion, and search.
- Click events on the menu root toggle category state.
- Input/focus/keydown handlers manage search behavior and keyboard navigation.
- Document-level click handler hides the dropdown when clicking outside the search area.

Error resilience:
- Guard checks ensure functions return early if required DOM nodes are missing.

**Section sources**
- [menu.js:268-272](file://js/menu.js#L268-L272)
- [menu.js:80-103](file://js/menu.js#L80-L103)
- [menu.js:223-266](file://js/menu.js#L223-L266)

### User Interface Components
- Left sidebar: Grid-based layout with category tiles, icons, and collapsible submenus.
- Top search: Input field with dropdown results list and highlighted matches.
- Panel area: Dedicated content region for tool UI, managed by the workbench.

Accessibility and UX:
- Role attributes on search results and listbox semantics.
- Focus and hover states for interactive elements.
- Smooth transitions for open/close states.

**Section sources**
- [common.css:60-199](file://css/common.css#L60-L199)
- [common.css:317-376](file://css/common.css#L317-L376)
- [local_workbench.js:32-40](file://js/local_workbench.js#L32-L40)

### Configuration Options for Menu Items
- Categories: name, icon class.
- Items: label, href, keywords array.
- Keywords are concatenated with label, category, and href-derived tokens during indexing.

Extending the menu:
- Add a new category or item to the global data array.
- Provide localized label and optional keywords for discoverability.

**Section sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [menu.js:117-135](file://js/menu.js#L117-L135)

### Search Indexing and Matching
- Indexing combines label, category, href basename (underscore/dash converted to spaces), and keywords.
- Matching is performed against a normalized, trimmed, single-spaced string.
- Results are capped to a small number and rendered with highlighting.

Optimization note:
- Precomputation avoids repeated DOM traversal during search.
- Normalization reduces case sensitivity and whitespace issues.

**Section sources**
- [menu.js:108-110](file://js/menu.js#L108-L110)
- [menu.js:117-135](file://js/menu.js#L117-L135)
- [menu.js:240-244](file://js/menu.js#L240-L244)
- [menu.js:143-151](file://js/menu.js#L143-L151)

### User Preference Management
- The system does not persist user preferences (e.g., last opened category) in this component.
- Live2D widget integration demonstrates preference persistence via localStorage for model selection.

**Section sources**
- [waifu.js:8-9](file://js/waifu.js#L8-L9)

## Dependency Analysis
The navigation system depends on:
- Global menu data array for content.
- DOM APIs for injection and event handling.
- CSS for layout and visual states.
- Tool pages for embedding and workbench for content rendering.

```mermaid
graph LR
MJ["js/menu.js"] --> MD["MENU_DATA (global)"]
MJ --> DOM["DOM APIs"]
MJ --> CC["css/common.css"]
TH["tools_html/*.html"] --> MJ
TH --> LWB["js/local_workbench.js"]
IDX["index.html"] --> MJ
IDX --> WJ["js/waifu.js"]
```

**Diagram sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [common.css:7-58](file://css/common.css#L7-L58)
- [chatgpt.html:15-25](file://tools_html/chatgpt.html#L15-L25)
- [ai_upscale.html:12-162](file://tools_html/ai_upscale.html#L12-L162)
- [index.html:12-22](file://index.html#L12-L22)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)
- [waifu.js:3-17](file://js/waifu.js#L3-L17)

**Section sources**
- [menu.js:2-43](file://js/menu.js#L2-L43)
- [common.css:7-58](file://css/common.css#L7-L58)
- [chatgpt.html:15-25](file://tools_html/chatgpt.html#L15-L25)
- [ai_upscale.html:12-162](file://tools_html/ai_upscale.html#L12-L162)
- [index.html:12-22](file://index.html#L12-L22)
- [local_workbench.js:170-189](file://js/local_workbench.js#L170-L189)
- [waifu.js:3-17](file://js/waifu.js#L3-L17)

## Performance Considerations
- Search performance:
  - Precompute the search index once per page load to avoid repeated DOM scans.
  - Limit the number of displayed results to keep the dropdown lightweight.
  - Normalize and trim input to reduce matching overhead.
- DOM operations:
  - Batch class toggles and minimal reflows by updating only affected elements.
  - Avoid unnecessary repaints by toggling visibility and opacity rather than removing elements.
- CSS transitions:
  - Keep transition durations reasonable to prevent jank on slower devices.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Menu not appearing:
  - Ensure the left sidebar container exists and the script runs after DOMContentLoaded.
  - Verify the container selector matches the expected class.
- Search not filtering:
  - Confirm the search wrapper and input exist.
  - Check that keywords are present in items and that the data attribute is populated.
- Accordion not working:
  - Ensure the menu root element exists and the click handler is attached.
  - Verify that category items contain submenus when applicable.
- Tool UI not loading:
  - Confirm the panel element has the correct dataset and the workbench initializer is included.
  - Check for missing tool scripts and fallback behavior.

**Section sources**
- [menu.js:71-77](file://js/menu.js#L71-L77)
- [menu.js:223-227](file://js/menu.js#L223-L227)
- [menu.js:80-84](file://js/menu.js#L80-L84)
- [local_workbench.js:170-172](file://js/local_workbench.js#L170-L172)

## Conclusion
The navigation system is intentionally compact and focused: a single data source, straightforward rendering, and efficient search indexing. It integrates cleanly with tool pages through the workbench, enabling a consistent UI while allowing tools to manage their own content. By following the documented extension points and performance tips, teams can reliably add new tools and maintain responsiveness across devices.