'use client';
import {useCommunity} from './CommunityProvider';
/** Plain text only: CMS cannot inject markup or change the layout. */
export default function SiteText({value}:{value:string|null|undefined}){const {content}=useCommunity();return <>{value?(content?.copy?.[value]??value):''}</>}
