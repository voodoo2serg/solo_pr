import type {PublicationOptions,ModuleSettings,CommunityContent} from './content-types';
export function selectPublications<T extends PublicationOptions>(items:T[],settings?:ModuleSettings,home=false):T[]{
 const selected=items.filter(i=>i.published!==false&&(!home||i.showOnHome!==false));
 if(settings?.order&&settings.order!=='manual')selected.sort((a,b)=>((Date.parse(a.publishedAt||'')||0)-(Date.parse(b.publishedAt||'')||0))*(settings.order==='latest'?-1:1));
 return settings?.limit?selected.slice(0,settings.limit):selected;
}
export function videoEmbed(input:string):string|null{
 try{const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.toLowerCase();
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)){
 const id=host==='youtu.be'?u.pathname.slice(1):u.pathname.startsWith('/embed/')||u.pathname.startsWith('/shorts/')?u.pathname.split('/')[2]:u.searchParams.get('v');
 return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?'https://www.youtube-nocookie.com/embed/'+id:null;}
 if(['vk.com','www.vk.com','vkvideo.ru','www.vkvideo.ru'].includes(host)&&u.pathname==='/video_ext.php'){
 const oid=u.searchParams.get('oid'),id=u.searchParams.get('id'),hash=u.searchParams.get('hash');if(!oid||!id||!/^[-]?\d+$/.test(oid)||!/^\d+$/.test(id)||hash&&!/^[a-zA-Z0-9]+$/.test(hash))return null;
 const q=new URLSearchParams({oid,id});if(hash)q.set('hash',hash);return 'https://'+(host.includes('vkvideo')?'vkvideo.ru':'vk.com')+'/video_ext.php?'+q.toString();}
 }catch{}return null;
}
export function publicationError(c:CommunityContent):string|null{
 for(const name of ['materials','videos','courses'] as const){
 const list=c[name]||[];if(!Array.isArray(list)||list.length>300)return 'Слишком много публикаций';const ids=new Set<string>();
 for(const item of list){if(!/^[a-z0-9-]{1,80}$/.test(item.id)||ids.has(item.id)||!item.title?.trim())return 'Проверьте коды и заголовки публикаций';ids.add(item.id);
 for(const key of ['published','showOnHome'] as const)if(item[key]!==undefined&&typeof item[key]!=='boolean')return 'Проверьте видимость публикаций';
 if(item.publishedAt&&!Number.isFinite(Date.parse(item.publishedAt)))return 'Проверьте дату публикации';}
 const m=c.modules?.[name];if(m&&(!['manual','latest','oldest'].includes(m.order)||!Number.isInteger(m.limit)||m.limit<0||m.limit>300))return 'Лимит должен быть от 0 до 300';
 }
 for(const v of c.videos||[])if(v.url&&!videoEmbed(v.url))return 'Видео: укажите ссылку YouTube или официальный src плеера ВК video_ext.php';
 for(const course of c.courses)if(course.startDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(course.startDate)||!Number.isFinite(Date.parse(course.startDate))||new Date(course.startDate).toISOString().slice(0,10)!==course.startDate))return 'Проверьте дату начала курса';
 if(c.copy&&Object.values(c.copy).some(v=>typeof v!=='string'))return 'Тексты интерфейса должны быть строками';
 if(c.seo&&Object.values(c.seo).some(v=>!v||['title','description','keywords'].some(k=>typeof v[k as keyof typeof v]!=='string')))return 'Проверьте SEO-поля';
 return null;
}
export function courseDate(c:{startDate?:string;dateLabel:string}){return c.startDate?new Date(c.startDate+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):c.dateLabel?.trim()||'Дата набора уточняется';}
