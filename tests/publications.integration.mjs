import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const temp=mkdtempSync(path.join(tmpdir(),'solo-cms-'));
try{
 await build({entryPoints:['src/lib/publications.ts','src/lib/cms-defaults.ts'],outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
 const {selectPublications,videoEmbed,publicationError,courseDate}=await import('file://'+path.join(temp,'publications.mjs'));
 const {withCmsDefaults}=await import('file://'+path.join(temp,'cms-defaults.mjs'));
 const items=Array.from({length:8},(_,i)=>({id:String(i),publishedAt:`2026-01-0${i+1}`,published:i!==7,showOnHome:i!==6}));
 assert.deepEqual(selectPublications(items,{order:'latest',limit:5},true).map(i=>i.id),['5','4','3','2','1']);
 assert.equal(Math.ceil(selectPublications(items,{order:'latest',limit:5},true).length/3),2);
 assert.equal(selectPublications(items,undefined,false).length,7);
 assert.deepEqual(selectPublications(items,{order:'oldest',limit:2}).map(i=>i.id),['0','1']);
 assert.equal(items[0].id,'0');
 assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(videoEmbed('https://vk.com/video_ext.php?oid=-42&id=123&hash=abc123&autoplay=1'),'https://vk.com/video_ext.php?oid=-42&id=123&hash=abc123');
 for(const url of ['javascript:alert(1)','https://evil.test/embed/x','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil@youtube.com/watch?v=dQw4w9WgXcQ','<iframe src="https://youtube.com/embed/dQw4w9WgXcQ">','https://vk.com/video_ext.php?oid=1&id=x'])assert.equal(videoEmbed(url),null);
 assert.equal(courseDate({dateLabel:''}),'Дата набора уточняется');assert.match(courseDate({startDate:'2026-11-22',dateLabel:''}),/22 ноября 2026/);
 const base={brand:{name:'Test'},home:{intro:'Original'},pages:{},materials:[],videos:[],courses:[],events:[],legal:{}};
 const migrated=withCmsDefaults({...base,copy:{'Войти':'Мой вход'},seo:{home:{title:'My title',description:'My description',keywords:'test'}}});
 assert.equal(migrated.copy['Войти'],'Мой вход');assert.equal(migrated.seo.home.title,'My title');assert.deepEqual(withCmsDefaults(migrated),migrated);
 assert.equal(publicationError(migrated),null);assert.match(publicationError({...migrated,modules:{...migrated.modules,videos:{order:'latest',limit:-1}}}),/Лимит/);
 assert.match(publicationError({...migrated,videos:[{id:'v',title:'Test',url:'https://evil.test',published:true}]}),/Видео/);
 console.log('Publication selection, pagination, video allowlist, course dates and CMS migration checks passed.');
}finally{rmSync(temp,{recursive:true,force:true})}
