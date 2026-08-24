(function () {
  'use strict';

  // Scrambled text — hero tagline
  if (typeof gsap !== 'undefined' && window.initScrambledText) {
    initScrambledText('[data-scramble]', {
      radius: 85,
      duration: 0.95,
      speed: 0.45,
      scrambleChars: '·:∗'
    });
  }

  // Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.delay || 0;
          setTimeout(() => entry.target.classList.add('visible'), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  reveals.forEach((el, i) => {
    el.style.transitionDelay = `${(i % 5) * 0.08}s`;
    observer.observe(el);
  });

  // Stagger hero reveals on load
  window.addEventListener('load', () => {
    document.querySelectorAll('.hero .reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), 150 + i * 120);
    });
  });

  // Mobile menu
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.classList.toggle('active');
      toggle.setAttribute('aria-expanded', open);
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Cursor glow (desktop only)
  const glow = document.querySelector('.cursor-glow');
  if (glow && window.matchMedia('(pointer: fine)').matches) {
    let raf;
    document.addEventListener('mousemove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
      });
    });
  }

  // Header shadow on scroll
  const header = document.querySelector('.header');
  const toTop = document.querySelector('.to-top');

  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY > 400;

    if (header) {
      header.style.boxShadow = window.scrollY > 40
        ? '0 4px 24px rgba(0,0,0,0.3)'
        : 'none';
    }

    if (toTop) {
      toTop.hidden = !scrolled;
      toTop.classList.toggle('is-visible', scrolled);
    }
  }, { passive: true });

  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Portfolio sliders
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const slides = slider.querySelectorAll('.slide');
    const dotsWrap = slider.querySelector('.slider-dots');
    const prev = slider.querySelector('.slider-prev');
    const next = slider.querySelector('.slider-next');
    if (slides.length <= 1) {
      prev?.remove();
      next?.remove();
      dotsWrap?.remove();
      return;
    }

    let current = 0;

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Скриншот ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    const dots = dotsWrap.querySelectorAll('.slider-dot');

    function goTo(index) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    prev?.addEventListener('click', (e) => { e.stopPropagation(); goTo(current - 1); });
    next?.addEventListener('click', (e) => { e.stopPropagation(); goTo(current + 1); });
  });

  // Lightbox — увеличение скриншотов
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('.lightbox__img');
    const lbCaption = lightbox.querySelector('.lightbox__caption');
    const lbCounter = lightbox.querySelector('.lightbox__counter');
    const lbPrev = lightbox.querySelector('.lightbox__prev');
    const lbNext = lightbox.querySelector('.lightbox__next');
    let gallery = [];
    let lbIndex = 0;
    let lastFocus = null;

    function getImages(visual) {
      const slides = visual.querySelectorAll('.slide');
      if (slides.length) return [...slides];
      const img = visual.querySelector('img');
      return img ? [img] : [];
    }

    function getActiveIndex(visual, images) {
      const active = visual.querySelector('.slide.active');
      return active ? Math.max(0, images.indexOf(active)) : 0;
    }

    function renderLightbox() {
      const img = gallery[lbIndex];
      if (!img) return;
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCaption.textContent = img.alt;
      const multi = gallery.length > 1;
      lbPrev.disabled = !multi;
      lbNext.disabled = !multi;
      lbCounter.textContent = multi ? `${lbIndex + 1} / ${gallery.length}` : '';
    }

    function openLightbox(visual, startIndex) {
      gallery = getImages(visual);
      if (!gallery.length) return;
      lbIndex = startIndex;
      renderLightbox();
      lastFocus = document.activeElement;
      lightbox.hidden = false;
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      lightbox.querySelector('.lightbox__close')?.focus();
    }

    function closeLightbox() {
      lightbox.hidden = true;
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      lbImg.removeAttribute('src');
      lastFocus?.focus?.();
    }

    function stepLightbox(dir) {
      if (gallery.length <= 1) return;
      lbIndex = (lbIndex + dir + gallery.length) % gallery.length;
      renderLightbox();
    }

    document.querySelectorAll('[data-lightbox]').forEach((visual) => {
      visual.addEventListener('click', (e) => {
        if (e.target.closest('.slider-btn, .slider-dot')) return;
        openLightbox(visual, getActiveIndex(visual, getImages(visual)));
      });
    });

    lbPrev?.addEventListener('click', () => stepLightbox(-1));
    lbNext?.addEventListener('click', () => stepLightbox(1));
    lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => {
      el.addEventListener('click', closeLightbox);
    });

    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
  }
})();
