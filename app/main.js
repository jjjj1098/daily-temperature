import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { syncReminders } from './reminders.js';
import { exportWallpaper } from './wallpaper.js';
import { initBackup, parseBackup } from './backup.js';
import { initAds } from './ads.js';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './theme-fonts.css';
import './skin.css';

 const root=document.getElementById('jcal'), el=id=>root.querySelector('#'+id);
 document.documentElement.classList.toggle('web-preview', !Capacitor.isNativePlatform());
 const accents=[['sea','바다','#2f6bf0'],['forest','숲','#10a172'],['lavender','라벤더','#7c5cf0'],['sunset','노을','#ef6a3a'],['ink','먹','#2a2f35']];
 let accentChoice='sea';
 // 테마(스킨): 기본은 무료, 나머지는 판매용. palette는 그 테마가 고정으로 쓰는 밝기(null이면 화면 모드 설정을 따름)
 const skins=[['basic','기본',0,null],['kraft','크라프트 종이',2500,'light'],['night','겨울 밤',2500,'dark'],['blossom','벚꽃',2500,'light']];
 let skinChoice='basic';
 let themeChoice='light',monthMotion='vertical',agendaMode='ondemand',density='basic';
 let agendaOpen=false,agendaExpanded=false,visibleMonth='',monthWindow=[];
 const systemAppearance=window.matchMedia('(prefers-color-scheme: dark)');
 const lightLandscape={
  '#374963':'#d9eaf2','#8b93a2':'#f7ede1','#e2bbaf':'#f9d9aa',
  '#4a696a':'#a2c6b1','#253e48':'#638e81','#263f4a':'#88a99c','#122b37':'#55796e',
  '#818b91':'#c4cbbb','#667d80':'#b0c3b6','#35525a':'#96b8a9'
 };
 const landscapeColors=Array.from(root.querySelectorAll('.jland [fill],.jland [stop-color]'),node=>{
  const attribute=node.hasAttribute('stop-color')?'stop-color':'fill';
  return {node,attribute,original:node.getAttribute(attribute)};
 }).filter(item=>lightLandscape[item.original]);
 function applyAppearance(){
  const fixed=skins.find(([id])=>id===skinChoice)[3];
  const dark=fixed?fixed==='dark':themeChoice==='dark'||themeChoice==='system'&&systemAppearance.matches;
  root.dataset.skin=skinChoice;
  root.querySelectorAll('[data-skin-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.skinChoice===skinChoice)));
  const note=root.querySelector('.skin-note');if(note){const sk=skins.find(([id])=>id===skinChoice);note.textContent=sk[2]?'‘'+sk[1]+'’ 테마를 미리 입혀 보는 중이에요. 앱에서 구매하면 계속 쓸 수 있어요.':'';}
  root.querySelectorAll('.appearance.accents, .appearance:not(.accents):not(.skins)').forEach(sec=>sec.classList.toggle('locked',!!fixed));
  document.documentElement.dataset.palette=dark?'dark':'light';
  root.dataset.accent=accentChoice;
  root.querySelectorAll('[data-accent-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.accentChoice===accentChoice)));
  root.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===themeChoice)));
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>{meta.content=dark?'#1b2325':'#fffdfa'});
  for(const {node,attribute,original} of landscapeColors)node.setAttribute(attribute,dark?original:lightLandscape[original]);
 }
 root.addEventListener('click',event=>{
  const button=event.target.closest('button[data-theme-choice],button[data-accent-choice],button[data-skin-choice]');
  if(!button)return;
  event.stopPropagation();
  if(button.dataset.skinChoice)skinChoice=button.dataset.skinChoice;
  else if(button.dataset.accentChoice)accentChoice=button.dataset.accentChoice;
  else themeChoice=button.dataset.themeChoice;
  applyAppearance();persist();
 });
 systemAppearance.addEventListener('change',applyAppearance);
 const days='일월화수목금토', views=['월간','주간','일간'], types=['월간 달력','이번 주 시간표','오늘 시간표','다음 일정'];
 let labels=['회의','운동','개인','업무'];
 const defaultLabels=[...labels], base=['#f0605d','#1fae7a','#9a6cf0','#3b82f6'], oldBase=['#d7766f','#529979','#a183b7','#6e91bb'];
 const pad=n=>String(n).padStart(2,'0'), asDate=k=>new Date(k+'T12:00:00'), key=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
 let today=key(new Date());
 const spanDays=e=>e.endDate?Math.max(0,Math.round((asDate(e.endDate)-asDate(e.date))/86400000)):0;
 const shift=(k,n)=>{const d=asDate(k);d.setDate(d.getDate()+n);return key(d)};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let os=Capacitor.getPlatform()==='android'?'android':'ios',screen='calendar',modules=[0,2],expanded=false;
 let moods={},showMood=false,hiddenCats=new Set();
 function moodMark(k){
  const m=moods[k];
  return m?'<span class="jmoodemoji" role="img" aria-label="'+esc(m.name)+'">'+esc(m.emoji)+'</span>':'';
 }
 let date=today,view=0,filter='전체',colors=[...base],events=[];
 const valid=k=>typeof k==='string'&&/^\d{4}-\d\d-\d\d$/.test(k)&&Number.isFinite(+asDate(k));
 function restore(s){if(!s||!valid(s.date))return;themeChoice=['light','dark','system'].includes(s.themeChoice)?s.themeChoice:'light';accentChoice=accents.some(([id])=>id===s.accentChoice)?s.accentChoice:'sea';skinChoice=skins.some(([id])=>id===s.skinChoice)?s.skinChoice:'basic';monthMotion=s.monthMotion==='horizontal'?'horizontal':'vertical';agendaMode=s.agendaMode==='always'?'always':'ondemand';density=['compact','basic','many'].includes(s.density)?s.density:'basic';date=s.date;screen=s.moods&&s.screen==='lock'?'lock':'calendar';showMood=s.showMood===true;hiddenCats=new Set(Array.isArray(s.hiddenCats)?s.hiddenCats.filter(i=>Number.isInteger(i)&&i>=0&&i<99):[]);moods=Object.fromEntries(Object.entries(s.moods||{}).filter(([k,m])=>valid(k)&&m&&typeof m.name==='string'&&typeof m.emoji==='string'));view=views[s.view]?s.view:0;modules=Array.isArray(s.modules)?[...new Set(s.modules.filter(i=>Number.isInteger(i)&&i>=0&&i<types.length))]:[0,2];labels=Array.isArray(s.labels)&&s.labels.length&&s.labels.every(v=>typeof v==='string'&&v.trim())?[...s.labels]:[...defaultLabels];
 colors=labels.map((_,i)=>/^#[0-9a-f]{6}$/i.test(s.colors?.[i])&&!oldBase.includes(s.colors[i].toLowerCase())?s.colors[i]:base[i%base.length]);
 filter=Number.isInteger(s.filter)&&labels[s.filter]?s.filter:labels.includes(s.filter)?labels.indexOf(s.filter):'전체';if(Array.isArray(s.events))events=s.events.filter(x=>valid(x.date)&&typeof x.title==='string'&&labels[x.cat]&&/^\d\d:\d\d$/.test(x.start)&&/^\d\d:\d\d$/.test(x.end));}

 const sorted=(a,b)=>a.date.localeCompare(b.date)||Number(!!b.allDay)-Number(!!a.allDay)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title);
 const list=k=>occurrences(k).sort(sorted);
 // calendar views honour the label chips above the grid; lock screen, search and overlap checks use the full list
 const shown=k=>list(k).filter(e=>!hiddenCats.has(Number(e.cat)));
 const eventTime=e=>e.allDay?'종일':e.start;
 const lockTitle=e=>e.private?'예정된 일정':e.title;
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const visible=e=>filter==='전체'||Number(e.cat)===filter;
 function monthCells(anchor=date){let first=anchor.slice(0,8)+'01',offset=asDate(first).getDay(),last=asDate(first);last.setMonth(last.getMonth()+1,0);return Array.from({length:7*Math.ceil((offset+last.getDate())/7)},(_,i)=>shift(first,i-offset))}
 function syncAddLabel(){
  if(view===0)slotSel=null;
  el('jdayadd').textContent='＋ '+(slotSel?slotSel.a+'–'+(slotSel.b+1)+'시 ':'')+'일정 추가';
 }
 function renderMonth(anchor=date){
  const headers=[...days].map(day=>'<span>'+day+'</span>').join('');
  const cells=monthCells(anchor).map(key=>{
   const entries=shown(key);
   const classes=['jcell'];
   if(key.slice(0,7)!==anchor.slice(0,7))classes.push('out');
   if(key===date)classes.push('sel');
   if(key===today)classes.push('today');
   const summary=entries.map(e=>eventTime(e)+' '+e.title).join(', ')||'일정 없음';
   const limit={compact:2,basic:4,many:8}[density];
   const bars=entries.slice(0,limit).map(e=>'<span class="month-event '+(e.endDate&&e.endDate>e.date?'span-continues ':'')+(e.originDate&&e.originDate<e.date?'span-from':'')+'" data-event="'+esc(e.id)+'" data-origin="'+(e.originDate||e.date)+'" style="--ec:'+colors[e.cat]+'">'+esc(e.title)+'</span>').join('')+(entries.length>limit?'<span class="month-more">+'+(entries.length-limit)+'개</span>':'');
   return '<button type="button" class="'+classes.join(' ')+'" data-date="'+key+'" aria-label="'+esc(key+', '+(moods[key]?moods[key].name+', ':'')+summary+', 일정 목록 열기')+'"><span class="jmooddate"><span class="jnum">'+asDate(key).getDate()+'</span>'+moodMark(key)+'</span>'+bars+'</button>';
  }).join('');
  return '<div class="jweeknames month-headers">'+headers+'</div><div class="jdates month-matrix">'+cells+'</div>';
 }
 function timeline(){const weekStart=shift(date,-asDate(date).getDay()),ds=view===2?[date]:Array.from({length:7},(_,i)=>shift(weekStart,i)),es=ds.flatMap(shown).filter(e=>!e.allDay);
 const lo=Math.min(9,...es.map(e=>Math.floor(minutes(e.start)/60))),hi=Math.max(19,...es.map(e=>Math.ceil(minutes(e.end)/60))),h=28;
 let result='<div class="timegrid" style="--cols:'+ds.length+';--height:'+(hi-lo)*h+'px;--hour:'+h+'px"><span></span>'+ds.map(k=>'<button class="timehead" data-date="'+k+'">'+days[asDate(k).getDay()]+' '+asDate(k).getDate()+' '+moodMark(k)+'</button>').join('');
 if(ds.some(k=>shown(k).some(e=>e.allDay))){
  result+='<span class="timehead">종일</span>'+ds.map(k=>'<div class="jallday">'+shown(k).filter(e=>e.allDay).map(e=>'<button data-id="'+esc(e.id)+'" data-instance="'+e.date+'" style="--ec:'+colors[e.cat]+'">'+esc(e.title)+'</button>').join('')+'</div>').join('');
 }
 result+='<div class="hours">'+Array.from({length:hi-lo},(_,i)=>'<small style="top:'+i*h+'px">'+pad(lo+i)+'</small>').join('')+'</div>';
 for (const k of ds){const blocks=shown(k).filter(e=>!e.allDay),ends=[],slots=blocks.map(e=>{let n=ends.findIndex(end=>end<=e.start);if(n<0)n=ends.length;ends[n]=e.end;return n});result+='<div class="timecol" data-slot="'+k+'" data-lo="'+lo+'" data-hour="'+h+'" aria-label="'+k+' 시간 선택, 길게 눌러 끌면 여러 시간 선택">'+blocks.map((e,i)=>'<button class="block" data-id="'+esc(e.id)+'" data-instance="'+e.date+'" aria-label="'+esc(e.start+' '+e.title)+'" style="--ec:'+colors[e.cat]+';top:'+(minutes(e.start)/60-lo)*h+'px;height:'+Math.max(12,(minutes(e.end)-minutes(e.start))*h/60)+'px;left:'+slots[i]*100/ends.length+'%;width:'+100/ends.length+'%">'+esc(e.title)+'</button>').join('')+'</div>'}return result+'</div>'}
 function nextWidgetEvents(){
  const candidates=events.filter(visible).map(base=>{
   const instance=nextOccurrence(base,shift(date,-spanDays(base)));
   const endDay=instance?.endDate||instance?.date;
   return instance&&(endDay<date||endDay===date&&instance.end<=previewTime()) ? nextOccurrence(base,shift(date,1)) : instance;
  });
  return candidates.filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date)||Number(!!a.allDay)-Number(!!b.allDay)||sorted(a,b));
 }
 function lockModule(kind){
  const focus=asDate(date);
  const shortDate=k=>{const d=asDate(k);return (d.getMonth()+1)+'/'+d.getDate()};
  const head=(title,detail)=>'<div class="lkhead"><h4>'+title+'</h4><span>'+detail+'</span></div>';
  const row=e=>'<div class="lkitem" style="--ec:'+colors[e.cat]+'"><i aria-hidden="true"></i><time>'+esc(eventTime(e))+'</time><b>'+esc(lockTitle(e))+'</b></div>';
  const empty='<p class="lkempty">등록된 일정이 없어요</p>';
  let body='';
  if(kind===0){
   const heading=head((focus.getMonth()+1)+'월 달력',focus.getFullYear()+'년');
   const weekdayNames=[...days].map(x=>'<div class="lkdow">'+x+'</div>').join('');
   const cells=monthCells().map(k=>{
    const bars=list(k).filter(visible).map(e=>'<span class="lkbar" style="--ec:'+colors[e.cat]+'">'+esc(lockTitle(e))+'</span>').join('');
    return '<div class="lkcell'+(k.slice(0,7)!==date.slice(0,7)?' lkout':'')+'" aria-label="'+k+'"><span class="jmooddate"><span class="lkday'+(k===date?' lkfocus':'')+'">'+asDate(k).getDate()+'</span>'+(showMood?moodMark(k):'')+'</span>'+bars+'</div>';
   }).join('');
   body=heading+'<div class="lkmonth">'+weekdayNames+cells+'</div>';
  }else if(kind===1){
   const first=shift(date,-focus.getDay()),last=shift(first,6);
   const groups=Array.from({length:7},(_,i)=>{
    const k=shift(first,i),items=list(k).filter(visible);
    if(!items.length)return '';
    return '<div class="lkgroup"><span class="lkdate'+(k===date?' now':'')+'">'+asDate(k).getDate()+'일 '+days[i]+'</span><div>'+items.map(row).join('')+'</div></div>';
   }).join('');
   body=head('이번 주 시간표',shortDate(first)+' – '+shortDate(last))+'<div class="lkagenda">'+(groups||empty)+'</div>';
  }else if(kind===2){
   const items=list(date).filter(visible);
   body=head('오늘 시간표',shortDate(date)+' '+days[focus.getDay()]+'요일')+'<div class="lkagenda">'+(items.map(row).join('')||empty)+'</div>';
  }else{
   const next=nextWidgetEvents()[0];
   const when=!next?'':next.date===date?'오늘':shortDate(next.date)+' '+days[asDate(next.date).getDay()]+'요일';
   body=head('다음 일정',when)+'<div class="lkagenda">'+(next?row(next):'<p class="lkempty">예정된 일정이 없어요</p>')+'</div>';
  }
  return '<section class="lkmodule">'+body+'</section>';
 }
 function fitLock(){
  if(screen!=='lock')return;
  const phone=root.querySelector('.jphone'), box=el('jwidget'), zoom=el('lkzoom');
  phone.classList.toggle('lkexpanded',expanded);
  const width=phone.clientWidth, available=width*2.13-box.offsetTop-22;
  const scale=Math.min(1,Math.max(1,available)/Math.max(1,box.offsetHeight));
  box.style.transform='scale('+(expanded?1:scale)+')';
  zoom.hidden=scale>=.99&&!expanded;
  zoom.setAttribute('aria-pressed',String(expanded));
  zoom.textContent=expanded?'한 화면에 맞추기':'내용 크게 보기';
 }
 function widget(){
  root.querySelector('.jclock').textContent=previewTime();
  el('exportwall').disabled=!modules.length;
  const d=asDate(date);
  el('jpdate').textContent=(d.getMonth()+1)+'월 '+d.getDate()+'일 '+days[d.getDay()]+'요일';
  el('jtypes').innerHTML=types.map((name,i)=>{
   const pos=modules.indexOf(i);
   return '<button type="button" data-type="'+i+'" aria-pressed="'+(pos>=0)+'"><span aria-hidden="true">'+(pos>=0?pos+1:'＋')+'</span>'+name+'</button>';
  }).join('');
  el('jwidget').innerHTML=modules.length?modules.map(lockModule).join(''):'<p class="lkempty">위에서 표시할 항목을 골라 주세요.</p>';
  el('lkplatformnote').textContent='저장한 이미지를 휴대폰 설정에서 잠금화면 배경으로 선택하세요. 일정이 바뀌면 새 이미지를 저장해 주세요.';
  fitLock();
 }
 el('lkzoom').onclick=()=>{expanded=!expanded;fitLock()};
 if(globalThis.ResizeObserver)new ResizeObserver(fitLock).observe(el('jwidget'));
 function syncScreen(){
  applyAppearance();
  syncAddLabel();
  const mood=moods[date],d=asDate(date);
  el('jmoodlabel').textContent=(d.getMonth()+1)+'월 '+d.getDate()+'일의 기분'+(mood?'　'+mood.emoji+' '+mood.name:'');
  el('jmoodaction').textContent=mood?'한 줄 수정':'＋ 오늘의 한 줄';
  const line=el('jmoodline');line.hidden=!mood;if(mood){line.querySelector('span').textContent=mood.emoji;line.querySelector('b').textContent=mood.note||mood.name;}
  el('jshowmood').checked=showMood;
  el('jlegend').innerHTML=labels.map((label,i)=>'<li><button type="button" class="jcatfilter" data-cat-toggle="'+i+'" aria-pressed="'+!hiddenCats.has(i)+'" style="--ec:'+colors[i]+'">'+esc(label)+'</button></li>').join('');
  root.dataset.os=os;root.dataset.screen=screen;root.dataset.view=String(view);
  root.querySelector('main').hidden=screen!=='calendar';
  root.querySelector('aside').hidden=screen!=='lock';

 }


 function changeMonth(k,n){
  const d=asDate(k.slice(0,7)+'-01');d.setMonth(d.getMonth()+n);return key(d);
 }
 function prepareMonths(anchor=date){
  monthWindow=Array.from({length:9},(_,i)=>changeMonth(anchor,i-4));
  visibleMonth=anchor.slice(0,7);
 }
 function monthSection(k){
  const d=asDate(k);
  return '<section class="calendar-month" data-month="'+k.slice(0,7)+'"><h3>'+(d.getMonth()?'':d.getFullYear()+'년 ')+(d.getMonth()+1)+'월</h3>'+renderMonth(k)+'</section>';
 }
 function paintGrid({jump=false}={}){
  const grid=el('jgrid'),offset=grid.scrollTop;
  if(view===0&&monthMotion==='vertical'){
   if(!monthWindow.length||jump)prepareMonths(date);
   grid.innerHTML=monthWindow.map(monthSection).join('');
   grid.scrollTop=jump?Math.max(0,(sec=>sec.offsetTop+sec.firstElementChild.offsetHeight)(grid.querySelector('[data-month="'+date.slice(0,7)+'"]'))):offset;
  }else{grid.innerHTML=view===0?renderMonth():timeline();if(jump)grid.scrollTop=0}
  paintSlot();
 }
 // week/day view: tap selects one hour, long-press (or mouse drag) then move selects a range
 let slotSel=null,ignoreClick=false,press=null;
 function hourAt(col,y){
  const lo=Number(col.dataset.lo),h=Number(col.dataset.hour),n=Math.round(col.offsetHeight/h);
  return lo+Math.min(n-1,Math.max(0,Math.floor((y-col.getBoundingClientRect().top)/h)));
 }
 function paintSlot(){
  el('jgrid').querySelectorAll('.slotsel').forEach(n=>n.remove());
  const col=slotSel&&el('jgrid').querySelector('[data-slot="'+slotSel.date+'"]');
  if(!col)return;
  const h=Number(col.dataset.hour),lo=Number(col.dataset.lo);
  col.insertAdjacentHTML('beforeend','<div class="slotsel" aria-hidden="true" style="top:'+(slotSel.a-lo)*h+'px;height:'+(slotSel.b-slotSel.a+1)*h+'px"></div>');
 }
 function dragTo(y){
  const hr=hourAt(press.col,y);
  slotSel={date:press.col.dataset.slot,a:Math.min(press.anchor,hr),b:Math.max(press.anchor,hr)};
  paintSlot();syncAddLabel();
 }
 function endDrag(){
  const moved=press?.on;press=null;if(!moved)return;
  ignoreClick=true;setTimeout(()=>{ignoreClick=false},400);
  date=slotSel.date;agendaOpen=true;render();persist();
 }
 const slotCol=ev=>{const col=ev.target.closest?.('[data-slot]');return col&&ev.target===col?col:null};
 el('jgrid').addEventListener('touchstart',ev=>{
  const col=slotCol(ev);if(!col||ev.touches.length>1)return;
  const t=ev.touches[0];
  press={col,x:t.clientX,y:t.clientY,on:false,timer:setTimeout(()=>{press.on=true;press.anchor=hourAt(col,press.y);dragTo(press.y);navigator.vibrate?.(15)},400)};
 },{passive:true});
 el('jgrid').addEventListener('touchmove',ev=>{
  if(!press)return;
  const t=ev.touches[0];
  if(!press.on){if(Math.hypot(t.clientX-press.x,t.clientY-press.y)>10){clearTimeout(press.timer);press=null}return}
  ev.preventDefault();dragTo(t.clientY);
 },{passive:false});
 el('jgrid').addEventListener('touchend',()=>{if(press){clearTimeout(press.timer);endDrag()}});
 el('jgrid').addEventListener('touchcancel',()=>{if(press){clearTimeout(press.timer);press=null}});
 el('jgrid').addEventListener('pointerdown',ev=>{
  const col=ev.pointerType==='mouse'&&slotCol(ev);
  if(col)press={col,anchor:hourAt(col,ev.clientY),on:false};
 });
 el('jgrid').addEventListener('pointermove',ev=>{
  if(!press||ev.pointerType!=='mouse')return;
  if(!press.on&&hourAt(press.col,ev.clientY)===press.anchor)return;
  press.on=true;dragTo(ev.clientY);
 });
 addEventListener('pointerup',ev=>{if(press&&ev.pointerType==='mouse')endDrag()});
 function updateMonthTitle(k){
  const d=asDate(k);
  el('jyear').textContent=d.getFullYear()+'년';
  el('jmonth').textContent=(d.getMonth()+1)+'월'+(view===2?' '+d.getDate()+'일':'');
 }
 function renderAgenda(){
  const area=root.querySelector('.jagenda'),d=asDate(date),es=shown(date);
  area.hidden=screen!=='calendar'||!(agendaOpen||agendaMode==='always'||view===2);
  area.classList.toggle('expanded',agendaExpanded);
  el('jexpand').setAttribute('aria-expanded',String(agendaExpanded));
  el('jexpand').setAttribute('aria-label',agendaExpanded?'일정 목록 접기':'일정 목록 펼치기');
  area.querySelector('[data-act="agenda-close"]').hidden=agendaMode==='always'||view===2;
  el('jagendahead').textContent=(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+days[d.getDay()]+')';
  el('jcount').textContent=es.length+'개';
  el('jrows').innerHTML=es.map(e=>'<button class="jrow" data-id="'+esc(e.id)+'" data-instance="'+(e.originDate||e.date)+'" style="--ec:'+colors[e.cat]+'"><time>'+eventTime(e)+(e.allDay?'':'<small>'+e.end+'</small>')+'</time><i></i><b>'+esc(e.title)+'</b><small>'+esc(labels[e.cat])+'</small></button>').join('')||'<div class="jempty">등록한 일정이 없어요.</div>';
 }
 function render({jump=false}={}){
  syncScreen();root.dataset.motion=monthMotion;
  updateMonthTitle(view===0&&monthMotion==='vertical'&&!jump&&visibleMonth?visibleMonth+'-01':date);
  const toggle=el('jview');toggle.textContent=['월','주','일'][view];toggle.dataset.mode=String(view);toggle.setAttribute('aria-label','보기: '+views[view]+', 누르면 '+views[(view+1)%3]);
  el('jfilter').innerHTML='<option value="전체">전체</option>'+labels.map((name,i)=>'<option value="'+i+'" '+(i===filter?'selected':'')+'>'+esc(name)+'</option>').join('');
  paintGrid({jump});renderAgenda();widget();
 }
 let scrolling=false;
 el('jgrid').addEventListener('scroll',()=>{
  if(scrolling||view!==0||monthMotion!=='vertical'||screen!=='calendar')return;
  scrolling=true;
  requestAnimationFrame(()=>{
   const grid=el('jgrid'),bounds=grid.getBoundingClientRect();
   const sections=[...grid.querySelectorAll('[data-month]')];
   const active=sections.find(section=>section.getBoundingClientRect().bottom>bounds.top+55);
   if(active){visibleMonth=active.dataset.month;updateMonthTitle(visibleMonth+'-01')}
   if(grid.scrollTop<100){
    const first=monthWindow[0],before=grid.scrollHeight;
    const extra=[-3,-2,-1].map(n=>changeMonth(first,n));
    monthWindow.unshift(...extra);grid.insertAdjacentHTML('afterbegin',extra.map(monthSection).join(''));
    grid.scrollTop+=grid.scrollHeight-before;
   }else if(grid.scrollHeight-grid.scrollTop-grid.clientHeight<150){
    const last=monthWindow.at(-1),extra=[1,2,3].map(n=>changeMonth(last,n));
    monthWindow.push(...extra);grid.insertAdjacentHTML('beforeend',extra.map(monthSection).join(''));
   }
   scrolling=false;
  });
 });

 function selectDate(k){
  date=k;agendaOpen=true;render();
  const grid=el('jgrid'),cell=[...grid.querySelectorAll('[data-date]')].find(b=>b.dataset.date===k&&!b.classList.contains('out'));
  if(cell){
   const r=cell.getBoundingClientRect(),g=grid.getBoundingClientRect();
   if(r.bottom>g.bottom)grid.scrollTop+=r.bottom-g.bottom+4;
   if(r.top<g.top)grid.scrollTop-=g.top-r.top+4;
  }
  persist();
 }
 let gesture=null;
 el('jgrid').addEventListener('touchstart',ev=>{const t=ev.touches[0];gesture={x:t.clientX,y:t.clientY}},{passive:true});
 el('jgrid').addEventListener('touchend',ev=>{
  if(!gesture||view!==0||monthMotion!=='horizontal')return;
  const t=ev.changedTouches[0],x=t.clientX-gesture.x,y=t.clientY-gesture.y;
  if(Math.abs(x)>60&&Math.abs(x)>Math.abs(y)*1.5){date=changeMonth(date,x<0?1:-1);render({jump:true});persist()}
  gesture=null;
 },{passive:true});
 el('jexpand').onclick=()=>{agendaExpanded=!agendaExpanded;renderAgenda()};
 let dragY;
 el('jagendadrag').addEventListener('touchstart',e=>{dragY=e.touches[0].clientY},{passive:true});
 el('jagendadrag').addEventListener('touchend',e=>{
  const delta=e.changedTouches[0].clientY-dragY;
  if(delta<-30){agendaExpanded=true;renderAgenda()}
  if(delta>30){if(agendaExpanded)agendaExpanded=false;else if(agendaMode!=='always')agendaOpen=false;renderAgenda()}
 },{passive:true});
 const sheet=el('jsheet');let opener,returnToEditor=null;
 function panel(title,body){if(sheet.contains(el('backup'))){root.append(el('backup'));el('backup').hidden=true;}opener=document.activeElement;sheet.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="jtitle" class="panel"><div class="jsection"><h3 id="jtitle">'+title+'</h3><button class="jclose" data-act="close" aria-label="닫기">×</button></div>'+body+'</section>';sheet.hidden=false;root.querySelector('.jlayout').inert=true;(sheet.querySelector('input')||sheet.querySelector('button')).focus({preventScroll:true})}

 function monthPicker(){
  panel('연도 · 월 선택','<form id="monthform"><label>이동할 달<input type="month" id="monthvalue" required value="'+(visibleMonth||date.slice(0,7))+'"></label><footer><button type="submit" class="jprimary">이동</button></footer></form>');
  el('monthform').onsubmit=e=>{e.preventDefault();date=el('monthvalue').value+'-01';close();render({jump:true});persist()};
 }
 function settings(){
  panel('설정','<section class="appearance" role="group" aria-label="화면 모드"><span>화면 모드</span><div><button type="button" data-theme-choice="light">밝게</button><button type="button" data-theme-choice="dark">어둡게</button><button type="button" data-theme-choice="system">기기 설정</button></div></section><button type="button" class="settings-row" data-screen="lock"><span>잠금화면 꾸미기</span><small>배경화면 만들기 ›</small></button><section class="settings-labels" aria-label="달력에 보일 라벨"><span>달력에 보일 라벨</span><div>'+labels.map((label,i)=>'<button type="button" class="jcatfilter" data-cat-toggle="'+i+'" aria-pressed="'+!hiddenCats.has(i)+'" style="--ec:'+colors[i]+'">'+esc(label)+'</button>').join('')+'</div></section><section class="appearance skins" role="group" aria-label="테마"><span>테마</span><div>'+skins.map(([id,name,price])=>'<button type="button" data-skin-choice="'+id+'"><span class="skin-swatch" data-skin="'+id+'" aria-hidden="true"><b>20</b><i></i><i></i></span><strong>'+name+'</strong><small>'+(price?price.toLocaleString('ko-KR')+'원':'무료')+'</small></button>').join('')+'</div><p class="skin-note" role="status"></p></section><section class="appearance accents" role="group" aria-label="강조 색"><span>강조 색</span><div>'+accents.map(([id,name,color])=>'<button type="button" data-accent-choice="'+id+'"><i aria-hidden="true" style="background:'+color+'"></i>'+name+'</button>').join('')+'</div></section><label>달력 이동<select id="monthmotion"><option value="vertical">위아래 연속 스크롤</option><option value="horizontal">좌우로 한 달씩</option></select></label><label>아래 일정 목록<select id="agendamode"><option value="ondemand">날짜를 누르면 표시</option><option value="always">항상 표시</option></select></label><label>날짜 칸의 일정 표시<select id="density"><option value="compact">간단히 · 2개</option><option value="basic">기본 · 4개</option><option value="many">많이 · 8개</option></select></label><button type="button" data-act="labels" class="settings-action">라벨 관리</button><div id="settings-backup"></div>');
  for(const [id,value] of [['monthmotion',monthMotion],['agendamode',agendaMode],['density',density]])el(id).value=value;
  for(const id of ['monthmotion','agendamode','density'])el(id).onchange=()=>{
   monthMotion=el('monthmotion').value;agendaMode=el('agendamode').value;density=el('density').value;
   render({jump:true});persist();
  };
  el('settings-backup').append(el('backup'));el('backup').hidden=false;
  applyAppearance();
 }
 function close(force=false){
  if(!force && sheet.querySelector('#jform')?.dataset.dirty==='true' && !confirm('작성한 내용을 저장하지 않고 닫을까요?'))return;
  if(returnToEditor){const resume=returnToEditor;returnToEditor=null;resume();return}
  if(sheet.contains(el('backup'))) { root.append(el('backup'));el('backup').hidden=true; }
  sheet.hidden=true;sheet.innerHTML='';root.querySelector('.jlayout').inert=false;(opener?.isConnected?opener:root.querySelector('.month-jump')).focus({preventScroll:true})
 }
 function nextOccurrence(event, from) {
  let item = ruleOccurrence(event, from);
  if (!item || !event.excludedDates?.length) return item;
  const exceptions = new Set(event.excludedDates);
  while (item && exceptions.has(item.date)) {
   if (item.date === '9999-12-31') return null;
   item = ruleOccurrence(event, shift(item.date, 1));
  }
  return item;
 }
 function ruleOccurrence(event, from) {
  const rule = event.rule,first=rule?.phaseDate||event.date;
  if(from<event.date)from=event.date;
  if (!rule) return first >= from ? event : null;
  const step = Number(rule.interval);
  if (!Number.isInteger(step) || step < 1 || step > 999) return null;
  const floor = from > first ? from : first;
  if (rule.until && floor > rule.until) return null;
  const a = asDate(first), b = asDate(floor);
  const gap = Math.round((b - a) / 86400000);
  let candidate;
  if (rule.unit === 'day') {
   candidate = shift(first, Math.ceil(gap / step) * step);
  } else if (rule.unit === 'week') {
   const wanted = [...new Set(rule.weekdays || [a.getDay()])].filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort((x,y) => x-y);
   if (!wanted.length) return null;
   const week = Math.floor((gap + a.getDay()) / 7);
   let block = Math.ceil(week / step) * step;
   let weekday = block === week ? wanted.find(n => n >= b.getDay()) : wanted[0];
   if (weekday === undefined) { block += step; weekday = wanted[0]; }
   candidate = shift(first, block * 7 + weekday - a.getDay());
  } else if (rule.unit === 'month' || rule.unit === 'year') {
   const stride = rule.unit === 'month' ? step : 12 * step;
   const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
   let offset = Math.ceil(months / stride) * stride;
   while (!candidate) {
    const next = asDate(first);
    next.setDate(1); next.setMonth(next.getMonth() + offset);
    if (next.getFullYear() > 9999 || !Number.isFinite(+next)) return null;
    const month = next.getMonth();
    next.setDate(a.getDate());
    if (next.getMonth() === month && key(next) >= floor) candidate = key(next);
    offset += stride;
   }
  } else return null;
  return valid(candidate) && (!rule.until || candidate <= rule.until) ? {...event,date:candidate,...(event.endDate?{endDate:shift(candidate,spanDays(event))}:{})} : null;
 }
 function occurrences(k) {
  return events.flatMap(event=>{
   const length=spanDays(event),found=[];let cursor=shift(k,-length);
   while(cursor<=k){
    const instance=nextOccurrence(event,cursor);
    if(!instance||instance.date>k)break;
    const last=shift(instance.date,length);
    if(last>=k)found.push({...instance,originDate:instance.date,date:k,allDay:instance.allDay,start:k>instance.date?'00:00':instance.start,end:k<last?'24:00':instance.end,endDate:last});
    if(!event.rule)break;cursor=shift(instance.date,1);
   }
   return found;
  });
 }
 function searchEvents() {
  panel('일정 검색','<label>제목 또는 장소<input id="jquery" type="search" autocomplete="off" placeholder="예: 회의, 도서관"></label><div id="jmatches" aria-live="polite"></div>');
  const query=el('jquery'), results=el('jmatches');
  const normalize=text=>String(text||'').normalize('NFC').toLocaleLowerCase('ko');
  function find(){
   const term=normalize(query.value.trim());
   if(!term){results.textContent='검색할 제목이나 장소를 입력해 주세요.';return}
   const hits=events.filter(item=>normalize(item.title).includes(term)||normalize(item.place).includes(term))
    .map(item=>item.rule?(nextOccurrence(item,date)||nextOccurrence(item,item.date)):item).filter(Boolean).sort(sorted);
   results.innerHTML=hits.map(item=>'<button type="button" class="jrow" data-id="'+esc(item.id)+'" data-instance="'+item.date+'" style="--ec:'+colors[item.cat]+'"><time>'+item.date+'</time><i></i><b>'+esc(item.title)+'</b><small>'+esc(item.place||eventTime(item))+'</small></button>').join('')||'일치하는 일정이 없어요.';
  }
  query.oninput=find;find();
 }

 // '' = empty, null = not a web link; only http(s) is allowed so a restored backup can't smuggle in javascript: links
 function safeUrl(text){
  const raw=String(text||'').trim();if(!raw)return '';
  try{const u=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)?raw:'https://'+raw);return /^https?:$/.test(u.protocol)&&u.hostname.includes('.')?u.href:null}catch{return null}
 }
 function openEvent(id,day){
  const e=events.find(x=>x.id===id);if(!e)return;
  const d=valid(day)?day:e.date;
  panel('일정 상세','<article class="event-detail"><h4>'+esc(e.title)+'</h4><p>'+d+(e.endDate&&e.endDate>d?' ~ '+e.endDate:'')+' · '+(e.allDay?'하루 종일':e.start+' – '+e.end)+'</p><p><i class="dot" style="--ec:'+colors[e.cat]+'"></i> '+esc(labels[e.cat])+'</p>'+(e.place?'<p>장소　'+esc(e.place)+'</p>':'')+(safeUrl(e.url)?'<p>URL　<a href="'+esc(safeUrl(e.url))+'" target="_blank" rel="noopener noreferrer">'+esc(e.url)+'</a></p>':'')+(e.memo?'<p>'+esc(e.memo)+'</p>':'')+'<p>알림　'+esc(Array.isArray(e.alarm)?e.alarm.join(', '):e.alarm||'없음')+'</p><div class="detail-actions"><button type="button" id="detail-edit" class="jprimary">편집</button><button type="button" id="detail-copy">복제</button></div></article>');
  el('detail-edit').onclick=()=>editEvent(id,d);
  el('detail-copy').onclick=()=>editor(null,[],{copy:{...e,date:d,rule:undefined,seriesId:undefined,excludedDates:undefined}});
 }
 function editEvent(id, day) {
  const event=events.find(item=>item.id===id);
  if(!event)return;
  const series=event.rule?event:events.find(item=>item.id===event.seriesId);
  if(!series){editor(event);return}
  const clicked=valid(day)?day:event.date;
  panel('반복 일정','<p>'+esc(clicked+' · '+event.title)+'</p><footer><button type="button" id="jseries">전체 반복 편집</button><button type="button" id="jfuture">이후 일정 편집</button><button type="button" id="jinstance" class="jprimary">이 회차만 편집</button></footer>');
  el('jseries').onclick=()=>editor(series);
  el('jfuture').onclick=()=>editor(series,[],{occurrence:clicked,future:true});
  el('jinstance').onclick=()=>editor(event,[],{occurrence:clicked});
 }
 function editor(e, dates = [], {occurrence=null, copy=null, future=false, at='10:00', to=null}={}) {
  const editingOne=Boolean(e&&occurrence&&!future);
  const detach=editingOne&&Boolean(e.rule);
  const item = copy || (future?{...e,date:occurrence}:detach?{...e,date:occurrence,rule:null}:e) || {title:'', date, start:at, end:to||(at>='23:00'?'23:59':pad(Number(at.slice(0,2))+1)+at.slice(2)), cat:0, alarm:'하루 전'};
  const initial = Array.isArray(dates) ? dates.filter(valid) : [];
  const picked = new Set(!e && initial.length ? initial : [item.date]);
  const first = [...picked].sort()[0];
  let pickerOpen = picked.size > 1, month = first.slice(0,7);
  const weekSelection = new Set(item.rule?.weekdays?.length ? item.rule.weekdays : [asDate(first).getDay()]);
  const catChips = selected => labels.map((name,i)=>'<label class="jed-cat" style="--ec:'+colors[i]+'"><input type="radio" name="cat" value="'+i+'" '+(Number(selected)===i?'checked':'')+'><span>'+esc(name)+'</span></label>').join('');
  const unitOptions = [['day','일마다'],['day','일마다'],['week','주마다'],['month','개월마다'],['year','년마다']];
  const options = (arr, selected) => arr.map(([value,label]) => '<option value="'+esc(value)+'" '+(String(value)===String(selected)?'selected':'')+'>'+esc(label)+'</option>').join('');
  panel(future?'이후 반복 일정 편집':editingOne?'이 회차만 편집':e?(item.rule?'반복 일정 전체 편집':'일정 편집'):copy?'일정 복제':'일정 등록', [
   '<form id="jform">',
   '<input class="jed-title" name="title" required maxlength="60" aria-label="일정 이름" placeholder="제목" style="--tc:'+colors[item.cat]+'" value="'+esc(item.title)+'">',
   // the visible text is drawn by syncRows(); the native date/time inputs sit invisibly on top so a tap opens the system picker
   '<section class="jed-group jed-timegroup" aria-label="날짜와 시간"><div class="jed-span">',
   '<div class="jed-pt"><label class="jed-pd"><span data-show="date"></span><input name="date" type="date" aria-label="시작 날짜" value="'+first+'" required></label><label class="jed-t"><span data-show="start"></span><input name="start" type="time" aria-label="시작 시간" required value="'+(item.allDay?'10:00':item.start)+'"></label></div>',
   '<span class="jed-arrow" aria-hidden="true">›</span>',
   '<div class="jed-pt"><label class="jed-pd"><span data-show="endDate"></span><input type="date" name="endDate" aria-label="종료 날짜" value="'+(item.endDate||first)+'" min="'+first+'"></label><label class="jed-t"><span data-show="end"></span><input name="end" type="time" aria-label="종료 시간" required value="'+(item.allDay?'11:00':item.end)+'"></label></div>',
   '<label class="jed-pill"><input name="allDay" type="checkbox" '+(item.allDay?'checked':'')+'><span>하루종일</span></label>',
   '</div><button type="button" class="jed-row" data-picker aria-expanded="false"><span>여러 날 선택</span><span class="jed-rowval"></span></button>',
   '<div class="jed-picker" hidden><div class="jed-month"><button type="button" data-move="-1" aria-label="이전 달">‹</button><strong></strong><button type="button" data-move="1" aria-label="다음 달">›</button></div><div class="jed-days"></div><div class="jed-picked" aria-live="polite"></div></div>',
   '</section><section class="jed-group" aria-label="반복">',
   '<label class="jed-allday"><span>반복 설정</span><input type="checkbox" id="jrepeaton" '+(item.rule?'checked':'')+'></label>',
   // 'none' stays as a hidden option so the existing repeat.value==='none' checks keep working
   '<div class="jed-rule"><label>주기<select name="unit"><option value="none" hidden'+(item.rule?'':' selected')+'>반복 안 함</option>'+options(unitOptions,item.rule?.unit)+'</select></label><label class="jed-interval">간격<input type="number" name="interval" min="1" max="999" step="1" required value="'+(item.rule?.interval || 1)+'"></label></div>',
   '<div class="jed-week" role="group" aria-label="반복 요일"></div>',
   '<label class="jed-until">반복 종료일 (선택)<input type="date" name="until" value="'+esc(item.rule?.until || '')+'"></label>',
   '<p class="jed-note"></p>',
   '</section><section class="jed-group" aria-label="라벨과 알림">',
   '<div class="jed-labelhead"><span id="jcathead">라벨</span><button type="button" id="jeditlabels">라벨 관리</button></div><div id="jcatchips" role="radiogroup" aria-labelledby="jcathead">'+catChips(item.cat)+'</div>',
   '<div class="jed-labelhead"><span>알림</span><button type="button" id="alarmadd">＋ 알림 추가</button></div><div id="alarmrows"></div>',
   '</section><section class="jed-group" aria-label="장소, URL, 메모">',
   '<label>장소<input name="place" maxlength="120" placeholder="장소" value="'+esc(item.place||'')+'"></label>',
   '<label>URL<input name="url" inputmode="url" autocapitalize="off" autocomplete="url" maxlength="500" placeholder="https://" value="'+esc(item.url||'')+'"></label>',
   '<label>메모<textarea name="memo" maxlength="1500" placeholder="메모">'+esc(item.memo||'')+'</textarea></label>',
   '<label class="jed-allday"><span>잠금화면·알림에서 제목 숨기기</span><input type="checkbox" name="private" '+(item.private?'checked':'')+'></label>',
   '</section>',
   '<div id="jerr" role="alert"></div><footer>'+(e?'<button type="button" id="jdel">'+(future?'이후 일정 삭제':editingOne?'이 회차 삭제':item.rule?'전체 반복 삭제':'삭제')+'</button><button type="button" id="jcopy">복제</button>':'')+'<button class="jprimary" type="submit">저장</button></footer></form>'
  ].join(''));
  const form = el('jform'), field = name => form.elements.namedItem(name), node = selector => form.querySelector(selector);
  const picker = node('.jed-picker'), repeat = field('unit');
  form.addEventListener('input',()=>{form.dataset.dirty='true'});
  const tint=()=>field('title').style.setProperty('--tc',colors[Number(field('cat').value)]||'');
  node('#jcatchips').addEventListener('change',tint);
  const repeatOn=node('#jrepeaton');
  repeatOn.onchange=()=>{repeat.value=repeatOn.checked?'week':'none';syncRule()};
  form.addEventListener('change',()=>{form.dataset.dirty='true'});
  const alarms=Array.isArray(item.alarm)?item.alarm:[item.alarm||'없음'];
  function alarmRow(value){
   const row=document.createElement('div');row.className='alarm-row';
   row.innerHTML='<select name="alarm" aria-label="알림 시점">'+options(['없음','시작 시각','10분 전','30분 전','1시간 전','하루 전'].map(v=>[v,v]),value)+'</select><button type="button" aria-label="이 알림 삭제">×</button>';
   row.querySelector('button').onclick=()=>{row.remove();form.dataset.dirty='true'};
   el('alarmrows').append(row);
  }
  alarms.forEach(alarmRow);
  el('alarmadd').onclick=()=>{alarmRow('10분 전');form.dataset.dirty='true'};
  let duration=minutes(item.end)-minutes(item.start);
  field('start').onchange=()=>{
   const target=Math.min(1439,minutes(field('start').value)+Math.max(1,duration));
   field('end').value=pad(Math.floor(target/60))+':'+pad(target%60);
  };
  field('end').onchange=()=>{duration=minutes(field('end').value)-minutes(field('start').value)};

  el('jeditlabels').onclick=ev=>{
   ev.stopPropagation();
   const originalOpener=opener, draftPanel=sheet.firstElementChild, originalCount=labels.length;
   const currentCategory=Number(field('cat').value), scroll=draftPanel.scrollTop;
   draftPanel.remove();
   returnToEditor=()=>{
    sheet.replaceChildren(draftPanel);opener=originalOpener;
    const selected=labels.length>originalCount?labels.length-1:currentCategory;
    node('#jcatchips').innerHTML=catChips(selected);tint();
    draftPanel.scrollTop=scroll;el('jeditlabels').focus({preventScroll:true});
   };
   labelEditor();
  };
  function syncTime() {
   const on = field('allDay').checked;
   form.querySelectorAll('.jed-t').forEach(n=>{n.hidden=on});
   field('start').disabled = on; field('end').disabled = on;
   syncRows();
  }
  // draws the 시작 › 종료 text; with several picked dates both sides show the first day
  function syncRows(){
   const sel=[...picked].sort(), many=sel.length>1;
   const dayText=k=>{if(!valid(k))return '날짜 선택';const d=asDate(k);return (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+days[d.getDay()]+')'};
   const timeText=t=>{if(!/^\d\d:\d\d$/.test(t))return '--:--';const h=Number(t.slice(0,2));return '<small>'+(h<12?'오전':'오후')+'</small>'+((h%12)||12)+':'+t.slice(3)};
   node('[data-show=date]').textContent=dayText(sel[0]);
   node('[data-show=endDate]').textContent=dayText(many?sel[0]:field('endDate').value);
   node('[data-show=start]').innerHTML=timeText(field('start').value);
   node('[data-show=end]').innerHTML=timeText(field('end').value);
   node('.jed-timegroup').classList.toggle('allday',field('allDay').checked);
  }
  form.addEventListener('input',syncRows);form.addEventListener('change',syncRows);
  function syncRule() {
   const selected = [...picked].sort(), multiple = selected.length !== 1;
   if (multiple) repeat.value = 'none';
   repeat.disabled = multiple || editingOne;
   field('endDate').disabled=multiple;syncRows();
   if(selected.length===1){field('endDate').min=selected[0];if(field('endDate').value<selected[0])field('endDate').value=selected[0];}
   const active = repeat.value !== 'none', weekly = repeat.value === 'week';
   repeatOn.checked = active; repeatOn.disabled = repeat.disabled; node('.jed-rule').hidden = !active;
   node('.jed-interval').hidden = !active; field('interval').disabled = !active;
   node('.jed-until').hidden = !active; field('until').disabled = !active;
   field('until').min = selected[0] || '';
   node('.jed-week').hidden = !weekly;
   if (weekly) node('.jed-week').innerHTML = [...days].map((d,i)=>'<button type="button" data-weekday="'+i+'" aria-pressed="'+weekSelection.has(i)+'">'+d+'</button>').join('');
   const note = node('.jed-note');
   let summary='';
   if(selected.length>1)summary='선택한 '+selected.length+'일에 같은 일정을 한 번씩 등록해요.';
   if(active){
    const count=Number(field('interval').value), suffix={day:'일',week:'주',month:'개월',year:'년'}[repeat.value];
    if(count>=1)summary=count+suffix+'마다 반복';
    if(weekly && weekSelection.size)summary+=' · '+[...weekSelection].sort().map(i=>days[i]).join('·')+'요일';
    if(field('until').value)summary+=' · '+field('until').value.replaceAll('-','.')+'까지';
    if(['month','year'].includes(repeat.value) && Number(selected[0].slice(8))>28)summary+=' (해당 날짜가 없는 달은 건너뛰어요.)';
   }
   note.textContent=summary;
   note.hidden = !note.textContent;
  }
  function drawPicker() {
   const selected = [...picked].sort();
   picker.hidden = !pickerOpen;
   const toggle = node('[data-picker]');
   toggle.lastElementChild.textContent = pickerOpen ? '접기 ⌃' : (selected.length>1 ? selected.length+'일 ›' : '없음 ›');
   toggle.setAttribute('aria-expanded', String(pickerOpen));
   field('date').disabled = selected.length !== 1;
   if (selected.length===1) field('date').value=selected[0];
   if (pickerOpen) {
    const firstOfMonth=asDate(month+'-01'), end=asDate(month+'-01');end.setMonth(end.getMonth()+1,0);
    node('.jed-month strong').textContent=firstOfMonth.getFullYear()+'년 '+(firstOfMonth.getMonth()+1)+'월';
    const heads=[...days].map(d=>'<small>'+d+'</small>').join('');
    const blanks='<span></span>'.repeat(firstOfMonth.getDay());
    const buttons=Array.from({length:end.getDate()},(_,i)=>{
     const k=month+'-'+pad(i+1);
     return '<button type="button" data-pick="'+k+'" aria-label="'+k+'" aria-pressed="'+picked.has(k)+'">'+(i+1)+'</button>';
    });
    node('.jed-days').innerHTML=heads+blanks+buttons.join('');
    node('.jed-picked').textContent=selected.length?'선택 '+selected.length+'일 · '+selected.map(k=>Number(k.slice(5,7))+'/'+Number(k.slice(8))).join(', '):'날짜를 선택하세요';
   }
   syncRule();
  }
  field('allDay').onchange=syncTime;
  field('date').onchange=()=>{
   if (!valid(field('date').value)) return;
   const k=field('date').value, old=[...picked][0], end=field('endDate').value;
   // keep the event's length so moving the start date never silently stretches it
   const span=valid(old)&&valid(end)?Math.max(0,Math.round((asDate(end)-asDate(old))/86400000)):0;
   picked.clear();picked.add(k);month=k.slice(0,7);field('endDate').value=shift(k,span);
   if (repeat.value!=='week') {weekSelection.clear();weekSelection.add(asDate(k).getDay());}
   drawPicker();
  };
  repeat.onchange=syncRule;
  field('interval').oninput=syncRule;
  field('until').onchange=syncRule;
  form.addEventListener('click', ev=>{
   const btn=ev.target.closest('button'); if(!btn)return;
   const {picker:toggle,move,pick,weekday}=btn.dataset;
   if(toggle!==undefined){pickerOpen=!pickerOpen;drawPicker();}
   else if(move){const m=asDate(month+'-01');m.setMonth(m.getMonth()+Number(move));month=key(m).slice(0,7);drawPicker();}
   else if(pick){form.dataset.dirty='true';if(picked.has(pick))picked.delete(pick);else picked.add(pick);if(picked.size===1)field('endDate').value=[...picked][0];if(picked.size===1&&repeat.value!=='week'){weekSelection.clear();weekSelection.add(asDate([...picked][0]).getDay())}drawPicker();}
   else if(weekday!==undefined){form.dataset.dirty='true';const n=Number(weekday);if(weekSelection.has(n))weekSelection.delete(n);else weekSelection.add(n);syncRule();}
  });
  syncTime();drawPicker();
  if(editingOne)node('[data-picker]').hidden=true;
  function withoutOriginal(){
   if(!e)return events;
   if(future&&occurrence<=e.date)return events.filter(x=>x.id!==e.id&&!(x.seriesId===e.id&&x.date>=occurrence));
   if(future)return events.filter(x=>!(x.seriesId===e.id&&x.date>=occurrence)).map(x=>x.id===e.id?{...x,rule:{...x.rule,until:shift(occurrence,-1)}}:x);
   if(detach)return events.map(x=>x.id===e.id?{...x,excludedDates:[...new Set([...(x.excludedDates||[]),occurrence])].sort()}:x);
   return events.filter(x=>x.id!==e.id);
  }
  if(e){
   el('jcopy').onclick=()=>editor(null,[],{copy:{...item,excludedDates:undefined,seriesId:undefined}});
   el('jdel').onclick=()=>{
    if(!window.confirm(future?'이 날짜부터 이후 반복 일정을 삭제할까요?':editingOne?'이 회차만 삭제할까요?':item.rule?'변경된 회차를 포함한 모든 반복 일정을 삭제할까요?':'이 일정을 삭제할까요?'))return;
    events=withoutOriginal().filter(x=>future||!item.rule||x.seriesId!==e.id);
    form.dataset.dirty='false';close(true);render();persist();
   };
  }
  form.onsubmit=ev=>{
   ev.preventDefault();
   const title=field('title').value.trim(), ds=[...picked].sort(), whole=field('allDay').checked;
   const start=whole?'00:00':field('start').value, end=whole?'24:00':field('end').value;
   const unit=repeat.value, interval=Number(field('interval').value), until=field('until').value;
   let error='';
   const url=safeUrl(field('url').value);
   if(!title) error='일정 이름을 입력해 주세요.';
   else if(url===null) error='URL을 확인해 주세요. 예: naver.com';
   else if(!ds.length) error='날짜를 한 개 이상 선택해 주세요.';
   else if(ds.length===1&&field('endDate').value<ds[0])error='종료 날짜를 시작 날짜 이후로 정해 주세요.';
   else if((ds.length!==1||field('endDate').value===ds[0])&&start>=end) error='종료 시간을 시작 시간보다 늦게 정해 주세요.';
   else if(unit==='week'&&!weekSelection.size) error='반복할 요일을 선택해 주세요.';
   const rule=unit==='none'?null:{unit,interval,weekdays:[...weekSelection].sort((x,y)=>x-y),until};
   if(!error&&rule&&!nextOccurrence({date:ds[0],rule},ds[0]))error='반복 종료일까지 해당하는 날짜가 없어요.';
   el('jerr').textContent=error;if(error)return;
   const conflicts=ds.flatMap(day=>list(day).filter(other=>other.id!==e?.id&&!whole&&!other.allDay&&other.start<end&&other.end>start));
   if(conflicts.length&&!confirm('시간이 겹치는 일정이 있어요. '+conflicts.slice(0,3).map(x=>x.start+' '+x.title).join(', ')+' · 그대로 저장할까요?'))return;
   const stamp=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
   const seriesId=detach?e.id:future?undefined:e?.seriesId;
   if(future&&rule)rule.phaseDate=e.rule.phaseDate||e.date;
   const exceptions=rule&&e?.excludedDates?{excludedDates:e.excludedDates.filter(k=>!future||k>=occurrence)}:{};
   const saved=ds.map((k,i)=>({id:i===0&&e&&!detach&&!future?e.id:'e'+stamp+'-'+i,title,...(ds.length===1&&field('endDate').value>k?{endDate:field('endDate').value}:{}),place:field('place').value.trim(),...(url?{url}:{}),memo:field('memo').value.trim(),private:field('private').checked,date:k,start,end,allDay:whole,cat:Number(field('cat').value),alarm:[...new Set([...form.querySelectorAll('[name=alarm]')].map(input=>input.value).filter(v=>v!=='없음'))],...(rule?{rule,...exceptions}:{}),...(seriesId?{seriesId}:{})}));
   let remaining=withoutOriginal();
   if(e?.rule&&!editingOne&&!rule)remaining=remaining.map(x=>{if(x.seriesId!==e.id)return x;const {seriesId,...standalone}=x;return standalone});
   events=[...remaining,...saved];
   date=nextOccurrence(saved[0],saved[0].date)?.date||ds[0];
   slotSel=null;
   form.dataset.dirty='false';agendaOpen=true;close(true);render({jump:true});persist({requestPermission:saved[0].alarm.length>0});
  };
 }
 function moodEditor(k){
  // 기분 = 이모지 하나 + 한 줄 일기(최대 NOTE_MAX자). 여러 줄 메모와 구분되도록 한 줄만 받는다.
  const NOTE_MAX=30;
  const options=[['😊','기뻐요'],['🥰','설레요'],['😌','평온해요'],['😐','무난해요'],['😴','피곤해요'],['😢','슬퍼요'],['😟','걱정돼요'],['😤','화나요']];
  const prior=moods[k], day=asDate(k);
  // 예전에 직접 넣은 이모지는 선택지 맨 앞에 그대로 보여 준다
  if(prior&&!options.some(([emoji,name])=>emoji===prior.emoji&&name===prior.name))options.unshift([prior.emoji,prior.name]);
  let selected=prior?options.findIndex(([emoji,name])=>emoji===prior.emoji&&name===prior.name):-1;
  const choices=options.map(([emoji,name],i)=>'<button type="button" data-mood-index="'+i+'" aria-pressed="'+(selected===i)+'"><span aria-hidden="true">'+emoji+'</span><span>'+esc(name)+'</span></button>').join('');
  const note=typeof prior?.note==='string'?prior.note:'';
  panel('오늘의 한 줄','<form id="jmoodform"><p class="jmoodstamp">'+day.getFullYear()+'년 '+(day.getMonth()+1)+'월 '+day.getDate()+'일 '+days[day.getDay()]+'요일</p><div class="jmoodchoices" role="group" aria-label="기분 선택">'+choices+'</div><label class="jmoodnote"><span>한 줄 일기</span><input name="note" maxlength="'+NOTE_MAX+'" enterkeyhint="done" autocomplete="off" placeholder="오늘을 한 줄로 남겨 보세요" value="'+esc(note)+'"><small aria-live="polite"><b>'+[...note].length+'</b>/'+NOTE_MAX+'</small></label><p id="jmooderror" role="alert"></p><footer>'+(prior?'<button type="button" id="jmoodremove">지우기</button>':'')+'<button type="button" data-act="close">취소</button><button class="jprimary" type="submit">저장</button></footer></form>');
  const form=el('jmoodform'),input=form.elements.note,error=el('jmooderror'),count=form.querySelector('.jmoodnote b');
  function choose(index){
   selected=index;
   form.querySelectorAll('[data-mood-index]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
   error.textContent='';
  }
  form.querySelector('.jmoodchoices').onclick=ev=>{
   const choice=ev.target.closest('[data-mood-index]');if(!choice)return;
   choose(Number(choice.dataset.moodIndex));
  };
  // 붙여넣기로 줄바꿈이 들어와도 한 줄로
  input.oninput=()=>{const one=input.value.replace(/\s*\n\s*/g,' ');if(one!==input.value)input.value=one;count.textContent=[...input.value].length;};
  if(prior)el('jmoodremove').onclick=()=>{delete moods[k];close();render();persist()};
  form.onsubmit=ev=>{
   ev.preventDefault();
   if(selected<0){error.textContent='오늘의 기분을 하나 골라 주세요.';return;}
   const text=input.value.trim().slice(0,NOTE_MAX);
   moods[k]={emoji:options[selected][0],name:options[selected][1],...(text?{note:text}:{})};
   close();render();persist();
  };
  form.querySelector('[data-mood-index="'+Math.max(0,selected)+'"]').focus({preventScroll:true});
 }
 function labelEditor(addNew=false){
  function row(name,color,i){
   return '<div class="jlabelrow"><input type="text" maxlength="28" required aria-label="라벨 '+(i+1)+' 이름" placeholder="새 라벨 이름" value="'+esc(name)+'"><input type="color" aria-label="라벨 '+(i+1)+' 색상" value="'+color+'" data-color="'+i+'"></div>';
  }
  panel('라벨 관리','<form id="jlabelform"><div class="jlabelhead"><span>이름</span><span>색상</span></div><div id="jlabelrows">'+labels.map((l,i)=>row(l,colors[i],i)).join('')+'</div><footer><button type="button" id="jlabeladd">＋ 라벨 추가</button><button type="submit" class="jprimary" data-act="savecolors">저장</button></footer></form>');
  const rows=el('jlabelrows');
  el('jlabeladd').onclick=()=>{
   const i=rows.children.length;
   rows.insertAdjacentHTML('beforeend',row('',['#c99555','#648c90','#9c83a5'][Math.max(0,i-defaultLabels.length)%3],i));
   rows.lastElementChild.querySelector('input').focus();
  };
  if(addNew)el('jlabeladd').onclick();
  el('jlabelform').onsubmit=ev=>{
   ev.preventDefault();
   const names=[],swatches=[];
   for(const element of rows.children){
    const input=element.querySelector('[type=text]'), name=input.value.trim();
    if(!name||names.includes(name)){
     input.setCustomValidity(name?'이미 사용 중인 라벨 이름이에요.':'라벨 이름을 입력해 주세요.');
     input.reportValidity();input.setCustomValidity('');return;
    }
    names.push(name);swatches.push(element.querySelector('[type=color]').value);
   }
   labels=names;colors=swatches;hiddenCats.clear();close();render();persist();
  };
 }
 root.addEventListener('click',event=>{const mark=event.target.closest('[data-event]');if(mark){openEvent(mark.dataset.event,mark.dataset.origin);return}const slot=event.target.closest('[data-slot]');if(slot&&event.target===slot){if(ignoreClick)return;const k=slot.dataset.slot,hr=hourAt(slot,event.clientY);slotSel=slotSel&&slotSel.date===k&&hr>=slotSel.a&&hr<=slotSel.b?null:{date:k,a:hr,b:hr};date=k;agendaOpen=true;render();persist();return}const b=event.target.closest('button');if(!b){if(event.target===sheet)close();return}const a=b.dataset;if(a.catToggle!==undefined){const i=Number(a.catToggle);if(hiddenCats.has(i))hiddenCats.delete(i);else hiddenCats.add(i);root.querySelectorAll('[data-cat-toggle="'+i+'"]').forEach(x=>x.setAttribute('aria-pressed',String(!hiddenCats.has(i))));render();persist();return}if(a.screen){if(!sheet.hidden)close();screen=a.screen;render();persist();return}if(a.act==='close'){close();return}if(a.act==='settings'){settings();return}if(a.act==='cycleview'){view=(view+1)%3;slotSel=null;render({jump:true});persist();return}if(a.act==='jump'){monthPicker();return}if(a.act==='agenda-close'){agendaOpen=false;agendaExpanded=false;renderAgenda();return}if(a.act==='day-add'||a.act==='add'){slotSel?editor(undefined,[slotSel.date],{at:pad(slotSel.a)+':00',to:slotSel.b>=23?'23:59':pad(slotSel.b+1)+':00'}):editor();return}if(a.act==='search'){searchEvents();return}if(a.id){openEvent(a.id,a.instance);return}if(a.act==='mood'){moodEditor(date);return}if(a.act==='labels'||a.act==='newlabel'){labelEditor(a.act==='newlabel');return}if(a.act==='savecolors')return;
 if(['today','next','prev'].includes(a.act))slotSel=null;if(a.act==='today')date=today;if(a.type!==undefined){const i=Number(a.type);modules=modules.includes(i)?modules.filter(n=>n!==i):[...modules,i];expanded=false}if(a.date){selectDate(a.date);return}if(a.act==='next'||a.act==='prev'){const step=a.act==='next'?1:-1;if(view===0){const d=asDate(visibleMonth?visibleMonth+'-01':date),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+step);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));date=key(d)}else date=shift(date,step*(view===1?7:1))}
 if(!sheet.hidden)return;render({jump:a.act==='today'||a.act==='next'||a.act==='prev'});persist()});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden)close()});
 el('jshowmood').onchange=e=>{showMood=e.target.checked;widget();persist()};
 el('jfilter').onchange=e=>{filter=e.target.value==='전체'?'전체':Number(e.target.value);widget();persist()};

const stateKey = 'calendar.v1';
let writes = Promise.resolve();
let startupFailed = false;
let lastWidgetData = null;
let messageTimeout;

function previewTime() {
  const now = new Date();
  return pad(now.getHours()) + ':' + pad(now.getMinutes());
}

function announce(text) {
  const message = el('appmessage');
  message.textContent = text;
  message.hidden = !text;
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => { message.hidden = true; }, 7000);
}

function snapshot() {
  return {date, view, modules, filter, labels, colors, events, screen, moods, showMood, hiddenCats:[...hiddenCats], themeChoice, accentChoice, skinChoice, monthMotion, agendaMode, density};
}

function writeState(data) {
  const value = JSON.stringify(data);
  const pending = writes.then(() => Preferences.set({key: stateKey, value}));
  writes = pending.catch(() => {});
  return pending;
}

function widgetEntries() {
  const result = [];
  const now = Date.now();
  const startDay = key(new Date(now));
  for (const event of events.filter(visible)) {
    let cursor = shift(startDay,-spanDays(event));
    for (let i = 0; i < 64; i++) {
      const item = nextOccurrence(event, cursor);
      if (!item) break;
      const startDate = new Date(item.date + 'T' + item.start + ':00');
      const endDate = item.end === '24:00' ? new Date(shift(item.endDate||item.date, 1) + 'T00:00:00') : new Date((item.endDate||item.date) + 'T' + item.end + ':00');
      if (endDate.getTime() > now) {
        result.push({title: lockTitle(item), from: +startDate, until: +endDate, subtitle: item.date + ' · ' + eventTime(item)});
      }
      if (!event.rule) break;
      cursor = shift(item.date, 1);
    }
  }
  return result.sort((a,b) => a.from-b.from || a.until-b.until).slice(0,64);
}

async function refreshNative(requestPermission = false) {
  if (!Capacitor.isNativePlatform()) return;
  const json = JSON.stringify(widgetEntries());
  if (lastWidgetData !== json) {
    await Preferences.set({key: 'widget.next', value: json});
    lastWidgetData = json;
  }
  const status = await syncReminders(events, nextOccurrence, {requestPermission});
  if (status.status === 'error' || requestPermission && status.status !== 'scheduled') announce(status.message);
}

let syncQueue = Promise.resolve();
function queueNative(requestPermission) {
  syncQueue = syncQueue.then(() => refreshNative(requestPermission)).catch(() => announce('위젯과 알림을 갱신하지 못했어요. 앱을 다시 열면 재시도해요.'));
}
let previousEvents, previousFilter, webAlarmNoted = false;
function persist({requestPermission=false}={}) {
  if(startupFailed) return;
  const changed = previousEvents !== events || previousFilter !== filter;
  previousEvents=events; previousFilter=filter;
  writeState(snapshot()).then(()=>{
    if(changed || requestPermission) queueNative(requestPermission);
    if(requestPermission && !Capacitor.isNativePlatform() && !webAlarmNoted) webAlarmNoted = true, announce('일정을 저장했어요. 기기 알림은 모바일 앱에서 받을 수 있어요.');
  }).catch(()=>announce('변경 내용을 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
}

el('exportwall').onclick = async () => {
  const button=el('exportwall');
  button.disabled=true;
  try { announce(await exportWallpaper(root)); }
  catch(error) { announce(error.message || '이미지를 저장하지 못했어요.'); }
  finally { button.disabled=!modules.length; }
};

initBackup(el('backup'),snapshot, async data=>{
  await writeState(data);
  restore(data);
  render();
  queueNative(false);
});

async function start() {
  try {
    const {value}=await Preferences.get({key:stateKey});
    if(value) restore(parseBackup(value));
    screen='calendar';
    date=today;
    render({jump:true});
    queueNative(false);
    Promise.resolve(initAds(root)).catch(()=>{});
  } catch(error) {
    startupFailed = true;
    root.querySelector('.jlayout').textContent='저장된 달력을 열 수 없어요. 앱을 다시 열어 주세요.';
    announce('저장된 일정을 읽지 못했어요.');
  }
}

function updateClock() {
  if(startupFailed || document.hidden) return;
  const current=key(new Date());
  if(date===today && current!==today) date=current;
  today=current;
  if(sheet.hidden) render();
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && !startupFailed){updateClock();queueNative(false);}
});
setInterval(updateClock,60000);
start();

