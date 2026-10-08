import { request } from 'node:https';

import { AiError, AiGuard } from './ai_guard.mjs';

export function sendAiError(res, error) {
  if (res.destroyed || res.writableEnded) return;
  const status = error instanceof AiError ? error.status : 502;
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(JSON.stringify({error:{message:error instanceof AiError ? error.message : 'AI 服务暂不可用，请稍后重试'}}));
}

function readJson(req, signal, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = []; let total = 0;
    function clean() { req.off('data',onData); req.off('end',onEnd); req.off('error',onError); req.off('aborted',onAbort); signal.removeEventListener('abort',onAbort); }
    function fail(error) { clean(); req.resume(); reject(error); }
    function onData(part) { total += part.length; if (total > maxBytes) return fail(new AiError(413,'请求内容过大')); parts.push(part); }
    function onEnd() { clean(); try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(new AiError(400,'请求格式错误')); } }
    function onError() { fail(new AiError(400,'请求读取失败')); }
    function onAbort() { fail(new AiError(408,'请求已取消或超时')); }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return fail(new AiError(415,'请求需要 application/json'));
    if (Number(req.headers['content-length'] || 0) > maxBytes) return fail(new AiError(413,'请求内容过大'));
    if (signal.aborted) return onAbort();
    req.on('data',onData);req.on('end',onEnd);req.on('error',onError);req.on('aborted',onAbort);signal.addEventListener('abort',onAbort,{once:true});
  });
}

async function httpsTransport(url, options) {
  return new Promise((resolve,reject) => {
    const upstream=request(url,{method:options.method || 'POST',headers:options.headers,signal:options.signal,timeout:120000},res=>{
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024) {upstream.destroy(new Error('upstream response limit'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));
    });
    upstream.on('error',reject);upstream.on('timeout',()=>upstream.destroy(new Error('upstream timeout')));
    if(options.body) upstream.write(options.body);upstream.end();
  });
}

function chatPayload(body, providers) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AiError(400, '请求格式错误');
  const allowed=providers.flatMap(p=>p.models);
  const model=body.model || allowed[0];
  if(!allowed.includes(model)) throw new AiError(400,'请求模型不在可用列表');
  if(!Array.isArray(body.messages) || !body.messages.length || body.messages.length>40) throw new AiError(400,'请求 messages 需要 1–40 条文本消息');
  let chars=0;
  const messages=body.messages.map(m=>{
    if(!m || !['system','user','assistant'].includes(m.role) || typeof m.content!=='string') throw new AiError(400,'请求消息格式错误，仅支持文本消息');
    chars+=m.content.length;return {role:m.role,content:m.content};
  });
  if(chars>32000) throw new AiError(400,'请求文本最多 32000 字符');
  const temperature=body.temperature ?? 0.7, max_tokens=body.max_tokens ?? 2048;
  if(typeof temperature!=='number' || !Number.isFinite(temperature) || temperature<0 || temperature>2 || !Number.isInteger(max_tokens) || max_tokens<1 || max_tokens>2048) throw new AiError(400,'请求参数超出允许范围');
  return {model,messages,temperature,max_tokens,stream:false};
}

export function createAiHandler({keys, providers, transport=httpsTransport, limits={}, statePath, now, logger=console}) {
  const guard = new AiGuard({statePath, limits, now});
  let lastWarning = -Infinity;
  return async function handleAi(req,res) {
    const path=new URL(req.url,'http://localhost').pathname;
    const kind=path==='/api/chat'?'chat':path==='/api/image'?'image':path==='/api/video'?'video':path.startsWith('/api/video/status/')?'status':null;
    if(!kind) return false;
    const controller=new AbortController();
    const onClose=()=>{if(!res.writableEnded) controller.abort();};
    res.on('close',onClose);
    let client;
    let release = () => {};
    let releaseRequest = () => {};
    const timer=setTimeout(()=>controller.abort(),limits.timeoutMs || 120000);
    try {
      client = guard.clientKey(req);
      releaseRequest = guard.enterRequest(client, kind);
      if(req.method!==(kind==='status'?'GET':'POST')) throw new AiError(405,'请求方法不支持');
      let candidates, payload;
      if(kind==='chat') {
        payload=chatPayload(await readJson(req,controller.signal,limits.maxBodyBytes),providers);
        const selected=providers.find(p=>p.models.includes(payload.model));
        candidates=limits.allowFallback === true && selected.fallback === true ? [...selected.models.slice(selected.models.indexOf(payload.model)).map(model=>({provider:selected,model})),...providers.filter(p=>p!==selected && p.fallback === true).flatMap(provider=>provider.models.map(model=>({provider,model})))] : [{provider:selected,model:payload.model}];
      } else {
        if(kind==='status') {
          const id=path.slice('/api/video/status/'.length);
          if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AiError(400,'请求任务编号不合法');
          guard.checkTask(id,client);
          payload={id};
        } else {
          const body=await readJson(req,controller.signal,limits.maxBodyBytes);
          if(!body || typeof body.prompt!=='string' || !body.prompt.trim() || body.prompt.length>4000) throw new AiError(400,'请输入 1–4000 字符的描述文字');
          payload={prompt:body.prompt.trim(),model:kind==='image'?'cogview-3-flash':'cogvideox-flash'};
        }
        candidates=[{provider:{name:'zhipu',type:'openai',url:kind==='status'?'https://open.bigmodel.cn/api/paas/v4/async-result/'+payload.id:kind==='image'?'https://open.bigmodel.cn/api/paas/v4/images/generations':'https://open.bigmodel.cn/api/paas/v4/videos/generations'},model:payload.model}];
      }
      release = guard.enter(client, kind);
      for(const {provider,model} of candidates) {
        if(!keys[provider.name] || (provider.type==='cloudflare'&&!keys.cloudflare_account)) continue;
        const url=provider.url.replace('{account}',keys.cloudflare_account || '').replace('{model}',model);
        const data=kind==='chat' ? (provider.type==='cloudflare' ? {messages:payload.messages,temperature:payload.temperature,max_tokens:payload.max_tokens} : {...payload,model}) : payload;
        const body=kind==='status'?undefined:JSON.stringify(data);
        guard.reserve(client, kind);
        let upstream;
        try {
          upstream=await transport(url,{method:kind==='status'?'GET':'POST',body,signal:controller.signal,headers:{'Content-Type':'application/json','Content-Length':body ? Buffer.byteLength(body) : 0,Authorization:'Bearer '+keys[provider.name]}});
        } catch { if(controller.signal.aborted) throw new AiError(504,'AI 请求超时或已取消');continue; }
        if(upstream.status>=400) continue;
        let result;
        try { result=JSON.parse(upstream.body.toString()); } catch { continue; }
        if(provider.type==='cloudflare') {
          if(!result.success || !result.result) continue;
          result=result.result;
          if(typeof result.response === 'string') result={...result,choices:[{message:{role:'assistant',content:result.response}}]};
          if(result.choices?.[0]?.message) {const message=result.choices[0].message;result.choices[0].message={role:message.role || 'assistant',content:message.content || message.reasoning_content || message.reasoning || ''};}
        }
        if(kind==='chat' && (typeof result.choices?.[0]?.message?.content !== 'string' || !result.choices[0].message.content.trim())) continue;
        if(kind==='video') guard.registerTask(result.id,client);
        if(kind==='chat') {result._fallback=model!==payload.model;result._requested=payload.model;}
        if(res.destroyed || res.writableEnded) return true;
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));return true;
      }
      throw new AiError(502,'AI 服务暂不可用，请稍后重试');
    } catch(error) {
      if (error instanceof AiError && [429,503].includes(error.status) && guard.now()-lastWarning>=60000) {
        lastWarning=guard.now();
        logger.warn('[ai-guard] status='+error.status+' kind='+kind+' daily_attempts='+guard.state.attempts);
      }
      sendAiError(res,error);
    }
    finally {release();releaseRequest();clearTimeout(timer);res.off('close',onClose);}
    return true;
  };
}
