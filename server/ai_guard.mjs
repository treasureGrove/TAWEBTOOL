import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export class AiError extends Error {
  constructor(status, message, retryAfter) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

export class AiGuard {
  constructor({statePath = process.env.AI_GUARD_STATE_PATH || '/var/lib/ta-tools/ai-guard.json', limits = {}, now = Date.now} = {}) {
    this.statePath = statePath; this.now = now;
    const configured = process.env.AI_GLOBAL_DAILY_ATTEMPTS;
    this.limit = limits.globalDailyAttempts ?? (configured ? Number(configured) : 1000);
    if (!Number.isInteger(this.limit) || this.limit < 1) throw new Error('AI daily limit must be a positive integer');
    this.clientDailyLimit = limits.clientDailyAttempts ?? Number(process.env.AI_CLIENT_DAILY_ATTEMPTS || 100);
    if (!Number.isInteger(this.clientDailyLimit) || this.clientDailyLimit < 1) throw new Error('AI client daily limit must be positive');
    this.clientMinute = limits.clientMinuteRequests ?? Number(process.env.AI_CLIENT_MINUTE_REQUESTS || 15);
    this.statusMinute = limits.statusMinuteRequests ?? Number(process.env.AI_STATUS_MINUTE_REQUESTS || 30);
    this.windows = new Map();
    this.kindLimits = {};
    for (const [kind,fallback] of Object.entries({chat:300,image:50,video:10,status:800})) {
      const limit = limits[kind + 'DailyAttempts'] ?? Number(process.env['AI_' + kind.toUpperCase() + '_DAILY_ATTEMPTS'] || fallback);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('AI route daily limit must be positive');
      this.kindLimits[kind] = limit;
    }
    if (![this.clientMinute,this.statusMinute].every(n=>Number.isInteger(n) && n>0)) throw new Error('AI minute limits must be positive');
    this.maxConcurrent = limits.maxConcurrent ?? Number(process.env.AI_MAX_CONCURRENT || 4);
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) throw new Error('AI concurrency must be a positive integer');
    this.active = 0;
    this.healthy = true;
    this.state = {version: 1, date: this.day(), attempts: 0};
    try {
      if (existsSync(statePath)) {
        const data = readFileSync(statePath);
        if (data.length > 1024 * 1024) throw new Error('state size');
        const stored = JSON.parse(data.toString());
        if (stored.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(stored.date) || !Number.isInteger(stored.attempts) || stored.attempts < 0) throw new Error('invalid state');
        this.state = stored;
      }
      this.state.salt ??= randomBytes(16).toString('hex');
      this.state.clients ??= {};
      this.state.tasks ??= [];
      if (!Array.isArray(this.state.tasks) || this.state.tasks.length > 512 || this.state.tasks.some(t=>!t || !/^[A-Za-z0-9_-]{1,128}$/.test(t.id) || !/^[a-f0-9]{64}$/.test(t.owner) || !Number.isSafeInteger(t.createdAt) || !Number.isInteger(t.polls) || t.polls<0 || !Number.isSafeInteger(t.lastPoll))) throw new Error('invalid tasks');
      this.state.kinds ??= {chat:0,image:0,video:0,status:0};
      if (Object.keys(this.kindLimits).some(kind=>!Number.isSafeInteger(this.state.kinds[kind]) || this.state.kinds[kind]<0)) throw new Error('invalid route counters');
      if (!/^[a-f0-9]{32}$/.test(this.state.salt) || !this.state.clients || Array.isArray(this.state.clients) || Object.keys(this.state.clients).length > 2048 || Object.entries(this.state.clients).some(([key,n]) => !/^[a-f0-9]{64}$/.test(key) || !Number.isSafeInteger(n) || n < 0)) throw new Error('invalid clients');
    } catch { this.healthy = false; }
  }
  sweep() {
    const epoch = Math.floor(this.now() / 60000);
    for (const [key,value] of this.windows) if (value.epoch !== epoch) this.windows.delete(key);
    return epoch;
  }
  // 廉价请求级宽限：覆盖所有请求（含被拒绝的无效请求），避免无效流量打垮进程；
  // 它不代替分钟额度，真正的额度只在 reserve() 里按上游尝试次数扣减。
  enterRequest(client, kind) {
    if (!this.healthy) throw new AiError(503, 'AI 额度状态暂不可用，请稍后重试');
    const epoch = this.sweep();
    const route = kind === 'status' ? 'status' : 'generate';
    const limit = (kind === 'status' ? this.statusMinute : this.clientMinute) * 4;
    const key = client + ':http:' + route;
    if (!this.windows.has(key) && this.windows.size >= 4096) throw new AiError(429, 'AI 公共服务繁忙，请稍后重试', 60);
    const current = this.windows.get(key) || {epoch: epoch, count: 0};
    if (current.count >= limit) throw new AiError(429, '请求过于频繁，请稍后重试', Math.max(1,60 - Math.floor((this.now()%60000)/1000)));
    current.count++; this.windows.set(key, current);
    return () => {};
  }
  // 并发槽位：只有确定要向上游发起工作才需要
  enter(client, kind) {
    if (!this.healthy) throw new AiError(503, 'AI 额度状态暂不可用，请稍后重试');
    this.sweep();
    if (this.active >= this.maxConcurrent) throw new AiError(429, 'AI 公共服务繁忙，请稍后重试', 5);
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; } };
  }
  day() { return new Date(this.now()).toISOString().slice(0, 10); }
  clientKey(req) {
    if (!this.healthy || typeof this.state.salt !== 'string') throw new AiError(503, 'AI 额度状态暂不可用，请稍后重试');
    const socket = req.socket.remoteAddress || 'unknown';
    const forwarded = req.headers['x-real-ip'];
    const trusted = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket);
    const ip = trusted && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : socket;
    return createHash('sha256').update(this.state.salt + ':' + ip).digest('hex');
  }
  registerTask(id, owner) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AiError(502, '视频任务暂不可用');
    this.state.tasks = this.state.tasks.filter(t=>this.now()-t.createdAt<86400000);
    if (this.state.tasks.some(t=>t.id===id && t.owner!==owner)) throw new AiError(502, '视频任务暂不可用');
    this.state.tasks = this.state.tasks.filter(t=>t.id!==id);
    if (this.state.tasks.length >= 512) throw new AiError(503, '视频任务服务繁忙');
    this.state.tasks.push({id, owner, createdAt:this.now(), polls:0, lastPoll:0});
    this.persist();
  }
  checkTask(id, owner) {
    const task=this.state.tasks.find(t=>t.id===id && t.owner===owner && this.now()-t.createdAt<86400000);
    if (!task) throw new AiError(403, '该视频任务不存在或当前网络无权查询');
    if (task.polls >= 300) throw new AiError(429, '该视频任务查询次数已达上限', 3600);
    if (task.lastPoll && this.now()-task.lastPoll<3000) throw new AiError(429, '请稍后查询视频进度', 3);
    task.polls++; task.lastPoll=this.now();
    this.persist();
  }
  reserve(client, kind) {
    if (!this.healthy) throw new AiError(503, 'AI 额度状态暂不可用，请稍后重试');
    if (this.state.date !== this.day()) this.state = {version: 1, date: this.day(), attempts: 0, salt: this.state.salt, clients: {}, kinds: {chat:0,image:0,video:0,status:0}, tasks: this.state.tasks};
    if ((this.state.clients[client] || 0) >= this.clientDailyLimit) throw new AiError(429, '今日个人 AI 额度已用完，请明日再试', 3600);
    if (!Object.hasOwn(this.state.clients, client) && Object.keys(this.state.clients).length >= 2048) throw new AiError(429, 'AI 公共服务繁忙，请稍后重试', 60);
    if (this.state.attempts >= this.limit) {
      throw new AiError(429, '今日 AI 公共额度已用完，请明日再试', Math.max(1, Math.ceil((Date.parse(this.day() + 'T00:00:00Z') + 86400000 - this.now()) / 1000)));
    }
    if (this.state.kinds[kind] >= this.kindLimits[kind]) throw new AiError(429, '今日该 AI 工具公共额度已用完，请明日再试', 3600);
    const route = kind === 'status' ? 'status' : 'generate';
    const minuteLimit = kind === 'status' ? this.statusMinute : this.clientMinute;
    const epoch = this.sweep();
    const minuteKey = client + ':min:' + route;
    const seen = this.windows.get(minuteKey);
    const minuteCount = seen && seen.epoch === epoch ? seen.count : 0;
    if (minuteCount >= minuteLimit) throw new AiError(429, 'AI 请求过于频繁，请稍后重试', Math.max(1,60 - Math.floor((this.now()%60000)/1000)));
    this.windows.set(minuteKey, {epoch, count: minuteCount + 1});
    this.state.kinds[kind]++;
    this.state.attempts++;
    this.state.clients[client] = (this.state.clients[client] || 0) + 1;
    this.persist();
  }
  persist() {
    try {
      mkdirSync(dirname(this.statePath), {recursive: true, mode: 0o700});
      const temp = this.statePath + '.' + process.pid + '.pending';
      writeFileSync(temp, JSON.stringify(this.state), {mode: 0o600});
      renameSync(temp, this.statePath);
    } catch {
      this.healthy = false;
      throw new AiError(503, 'AI 额度状态暂不可用，请稍后重试');
    }
  }
}
