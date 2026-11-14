export type PublicationOptions={published?:boolean;showOnHome?:boolean;publishedAt?:string;};

export type ModuleSettings={order:'manual'|'latest'|'oldest';limit:number;};

export type Video=PublicationOptions&{id:string;title:string;description:string;url:string;image:string;};

export type Course=PublicationOptions&{startDate?:string;id:string;title:string;description:string;image:string;dateLabel:string;status:'planned'|'active'|'completed';format:string;topics:string[];lmsCourseId?:string;lmsLaunchUrl?:string;};

export type Material=PublicationOptions&{id:string;title:string;description:string;category:string;access:'open'|'club';minutes:string;body:string;image?:string;};

export type CommunityEvent={id:string;title:string;description:string;start:string;end:string;format:string;access:'open'|'club';roomUrl:string;recordingUrl:string;image?:string;};

export type PageContent={eyebrow:string;title:string;intro:string;quote?:string;sections:{title:string;text:string}[];};

export type BrandFooterToggles={
 showEmail?:boolean;
 showTelegram?:boolean;
 showMax?:boolean;
 showVk?:boolean;
};

export type CommunityContent={
 copy?:Record<string,string>;
 modules?:Record<'materials'|'videos'|'courses',ModuleSettings>;
 seo?:Record<string,{title:string;description:string;keywords:string}>;
 brandRevision?:number;
 presentationRevision?:number;
 brand:{
  name:string;
  tagline:string;
  email:string;
  max?:string;
  registered?:string;
  activity?:string;
  telegram:string;
  vk:string;
  operator:string;
  inn:string;
  ogrnip:string;
  address:string;
 }&BrandFooterToggles;
 home:{
  eyebrow:string;
  title:string;
  italic:string;
  intro:string;
  note:string;
  featureTitle:string;
  featureText:string;
  libraryTitle:string;
  libraryText:string;
  clubTitle:string;
  clubText:string;
  heroImage?:string;
 };
 pages:Record<string,PageContent>;
 videos?:Video[];
 courses:Course[];
 materials:Material[];
 events:CommunityEvent[];
 legal:Record<string,{title:string;meta:string;intro?:string[];blocks:{heading?:string;paragraphs?:string[];bullets?:string[]}[]}>;
};
