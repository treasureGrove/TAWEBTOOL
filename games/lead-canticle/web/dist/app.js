import {Game,RULES,ENDINGS} from './engine.js';
import {TOOLS,DAYS,ROUTES} from './data.js';
import {ShopWorld} from './world.js';

const $=id=>document.getElementById(id),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAVE='lead-canticle-web-v1';
let game=new Game(),selected=null,cert=null,route=null,world=null,sound=false,audio=null,drag=null,toastTimer;
try{game=Game.load(localStorage.getItem(SAVE))||game;}catch{}
const modal=$('modal');
const icon=type=>world?`<img src="${world.thumbnail(type)}" alt="" draggable="false">`:'';
const selectedItem=()=>game.bag.find(e=>e.uid===selected);
function notify(message){$('status-message').textContent=message;$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function persist(){try{localStorage.setItem(SAVE,game.save());$('save-status').textContent='本机自动保存';}catch{$('save-status').textContent='无法保存 · 本局仍可继续';}}
function tone(type='click'){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const now=audio.currentTime;const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(type==='coin'?890:type==='stamp'?180:430,now);o.frequency.exponentialRampToValueAtTime(type==='coin'?1400:90,now+.09);g.gain.setValueAtTime(.035,now);g.gain.exponentialRampToValueAtTime(.0001,now+.14);o.connect(g);g.connect(audio.destination);o.start();o.stop(now+.16);}catch{}}
function act(fn,message,type='click'){try{fn();tone(type);persist();render();if(message)notify(typeof message==='function'?message():message);}catch(e){notify(e.message);}}
function choose(uid){if(selected!==uid){selected=uid;cert=null;route=null;}renderBag();renderAction();if(game.phase==='market')renderEvidence();}
function marketSelection(){if(game.phase==='market'&&selectedItem()?.type!=='goods'){selected=game.bag.find(e=>e.type==='goods')?.uid??null;cert=null;route=null;}}

function render(){
 marketSelection();const d=DAYS[game.day];$('day-label').textContent=['第一日','第二日','第三日'][game.day];$('phase-label').textContent={prep:'开门前',trade:'营业中',market:'夜间出货',report:'夜间手记',ending:'尾声'}[game.phase];$('date-label').textContent=d.date;$('money').textContent=String(game.money).padStart(2,'0');$('health-label').textContent=`身体 ${game.health}`;$('rent-label').textContent=game.day===2?'今晚缴租 75 ¢':`${3-game.day} 夜后缴租 75 ¢`;
 $('record-number').textContent=String(game.day*3+Math.min(game.guest,2)+1).padStart(3,'0');$('cabinet-state').textContent=game.phase==='prep'?'点击装卸':'营业锁定';
 renderLeft();renderEvidence();renderRack();renderBag();renderDialogue();renderAction();
 $('object-controls').hidden=game.phase!=='trade';world?.setState(game.phase,game.current.model,game.guest);
}
function renderLeft(){
 const d=DAYS[game.day],trade=game.phase==='trade',c=game.current;
 $('left-eyebrow').textContent=trade?'待鉴定物品':'今日告示';$('visitor-count').textContent=trade?`来客 ${game.guest+1} / 3`:'LEAD CREEK';$('item-title').textContent=trade?c.name:d.title;
 if(trade){
  $('item-meta').innerHTML=`<div class="meta">卖家要价 <span class="price">${c.ask} ¢</span><span class="dimension">${c.size.join(' × ')} 格</span></div><div class="inline-hint">同类真品行情 ${Math.floor(c.value*.8)}—${Math.ceil(c.value*1.2)} ¢</div>`;
  $('left-body').innerHTML=`<div class="action-label"><span>检查工具</span><span class="action-dots" aria-label="剩余 ${game.actions} 次检查">${'●'.repeat(game.actions)}${'○'.repeat(3-game.actions)}</span></div>`+Object.entries(TOOLS).map(([id,t])=>{const done=game.proofs.includes(id),has=game.has(id);return`<button class="inspect-button ${done?'done':''}" data-action="inspect" data-id="${id}" ${!has||done||game.actions===0?'disabled':''} title="${esc(t.hint)}">${icon(t.model)}<span>${t.name}</span><small>${done?'已记录':has?'检查':'未携带'}</small></button>`;}).join('')+'<p class="inline-hint">每人最多检查 3 次，阅读不限时。</p>';
  $('left-foot').innerHTML='铜币通常重 12—18 克。<br>背景读数约 0.10—0.20。';
 }else{
  $('item-meta').innerHTML='<div class="meta">'+esc(d.date)+'</div>';
  $('left-body').innerHTML=`<p class="bodytext">${esc(d.news)}</p>`;
  $('left-foot').textContent=d.note;
 }
}
function renderEvidence(){
 const el=$('evidence-list');$('evidence-title').textContent=game.phase==='trade'?'证据不替你签字。':game.phase==='market'?'货物去了哪里？':'今天的账，要算清。';
 if(game.phase==='trade'){
  el.innerHTML=game.proofs.length?game.proofs.map(id=>`<article class="evidence"><h3>0${game.proofs.indexOf(id)+1} / ${TOOLS[id].name}</h3><p>${esc(game.current.clues[id])}</p></article>`).join(''):`<div class="empty-evidence">尚未检验。<br><br>从左侧选择一件随身工具。<br><br>名录能证明有人登记过，不能证明登记是对的。</div>`;
 }else if(game.phase==='market'){
  const e=selectedItem();el.innerHTML=e?.type==='goods'?`<div class="receipt-note">${esc(e.name)}<br>进价 ${e.ask} ¢ · ${e.proofs.length} 条证据</div><div class="rule"></div>`+(e.proofs.length?e.proofs.map(id=>`<article class="evidence"><h3>${TOOLS[id].name}</h3><p>${esc(e.clues[id])}</p></article>`).join(''):'<div class="empty-evidence">这件商品没有留下检查记录。你仍然要决定，愿不愿意替它签字。</div>'):`<div class="empty-evidence">选择背包里的商品，复核证据，再给它一个去处。<br><br>高价也有高价的用途。</div>`;
 }else{
  el.innerHTML=`<div class="receipt-note"><div class="paper-stat"><span>食宿 / 每夜</span><strong>18 ¢</strong></div><div class="paper-stat"><span>租金 / 第三夜</span><strong>75 ¢</strong></div><div class="paper-stat"><span>目前现金</span><strong>${game.money} ¢</strong></div><div class="handwritten">余款，是明天的选择。</div><p>带齐工具要占 8 格。<br>一只银杯就要 4 格。<br><br>留在住处的污染品，每夜损伤 20 点身体。</p></div>`;
 }
}
function renderRack(){
 $('tool-rack').innerHTML=Object.entries(TOOLS).map(([id,t])=>`<button class="tool-card ${game.has(id)?'equipped':''}" data-action="equip" data-id="${id}" ${game.phase!=='prep'?'disabled':''} title="${esc(t.name+'：'+t.hint)}" aria-label="${game.has(id)?'卸下':'装入'}${t.name}，占${t.size[0]*t.size[1]}格">${icon(t.model)}<span class="space-size">${t.size[0]*t.size[1]}</span><span class="tool-name">${t.name}</span></button>`).join('');
 $('rack-hint').textContent=game.phase==='prep'?'开门后不能卸下，给商品留点空。':'工具柜已上锁 · 明早重新配置';
}
function renderBag(){
 $('bag-used').textContent=String(game.bag.reduce((a,e)=>a+e.w*e.h,0)).padStart(2,'0');
 let html='';for(let y=0;y<3;y++)for(let x=0;x<4;x++)html+=`<button class="bag-cell" data-action="cell" data-x="${x}" data-y="${y}" style="left:${x*56}px;top:${y*52}px" aria-label="第${y+1}行第${x+1}列空位">${String(y*4+x+1).padStart(2,'0')}</button>`;
 html+=game.bag.map(e=>`<button class="bag-item ${e.type} ${selected===e.uid?'selected':''}" data-action="select" data-uid="${e.uid}" style="left:${e.x*56}px;top:${e.y*52}px;width:${e.w*56-4}px;height:${e.h*52-4}px" title="${esc(e.name)} · ${e.w}×${e.h}" aria-label="${esc(e.name)}，占 ${e.w} 乘 ${e.h} 格，点选或拖动">${icon(e.model)}<span class="bag-name">${esc(e.name.length>4&&e.w===1?e.name.slice(0,3):e.name)}</span></button>`).join('');
 $('bag').innerHTML=html;$('rotate-btn').disabled=!selectedItem();
}
function renderDialogue(){
 if(game.phase==='trade'){$('guest-name').textContent=game.current.guest;$('guest-role').textContent=game.current.role;$('dialogue-text').textContent=game.current.quote;}
 else if(game.phase==='prep'){$('guest-name').textContent='提奥 · 鉴定师';$('guest-role').textContent='开门前';$('dialogue-text').textContent=game.day===0?'工具装进包里，就不能临时拿出来。\n今天，你愿意相信哪一部分证据？':game.day===1?'昨天没带的工具，今天还会不会需要？\n包里的空位，也是一种本钱。':'今晚交租。老墨已经在门外等着。\n有些东西不是很贵，只是代价很高。';}
 else{$('guest-name').textContent='晚间收购处';$('guest-role').textContent='灯还亮着';$('dialogue-text').textContent='东西归谁，就会变成谁想要的样子。\n签下名字前，再看一眼证据。';}
}
function renderAction(){
 const p=$('action-panel'),e=selectedItem();
 if(game.phase==='prep'){
  p.innerHTML=`<div class="action-kicker">开门准备 / ${game.day+1}</div><h2>工具带得齐，货就装不多。</h2><p class="description">${e?.type==='tool'?esc(TOOLS[e.id].hint):'在左侧工具柜选择装备。工具和商品共用这 12 格背包。'}<br>今天有 3 位来客，开门后不能卸下工具。</p><div class="action-row"><button class="btn primary" data-action="open">翻牌 · 开门营业</button><button class="btn ghost" data-action="help">第一次来？</button></div>`;return;
 }
 if(game.phase==='trade'){
  const c=game.current,pst=game.space(...c.size)||game.space(...[...c.size].reverse());
  p.innerHTML=`<div class="action-kicker">收购决定 / 本单 ${c.size[0]*c.size[1]} 格</div><h2>${pst?'看过证据，再谈生意。':'空位不连续，这件货放不下。'}</h2><p class="description">收购后，今晚选择是否签发真品证明，以及卖给谁。<br>${game.damaged?'酸滴已损伤物品，出货价降低 20%。':'不确定可以拒收。离开的货物不会再回来。'}</p><div class="action-row"><button class="btn primary" data-action="buy">收下物品 · −${c.ask} ¢</button><button class="btn ghost" data-action="reject">拒收 · 下一位</button></div>`;return;
 }
 if(game.phase==='report'||game.phase==='ending'){
  p.innerHTML=`<div class="action-kicker">今日已打烊</div><h2>账本写到了最后一行。</h2><div class="action-row"><button class="btn primary" data-action="night">${game.phase==='ending'?'读完这份手记':'查看今日结算'}</button></div>`;return;
 }
 const goods=game.bag.filter(a=>a.type==='goods');
 if(!goods.length){p.innerHTML='<div class="action-kicker">夜间出货 / 库存已清</div><h2>柜台空了，账还没有。</h2><p class="description">今晚食宿 18 币。'+(game.day===2?'另需缴纳房租 75 币。':'明早可以重新选择工具。')+'</p><div class="action-row"><button class="btn primary" data-action="settle">熄灯 · 结算</button><button class="btn ghost" data-action="journal">看看账本</button></div>';return;}
 if(!e||e.type!=='goods'){p.innerHTML='<div class="action-kicker">夜间出货</div><h2>点选背包里的商品。</h2><p class="description">先复核右边的检查记录，再选择签署方式和买家。<br>工具不出售，可以明早卸下。</p><div class="action-row"><button class="btn ghost" data-action="settle">留货 · 结算</button></div>';return;}
 const routes=game.routes(e);if(route&&!routes.includes(route))route=null;
 p.innerHTML=`<div class="inline-selection"><h2>${esc(e.name)}</h2><button class="btn ghost small" data-action="settle">留货 / 结算</button></div><div class="selected-meta">进价 ${e.ask} ¢ · ${e.proofs.length} 条检查记录${e.damaged?' · 已受酸损':''}</div><div class="cert-row"><button class="cert-choice ${cert==='genuine'?'active':''}" data-action="cert" data-cert="genuine" aria-pressed="${cert==='genuine'}">签为真品</button><button class="cert-choice ${cert==='unverified'?'active':''}" data-action="cert" data-cert="unverified" aria-pressed="${cert==='unverified'}">不作认证 · 按残料</button></div><div class="route-list">${routes.map(r=>`<button class="route ${route===r?'active':''} ${r==='public'?'special':''}" data-action="route" data-route="${r}" title="${esc(ROUTES[r].hint)}" aria-pressed="${route===r}"><span>${ROUTES[r].name}</span><b>${cert||['public','recycle'].includes(r)?'+'+game.quote(e,r,cert||'unverified'):'—'}</b></button>`).join('')}</div><div class="sell-footer"><p>${route?esc(ROUTES[route].hint):'先选是否认证，再选买家。伪证会被追缴退款。'}</p><button class="btn primary small" data-action="sell" ${route&&(cert||['public','recycle'].includes(route))?'':'disabled'}>${route==='public'?'公布并回收':route==='recycle'?'密封交付':'签字交付'}</button></div>`;
}

function showModal(html){$('modal-content').innerHTML=html;if(!modal.open)modal.showModal();}
function help(){showModal(`<div class="modal-kicker">柜台工作须知</div><h2>你的眼力，需要占几个格子？</h2><div class="rules"><div class="rule-item"><b>01</b>开门前装工具。带齐占 8 格，只剩 4 格收货。背包可以拖放，点选后按 R 旋转。</div><div class="rule-item"><b>02</b>每位来客检查最多 3 次。右边留下真实读数与痕迹；文字可以慢慢看。名录也可能出错。</div><div class="rule-item"><b>03</b>收购会付钱、占格。晚间再签真品证明或按残料交付，随后选择买家。伪证须退款，另赔 6 币。</div><div class="rule-item"><b>04</b>诊所出价低，民兵买军民两用零件时出高价。最后由钱和货物去向决定尾声。</div></div><p class="night-note">共三天、九位来客，预计 10—20 分钟。每晚食宿 18 币，第三晚租金 75 币。酸滴花 2 币并折价；污染品留宿每件损伤 20 点身体。</p><div class="modal-actions"><button class="btn primary" data-action="close">明白了</button><button class="btn ghost" data-action="restart-confirm">重新开始</button></div>`);}
function journal(){showModal(`<div class="modal-kicker">桥墩三号 / 柜台留存</div><h2>提奥的账本</h2><p>现金 ${game.money} ¢ · 身体 ${game.health}<br>诊所物资 ${game.aid} 件 · 修院入藏 ${game.archive} 件</p><div class="ledger">${game.journal.map(d=>`<h3>第 ${d.day} 日</h3>${d.entries.map(t=>`<p>${esc(t)}</p>`).join('')}`).join('')}${game.daily.length?'<h3>今天 / 尚未归档</h3>'+game.daily.map(t=>`<p>${esc(t)}</p>`).join(''):''}${!game.journal.length&&!game.daily.length?'<p>账本还是空的。先开门。</p>':''}</div><div class="modal-actions"><button class="btn primary" data-action="close">回到柜台</button><button class="btn ghost" data-action="restart-confirm">重新开始</button></div>`);}
function night(){
 if(game.phase==='ending'){
  const[title,text]=ENDINGS[game.ending];showModal(`<div class="modal-kicker">铅口 / 第 ${game.day+1} 夜 / 尾声</div><h2>${title}</h2><p>${esc(text)}</p><div class="ending-number"><small>账本最后一行</small>${game.money} <span style="font-size:24px">¢</span></div><p class="night-note">诊所收到 ${game.aid} 件物资，修院入藏 ${game.archive} 件，民兵扩建 ${game.war/2} 处。</p>${game.summary?`<div class="ledger"><p>最后一夜：食宿 −${game.summary.living} · 租金 −${game.summary.rent} · 售后 −${game.summary.refunds}</p></div>`:''}<div class="modal-actions"><button class="btn primary" data-action="restart-confirm">换一种选择再试</button><button class="btn ghost" data-action="journal">查看完整账本</button></div>`);return;
 }
 const s=game.summary;if(!s)return;
 showModal(`<div class="modal-kicker">第 ${game.day+1} 日 / 已打烊</div><h2>灯熄之前，把账算清。</h2><div class="summary-grid"><div class="summary-cell"><span>食宿与灯油</span><b>−${s.living} ¢</b></div><div class="summary-cell"><span>退货 / 处置费</span><b>−${s.refunds} ¢</b></div><div class="summary-cell"><span>身体变化</span><b>${s.exposure?'−'+s.exposure:'无新增损伤'}</b></div><div class="summary-cell"><span>现金结余</span><b>${s.balance} ¢</b></div></div>${s.refunds?'<p class="night-note">买家退回了伪证或污染品的账单。鉴定书上留的是你的名字。</p>':''}<div class="ledger">${game.daily.map(t=>`<p>${esc(t)}</p>`).join('')}</div><div class="modal-actions"><button class="btn primary" data-action="tomorrow">合上账本 · 迎接明天</button></div>`);
}
function settle(){const goods=game.bag.filter(e=>e.type==='goods');if(goods.length){showModal(`<div class="modal-kicker">打烊之前</div><h2>还有 ${goods.length} 件商品没出手。</h2><p>它们会留在背包，占用明天的空位。污染品每件损伤 20 点身体。<br><br>今晚仍需支付 ${RULES.daily+(game.day===2?RULES.rent:0)} 铁币。</p><div class="modal-actions"><button class="btn primary" data-action="close">回去安排出货</button><button class="btn ghost" data-action="settle-now">留着 · 直接结算</button></div>`);}else finishNight();}
function finishNight(){act(()=>game.settle(),null,'stamp');night();}
function restartConfirm(){showModal('<div class="modal-kicker">新的三天</div><h2>重新打开这扇窗口？</h2><p>这会替换本机当前的这份手记，回到第一天。</p><div class="modal-actions"><button class="btn primary" data-action="restart">开始新的一局</button><button class="btn ghost" data-action="close">保留这份手记</button></div>');}
function rotate(){const e=selectedItem();if(e)act(()=>game.move(e.uid,e.x,e.y,true),'已旋转。');else notify('先点选一件背包物品。');}

document.addEventListener('click',ev=>{
 const b=ev.target.closest('button');if(!b||b.disabled)return;const a=b.dataset.action;
 if(a==='equip')act(()=>game.equip(b.dataset.id),'已调整工具。留意连续空位。');
 else if(a==='inspect')act(()=>game.inspect(b.dataset.id),`${TOOLS[b.dataset.id].name}：记录已写入右侧手记。`);
 else if(a==='open')act(()=>game.open(),'来客到了。先检查，再决定要不要收下。','stamp');
 else if(a==='buy')act(()=>{game.buy();selected=null;cert=null;route=null;},'收购已入账，商品放入背包。','coin');
 else if(a==='reject')act(()=>{game.reject();},'客人重新包好东西。你留下了钱，也放弃了这件货。');
 else if(a==='select'&&ev.detail===0)choose(Number(b.dataset.uid));
 else if(a==='cell'&&selected!==null&&!drag)act(()=>game.move(selected,Number(b.dataset.x),Number(b.dataset.y)),'已移动。');
 else if(a==='cert'){cert=b.dataset.cert;renderAction();tone();}
 else if(a==='route'){route=b.dataset.route;renderAction();tone();}
 else if(a==='sell'){const r=route;act(()=>{const result=game.sell(selected,r,cert||'unverified');selected=null;cert=null;route=null;notify(result.consequence||`交付完成，收到 ${result.income} 铁币。`);},null,'coin');renderEvidence();}
 else if(a==='settle')settle();else if(a==='settle-now')finishNight();else if(a==='night')night();
 else if(a==='tomorrow'){modal.close();act(()=>{game.tomorrow();selected=null;cert=null;route=null;},'新的一天。工具柜已解锁。');}
 else if(a==='close')modal.close();else if(a==='help')help();else if(a==='journal')journal();else if(a==='restart-confirm')restartConfirm();
 else if(a==='restart'){game=new Game();selected=null;cert=null;route=null;modal.close();persist();render();notify('新的一份手记。先选择今天的工具。');}
});
$('help-btn').onclick=help;$('journal-btn').onclick=journal;$('account-btn').onclick=journal;$('modal-close').onclick=()=>modal.close();$('rotate-btn').onclick=rotate;
$('turn-left').onclick=()=>world?.turn(-.45);$('turn-right').onclick=()=>world?.turn(.45);
$('sound-btn').onclick=()=>{sound=!sound;$('sound-btn').style.color=sound?'#e6cf93':'';$('sound-btn').setAttribute('aria-label',sound?'关闭声音':'开启声音');$('sound-btn').title=sound?'关闭声音':'开启声音';tone('coin');};
document.addEventListener('keydown',ev=>{if(modal.open||ev.ctrlKey||ev.metaKey||['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName))return;if(ev.key.toLowerCase()==='r'){ev.preventDefault();rotate();}else if(ev.key==='ArrowLeft')world?.turn(-.25);else if(ev.key==='ArrowRight')world?.turn(.25);});
const bag=$('bag');
bag.addEventListener('pointerdown',e=>{const b=e.target.closest('.bag-item');if(!b||e.button!==0)return;const uid=Number(b.dataset.uid),item=game.bag.find(a=>a.uid===uid),r=bag.getBoundingClientRect();drag={uid,id:e.pointerId,startX:e.clientX,startY:e.clientY,dx:Math.floor((e.clientX-r.left)/56)-item.x,dy:Math.floor((e.clientY-r.top)/52)-item.y,moved:false};bag.setPointerCapture(e.pointerId);choose(uid);});
bag.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6&&!drag.moved)return;drag.moved=true;const rect=bag.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/56)-drag.dx,y=Math.floor((e.clientY-rect.top)/52)-drag.dy,item=game.bag.find(a=>a.uid===drag.uid),ok=game.fits(x,y,item.w,item.h,item.uid);bag.querySelector(`[data-uid="${drag.uid}"]`)?.classList.add('dragging');bag.querySelectorAll('.bag-cell').forEach(c=>{c.classList.remove('drop-valid','drop-invalid');const cx=Number(c.dataset.x),cy=Number(c.dataset.y);if(cx>=x&&cx<x+item.w&&cy>=y&&cy<y+item.h)c.classList.add(ok?'drop-valid':'drop-invalid');});});
bag.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;if(d.moved){const rect=bag.getBoundingClientRect();act(()=>game.move(d.uid,Math.floor((e.clientX-rect.left)/56)-d.dx,Math.floor((e.clientY-rect.top)/52)-d.dy),'已移动。');}else{renderBag();renderAction();if(game.phase==='market')renderEvidence();}if(bag.hasPointerCapture(e.pointerId))bag.releasePointerCapture(e.pointerId);});
bag.addEventListener('pointercancel',()=>{drag=null;renderBag();});

// 启动失败时保留明确提示，避免把无 3D 的空页面当成游戏。
try{world=new ShopWorld($('world'));$('render-status').classList.add('ready');}catch(error){console.error(error);$('render-status').textContent='3D 未能启动。请使用支持 WebGL 2 的浏览器，并开启硬件加速。';}
render();if(game.phase==='report'||game.phase==='ending')night();

// 小型 WebMCP 表面；与按钮共用状态操作，不暴露尚未检验的真伪。
const safeState=()=>({day:game.day+1,phase:game.phase,money:game.money,health:game.health,actions:game.actions,bag:game.bag.map(({uid,name,type,x,y,w,h,proofs})=>({uid,name,type,x,y,w,h,proofs})),guest:game.phase==='trade'?{name:game.current.guest,item:game.current.name,ask:game.current.ask,evidence:Object.fromEntries(game.proofs.map(id=>[TOOLS[id].name,game.current.clues[id]]))}:null});
const modelContext=document.modelContext;
if(modelContext?.registerTool){
 const lifecycle=new AbortController();
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=tool=>{try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_counter',title:'读取鉴定柜台',description:'Read the appraisal counter, visible evidence, money and inventory without revealing unchecked item facts.',annotations:{readOnlyHint:true,untrustedContentHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>safeState()});
 register({name:'inspect_relic',title:'检查遗物',description:'Use one already packed tool to inspect the current relic; spends one of the three available inspections.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{tool:{type:'string',enum:Object.keys(TOOLS)}},required:['tool'],additionalProperties:false},execute:async input=>{if(!input||!TOOLS[input.tool])return{error:'请选择现有的鉴定工具。'};try{const evidence=game.inspect(input.tool);persist();render();return{evidence,actions:game.actions};}catch(e){return{error:e.message};}}});
}
