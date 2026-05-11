/* ============================================
   ABEER NASIR CHAUDHRY — Portfolio
   Shared interactive behavior
   ============================================ */
(function () {
  'use strict';

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close on link click (mobile)
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  /* ---------- Header shadow on scroll ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => {
    if (!header) return;
    if (window.scrollY > 8) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Hero grid cursor spotlight + 3D bump ---------- */
  (function heroSpotlight() {
    const host = document.querySelector('.hero-signal');
    if (!host) return;
    const spot = host.querySelector('.hero-spot');
    const warp = host.querySelector('.hero-warp');
    if (!spot || !warp) return;
    const VW = 900, VH = 700;
    let raf = null;
    let tx = VW/2, ty = VH/2, cx = VW/2, cy = VH/2;
    let active = false;
    let curR = 0, curBump = 0;
    function loop() {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      const targetR = active ? 200 : 0;
      const targetBump = active ? 1 : 0;
      curR += (targetR - curR) * 0.15;
      curBump += (targetBump - curBump) * 0.12;
      spot.setAttribute('cx', cx.toFixed(1));
      spot.setAttribute('cy', cy.toFixed(1));
      spot.setAttribute('r', curR.toFixed(1));
      // 3D bump: normalize cursor to -1..1 around center, tilt opposite axis
      const nx = (cx - VW/2) / (VW/2);
      const ny = (cy - VH/2) / (VH/2);
      const rotX = (-ny * 12 * curBump).toFixed(2);
      const rotY = (nx * 12 * curBump).toFixed(2);
      const scale = (1 + 0.04 * curBump).toFixed(3);
      warp.style.transformOrigin = `${cx}px ${cy}px`;
      warp.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`;
      if (Math.abs(tx-cx) > 0.3 || Math.abs(ty-cy) > 0.3 || Math.abs(targetR-curR) > 0.5 || Math.abs(targetBump-curBump) > 0.01) {
        raf = requestAnimationFrame(loop);
      } else { raf = null; }
    }
    spot.setAttribute('r', '0');
    host.addEventListener('mousemove', (e) => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * VW;
      ty = ((e.clientY - r.top) / r.height) * VH;
      active = true;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    host.addEventListener('mouseleave', () => {
      active = false;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  })();

  /* ---------- Ambient sinusoidal signal background ---------- */
  (function ambientSignal() {
    const waves = document.querySelectorAll('.ambient-wave');
    if (!waves.length) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // draw static curves once
    }
    const W = 1440, H = 900;
    const steps = 96;
    // Each wave: amplitude, frequency (cycles across W), vertical center, speed (rad/sec), phaseOffset
    const config = [
      { amp: 90,  freq: 1.6, cy: 380, speed: 0.45, phase: 0 },
      { amp: 60,  freq: 2.4, cy: 470, speed: -0.30, phase: 1.2 },
      { amp: 130, freq: 1.0, cy: 560, speed: 0.22, phase: 2.6 },
      { amp: 45,  freq: 3.2, cy: 320, speed: -0.55, phase: 0.8 },
    ];
    function build(t) {
      waves.forEach((p, i) => {
        const c = config[i];
        let d = '';
        for (let s = 0; s <= steps; s++) {
          const x = (s / steps) * W;
          const k = (x / W) * c.freq * Math.PI * 2;
          // Add a slow secondary modulation so it doesn't look like a perfect sine
          const y = c.cy + Math.sin(k + t * c.speed + c.phase) * c.amp
                  + Math.sin(k * 0.5 - t * c.speed * 0.6) * (c.amp * 0.18);
          d += (s === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
        }
        p.setAttribute('d', d);
      });
    }
    let start = performance.now();
    let running = true;
    function tick(now) {
      if (!running) return;
      const t = (now - start) / 1000;
      build(t);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // Pause when tab is hidden to save CPU
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { running = false; }
      else { running = true; start = performance.now() - (performance.now() - start); requestAnimationFrame(tick); }
    });
  })();

  /* ---------- Section stage transitions ---------- */
  const stages = document.querySelectorAll('main > section');
  if (stages.length && 'IntersectionObserver' in window) {
    const stageIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('stage-in');
          stageIO.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    stages.forEach(s => {
      // First section (hero) is already visible — flag immediately.
      if (s === stages[0]) { s.classList.add('stage-in'); return; }
      stageIO.observe(s);
    });
  } else {
    stages.forEach(s => s.classList.add('stage-in'));
  }

  /* ---------- Reveal-on-scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- Active nav link based on section in view ---------- */
  const sectionLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if (sectionLinks.length && 'IntersectionObserver' in window) {
    const map = {};
    sectionLinks.forEach(l => map[l.getAttribute('href').slice(1)] = l);
    const ids = Object.keys(map);
    const sections = ids.map(id => document.getElementById(id)).filter(Boolean);

    const navIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          sectionLinks.forEach(a => a.classList.remove('active'));
          const link = map[e.target.id];
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });

    sections.forEach(s => navIO.observe(s));
  }

  /* ---------- Experience accordion ---------- */
  document.querySelectorAll('[data-exp]').forEach(item => {
    item.addEventListener('click', (e) => {
      // ignore clicks on the toggle text - whole row is clickable
      item.classList.toggle('open');
    });
  });

  /* ---------- Project filter ---------- */
  const workFilter = document.getElementById('workFilter');
  const workCards = document.querySelectorAll('.work-card[data-cat]');
  const workCountEl = document.getElementById('workCount');
  if (workFilter) {
    const filterButtons = workFilter.querySelectorAll('button');
    const updateCount = () => {
      if (!workCountEl) return;
      const visible = Array.from(workCards).filter(c => !c.classList.contains('hidden')).length;
      workCountEl.textContent = visible;
    };
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.cat;
        workCards.forEach(card => {
          const match = filter === 'all' || card.dataset.cat === filter;
          card.classList.toggle('hidden', !match);
        });
        updateCount();
      });
    });
    // Set initial count
    updateCount();
  }

  /* ---------- Footer year ---------- */
  const yr = document.getElementById('footerYear');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Theme toggle ---------- */
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------- Animated stat counters ---------- */
  const counters = document.querySelectorAll('[data-counter]');
  if (counters.length && 'IntersectionObserver' in window) {
    const cIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.dataset.counter);
          const dec = parseInt(el.dataset.decimals || '0', 10);
          const dur = parseInt(el.dataset.duration || '1400', 10);
          const start = performance.now();
          function step(now) {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            const value = target * eased;
            el.textContent = value.toLocaleString('en-US', {
              minimumFractionDigits: dec, maximumFractionDigits: dec
            });
            if (t < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
          cIO.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(c => cIO.observe(c));
  }

  /* ---------- Photography lightbox ---------- */
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('img');
    const lbPlace = lightbox.querySelector('.lb-place');
    const lbDate = lightbox.querySelector('.lb-date');
    const lbExif = lightbox.querySelector('.lb-exif');

    document.querySelectorAll('.photo').forEach(p => {
      p.addEventListener('click', () => {
        const img = p.querySelector('img');
        if (!img) return;
        lbImg.src = img.src;
        lbImg.alt = img.alt || '';
        if (lbPlace) lbPlace.textContent = p.dataset.place || '';
        if (lbDate)  lbDate.textContent  = p.dataset.date || '';
        if (lbExif)  lbExif.textContent  = p.dataset.exif || '';
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('open')) {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---------- Photography filter ---------- */
  const galleryFilters = document.querySelectorAll('.gallery-filters .filter-btn');
  const photos = document.querySelectorAll('.photo[data-region]');
  const galleryCount = document.querySelector('.gallery-count');

  function updateCount() {
    if (!galleryCount) return;
    const visible = Array.from(photos).filter(p => !p.classList.contains('dim')).length;
    galleryCount.textContent = visible;
  }

  galleryFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      galleryFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      photos.forEach(p => {
        const match = filter === 'all' || p.dataset.region === filter;
        p.classList.toggle('dim', !match);
      });
      updateCount();
    });
  });

  // ---------- Language proficiency bar animation ----------
  // Bars start at width 0; when their card scrolls into view, expand to target %.
  const langBars = document.querySelectorAll('.lang-skill .bar-fill');
  if (langBars.length && 'IntersectionObserver' in window) {
    // store target then zero out
    langBars.forEach(b => {
      const target = b.style.getPropertyValue('--pct');
      b.dataset.targetPct = target;
      b.style.setProperty('--pct', '0%');
    });
    const langIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          card.querySelectorAll('.bar-fill').forEach(b => {
            // small stagger
            const idx = Array.from(b.closest('.lang-breakdown').querySelectorAll('.bar-fill')).indexOf(b);
            setTimeout(() => {
              b.style.setProperty('--pct', b.dataset.targetPct);
            }, 150 + idx * 120);
          });
          langIO.unobserve(card);
        }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.lang-card').forEach(c => langIO.observe(c));
  }

})();
