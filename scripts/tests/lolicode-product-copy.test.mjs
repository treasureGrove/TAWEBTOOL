import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = (await readFile(new URL('../../lolicode/index.html', import.meta.url), 'utf8')).replace(/\s+/g, ' ');
const current = html.match(/<span class="detail-label">现在就能用<\/span>([\s\S]*?)<\/article>/)?.[1];
const planned = html.match(/<article class="roadmap-note">([\s\S]*?)<\/article>/)?.[1];

test('basic local memory is available with user control; advanced memory stays a roadmap item', () => {
  assert.match(current, /记忆保存在本机，默认写入前询问/);
  assert.match(current, /查看、编辑、删除或关闭/);
  assert.match(planned, /更深入的记忆与语音交互/);
  assert.doesNotMatch(planned, /以及记忆、语音/);
});

test('workflows and optional CLI skills describe the released boundary', () => {
  assert.match(current, /带参数的工作流，查看执行历史、随时停止/);
  assert.match(current, /在 Windows 上，也能让任务等到电脑闲下来/);
  assert.match(current, /八类 CLI 技能按需添加/);
  assert.match(html, /macOS 与 Linux 版本仍在准备中/);
});

test('external app configuration and recorded usage do not promise complete billing', () => {
  assert.match(html, /一键应用到 WorkBuddy、DeepSeek Harness、ZCode 与 MiMo/);
  assert.match(html, /本地 Agent 的用量记录；缺失的费用保持未知/);
  assert.doesNotMatch(html, /所有应用的完整账单|全部费用实时同步/);
});
