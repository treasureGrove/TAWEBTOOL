export function publicDiscussions(payload) {
  if (!Array.isArray(payload?.data)) return [];
  return payload.data
    .flatMap((item) => {
      if (item?.type !== "discussions" || !/^\d{1,15}$/.test(item.id))
        return [];
      const attributes = item.attributes;
      if (typeof attributes?.title !== "string" || !attributes.title.trim())
        return [];
      const updated = new Date(attributes.lastPostedAt || attributes.createdAt);
      const count = Number(attributes.commentCount);
      return [
        {
          title: attributes.title.trim().slice(0, 200),
          href: `https://lolicode.com/d/${item.id}`,
          updated: Number.isFinite(updated.getTime())
            ? updated.toISOString()
            : null,
          replies: Number.isSafeInteger(count) ? Math.max(0, count - 1) : 0,
        },
      ];
    })
    .slice(0, 3);
}

async function showDiscussions(list, status) {
  status.textContent = "正在读取公开话题…";
  const profile = document.querySelector(
    'meta[name="lolicode-download-profile"]',
  )?.content;
  const endpoint = `${profile === "home" ? "" : "https://lolicode.com"}/api/discussions?sort=-lastPostedAt&page%5Blimit%5D=3`;
  try {
    const response = await fetch(endpoint, {
      credentials: "omit",
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Community temporarily unavailable");
    const discussions = publicDiscussions(await response.json());
    if (!discussions.length) {
      status.textContent = "还没有公开话题，欢迎来分享你的第一个作品。";
      return;
    }
    const fragment = document.createDocumentFragment();
    const dateFormat = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
    });
    for (const discussion of discussions) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const title = document.createElement("span");
      const meta = document.createElement("span");
      link.href = discussion.href;
      title.className = "discussion-title";
      title.textContent = discussion.title;
      meta.className = "discussion-meta";
      meta.textContent = `${discussion.updated ? `${dateFormat.format(new Date(discussion.updated))} · ` : ""}${discussion.replies} 条回复`;
      link.append(title, meta);
      item.append(link);
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    status.hidden = true;
  } catch {
    status.textContent = "暂时读不到最新话题，可以直接进入社区看看。";
  }
}

if (typeof document !== "undefined") {
  const list = document.querySelector("[data-community-feed]");
  const status = document.querySelector("[data-community-status]");
  if (list && status) void showDiscussions(list, status);
}
