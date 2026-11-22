import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const lowData = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));

if (!reduce) {
  document.documentElement.classList.add('js-motion');
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // in-page anchors go through Lenis
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector<HTMLElement>(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: 0 });
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  });

  initHero(lowData);
  initReveals();
  initThreads();
  initTimeline();
}

/** Hero: scroll drives the night → morning film (or a crossfade of the two keyframes as fallback). */
function initHero(lowData: boolean) {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;
  const morning = hero.querySelector<HTMLElement>('[data-hero-morning]');
  const video = hero.querySelector<HTMLVideoElement>('[data-hero-video]');
  const copy = hero.querySelector<HTMLElement>('.hero__copy');

  // The film's light change happens early; remap scroll so the transition fills most of the scroll.
  const remap = (p: number) => (p < 0.75 ? (p / 0.75) * 0.55 : 0.55 + ((p - 0.75) / 0.25) * 0.45);

  let useVideo = false;
  if (video && !lowData) {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    video.src = (mobile ? video.dataset.srcMobile : video.dataset.srcDesktop) ?? '';
    video.preload = 'auto';
    video.load();
    video.addEventListener('loadeddata', () => {
      useVideo = true;
      gsap.to(video, { opacity: 1, duration: 0.6 });
    }, { once: true });
  }

  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      if (useVideo && video && video.duration) {
        const t = remap(p) * (video.duration - 0.05);
        if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t;
      } else if (morning) {
        morning.style.opacity = String(gsap.utils.clamp(0, 1, (p - 0.15) / 0.6));
      }
      if (copy) {
        const out = gsap.utils.clamp(0, 1, (p - 0.55) / 0.35);
        copy.style.opacity = String(1 - out);
        copy.style.transform = `translateY(${-40 * out}px)`;
      }
    },
  });
}

function initReveals() {
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.to(el, {
      opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

function initThreads() {
  gsap.utils.toArray<SVGPathElement>('[data-thread]').forEach((path) => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    gsap.to(path, {
      strokeDashoffset: 0, ease: 'none',
      scrollTrigger: { trigger: path, start: 'top 92%', end: 'top 45%', scrub: true },
    });
  });
}

function initTimeline() {
  const tl = document.querySelector<HTMLElement>('[data-timeline]');
  const fill = document.querySelector<HTMLElement>('[data-timeline-fill]');
  if (!tl || !fill) return;
  gsap.to(fill, {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: tl, start: 'top 70%', end: 'bottom 60%', scrub: true },
  });
}
