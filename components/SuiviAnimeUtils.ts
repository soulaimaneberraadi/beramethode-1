/**
 * SuiviAnimeUtils.ts
 * Anime.js animation helpers for the SuiviProduction premium UI.
 * All animations use spring/elastic easing per the animejs-animation skill.
 */
import * as animeLib from 'animejs';
// animejs v4 compat shim
const anime: any = (animeLib as any).default ?? animeLib;

/** Staggered card entrance — spring physics for organic feel */
export function animateCardEntrance(selector: string) {
  anime({
    targets: selector,
    translateY: [40, 0],
    opacity: [0, 1],
    scale: [0.94, 1],
    duration: 700,
    delay: anime.stagger(80, { easing: 'easeOutQuad' }),
    easing: 'spring(1, 80, 12, 0)',
    begin() {
      (document.querySelectorAll(selector) as NodeListOf<HTMLElement>).forEach(el => {
        el.style.willChange = 'transform, opacity';
      });
    },
    complete() {
      (document.querySelectorAll(selector) as NodeListOf<HTMLElement>).forEach(el => {
        el.style.willChange = 'auto';
      });
    },
  });
}

/** KPI count-up animation — from 0 to target value */
export function animateCountUp(
  el: HTMLElement,
  to: number,
  suffix = '',
  duration = 900,
) {
  const obj = { val: 0 };
  anime({
    targets: obj,
    val: [0, to],
    duration,
    easing: 'easeOutExpo',
    update() {
      el.textContent = Math.round(obj.val) + suffix;
    },
    complete() {
      el.textContent = to + suffix;
    },
  });
}

/** Progress bar animated fill */
export function animateProgressBar(barEl: HTMLElement, percent: number) {
  anime({
    targets: barEl,
    width: [`0%`, `${Math.min(100, percent)}%`],
    duration: 1000,
    easing: 'spring(1, 90, 14, 0)',
    delay: 200,
  });
}

/** Table row wave entrance */
export function animateTableRows(selector: string, delay = 30) {
  anime({
    targets: selector,
    translateX: [-20, 0],
    opacity: [0, 1],
    duration: 500,
    delay: anime.stagger(delay, { easing: 'easeOutSine' }),
    easing: 'spring(1, 100, 16, 0)',
  });
}

/** Header slide-down entrance */
export function animateHeader(selector: string) {
  anime({
    targets: selector,
    translateY: [-30, 0],
    opacity: [0, 1],
    duration: 600,
    easing: 'spring(1, 70, 10, 0)',
  });
}

/** KPI card stagger with scale pop */
export function animateKpiCards(selector: string) {
  anime
    .timeline({ easing: 'spring(1, 80, 10, 0)' })
    .add({
      targets: selector,
      scale: [0.8, 1],
      opacity: [0, 1],
      translateY: [20, 0],
      delay: anime.stagger(70),
      duration: 600,
    });
}

/** Pulsing status dot */
export function animateStatusDot(el: HTMLElement) {
  anime({
    targets: el,
    scale: [1, 1.5, 1],
    opacity: [1, 0.4, 1],
    duration: 1400,
    loop: true,
    easing: 'easeInOutSine',
  });
}

/** Modal pop-in with elastic bounce */
export function animateModalIn(selector: string) {
  anime({
    targets: selector,
    scale: [0.85, 1],
    opacity: [0, 1],
    duration: 550,
    easing: 'spring(1, 80, 8, 0)',
  });
}

/** Smooth number transition for totals */
export function animateValue(el: HTMLElement, from: number, to: number, duration = 600) {
  const obj = { val: from };
  anime({
    targets: obj,
    val: to,
    duration,
    easing: 'easeOutCubic',
    update() {
      el.textContent = String(Math.round(obj.val));
    },
  });
}
