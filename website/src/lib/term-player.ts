// Recorded terminal player, ported from the approved mock's term.js. Scenes are captured output from the
// published build (src/lib/term-portkey.json). Autoplays once when scrolled into view, a scene button
// replays one scene, and reduced motion renders the final state with no typing.
export type TermEvent = { k: "cmd" | "out" | "note"; s: string; p?: string; f?: number };
export type TermScene = { id: string; title: string; events: TermEvent[] };
export type TermData = { product: string; version: string; scenes: TermScene[] };

const ART = /[▀-▟]/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hl(s: string) {
  let h = esc(s);
  h = h.replace(/&lt;redacted[^&]*&gt;|&lt;hostname&gt;/g, (m) => `<span class="redact">${m}</span>`);
  if (/^\s*\{/.test(s)) {
    h = h.replace(/"([A-Za-z_][\w-]*)":/g, '<span class="jk">"$1"</span>:');
    h = h.replace(/"(Missing required field[^"]*)"/, '<span class="bad">"$1"</span>');
    h = h.replace(/"(Missing recommended field[^"]*)"/, '<span class="warn">"$1"</span>');
    h = h.replace(/(<span class="jk">"valid"<\/span>:)(false)/, '$1<span class="bad">$2</span>');
    h = h.replace(/(<span class="jk">"(?:valid|ok)"<\/span>:)(true)/g, '$1<span class="ok">$2</span>');
  }
  return h;
}

function lineEl(ev: TermEvent) {
  const d = document.createElement("div");
  if (ev.k === "cmd") {
    d.className = `tl cmd${ev.p === "client" ? " client" : ""}`;
    d.innerHTML = `<span class="ps" aria-hidden="true">${ev.p === "client" ? "›" : "$"}</span><span class="cx"></span>`;
    return d;
  }
  d.className = `tl ${ev.k === "note" ? "note" : ART.test(ev.s) ? "art" : "out"}`;
  d.innerHTML = ev.k === "note" ? esc(ev.s) : hl(ev.s) || "&nbsp;";
  return d;
}

export function startTerm(root: HTMLElement, T: TermData): () => void {
  const q = <E extends HTMLElement>(sel: string) => root.querySelector<E>(sel);
  const body = q("#term-body")!;
  const skipBtn = q<HTMLButtonElement>("#term-skip");
  const clearBtn = q<HTMLButtonElement>("#term-clear");
  const titleEl = q("#term-title");
  const live = q("#term-live");
  const btns = [...root.querySelectorAll<HTMLButtonElement>(".tcmd")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let token = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cur: TermScene[] = [];
  const sceneById = (id: string) => T.scenes.find((s) => s.id === id)!;
  const mark = (id: string) => btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === id)));
  const bottom = () => { body.scrollTop = body.scrollHeight; };
  const finish = () => {
    root.dataset.state = "done";
    body.querySelector(".caret")?.remove();
    if (skipBtn) skipBtn.hidden = true;
  };
  function renderInstant(scenes: TermScene[], clear: boolean) {
    token++;
    clearTimeout(timer);
    if (clear) body.textContent = "";
    for (const sc of scenes)
      for (const ev of sc.events) {
        const d = lineEl(ev);
        if (ev.k === "cmd") d.querySelector(".cx")!.textContent = ev.s;
        body.appendChild(d);
      }
    bottom();
    finish();
  }
  function play(scenes: TermScene[], clear: boolean) {
    if (reduce) return renderInstant(scenes, clear);
    const my = ++token;
    clearTimeout(timer);
    if (clear) body.textContent = "";
    root.dataset.state = "playing";
    if (skipBtn) skipBtn.hidden = false;
    const queue = scenes.flatMap((sc) => sc.events);
    let i = 0;
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.setAttribute("aria-hidden", "true");
    (function step() {
      if (my !== token) return;
      if (i >= queue.length) return finish();
      const ev = queue[i++];
      const d = lineEl(ev);
      body.appendChild(d);
      if (ev.k === "cmd") {
        const ct = d.querySelector<HTMLElement>(".cx")!;
        const speed = ev.p === "client" ? 7 : 22;
        let n = 0;
        const tn = document.createTextNode("");
        ct.appendChild(tn);
        ct.appendChild(caret);
        (function typeNext() {
          if (my !== token) return;
          if (n >= ev.s.length) { timer = setTimeout(step, 220); return; }
          n = Math.min(ev.s.length, n + 1 + (Math.random() < 0.25 ? 1 : 0));
          tn.nodeValue = ev.s.slice(0, n);
          bottom();
          timer = setTimeout(typeNext, speed + Math.random() * speed);
        })();
      } else {
        bottom();
        timer = setTimeout(step, ev.f ? 4 : ART.test(ev.s) ? 22 : ev.s.startsWith("{") ? 70 : 34);
      }
    })();
  }
  const handlers = btns.map((b) => {
    const onClick = () => {
      const sc = sceneById(b.dataset.scene!);
      cur = [sc];
      mark(sc.id);
      if (titleEl) titleEl.textContent = `${T.product} ${T.version} · stdio / ${sc.title}`;
      if (live) live.textContent = `Playing ${sc.title}`;
      play([sc], true);
    };
    b.addEventListener("click", onClick);
    return [b, onClick] as const;
  });
  const onSkip = () => renderInstant(cur, true);
  const onClear = () => { token++; clearTimeout(timer); body.textContent = ""; mark(""); finish(); };
  skipBtn?.addEventListener("click", onSkip);
  clearBtn?.addEventListener("click", onClear);
  const first = [T.scenes[0]];
  cur = first;
  mark(first[0].id);
  let observer: IntersectionObserver | undefined;
  let started = false;
  const start = () => { if (!started) { started = true; play(first, true); } };
  if (reduce) renderInstant(first, true);
  else if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); start(); } }, { threshold: 0.2 });
    observer.observe(root);
  } else start();
  return () => {
    token++;
    clearTimeout(timer);
    observer?.disconnect();
    for (const [b, fn] of handlers) b.removeEventListener("click", fn);
    skipBtn?.removeEventListener("click", onSkip);
    clearBtn?.removeEventListener("click", onClear);
  };
}
