'use client';
import SiteText from '@/components/site/SiteText';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SiteLink } from '@/lib/router';
import {
  EVENTS,
  pastEvents,
  upcomingEvents,
  getEvent,
  formatEventDate,
  formatEventDay,
  formatEventTime,
  type EventItem,
} from '@/lib/events';
import { PageHook, ConsentCheckbox, AdsConsentCheckbox, Field, SuccessCard } from '@/components/site/forms';

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-[4px] border px-2 py-0.5 text-[12px] font-medium ${
        accent
          ? 'border-brand/30 bg-brand-soft text-brand-deep'
          : 'border-line bg-white text-ink-soft'
      }`}
    >
      {children}
    </span>
  );
}

function EventTags({ event }: { event: EventItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tag>
        <SiteText value={event.format === 'онлайн' ? 'Онлайн' : `Офлайн, ${event.city}`}/>
      </Tag>
      {event.free ? (
        <Tag accent><SiteText value={"Бесплатно"}/></Tag>
      ) : event.clubOnly ? (
        <Tag><SiteText value={"Для членов клуба"}/></Tag>
      ) : (
        <Tag><SiteText value={event.priceLabel}/></Tag>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <SiteLink
      to={`/events/${event.slug}`}
      className="group block border-b border-line py-7 transition-colors duration-200 hover:bg-white sm:px-2"
    >
      <div className="grid grid-cols-12 gap-x-4 gap-y-2">
        <div className="col-span-12 sm:col-span-3">
          <p className="serif text-[18px] text-ink">
            <SiteText value={formatEventDay(event.dateISO, event.format === 'офлайн')}/>
          </p>
          <p className="text-[14px] text-ink-soft"><SiteText value={formatEventTime(event.dateISO)}/> {' '}<SiteText value={"по Москве"}/></p>
        </div>
        <div className="col-span-12 sm:col-span-8">
          <h3 className="serif text-[20px] leading-snug text-ink sm:text-[22px]"><SiteText value={event.title}/></h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft"><SiteText value={event.short}/></p>
          <div className="mt-3">
            <EventTags event={event} />
          </div>
        </div>
        <div className="col-span-12 flex items-end sm:col-span-1 sm:justify-end">
          <span className="text-[14px] text-ink-soft underline decoration-line underline-offset-4 transition-colors group-hover:text-ink group-hover:decoration-brand">
            <SiteText value={"Подробнее →"}/></span>
        </div>
      </div>
    </SiteLink>
  );
}

export function EventsView() {
  const upcoming = upcomingEvents();
  const past = pastEvents();

  return (
    <div className="view-enter">
      <section className="container-site pt-14 sm:pt-20">
        <p className="eyebrow"><SiteText value={"Мероприятия"}/></p>
        <h1 className="serif mt-5 max-w-2xl text-[clamp(2rem,4.4vw,3rem)] leading-[1.18] text-ink">
          <SiteText value={"Раз в месяц — открытое событие"}/></h1>
        <p className="mt-6 max-w-xl text-[17px] leading-[1.8] text-ink-soft">
          <SiteText value={"Разборы, воркшопы и встречи. Открытые — для всех, круглые столы — только для членов клуба. Остальные события не прячутся: всё, что было и будет, собрано здесь."}/></p>
      </section>

      <section className="container-site mt-14 sm:mt-16" aria-labelledby="upcoming">
        <h2 id="upcoming" className="serif text-[22px] text-ink">
          <SiteText value={"Предстоящие"}/></h2>
        {upcoming.length > 0 ? (
          <div className="mt-6 border-t border-line">
            {upcoming.map((e) => (
              <EventCard key={e.slug} event={e} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-[15px] text-ink-soft">
            <SiteText value={"Ближайшее событие скоро анонсируем — загляните позже или подпишитесь на рассылку."}/></p>
        )}
      </section>

      <section className="container-site mt-14" aria-labelledby="archive">
        <h2 id="archive" className="serif text-[22px] text-ink">
          <SiteText value={"Прошедшие (архив)"}/></h2>
        {past.length > 0 ? (
          <div className="mt-6 border-t border-line">
            {past.map((e) => (
              <EventCard key={e.slug} event={e} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-[15px] text-ink-soft"><SiteText value={"Архив пока пуст."}/></p>
        )}
      </section>

      <div className="container-site pb-6">
        <PageHook>
          <SiteText value={"Хочешь системно —"}/><SiteText value={' '}/>
          <SiteLink to="/courses" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"курсы"}/></SiteLink>
          <SiteText value={". Хочешь в круг —"}/><SiteText value={' '}/>
          <SiteLink to="/club" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"клуб"}/></SiteLink>
          .
        </PageHook>
      </div>
    </div>
  );
}

function RegistrationForm({ event }: { event: EventItem }) {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [ads, setAds] = useState(false);

  const valid = name.trim() && /.+@.+\..+/.test(email) && consent;

  if (sent) {
    return (
      <SuccessCard title="Вы записаны.">
        <SiteText value={"Подтверждение уже летит на"}/>{' '}<SiteText value={email}/>. {!event.free && 'Счёт на участие пришлём в том же письме. '}<SiteText value={"За день до встречи напомним и пришлём ссылку"}/><SiteText value={event.format === 'онлайн' ? ' на подключение' : ' и адрес'}/>.
      </SuccessCard>
    );
  }

  return (
    <form
      className="card-lite p-7 sm:p-9"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setSent(true);
      }}
    >
      <h2 className="serif text-[22px] text-ink"><SiteText value={"Регистрация"}/></h2>
      {!event.free && (
        <p className="mt-2 text-[14px] text-ink-soft">
          <SiteText value={"Стоимость участия —"}/>{' '}<SiteText value={event.priceLabel}/><SiteText value={". Счёт пришлём в письме после регистрации."}/></p>
      )}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Имя">
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как к вам обращаться"
            autoComplete="name"
          />
        </Field>
        <Field label="Почта">
          <input
            className="input-field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
      </div>
      <div className="mt-6 space-y-3.5">
        <ConsentCheckbox checked={consent} onChange={setConsent} />
        <AdsConsentCheckbox checked={ads} onChange={setAds} />
      </div>
      <div className="mt-6">
        <button type="submit" className="btn btn-brand" disabled={!valid}>
          <SiteText value={"Зарегистрироваться"}/></button>
      </div>
    </form>
  );
}

export function EventDetailView({ slug }: { slug: string }) {
  const event = getEvent(slug);
  const isPast = event ? !upcomingEvents().some((e) => e.slug === event.slug) : false;

  if (!event) {
    return (
      <div className="container-site py-24 text-center">
        <h1 className="serif text-3xl text-ink"><SiteText value={"Событие не найдено"}/></h1>
        <p className="mt-4 text-ink-soft">
          <SiteText value={"Возможно, адрес устарел."}/><SiteText value={' '}/>
          <SiteLink to="/events" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"Посмотреть все мероприятия"}/></SiteLink>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="view-enter">
      <section className="container-site pt-10 sm:pt-14">
        <SiteLink
          to="/events"
          className="inline-flex items-center gap-2 text-[14px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          <SiteText value={"Все мероприятия"}/></SiteLink>

        <div className="mt-8 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <EventTags event={event} />
            <h1 className="serif mt-5 text-[clamp(1.8rem,3.8vw,2.6rem)] leading-[1.2] text-ink">
              <SiteText value={event.title}/>
            </h1>

            <div className="mt-6 rounded-[6px] border border-line bg-white p-5">
              <p className="text-[15px] text-ink">
                <span className="serif"><SiteText value={formatEventDate(event.dateISO, event.format === 'офлайн')}/></span><SiteText value={' '}/>
                <SiteText value={"по Москве"}/></p>
              <p className="mt-1 text-[15px] text-ink-soft">
                <SiteText value={event.format === 'онлайн'
                  ? 'Онлайн · ссылка придёт в письме'
                  : `Офлайн · ${event.city} · место сообщим при регистрации`}/><SiteText value={' '}/>
                · <SiteText value={event.priceLabel}/>
              </p>
            </div>

            <div className="mt-8 max-w-2xl space-y-5 text-[16px] leading-[1.8] text-ink-soft">
              {event.description.map((p, i) => (
                <p key={i}><SiteText value={p}/></p>
              ))}
            </div>

            {event.program && event.program.length > 0 && (
              <>
                <h2 className="serif mt-12 text-[22px] text-ink"><SiteText value={"Программа"}/></h2>
                <ol className="mt-5 border-t border-line">
                  {event.program.map((item, i) => (
                    <li key={i} className="flex items-baseline gap-6 border-b border-line py-4">
                      <span className="serif w-14 shrink-0 text-[14px] text-brand"><SiteText value={item.time}/></span>
                      <span className="text-[15px] leading-relaxed text-ink">
                        <SiteText value={item.title}/>
                        {item.note && <span className="ml-2 text-[13px] text-ink-soft">· <SiteText value={item.note}/></span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {event.speakers && event.speakers.length > 0 && (
              <>
                <h2 className="serif mt-12 text-[22px] text-ink"><SiteText value={"Спикеры"}/></h2>
                <ul className="mt-5 space-y-4">
                  {event.speakers.map((s) => (
                    <li key={s.name} className="border-b border-line pb-4 last:border-0">
                      <p className="text-[15px] font-medium text-ink"><SiteText value={s.name}/></p>
                      <p className="text-[14px] text-ink-soft"><SiteText value={s.role}/></p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              {isPast ? (
                <div className="card-lite p-7">
                  <p className="eyebrow"><SiteText value={"Событие прошло"}/></p>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                    <SiteText value={"Регистрация закрыта. Записи и материалы открытых разборов доступны в клубе; часть — в"}/><SiteText value={' '}/>
                    <SiteLink
                      to="/events"
                      className="underline decoration-brand/50 underline-offset-2 hover:text-ink"
                    >
                      <SiteText value={"архиве мероприятий"}/></SiteLink>
                    .
                  </p>
                  <SiteLink to="/club/join" className="btn btn-outline mt-6 w-full !py-2 text-sm">
                    <SiteText value={"Посмотреть клуб"}/></SiteLink>
                </div>
              ) : event.clubOnly ? (
                <div className="card-lite p-7">
                  <p className="eyebrow"><SiteText value={"Только для членов клуба"}/></p>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                    <SiteText value={"Этот круглый стол — часть закрытой программы. Если вы уже член клуба, регистрация открыта в"}/><SiteText value={' '}/>
                    <SiteLink
                      to="/club/home"
                      className="underline decoration-brand/50 underline-offset-2 hover:text-ink"
                    >
                      <SiteText value={"домашней странице клуба"}/></SiteLink>
                    <SiteText value={". Если нет — подайте заявку."}/></p>
                  <SiteLink to="/club/join" className="btn btn-brand mt-6 w-full !py-2 text-sm">
                    <SiteText value={"Подать заявку в клуб"}/></SiteLink>
                </div>
              ) : (
                <RegistrationForm event={event} />
              )}
            </div>
          </aside>
        </div>

        <PageHook>
          <SiteText value={"Всего событий сейчас:"}/>{' '}{EVENTS.length}<SiteText value={". Хочешь системно —"}/><SiteText value={' '}/>
          <SiteLink to="/courses" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"курсы"}/></SiteLink>
          <SiteText value={". Хочешь в круг —"}/><SiteText value={' '}/>
          <SiteLink to="/club" className="underline decoration-brand/50 underline-offset-2 hover:text-ink">
            <SiteText value={"клуб"}/></SiteLink>
          .
        </PageHook>
      </section>
    </div>
  );
}
