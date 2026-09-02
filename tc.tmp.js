const Database=require('better-sqlite3');const db=new Database('database.sqlite',{readonly:true});
const t=db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all();
const full=[],empty=[];
for(const {name} of t){let c=0;try{c=db.prepare(`select count(*) c from "${name}"`).get().c}catch(e){}
 (c>0?full:empty).push(`${name}:${c}`)}
console.log('TOTAL',t.length,'| NON-VIDES',full.length,'| VIDES',empty.length);
console.log('\n--NON VIDES--\n'+full.join('\n'));
console.log('\n--VIDES--\n'+empty.map(x=>x.split(':')[0]).join(', '));
