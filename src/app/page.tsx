import SiteShell from '@/components/site/SiteShell';
import {pageMetadata,initialPublicContent} from '@/lib/server/seo';
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/');}
export default function Home(){return <SiteShell initialContent={initialPublicContent()} initialRoute={'/'}/>;}
