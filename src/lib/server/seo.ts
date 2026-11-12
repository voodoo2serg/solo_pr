import type {Metadata} from 'next';
import {content} from './store';
export function pageMetadata(route:string):Metadata{const c=content(),key=route.replace(/^\//,'')||'home',section=key.split('/')[0];const item=section==='courses'?c.courses.find(i=>i.id===key.split('/')[1]&&i.published!==false):section==='materials'?c.materials.find(i=>i.id===key.split('/')[1]&&i.published!==false):undefined;
 const selected=c.seo?.[key]||(!item?c.seo?.[section]:undefined);const title=selected?.title||item?.title||c.pages[section]?.title||c.brand.name,description=selected?.description||item?.description||c.pages[section]?.intro||c.home.intro;
 const privatePage=['account','admin','login','register','events','order'].includes(section);return {title,description,keywords:selected?.keywords||undefined,alternates:{canonical:route},robots:privatePage?{index:false,follow:false}:undefined,openGraph:{title,description,type:'website',locale:'ru_RU'}};
}

export function initialPublicContent(){const c=content();return {...c,materials:c.materials.filter(m=>m.published!==false).map(({body,...m})=>m),courses:c.courses.filter(m=>m.published!==false),videos:(c.videos||[]).filter(m=>m.published!==false),events:[]};}
