import SiteShell from '@/components/site/SiteShell';
import {pageMetadata,initialPublicContent} from '@/lib/server/seo';
import {notFound} from 'next/navigation';
import {content} from '@/lib/server/store';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string[]}>};
const routes=new Set(['about','club','courses','consulting','materials','mentoring','events','privacy','consent','cookies','terms','contacts','login','register','account','admin','order']);
export async function generateMetadata({params}:Props){return pageMetadata('/'+(await params).slug.join('/'));}
export default async function Page({params}:Props){const {slug}=await params;if(!routes.has(slug[0]))notFound();if(slug[0]==='materials'&&slug[1]&&!content().materials.some(m=>m.id===slug[1]&&m.published!==false))notFound();if(slug[0]==='courses'&&slug[1]&&!['interests','diagnostika'].includes(slug[1])&&!content().courses.some(c=>c.id===slug[1]&&c.published!==false))notFound();return <SiteShell initialContent={initialPublicContent()} initialRoute={'/'+slug.join('/')}/>;}
