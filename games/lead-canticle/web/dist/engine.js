import {TOOLS,DAYS} from './data.js';
export const RULES={width:4,height:3,daily:18,rent:75,start:70};
export class Game{
 constructor(){this.day=0;this.phase='prep';this.money=RULES.start;this.health=100;this.guest=0;this.actions=3;this.bag=[];this.proofs=[];this.damaged=false;this.aid=0;this.war=0;this.archive=0;this.public=false;this.credit=0;this.refunds=0;this.journal=[];this.daily=[];this.uid=0;this.ending=null;this.equip('lens');this.equip('scale');this.equip('geiger');}
 get current(){const c=structuredClone(DAYS[this.day].guests[Math.min(this.guest,2)]);if(c.id==='manual'&&this.aid>0)c.quote='萨宾让我谢谢你，滤芯用上了。她昨天少烧了一锅脏水。\n这次我带来医书下卷。上半本教她认出病人，下半本教她把人留下。';if(c.id==='seeds'&&this.war>=2)c.quote='镇口加了哨卡。他们说，检查是为了让路更通畅。\n今天没人把药送过来。这罐种子，你还收吗？';return c;}
 has(id){return this.bag.some(e=>e.type==='tool'&&e.id===id);}
 at(x,y,except=-1){return this.bag.find(e=>e.uid!==except&&x>=e.x&&x<e.x+e.w&&y>=e.y&&y<e.y+e.h);}
 fits(x,y,w,h,except=-1){if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||x+w>4||y+h>3)return false;for(let iy=y;iy<y+h;iy++)for(let ix=x;ix<x+w;ix++)if(this.at(ix,iy,except))return false;return true;}
 space(w,h){for(let y=0;y<3;y++)for(let x=0;x<4;x++)if(this.fits(x,y,w,h))return{x,y,w,h};return null;}
 equip(id){if(this.phase!=='prep')throw Error('开门后工具柜上锁，明早才能换装。');if(!TOOLS[id])throw Error('没有这件工具。');if(this.has(id)){this.bag=this.bag.filter(e=>!(e.id===id&&e.type==='tool'));return;}let[w,h]=TOOLS[id].size;let p=this.space(w,h)||this.space(h,w);if(!p)throw Error('工具放不下了。先移动或卸下一件工具。');this.bag.push({uid:++this.uid,type:'tool',id,name:TOOLS[id].name,model:TOOLS[id].model,...p});}
 move(uid,x,y,rotate=false){const e=this.bag.find(e=>e.uid===uid);if(!e)throw Error('先选择一件物品。');const[w,h]=rotate?[e.h,e.w]:[e.w,e.h];if(!this.fits(x,y,w,h,uid))throw Error('这里放不下。换一块空位，或旋转试试。');Object.assign(e,{x,y,w,h});}
 open(){if(this.phase!=='prep')throw Error('今天已经开门了。');this.phase='trade';this.guest=0;this.proofs=[];this.actions=3;this.damaged=false;this.daily=[];}
 inspect(id){if(this.phase!=='trade'||!this.has(id))throw Error('今天没有携带这件工具。');if(this.proofs.includes(id))return this.current.clues[id];if(this.actions<=0)throw Error('客人不愿再等。请根据现有证据决定。');if(id==='acid'){if(this.money<2)throw Error('试剂耗材需要 2 铁币。');this.money-=2;this.damaged=true;}this.actions--;this.proofs.push(id);return this.current.clues[id];}
 buy(){if(this.phase!=='trade')throw Error('目前没有待收购的物品。');const c=this.current;if(this.money<c.ask)throw Error('现金不够。可以拒收，今晚出售库存。');const[w,h]=c.size;const p=this.space(w,h)||this.space(h,w);if(!p)throw Error('货物放不下了。工具不能临时卸下；整理背包，或放弃这笔生意。');this.bag.push({...c,...p,uid:++this.uid,type:'goods',proofs:[...this.proofs],damaged:this.damaged});this.money-=c.ask;this.daily.push(`收购「${c.name}」 −${c.ask} 币。`);this.next();}
 reject(){if(this.phase!=='trade')throw Error('目前没有来客。');this.daily.push(`拒收「${this.current.name}」。客人重新包好东西。`);this.next();}
 next(){this.guest++;this.proofs=[];this.actions=3;this.damaged=false;if(this.guest===3)this.phase='market';}
 routes(e){if(e?.type!=='goods')return[];const a=['caravan','abbey','recycle'];if(['medical','dual'].includes(e.kind))a.unshift('clinic');if(['dual','core'].includes(e.kind))a.unshift('militia');if(e.kind==='core'&&e.proofs.includes('lens')&&e.proofs.includes('geiger'))a.unshift('public');return a;}
 quote(e,route,cert='unverified'){if(route==='public')return 0;if(route==='recycle')return e.scrap+(e.hazard&&e.proofs.includes('geiger')?8:0);let base=cert==='genuine'?e.value:e.scrap;const m=route==='clinic'?.7:route==='militia'?1.65:route==='abbey'?(['relic','core'].includes(e.kind)||e.id==='manual'?1.25:.85):1;return Math.max(1,Math.floor(base*m*(e.damaged?.8:1))+Math.min(3,Math.max(-2,this.credit)));}
 sell(uid,route,cert='unverified'){if(this.phase!=='market')throw Error('夜間买家尚未到场。');const e=this.bag.find(e=>e.uid===uid&&e.type==='goods');if(!e||!this.routes(e).includes(route))throw Error('这位买家不收此类物品。');if(!['genuine','unverified'].includes(cert))throw Error('请选择签署方式。');const income=this.quote(e,route,cert);this.money+=income;let consequence='',safe=true;if(!['recycle','public'].includes(route)){if(cert==='genuine'&&!e.real){this.refunds+=income+6;this.credit-=2;safe=false;}if(e.hazard){this.refunds+=10;this.health-=12;safe=false;}if(safe&&cert==='genuine')this.credit++;}
 if(route==='clinic'&&safe&&cert==='genuine'){this.aid++;consequence='萨宾收下了物资。今晚，诊所的灯会多亮一会儿。';}
 if(route==='abbey'&&(['relic','core'].includes(e.kind)||e.id==='manual')){this.archive++;consequence='入藏编号已盖章。「借阅」一栏留着空白。';}
 if(route==='militia'){this.war+=2;consequence='用途栏盖着「和平」。镇口又会多一盏探照灯。';}
 if(route==='public'){this.public=true;consequence='你公开了铅匣的检验记录，也公开了自己当年签的伪证。奥狄克把通往空城的路牌刮掉了。';}
 if(route==='recycle')consequence='物品装进了密封回收箱。这一次，没有人会抱着它睡觉。';
 const entry={name:e.name,income,route,cert,consequence};this.daily.push(`交付「${e.name}」 +${income} 币。${consequence}`);this.bag=this.bag.filter(a=>a.uid!==uid);return entry;}
 settle(){if(this.phase!=='market')throw Error('今天的账已结清。');const held=this.bag.filter(e=>e.type==='goods'&&e.hazard).length;this.health=Math.max(0,this.health-held*20);const rent=this.day===2?RULES.rent:0;const cost=RULES.daily+rent+this.refunds;this.money-=cost;this.summary={living:RULES.daily,rent,refunds:this.refunds,exposure:held*20,balance:this.money};this.daily.push(`食宿 −${RULES.daily}，租金 −${rent}，售后 −${this.refunds}。`);if(held)this.daily.push(`未处置的污染货物留在住处，身体 −${held*20}。`);this.journal.push({day:this.day+1,entries:[...this.daily]});this.refunds=0;if(this.money<0||this.health<=0||this.day===2){this.phase='ending';this.ending=this.resolve();}else this.phase='report';}
 tomorrow(){if(this.phase!=='report')throw Error('今天还没有结束。');this.day++;this.phase='prep';this.guest=0;this.proofs=[];this.actions=3;}
 resolve(){if(this.health<=0)return'ill';if(this.money<0)return'debt';if(this.war>=4)return'war';if(this.public&&this.aid>=2)return'light';if(this.archive>=2)return'archive';if(this.money>=90)return'road';return'candle';}
 save(){return JSON.stringify({version:1,state:{...this}});}
 static load(text){try{const d=JSON.parse(text);const s=d.state;if(d.version!==1||!s||!Number.isInteger(s.day)||s.day<0||s.day>2||!['prep','trade','market','report','ending'].includes(s.phase)||!Array.isArray(s.bag)||!Array.isArray(s.proofs)||!Number.isFinite(s.money))return null;const g=new Game();Object.assign(g,s);if(g.bag.some(e=>!Number.isInteger(e.uid)||!['tool','goods'].includes(e.type)||!g.fits(e.x,e.y,e.w,e.h,e.uid)))return null;return g;}catch{return null;}}
}
export const ENDINGS={
 light:['灯留给活人','修院撤回了你的鉴定资格。萨宾把收到的物资留在了诊所。\n\n奥狄克刮掉了错误的撤离坐标。今天，没有人再往那座空城走。\n\n这不是永久和平的保证。只是一次来得及的止损。'],
 war:['和平采购','砖窑的广播接上了你经手的零件。它宣布：为了避免冲突，所有人必须站到同一边。\n\n两边的哨卡都加了灯。次日没有人来当铺。钱还在抽屉里。'],
 debt:['抵押人','格罗兹把柜台记成抵押物。职业一栏填的是：前鉴定师。\n\n萨宾给你留了一张床。今晚不用鉴定真假，只需要把碗洗干净。'],
 archive:['入藏，暂不外借','地窖里添了几件东西。院长说，你为后世做了贡献。\n\n诊所来借书。答复是：为后世保存，请后世再来。'],
 road:['没有登记的路','你付清房租，还攒下了离开的路费。薇拉没有问钱从哪里来。\n\n车驶过诊所时，你把眼睛移向另一边。那一边也是镇子。'],
 candle:['明日照常收当','最后一笔支出写在纸背。余款足够买一根蜡烛。\n\n门口的「收当」掉了一笔，看起来像「收人」。你准备明天补。\n\n天黑了，先点灯。'],
 ill:['没有来客','你最后检查的是自己的手。\n\n柜台上的仪表还在响，今天没有人把它关掉。']
};
