'use client';
import SiteText from '@/components/site/SiteText';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { SiteLink } from '@/lib/router';
import { PageHook } from '@/components/site/forms';

const TRACES = [
  '[N] лет в корпоративных коммуникациях — в [отрасли]',
  'Руководил(а) командой [тип команды]',
  'Сейчас как независимый консультант работаю с [тип клиентов]',
];

export default function AboutView() {
  return (
    <div className="view-enter">
      <section className="container-site pt-14 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="eyebrow"><SiteText value={"Обо мне"}/></p>
            <h1 className="serif mt-5 text-[clamp(2rem,4.4vw,3rem)] leading-[1.18] text-ink">
              <SiteText value={"Ты умеешь делать PR. А PR для себя — умеешь?"}/></h1>
            <p className="mt-6 max-w-xl text-[17px] leading-[1.8] text-ink-soft">
              <SiteText value={"Соло-PR — это не другое название фриланса. Это смещение из позиции «исполнитель» в позицию «тот, кто решает». Я провожу людей через этот переход."}/></p>
          </div>
          <div className="lg:col-span-5">
            <figure className="relative aspect-[4/5] overflow-hidden rounded-[6px] border border-line">
              <Image
                src="/images/about-window.jpg"
                alt="Рабочий угол у окна: тетрадь, карандаш, естественный свет"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </figure>
            <figcaption className="mt-2.5 text-[13px] italic text-ink-soft">
              <SiteText value={"Рабочий угол. Здесь обычно начинаются разговоры."}/></figcaption>
          </div>
        </div>
      </section>

      <section className="container-site mt-16 sm:mt-20">
        <div className="max-w-2xl space-y-6 text-[17px] leading-[1.8] text-ink-soft">
          <p>
            <SiteText value={"Я много лет работаю в коммуникациях и за это время видел слишком много сильных PR-людей, застрявших внутри корпоративной структуры. Они умеют стратегию, пишут планы, договариваются с медиа. Они делают блестяще всё — кроме одного: им никогда не пускали относиться к себе как к продукту."}/></p>
          <p>
            <SiteText value={"В корпорации опыт, репутация и цена принадлежат компании. Уходя, человек обнаруживает, что «уметь делать PR» и «уметь быть PR-специалистом, которого выбирают» — два разных навыка. Второй никто не преподавал, и его невозможно списать у коллег: в открытую кладут только результат, а не путь."}/></p>
          <p>
            <SiteText value={"Соло-PR появился из этого наблюдения. Я не обещаю лёгкого пути и не продаю мечту о «свободе на пляже». Я делаю другое: помогаю собрать то, что вы уже умеете, в позицию, за которую платят, — и пройти переход спокойно, по шагам, с ясным следующим шагом после каждого разговора."}/></p>
          <p className="text-ink">
            <SiteText value={"Если вы читаете это и узнаёте себя — начните с"}/><SiteText value={' '}/>
            <SiteLink
              to="/courses/diagnostika"
              className="underline decoration-brand/50 underline-offset-4 hover:text-ink"
            >
              <SiteText value={"диагностики ситуации"}/></SiteLink>
            <SiteText value={". Десять минут, без регистрации и правильных ответов."}/></p>
        </div>
      </section>

      {/* Зона «следов» — конкретные факты без стены логотипов */}
      <section className="container-site mt-20 sm:mt-28" aria-labelledby="traces">
        <p className="eyebrow"><SiteText value={"Следы"}/></p>
        <h2 id="traces" className="serif mt-3 text-[clamp(1.6rem,3vw,2.2rem)] text-ink">
          <SiteText value={"Коротко, без стены логотипов"}/></h2>
        <div className="mt-8 max-w-3xl border-t border-line">
          {TRACES.map((t, i) => (
            <p
              key={i}
              className="border-b border-line py-5 text-[16px] leading-relaxed text-ink"
            >
              <SiteText value={t}/>
            </p>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-[13px] italic text-ink-soft">
          <SiteText value={"Строки в скобках — место для ваших фактов: они заменяются перед публикацией."}/></p>
      </section>

      <div className="container-site pb-6">
        <PageHook>
          <SiteText value={"Если ты уже знаешь, что пора уходить —"}/><SiteText value={' '}/>
          <SiteLink
            to="/courses/diagnostika"
            className="underline decoration-brand/50 underline-offset-2 hover:text-ink"
          >
            <SiteText value={"посмотри диагностику"}/></SiteLink>
          <SiteText value={". Десять минут — и маршрут на руках."}/><span className="mt-3 flex">
            <SiteLink to="/courses" className="btn-quiet">
              <SiteText value={"Смотреть курсы"}/><ArrowRight className="size-4" />
            </SiteLink>
          </span>
        </PageHook>
      </div>
    </div>
  );
}
