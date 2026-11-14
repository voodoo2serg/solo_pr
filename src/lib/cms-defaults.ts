import type {CommunityContent} from './content-types';
import {defaultCopy} from './site-copy';

export function withCmsDefaults(c:CommunityContent):CommunityContent{
 return {
  ...c,
  copy:{...defaultCopy,...c.copy},
  brand:{
   showEmail:true,
   showTelegram:true,
   showMax:true,
   showVk:false,
   ...c.brand,
  },
  home:{heroImage:'',...c.home},
  materials:c.materials.map(i=>({published:true,showOnHome:true,publishedAt:'',image:'',...i})),
  videos:(c.videos||[]).map(i=>({published:true,showOnHome:true,publishedAt:'',...i})),
  courses:c.courses.map(i=>({published:true,showOnHome:true,publishedAt:'',startDate:'',...i})),
  events:(c.events||[]).map(i=>({image:'',...i})),
  modules:{
   materials:{order:'latest',limit:0},
   videos:{order:'latest',limit:0},
   courses:{order:'manual',limit:0},
   ...c.modules,
  },
  seo:{
   ...Object.fromEntries([['home','Соло-PR — PR-экспертиза для бизнеса'],['about','Идея Соло-PR'],['club','Сообщество Соло-PR'],['courses','Обучение Соло-PR'],['consulting','Соло-PR — бизнесу'],['materials','Библиотека Соло-PR'],['mentoring','Менторство'],['contacts','Контакты'],['privacy',c.legal.privacy?.title||'Персональные данные'],['consent',c.legal.consent?.title||'Согласие на обработку данных'],['cookies',c.legal.cookies?.title||'Правила cookie'],['terms',c.legal.terms?.title||'Условия использования'],['login','Войти'],['register','Регистрация'],['account','Личный кабинет'],['admin','Управление сайтом'],['events','Встречи сообщества']].map(([key,title])=>[key,{title,description:key==='home'?c.home.intro:c.pages[key]?.intro||'Материалы и видео о коммуникациях, экспертизе и задачах бизнеса.',keywords:'Соло-PR, коммуникации, PR, бизнес'}])),
   ...c.seo,
  },
 };
}
