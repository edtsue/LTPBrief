/* A sliding strip of chrome, and the fold that puts it away.
   Shared across the planning modules — this file is copied between them the
   way `_gate.js` is, so it knows nothing about what is inside the strip. It is
   handed a box, a button and a key prefix, and it owns the fold: the measured
   width, `inert` when shut, the remembered state, and the demonstration that
   is the only thing telling anybody the fold exists.

   What travels in the strip is each module's business. What the strip DOES is
   the same everywhere, and this is the part that has been wrong twice.

   OPEN UNTIL SOMEBODY SHUTS IT. Hiding the contents by default was tried and
   taken back: the reason they are in the chrome rather than a menu is that
   they can be seen, and a strip that starts closed gives that away to save a
   few pixels nobody asked for.

   A working preference, not content. It belongs to this browser and stays out
   of anything that syncs, so a plan opened on somebody else's machine does not
   arrive with their strip shut. */

const Strip = (() => {
  /* How long the demonstration stands open before it folds. Long enough to be
     looked at, short enough not to read as the page still loading. */
  const TEACH_AFTER = 2000;
  /* Visits between reminders, once it has been shown and folded. */
  const REMIND_EVERY = 5;
  /* Waiting on whatever `hold` is guarding.

     ⚠️ BOUNDED, AND IT HAS TO BE. This retried forever, which is a timer
     running every 1.4 seconds for the life of the page whenever the thing
     being waited on does not clear — a tour left open in a background tab, a
     dialog nobody came back to. It showed up as a test process that booted the
     app and then never exited, which is the same fault with the volume turned
     up.

     Giving up does NOT mark it taught. The demonstration is spent once, and
     spending it on a moment when something was covering the screen is exactly
     what the waiting exists to prevent — so it comes back on the next visit
     instead. */
  const HOLD_RETRY = 1400;
  const HOLD_TRIES = 10;

  let box = null;
  let tog = null;
  let labels = { hide: 'Hide these controls', show: 'Show these controls' };
  let hold = null;
  /* Three keys, namespaced per module. The fold and the demonstration are
     genuinely different facts and each needs its own. */
  let KEY = '', SEEN_KEY = '', SEEN_N = '';

  function read(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { void e; return ''; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { void e; }
  }

  /* WIDTH IS MEASURED, NOT GUESSED, AND THAT IS THE WHOLE OF THE SMOOTHNESS.
   *
   * This animated `max-width` from a fixed ceiling — a number chosen to be
   * comfortably larger than the strip ever gets. The strip is nearer 200px, so
   * the first stretch of every collapse clipped nothing at all and the whole
   * thing then happened in what was left. It dropped no frames; the motion was
   * simply not linear in the property being watched, which is what "not
   * smooth" actually looks like.
   *
   * So the real width is read off the element and the animation runs between
   * that and zero. Driven inline rather than from the stylesheet, because only
   * script knows how wide the strip is on this screen at this moment.
   *
   * `quiet` restores a remembered fold without performing it. Somebody who
   * folded this yesterday should find it folded, not watch it fold again on
   * every load.
   */
  let full = 0;

  function fold(shut, keep, quiet) {
    if (!box) return;

    /* Measured while it is open, which is the only time the answer is true. */
    if (!box.classList.contains('shut')) {
      const seen = box.scrollWidth;
      if (seen) full = seen;
    }

    if (quiet) {
      box.classList.add('nofx');
      box.style.maxWidth = shut ? '0px' : '';
      /* Two frames, because one is not enough to guarantee the class landed
         before the transition is allowed back. */
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('nofx')));
    } else if (shut) {
      /* Start from the true width, commit it, then run to nothing. Without the
         forced reflow the browser coalesces both writes and there is no
         animation at all — just a disappearance. */
      box.style.maxWidth = (full || box.scrollWidth) + 'px';
      void box.offsetWidth;
      box.style.maxWidth = '0px';
    } else {
      box.style.maxWidth = (full || box.scrollWidth) + 'px';
      /* Released afterwards so the strip can size itself again — a pinned
         width would clip anything added to it later. */
      const done = e => {
        if (e.propertyName !== 'max-width') return;
        box.style.maxWidth = '';
        box.removeEventListener('transitionend', done);
      };
      box.addEventListener('transitionend', done);
    }

    box.classList.toggle('shut', shut);
    if (tog) {
      tog.setAttribute('aria-expanded', shut ? 'false' : 'true');
      tog.textContent = shut ? '‹' : '›';
      tog.title = shut ? labels.show : labels.hide;
    }
    /* `inert` rather than only width, because a strip folded to nothing is
       still in the tab order otherwise — and tabbing into a control you cannot
       see is worse than the crowding this removes. */
    box.inert = shut;
    if (keep) write(KEY, shut ? 'shut' : 'open');
  }

  /* ---- and it shows itself, once ------------------------------------------
   *
   * A control that starts folded is a control nobody finds: there is nothing
   * on screen to say the icons exist or that the arrow brings them back.
   * A control that starts open forever is the crowding it was there to fix.
   *
   * So on the first visit it opens, waits long enough to be looked at, and
   * closes itself. The movement is the only thing that teaches it, and it is
   * spent once — the fold is recorded on the way out, so every visit after
   * this one simply starts folded.
   *
   * ⚠️ KEYED ON HAVING NO ANSWER, NOT ON THE ANSWER BEING OPEN. Somebody who
   * has folded it has been taught, and re-teaching them would be the tool
   * re-opening a thing they deliberately shut.
   */

  /* ⚠️ WHEN THE STRIP SHOWS ITSELF. Pure, and separated from everything that
     touches the DOM, because this is the part that has been wrong twice.

     Three cases and they are genuinely different:

       never shown — show it. This is the only thing that says the icons exist
         and that the arrow brings them back.

       shown, and open — show nothing. The reminder exists for a control that
         cannot be seen; folding an open strip every fifth visit would be the
         tool overriding a preference in order to advertise itself.

       shown, and folded — remind, every fifth visit. Folded is the steady
         state, and a folded control is one people forget. `>=` rather than a
         modulo, so a count that overshot — a tab restored, a reload storm —
         still comes due rather than waiting for the number to line up again. */
  function due(seen, kept, n) {
    if (!seen) return true;
    if (kept !== 'shut') return false;
    const visits = Number(n);
    if (!isFinite(visits)) return false;
    return visits >= REMIND_EVERY;
  }

  /* Shown, and the count starts again from here. */
  function markTaught() {
    write(SEEN_KEY, '1');
    write(SEEN_N, '0');
  }

  function teach(kept) {
    if (!box) return;

    /* ⚠️ TWO FACTS, NOT ONE. This used to bail on `kept` — on this browser
       having any opinion about the fold at all. But the fold key is written
       the instant somebody presses the toggle, so anybody who had ever touched
       the strip was permanently excluded from the one thing that teaches it
       exists. Which is everybody already using the tool.

       Folded-or-open is a preference. Shown-or-not is a fact about this
       browser's history, and it needs a key of its own. */
    const seen = read(SEEN_KEY);
    /* Counted on the way in, whether or not it is due — otherwise a visit
       that was not due would not count towards the next one. */
    const n = Number(read(SEEN_N) || 0) + 1;
    write(SEEN_N, String(n));

    if (!due(seen, kept, n)) return;

    /* A REMINDER OPENS BEFORE IT CLOSES. On the first visit it is already
       open; on a fifth it is folded, and there is nothing to watch collapse
       unless it comes back first. Unfolded quietly so the reminder reads as
       one movement — out, pause, away — rather than two. */
    if (kept === 'shut') fold(false, false, true);

    /* THE DEMONSTRATION IS THE MOVEMENT. Without motion it is a snap that
       reads as a glitch and teaches nothing, so that browser is given the
       folded state it would have ended at and nothing is performed at it. */
    let still = false;
    try {
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { void e; }
    if (still) { fold(true, true, true); markTaught(); return; }

    let waited = 0;
    const shut = () => {
      /* Something else may be measuring this chrome — a tour that has drawn a
         ring against a rect it already took. Chrome that reflows underneath
         leaves the ring around nothing, so this waits rather than competing
         with it. */
      if (hold && hold()) {
        if (waited++ < HOLD_TRIES) setTimeout(shut, HOLD_RETRY);
        return;
      }
      /* And if they folded it themselves while this was waiting, there is
         nothing left to demonstrate. */
      fold(true, true);
      markTaught();
    };
    setTimeout(shut, TEACH_AFTER);
  }

  /* Wired, and the remembered fold restored without performing it. Returns
     what this browser already knew, because the demonstration is deliberately
     NOT run from here: a first visit may meet a start screen or an overlay
     first, and a demonstration performed behind one is a demonstration nobody
     sees — which is the entire point of it. The module calls `teach` when
     there is something to see it happen on. */
  function init(o) {
    box = o.box || null;
    tog = o.tog || null;
    hold = o.hold || null;
    if (o.labels) labels = o.labels;
    const p = o.prefix || 'ltp';
    KEY = p + '.strip';
    SEEN_KEY = p + '.strip.seen';
    SEEN_N = p + '.strip.n';
    if (!box || !tog) return '';

    tog.addEventListener('click', () => fold(!box.classList.contains('shut'), true));
    const kept = read(KEY);
    fold(kept === 'shut', false, true);
    return kept;
  }

  return { init, fold, teach, due };
})();

/* Copied between modules, so it has to survive being read by a test runner
   that has no DOM. */
if (typeof module !== 'undefined' && module.exports) module.exports = Strip;
