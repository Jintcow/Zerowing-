G.define('bootstrap',function(G){
 const HERO_NAME='Кан Сиу';   // герой всегда Кан Сиу (02.11.2026); в сценах — коротко «Сиу»
 const FILES={heroStart:'hero_start',rules:'rules',cards:'cards',bestiary:'bestiary',catalog:'catalog',characters:'characters',people:'people',art:'art',texts:'texts',encounters:'encounters',hunter:'hunter',story:'story',places:'places',quests:'quests',news:'news',forge:'forge'};
 async function load(reader,opts){const d={};await Promise.all(Object.entries(FILES).map(async([k,n])=>d[k]=await reader('data/public/'+n+'.json')));
 // Части сюжета — отдельными файлами (story.include); тестовые сцены — только в тестах и по ?demo=1 (тогда пролог 1–9.09 не грузится: тестовые сцены стоят на тех же днях).
 const demo=(opts&&opts.demo)||(typeof location!=='undefined'&&/[?&]demo=1/.test(location.search||''));
 for(const p of (d.story.include||[]).filter(p=>!(demo&&p==='story/c1p0.json')).concat(demo?['story/demo.json']:[])){const x=await reader('data/public/'+p);d.story.scenes=(d.story.scenes||[]).concat(x.scenes||[]);for(const k of ['vars','cast','endings'])if(x[k])d.story[k]=Object.assign({},d.story[k],x[k]);}
 // Только идентификаторы мест для совместимости, без карты, маршрутов и старых сцен.
 // Места района — data/public/places.json (навигатор, врата, где какое дело).
 d.locById=Object.fromEntries(d.places.places.map(p=>[p.id,Object.assign({tags:[p.id.split(':')[1]]},p)]));
 // Район и город — для шапки дня («Сеул · Норвон»): часть id места до двоеточия.
 d.districts={[d.places.district.id]:d.places.district};
 d.stage1=true;
 // С кем можно провести время (дело «Человек») — персонажи сюжета с meet:true.
 d.dayPeople=Object.entries(d.story.cast||{}).filter(([,c])=>c.meet).map(([id,c])=>Object.assign({id},c));
 d._matIndex=Object.fromEntries(d.bestiary.species.filter(s=>s.material).map(s=>[s.material.id,s.material]));
 if(G.crystals){G.crystals.use(d);for(const m of G.crystals.all())d._matIndex[m.id]=m;}
 G.data=d;G.hero.useRules(d.rules);G.art.use(d.art);G.texts.use(d.texts);G.story.setData(d);G.quests.use(d);if(G.achievements)G.achievements.use(d);if(G.living)G.living.use(d);if(G.news)G.news.use(d);if(G.market)G.market.use(d);if(G.shop)G.shop.use(d);if(G.school)G.school.use(d);if(G.forge)G.forge.use(d);
 const plotErr=G.plot.validate(d);if(plotErr.length)throw Error('Ошибки в story.json:\n'+plotErr.slice(0,20).join('\n'));
 const errors=G.cards.validate(d);if(errors.length)throw Error(errors.join('\n'));return d;
 }
 function newSave(d,name,seed){const s={version:1,build:252,seed:seed>>>0,clock:'2026-09-01T07:00',hero:G.hero.create(d.heroStart,HERO_NAME,'nowon:home'),entities:{},owners:{},gates:{},facts:{},knowledge:[],events:{},scenes_seen:[],relations:{},journal:[]};
 s.hero.bills=[];delete s.hero.housing;delete s.hero.energy;
 s.hero.awakening_at='2099-01-01T00:00';G.system.prepare(s,d);G.day.begin(s,d);return s;}   // Сиу начинает без Системы: пробуждение — только сценой ({"awaken":true}), по сюжету 17.09
 return {HERO_NAME,FILES,load,newSave};
});
