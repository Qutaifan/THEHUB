/* ==========================================================================
   THEHUB — motion.js
   Drives the immersive layer defined in /css/motion.css.

   Dependency-free, deferred, and entirely progressive enhancement: the site is
   complete without it. It injects its own ambient markup rather than requiring
   changes to 180 hand-maintained HTML pages, and enhances existing components
   by selector.

   Performance notes, because this site is monetised and tracks Core Web Vitals:
     - all pointer work runs in one rAF loop, never in the event handler
     - listeners are passive; nothing here blocks scrolling
     - only transform / opacity / custom properties are written, so no effect
       in this file can cost CLS
     - tilt and magnetism are skipped on coarse pointers
     - the canvas stops when off-screen or the tab is hidden
     - the whole layer stands down under prefers-reduced-motion
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var supportsIO = 'IntersectionObserver' in window;

  /* Pointer state, read once per frame. */
  var px = 0.5, py = 0.4;      /* viewport-normalised pointer */
  var pxTarget = 0.5, pyTarget = 0.4;
  var field = null;
  var progress = null;
  var frameQueued = false;
  var lastClientWidth = -1;

  /* ----------------------------------------------------------------------
     Ambient field
     -------------------------------------------------------------------- */

  function buildField() {
    if (document.querySelector('.fx-field')) return;

    field = document.createElement('div');
    field.className = 'fx-field';
    field.setAttribute('aria-hidden', 'true');

    var parts = ['fx-grid', 'fx-grid fx-grid-fine',
                 'fx-aurora fx-aurora-1', 'fx-aurora fx-aurora-2', 'fx-aurora fx-aurora-3',
                 'fx-aurora fx-aurora-4'];
    if (!reduced) parts.push('fx-scan');
    if (fine && !reduced) parts.push('fx-halo');
    parts.push('fx-vignette');

    parts.forEach(function (cls) {
      var el = document.createElement('div');
      el.className = cls;
      field.appendChild(el);
    });

    document.body.appendChild(field);

    /* Relocate the page's canvas into the field so it spans the viewport
       rather than the hero's column. Inserted before the vignette so the
       vignette still sits on top of it. */
    var canvas = document.getElementById('fx-canvas');
    if (canvas) {
      var vignette = field.querySelector('.fx-vignette');
      if (vignette) field.insertBefore(canvas, vignette);
      else field.appendChild(canvas);
    }

    progress = document.createElement('div');
    progress.className = 'fx-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
  }

  /* ----------------------------------------------------------------------
     Single render loop — every pointer/scroll driven property is written here
     -------------------------------------------------------------------- */

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(render);
  }

  function render() {
    frameQueued = false;

    /* Ease the pointer so the halo trails rather than snapping. */
    px += (pxTarget - px) * 0.12;
    py += (pyTarget - py) * 0.12;

    if (field) {
      field.style.setProperty('--px', (px * 100).toFixed(2) + '%');
      field.style.setProperty('--py', (py * 100).toFixed(2) + '%');
    }
    if (coreHost) placeCore();

    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    var s = scrollable > 0 ? Math.min(1, Math.max(0, doc.scrollTop / scrollable)) : 0;
    root.style.setProperty('--scroll', s.toFixed(4));

    /* Scrollbar-free viewport width for .fx-bleed — see the note in
       motion.css. clientWidth excludes the scrollbar; 100vw does not. */
    if (doc.clientWidth !== lastClientWidth) {
      lastClientWidth = doc.clientWidth;
      root.style.setProperty('--vw', lastClientWidth + 'px');
    }

    updateHeroProgress();
    if (reviewRail) updateRail();
    if (pillarSpy) updatePillarSpy();

    /* Keep easing while the pointer is still catching up. */
    if (Math.abs(pxTarget - px) > 0.001 || Math.abs(pyTarget - py) > 0.001) requestFrame();
  }

  function onPointerMove(e) {
    pxTarget = e.clientX / window.innerWidth;
    pyTarget = e.clientY / window.innerHeight;
    requestFrame();
  }

  /* ----------------------------------------------------------------------
     Landing sequence

     The CSS beats (logo, headline, page) run on their own via animations
     scoped to html.is-intro — see motion.css. This function owns only the
     lifecycle: disarm it for readers who do not want motion, end it on the
     first sign of intent, and guarantee it ends at all.

     introT (0..1) is read by the canvas for the field burst, which is the one
     beat CSS cannot express.
     -------------------------------------------------------------------- */

  var INTRO_TOTAL = 2450;   /* ms until the class comes off on its own */
  var introActive = false;
  var introT = 0;
  var introClock = 0;

  /* Deliberate input only. A bare `scroll` listener is NOT safe here: browsers
     fire scroll on load when restoring a previous position, which would kill
     the sequence before it started. Scroll is handled separately below and
     only counts once the page has actually moved. */
  var INTRO_SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  function onIntroScroll() {
    if (window.scrollY > 4) endIntro();
  }

  function endIntro() {
    if (!introActive) return;
    introActive = false;
    introT = 1;
    root.classList.remove('is-intro');
    root.classList.add('intro-done');
    INTRO_SKIP_EVENTS.forEach(function (ev) {
      window.removeEventListener(ev, endIntro);
    });
    window.removeEventListener('scroll', onIntroScroll);
  }

  function armIntro() {
    if (!root.classList.contains('is-intro')) return;

    /* Set BEFORE any early return: endIntro() guards on this flag, so calling
       it while the flag is still false makes it a no-op and leaves .is-intro
       stuck on the element. */
    introActive = true;
    introClock = now();

    /* Never hold a reader who has asked for less motion. */
    if (reduced) { endIntro(); return; }

    /* Any sign of intent ends it immediately. The CSS animations are
       fill-mode:both onto the natural state, so dropping the class mid-flight
       simply snaps everything to its normal appearance. */
    INTRO_SKIP_EVENTS.forEach(function (ev) {
      window.addEventListener(ev, endIntro, { passive: true, once: true });
    });
    window.addEventListener('scroll', onIntroScroll, { passive: true });

    /* A reader who lands already scrolled (a reload part-way down, a restored
       position) has no business being shown an opening sequence. */
    if (window.scrollY > 4) { endIntro(); return; }

    /* Hard stop. Even if every frame is dropped, the class comes off. */
    setTimeout(endIntro, INTRO_TOTAL);
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  /* ----------------------------------------------------------------------
     Brand mark

     THEHUB drawn as what it says it is: a core with satellites on spokes,
     inside two counter-rotating scan rings. It deliberately rhymes with the
     constellation field in the hero — same node-and-link vocabulary, same
     palette — so the logo reads as a small instance of the thing the site is.

     Authored here rather than in markup because the lockup appears on all 179
     pages. The original <img> stays in the DOM as the no-JS fallback and is
     only hidden once the SVG is in place, at identical dimensions, so the swap
     cannot shift layout.
     -------------------------------------------------------------------- */

  var HUB_MARK =
    '<svg class="brand-mark-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"' +
    ' aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#22D3EE" stop-opacity="0.55"/>' +
          '<stop offset="60%" stop-color="#22D3EE" stop-opacity="0.10"/>' +
          '<stop offset="100%" stop-color="#22D3EE" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<radialGradient id="hubCore" cx="38%" cy="34%" r="70%">' +
          '<stop offset="0%" stop-color="#E0F7FF"/>' +
          '<stop offset="45%" stop-color="#67E8F9"/>' +
          '<stop offset="100%" stop-color="#0EA5E9"/>' +
        '</radialGradient>' +
      '</defs>' +

      '<circle class="hub-glow" cx="24" cy="24" r="23" fill="url(#hubGlow)"/>' +

      /* Geometry is deliberately chunky. The lockup renders this at 34px, so
         one viewBox unit is ~0.7 CSS px: hairline strokes and fine dash
         patterns land on sub-pixels and turn to mush. Everything here is sized
         to survive that — thick strokes, few long dashes, no second ring
         outline, and satellites large enough to read as objects. */

      /* Outer scan ring — segmented, turns slowly clockwise. */
      '<g class="hub-ring hub-ring-outer">' +
        '<circle cx="24" cy="24" r="20.4" fill="none" stroke="#22D3EE" stroke-opacity="0.6"' +
        ' stroke-width="1.9" stroke-linecap="round" stroke-dasharray="30 11 6 11"/>' +
      '</g>' +

      /* The satellites, on their own counter-rotating orbit. No ring outline
         behind them — at this size it read as noise rather than an orbit. */
      '<g class="hub-ring hub-ring-mid">' +
        '<circle class="hub-node" cx="39.5"  cy="24"    r="2.5" fill="#67E8F9"/>' +
        '<circle class="hub-node" cx="31.75" cy="37.42" r="2"   fill="#38BDF8"/>' +
        '<circle class="hub-node" cx="16.25" cy="37.42" r="2.5" fill="#67E8F9"/>' +
        '<circle class="hub-node" cx="8.5"   cy="24"    r="2"   fill="#38BDF8"/>' +
        '<circle class="hub-node" cx="16.25" cy="10.58" r="2.5" fill="#67E8F9"/>' +
        '<circle class="hub-node" cx="31.75" cy="10.58" r="2"   fill="#38BDF8"/>' +
      '</g>' +

      /* Spokes — the links out of the core, lit in sequence on hover. */
      '<g class="hub-spokes" stroke="#22D3EE" stroke-width="1.8" stroke-linecap="round">' +
        '<line class="hub-spoke" x1="31.5"  y1="24"    x2="36.4"  y2="24"/>' +
        '<line class="hub-spoke" x1="27.75" y1="30.5"  x2="30.2"  y2="34.74"/>' +
        '<line class="hub-spoke" x1="20.25" y1="30.5"  x2="17.8"  y2="34.74"/>' +
        '<line class="hub-spoke" x1="16.5"  y1="24"    x2="11.6"  y2="24"/>' +
        '<line class="hub-spoke" x1="20.25" y1="17.5"  x2="17.8"  y2="13.26"/>' +
        '<line class="hub-spoke" x1="27.75" y1="17.5"  x2="30.2"  y2="13.26"/>' +
      '</g>' +

      /* Core. */
      '<circle class="hub-core-halo" cx="24" cy="24" r="8.8" fill="none"' +
      ' stroke="#22D3EE" stroke-opacity="0.45" stroke-width="1.4"/>' +
      '<circle class="hub-core" cx="24" cy="24" r="5.6" fill="url(#hubCore)"/>' +
    '</svg>';

  function enhanceBrand() {
    var lockups = document.querySelectorAll('.brand-lockup');
    for (var i = 0; i < lockups.length; i++) {
      var lockup = lockups[i];
      if (lockup.querySelector('.brand-mark-svg')) continue;

      var img = lockup.querySelector('.brand-mark');
      if (!img) continue;

      var slot = document.createElement('span');
      slot.className = 'brand-mark-slot';
      slot.innerHTML = HUB_MARK;

      img.parentNode.insertBefore(slot, img);
      /* Kept in the DOM, not removed: with scripting off the original mark is
         what renders. Hidden only now that its replacement is in place. */
      img.hidden = true;

      lockup.classList.add('has-svg-mark');
    }
  }

  /* ----------------------------------------------------------------------
     Hero scroll descent

     Pins the hero for a short travel and reports 0..1 progress as --hero.
     Pinning is opt-in per viewport: the stage is only made sticky when the
     composition measurably fits, because a sticky stage taller than the
     viewport clips whatever overflows with no way to scroll to it. Short
     desktop windows and in-app phone browsers are exactly that case, so they
     keep the hero in normal flow and lose nothing but the parallax.
     -------------------------------------------------------------------- */

  var heroTrack = null;
  var heroStage = null;
  var heroP = 0;   /* 0..1 descent progress, also drives the canvas camera */

  /* Height the composition needs, measured from layout rather than from
     getBoundingClientRect: rects include transforms, and these children are
     transformed every frame, so a rect would feed the parallax back into its
     own fit test. offsetTop/offsetHeight are layout and cannot be poisoned. */
  function heroContentHeight() {
    if (!heroStage) return 0;
    var top = null, bottom = null;
    var kids = heroStage.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.tagName === 'CANVAS' || el.classList.contains('hero-hud') ||
          el.classList.contains('hero-core')) continue;
      if (!el.offsetHeight) continue;
      var t = el.offsetTop, b = t + el.offsetHeight;
      if (top === null || t < top) top = t;
      if (bottom === null || b > bottom) bottom = b;
    }
    return top === null ? 0 : bottom - top;
  }

  function evaluateHeroPin() {
    if (!heroTrack || !heroStage) return;

    if (reduced) { heroTrack.classList.remove('is-pinned'); return; }

    /* Measure unpinned, so the sticky stage's own min-height can't inflate
       the reading and make the fit test self-fulfilling. */
    var wasPinned = heroTrack.classList.contains('is-pinned');
    if (wasPinned) heroTrack.classList.remove('is-pinned');
    var need = heroContentHeight();
    var have = window.innerHeight;

    /* Headroom for the floating navbar plus the scroll cue. If it does not
       clear that, the hero stays in flow. */
    var fits = need > 0 && (need + 150) <= have;
    if (fits) heroTrack.classList.add('is-pinned');
    else heroTrack.classList.remove('is-pinned');
  }

  function updateHeroProgress() {
    if (!heroTrack) return;
    if (!heroTrack.classList.contains('is-pinned')) {
      /* Unpinned: the camera still advances, just driven by how far the hero
         has scrolled out of view rather than by a dedicated track. */
      var h = window.innerHeight || 1;
      heroP = Math.min(1, Math.max(0, window.scrollY / h));
      root.style.setProperty('--hero', '0');
      root.style.setProperty('--hero-exit', '0');
      root.style.setProperty('--hud', '0');
      root.style.setProperty('--field', heroP.toFixed(4));
      return;
    }
    /* offsetTop/offsetHeight again — the track itself is untransformed, but
       staying on layout metrics keeps this immune to any future transform. */
    var start = heroTrack.offsetTop;
    var travel = heroTrack.offsetHeight - window.innerHeight;
    if (travel <= 0) { root.style.setProperty('--hero', '0'); return; }

    var p = (window.scrollY - start) / travel;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);
    heroP = p;

    root.style.setProperty('--hero', p.toFixed(4));
    root.style.setProperty('--field', p.toFixed(4));
    root.style.setProperty('--hud', Math.min(1, p * 1.6).toFixed(4));

    /* Only the last 22% dims the stage, and only as the reader leaves it. */
    var exit = p < 0.78 ? 0 : (p - 0.78) / 0.22;
    root.style.setProperty('--hero-exit', exit.toFixed(4));
  }

  function armHeroScroll() {
    heroTrack = document.querySelector('.hero-scroll-track');
    if (!heroTrack) return;
    heroStage = heroTrack.querySelector('.hero-immersive');
    if (!heroStage) { heroTrack = null; return; }

    evaluateHeroPin();
    updateHeroProgress();
    window.addEventListener('resize', debounce(function () {
      evaluateHeroPin();
      updateHeroProgress();
    }, 180), { passive: true });
  }

  /* ----------------------------------------------------------------------
     Floating cards
     -------------------------------------------------------------------- */

  var CARD_SELECTOR = [
    '.bento-card', '.card', '.pair-card', '.related-card',
    '.category-chip-card', '.hero-stats-strip', '.code-install-block',
    '.tool-card', '.pick-card', '.game-card', '.distro-card',
    '[data-fx-card]'
  ].join(',');

  var MAX_CARDS = 400;   /* the largest pillar page carries a lot of them */
  var TILT = 5.5;        /* degrees at the card's edge */

  function enhanceCards() {
    var cards = document.querySelectorAll(CARD_SELECTOR);
    var n = Math.min(cards.length, MAX_CARDS);

    for (var i = 0; i < n; i++) {
      var card = cards[i];
      if (card.classList.contains('fx-card')) continue;
      card.classList.add('fx-card');

      /* Real elements rather than pseudo-elements: several page-specific
         stylesheets already use ::before / ::after on these classes. */
      if (fine && !reduced) {
        var sheen = document.createElement('span');
        sheen.className = 'fx-sheen';
        sheen.setAttribute('aria-hidden', 'true');
        card.appendChild(sheen);

        var edge = document.createElement('span');
        edge.className = 'fx-edge';
        edge.setAttribute('aria-hidden', 'true');
        card.appendChild(edge);

        card.addEventListener('pointermove', onCardMove, { passive: true });
        card.addEventListener('pointerleave', onCardLeave, { passive: true });
      }
    }
  }

  var pendingCard = null;
  var cardEvent = null;

  function onCardMove(e) {
    pendingCard = e.currentTarget;
    cardEvent = e;
    if (!cardFrameQueued) {
      cardFrameQueued = true;
      requestAnimationFrame(applyCard);
    }
  }

  var cardFrameQueued = false;

  function applyCard() {
    cardFrameQueued = false;
    if (!pendingCard || !cardEvent) return;

    var card = pendingCard;
    var rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var x = (cardEvent.clientX - rect.left) / rect.width;
    var y = (cardEvent.clientY - rect.top) / rect.height;

    card.style.setProperty('--mx', (x * 100).toFixed(2) + '%');
    card.style.setProperty('--my', (y * 100).toFixed(2) + '%');
    card.style.setProperty('--ry', ((x - 0.5) * 2 * TILT).toFixed(2) + 'deg');
    card.style.setProperty('--rx', ((0.5 - y) * 2 * TILT).toFixed(2) + 'deg');
    card.classList.add('is-tilting');
  }

  function onCardLeave(e) {
    var card = e.currentTarget;
    card.classList.remove('is-tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    if (pendingCard === card) pendingCard = null;
  }

  /* ----------------------------------------------------------------------
     Magnetic controls
     -------------------------------------------------------------------- */

  var MAGNET_SELECTOR = '.btn-accent, .btn-secondary-hero, .btn-link, [data-fx-magnetic]';
  var MAGNET_PULL = 0.32;
  var MAGNET_MAX = 9;

  function enhanceMagnets() {
    if (!fine || reduced) return;
    var els = document.querySelectorAll(MAGNET_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('fx-magnetic')) continue;
      el.classList.add('fx-magnetic');
      el.addEventListener('pointermove', onMagnetMove, { passive: true });
      el.addEventListener('pointerleave', onMagnetLeave, { passive: true });
    }
  }

  function onMagnetMove(e) {
    var el = e.currentTarget;
    var rect = el.getBoundingClientRect();
    var dx = (e.clientX - (rect.left + rect.width / 2)) * MAGNET_PULL;
    var dy = (e.clientY - (rect.top + rect.height / 2)) * MAGNET_PULL;
    dx = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx));
    dy = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy));
    el.style.setProperty('--dx', dx.toFixed(1) + 'px');
    el.style.setProperty('--dy', dy.toFixed(1) + 'px');
    el.classList.add('is-pulled');
  }

  function onMagnetLeave(e) {
    var el = e.currentTarget;
    el.classList.remove('is-pulled');
    el.style.setProperty('--dx', '0px');
    el.style.setProperty('--dy', '0px');
  }

  /* ----------------------------------------------------------------------
     Scroll reveal
     -------------------------------------------------------------------- */

  var REVEAL_SELECTOR = [
    '[data-reveal]',
    '.bento-card', '.card', '.pair-card', '.related-card',
    '.faq-item', '.table-wrap', '.section-header-quiet',
    '.hero-stats-strip', '.category-chip-card',
    '.tool-card', '.section-header', '.xlink-card'
  ].join(',');

  function armReveals() {
    var els = document.querySelectorAll(REVEAL_SELECTOR);
    if (!els.length) return;

    /* Ad units are never animated: they must occupy their reserved height
       from first paint (AGENTS.md §5). */
    var list = [];
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest('.ad-slot-container, .adsbygoogle')) continue;
      list.push(els[i]);
    }

    if (!supportsIO || reduced) {
      list.forEach(function (el) { el.classList.add('fx-reveal', 'is-in'); });
      return;
    }

    /* Stagger index resets per parent so each group cascades on its own. */
    var lastParent = null, idx = 0;
    list.forEach(function (el) {
      if (el.parentElement !== lastParent) { lastParent = el.parentElement; idx = 0; }
      el.style.setProperty('--i', Math.min(idx++, 8));
      el.classList.add('fx-reveal');
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    list.forEach(function (el) { io.observe(el); });

    /* Failsafe: nothing stays hidden if the observer never fires. */
    setTimeout(function () {
      list.forEach(function (el) { el.classList.add('is-in'); });
    }, 3000);
  }

  /* ----------------------------------------------------------------------
     Kinetic headline
     -------------------------------------------------------------------- */

  function splitKinetic() {
    var targets = document.querySelectorAll('[data-kinetic]');
    for (var t = 0; t < targets.length; t++) {
      var el = targets[t];
      if (el.classList.contains('fx-kinetic')) continue;
      el.classList.add('fx-kinetic');
      wrapWords(el);

      /* Start immediately — the headline is above the fold and usually the
         LCP element; waiting for an observer would delay it for no benefit.
         The class is added synchronously after a forced reflow rather than in
         a rAF callback: the words sit at translateY(105%) until `is-in` lands,
         so anything that can starve rAF would leave the headline clipped out
         of view. Reading offsetWidth flushes the initial state so the
         transition still plays. */
      void el.offsetWidth;
      el.classList.add('is-in');
    }
  }

  function wrapWords(el) {
    var index = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    var node;
    while ((node = walker.nextNode())) texts.push(node);

    texts.forEach(function (textNode) {
      if (!textNode.nodeValue.trim()) return;
      var frag = document.createDocumentFragment();
      var words = textNode.nodeValue.split(/(\s+)/);

      words.forEach(function (word) {
        if (!word) return;
        if (!word.trim()) { frag.appendChild(document.createTextNode(word)); return; }
        var mask = document.createElement('span');
        mask.className = 'fx-word-mask';
        var inner = document.createElement('span');
        inner.className = 'fx-word';
        inner.style.setProperty('--i', index++);
        inner.textContent = word;
        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  /* ----------------------------------------------------------------------
     Counters
     -------------------------------------------------------------------- */

  function armCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;

    if (!supportsIO || reduced) {
      for (var i = 0; i < els.length; i++) els[i].textContent = format(els[i]);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    for (var j = 0; j < els.length; j++) { els[j].classList.add('fx-count'); io.observe(els[j]); }
  }

  function format(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    return (el.getAttribute('data-prefix') || '') + target + (el.getAttribute('data-suffix') || '');
  }

  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1100;
    var start = null;
    var done = false;

    function settle() {
      if (done) return;
      done = true;
      el.textContent = prefix + target + suffix;
    }

    function step(ts) {
      if (done) return;
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step); else settle();
    }
    requestAnimationFrame(step);

    /* A throttled tab runs rAF at roughly 1fps, which would leave a counter
       parked on a wrong-looking number. Snap to the real value regardless. */
    setTimeout(settle, dur + 600);
  }

  /* ----------------------------------------------------------------------
     Ticker — duplicates its own children so the marquee loops seamlessly
     -------------------------------------------------------------------- */

  function armTickers() {
    var tracks = document.querySelectorAll('.fx-ticker-track');
    for (var i = 0; i < tracks.length; i++) {
      var track = tracks[i];
      if (track.dataset.fxCloned) continue;
      track.dataset.fxCloned = '1';
      var html = track.innerHTML;
      track.innerHTML = html + html;
    }
  }

  /* ----------------------------------------------------------------------
     Ticker ripple

     Clicking a tool in the index rail sends a drop-of-water ring out from the
     point of contact and an electric charge racing along the rail from there.
     The whole effect draws into a layer clipped to the ticker (.fx-ticker is
     overflow:hidden), so nothing escapes the bar. Navigation is held for one
     short beat so the charge is seen before the page changes — modified clicks
     (new tab, etc.) and reduced-motion readers are never intercepted.
     -------------------------------------------------------------------- */

  var RIPPLE_HOLD = 460;   /* ms the charge plays before the page navigates */

  /* One ripple engine, three behaviours. The charge is the site's signature
     click, so it is attached to every surface that reads as a rail or a
     tile — the index ticker, the pillar filter bar, and the cards — rather
     than living on one component.

       mode 'nav'    hold the navigation so the charge is seen, then follow
       mode 'anchor' hold, then smooth-scroll to the in-page target
       mode 'none'   purely visual; never interferes with the click

     itemSel is the element within the host that counts as a hit. The layer is
     always clipped to the host, so a charge can never escape its surface. */
  function armRippleSurface(host, itemSel, mode) {
    if (!host || host.dataset.fxRipple) return;
    host.dataset.fxRipple = '1';
    host.classList.add('fx-ripple-host');

    var layer = document.createElement('div');
    layer.className = 'fx-ripple-layer';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);

    host.addEventListener('click', function (e) {
      onRippleClick(e, host, layer, itemSel, mode);
    }, false);
  }

  function onRippleClick(e, host, layer, itemSel, mode) {
    if (reduced || !layer) return;
    if (e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var item = (e.target.closest && itemSel) ? e.target.closest(itemSel) : host;
    if (itemSel && !item) return;

    var rect = host.getBoundingClientRect();
    spawnRipple(layer, e.clientX - rect.left, e.clientY - rect.top,
                rect.width, rect.height);
    if (item && item !== host) {
      item.classList.add('fx-item-hit');
      setTimeout(function () { item.classList.remove('fx-item-hit'); }, 520);
    }

    if (mode === 'none' || !item) return;

    var href = item.getAttribute && item.getAttribute('href');
    if (!href) return;

    if (mode === 'anchor' && href.charAt(0) === '#') {
      var target = document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      setTimeout(function () {
        var y = target.getBoundingClientRect().top + window.scrollY - 128;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }, 150);
      return;
    }

    if (mode === 'nav' && href.charAt(0) !== '#') {
      e.preventDefault();
      setTimeout(function () { window.location.href = href; }, RIPPLE_HOLD);
    }
  }

  /* Cards and tiles get the same charge, contained within their own bounds —
     the layer clips itself, so the card's glow and lift are untouched. */
  var RIPPLE_CARD_SELECTOR = [
    '.tool-card', '.category-chip-card', '.bento-card',
    '.pick-card', '.related-card', '.xlink-card'
  ].join(',');

  function armTickerRipple() {
    var tickers = document.querySelectorAll('.fx-ticker');
    for (var i = 0; i < tickers.length; i++) {
      armRippleSurface(tickers[i], '.fx-ticker-item', 'nav');
    }

    /* The pillar pages' category rail — the same sliding bar of tools, so it
       gets the same behaviour, scrolling rather than navigating. */
    var bars = document.querySelectorAll('.filters');
    for (var b = 0; b < bars.length; b++) {
      armRippleSurface(bars[b], '.filter-btn', 'anchor');
    }

    if (reduced) return;
    var cards = document.querySelectorAll(RIPPLE_CARD_SELECTOR);
    var cap = Math.min(cards.length, 200);
    for (var c = 0; c < cap; c++) {
      /* Skip anything already hosting a bar ripple. */
      if (cards[c].dataset.fxRipple) continue;
      armRippleSurface(cards[c], null, 'none');
      cards[c].classList.add('fx-ripple-card');
    }
  }

  function spawnRipple(layer, x, y, w, h) {
    var frag = document.createDocumentFragment();

    /* Water: two concentric rings expanding from the point of contact. */
    for (var i = 0; i < 2; i++) {
      var ring = document.createElement('span');
      ring.className = 'fx-drop';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.animationDelay = (i * 90) + 'ms';
      frag.appendChild(ring);
    }

    /* Bright core flash. */
    var core = document.createElement('span');
    core.className = 'fx-drop-core';
    core.style.left = x + 'px';
    core.style.top = y + 'px';
    frag.appendChild(core);

    /* Electric current: a charge that races out both ways along the rail. */
    var surgeL = document.createElement('span');
    surgeL.className = 'fx-surge fx-surge-l';
    surgeL.style.left = '0px';
    surgeL.style.width = x + 'px';
    surgeL.style.setProperty('--oy', y + 'px');
    frag.appendChild(surgeL);

    var surgeR = document.createElement('span');
    surgeR.className = 'fx-surge fx-surge-r';
    surgeR.style.left = x + 'px';
    surgeR.style.width = (w - x) + 'px';
    surgeR.style.setProperty('--oy', y + 'px');
    frag.appendChild(surgeR);

    /* Forked filaments — thin bolts crackling off the origin at shallow,
       rail-hugging angles, half going each way. */
    for (var b = 0; b < 5; b++) {
      var bolt = document.createElement('span');
      bolt.className = 'fx-bolt';
      var dir = (b % 2) ? 1 : -1;
      var ang = Math.random() * 26 - 13;
      bolt.style.left = x + 'px';
      bolt.style.top = y + 'px';
      bolt.style.setProperty('--len', (60 + Math.random() * 120).toFixed(0) + 'px');
      bolt.style.setProperty('--ang', (dir < 0 ? 180 - ang : ang).toFixed(1) + 'deg');
      bolt.style.animationDelay = (Math.random() * 60).toFixed(0) + 'ms';
      frag.appendChild(bolt);
    }

    layer.appendChild(frag);

    /* Cheap self-cleanup so a long session does not accrete nodes. */
    setTimeout(function () {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }, 900);
  }

  /* ----------------------------------------------------------------------
     Review article immersion

     The individual review pages are the deepest body of content on the site
     and carried the least motion — plain prose behind the ambient field. This
     lifts them into the same instrument-panel language as the rest of the site
     without touching any of the 140 hand-written files: everything is stamped
     by selector from here, keyed on the /reviews/<slug> URL so it never reaches
     the homepage, the /reviews/ index, or the pillar pages.
     -------------------------------------------------------------------- */

  function enhanceReview() {
    if (!/\/reviews\/[^/]+/.test(location.pathname)) return;
    var wrap = document.querySelector('main article .wrap');
    if (!wrap) return;

    root.classList.add('fx-review');
    wrap.classList.add('fx-doc');

    /* Title takes the kinetic word-rise the homepage headline uses. */
    var h1 = wrap.querySelector('h1');
    if (h1 && !h1.hasAttribute('data-kinetic')) h1.setAttribute('data-kinetic', '');

    /* Reveal every top-level block on scroll. data-reveal is consumed by
       armReveals() (run after this) so it inherits the observer, the
       reduced-motion fallback and the failsafe. --sub is a per-section index
       armReveals does not touch, so each section cascades on its own without
       the whole-document delay a shared stagger would impose. */
    var kids = wrap.children;
    var sub = 0;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      var tag = el.tagName;
      if (tag === 'H1') continue;

      var isBlock = (tag === 'H2' || tag === 'H3' || tag === 'P' ||
                     tag === 'UL' || tag === 'OL' || tag === 'BLOCKQUOTE' ||
                     el.classList.contains('table-scroll'));
      if (!isBlock) continue;

      if (tag === 'H2') { sub = 0; el.classList.add('fx-doc-h'); }
      el.setAttribute('data-reveal', '');
      el.classList.add('fx-doc-block');
      el.style.setProperty('--sub', Math.min(sub++, 6));

      /* Pros / Cons: colour the verdict list that follows the heading. */
      if (tag === 'H2') {
        var label = (el.textContent || '').trim().toLowerCase();
        if (label === 'pros' || label === 'cons') {
          var next = el.nextElementSibling;
          while (next && next.tagName === 'P') next = next.nextElementSibling;
          if (next && next.tagName === 'UL') {
            next.classList.add('fx-verdict', label === 'pros' ? 'fx-pros' : 'fx-cons');
          }
        }
      }
    }

    /* The "Related tools" cards become first-class fx-cards (tilt + sheen)
       and reveal on scroll. enhanceCards() and armReveals() pick these up. */
    var rel = document.querySelectorAll('main article > section a[href^="/reviews/"]');
    for (var r = 0; r < rel.length; r++) {
      rel[r].setAttribute('data-fx-card', '');
      rel[r].setAttribute('data-reveal', '');
    }

    /* Feature / spec lists — any list whose items lead with a bold term
       becomes a scannable spec grid (the <strong> is the term, the rest the
       value). Presentation only; the text is untouched. */
    markSpecLists(wrap);

    buildReviewRail(wrap);
  }

  /* Small deterministic PRNG + slug hash, so a given tool always renders the
     same backdrop but every tool renders a different one. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pageSeed() {
    var s = location.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/').pop() || 'x';
    var hsh = 2166136261;
    for (var i = 0; i < s.length; i++) { hsh ^= s.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    return hsh >>> 0;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function markSpecLists(wrap) {
    var lists = wrap.querySelectorAll('ul');
    for (var i = 0; i < lists.length; i++) {
      var ul = lists[i];
      if (ul.classList.contains('fx-verdict')) continue;   /* pros/cons already */
      var items = ul.children, lead = 0, total = 0;
      for (var j = 0; j < items.length; j++) {
        if (items[j].tagName !== 'LI') continue;
        total++;
        var first = items[j].firstElementChild;
        if (first && (first.tagName === 'STRONG' || first.tagName === 'B')) lead++;
      }
      /* Only when it is clearly a term/definition list. */
      if (total >= 2 && lead >= Math.ceil(total * 0.6)) ul.classList.add('fx-spec');
    }
  }

  /* ----------------------------------------------------------------------
     Review section rail

     A glowing outline of the page built from its own headings: a fixed rail
     of numbered nodes that tracks the section you are reading, lights it up,
     and jumps you there on click. This is the "shortcut the obvious" layer —
     the whole structure of a long review, legible and navigable at a glance.
     Shown only where there is room for it; the top progress bar covers narrow
     screens.
     -------------------------------------------------------------------- */

  var reviewRail = null;

  function buildReviewRail(wrap) {
    var hs = wrap.querySelectorAll('h2.fx-doc-h');
    if (hs.length < 3) return;

    var nav = document.createElement('nav');
    nav.className = 'fx-rail';
    nav.setAttribute('aria-label', 'Section navigator');

    var line = document.createElement('span');
    line.className = 'fx-rail-line';
    line.setAttribute('aria-hidden', 'true');
    nav.appendChild(line);

    var items = [];
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (!h.id) h.id = 'sec-' + (i + 1);
      var a = document.createElement('a');
      a.className = 'fx-rail-item';
      a.href = '#' + h.id;
      a.innerHTML =
        '<span class="fx-rail-dot" aria-hidden="true"></span>' +
        '<span class="fx-rail-label"><b>' +
        (i + 1 < 10 ? '0' : '') + (i + 1) + '</b>' +
        escapeHtml(h.textContent.trim()) + '</span>';
      a.addEventListener('click', onRailClick, false);
      nav.appendChild(a);
      items.push({ a: a, h: h });
    }

    document.body.appendChild(nav);
    reviewRail = { nav: nav, items: items, active: -1 };
    /* Reveal once positioned so it fades in rather than snapping. */
    requestAnimationFrame(function () { nav.classList.add('is-ready'); });
    updateRail();
  }

  function onRailClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    var id = e.currentTarget.getAttribute('href').slice(1);
    var target = document.getElementById(id);
    if (!target) return;
    var y = target.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }

  function updateRail() {
    if (!reviewRail) return;
    var items = reviewRail.items;
    var mark = window.scrollY + 130;   /* the "reading line" */
    var active = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].h.offsetTop <= mark) active = i;
    }
    if (active === reviewRail.active) return;
    reviewRail.active = active;
    for (var j = 0; j < items.length; j++) {
      items[j].a.classList.toggle('is-past', j < active);
      items[j].a.classList.toggle('is-active', j === active);
    }
    /* Drive the lit spine from the active stage rather than from raw document
       scroll, so the charge always terminates exactly on the node that is
       lit — the line and the label say the same thing. */
    var frac = items.length > 1 ? (active + 0.5) / items.length : 1;
    reviewRail.nav.style.setProperty('--rail-fill', (frac * 100).toFixed(1) + '%');
  }

  /* ----------------------------------------------------------------------
     Review backdrop

     A generative animated field, unique to each tool: the slug seeds one of
     four structural patterns (plexus, circuit, sonar rings, flow field) in one
     of a few on-brand hues. Same electric vocabulary as the rest of the site,
     so a review never reads as a separate page — but no two tools share a
     backdrop, so opening one feels like arriving somewhere. Pointer- and
     scroll-reactive, paused when hidden, and never built under reduced motion.
     -------------------------------------------------------------------- */

  function buildSeededBackdrop() {
    if (reduced) return;
    /* The homepage draws its own constellation descent; every other page in
       the site gets a backdrop seeded from its own URL, so each one has an
       identity while sharing the vocabulary. */
    if (document.getElementById('fx-canvas')) return;
    var fieldEl = document.querySelector('.fx-field');
    if (!fieldEl || document.getElementById('fx-review-bg')) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'fx-review-bg';
    canvas.setAttribute('aria-hidden', 'true');
    var vg = fieldEl.querySelector('.fx-vignette');
    if (vg) fieldEl.insertBefore(canvas, vg); else fieldEl.appendChild(canvas);
    root.classList.add('has-seeded-bg');

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var seed = pageSeed();
    var rnd = mulberry32(seed);
    var pattern = seed % 4;
    var HUES = [188, 168, 206, 258];   /* cyan · teal · azure · plasma */
    var hue = HUES[(seed >>> 5) % HUES.length];
    var col = function (l, a) { return 'hsla(' + hue + ',90%,' + l + '%,' + a + ')'; };

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, running = false, raf = 0, t0 = now();
    var st = {};

    function build() {
      var area = w * h;
      var dense = fine ? 1 : 0.6;   /* lighter on phones/tablets */
      if (pattern === 0) {
        var n = Math.min(88, Math.round(area / 17000 * dense));
        st.nodes = [];
        for (var i = 0; i < n; i++) st.nodes.push({
          x: rnd() * w, y: rnd() * h,
          vx: (rnd() - 0.5) * 0.16, vy: (rnd() - 0.5) * 0.16,
          r: 0.6 + rnd() * 1.5
        });
      } else if (pattern === 1) {
        st.cell = 48;
        st.pulses = [];
        var np = Math.min(30, Math.round(area / 46000 * dense));
        for (var p = 0; p < np; p++) st.pulses.push(newPulse());
      } else if (pattern === 2) {
        st.em = [];
        var ne = 3 + (seed % 3);
        for (var e = 0; e < ne; e++) st.em.push({
          x: (0.18 + rnd() * 0.64) * w,
          y: (0.18 + rnd() * 0.64) * h,
          phase: rnd() * 4000, period: 3000 + rnd() * 2200
        });
      } else {
        var m = Math.min(120, Math.round(area / 13000 * dense));
        st.parts = [];
        for (var k = 0; k < m; k++) st.parts.push({ x: rnd() * w, y: rnd() * h, life: rnd() * 260 });
        st.fseed = (seed % 1000) / 120;
      }
    }

    function newPulse() {
      var cell = st.cell, horiz = rnd() < 0.5;
      var cross = horiz ? h : w, len = horiz ? w : h;
      var lines = Math.max(1, Math.floor(cross / cell));
      var dir = rnd() < 0.5 ? 1 : -1;
      return {
        horiz: horiz, line: Math.floor(rnd() * lines) * cell,
        pos: dir > 0 ? -30 : len + 30, spd: (0.8 + rnd() * 1.5) * dir
      };
    }

    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function draw() {
      if (!running) return;
      var tt = now() - t0;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate((px - 0.5) * 26, (py - 0.5) * 26 + (window.scrollY || 0) * 0.015);
      if (pattern === 0) drawPlexus();
      else if (pattern === 1) drawCircuit();
      else if (pattern === 2) drawRings(tt);
      else drawFlow(tt);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    }

    function drawPlexus() {
      var n = st.nodes, L = 138;
      for (var i = 0; i < n.length; i++) {
        var a = n[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < -20) a.x = w + 20; else if (a.x > w + 20) a.x = -20;
        if (a.y < -20) a.y = h + 20; else if (a.y > h + 20) a.y = -20;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283);
        ctx.fillStyle = col(72, 0.5); ctx.fill();
      }
      for (var p = 0; p < n.length; p++) {
        for (var q = p + 1; q < n.length; q++) {
          var dx = n[p].x - n[q].x, dy = n[p].y - n[q].y, d2 = dx * dx + dy * dy;
          if (d2 > L * L) continue;
          ctx.beginPath(); ctx.moveTo(n[p].x, n[p].y); ctx.lineTo(n[q].x, n[q].y);
          ctx.strokeStyle = col(62, 0.16 * (1 - Math.sqrt(d2) / L));
          ctx.lineWidth = 1; ctx.stroke();
        }
      }
    }

    function drawCircuit() {
      var cell = st.cell;
      ctx.strokeStyle = col(55, 0.05); ctx.lineWidth = 1;
      for (var x = 0; x <= w; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (var y = 0; y <= h; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      var ps = st.pulses;
      for (var i = 0; i < ps.length; i++) {
        var pl = ps[i]; pl.pos += pl.spd;
        var len = pl.horiz ? w : h;
        if (pl.pos < -40 || pl.pos > len + 40) { ps[i] = newPulse(); continue; }
        var cx = pl.horiz ? pl.pos : pl.line, cy = pl.horiz ? pl.line : pl.pos;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 24);
        g.addColorStop(0, col(82, 0.6)); g.addColorStop(1, col(82, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 6.283); ctx.fill();
        ctx.strokeStyle = col(78, 0.5); ctx.lineWidth = 1.5; ctx.beginPath();
        var back = 34 * (pl.spd > 0 ? 1 : -1);
        if (pl.horiz) { ctx.moveTo(cx - back, cy); ctx.lineTo(cx, cy); }
        else { ctx.moveTo(cx, cy - back); ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    }

    function drawRings(tt) {
      var em = st.em, reach = Math.max(w, h) * 0.62;
      ctx.lineWidth = 1.4;
      for (var i = 0; i < em.length; i++) {
        var e = em[i];
        for (var k = 0; k < 4; k++) {
          var prog = (((tt + e.phase) / e.period) + k * 0.25) % 1;
          var al = 0.26 * (1 - prog);
          if (al <= 0.01) continue;
          ctx.beginPath(); ctx.arc(e.x, e.y, prog * reach, 0, 6.283);
          ctx.strokeStyle = col(68, al); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(e.x, e.y, 2.2, 0, 6.283);
        ctx.fillStyle = col(84, 0.7); ctx.fill();
      }
    }

    function drawFlow(tt) {
      var parts = st.parts, fs = st.fseed;
      ctx.lineWidth = 1.1;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var ang = (Math.sin(p.x * 0.004 + fs) + Math.cos(p.y * 0.004 - fs) + tt * 0.00010) * 3.14159;
        var nx = p.x + Math.cos(ang) * 1.2, ny = p.y + Math.sin(ang) * 1.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny);
        ctx.strokeStyle = col(72, 0.24); ctx.stroke();
        p.x = nx; p.y = ny; p.life--;
        if (p.life < 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          p.x = rnd() * w; p.y = rnd() * h; p.life = 140 + rnd() * 180;
        }
      }
    }

    /* First frame is drawn synchronously so the backdrop is present on first
       paint rather than after a rAF that a backgrounded tab may never fire;
       draw() then schedules the loop from there. */
    function startBg() { if (running) return; running = true; draw(); }
    function stopBg() { running = false; cancelAnimationFrame(raf); }

    resize();
    window.addEventListener('resize', debounce(resize, 200), { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopBg(); else startBg();
    });
    startBg();
  }

  /* ----------------------------------------------------------------------
     FAQ accordion

     The FAQ blocks on the pillar pages render every answer at once — a wall
     of prose that buries the questions. Collapsing them turns the block into
     a scannable index that opens on demand. Nothing is removed: the answers
     stay in the DOM (so the FAQPage markup still matches the page), they are
     simply closed until asked for.

     The closed state is CSS keyed on .fx-faq, added here rather than on
     <html class="js">: if this script never runs, every answer stays open
     rather than being sealed behind a toggle that will never work. init()
     runs synchronously from a deferred script at readyState 'interactive',
     so the fold lands before first paint in practice, and the FAQ block sits
     far below the fold regardless.
     -------------------------------------------------------------------- */

  function armFaq() {
    var items = document.querySelectorAll('.faq-item');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.classList.contains('fx-faq')) continue;
      var q = item.querySelector('.faq-q');
      var a = item.querySelector('.faq-a');
      if (!q || !a) continue;

      item.classList.add('fx-faq');
      /* First answer starts open — CSS opens it at first paint too, so this
         only mirrors that state into the attributes. */
      var open = i === 0;
      if (open) item.classList.add('is-open');

      if (!a.id) a.id = 'faq-a-' + (i + 1);
      q.setAttribute('role', 'button');
      q.setAttribute('tabindex', '0');
      q.setAttribute('aria-expanded', open ? 'true' : 'false');
      q.setAttribute('aria-controls', a.id);

      q.addEventListener('click', toggleFaq, false);
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleFaq.call(this, e);
        }
      }, false);
    }
  }

  function toggleFaq(e) {
    var q = e.currentTarget || this;
    var item = q.closest('.faq-item');
    if (!item) return;
    var open = item.classList.toggle('is-open');
    q.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ----------------------------------------------------------------------
     Pillar pages

     The category pages are the widest surface on the site and the least
     alive: a static rail, flat dividers, and 63 identical cards each carrying
     a full paragraph. This brings them onto the homepage's vocabulary —
     drawn dividers, orbiting section marks, a rail that tracks where you are,
     and cards that hold their description until you want it.

     All of it is applied by selector; none of the pillar HTML is touched.
     -------------------------------------------------------------------- */

  var pillarSpy = null;

  function enhancePillar() {
    var bar = document.querySelector('.filters');
    var grids = document.querySelectorAll('.tool-grid');
    if (!bar && !grids.length) return;

    root.classList.add('fx-pillar');

    if (bar) armPillarSpy(bar);
    drawDividers();
    drawSectionMarks();
    clampToolDescriptions();
  }

  /* Scrollspy: the rail lights the category you are actually inside, so the
     bar stops being decoration and becomes a position readout. */
  function armPillarSpy(bar) {
    var links = bar.querySelectorAll('.filter-btn[href^="#"]');
    var pairs = [];
    for (var i = 0; i < links.length; i++) {
      var sec = document.getElementById(links[i].getAttribute('href').slice(1));
      if (sec) pairs.push({ link: links[i], sec: sec });
    }
    if (!pairs.length) return;
    pillarSpy = { pairs: pairs, active: -2, all: bar.querySelector('.filter-btn') };
    updatePillarSpy();
  }

  function updatePillarSpy() {
    if (!pillarSpy) return;
    var mark = window.scrollY + 190;
    var active = -1;
    for (var i = 0; i < pillarSpy.pairs.length; i++) {
      if (pillarSpy.pairs[i].sec.offsetTop <= mark) active = i;
    }
    if (active === pillarSpy.active) return;
    pillarSpy.active = active;

    for (var j = 0; j < pillarSpy.pairs.length; j++) {
      pillarSpy.pairs[j].link.classList.toggle('is-current', j === active);
    }
    /* "All Tools" owns the state above the first section. */
    if (pillarSpy.all) pillarSpy.all.classList.toggle('is-current', active === -1);

    /* Keep the current chip in view inside the horizontal rail. */
    if (active >= 0 && !reduced) {
      var el = pillarSpy.pairs[active].link;
      var scroller = el.parentElement;
      if (scroller && scroller.scrollWidth > scroller.clientWidth) {
        var want = el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2;
        scroller.scrollTo({ left: Math.max(0, want), behavior: 'smooth' });
      }
    }
  }

  /* The flat 1px rules between sections become drawn circuit traces: the line
     draws itself in, nodes light along it, and a charge runs the length. */
  var DIVIDER_SVG =
    '<svg class="fx-divider-svg" viewBox="0 0 1200 24" preserveAspectRatio="none"' +
    ' aria-hidden="true" focusable="false">' +
      '<path class="fx-div-trace" d="M0 12 H420 L444 2 H756 L780 12 H1200"' +
      ' fill="none" stroke="currentColor" stroke-width="1.25"' +
      ' vector-effect="non-scaling-stroke"/>' +
      '<circle class="fx-div-node" cx="420" cy="12" r="2.6"/>' +
      '<circle class="fx-div-node" cx="600" cy="2"  r="3.2"/>' +
      '<circle class="fx-div-node" cx="780" cy="12" r="2.6"/>' +
      '<path class="fx-div-spark" d="M0 12 H420 L444 2 H756 L780 12 H1200"' +
      ' fill="none" stroke-width="2" stroke-linecap="round"' +
      ' vector-effect="non-scaling-stroke"/>' +
    '</svg>';

  function drawDividers() {
    var divs = document.querySelectorAll('.section-divider');
    for (var i = 0; i < divs.length; i++) {
      if (divs[i].querySelector('.fx-divider-svg')) continue;
      divs[i].classList.add('fx-divider');
      divs[i].innerHTML = DIVIDER_SVG;
      divs[i].setAttribute('data-reveal', '');
    }
  }

  /* Each section mark gets an orbit drawn around it — the same core-and-
     satellites language as the brand mark, so a section header reads as a
     small instance of the site's own logo. */
  var MARK_SVG =
    '<svg class="fx-orbit-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<circle class="fx-orbit-ring" cx="32" cy="32" r="28" fill="none"' +
      ' stroke="currentColor" stroke-width="1.2" stroke-dasharray="42 14 8 14"/>' +
      '<circle class="fx-orbit-sat" cx="60" cy="32" r="2.4"/>' +
      '<circle class="fx-orbit-sat fx-orbit-sat-2" cx="4" cy="32" r="1.8"/>' +
    '</svg>';

  function drawSectionMarks() {
    var icons = document.querySelectorAll('.section-icon');
    for (var i = 0; i < icons.length; i++) {
      if (icons[i].parentElement.querySelector('.fx-orbit-svg')) continue;
      var slot = document.createElement('span');
      slot.className = 'fx-orbit';
      slot.setAttribute('aria-hidden', 'true');
      slot.innerHTML = MARK_SVG;
      icons[i].appendChild(slot);
      icons[i].classList.add('fx-has-orbit');
    }
  }

  /* 63 cards each carrying a full paragraph is the reason the page reads as a
     wall. The description is clamped to its first lines and opens on click.

     Nothing is removed or truncated in the DOM — the full text is present for
     readers and crawlers alike, and the clamp is CSS keyed on html.js so the
     first paint is already clamped and this cannot shift layout. */
  function clampToolDescriptions() {
    var descs = document.querySelectorAll('.tool-desc');
    for (var i = 0; i < descs.length; i++) {
      var d = descs[i];
      if (d.classList.contains('fx-clamp')) continue;
      /* Only worth folding when there is meaningfully more than fits. */
      if ((d.textContent || '').trim().length < 150) continue;
      d.classList.add('fx-clamp');
      d.setAttribute('role', 'button');
      d.setAttribute('tabindex', '0');
      d.setAttribute('aria-expanded', 'false');
      d.addEventListener('click', toggleClamp, false);
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleClamp.call(this, e);
        }
      }, false);
    }
  }

  function toggleClamp(e) {
    var d = e.currentTarget || this;
    var open = d.classList.toggle('is-open');
    d.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ----------------------------------------------------------------------
     Table overflow guard

     Several pages put a wide comparison table straight into a plain container.
     At 390px that pushes the whole document sideways — measured at 209px on
     the AI pillar page, and 24px there even before this redesign. Rather than
     hunt them page by page, any table without a scrollable ancestor gets one.
     -------------------------------------------------------------------- */

  function wrapTables() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (table.closest('.table-wrap, .table-scroll, .content-table-wrap')) continue;

      /* Respect any existing scroll container the page already provides. */
      var scrollable = false;
      var p = table.parentElement;
      while (p && p !== document.body) {
        var ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') { scrollable = true; break; }
        p = p.parentElement;
      }
      if (scrollable) continue;

      var wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  }

  /* ----------------------------------------------------------------------
     Constellation canvas — homepage hero
     -------------------------------------------------------------------- */

  function armCanvas() {
    var canvas = document.getElementById('fx-canvas');
    if (!canvas || reduced) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var nodes = [];
    var running = false;
    var rafId = 0;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    /* The field has depth: nodes carry a z, and scrolling advances a camera
       through them. Travelling into the field rather than watching it drift
       past is what makes the opening read as a descent rather than a
       screensaver. */
    var NEAR = 0.22;        /* nearest z the camera renders */
    var SPAN = 2.30;        /* depth of the slab; nodes wrap within it */
    var TRAVEL = 1.55;      /* how far a full scroll of the track moves us */
    var LINK_DIST = 128;    /* link threshold, in projected screen px */

    function seed() {
      /* Density by area, hard-capped so a wide monitor does not pay for it. */
      var count = Math.min(180, Math.round((w * h) / 8200));
      nodes = [];
      for (var i = 0; i < count; i++) {
        /* Sampled as an annulus around the view axis, never a filled disc.
           A node near the plane's origin projects to the vanishing point at
           every depth, so uniform x/y sampling parks a permanent bright knot
           dead centre — directly on top of the headline. Holding every node
           off the axis keeps the centre of the composition clear. */
        var ang = Math.random() * Math.PI * 2;
        var rad = 0.42 + Math.random() * 1.05;
        nodes.push({
          x: Math.cos(ang) * rad,
          y: Math.sin(ang) * rad * 0.72,   /* flattened: screens are landscape */
          z: NEAR + Math.random() * SPAN,
          d: Math.random() * 0.5 + 0.75,   /* per-node size variation */
          hub: Math.random() < 0.08        /* a few larger, haloed nodes */
        });
      }
    }

    var proj = [];
    var projByNode = [];   /* this frame's projection, by node index */
    var links = [];        /* this frame's drawn links, as index pairs */
    var pulses = [];
    var lastSpawn = 0, lastTs = 0;
    var t0 = now();

    /* --- the field burst (beat 3) -------------------------------------
       Held back until the logo and headline have landed, then: the nodes are
       flung from a tight knot out past the edges, and as that peaks the camera
       rushes forward so the field streams in toward the reader and fills the
       screen. It arrives at exactly the resting state the rest of the page
       uses, so there is no seam between the intro and normal behaviour.       */
    var BURST_DELAY = 1000;   /* ms after boot before the field moves */
    var BURST_DUR   = 1050;   /* ms for the whole burst-and-arrive     */

    function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function frame(ts) {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      var tNow = ts || now();
      var secs = (tNow - t0) / 1000;

      /* Burst progress. Once the intro is over this pins at 1 and every term
         below collapses to its resting value. */
      var radial = 1, camBurst = 0, burstAlpha = 1;
      if (introActive) {
        var bt = (tNow - introClock - BURST_DELAY) / BURST_DUR;
        bt = bt < 0 ? 0 : (bt > 1 ? 1 : bt);
        introT = bt;

        if (bt <= 0) {
          /* Still on the logo and headline: field held collapsed and dark. */
          radial = 0.06; burstAlpha = 0;
        } else if (bt < 0.42) {
          /* Scatter: a hard shove outward, past where it will settle. */
          var e = easeOutExpo(bt / 0.42);
          radial = 0.06 + (1.72 - 0.06) * e;
          burstAlpha = Math.min(1, bt / 0.10);
        } else {
          /* Arrive: eases back from the overshoot while the camera runs
             forward, so the field reads as coming toward the reader. */
          var k = (bt - 0.42) / 0.58;
          radial = 1.72 + (1 - 1.72) * easeInOutCubic(k);
          camBurst = easeOutCubic(k) * 1.15;
          burstAlpha = 1;
        }
      }

      /* Camera: scroll is the driver, plus a slow autopilot so the field is
         alive even when the reader is not moving, plus the intro's rush. */
      var cam = heroP * TRAVEL + secs * 0.045 + camBurst;

      /* Pointer parallax — shifts the vanishing point, not the nodes, so the
         whole field reacts as one body. */
      var focal = Math.min(w, h) * 0.62;
      var cx = w / 2 + (px - 0.5) * w * 0.07;
      var cy = h / 2 + (py - 0.5) * h * 0.07;

      proj.length = 0;
      projByNode.length = 0;

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var z = n.z - cam;
        /* Wrap within the slab so the field never runs out. */
        z = ((z - NEAR) % SPAN + SPAN) % SPAN + NEAR;

        var s = focal / z;
        var sx = cx + n.x * radial * s;
        var sy = cy + n.y * radial * s;

        /* Fade in from the back, fade out as it sweeps past the camera, so
           nodes never pop into or out of existence. */
        var aIn  = Math.min(1, (NEAR + SPAN - z) / 0.75);
        var aOut = Math.min(1, (z - NEAR) / 0.30);
        var alpha = Math.max(0, Math.min(1, Math.min(aIn, aOut))) * burstAlpha;
        if (alpha <= 0.01) continue;
        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;

        var r = Math.max(0.5, Math.min(2.8, s * 0.0042 * n.d));
        if (n.hub) r *= 1.6;

        /* Pointer proximity: the field pays attention where the cursor
           is. Nodes near it burn brighter and reach further. Fine
           pointers only — with no pointer the default position would
           park a permanent hot spot in the middle of the composition. */
        var boost = 0;
        if (fine) {
          var ddx = sx - px * w, ddy = sy - py * h;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < 260) boost = 1 - dd / 260;
        }
        var entry = { x: sx, y: sy, a: alpha, r: r, i: i, b: boost };
        proj.push(entry);
        projByNode[i] = entry;

        if (n.hub) {
          ctx.beginPath();
          ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 211, 238, ' + (0.10 * alpha).toFixed(3) + ')';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + (n.hub ? '224, 247, 255' : '103, 232, 249') + ', ' +
          ((0.62 + 0.3 * boost) * alpha).toFixed(3) + ')';
        ctx.fill();
      }

      /* The linking pass is O(n^2). Now that the field runs behind the whole
         page rather than just the hero, skip it once CSS has dimmed the
         canvas far enough that the links are no longer legible — the drifting
         points still read, at a fraction of the cost. */
      var dt = lastTs ? Math.min(0.05, (tNow - lastTs) / 1000) : 0.016;
      lastTs = tNow;

      if (heroP > 0.72) { pulses.length = 0; rafId = requestAnimationFrame(frame); return; }

      links.length = 0;
      ctx.lineWidth = 1;
      for (var a = 0; a < proj.length; a++) {
        for (var b = a + 1; b < proj.length; b++) {
          var dx = proj[a].x - proj[b].x;
          var dy = proj[a].y - proj[b].y;
          var d2 = dx * dx + dy * dy;
          /* Links reach further, and burn brighter, near the pointer. */
          var near = proj[a].b > proj[b].b ? proj[a].b : proj[b].b;
          var lim = LINK_DIST * (1 + near * 0.55);
          if (d2 > lim * lim) continue;
          var d = Math.sqrt(d2);
          var la = (0.22 + near * 0.3) * (1 - d / lim) * Math.min(proj[a].a, proj[b].a);
          ctx.beginPath();
          ctx.moveTo(proj[a].x, proj[a].y);
          ctx.lineTo(proj[b].x, proj[b].y);
          ctx.strokeStyle = 'rgba(34, 211, 238, ' + la.toFixed(3) + ')';
          ctx.stroke();
          links.push(proj[a].i, proj[b].i);
        }
      }

      drawPulses(tNow, dt);
      rafId = requestAnimationFrame(frame);
    }

    /* --- signals ------------------------------------------------------
       Packets of light travelling the links. Every so often a drawn link
       is picked and a charge runs along it. A pulse is held by node
       index, not by screen point, so it rides the field as the camera
       moves; one whose link has since broken is simply dropped. Held
       back until the field burst has settled. */
    var MAX_PULSES = 14;

    function drawPulses(tNow, dt) {
      var settled = !introActive || introT > 0.6;
      if (settled && links.length && pulses.length < MAX_PULSES && tNow - lastSpawn > 110) {
        var k = Math.floor(Math.random() * (links.length / 2)) * 2;
        pulses.push({ a: links[k], b: links[k + 1], t: 0, v: 0.7 + Math.random() * 0.9 });
        lastSpawn = tNow;
      }
      for (var p = pulses.length - 1; p >= 0; p--) {
        var pl = pulses[p];
        var A = projByNode[pl.a], B = projByNode[pl.b];
        pl.t += dt * pl.v;
        if (!A || !B || pl.t >= 1) { pulses.splice(p, 1); continue; }
        var ddx = B.x - A.x, ddy = B.y - A.y;
        if (ddx * ddx + ddy * ddy > LINK_DIST * LINK_DIST * 2.6) { pulses.splice(p, 1); continue; }
        var x = A.x + ddx * pl.t, y = A.y + ddy * pl.t;
        var tb = pl.t - 0.18 > 0 ? pl.t - 0.18 : 0;
        var al = (A.a < B.a ? A.a : B.a) * Math.sin(pl.t * Math.PI);
        ctx.beginPath();
        ctx.moveTo(A.x + ddx * tb, A.y + ddy * tb);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(165, 243, 252, ' + (0.55 * al).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, ' + (0.22 * al).toFixed(3) + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(224, 247, 255, ' + (0.95 * al).toFixed(3) + ')';
        ctx.fill();
      }
    }

    function start() { if (running) return; running = true; rafId = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(rafId); }

    resize();
    window.addEventListener('resize', debounce(resize, 200), { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    /* The canvas is fixed and full-viewport now, so it is always on screen
       and an IntersectionObserver would only ever report "visible". A hidden
       tab is the only case worth stopping for, and visibilitychange covers
       it. Below the hero the field is dimmed by CSS rather than halted, so it
       keeps drifting behind the page. */
    start();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ----------------------------------------------------------------------
     Boot
     -------------------------------------------------------------------- */

  /* ----------------------------------------------------------------------
     Zyrn credit

     The design credit in the footer of every page. Injected rather than
     authored, for the same reason as everything else in this file: there
     are 181 hand-maintained HTML pages and four different footer shapes,
     and a component that has to be pasted into all of them drifts.

     Two jobs, and nothing else:
       1. latch the shear open shortly after load
       2. fire the glitch at irregular intervals

     WHY THE SCHEDULE IS RANDOM. A fixed setInterval reads as a metronome,
     which is the opposite of a glitch. Real signal artefacts cluster: long
     quiet stretches, then two or three in quick succession.

     WHY THE CLONES ARE BUILT AT FIRE TIME. They snapshot the mark's CURRENT
     shear state. Built once at init they would snapshot an un-sheared
     wordmark, and every burst after the latch would throw a straight ghost
     across a sheared original.

     It is off screen for almost the whole visit — it is in the footer — and
     `zcVisible` is what stops it composing anything while it is.
     -------------------------------------------------------------------- */

  var ZC_GHOSTS = 2;

  function buildZyrnCredit() {
    if (document.querySelector('.fx-zc')) return;

    /* One selector covers all four footer shapes in the corpus: the bare
       <footer> on 176 pages, .footer-quiet on the home page, .footer on two
       pillars, and 404.html's. */
    var foot = document.querySelector('footer');
    if (!foot) return;

    var wrap = document.createElement('div');
    wrap.className = 'fx-zc';

    var lead = document.createElement('span');
    lead.className = 'fx-zc-lead';
    lead.textContent = 'Designed by';

    var link = document.createElement('a');
    link.className = 'fx-zc-link';
    link.href = 'https://zyrn.org/';
    link.target = '_blank';
    /* nofollow is deliberate and is not timidity: this is a sitewide footer
       link on 181 pages of a site that lives on search traffic and ad
       revenue, which is the exact shape Google's link-scheme guidance names.
       The referrer is deliberately NOT suppressed — Zyrn should be able to
       see that the traffic came from here. */
    link.rel = 'noopener nofollow';
    link.setAttribute('aria-label', 'Zyrn (opens in a new tab)');

    var glitch = document.createElement('span');
    glitch.className = 'fx-zc-glitch';

    var shear = document.createElement('span');
    shear.className = 'fx-zc-shear';

    /* Both halves must carry identical text — the clip-and-offset is what
       draws the mark, and a mismatch breaks it rather than degrading it. */
    ['top', 'bot'].forEach(function (side) {
      var half = document.createElement('span');
      half.className = 'fx-zc-half fx-zc-half--' + side;
      half.setAttribute('aria-hidden', 'true');
      half.textContent = 'ZYRN';
      shear.appendChild(half);
    });

    var seam = document.createElement('span');
    seam.className = 'fx-zc-seam';
    seam.setAttribute('aria-hidden', 'true');
    shear.appendChild(seam);

    glitch.appendChild(shear);
    link.appendChild(glitch);
    wrap.appendChild(lead);
    wrap.appendChild(link);
    foot.appendChild(wrap);

    /* The latch. Under reduced motion it is applied with no travel: the
       sheared state is the mark's resting state, not an animation.

       A forced reflow rather than a rAF pair, for the reason recorded at the
       top of this file — rAF is throttled to a standstill in a background
       tab, and a latch that waits on one would leave the mark unsheared for
       the whole visit. The reflow gives the transition a start state to
       move from, synchronously. */
    if (reduced) {
      shear.classList.add('is-sheared');
      return;
    }
    void shear.offsetHeight;
    window.setTimeout(function () { shear.classList.add('is-sheared'); }, 300);

    scheduleZcGlitch(glitch, shear);
  }

  function zcGhosts(host, shear) {
    var out = [];
    for (var i = 0; i < ZC_GHOSTS; i++) {
      var g = document.createElement('span');
      g.className = 'fx-zc-ghost fx-zc-ghost--' + (i === 0 ? 'a' : 'b');
      g.setAttribute('aria-hidden', 'true');
      /* An absolutely-positioned clone does not land where an inline-block
         original sits on the baseline. Measure rather than assume, or every
         slice arrives with a vertical offset the keyframes never asked for. */
      g.style.left = shear.offsetLeft + 'px';
      g.style.top = shear.offsetTop + 'px';
      g.appendChild(shear.cloneNode(true));
      host.appendChild(g);
      out.push(g);
    }
    return out;
  }

  function zcVisible(el) {
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return r.bottom > 0 && r.top < (window.innerHeight || 0);
  }

  function scheduleZcGlitch(host, shear) {
    var burstLeft = 0;

    function fire() {
      /* Never glitch a mark nobody can see — an effect with no audience that
         still costs a composite. This is a footer, so it is off for most of
         the visit. */
      if (!document.hidden && zcVisible(host)) {
        var micro = Math.random() < 0.42;
        var cls = micro ? 'is-micro' : 'is-glitching';
        var ghosts = micro ? [] : zcGhosts(host, shear);
        host.classList.add(cls);
        window.setTimeout(function () {
          host.classList.remove(cls);
          for (var i = 0; i < ghosts.length; i++) {
            if (ghosts[i].parentNode) ghosts[i].parentNode.removeChild(ghosts[i]);
          }
        }, micro ? 150 : 320);
      }
      next();
    }

    function next() {
      var delay;
      if (burstLeft > 0) {
        burstLeft--;
        delay = 110 + Math.random() * 240;        /* stutter inside a burst */
      } else {
        delay = 1800 + Math.random() * 3400;      /* the quiet stretch */
        var r = Math.random();
        if (r < 0.22) burstLeft = 2;              /* occasional triple */
        else if (r < 0.62) burstLeft = 1;         /* frequent double */
      }
      window.setTimeout(fire, delay);
    }

    next();
  }

  /* ----------------------------------------------------------------------
     Home stage

     The landing page's own instruments, layered onto the machinery above:
     an orbit drawn behind the headline, mono labels that decode into place,
     a command line that suggests real entries from the index, and share
     bars under the pillar counts. Home only — keyed on the hero track and
     the tool grid existing together, which no other page has.
     -------------------------------------------------------------------- */

  var ORBIT_SVG =
    '<svg class="fx-orbit-stage" viewBox="0 0 400 400" aria-hidden="true" focusable="false">' +
      '<circle class="fx-os-ring fx-os-ring-1" cx="200" cy="200" r="196" fill="none"' +
      ' stroke="currentColor" stroke-width="1" stroke-dasharray="180 40 12 40 60 40"/>' +
      '<circle class="fx-os-ring fx-os-ring-2" cx="200" cy="200" r="168" fill="none"' +
      ' stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 12" stroke-linecap="round"/>' +
      '<circle class="fx-os-ring fx-os-ring-3" cx="200" cy="200" r="182" fill="none"' +
      ' stroke="currentColor" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.5"/>' +
      '<g class="fx-os-sat fx-os-sat-1"><circle cx="396" cy="200" r="3"/></g>' +
      '<g class="fx-os-sat fx-os-sat-2"><circle cx="32" cy="200" r="2.2"/></g>' +
    '</svg>';

  /* The stage runs on every page: the orbit behind whichever hero the page
     has, and the decode on its mono labels. On the homepage the orbit lives
     inside the HUD bezel — already aria-hidden, already behind the content,
     already faded in by the landing sequence. Elsewhere it is prepended to
     `section.hero`, which clips it to an arc behind the title. */
  function enhanceStage() {
    var hud = document.querySelector('.hero-scroll-track .hero-hud');
    var hero = hud || document.querySelector('section.hero');
    var hasCore = !!document.querySelector('.hero-core');
    if (hero && !hasCore && !hero.querySelector('.fx-orbit-stage')) {
      hero.insertAdjacentHTML(hud ? 'beforeend' : 'afterbegin', ORBIT_SVG);
    }
    armDecodes();
  }

  function enhanceHome() {
    var track = document.querySelector('.hero-scroll-track');
    var grid = document.getElementById('tools-grid');
    if (!track || !grid) return;

    root.classList.add('fx-home');
    drawDividers();
    buildStatBars();
    armCommandHints();
  }

  /* --- share bars ---------------------------------------------------------
     A hairline under each count, filled to that count's share of the largest
     figure on the strip. Derived from the numbers already on the page, never
     from anything else. The slot is reserved by CSS padding keyed on html.js,
     so injecting the bar cannot shift the hero. */
  function buildStatBars() {
    var items = document.querySelectorAll('.hero-stats-strip .stat-item');
    if (!items.length) return;
    var vals = [], max = 0;
    for (var i = 0; i < items.length; i++) {
      var v = items[i].querySelector('[data-count]');
      var n = v ? parseFloat(v.getAttribute('data-count')) || 0 : 0;
      vals.push(n);
      if (n > max) max = n;
    }
    if (!max) return;
    for (var j = 0; j < items.length; j++) {
      if (items[j].querySelector('.fx-stat-bar')) continue;
      var bar = document.createElement('i');
      bar.className = 'fx-stat-bar';
      bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('b');
      fill.style.setProperty('--share', (vals[j] / max).toFixed(3));
      bar.appendChild(fill);
      items[j].appendChild(bar);
    }
  }

  /* --- decode ---------------------------------------------------------------
     A mono label resolves out of noise, left to right. The real text never
     leaves the DOM: it is wrapped, its colour dropped for the duration, and an
     aria-hidden ghost draws the scramble over it. Both are monospace, so they
     share every column. */
  var DECODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/[]{}|=+*#';
  var DECODE_KEEP = /[\s•·\/\-—|]/;

  function decode(el, dur) {
    if (reduced || !el) return;
    var text = el.textContent.trim();
    if (!text || text.length > 90) return;

    var gen = el._fxGen = (el._fxGen || 0) + 1;
    if (el._fxRaf) cancelAnimationFrame(el._fxRaf);
    el._fxDecoded = text;

    var real = document.createElement('span');
    real.className = 'fx-dec-real';
    real.textContent = text;
    var ghost = document.createElement('span');
    ghost.className = 'fx-dec-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    var done = document.createElement('span');
    done.className = 'fx-dec-done';
    var noise = document.createElement('span');
    noise.className = 'fx-dec-noise';
    ghost.appendChild(done);
    ghost.appendChild(noise);

    el.textContent = '';
    el.appendChild(real);
    el.appendChild(ghost);
    el.classList.add('fx-dec', 'is-decoding');

    dur = dur || 720;
    var t0 = now();
    var lastShuffle = 0;
    var out = text.split('');

    function frame(ts) {
      if (el._fxGen !== gen) return;
      var p = Math.min(1, (ts - t0) / dur);
      var head = Math.floor(p * text.length);
      var shuffle = ts - lastShuffle > 38;
      for (var i = head; i < text.length; i++) {
        var c = text.charAt(i);
        if (DECODE_KEEP.test(c)) out[i] = c;
        else if (shuffle) out[i] = DECODE_CHARS.charAt(Math.floor(Math.random() * DECODE_CHARS.length));
      }
      if (shuffle) lastShuffle = ts;
      done.textContent = text.slice(0, head);
      noise.textContent = out.slice(head).join('');
      if (p < 1) { el._fxRaf = requestAnimationFrame(frame); return; }
      finish();
    }
    function finish() {
      if (el._fxGen !== gen) return;
      el._fxRaf = 0;
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      el.classList.remove('is-decoding');
    }
    el._fxRaf = requestAnimationFrame(frame);
    /* rAF can be starved; a label must never stay scrambled. */
    setTimeout(finish, dur + 400);
  }

  function armDecodes() {
    if (reduced) return;

    /* The status line decodes as the landing sequence brings it up. */
    var status = document.querySelector('.hero-status > span:not(.fx-pulse-dot)');
    if (status) setTimeout(function () { decode(status, 900); }, introActive ? 1550 : 200);

    /* Section tags and eyebrows decode as they scroll in; the ones above
       the fold resolve on load. */
    if (supportsIO) {
      var tags = document.querySelectorAll('.section-tag, .hero-eyebrow, .eyebrow, .pair-kicker, .tool-eyebrow');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          decode(entry.target, 640);
          io.unobserve(entry.target);
        });
      }, { threshold: 0.6 });
      for (var i = 0; i < tags.length; i++) io.observe(tags[i]);
    }

    /* The filter readout re-decodes whenever the page's own script rewrites
       it. Our own DOM work also mutates it; the guard is that the trimmed
       text still equals the last string we decoded. */
    var readout = document.getElementById('filter-readout');
    if (readout && 'MutationObserver' in window) {
      new MutationObserver(function () {
        var t = readout.textContent.trim();
        var real = readout.querySelector('.fx-dec-real');
        if (real) t = real.textContent.trim();
        if (t === readout._fxDecoded) return;
        decode(readout, 520);
      }).observe(readout, { childList: true, characterData: true, subtree: true });
    }
  }

  /* --- command line hints ---------------------------------------------------
     The prompt types names of tools that really are in the index — read from
     the ticker on the same page — then returns to its resting label. The
     button's accessible name is its aria-label, so none of this reaches a
     screen reader. Runs only while the prompt is on screen and untouched. */
  function armCommandHints() {
    var cmd = document.querySelector('.hero-command');
    var textEl = cmd && cmd.querySelector('.hero-command-text');
    if (!textEl || reduced || !supportsIO) return;
    var node = textEl.firstChild;
    if (!node || node.nodeType !== 3) return;
    var base = node.nodeValue;

    var seen = {}, names = [];
    var bs = document.querySelectorAll('.fx-ticker-item b');
    for (var i = 0; i < bs.length; i++) {
      var n = bs[i].textContent.trim();
      if (n && !seen[n] && n.length <= 18) { seen[n] = 1; names.push(n); }
    }
    if (names.length < 3) return;
    for (var j = names.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = names[j]; names[j] = names[k]; names[k] = tmp;
    }

    var visible = false, timer = 0, idx = 0;

    function halt() {
      clearTimeout(timer); timer = 0;
      node.nodeValue = base;
      cmd.classList.remove('is-typing');
    }
    function wait(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, ms); }

    function erase(done) {
      cmd.classList.add('is-typing');
      (function step() {
        if (!visible) return;
        var v = node.nodeValue;
        if (!v.length) { done(); return; }
        node.nodeValue = v.slice(0, -1);
        timer = setTimeout(step, 22);
      })();
    }
    function type(str, done) {
      var i = 0;
      (function step() {
        if (!visible) return;
        if (i >= str.length) { cmd.classList.remove('is-typing'); done(); return; }
        node.nodeValue += str.charAt(i++);
        timer = setTimeout(step, 46 + Math.random() * 44);
      })();
    }
    function next() {
      if (!visible) return;
      if (document.hidden || cmd.matches(':hover, :focus-visible')) { wait(1500, next); return; }
      var name = names[idx++ % names.length];
      erase(function () {
        type(name, function () {
          wait(2400, function () {
            erase(function () {
              type(base, function () { wait(3600, next); });
            });
          });
        });
      });
    }

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) wait(introActive ? 3800 : 2600, next); else halt();
    }, { threshold: 0.2 }).observe(cmd);
  }

  /* ----------------------------------------------------------------------
     Hub core

     The hero's hub core is drawn live by /js/hub-core.js. This file only
     relocates it into the ambient field and keeps it over its placeholder.
     -------------------------------------------------------------------- */

  var coreHost = null, corePh = null, coreW = -1;

  /* The core is screen-blended, and a blend mode only sees backdrop inside
     its own stacking context. The hero is position:sticky, which always
     creates one, and the field it should blend against is a fixed layer
     outside it — so blended in place, the render's black stays solid. The
     core is therefore moved INTO the field, above the grid, aurora and
     constellation, and follows the empty placeholder the hero grid still
     lays out. One rect read per frame, written as a transform. */
  function placeCore() {
    var r = corePh.getBoundingClientRect();
    if (r.width !== coreW) {
      coreW = r.width;
      coreHost.style.width = r.width + 'px';
      coreHost.style.height = r.height + 'px';
    }
    coreHost.style.transform = 'translate3d(' + r.left.toFixed(1) + 'px,' + r.top.toFixed(1) + 'px,0)';
  }

  function armCore() {
    var wrap = document.querySelector('.hero-core');
    var inner = wrap && wrap.querySelector('.hero-core-inner');
    if (!inner || !field) return;
    coreHost = document.createElement('div');
    coreHost.className = 'fx-core-host';
    coreHost.appendChild(inner);
    var vg = field.querySelector('.fx-vignette');
    if (vg) field.insertBefore(coreHost, vg); else field.appendChild(coreHost);
    corePh = wrap;
    placeCore();
    /* The object itself is drawn by /js/hub-core.js, which loads after this
       file and finds the inner element already in the field. */
  }

  function init() {
    /* Set synchronously, not from the rAF loop: .fx-bleed reads --vw, and a
       throttled or starved rAF would leave it on the 100vw fallback that
       includes the scrollbar. */
    root.style.setProperty('--vw', document.documentElement.clientWidth + 'px');
    lastClientWidth = document.documentElement.clientWidth;

    armIntro();
    buildField();
    enhanceBrand();
    buildZyrnCredit();
    wrapTables();
    /* Runs before splitKinetic / enhanceCards / armReveals so the attributes it
       stamps on the review body are picked up by their existing machinery. */
    enhanceReview();
    enhancePillar();
    enhanceStage();
    enhanceHome();
    armFaq();
    buildSeededBackdrop();
    armHeroScroll();
    splitKinetic();
    enhanceCards();
    enhanceMagnets();
    armReveals();
    armCounters();
    armTickers();
    armTickerRipple();
    armCanvas();
    armCore();

    if (fine && !reduced) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }
    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('resize', requestFrame, { passive: true });
    requestFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
