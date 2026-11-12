'use client';
import SiteText from '@/components/site/SiteText';
import {useState} from 'react';
import type {Video} from '@/lib/content-types';
import {videoEmbed} from '@/lib/publications';
export default function VideoCard({video}:{video:Video}){const [loaded,setLoaded]=useState(false);const src=videoEmbed(video.url);return <article className="video-card"><div className="video-player">{src&&loaded?<iframe src={src} title={video.title} loading="lazy" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" onClick={()=>setLoaded(true)} disabled={!src} aria-label={'Смотреть: '+video.title}>{video.image&&<img src={video.image} alt="" loading="lazy"/>}<span><SiteText value={src?'▶ Смотреть':'Видео готовится к публикации'}/></span></button>}</div><h3><SiteText value={video.title}/></h3></article>}
