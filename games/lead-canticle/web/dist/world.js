import * as T from './vendor/three.module.js';

// 完整的实时 3D 场景。金属、玻璃、灯光与阴影正常渲染，无像素化后处理。
const materials=new Map();
function mat(color,metalness=.15,roughness=.65){const key=`${color}/${metalness}/${roughness}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness,roughness}));return materials.get(key);}
const paint=mat('#45615a',.45,.68),dark=mat('#242b29',.55,.62),brass=mat('#af8950',.72,.36),steel=mat('#adb3a8',.85,.3),rubber=mat('#242624',.02,.94),paper=mat('#c7bfa5',.02,.91),leather=mat('#674a32',.05,.9);
function mesh(parent,geo,material,x=0,y=0,z=0){const o=new T.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(p,w,h,d,m,x=0,y=0,z=0){return mesh(p,new T.BoxGeometry(w,h,d),m,x,y,z);}
function cyl(p,r,h,m,x=0,y=0,z=0,r2=r,segments=32){return mesh(p,new T.CylinderGeometry(r2,r,h,segments),m,x,y,z);}
function sphere(p,r,m,x=0,y=0,z=0,sx=1,sy=1,sz=1){const o=mesh(p,new T.SphereGeometry(r,32,20),m,x,y,z);o.scale.set(sx,sy,sz);return o;}
function torus(p,r,t,m,x=0,y=0,z=0){return mesh(p,new T.TorusGeometry(r,t,12,48),m,x,y,z);}
function rod(p,a,b,r,m){const mid=new T.Vector3().addVectors(a,b).multiplyScalar(.5);const o=cyl(p,r,a.distanceTo(b),m,mid.x,mid.y,mid.z);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
function wire(p,points,r,m){return mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a))),28,r,8,false),m);}
function textTexture(text,{bg='#d2c7a5',fg='#343d32',width=512,height=256,size=40,align='center'}={}){const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,width,height);x.fillStyle=fg;x.textAlign=align;x.textBaseline='middle';x.font=`600 ${size}px "Microsoft YaHei",sans-serif`;const lines=text.split('\n');lines.forEach((l,i)=>x.fillText(l,align==='center'?width/2:26,height/2+(i-(lines.length-1)/2)*size*1.65));const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;}
function plate(p,text,w,h,x,y,z,opt={}){const texture=textTexture(text,opt);const m=new T.MeshStandardMaterial({map:texture,roughness:.8,metalness:.08});return mesh(p,new T.PlaneGeometry(w,h),m,x,y,z);}
function lathe(p,pts,m,x=0,y=0,z=0){return mesh(p,new T.LatheGeometry(pts.map(a=>new T.Vector2(...a)),48),m,x,y,z);}
function screw(p,x,y,z){const o=cyl(p,.025,.018,steel,x,y,z,undefined,12);o.rotation.x=Math.PI/2;box(p,.024,.004,.008,dark,x,y,z+.012);}
function mark(p,text,w,h,x,y,z){return plate(p,text,w,h,x,y,z,{size:36,bg:'#b9ae89',fg:'#3c463d'});}

export function makeModel(type){
 const p=new T.Group();
 switch(type){
 case'lens':{const r=torus(p,.23,.028,brass,0,.25,0);const glass=new T.MeshPhysicalMaterial({color:'#c5e6dc',roughness:.08,metalness:.02,transparent:true,opacity:.24,side:T.DoubleSide});mesh(p,new T.CircleGeometry(.21,48),glass,0,.25,0);rod(p,new T.Vector3(0,.02,0),new T.Vector3(.12,-.33,0),.035,leather);cyl(p,.046,.035,brass,.12,-.33,0);r.rotation.y=.14;break;}
 case'scale':{box(p,.6,.055,.28,brass,0,.025,0);cyl(p,.035,.62,brass,0,.34,0);sphere(p,.065,brass,0,.69,0);rod(p,new T.Vector3(-.4,.65,0),new T.Vector3(.4,.65,0),.018,brass);for(const x of[-.34,.34]){for(const z of[-.095,.095])rod(p,new T.Vector3(x,.65,0),new T.Vector3(x,.3,z),.007,brass);lathe(p,[[0,0],[.1,0],[.15,.035],[.145,.04],[.09,.012],[0,.012]],brass,x,.27,0);}break;}
 case'geiger':{box(p,.42,.58,.22,paint,0,.29,0);box(p,.36,.24,.015,rubber,0,.43,.12);plate(p,'0.12\nµSv / h',.32,.2,0,.43,.133,{bg:'#c4cbae',fg:'#3d4c38',size:36});for(const x of[-.12,.12]){const o=cyl(p,.045,.027,dark,x,.16,.135);o.rotation.x=Math.PI/2;}wire(p,[[.2,.5,0],[.37,.6,0],[.42,.3,0],[.33,.02,0]],.012,rubber);cyl(p,.04,.39,dark,.3,.21,0);mark(p,'RAD • 37',.3,.06,0,.04,.115);break;}
 case'acid':{lathe(p,[[0,0],[.09,0],[.105,.03],[.105,.23],[.055,.28],[.035,.33],[.035,.38],[0,.38]],new T.MeshStandardMaterial({color:'#567d65',metalness:.16,roughness:.24}),0,0,0);cyl(p,.049,.07,rubber,0,.39,0);mark(p,'ACID\n02',.145,.13,0,.15,.107);break;}
 case'book':{box(p,.45,.085,.58,paper,0,.065,0);box(p,.49,.025,.61,leather,0,.015,0);box(p,.49,.025,.61,leather,0,.12,0);box(p,.035,.12,.61,leather,-.24,.065,0);for(const z of[-.22,.22])box(p,.48,.003,.018,brass,0,.135,z);const cover=plate(p,'修院藏书\nMEMORIA',.32,.34,0,.135,0,{bg:'#634a33',fg:'#cbb384',size:40});cover.rotation.x=-Math.PI/2;break;}
 case'coin':{const o=cyl(p,.26,.045,brass,0,.275,0,undefined,32);o.rotation.x=Math.PI/2;torus(p,.229,.011,brass,0,.275,.026);const face=plate(p,'VII\n旧世之证',.29,.27,0,.275,.026,{bg:'#9a763a',fg:'#dac694',size:50});for(let i=0;i<24;i++){const a=i/24*Math.PI*2;box(p,.014,.025,.055,brass,Math.cos(a)*.255,.275+Math.sin(a)*.255,0).rotation.z=a;}break;}
 case'filter':{cyl(p,.16,.61,paint,0,.34,0);for(const y of[.07,.16,.51,.6])cyl(p,.178,.035,steel,0,y,0);cyl(p,.075,.12,steel,0,.69,0);cyl(p,.045,.08,dark,0,.78,0);mark(p,'H₂O\nFILTER 04',.22,.26,0,.33,.162);break;}
 case'chalice':{lathe(p,[[0,0],[.24,0],[.25,.025],[.2,.05],[.045,.09],[.04,.34],[.09,.4],[.16,.45],[.23,.6],[.245,.74],[.23,.755],[.215,.62],[.15,.49],[.06,.43],[.035,.36],[0,.35]],steel);torus(p,.238,.014,brass,0,.748,0).rotation.x=Math.PI/2;for(const y of[.1,.34])cyl(p,.06,.025,brass,0,y,0);break;}
 case'dial':{const b=cyl(p,.25,.12,dark,0,.29,0);b.rotation.x=Math.PI/2;const f=cyl(p,.22,.006,mat('#b2b98a',.1,.8),0,.29,.064);f.rotation.x=Math.PI/2;torus(p,.237,.022,steel,0,.29,.068);for(let i=0;i<12;i++){const a=i/12*6.283;box(p,.012,.043,.005,dark,Math.sin(a)*.18,.29+Math.cos(a)*.18,.071).rotation.z=-a;}rod(p,new T.Vector3(0,.29,.079),new T.Vector3(.07,.41,.079),.009,dark);sphere(p,.026,brass,0,.29,.08);break;}
 case'relay':{box(p,.6,.065,.4,dark,0,.033,0);box(p,.35,.32,.29,mat('#a8946d',.4,.5),0,.22,0);for(let i=0;i<8;i++){const t=torus(p,.095,.012,brass,-.085+i*.024,.23,.01);t.rotation.y=Math.PI/2;}for(const x of[-.24,.24]){cyl(p,.035,.12,steel,x,.13,0);screw(p,x,.065,.2);}mark(p,'LOW VOLTAGE',.25,.09,0,.29,.151);break;}
 case'coil':{cyl(p,.2,.36,dark,0,.2,0);for(let i=0;i<15;i++)torus(p,.205,.012,mat('#a7653d',.8,.32),0,.04+i*.023,0).rotation.x=Math.PI/2;for(const y of[.015,.4])cyl(p,.26,.035,dark,0,y,0);wire(p,[[.17,.39,0],[.32,.44,0],[.39,.17,.09]],.013,brass);break;}
 case'seeds':{cyl(p,.19,.41,mat('#8c9570',.3,.6),0,.22,0);for(const y of[.025,.435])cyl(p,.2,.035,steel,0,y,0);mark(p,'SALT SEEDS\n发芽率 40%',.28,.24,0,.24,.193);break;}
 case'leadbox':{box(p,.6,.36,.42,mat('#747d75',.65,.6),0,.19,0);box(p,.63,.055,.44,steel,0,.395,0);for(const x of[-.22,.22]){box(p,.035,.39,.43,brass,x,.2,0);screw(p,x,.36,.223);screw(p,x,.055,.223);}mark(p,'〇\nMEMORIA',.23,.22,0,.24,.215);box(p,.12,.09,.024,mat('#925039',.1,.95),0,.075,.23);wire(p,[[-.15,.43,-.02],[-.15,.54,-.02],[.15,.54,-.02],[.15,.43,-.02]],.018,dark);break;}
 default:box(p,.3,.3,.3,brass,0,.15,0);
 }
 return p;
}

function makeVisitor(){
 const p=new T.Group();const cloth=mat('#77634b',.02,.95),skin=mat('#bd9677',.01,.85),seam=mat('#ab936d',.08,.85);
 const torso=mesh(p,new T.CapsuleGeometry(.32,.47,12,32),cloth,0,1.43,0);torso.scale.set(1.22,1,.63);
 // 肩部、肘部、手和衣服接缝让人物形成完整的半身轮廓。
 for(const side of[-1,1]){sphere(p,.2,cloth,side*.39,1.7,0,1,.9,.95);rod(p,new T.Vector3(side*.41,1.63,0),new T.Vector3(side*.52,1.2,.26),.13,cloth);rod(p,new T.Vector3(side*.52,1.2,.26),new T.Vector3(side*.4,1.24,.59),.1,cloth);sphere(p,.105,leather,side*.4,1.25,.63,1.05,.65,1.4);wire(p,[[side*.15,1.79,.16],[side*.18,1.64,.22],[side*.21,1.3,.205]],.006,seam);box(p,.15,.15,.025,leather,side*.24,1.47,.225);}
 cyl(p,.102,.23,skin,0,1.96,0);
 const head=sphere(p,.245,skin,0,2.22,0, .79,1.2,.81);
 sphere(p,.16,skin,0,2.105,.035, .9,.76,.9);
 for(const side of[-1,1]){sphere(p,.046,skin,side*.19,2.21,0,.48,1,.65);sphere(p,.041,dark,side*.078,2.25,.177,1.12,.39,.3);sphere(p,.021,mat('#ded5b7'),side*.078,2.25,.187,1,.36,.2);sphere(p,.014,dark,side*.078,2.25,.194,.48,.7,.2);rod(p,new T.Vector3(side*.042,2.285,.17),new T.Vector3(side*.119,2.28,.167),.012,leather);}
 sphere(p,.056,skin,0,2.19,.176,.47,1.0,.95);
 rod(p,new T.Vector3(-.057,2.107,.161),new T.Vector3(.057,2.105,.161),.006,leather);
 sphere(p,.245,mat('#454c3d',.1,.88),0,2.43,-.018,.89,.52,.88);
 const brim=cyl(p,.25,.024,mat('#454c3d'),0,2.435,.074);brim.scale.z=1.25;
 box(p,.12,.045,.014,brass,0,2.467,.194);
 const scarf=torus(p,.135,.046,mat('#493e33',.01,1),0,1.94,.01);scarf.rotation.x=Math.PI/2;box(p,.13,.31,.04,leather,.075,1.77,.23).rotation.z=.12;
 for(let i=0;i<4;i++)sphere(p,.017,brass,-.038,1.38+i*.115,.227);
 p.userData.cloth=cloth;p.userData.head=head;
 return p;
}

export class ShopWorld{
 constructor(canvas,onReady){
 this.canvas=canvas;this.scene=new T.Scene();this.scene.background=new T.Color('#393b32');this.scene.fog=new T.FogExp2('#343a31',.024);
 this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;this.renderer.outputColorSpace=T.SRGBColorSpace;
 this.camera=new T.PerspectiveCamera(42,1,.1,40);this.camera.position.set(0,2.68,5.1);this.camera.lookAt(0,1.52,-1.25);this.targetRotation=0;this.zoom=false;this.pointer=new T.Vector2();this.last=0;this.clock=0;
 this.scene.add(new T.HemisphereLight('#d9d8bb','#292e26',1.4));
 const sun=new T.DirectionalLight('#ffe0aa',3.1);sun.position.set(-3,6,2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-5,near:.1,far:20});sun.shadow.bias=-.0005;sun.shadow.normalBias=.02;this.scene.add(sun);
 const fill=new T.PointLight('#93bdb1',12,7,2);fill.position.set(2.1,2.3,.2);this.scene.add(fill);
 this.buildRoom();this.visitor=makeVisitor();this.visitor.position.set(.3,0,-1.91);this.scene.add(this.visitor);
 this.display=new T.Group();this.display.position.set(-.2,1.205,.9);this.scene.add(this.display);this.showItem('chalice');
 this.scene.add(new T.AmbientLight('#b6a080',.2));
 this.resize=()=>{const r=canvas.getBoundingClientRect();this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();};this.resize();this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);
 canvas.addEventListener('pointermove',e=>{if(e.buttons===1){this.targetRotation+=e.movementX*.018;}this.pointer.set((e.offsetX/canvas.clientWidth-.5)*2,(e.offsetY/canvas.clientHeight-.5)*2);});canvas.addEventListener('pointerdown',e=>canvas.setPointerCapture(e.pointerId));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.last=performance.now();});
 this.renderer.setAnimationLoop(t=>this.frame(t));onReady?.();
 }
 buildRoom(){const p=this.scene;
 const wall=mat('#58645a',.18,.92),trim=mat('#7b7862',.5,.7),rust=mat('#634d38',.52,.8);
 box(p,16,.14,14,mat('#424239'),0,-.1,-2);
 box(p,4,4.8,.3,wall,-3.9,2,-2.45);box(p,4,4.8,.3,wall,3.9,2,-2.45);box(p,4,1.2,.3,wall,0,3.92,-2.45);
 for(const x of[-1.97,1.97]){box(p,.18,2.55,.28,dark,x,2.06,-2.18);box(p,.07,2.55,.08,brass,x,2.06,-1.98);for(let y=1;y<3.4;y+=.37)screw(p,x,y,-1.927);}
 box(p,4.1,.17,.28,dark,0,3.33,-2.18);box(p,4.1,.055,.08,brass,0,3.25,-1.98);
 box(p,4.3,.19,1.02,trim,0,1.01,-1.91);box(p,4,.97,.15,dark,0,.48,-2.06);
 // 窗外是修院的阶梯、廊柱与沙尘，柜台是唯一的活动空间。
 const stone=mat('#777365',.05,.95);box(p,11,4.5,.5,stone,0,2.1,-7.3);for(let i=0;i<11;i++)box(p,1.7,.16,.45,stone,1.55,.18+i*.17,-3.4-i*.3);
 for(const x of[-3.5,-2.2,3.5]){cyl(p,.21,4,stone,x,1.9,-6.6);box(p,.58,.12,.6,trim,x,3.85,-6.6);}
 for(let i=0;i<5;i++)box(p,.05,2.1,.07,dark,-1.6+i*.42,1.4,-4.6);box(p,2.1,.06,.07,dark,-.76,2.45,-4.6);
 box(p,9,.19,3.5,mat('#605b46',.25,.73),0,1.08,.4);box(p,9,.1,.11,brass,0,1.04,2.17);box(p,9,.9,.15,paint,0,.52,2.05);
 const matTop=box(p,2,.025,1.18,mat('#344b43',.1,.96),-.2,1.19,.78);
 for(const x of[-1.16,.76])box(p,.015,.002,1.08,mat('#7c8b70'),x,1.204,.78);for(const z of[.23,1.33])box(p,1.92,.002,.012,mat('#7c8b70'),-.2,1.204,z);
 // 终端、机械键盘与付款槽。
 box(p,1.05,.72,.65,paint,-2.08,1.62,-.26);box(p,.9,.52,.06,dark,-2.08,1.67,.092);
 const tex=textTexture('RELIC EXCHANGE\n37 — ONLINE\n鉴定 / 收购 / 典当',{bg:'#162a23',fg:'#b8d890',size:35});const screenMat=new T.MeshStandardMaterial({map:tex,emissive:'#7fab68',emissiveMap:tex,emissiveIntensity:.75,roughness:.35});mesh(p,new T.PlaneGeometry(.76,.4),screenMat,-2.08,1.69,.127);
 box(p,1.1,.15,.56,paint,-2.08,1.25,.15);for(let row=0;row<3;row++)for(let i=0;i<8;i++)box(p,.085,.035,.07,mat('#b6af93',.12,.63),-2.46+i*.108,1.34,.02+row*.12);
 box(p,.52,.04,.1,rubber,-2.02,1.35,.4);for(const x of[-2.53,-1.63])screw(p,x,1.4,.094);
 box(p,.62,.32,.48,mat('#948970',.55,.55),-2.22,1.33,1.1);box(p,.4,.026,.025,rubber,-2.22,1.4,1.35);plate(p,'PAYMENT',.4,.075,-2.22,1.51,1.348,{bg:'#948970',fg:'#393e31',size:36});
 // 烟色收音机与刻度旋钮。
 box(p,1.01,.53,.5,leather,2.15,1.44,.48);box(p,.94,.44,.024,dark,2.15,1.45,.746);for(let i=0;i<11;i++)box(p,.025,.33,.019,brass,1.79+i*.033,1.45,.767);
 for(const y of[1.32,1.58]){const k=cyl(p,.067,.038,steel,2.47,y,.786);k.rotation.x=Math.PI/2;box(p,.012,.055,.008,dark,2.47,y,.812);}
 plate(p,'AM  740  FM',.29,.07,2.22,1.58,.767,{bg:'#b4ab86',fg:'#313b2c',size:29});rod(p,new T.Vector3(2.56,1.72,.36),new T.Vector3(2.89,2.59,.38),.008,steel);
 // 台灯用真实聚光灯照亮台上的商品。
 cyl(p,.24,.06,dark,-1.28,1.24,.65);rod(p,new T.Vector3(-1.28,1.27,.65),new T.Vector3(-1.38,1.85,.35),.026,brass);rod(p,new T.Vector3(-1.38,1.85,.35),new T.Vector3(-.92,2.25,.36),.025,brass);sphere(p,.06,dark,-1.38,1.85,.35);const shade=cyl(p,.28,.25,paint,-.92,2.17,.36,.11);const bulb=mat('#fbe4a8',0,.3).clone();bulb.emissive.set('#faca74');bulb.emissiveIntensity=2;cyl(p,.235,.006,bulb,-.92,2.038,.36);
 const light=new T.SpotLight('#ffd698',24,5,.64,.7,1.6);light.position.set(-.92,2.02,.36);light.target.position.set(-.1,1.2,.86);p.add(light,light.target);
 // 顶部吊灯、布线和通风管。
 cyl(p,.02,1.2,dark,.75,4.13,-.8);cyl(p,.35,.25,paint,.75,3.47,-.8,.12);cyl(p,.3,.013,bulb,.75,3.34,-.8);
 for(const x of[-2.74,3.09]){cyl(p,.058,4.5,rust,x,2,-2.13);for(const y of[.5,1.3,2.2,3.1])box(p,.21,.075,.17,trim,x,y,-2.08);}
 wire(p,[[-3.1,3.8,-2.0],[-2.5,3.3,-2.0],[-2.9,2.9,-2.0],[-2.4,2.4,-2.0]],.018,rubber);
 for(const y of[2.73,2.8,2.87,2.94,3.01])box(p,.75,.04,.05,dark,-2.96,y,-2.24);
 // 旧文书与墙上告示都是真实 3D 表面，不是覆盖画面的后期。
 plate(p,'文明重建办公室\n明 日 开 放',.78,.81,2.65,2.58,-2.273,{bg:'#c5b990',fg:'#654f3a',size:38});box(p,.82,.028,.05,brass,2.65,3,-2.27);
 plate(p,'水是公共财产\n水费除外',.8,.59,-2.96,2.03,-2.272,{bg:'#a99f79',fg:'#414d3f',size:42});
 plate(p,'37\n铅口 · 遗物鉴定所',1.1,.51,-.05,3.72,-2.264,{bg:'#263c32',fg:'#c9bd86',size:45});
 const book=makeModel('book');book.position.set(1.08,1.19,1.1);book.rotation.y=-.23;p.add(book);
 const receipt=plate(p,'收购登记\n––––––––––––\n签名：________',.41,.53,.99,1.187,.25,{size:32});receipt.rotation.x=-Math.PI/2;receipt.rotation.z=.14;
 cyl(p,.074,.27,mat('#a09d80',.22,.8),1.66,1.32,.18);for(let i=0;i<3;i++)rod(p,new T.Vector3(1.62+i*.032,1.3,.17),new T.Vector3(1.64+i*.023,1.65,.15),.009,leather);
 const ashes=new Float32Array(120*3);let seed=37;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<ashes.length;i+=3){ashes[i]=(rand()-.5)*8;ashes[i+1]=rand()*4;ashes[i+2]=-3-rand()*3;}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(ashes,3));this.dust=new T.Points(geo,new T.PointsMaterial({color:'#e5dcc3',size:.012,transparent:true,opacity:.26,depthWrite:false}));p.add(this.dust);
 }
 showItem(type){if(this.item)this.display.remove(this.item);this.models??=new Map();if(!this.models.has(type))this.models.set(type,makeModel(type));this.item=this.models.get(type);this.item.scale.setScalar(.83);this.display.add(this.item);this.targetRotation=0;}
 setState(phase,item,guest=0){this.visitor.visible=phase==='trade';if(phase==='trade'&&this.itemType!==item){this.itemType=item;this.showItem(item);}this.display.visible=phase==='trade'||phase==='prep';if(phase==='prep'){this.itemType=null;this.showItem('chalice');}this.visitor.rotation.y=[-.025,.04,-.07][guest%3];}
 turn(amount){this.targetRotation+=amount;}
 frame(t){if(document.hidden)return;const dt=Math.min((t-(this.last||t))/1000,.05);this.last=t;this.clock+=dt;this.visitor.position.y=Math.sin(this.clock*1.9)*.005;this.visitor.rotation.z=Math.sin(this.clock*.8)*.004;this.display.rotation.y+=(this.targetRotation-this.display.rotation.y)*Math.min(1,dt*8);this.dust.rotation.y=this.clock*.008;this.renderer.render(this.scene,this.camera);}
 thumbnail(type){if(!this.thumbCache)this.thumbCache=new Map();if(this.thumbCache.has(type))return this.thumbCache.get(type);if(!this.thumbRenderer){this.thumbRenderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});this.thumbRenderer.setSize(144,144);this.thumbRenderer.setPixelRatio(1);this.thumbRenderer.outputColorSpace=T.SRGBColorSpace;this.thumbRenderer.toneMapping=T.ACESFilmicToneMapping;this.thumbRenderer.toneMappingExposure=1.35;}
 const s=new T.Scene();s.add(new T.HemisphereLight('#f3e8cf','#526553',3));const l=new T.DirectionalLight('#ffdfb3',4);l.position.set(-3,5,4);s.add(l);const model=makeModel(type);s.add(model);const bounds=new T.Box3().setFromObject(model);const center=bounds.getCenter(new T.Vector3());const size=bounds.getSize(new T.Vector3());model.position.sub(center);const r=Math.max(size.x,size.y,size.z)*.72;const camera=new T.OrthographicCamera(-r,r,r,-r,.01,10);camera.position.set(1.8,1.5,3);camera.lookAt(0,0,0);this.thumbRenderer.render(s,camera);const image=this.thumbRenderer.domElement.toDataURL('image/png');this.thumbCache.set(type,image);model.traverse(o=>{o.geometry?.dispose();if(o.material?.map){o.material.map.dispose();o.material.dispose();}});return image;}
}
