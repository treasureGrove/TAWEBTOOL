#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES_FILE = path.join(ROOT, 'data/feedback/entries.json');
const NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL || process.env.WIKI_NOTIFY_EMAIL || '1324236706@qq.com';
const LOG_DIR = path.join(ROOT, 'logs');

function loadEntries() {
  try {
    const list = JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  } catch {
    return String(iso || '');
  }
}

function main() {
  const entries = loadEntries();
  const pending = entries.filter((e) => !e.emailed);

  if (!pending.length) {
    console.log('[feedback-digest] no new feedback, skip');
    return;
  }

  const lines = [
    '网站反馈周报',
    '生成时间：' + fmt(new Date().toISOString()),
    '',
    `本次共有 ${pending.length} 条新反馈，详情如下：`,
    ''
  ];

  pending.forEach((e, i) => {
    lines.push('========== 反馈 ' + (i + 1) + ' ==========');
    lines.push('提交时间：' + fmt(e.createdAt));
    lines.push('邮箱：' + (e.email || ''));
    if (e.qq) lines.push('QQ：' + e.qq);
    if (e.wechat) lines.push('微信：' + e.wechat);
    if (e.type) lines.push('类型：' + e.type);
    if (e.page) lines.push('来源页面：' + e.page);
    lines.push('图片：' + (e.images && e.images.length ? e.images.length + ' 张（见附件）' : '无'));
    lines.push('');
    lines.push('反馈内容：');
    lines.push(e.message || '');
    lines.push('');
  });

  const body = lines.join('\n');

  const attachments = [];
  for (const e of pending) {
    for (const img of e.images || []) {
      const p = path.join(ROOT, img);
      if (fs.existsSync(p)) attachments.push(p);
    }
  }

  const subject = '网站反馈周报 ' + new Date().toISOString().slice(0, 10);
  const args = ['-s', subject];
  for (const a of attachments) args.push('-a', a);
  args.push(NOTIFY_EMAIL);

  execFileSync('mail', args, { input: body, stdio: ['pipe', 'inherit', 'inherit'] });

  const updated = entries.map((e) => (e.emailed ? e : { ...e, emailed: true }));
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(updated, null, 2) + '\n');

  console.log(`[feedback-digest] sent ${pending.length} feedback to ${NOTIFY_EMAIL}, attachments: ${attachments.length}`);
}

try {
  main();
} catch (err) {
  console.error('[feedback-digest] ' + (err.stack || err.message));
  process.exit(1);
}
