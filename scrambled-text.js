(function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function splitParagraph(p) {
    const chars = [];

    function wrapChar(ch, accent) {
      const span = document.createElement('span');
      span.className = 'char' + (accent ? ' char--accent' : '') + (ch === ' ' || ch === '\u00A0' ? ' char--space' : '');
      const content = ch === ' ' ? '\u00A0' : ch;
      span.textContent = content;
      span.dataset.content = content;
      chars.push(span);
      return span;
    }

    function walk(node, accent) {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of node.textContent) {
          frag.appendChild(wrapChar(ch, accent));
        }
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const isAccent = node.tagName === 'EM' || node.tagName === 'I';
        [...node.childNodes].forEach((child) => walk(child, accent || isAccent));
        if (isAccent) node.replaceWith(...node.childNodes);
      }
    }

    [...p.childNodes].forEach((n) => walk(n, false));
    return chars;
  }

  function scrambleChar(el, opts) {
    const target = el.dataset.content || el.textContent;
    if (!target || target === '\u00A0') return;

    if (el._tween) el._tween.kill();

    const state = { p: 0 };
    el._tween = gsap.to(state, {
      p: 1,
      duration: opts.duration,
      ease: 'none',
      overwrite: true,
      onStart: () => el.closest('.scrambled-text')?.classList.add('is-scrambling'),
      onUpdate: () => {
        if (state.p > 0.72 || Math.random() < state.p * state.p) {
          el.textContent = target;
        } else {
          el.textContent = opts.chars[Math.floor(Math.random() * opts.chars.length)];
        }
      },
      onComplete: () => {
        el.textContent = target;
        el._tween = null;
        const root = el.closest('.scrambled-text');
        if (root) {
          const busy = [...root.querySelectorAll('.char')].some((n) => n._tween);
          if (!busy) root.classList.remove('is-scrambling');
        }
      }
    });
  }

  class ScrambledText {
    constructor(root, opts = {}) {
      this.root = root;
      this.opts = {
        radius: 90,
        duration: 1,
        speed: 0.5,
        scrambleChars: '·:∗',
        ...opts
      };
      this.opts.chars = [...this.opts.scrambleChars];
      this.chars = [];
      this.active = false;
      this._onMove = this._onMove.bind(this);
      this._onLeave = this._onLeave.bind(this);

      this._init();
    }

    _init() {
      const p = this.root.querySelector('p');
      if (!p) return;

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const coarse = window.matchMedia('(pointer: coarse)').matches;

      if (reduce) return;

      this.chars = splitParagraph(p);
      if (coarse) this.opts.radius = Math.min(this.opts.radius, 60);

      this.root.addEventListener('pointermove', this._onMove);
      this.root.addEventListener('pointerleave', this._onLeave);
    }

    _onMove(e) {
      const { radius, duration, speed } = this.opts;
      let any = false;

      this.chars.forEach((c) => {
        const rect = c.getBoundingClientRect();
        if (!rect.width && !rect.height) return;

        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);

        if (dist < radius) {
          any = true;
          const dur = duration * (1 - dist / radius) * (0.6 + speed * 0.8);
          scrambleChar(c, {
            duration: clamp(dur, 0.15, duration),
            chars: this.opts.chars
          });
        }
      });

      this.root.classList.toggle('is-scrambling', any);
    }

    _onLeave() {
      this.chars.forEach((c) => {
        if (c._tween) c._tween.kill();
        c.textContent = c.dataset.content || c.textContent;
        c._tween = null;
      });
      this.root.classList.remove('is-scrambling');
    }

    destroy() {
      this.root.removeEventListener('pointermove', this._onMove);
      this.root.removeEventListener('pointerleave', this._onLeave);
      this._onLeave();
    }
  }

  window.initScrambledText = function (selector, opts) {
    if (typeof gsap === 'undefined') return [];
    const nodes = typeof selector === 'string'
      ? document.querySelectorAll(selector)
      : [selector];
    return [...nodes].map((el) => new ScrambledText(el, opts));
  };
})();
