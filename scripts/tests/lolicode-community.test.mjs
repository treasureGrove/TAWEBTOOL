import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../../lolicode/assets/home-20261120-community.js", import.meta.url),
  "utf8",
);
const { publicDiscussions } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const topic = (id, attributes = {}) => ({
  type: "discussions",
  id,
  attributes: {
    title: "社区作品",
    createdAt: "2026-11-20T04:00:00Z",
    commentCount: 3,
    ...attributes,
  },
});

test("public topics use only canonical numeric discussion links and safe metadata", () => {
  assert.deepEqual(
    publicDiscussions({
      data: [
        topic("64", {
          title: " <img src=x onerror=alert(1)> ",
          slug: "https://evil.example",
          lastPostedAt: "invalid",
          commentCount: -4,
        }),
      ],
    }),
    [
      {
        title: "<img src=x onerror=alert(1)>",
        href: "https://lolicode.com/d/64",
        updated: null,
        replies: 0,
      },
    ],
  );
  assert.deepEqual(publicDiscussions({ data: [topic("62")] }), [
    {
      title: "社区作品",
      href: "https://lolicode.com/d/62",
      updated: "2026-11-20T04:00:00.000Z",
      replies: 2,
    },
  ]);
});

test("malformed topics are discarded and the public preview is limited to three", () => {
  for (const payload of [null, {}, { data: null }, { data: {} }])
    assert.deepEqual(publicDiscussions(payload), []);
  const data = [
    null,
    topic("../admin"),
    topic("1?token=x"),
    topic("2", { title: " " }),
    { type: "users", id: "3" },
    ...[4, 5, 6, 7].map((id) => topic(String(id))),
  ];
  assert.deepEqual(
    publicDiscussions({ data }).map((item) => item.href),
    [4, 5, 6].map((id) => `https://lolicode.com/d/${id}`),
  );
});

async function render({
  payload = { data: [topic("64", { title: "<script>bad()</script>" })] },
  reject = false,
  profile = "home",
} = {}) {
  const element = () => ({
    children: [],
    append(...children) {
      this.children.push(...children);
    },
  });
  const list = {
    replaceChildren(fragment) {
      this.children = fragment.children;
    },
  };
  const status = { hidden: false };
  let request;
  let done;
  const finished = new Promise((resolve) => {
    done = resolve;
  });
  const context = {
    document: {
      querySelector: (selector) =>
        selector === "[data-community-feed]"
          ? list
          : selector === "[data-community-status]"
            ? status
            : { content: profile },
      createElement: element,
      createDocumentFragment: element,
    },
    AbortSignal,
    Intl,
    fetch: async (url, options) => {
      request = { url, options };
      if (reject) throw new Error("offline");
      return { ok: true, json: async () => payload };
    },
    done,
  };
  vm.runInNewContext(
    source
      .replace("export function", "function")
      .replace(
        "void showDiscussions(list, status);",
        "void showDiscussions(list, status).finally(done);",
      ),
    context,
  );
  await finished;
  return { list, status, request };
}

test("homepage fetch is anonymous and untrusted titles are rendered as text", async () => {
  const { list, status, request } = await render();
  assert.equal(request.options.credentials, "omit");
  assert.match(request.url, /^\/api\/discussions\?/);
  assert.equal(status.hidden, true);
  const link = list.children[0].children[0];
  assert.equal(link.href, "https://lolicode.com/d/64");
  assert.equal(link.children[0].textContent, "<script>bad()</script>");
  assert.equal(link.children[0].innerHTML, undefined);
});

test("tools mirror reads only the official public API", async () => {
  const { request } = await render({ profile: "tools" });
  assert.match(request.url, /^https:\/\/lolicode\.com\/api\/discussions\?/);
  assert.equal(request.options.credentials, "omit");
});

test("offline and empty community feeds leave a useful visible fallback", async () => {
  for (const options of [{ reject: true }, { payload: { data: [] } }]) {
    const { status } = await render(options);
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /社区|分享/);
  }
});
