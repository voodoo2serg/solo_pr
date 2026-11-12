'use client';
import SiteText from '@/components/site/SiteText';
export default function FounderQuote({text}:{text:string}){return <figure className="founder-quote"><span className="quote-mark" aria-hidden="true">“</span><blockquote><SiteText value={text}/></blockquote><figcaption><a href="https://sergey-vodopetov.workspace-973399.chatgpt.site" target="_blank" rel="noreferrer"><img src="/assets/portrait/vodopetov-192.webp" width="56" height="56" alt=""/><span><SiteText value={"Сергей Водопетов"}/>{' '}<span aria-hidden="true">↗</span></span></a></figcaption></figure>}
