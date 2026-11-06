// v252: единственный владелец продвижения игрового времени.
G.define('day', function(G) {
  const SLOTS=['Утро','День','Вечер','Ночь'], HOURS=[7,12,18,23];
  function stamp(s){s.clock=s.day.date+'T'+String(HOURS[s.day.slot]).padStart(2,'0')+':00';}
  function die(s){s.hero.dead=true;s.hero.hp=0;G.sysinv.onDeath(s.hero);}
  function validate(s){const d=s.day;if(!d||!Number.isInteger(d.n)||d.n<1||!Number.isInteger(d.slot)||d.slot<0||d.slot>3||!Array.isArray(d.used)||typeof d.story_done!=='boolean')throw Error('Сохранение не относится к каркасу v252');G.clock.toMin(d.date+'T07:00');const expected=d.date+'T'+String(HOURS[d.slot]).padStart(2,'0')+':00';if(s.clock!==expected)throw Error('Повреждено время дня');if(d.used.length!==d.slot||d.used.some((x,i)=>x.slot!==i))throw Error('Повреждены использованные слоты');}
  function begin(s,data,n=1,date='2026-09-01'){
    if(s.hero.dead)throw Error('Конец');
    s.day={n,date,slot:0,used:[],story_done:false,start:snapshot(s.hero,s)};stamp(s);
    if(G.plot)G.plot.catchUp(s);   // сцены прошлых дней без Сиу — только их последствия
    if(G.gates)G.gates.roll(s,data);   // новый день: может открыться разлом
    if(G.plot)G.plot.pickSide(s);   // побочное задание сценаристов на сегодня
    if(G.quests)G.quests.morning(s,data);   // типовые задания (выключены: chance 0)
    if(G.living){const first=!s.living;s.day.meals=G.living.morning(s,first);}
    if(G.school)G.school.morning(s);
    if(G.heat)G.heat.morning(s);
    if(G.forge)G.forge.morning(s);   // просроченные заказы кузнеца и Чо   // внимание Ассоциации: остывает; на порогах — визит инспектора   // учёба: Сунын, результаты, предупреждения классного   // быт: счета, пени, еда
    if(!s.hero.dead)G.save.write('auto',s,data);
  }
  // Снимок на начало дня — для экрана «Итог дня» (что изменилось за день).
  function snapshot(h,s){return {money:h.money||0,study:(h.school||{}).progress||0,trust:Object.values(s.relations||{}).reduce((a,r)=>a+(r.trust||0),0),level:h.level||0,xp:(h.sys||{}).xp||0,coins:(h.sys||{}).coins||0};}
  function advance(s,data,activity,detail,meta){
    if(s.hero.dead)throw Error('Конец');
    if(s.day.slot===3)throw Error('Нужно подвести итог дня');
    if(s.battle||s.pending||s.gateRun||(s.plot&&s.plot.run))throw Error('Текущее дело не завершено');
    if(G.plot)G.plot.closeSlot(s,s.day.slot);   // слот ушёл: несыгранные сцены этого слота прошли без Сиу
    s.day.used.push(Object.assign({slot:s.day.slot,activity,detail:detail||''},meta?{meta}:{}));s.day.slot++;stamp(s);if(G.gates)G.gates.tick(s);if(G.quests){G.quests.event(s,'act',{act:activity,meta});G.quests.check(s);G.quests.expire(s);}
    if(!s.hero.dead&&!s.battle&&!s.pending&&!s.gateRun&&!(s.plot&&s.plot.run))try{G.save.write('last',s,data);}catch(e){}   // автосохранение после каждого слота дня
  }
  // Ночной сон: восстанавливает долю HP и MP (rules.day.sleep_hp / sleep_mp). Полностью — только дело «Отдых».
  function sleepGain(h,data,s){const c=data.rules.day,hpMax=G.system.maxHp(h),cap=G.system.mpCap(h);
    const k=G.living&&s?G.living.sleepMul(s):1;   // холод в квартире (неоплаченная коммуналка) — сон лечит хуже
    const hp=G.passives.has(h,'no_heal_all')?0:Math.max(0,Math.min(hpMax-h.hp,Math.round(hpMax*(c.sleep_hp??0.5)*k)));
    const mp=Math.max(0,Math.min(cap-h.mp,Math.round(G.system.maxMp(h)*(c.sleep_mp??0.5)*k)));return {hp,mp};}
  function next(s,data){if(s.day.slot!==3||s.hero.dead)throw Error('День ещё не завершён');(s.history||(s.history={}))[s.day.date]=s.day.used.map(u=>u.activity).filter(a=>a!=='story');const g=sleepGain(s.hero,data,s);s.hero.hp+=g.hp;if(g.mp)G.system.addMp(s.hero,g.mp);begin(s,data,s.day.n+1,G.clock.advance(s.day.date+'T07:00',1440).slice(0,10));}
  function count(s,id){return s.day.used.filter(x=>x.activity===id || (x.also || []).includes(id)).length;}
  function can(s,id,data){
    if(s.hero.dead)return 'Конец';if(s.battle||s.pending||(s.plot&&s.plot.run))return 'Сначала заверши текущее дело';
    if(s.day.slot===3)return 'Ночью — итог дня';if(!s.day.story_done)return 'Сначала сюжетный слот';if(s.penalty_zone&&id!=='penalty')return 'Сначала — Штрафная зона';
    if(id==='train'&&count(s,id)>=1)return 'Тренировка уже была сегодня';
    if(id==='study'&&s.day.date>=data.rules.day.graduation)return 'Учёба завершена';
    if(id==='study'&&count(s,id)>=2)return 'Лимит учёбы на сегодня';
    if(s.gateRun)return 'Сначала выйди из Врат';if(id==='gate'&&!s.hero.awakened)return 'До пробуждения во Врата не войти';if(s.breach_here&&id!=='breach')return 'Прорыв прямо здесь — сначала бой';if(s.inspector)return 'У подъезда ждёт инспектор';
    if(!['gate','train','work','person','study','rest','human','scene','penalty','suneung','breach'].includes(id))return 'Неизвестное дело';
    if(id==='suneung'&&!(G.school&&G.school.examToday(s)))return 'Сунын сегодня не сдать';
    if(id==='study'&&G.school&&G.school.examToday(s))return 'Сегодня Сунын';
    if(id==='work'&&!jobs(s,data).some(x=>!x.why))return 'Сейчас смен нет';
    return '';
  }
  function finishStory(s,data){if(s.hero.dead||s.day.story_done||s.day.slot!==0)throw Error('Сюжетный слот недоступен');s.day.story_done=true;advance(s,data,'story','Сюжетный слот');}
  function action(s,data,id,arg){const err=can(s,id,data);if(err)throw Error(err);
    const h=s.hero,cfg=data.rules.day;let detail='',meta=null;
    if(id==='gate'){
      const g=arg?G.gates.byId(s,arg):G.gates.known(s)[0];
      if(!g||!G.gates.known(s).includes(g))throw Error('Рядом нет открытых врат — смотри «Понхва»');
      h.location=g.place;G.gates.map(s,g);s.gateRun={id:g.id,worst:'easy',fights:0};if(G.heat)G.heat.add(s,1);return 'gatemap';
    }
    if(id==='penalty'){if(!s.penalty_zone)throw Error('Штрафной зоны нет');const rk=s.penalty_zone.rank||G.hero.powerRank(s),pool=data.bestiary.species.filter(x=>x.rank===rk&&x.role==='regular'&&!String(x.id).startsWith('H-'));const pick=k=>(pool[(s.day.n*7+k*13+(s.seed>>>0))%Math.max(1,pool.length)]||data.bestiary.species.find(x=>x.rank==='F'&&x.role==='regular')).id;s.battle=G.combat.start(s,data,[pick(0),pick(1)],{lethal:true,survive:true});s.battleActivity='penalty';return 'battle';}
    if(id==='suneung'){const g=G.school.take(s);h.location='nowon:school';advance(s,data,'suneung','Сунын: экзамен сдан, результаты 4 декабря');if(s.day.slot===2)advance(s,data,'suneung','Сунын: последние бланки');return 'Сунын позади. Восемь часов, пять предметов, тишина в классе. Результаты — '+G.clock.format(G.school.C().results+'T07:00').date+'.';}
    if(id==='breach'){const g=G.gates.byId(s,arg||s.breach_here);if(!g||g.status!=='breach')throw Error('Прорыва здесь нет');h.location=g.place;s.battle=G.combat.start(s,data,G.gates.breachEnemies(s,data,g),{lethal:true,ambush:s.breach_here===g.id});s.battleActivity='breach';s.breachId=g.id;return 'battle';}
    if(id==='human'){s.battle=G.combat.start(s,data,['H-F-thug'],{lethal:true});s.battleActivity=id;return 'battle';}
    goTo(s,data,id);
    if(id==='train'){const k=arg||'str';if(!['str','agi','vit','per'].includes(k))throw Error('Эту характеристику нельзя тренировать');const n=G.system.train(s,k,cfg.training_bonus);detail='Тренировка: +'+n;meta={stat:k,n};s.journal.push({at:s.clock,action:'train',stat:k});}
    if(id==='work'){const J=jobs(s,data).filter(x=>!x.why);const j=arg?J.find(x=>x.job.id===arg):(J.find(x=>x.job.place===h.location)||J[0]);if(!j)throw Error(arg?((jobs(s,data).find(x=>x.job.id===arg)||{}).why||'Нет такой работы'):'Сейчас смен нет');
      const mul=s.workMul||1;delete s.workMul;const pay=Math.round(j.job.pay*mul/1000)*1000;h.location=j.job.place;G.hero.charge(h,s.clock,pay,'Работа: '+j.job.employer+(mul>1?' (с премией)':mul<1?' (со штрафом)':''));detail='Смена «'+j.job.employer+'» завершена. Зачисление в Банке';meta={money:pay,job:j.job.id,mul};
      if(G.plot){const V=G.plot.state(s).vars;V['shifts_'+j.job.id]=(V['shifts_'+j.job.id]||0)+1;}}
    if(id==='person'){if(!data.dayPeople.some(p=>p.id===arg))throw Error('Выбери человека');s.pending={type:'person',npc:arg};return 'scene';}
    if(id==='study'){h.school.progress=(h.school.progress||0)+1;s.journal.push({at:s.clock,action:'school_class'});detail='Учёба: +1 занятие';}
    if(id==='rest'){if(!G.passives.has(h,'no_heal_all'))h.hp=G.system.maxHp(h);G.system.addMp(h,G.system.mpCap(h)*2);detail='Отдых завершён';s.journal.push({at:s.clock,action:'sleep',minutes:360});}
    if(!h.dead)advance(s,data,id,detail,meta);
    return detail;
  }
  function meet(s,id){const r=s.relations[id]||(s.relations[id]={met:false,talks:0,trust:0});r.met=true;r.talks++;r.trust=(r.trust||0)+1;s.journal.push({at:s.clock,action:'choice',type:'talk',npc:id});}
  function finishPerson(s,data){if(!s.pending||s.pending.type!=='person'||s.hero.dead)throw Error('Нет встречи');const npc=s.pending.npc;meet(s,npc);delete s.pending;advance(s,data,'person','Связь +1',{npc});}
  function finishBattle(s,data){const st=s.battle;if(!st||!st.over)throw Error('Бой ещё идёт');const result=G.combat.finish(s,data,st);const a=s.battleActivity;delete s.battle;delete s.battleActivity;if(a==='penalty'&&!s.hero.dead){delete s.penalty_zone;if(st.result==='lost'&&G.quests)G.quests.addDebuff(s,{name:'Выброшен из зоны',days:3,stats:2,mp_pct:30});else if(st.result!=='won'&&G.quests)G.quests.addDebuff(s,{name:'Бегство из зоны',days:2,stats:2});}if(G.quests&&!s.hero.dead){const b=G.plot.summarize(st);G.quests.event(s,'battle',b);}if(a==='breach'){const bid=s.breachId;delete s.breachId;if(st.result==='won'&&!s.hero.dead)G.gates.stopBreach(s,bid);else if(s.breach_here===bid)delete s.breach_here;}if(s.gateId&&s.gateRun&&!s.hero.dead){const g=G.gates.byId(s,s.gateId),M=G.gates.map(s,g),R=s.gateRun,node=M.nodes[R.target],b=G.plot.summarize(st);delete s.gateId;delete R.target;R.fights++;if(b.style==='hard')R.worst='hard';
      if(st.result==='won'){node.state='done';M.pos=node.id;(M.trail||(M.trail=[])).push(node.id);if(node.kind!=='boss'){result.inGate=true;return result;}G.gates.closedBySiu(s,g.id);if(G.quests)G.quests.event(s,'gate',{turns:b.turns});if(G.achievements&&s.hero.awakened){G.achievements.note(s,'gate',g.rank);if(!(M.trail||[]).some(id=>M.nodes[id]&&M.nodes[id].kind==='rest'))G.achievements.note(s,'solo',g.rank);G.achievements.check(s);}return gateEnd(s,data,s.hero.hp<G.system.maxHp(s.hero)*0.35?'hard':R.worst,'Врата закрыты',result);}
      return gateEnd(s,data,'fled','Отступление из Врат',result);}
    if(s.gateId)delete s.gateId;if(!s.hero.dead)advance(s,data,a,st.result==='won'?'Победа': 'Отступление',{result:st.result,xp:st.result==='won'?(result.rewards||{}).xp||0:0,enemies:st.enemies.map(id=>st.units[id].name)});return result;}
  // Сюжетный бой внутри сцены: итог боя пишется в сюжет, слот не тратится — сцена продолжается.
  // Врата: конец захода (хозяин убит, бегство или выход между узлами) — слот уходит один на весь заход.
  function gateEnd(s,data,last,detail,result){const R=s.gateRun;delete s.gateRun;if(G.plot){const V=G.plot.state(s).vars,g=R&&G.gates.byId(s,R.id);V.gate_runs=(V.gate_runs||0)+1;V.gate_last=last;V.gate_depth=g?G.gates.depth(g):0;}advance(s,data,'gate',detail,{result:last==='fled'?'fled':'won',fights:R?R.fights:0});return result||{};}
  // Шаг по карте: следующий узел — бой (вернёт 'battle') или событие «?» (вернёт текст).
  // Шаг по карте: выбранный узел из доступных. Бой — вернёт 'battle'; «?» — бой или {scene}; сокровище и отдых — {text}.
  function gateStep(s,data,nodeId){const R=s.gateRun;if(!R||s.battle)throw Error('Ты не во Вратах');const g=G.gates.byId(s,R.id),M=G.gates.map(s,g),opts=G.gates.options(s,g);
    const node=nodeId===undefined?opts[0]:opts.find(n=>n.id===nodeId);if(!node)throw Error('Туда отсюда не пройти');const h=s.hero;
    const fight=()=>{R.target=node.id;s.battle=G.combat.start(s,data,G.gates.nodeEnemies(s,data,g,node.id),{lethal:true});s.battleActivity='gate';s.gateId=g.id;return 'battle';};
    const pass=()=>{node.state='done';M.pos=node.id;(M.trail||(M.trail=[])).push(node.id);};
    if(['fight','elite','boss'].includes(node.kind))return fight();
    if(node.kind==='event'){const e=G.gates.reveal(s,g,node.id);if(e==='fight')return fight();pass();node.event=e;return {scene:node.scene};}
    const hpMax=G.system.maxHp(h),mpMax=G.system.mpCap(h);
    if(node.kind==='rest'){const a=Math.round(hpMax*0.3),b=Math.round(mpMax*0.25);h.hp=Math.min(hpMax,h.hp+a);G.system.addMp(h,b);pass();return {text:'Тихая ниша, куда не доходит гул разлома. Сиу садится спиной к стене и даёт телу пару минут. +'+a+' HP, +'+b+' MP.'};}
    if(node.kind==='treasure'){const sp=data.bestiary.species.find(x=>x.id===G.gates.pickSpecies(s,data,g,'regular',node.id+60)),m=sp&&sp.material,n=2+(node.id+(s.seed>>>0))%2,mats={},items=[];if(m)mats[m.id]={units:n,name:m.name,price_won:m.price_won};
      const roll=((s.seed>>>0)^Math.imul(node.id+17,0x9e3779b1))>>>0;const pool=(data.catalog.items||[]).filter(it=>it.rank===g.rank);if(pool.length&&roll%100<25){const it=pool[roll%pool.length];items.push({id:it.id,name:it.name,slot:(it.stats||{}).eq,rank:it.rank,price_won:it.price_won,desc:it.desc,uid:it.id+'@'+s.clock+'#t'+node.id});}
      const r=G.sysinv?G.sysinv.addLoot(s,data,mats,items):{left:[]};pass();return {text:'Сокровище разлома: '+(m?'«'+m.name+'» ×'+n:'')+(items.length?', «'+items[0].name+'»':'')+'.'+(r.left.length?' Не влезло: '+r.left.join(', ')+'.':'')};}
    throw Error('Неизвестный узел');}
  function gateLeave(s,data){if(!s.gateRun||s.battle)throw Error('Ты не во Вратах');return gateEnd(s,data,'fled','Вышел из Врат');}
  function finishPlotBattle(s,data){const st=s.battle;if(!st||!st.over)throw Error('Бой ещё идёт');const def=s.plotBattle||{};const result=G.combat.finish(s,data,st);delete s.battle;delete s.battleActivity;delete s.plotBattle;if(G.quests&&!s.hero.dead)G.quests.event(s,'battle',G.plot.summarize(st));if(!s.hero.dead)G.plot.battleDone(s,st,def);else if(def.bad){const E=((data.story||{}).endings||{})[def.bad];if(E)s.hero.ending={id:def.bad,title:E.title,text:E.text};}return result;}
  function startPlotBattle(s,data,def){const ids=(def.enemies||[]).map(e=>typeof e==='object'?e.species:e);s.battle=G.combat.start(s,data,ids,{lethal:def.lethal!==false,allies:def.allies,survive:!!def.capture});s.battleActivity='plot';s.plotBattle=def;return s.battle;}
  // Сцена-предложение в слоте дня/вечера (mode:"offer") заняла слот целиком.
  function finishScene(s,data,title){if(s.day.slot===0||s.day.slot===3)return;const old=s.plot.run;s.plot.run=null;advance(s,data,'scene',title||'Сцена');s.plot.run=old;}
  // Работа: конкретные работодатели (places.json → jobs), у каждой — свои слоты, оплата и требования.
  function jobs(s,data){const slot=['morning','day','evening','night'][s.day.slot];return ((data.places||{}).jobs||[]).filter(j=>!j.if||!G.plot||G.plot.test(s,j.if)).map(j=>({job:j,why:G.gates&&G.gates.breachAt(s,j.place)?'Прорыв: место оцеплено':!(j.slots||[]).includes(slot)?'Смены: '+j.slots.map(x=>({day:'день',evening:'вечер',morning:'утро'})[x]).join(', '):j.need&&G.plot&&!G.plot.test(s,j.need)?(j.need_text||'Не подходишь'):''}));}
  // Дело делается в своём месте: Сиу идёт туда сам (по району — без затрат времени).
  function goTo(s,data,act){const P=((data.places||{}).places||[]).filter(p=>!p.if||!G.plot||G.plot.test(s,p.if));const here=P.find(p=>p.id===s.hero.location);if(here&&(here.acts||[]).includes(act))return;const p=P.find(x=>(x.acts||[]).includes(act));if(p){s.hero.location=p.id;if(G.quests)G.quests.event(s,'visit',{place:p.id});}}
  // Навигатор: перейти в другое место района. Слот не тратится.
  function move(s,data,place){if(s.hero.dead)throw Error('Конец');if(s.battle||s.pending||(s.plot&&s.plot.run))throw Error('Сначала заверши текущее дело');if(!data.locById[place])throw Error('Нет такого места');s.hero.location=place;if(G.quests)G.quests.event(s,'visit',{place});}
  function escape(s,data,how){const err=can(s,'human',data);if(err)throw Error(err);if(how==='bribe')G.hero.charge(s.hero,s.clock,-data.rules.day.bribe,'Откуп');else if(how==='help'){if(!Object.values(s.relations).some(r=>r.trust>=3))throw Error('Некого позвать');}else if(how!=='leave')throw Error('Неизвестный выход');advance(s,data,'human','Конфликт завершён без боя',{how});}
  return {jobs,move,goTo,gateStep,gateLeave,finishPlotBattle,startPlotBattle,finishScene,sleepGain,snapshot,SLOTS,HOURS,stamp,die,validate,begin,advance,next,count,can,action,finishStory,finishPerson,finishBattle,escape};
});
// Метки совместимости для проверенных модулей. Ни один вызов spend не расходует слот:
// затраты завершает day.action/finishBattle/finishStory ровно один раз.
G.define('clock',function(){
  function toMin(t){if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t))throw Error('Неверная дата');const n=Date.parse(t+':00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,16)!==t)throw Error('Неверная дата');return n/60000;}
  const fromMin=n=>{if(!Number.isFinite(n))throw Error('Неверное время');return new Date(n*60000).toISOString().slice(0,16);};
  const advance=(t,n)=>fromMin(toMin(t)+n),diff=(a,b)=>toMin(b)-toMin(a);
  function parts(t){const d=new Date(toMin(t)*60000);return {y:d.getUTCFullYear(),mo:d.getUTCMonth(),d:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes(),wd:d.getUTCDay()};}
  function format(t){const d=new Date(toMin(t)*60000);return {date:d.toLocaleDateString('ru-RU',{timeZone:'UTC'}),time:G.day.SLOTS[Math.max(0,G.day.HOURS.findLastIndex(h=>h<=d.getUTCHours()))],weekday:d.toLocaleDateString('ru-RU',{weekday:'long',timeZone:'UTC'})};}
  return {toMin,fromMin,advance,diff,parts,format};
});
G.define('time',()=>({spend:()=>({ok:true,slots:0})}));
