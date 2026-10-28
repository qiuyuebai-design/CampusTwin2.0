import {DAY, checks, candidates, validDate} from './model';
import type {DemoState, Booking} from './model';
export type Scenario = Pick<Booking,'date'|'start'|'end'|'people'|'equipment'> & {venueId:string; excluded:string[]};
export const baseline:Scenario={date:DAY,start:'10:00',end:'12:00',people:180,equipment:['投影设备','无线话筒'],venueId:'v1',excluded:[]};
export const buildings=[
 {id:'v1',name:'图书馆中心',en:'CAMPUS LIBRARY',image:'library-reference.svg',label:'虚构学术空间',facts:['用于展示场地资源与预约流程。','所有空间参数均为模拟数据。'],model:'虚构的校园图书馆模型，几何形态与布局仅供演示。',position:[-32,0,-29] as [number,number,number]},
 {id:'v3',name:'艺术活动中心',en:'CAMPUS ARTS CENTER',image:'arts-reference.svg',label:'虚构活动空间',facts:['该场馆用于展示活动预演。','演示容量与场地状态均为模拟数据。'],model:'由简单体块组成的虚构活动中心模型。',position:[42,0,-6] as [number,number,number]},
 {id:'v5',name:'中心景观塔',en:'CAMPUS LANDMARK',image:'gate-reference.svg',label:'虚构校园地标',facts:['校园地标为演示设计。','周边广场与预约状态均为模拟数据。'],model:'由简化体块构成的虚构校园景观。',position:[0,0,37] as [number,number,number]}
];
export const scenePositions:Record<string,[number,number,number]>={v1:[-32,0,-29],v2:[-53,0,12],v3:[42,0,-6],v4:[48,0,34],v5:[0,0,37],v6:[39,0,-39]};
export function compareScenario(state:DemoState,scenario:Scenario){
 const original=[...checks(state.venues,state.bookings,scenario),{label:'场地排除',pass:!scenario.excluded.includes(scenario.venueId),detail:scenario.excluded.includes(scenario.venueId)?'原场地被排除':'原场地未被排除'}];
 const options=candidates(state,scenario).map(c=>({...c,feasible:c.feasible&&!scenario.excluded.includes(c.venue.id),checks:[...c.checks,{label:'场地排除',pass:!scenario.excluded.includes(c.venue.id),detail:scenario.excluded.includes(c.venue.id)?'此场地已排除':'未被排除'}]})).sort((a,b)=>Number(b.feasible)-Number(a.feasible)||b.score-a.score||a.venue.id.localeCompare(b.venue.id));
 return {original,options,best:options.find(c=>c.feasible),originalFits:original.every(c=>c.pass)};
}
const cnDigits:Record<string,number>={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
export function numberFromText(s:string):number{if(/^\d+$/.test(s))return Number(s);let total=0,n=0;for(const c of s){if(c in cnDigits)n=cnDigits[c];else if(c==='十'){total+=(n||1)*10;n=0}else if(c==='百'){total+=(n||1)*100;n=0}else if(c==='千'){total+=(n||1)*1000;n=0}else return NaN}return total+n}
const shiftedDate=(date:string,days:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
export type ParsedRequest={scenario:Scenario;changed:string[];warnings:string[];recognized:boolean};
export function parseRequest(text:string,previous:Scenario):ParsedRequest{
 const scenario={...previous,equipment:[...previous.equipment],excluded:[...previous.excluded]};const changed:string[]=[];const warnings:string[]=[];
 const people=text.match(/([\d一二两三四五六七八九十百千零]+)\s*(?:个人|人)/);if(people){const n=numberFromText(people[1]);if(Number.isInteger(n)&&n>0&&n<=10000){scenario.people=n;changed.push('人数')}else warnings.push('人数需要是 1–10,000 的整数。')}
 const date=text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);if(date){const d=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`;if(validDate(d)){scenario.date=d;changed.push('日期')}else warnings.push('日期无效，请重新输入。')}
 else if(/后天|明天|今天/.test(text)){scenario.date=shiftedDate(DAY,text.includes('后天')?2:text.includes('明天')?1:0);changed.push('日期')}
 else {const w=text.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);if(w){const dow:Record<string,number>={一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0};const current=new Date(DAY+'T12:00:00Z').getUTCDay();const monday=shiftedDate(DAY,-((current+6)%7));scenario.date=shiftedDate(monday,((dow[w[2]]+6)%7)+(w[1]==='下周'?7:0));if(scenario.date<DAY&&!/本周|这周/.test(w[1]))scenario.date=shiftedDate(scenario.date,7);changed.push('日期')}}
 const timeText=date?text.replace(date[0],''):text;
 const t=timeText.match(/([\d一二两三四五六七八九十]+)(?:[:：]([0-5]\d)|点(半)?)?\s*(?:到|至|[-—~～])\s*([\d一二两三四五六七八九十]+)(?:[:：]([0-5]\d)|点(半)?)?/);
 if(t){let a=numberFromText(t[1]),b=numberFromText(t[4]);if(/下午|晚上|傍晚/.test(text)){if(a<12)a+=12;if(b<12)b+=12}const sa=`${String(a).padStart(2,'0')}:${t[3]?'30':t[2]||'00'}`,sb=`${String(b).padStart(2,'0')}:${t[6]?'30':t[5]||'00'}`;if(a>=8&&b<=22&&sa<sb){scenario.start=sa;scenario.end=sb;changed.push('时段')}else warnings.push('时段需在 08:00–22:00 内，开始早于结束。')}
 else if(/下午|上午|晚上/.test(text))warnings.push(`未给出完整起止时间，暂沿用 ${scenario.start}–${scenario.end}，可在参数区修改。`);
 const aliases:[string,RegExp][]=[['投影设备',/投影(?:设备|仪)?/],['无线话筒',/(?:无线)?(?:话筒|麦克风)/],['音响',/音响/],['舞台灯光',/(?:舞台)?灯光/],['移动白板',/(?:移动)?白板/]];
 for(const [name,re]of aliases){if(re.test(text)){const neg=new RegExp('(?:不需要|不用|取消|去掉|无需)\\s*'+re.source);if(neg.test(text))scenario.equipment=scenario.equipment.filter(x=>x!==name);else if(!scenario.equipment.includes(name))scenario.equipment.push(name);changed.push(name)}}
 const venueAliases:[string,string[]][]=[['v1',['图书馆','图书馆中心']],['v2',['教学楼 A','阶梯教室']],['v3',['艺术活动中心','多功能厅','活动中心']],['v4',['体育馆']],['v5',['中心广场','中心景观塔']],['v6',['研学中心']]];
 for(const [id,names]of venueAliases){const name=names.find(n=>text.includes(n));if(!name)continue;const escaped=name;const exclude=new RegExp(`(?:排除|不用|避开|不要|关闭)\\s*${escaped}|${escaped}.{0,5}(?:不能用|停用|关闭|维护|不可用)`);const restore=new RegExp(`(?:恢复|取消排除)\\s*${escaped}`);if(restore.test(text)){scenario.excluded=scenario.excluded.filter(x=>x!==id);changed.push('恢复场地')}else if(exclude.test(text)){scenario.excluded=[...new Set([...scenario.excluded,id])];changed.push('排除场地')}else if(new RegExp(`(?:原定|原来|改到|选择|在|用)\\s*${escaped}`).test(text)){scenario.venueId=id;changed.push('原定场地')}}
 return {scenario,changed:[...new Set(changed)],warnings,recognized:changed.length>0};
}
export function planReport(state:DemoState,scenario:Scenario,id:string){const result=compareScenario(state,scenario);const selected=result.options.find(c=>c.venue.id===id);return `# CampusTwin 变化前后对比\n\n演示日期：${scenario.date}\n实际时段：${scenario.start}–${scenario.end}\n人数：${scenario.people}\n原定场地：${state.venues.find(v=>v.id===scenario.venueId)?.name}\n选择场地：${selected?.venue.name||'未选择'}\n可行性：${selected?.feasible?'约束通过':'不通过'}\n\n${selected?.checks.map(c=>`- ${c.label}：${c.pass?'通过':'不通过'}；${c.detail}`).join('\n')||''}\n\n## 建议执行\n1. 提交变更审核。\n2. 获批后更新活动信息。\n3. 通知参与者并复核设备。\n\n当前为浏览器内演示，报告不代表正式预约或学校确认。\n`;}
