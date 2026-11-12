'use client';
import SiteText from '@/components/site/SiteText';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SiteLink } from '@/lib/router';
import { TRACKS, type CourseModule, type Track } from '@/lib/courses';
import { PageHook, NearestEventLine } from '@/components/site/forms';
import { getCentralEvent, formatEventDate } from '@/lib/events';

function ModuleRow({ track, module }: { track: Track; module: CourseModule }) {
  return (
    <div className="grid grid-cols-12 items-center gap-x-4 gap-y-3 border-b border-line py-7 sm:px-2">
      <div className="col-span-12 sm:col-span-6">
        <p className="serif text-[13px] italic text-brand"><SiteText value={module.index}/></p>
        <h4 className="serif mt-1 text-[20px] leading-snug text-ink sm:text-[22px]">
          <SiteText value={module.title}/>
        </h4>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft"><SiteText value={module.oneLine}/></p>
      </div>
      <div className="col-span-8 sm:col-span-4">
        <p className="text-[14px] text-ink-soft">
          <span className="text-ink"><SiteText value={module.duration}/></span> · <SiteText value={module.format.split('+')[0].trim()}/>
        </p>
      </div>
      <div className="col-span-12 sm:col-span-2 sm:justify-self-end">
        <SiteLink to={`/courses/${module.slug}`} className="btn btn-outline !px-4 !py-2 text-sm">
          <SiteText value={"Посмотреть этот раздел"}/></SiteLink>
      </div>
      <span className="sr-only"><SiteText value={"Модуль трека"}/>{' '}<SiteText value={track.label}/></span>
    </div>
  );
}

function TrackSection({ track }: { track: Track }) {
  return (
    <section className="mt-16" aria-label={`Трек: ${track.title}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="eyebrow"><SiteText value={track.label}/></p>
        <p className="text-[13px] text-ink-soft">· <SiteText value={track.audience}/></p>
      </div>
      <h3 className="serif mt-3 max-w-2xl text-[clamp(1.5rem,2.8vw,2rem)] leading-snug text-ink">
        <SiteText value={track.title}/>
      </h3>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft"><SiteText value={track.intro}/></p>
      <div className="mt-8 border-t border-line">
        {track.modules.map((m) => (
          <ModuleRow key={m.slug} track={track} module={m} />
        ))}
      </div>
    </section>
  );
}

export function CoursesView() {
  const central = getCentralEvent();

  return (
    <div className="view-enter">
      <section className="container-site pt-14 sm:pt-20">
        <p className="eyebrow"><SiteText value={"Курсы"}/></p>
        <h1 className="serif mt-5 max-w-3xl text-[clamp(2rem,4.4vw,3rem)] leading-[1.18] text-ink">
          <SiteText value={"Твоя ситуация определяет, чему учиться"}/></h1>
        <p className="mt-6 max-w-xl text-[17px] leading-[1.8] text-ink-soft">
          <SiteText value={"Без единого расписания для всех. Сначала быстрая диагностика, потом — маршрут."}/></p>
        <div className="mt-9">
          <SiteLink to="/courses/diagnostika" className="btn btn-brand">
            <SiteText value={"Диагностика ситуации за 10 минут"}/><ArrowRight className="size-4" />
          </SiteLink>
        </div>
      </section>

      <section className="container-site mt-16 sm:mt-20">
        <div className="max-w-2xl space-y-4 text-[16px] leading-[1.8] text-ink-soft">
          <p>
            <SiteText value={"Два трека, в каждом — три модуля. Трек A — для PR-специалистов, которые переходят от «говорить за других» к «говорить за себя». Трек B — для молодых предпринимателей, которым нужен PR уровня агентства, но без агентства."}/></p>
          <p className="text-ink">
            <SiteText value={"Модули проходят в составе трека: состав собирается после диагностики — чтобы вы не учились тому, что уже умеете."}/></p>
        </div>
      </section>

      <section className="container-site pb-6">
        {TRACKS.map((track) => (
          <TrackSection key={track.id} track={track} />
        ))}

        <PageHook>
          <SiteText value={"Прошёл диагностику, но всё равно не уверен? В"}/><SiteText value={' '}/>
          <SiteLink to="/club" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"клубе"}/></SiteLink><SiteText value={' '}/>
          <SiteText value={"есть люди, прошедшие тот же путь."}/>{central && (
            <NearestEventLine
              title={central.title}
              dateLabel={formatEventDate(central.dateISO)}
              slug={central.slug}
            />
          )}
        </PageHook>
      </section>
    </div>
  );
}

export function CourseModuleView({ slug }: { slug: string }) {
  const found = TRACKS.flatMap((t) => t.modules.map((m) => ({ track: t, module: m }))).find(
    (x) => x.module.slug === slug
  );

  if (!found) {
    return (
      <div className="container-site py-24 text-center">
        <h1 className="serif text-3xl text-ink"><SiteText value={"Раздел не найден"}/></h1>
        <p className="mt-4 text-ink-soft">
          <SiteText value={"Возможно, адрес устарел."}/><SiteText value={' '}/>
          <SiteLink to="/courses" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"Посмотреть все курсы"}/></SiteLink>
          .
        </p>
      </div>
    );
  }

  const { track, module } = found;
  const central = getCentralEvent();

  return (
    <div className="view-enter">
      <section className="container-site pt-10 sm:pt-14">
        <SiteLink
          to="/courses"
          className="inline-flex items-center gap-2 text-[14px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          <SiteText value={"Все модули ·"}/>{' '}<SiteText value={track.label}/>
        </SiteLink>

        <div className="mt-8 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="eyebrow">
              <SiteText value={"Модуль"}/>{' '}<SiteText value={module.index}/> · <SiteText value={track.label}/> · <SiteText value={track.audience}/>
            </p>
            <h1 className="serif mt-4 text-[clamp(1.8rem,3.8vw,2.6rem)] leading-[1.2] text-ink">
              <SiteText value={module.title}/>
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-[1.8] text-ink-soft">
              <SiteText value={module.oneLine}/>
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <span className="rounded-[4px] border border-line bg-white px-3 py-1 text-[13px] text-ink-soft">
                <SiteText value={module.duration}/>
              </span>
              <span className="rounded-[4px] border border-line bg-white px-3 py-1 text-[13px] text-ink-soft">
                <SiteText value={module.format}/>
              </span>
            </div>

            <div className="mt-10 max-w-2xl space-y-5 text-[16px] leading-[1.8] text-ink-soft">
              {module.about.map((p, i) => (
                <p key={i}><SiteText value={p}/></p>
              ))}
            </div>

            <h2 className="serif mt-14 text-[22px] text-ink"><SiteText value={"Программа модуля"}/></h2>
            <ol className="mt-5 border-t border-line">
              {module.program.map((lesson, i) => (
                <li key={i} className="flex items-baseline gap-5 border-b border-line py-4">
                  <span className="serif shrink-0 text-[14px] italic text-brand">
                    <SiteText value={String(i + 1).padStart(2, '0')}/>
                  </span>
                  <span className="text-[15px] leading-relaxed text-ink">
                    <SiteText value={lesson.title}/>
                    {lesson.note && (
                      <span className="ml-2 text-[13px] text-ink-soft">· <SiteText value={lesson.note}/></span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <aside className="lg:col-span-4">
            <div className="card-lite p-7 lg:sticky lg:top-24">
              <h3 className="serif text-[19px] text-ink"><SiteText value={"Кому подходит"}/></h3>
              <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-soft">
                {module.forWhom.map((w, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    <SiteText value={w}/>
                  </li>
                ))}
              </ul>
              <div className="my-6 h-px bg-line" aria-hidden="true" />
              <h3 className="serif text-[19px] text-ink"><SiteText value={"Что останется после"}/></h3>
              <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-soft">
                {module.outcome.map((w, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                    <SiteText value={w}/>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <div className="mt-14 rounded-[6px] border border-brand/25 bg-brand-soft/60 p-7 sm:p-9">
          <h2 className="serif text-[22px] text-ink"><SiteText value={"Как попасть в модуль"}/></h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            <SiteText value={"Модули проходят в составе трека — состав собирается после диагностики, чтобы не учить вас тому, что вы уже умеете. Если сомневаетесь — начните с диагностики: десять минут, без правильных ответов."}/></p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            <SiteLink to="/courses/diagnostika" className="btn btn-brand">
              <SiteText value={"Пройти диагностику"}/></SiteLink>
            <SiteLink to="/club" className="btn-quiet">
              <SiteText value={"Спросить в клубе"}/></SiteLink>
          </div>
        </div>

        <PageHook>
          {central && (
            <NearestEventLine
              title={central.title}
              dateLabel={formatEventDate(central.dateISO)}
              slug={central.slug}
            />
          )}
        </PageHook>
      </section>
    </div>
  );
}
