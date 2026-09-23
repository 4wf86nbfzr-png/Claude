(function () {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function () {
    const e = document.getElementById("preloader");
    if (!e) return;
    let t = !1;
    try {
      t = sessionStorage.getItem("hst-intro") === "1";
    } catch {}
    if (t || q) {
      e.classList.add("instant", "done");
      return;
    }
    try {
      sessionStorage.setItem("hst-intro", "1");
    } catch {}
    const a = () => {
      e.classList.contains("done") || e.classList.add("done");
    };
    (setTimeout(a, 2750), setTimeout(a, 4400));
  })();
  const ge = document.getElementById("year");
  ge && (ge.textContent = new Date().getFullYear());
  const K = document.getElementById("nav"),
    Pe = document.getElementById("scrollbar"),
    be = document.getElementById("toTop");
  function oe() {
    const e = window.scrollY,
      t = K.classList.contains("scrolled");
    K.classList.toggle("scrolled", e > 40);
    const a = document.documentElement.scrollHeight - window.innerHeight;
    ((Pe.style.width = (a > 0 ? (e / a) * 100 : 0) + "%"),
      be.classList.toggle("show", e > window.innerHeight * 0.9),
      K.classList.contains("scrolled") !== t && requestAnimationFrame(se));
  }
  (be.addEventListener("click", () => {
    const e = document.documentElement,
      t = e.style.scrollBehavior;
    ((e.style.scrollBehavior = "auto"),
      window.scrollTo(0, 0),
      requestAnimationFrame(() => {
        e.style.scrollBehavior = t;
      }));
  }),
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest && e.target.closest('a[href^="#"]');
        if (!t) return;
        const a = t.getAttribute("href");
        if (a.length < 2) return;
        let c = null;
        try {
          c = document.querySelector(a);
        } catch {
          return;
        }
        if (!c || Math.abs(c.getBoundingClientRect().top) < window.innerHeight * 4) return;
        const u = document.documentElement,
          m = u.style.scrollBehavior;
        ((u.style.scrollBehavior = "auto"),
          requestAnimationFrame(() => {
            u.style.scrollBehavior = m;
          }));
      },
      !0,
    ));
  const X = document.getElementById("burger"),
    Q = document.getElementById("mobileMenu"),
    ye = ["main", "footer", "#toTop"].map((e) => document.querySelector(e));
  function ve(e) {
    if (
      (document.body.classList.toggle("menu-open", e),
      document.body.classList.toggle("locked", e),
      X.setAttribute("aria-expanded", e),
      ye.forEach((t) => {
        t && t.toggleAttribute("inert", e);
      }),
      e)
    ) {
      const t = Q && Q.querySelector("a, button");
      t && t.focus();
    } else X.focus();
  }
  (X.addEventListener("click", () => ve(!document.body.classList.contains("menu-open"))),
    Q.addEventListener("click", (e) => {
      const t = e.target.closest("a");
      !t ||
        !Q.contains(t) ||
        t.hasAttribute("aria-controls") ||
        (document.body.classList.remove("menu-open", "locked"),
        X.setAttribute("aria-expanded", !1),
        ye.forEach((a) => {
          a && a.removeAttribute("inert");
        }));
    }),
    document.addEventListener("keydown", (e) => {
      e.key === "Escape" && document.body.classList.contains("menu-open") && ve(!1);
    }),
    (function () {
      const e = location.pathname.replace(/\/+$/, "/"),
        t = e.split("/").pop() || "index.html",
        a = /\/dienstleistungen\//.test(e);
      document.querySelectorAll(".nav__links a, #mobileMenu > a").forEach((c) => {
        const u = (c.getAttribute("href") || "").split("/").pop().split("#")[0];
        if (!u) return;
        (u === t || (a && u === "dienstleistungen.html")) && c.setAttribute("aria-current", "page");
      });
    })(),
    document.querySelectorAll("#mobileMenu > a").forEach((e, t) => e.style.setProperty("--i", t)),
    (function () {
      const e = document.querySelector("header.nav"),
        t = document.querySelector('.nav__links a[href$="dienstleistungen.html"]');
      if (!e || !t) return;
      const a = t.getAttribute("href").replace(/dienstleistungen\.html$/, ""),
        c = [
          ["01", "Gastro-Personal", "gastro-personal", "gastro-detail"],
          ["02", "Sicherheit", "sicherheit", "sicherheit"],
          ["03", "Promotion & Hostess", "promotion-hostess", "promotion-messe"],
          ["04", "Logistik", "logistik", "logistik"],
          ["05", "Fahrservice", "fahrservice", "fahrservice-door"],
          ["06", "Reinigung", "reinigung", "reinigung"],
        ],
        u = [
          {
            id: "megabar-dienstleistungen",
            reiter: "dienstleistungen.html",
            name: "Dienstleistungen",
            zeile: "Sechs Bereiche &middot; ein Team",
            eintraege: c.map(([o, f, g, F]) => ({
              nr: o,
              name: f,
              href: a + "dienstleistungen/" + g + ".html",
              bild: a + "assets/img/" + F + "-mini.webp",
            })),
            alle: { text: "Alle Dienstleistungen ansehen", href: a + "dienstleistungen.html" },
          },
          {
            id: "megabar-jobs",
            reiter: "jobs.html",
            name: "Jobs",
            text: !0,
            eintraege: [
              { name: "Direkt bewerben", href: a + "jobs.html#bewerbung" },
              { name: "Freie Stellen", href: a + "jobs.html#stellen" },
              { name: "H&auml;ufige Fragen", href: a + "jobs.html#fragen" },
            ],
          },
        ],
        m =
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      function L(o) {
        const f = document.createElement("div");
        return (
          (f.className = "megabar" + (o.text ? " megabar--text" : "")),
          (f.id = o.id),
          f.setAttribute("role", "group"),
          f.setAttribute("aria-label", o.name),
          (f.innerHTML =
            '<div class="wrap megabar__inner">' +
            (o.zeile ? '<span class="eyebrow megabar__zeile">' + o.zeile + "</span>" : "") +
            '<ul class="megabar__liste">' +
            o.eintraege
              .map(
                (g) =>
                  '<li><a href="' +
                  g.href +
                  '">' +
                  (g.bild ? '<span class="megabar__bild" data-bild="' + g.bild + '"></span>' : "") +
                  (g.nr ? '<span class="megabar__num">' + g.nr + "</span>" : "") +
                  '<span class="megabar__name">' +
                  g.name +
                  "</span></a></li>",
              )
              .join("") +
            "</ul>" +
            (o.alle ? '<a class="btn megabar__alle" href="' + o.alle.href + '">' + o.alle.text + m + "</a>" : "") +
            "</div>"),
          f.querySelectorAll(".megabar__liste a").forEach((g, F) => g.style.setProperty("--n", F)),
          f
        );
      }
      const x = document.createDocumentFragment(),
        b = [];
      if (
        (u.forEach((o) => {
          const f = document.querySelector('.nav__links a[href$="' + o.reiter + '"]');
          if (!f) return;
          const g = L(o);
          (x.appendChild(g),
            f.setAttribute("aria-expanded", "false"),
            f.setAttribute("aria-controls", o.id),
            b.push({ punkt: f, el: g, bilderDa: !1 }));
        }),
        !b.length)
      )
        return;
      e.after(x);
      const E = new Map(b.map((o) => [o.punkt, o]));
      function S(o) {
        o.bilderDa ||
          ((o.bilderDa = !0),
          o.el.querySelectorAll(".megabar__bild[data-bild]").forEach((f) => {
            const g = document.createElement("img");
            ((g.alt = ""),
              (g.decoding = "async"),
              (g.src = f.dataset.bild),
              f.appendChild(g),
              f.removeAttribute("data-bild"));
          }));
      }
      let y = null;
      function D(o, f) {
        y !== o &&
          (y && (y.el.classList.remove("auf"), y.punkt.setAttribute("aria-expanded", "false")),
          (y = o || null),
          document.body.classList.toggle("megabar-auf", !!y),
          y &&
            (S(y),
            y.el.classList.add("auf"),
            y.punkt.setAttribute("aria-expanded", "true"),
            f &&
              requestAnimationFrame(() => {
                const g = y && y.el.querySelector("a");
                g && g.focus();
              })));
      }
      const A = 120,
        k = 180;
      let i = 0,
        p = !1;
      function d(o, f) {
        (clearTimeout(i), o !== y && (i = setTimeout(() => D(o), f)));
      }
      (matchMedia("(hover:hover) and (pointer:fine)").matches &&
        (document.addEventListener("pointerover", (o) => {
          if (o.pointerType && o.pointerType !== "mouse") return;
          const f = o.target;
          if (!f || !f.closest) return;
          const g = f.closest("header.nav, .megabar");
          if (!g) {
            ((p = !1), d(null, k));
            return;
          }
          if (g.classList.contains("megabar")) {
            clearTimeout(i);
            return;
          }
          const F = f.closest(".nav__links a"),
            j = F ? E.get(F) : null;
          j ? p || d(j, y ? 0 : A) : d(null, k);
        }),
        document.documentElement.addEventListener("pointerleave", () => {
          ((p = !1), d(null, k));
        })),
        b.forEach((o) => {
          (o.punkt.addEventListener("keydown", (f) => {
            f.key === "ArrowDown" && (f.preventDefault(), (p = !1), D(o, !0));
          }),
            o.el.addEventListener("focusout", () => {
              setTimeout(() => {
                y === o && !o.el.contains(document.activeElement) && document.activeElement !== o.punkt && D(null);
              }, 0);
            }));
        }),
        document.addEventListener("keydown", (o) => {
          if (o.key !== "Escape" || !y) return;
          const f = y.punkt;
          (D(null), (p = !0), f.focus());
        }),
        document.addEventListener("click", (o) => {
          y && !y.el.contains(o.target) && !y.punkt.contains(o.target) && D(null);
        }),
        addEventListener(
          "scroll",
          () => {
            y && (D(null), (p = !0));
          },
          { passive: !0 },
        ));
      const v = matchMedia("(max-width:980px)"),
        C = () => D(null);
      v.addEventListener ? v.addEventListener("change", C) : v.addListener && v.addListener(C);
      const T = document.querySelector('#mobileMenu > a[href$="dienstleistungen.html"]');
      if (T) {
        const o = document.createElement("div");
        ((o.className = "menu__unter"),
          (o.id = "menu-unter"),
          (o.innerHTML =
            c
              .map(
                ([f, g, F]) =>
                  '<a href="' +
                  a +
                  "dienstleistungen/" +
                  F +
                  '.html"><span class="menu__unternum">' +
                  f +
                  "</span>" +
                  g +
                  "</a>",
              )
              .join("") +
            '<a class="menu__unteralle" href="' +
            a +
            'dienstleistungen.html">Alle ansehen</a>'),
          T.after(o),
          T.setAttribute("aria-expanded", "false"),
          T.setAttribute("aria-controls", "menu-unter"),
          T.addEventListener("click", (f) => {
            if (f.metaKey || f.ctrlKey || f.shiftKey || f.button) return;
            (f.preventDefault(), f.stopPropagation());
            const g = T.getAttribute("aria-expanded") !== "true";
            (T.setAttribute("aria-expanded", String(g)), o.classList.toggle("auf", g));
          }));
      }
    })());
  const Z = document.querySelector(".appleiste");
  Z &&
    Z.addEventListener("click", (e) => {
      const t = e.target.closest("a");
      !t ||
        t.getAttribute("aria-current") !== "page" ||
        (e.preventDefault(), window.scrollTo({ top: 0, behavior: q ? "auto" : "smooth" }));
    });
  let ke,
    le = !1;
  function Fe() {
    Z &&
      (le || ((le = !0), Z.classList.add("faehrt")),
      clearTimeout(ke),
      (ke = setTimeout(() => {
        ((le = !1), Z.classList.remove("faehrt"));
      }, 520)));
  }
  document.querySelectorAll("[data-stagger]").forEach((e) => {
    [...e.children].forEach((t, a) => t.style.setProperty("--i", a));
  });
  const we = new IntersectionObserver(
      (e) => {
        e.forEach((t) => {
          (t.isIntersecting || t.boundingClientRect.bottom < 0) && Ee(t.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    ),
    ee = new Set();
  function Ee(e) {
    (e.classList.add("in"), we.unobserve(e), ee.delete(e));
  }
  document.querySelectorAll(".reveal-up, [data-stagger], .foot__claim").forEach((e) => {
    (ee.add(e), we.observe(e));
  });
  let Se;
  function je() {
    if (ee.size) for (const e of [...ee]) e.getBoundingClientRect().bottom < 0 && Ee(e);
  }
  const He = window.matchMedia("(max-width:980px)").matches,
    te = (e, t, a) => Math.max(t, Math.min(a, e)),
    U = (e, t, a) => {
      const c = te((a - e) / (t - e), 0, 1);
      return c * c * (3 - 2 * c);
    },
    H = [...document.querySelectorAll(".stage")].map((e) => ({
      el: e,
      scene: e.querySelector(".scene"),
      detail: e.querySelector(".detail"),
      panel: e.querySelector(".panel"),
      door: e.querySelector(".door"),
      last: { zoom: null, detail: null, panel: null, door: null, kapitel: null },
      oben: void 0,
      unten: void 0,
      live: null,
    }));
  function G(e, t, a, c) {
    !t || e.last[a] === c || ((e.last[a] = c), t.style.setProperty("--" + a, c));
  }
  function _e() {
    const e = window.innerHeight;
    for (const t of H) {
      const a = t.el.getBoundingClientRect();
      ((t.oben = a.top),
        (t.unten = a.bottom),
        (t.hoehe = t.el.offsetHeight),
        (t.p = te(-a.top / (t.hoehe - e), 0, 1)),
        (t.sichtbar = a.top < e * 1.2 && a.bottom > -e * 0.2));
    }
    for (const t of ne) {
      const a = t.el.getBoundingClientRect(),
        c = Math.max(1, a.height);
      ((t.sichtbar = a.top < e * 1.2 && a.bottom > -e * 0.2),
        (t.p = t.art === "weg" ? te(-a.top / c, 0, 1) : te((e - a.top) / (e + c), 0, 1)));
    }
  }
  function xe() {
    for (const e of H) {
      const t = e.p,
        a = e.live;
      (e.live !== e.sichtbar && ((e.live = e.sichtbar), e.el.classList.toggle("live", e.sichtbar)),
        !(!e.sichtbar && !a) &&
          (He ||
            (G(e, e.scene, "zoom", (1 + t * 0.42).toFixed(3)),
            G(e, e.detail, "detail", U(0.34, 0.62, t).toFixed(3)),
            G(e, e.panel, "panel", U(0.5, 0.82, t).toFixed(3))),
          G(e, e.door, "door", U(0.02, 0.24, t).toFixed(3)),
          G(e, e.el, "kapitel", t.toFixed(3))));
    }
  }
  if (
    (document.querySelectorAll("[data-worte]").forEach((e) => {
      const t = e.textContent.trim().split(/\s+/);
      t.length < 2 ||
        ((e.textContent = ""),
        t.forEach((a, c) => {
          const u = document.createElement("span");
          ((u.className = "wort"), u.style.setProperty("--n", c));
          const m = document.createElement("span");
          ((m.textContent = a),
            u.appendChild(m),
            e.appendChild(u),
            c < t.length - 1 && e.appendChild(document.createTextNode(" ")));
        }),
        e.style.setProperty("--anz", t.length));
    }),
    !q)
  ) {
    const e = ".stage, .hero, .subhero, .schritt, .tcard, .ccard, .trust__item, .feld";
    document.querySelectorAll(".ablauf, .expect, .cta, .testi, .section-soft, .content, body > footer").forEach((t) => {
      if (t.closest(e) || t.hasAttribute("data-lauf")) return;
      const a = getComputedStyle(t);
      parseFloat(a.borderTopWidth) < 0.5 || (t.setAttribute("data-spur", ""), t.setAttribute("data-lauf", ""));
    });
  }
  const ne = [];
  q ||
    (document.querySelectorAll("[data-weg]").forEach((e) => ne.push({ el: e, art: "weg", wert: null, live: null })),
    document.querySelectorAll("[data-lauf]").forEach((e) => ne.push({ el: e, art: "lauf", wert: null, live: null })));
  function Ae() {
    for (const e of ne) {
      const t = e.live;
      if (
        (e.live !== e.sichtbar && ((e.live = e.sichtbar), e.el.classList.toggle("live", e.sichtbar)), !e.sichtbar && !t)
      )
        continue;
      const a = e.p.toFixed(3);
      e.wert !== a && ((e.wert = a), e.el.style.setProperty("--" + e.art, a));
    }
  }
  const ce = document.querySelector(".kino");
  let O = null,
    re = [],
    ae = -1,
    Le = null,
    qe = null;
  function se() {
    K && document.documentElement.style.setProperty("--nav-h", Math.round(K.getBoundingClientRect().height) + "px");
  }
  if (!q && H.length > 1) {
    const e = document.querySelector("body > .kapitel");
    (e && e.remove(),
      (O = document.createElement("nav")),
      (O.className = "kapitel"),
      O.setAttribute("aria-label", "Dienstleistungen auf dieser Seite"),
      H.forEach((t, a) => {
        const c = t.el.querySelector(".stage__index"),
          u = c ? (c.querySelector(".stage__titel") || c).textContent.trim() : t.el.dataset.stage || "",
          m = document.createElement("a");
        ((m.href = "#" + t.el.id),
          (m.innerHTML = "<span></span>" + String(a + 1).padStart(2, "0")),
          (m.querySelector("span").textContent = u),
          O.appendChild(m));
      }),
      document.body.appendChild(O),
      (re = [...O.querySelectorAll("a")]));
  }
  function Ce() {
    if (!H.length || (!ce && !O)) return;
    const e = window.innerHeight,
      t = H[0].oben,
      a = H[H.length - 1].unten;
    if (t === void 0) return;
    const c = Math.min(U(0.18, 0.9, (e - t) / e), U(0.18, 0.9, a / e)),
      u = c.toFixed(3);
    if ((ce && qe !== u && ((qe = u), ce.style.setProperty("--kino", u)), O)) {
      const m = c > 0.5;
      if ((Le !== m && ((Le = m), O.classList.toggle("sichtbar", m)), m)) {
        let L = 0,
          x = 1 / 0;
        (H.forEach((b, E) => {
          const S = Math.abs((b.oben + b.unten) / 2 - e / 2);
          S < x && ((x = S), (L = E));
        }),
          ae !== L && (re[ae] && re[ae].classList.remove("ist"), re[L].classList.add("ist"), (ae = L)));
      }
    }
  }
  const ie = [...document.querySelectorAll(".stagevid")],
    ze = () =>
      q || window.matchMedia("(max-width:980px)").matches || !!(navigator.connection && navigator.connection.saveData);
  if (
    (ie.forEach((e) => {
      if (
        (e.addEventListener("loadeddata", () => {
          (e.classList.add("ready"), Te());
        }),
        e.getAttribute("poster"))
      ) {
        const t = new Image();
        ((t.onload = () => e.classList.add("ready")), (t.src = e.getAttribute("poster")));
      }
    }),
    ie.length)
  ) {
    const e = new IntersectionObserver(
      (t) => {
        t.forEach((a) => {
          const c = a.target;
          if (a.isIntersecting) {
            if ((!c.src && c.dataset.src && !ze() && (c.src = c.dataset.src), c.hasAttribute("data-scrub") || ze()))
              return;
            c.src && c.play().catch(() => {});
          } else c.paused || c.pause();
        });
      },
      { rootMargin: "200px 0px", threshold: 0 },
    );
    ie.forEach((t) => e.observe(t));
  }
  const Oe = ie.filter((e) => e.hasAttribute("data-scrub"));
  function Te() {
    for (const e of Oe) {
      if (e.readyState < 2 || !e.duration) continue;
      const a = (parseFloat(e.style.getPropertyValue("--door")) || 0) * Math.max(0, e.duration - 0.05);
      Math.abs(e.currentTime - a) > 0.03 && (e.currentTime = a);
    }
  }
  ((function () {
    const e = document.querySelector(".film__video");
    if (!e) return;
    const t = e.closest(".film__buehne"),
      a = t && t.querySelector(".film__untertitel"),
      c = t && t.querySelector("[data-film-abspielen]"),
      u = t && t.querySelector("[data-film-ton]"),
      m = !!(navigator.connection && navigator.connection.saveData),
      L = !q && !m;
    let x = !L;
    function b() {
      if (!c) return;
      const d = !e.paused;
      ((c.querySelector("span").textContent = d ? "Pause" : "Abspielen"),
        c.setAttribute("aria-label", d ? "Film pausieren" : "Film abspielen"),
        c.classList.toggle("film__knopf--laeuft", d));
    }
    function E() {
      if (e.src || !e.dataset.src) return;
      const d = window.matchMedia("(min-width:981px)").matches,
        _ = !!(navigator.connection && navigator.connection.saveData);
      e.src = (d && !_ && e.dataset.srcGross) || e.dataset.src;
    }
    e.dataset.poster &&
      "IntersectionObserver" in window &&
      new IntersectionObserver(
        (_, v) => {
          if (!_.some((T) => T.isIntersecting)) return;
          v.disconnect();
          const C = new Image();
          ((C.onload = () => {
            e.currentTime || (e.poster = e.dataset.poster);
          }),
            (C.src = e.dataset.poster));
        },
        { rootMargin: "200% 0px" },
      ).observe(e);
    const S = e.querySelector("track");
    function y() {
      const d = S && S.track;
      return !d || !a || ((d.mode = "hidden"), !d.cues || !d.cues.length)
        ? !1
        : (d.addEventListener("cuechange", () => {
            const _ = d.activeCues,
              v =
                _ && _.length
                  ? [..._]
                      .map((C) => C.text)
                      .join(" ")
                      .replace(/<[^>]+>/g, "")
                  : "";
            ((a.textContent = v), a.classList.toggle("an", !!v));
          }),
          !0);
    }
    !y() && S && (S.addEventListener("load", y, { once: !0 }), setTimeout(y, 1200));
    const D = "hst-ton";
    let A = !0;
    try {
      sessionStorage.getItem(D) === "aus" && (A = !1);
    } catch {}
    function k() {
      if (!u) return;
      const d = !e.muted;
      ((u.querySelector("span").textContent = d ? "Ton aus" : "Ton an"),
        u.setAttribute("aria-label", d ? "Ton ausschalten" : "Ton einschalten"),
        u.setAttribute("aria-pressed", String(d)),
        u.classList.toggle("film__knopf--wartet", !d && A));
    }
    async function i() {
      if ((E(), A && e.muted)) {
        e.muted = !1;
        try {
          (await e.play(), b(), k());
          return;
        } catch {
          e.muted = !0;
        }
      }
      try {
        await e.play();
      } catch {}
      (b(), k());
    }
    if (u) {
      const d = () => {
        A &&
          e.muted &&
          !e.paused &&
          ((e.muted = !1),
          e
            .play()
            .catch(() => {
              e.muted = !0;
            })
            .finally(k));
      };
      ["pointerdown", "keydown", "touchstart"].forEach((_) => window.addEventListener(_, d, { once: !0, passive: !0 }));
    }
    (new IntersectionObserver(
      (d) => {
        d.forEach((_) => {
          _.isIntersecting ? L && !x && i() : e.paused || (e.pause(), b());
        });
      },
      { threshold: 0.25 },
    ).observe(e),
      c &&
        c.addEventListener("click", () => {
          (e.paused ? ((x = !1), i()) : ((x = !0), e.pause()), b());
        }),
      e.addEventListener("play", b),
      e.addEventListener("pause", b),
      e.addEventListener("volumechange", k),
      u &&
        (e.hasAttribute("data-ohne-ton")
          ? u.remove()
          : ((u.hidden = !1),
            u.addEventListener("click", () => {
              ((A = e.muted), (e.muted = !e.muted));
              try {
                sessionStorage.setItem(D, A ? "an" : "aus");
              } catch {}
              (A && e.paused && i(), k());
            }),
            k())),
      b());
  })(),
    (function () {
      const e = document.getElementById("lightbox"),
        t = [...document.querySelectorAll(".gal__item")];
      if (!e || !t.length || typeof e.showModal != "function") return;
      const a = e.querySelector(".lightbox__bild"),
        c = e.querySelector(".lightbox__bu-text"),
        u = e.querySelector(".lightbox__zaehler");
      let m = 0;
      function L(x) {
        m = (x + t.length) % t.length;
        const b = t[m].querySelector("img"),
          E = t[m].querySelector("figcaption");
        ((a.src = t[m].dataset.gross || b.src),
          (a.alt = b.alt || ""),
          (c.textContent = E ? E.textContent.trim() : ""),
          (u.textContent = m + 1 + " / " + t.length));
      }
      (t.forEach((x, b) => {
        x.addEventListener("click", (E) => {
          (E.preventDefault(), L(b), e.showModal());
        });
      }),
        e.querySelector(".lightbox__zu").addEventListener("click", () => e.close()),
        e.querySelector(".lightbox__vor").addEventListener("click", () => L(m + 1)),
        e.querySelector(".lightbox__zurueck").addEventListener("click", () => L(m - 1)),
        e.addEventListener("keydown", (x) => {
          (x.key === "ArrowRight" && L(m + 1), x.key === "ArrowLeft" && L(m - 1));
        }),
        e.addEventListener("click", (x) => {
          x.target === e && e.close();
        }));
    })(),
    document.querySelectorAll("[data-bereich-waehlen]").forEach((e) => {
      e.addEventListener("click", () => {
        const t = e.dataset.bereichWaehlen,
          a = document.querySelector('#bewerbung select[name="Bereich"]');
        if (!a) return;
        const c = [...a.options].find((u) => u.value === t || u.text === t);
        c && ((a.value = c.value || c.text), a.dispatchEvent(new Event("change", { bubbles: !0 })));
      });
    }),
    document.querySelectorAll("form[data-formular]").forEach((e) => {
      const t = e.querySelector(".form__status"),
        a = e.querySelector('button[type="submit"]'),
        c = e.dataset.empfaenger || "info@hermserviceteam.com",
        u = e.querySelector(".honigtopf input"),
        m = Date.now(),
        L = 2500;
      let x = !1;
      function b(i, p) {
        t && ((t.textContent = i || ""), p ? (t.dataset.stand = p) : delete t.dataset.stand);
      }
      function E(i) {
        const p = i.validity;
        return p.valueMissing
          ? i.type === "checkbox"
            ? "Bitte best\xE4tigen, damit wir Ihre Anfrage bearbeiten d\xFCrfen."
            : i.tagName === "SELECT"
              ? "Bitte einen Eintrag w\xE4hlen."
              : "Bitte ausf\xFCllen."
          : p.typeMismatch && i.type === "email"
            ? "Bitte eine g\xFCltige E-Mail-Adresse angeben, z. B. name@firma.de"
            : p.typeMismatch && i.type === "tel"
              ? "Bitte eine g\xFCltige Telefonnummer angeben."
              : p.tooShort
                ? "Bitte etwas ausf\xFChrlicher: mindestens " + i.minLength + " Zeichen."
                : p.tooLong
                  ? "Das ist zu lang: h\xF6chstens " + i.maxLength + " Zeichen."
                  : p.patternMismatch
                    ? i.dataset.fehler || "Diese Eingabe passt nicht ins Format."
                    : p.rangeUnderflow || p.rangeOverflow
                      ? i.dataset.fehler || "Dieser Wert liegt au\xDFerhalb des erlaubten Bereichs."
                      : p.badInput
                        ? "Diese Eingabe k\xF6nnen wir nicht lesen."
                        : "Bitte pr\xFCfen Sie diese Eingabe.";
      }
      function S(i) {
        const p = i.closest(".feld") || i.parentElement,
          d = p && p.querySelector(".feld__fehler"),
          _ = i.checkValidity();
        return (
          p && p.classList.toggle("feld--fehler", !_),
          i.setAttribute("aria-invalid", _ ? "false" : "true"),
          d && (d.textContent = _ ? "" : E(i)),
          _
        );
      }
      (e.querySelectorAll("[data-wenn]").forEach((i) => {
        const p = e.querySelector("#" + i.dataset.wenn),
          d = i.querySelector("input, select, textarea"),
          _ = i.dataset.wennWert;
        if (!p || !d) return;
        const v = p.type === "checkbox",
          C = i.hasAttribute("data-wenn-pflicht");
        function T() {
          const o = v ? p.checked : p.value === _;
          if (((i.hidden = !o), (d.disabled = !o), (d.required = o && C), o)) return;
          ((d.value = ""), i.classList.remove("feld--fehler"), d.setAttribute("aria-invalid", "false"));
          const f = i.querySelector(".feld__fehler");
          f && (f.textContent = "");
        }
        (p.addEventListener("change", T), T());
      }),
        (function () {
          const i = e.querySelector("#datum"),
            p = e.querySelector("#datum-bis");
          if (!i || !p) return;
          function d() {
            ((p.min = i.value || ""), p.value && S(p));
          }
          (i.addEventListener("change", d), i.addEventListener("input", d), d());
        })(),
        e.querySelectorAll("input, select, textarea").forEach((i) => {
          i.closest(".honigtopf") ||
            (i.addEventListener("blur", () => S(i)),
            i.addEventListener("input", () => {
              const p = i.closest(".feld");
              p && p.classList.contains("feld--fehler") && S(i);
            }));
        }));
      function y() {
        const i = document.createElement("div");
        ((i.className = "danke"),
          i.setAttribute("role", "status"),
          i.setAttribute("tabindex", "-1"),
          (i.innerHTML =
            '<span class="danke__haken" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><h2 class="u-caps">' +
            (e.dataset.dankeTitel || "Danke!") +
            "</h2><p>" +
            (e.dataset.dankeText || "Ihre Nachricht ist bei uns. Wir melden uns zeitnah zur\xFCck.") +
            "</p>"),
          e.replaceWith(i),
          i.focus(),
          i.scrollIntoView({ block: "center" }));
      }
      let D = !1;
      function A(i) {
        ((D = i), a && ((a.disabled = i), i ? a.setAttribute("aria-busy", "true") : a.removeAttribute("aria-busy")));
      }
      e.addEventListener("submit", async (i) => {
        if ((i.preventDefault(), D)) return;
        if (u && u.value) {
          y();
          return;
        }
        const p = [...e.querySelectorAll("input, select, textarea")].filter(
          (o) => !o.closest(".honigtopf") && !o.disabled,
        );
        let d = null;
        if (
          (p.forEach((o) => {
            !S(o) && !d && (d = o);
          }),
          d)
        ) {
          (b("Bitte pr\xFCfen Sie die markierten Felder.", "fehler"),
            d.focus(),
            d.scrollIntoView({ block: "center", behavior: "smooth" }));
          return;
        }
        if (!x && Date.now() - m < L) {
          ((x = !0), b("Das ging schnell. Bitte noch einmal auf Senden klicken, dann geht es raus."));
          return;
        }
        b("");
        const _ = new FormData(e);
        if ((_.delete(u ? u.name : "__kein_feld__"), location.protocol.startsWith("http"))) {
          (A(!0), b("Wird gesendet \u2026", "laeuft"));
          let o = 0;
          try {
            const f = await fetch("/api/formular", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
              body: new URLSearchParams(_).toString(),
            });
            if (((o = f.status), f.ok)) {
              y();
              return;
            }
          } catch {
            o = 0;
          }
          if ((A(!1), b(""), o && ![404, 405, 501, 503].includes(o))) {
            k("Das Absenden hat nicht geklappt.");
            return;
          }
        }
        const v = e.dataset.endpunkt,
          C = /(^|\.)github\.io$|(^|\.)vercel\.app$|(^|\.)pages\.dev$|^localhost$|^127\.|^0\.0\.0\.0$|^192\.168\./.test(
            location.hostname,
          ),
          T = e.dataset.netlify === "true" && location.protocol.startsWith("http") && !C;
        if (v || T) {
          (A(!0), b("Wird gesendet \u2026", "laeuft"));
          try {
            const o = v
              ? await fetch(v, { method: "POST", body: _, headers: { Accept: "application/json" } })
              : await fetch(location.pathname, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams(_).toString(),
                });
            if (!o.ok) throw new Error("HTTP " + o.status);
            y();
            return;
          } catch {
            (A(!1), k("Das Absenden hat nicht geklappt."));
            return;
          }
        }
        k("Diese Vorschau kann noch nicht selbst versenden.");
      });
      function k(i) {
        b(i + " Bitte rufen Sie uns an unter +49 (40) 27075100 oder schreiben Sie an " + c + ".", "fehler");
      }
    }),
    !q &&
      window.matchMedia("(hover:hover) and (pointer:fine)").matches &&
      document.querySelectorAll(".btn, .form__submit, .film__knopf").forEach((e) => {
        (e.addEventListener("pointermove", (t) => {
          const a = e.getBoundingClientRect(),
            c = (t.clientX - (a.left + a.width / 2)) / Math.max(1, a.width),
            u = (t.clientY - (a.top + a.height / 2)) / Math.max(1, a.height);
          (e.style.setProperty("--mx", (c * 10).toFixed(1) + "px"),
            e.style.setProperty("--my", (u * 6).toFixed(1) + "px"));
        }),
          e.addEventListener("pointerleave", () => {
            (e.style.setProperty("--mx", "0px"), e.style.setProperty("--my", "0px"));
          }));
      }),
    (function () {
      if (q || !window.matchMedia("(hover:hover) and (pointer:fine)").matches) return;
      const e = document.createElement("div");
      ((e.className = "zeiger"),
        e.setAttribute("aria-hidden", "true"),
        (e.innerHTML = '<span class="zeiger__wort">Ansehen</span>'),
        document.body.appendChild(e));
      let t = window.innerWidth / 2,
        a = window.innerHeight / 2,
        c = t,
        u = a,
        m = !1,
        L = !1;
      function x() {
        ((c += (t - c) * 0.18),
          (u += (a - u) * 0.18),
          (e.style.transform = "translate3d(" + c.toFixed(1) + "px," + u.toFixed(1) + "px,0) translate(-50%,-50%)"),
          Math.abs(t - c) > 0.3 || Math.abs(a - u) > 0.3 ? requestAnimationFrame(x) : (m = !1));
      }
      (window.addEventListener(
        "pointermove",
        (E) => {
          (E.pointerType && E.pointerType !== "mouse") ||
            ((t = E.clientX),
            (a = E.clientY),
            L || ((L = !0), e.classList.add("an")),
            m || ((m = !0), requestAnimationFrame(x)));
        },
        { passive: !0 },
      ),
        document.addEventListener(
          "pointerover",
          (E) => {
            const S = E.target.closest ? E.target : E.target.parentElement;
            !S ||
              !S.closest ||
              (e.classList.toggle("zeiger--sehen", !!S.closest(".gal__item, .film__buehne")),
              e.classList.toggle(
                "zeiger--aktiv",
                !!S.closest('a, button, [role="button"], input, select, textarea, summary, label'),
              ));
          },
          !0,
        ));
      const b = () => {
        ((L = !1), e.classList.remove("an"));
      };
      (document.documentElement.addEventListener("mouseleave", b), window.addEventListener("blur", b));
    })());
  let ue = !1;
  function $e() {
    (oe(),
      Fe(),
      clearTimeout(Se),
      (Se = setTimeout(je, 160)),
      !q &&
        !ue &&
        ((ue = !0),
        requestAnimationFrame(() => {
          (_e(), xe(), Ae(), Ce(), Te(), (ue = !1));
        })));
  }
  function De() {
    (se(), _e(), xe(), Ae(), Ce());
  }
  (window.addEventListener("scroll", $e, { passive: !0 }),
    (function () {
      const e = document.getElementById("bestandskunde");
      if (!e) return;
      const t = document.getElementById("kundenbereich"),
        a = e.querySelector(".kundentuer__knopf"),
        c = [...t.querySelectorAll(".kb-schritt")],
        u = (r) =>
          c.forEach((n) => {
            n.hidden = n.dataset.schritt !== r;
          }),
        m = (r) => t.querySelector(`[data-schritt="${r}"]`),
        L = "18:00",
        x = "23:00";
      let b = [],
        E = null,
        S = [],
        y = null,
        D = "";
      async function A(r, n) {
        let s;
        try {
          s = await fetch("/api/konto", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-HST-Bereich": "kundenbereich" },
            credentials: "same-origin",
            body: JSON.stringify({ aktion: r, ...(n || {}) }),
          });
        } catch {
          return {
            code: 0,
            rumpf: {
              ok: !1,
              offline: !0,
              grund: "Keine Verbindung. Bitte pr\xFCfen Sie Ihr Netz und versuchen Sie es noch einmal.",
            },
          };
        }
        let l = {};
        try {
          l = await s.json();
        } catch {}
        return { code: s.status, rumpf: l };
      }
      function k(r, n, s) {
        const l = r.querySelector(".form__status");
        l && ((l.textContent = n || ""), s ? l.setAttribute("data-stand", s) : l.removeAttribute("data-stand"));
      }
      function i(r, n) {
        const s = r.closest(".feld");
        if (!s) return;
        s.classList.toggle("feld--fehler", !!n);
        const l = s.querySelector(".feld__fehler");
        l && (l.textContent = n || "");
      }
      function p() {
        ((E = null),
          u("anmelden"),
          k(m("anmelden"), "Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich neu an.", "fehler"),
          t.scrollIntoView({ block: "nearest", behavior: q ? "auto" : "smooth" }));
      }
      function d(r) {
        if ((a.setAttribute("aria-expanded", String(r)), r)) {
          ((t.hidden = !1), requestAnimationFrame(() => t.classList.add("auf")));
          const n = t.querySelector(
            ".kb-schritt:not([hidden]) input:not([type=checkbox]), .kb-schritt:not([hidden]) button",
          );
          n && !q && setTimeout(() => n.focus({ preventScroll: !0 }), 60);
        } else
          (t.classList.remove("auf"),
            setTimeout(() => {
              a.getAttribute("aria-expanded") !== "true" && (t.hidden = !0);
            }, 420));
      }
      a.addEventListener("click", () => d(a.getAttribute("aria-expanded") !== "true"));
      const _ = m("anmelden"),
        v = _.querySelector(".kb-anmeldung"),
        C = _.querySelector(".kb-vergessen");
      (v.addEventListener("submit", async (r) => {
        r.preventDefault();
        const n = v.anmeldename,
          s = v.passwort;
        if ((i(n, ""), i(s, ""), !n.value.trim())) {
          (i(n, "Bitte tragen Sie Ihren Anmeldenamen ein."), n.focus());
          return;
        }
        if (!s.value) {
          (i(s, "Bitte tragen Sie Ihr Passwort ein."), s.focus());
          return;
        }
        const l = v.querySelector("button[type=submit]");
        (l.setAttribute("aria-busy", "true"), k(v, "Wird gepr\xFCft \u2026", "laeuft"));
        const h = await A("anmelden", { anmeldename: n.value.trim(), passwort: s.value, bleiben: v.bleiben.checked });
        if ((l.removeAttribute("aria-busy"), !h.rumpf.ok)) {
          (k(v, h.rumpf.grund || "Anmeldung nicht m\xF6glich.", "fehler"), (s.value = ""), s.focus());
          return;
        }
        (k(v, "", null), (s.value = ""), de(h.rumpf.kunde, !0, !0));
      }),
        _.querySelector("[data-vergessen]").addEventListener("click", () => {
          ((v.hidden = !0), (C.hidden = !1), C.email.focus());
        }),
        C.querySelector("[data-zurueck]").addEventListener("click", () => {
          ((C.hidden = !0), (v.hidden = !1), k(C, "", null));
        }),
        C.addEventListener("submit", async (r) => {
          r.preventDefault();
          const n = C.email;
          if ((i(n, ""), !n.value.includes("@"))) {
            i(n, "Bitte tragen Sie Ihre E-Mail-Adresse ein.");
            return;
          }
          const s = C.querySelector("button[type=submit]");
          s.setAttribute("aria-busy", "true");
          const l = await A("passwort-vergessen", { email: n.value.trim() });
          (s.removeAttribute("aria-busy"), k(C, l.rumpf.hinweis || l.rumpf.grund || "", l.rumpf.ok ? null : "fehler"));
        }));
      const T = m("passwort-neu").querySelector(".kb-neu");
      let o = "";
      ((function () {
        const n = /(?:^|#|&)passwort-neu=([A-Za-z0-9_-]{20,})/.exec(location.hash || "");
        n &&
          ((o = n[1]),
          history.replaceState(null, "", location.pathname + location.search),
          (e.hidden = !1),
          d(!0),
          u("passwort-neu"),
          setTimeout(() => T.passwort.focus({ preventScroll: !0 }), 80),
          e.scrollIntoView({ block: "start", behavior: "auto" }));
      })(),
        T.addEventListener("submit", async (r) => {
          r.preventDefault();
          const n = T.passwort;
          if ((i(n, ""), n.value.length < 10)) {
            i(n, "Bitte mindestens zehn Zeichen w\xE4hlen.");
            return;
          }
          const s = T.querySelector("button[type=submit]");
          s.setAttribute("aria-busy", "true");
          const l = await A("passwort-neu", { marke: o, passwort: n.value });
          if ((s.removeAttribute("aria-busy"), !l.rumpf.ok)) {
            k(T, l.rumpf.grund || "Das hat nicht geklappt.", "fehler");
            return;
          }
          ((n.value = ""),
            u("anmelden"),
            k(v, l.rumpf.hinweis || "Das Passwort wurde ge\xE4ndert.", null),
            v.anmeldename.focus());
        }));
      const f = typeof window.PublicKeyCredential < "u" && !!(navigator.credentials && navigator.credentials.create),
        g = {
          ein(r) {
            const n = String(r).replace(/-/g, "+").replace(/_/g, "/"),
              s = atob(n + "=".repeat((4 - (n.length % 4)) % 4)),
              l = new Uint8Array(s.length);
            for (let h = 0; h < s.length; h++) l[h] = s.charCodeAt(h);
            return l.buffer;
          },
          aus(r) {
            const n = new Uint8Array(r);
            let s = "";
            for (let l = 0; l < n.length; l++) s += String.fromCharCode(n[l]);
            return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          },
        };
      function F() {
        const r = navigator.userAgent || "";
        return /iPhone/.test(r)
          ? "iPhone"
          : /iPad/.test(r)
            ? "iPad"
            : /Android/.test(r)
              ? "Android-Ger\xE4t"
              : /Macintosh/.test(r)
                ? "Mac"
                : /Windows/.test(r)
                  ? "Windows-Ger\xE4t"
                  : "Dieses Ger\xE4t";
      }
      const j = v.querySelector(".kb-passkey");
      (f || j.remove(),
        j &&
          j.addEventListener("click", async () => {
            (j.setAttribute("aria-busy", "true"), k(v, "", null));
            try {
              const r = await A("passkey-anmelden-start", { anmeldename: v.anmeldename.value.trim() || void 0 });
              if (!r.rumpf.ok) throw new Error(r.rumpf.grund || "Passkeys stehen nicht zur Verf\xFCgung.");
              const n = r.rumpf.optionen,
                s = await navigator.credentials.get({
                  publicKey: {
                    ...n,
                    challenge: g.ein(n.challenge),
                    allowCredentials: (n.allowCredentials || []).map((h) => ({ ...h, id: g.ein(h.id) })),
                  },
                }),
                l = await A("passkey-anmelden-ende", {
                  marke: r.rumpf.marke,
                  bleiben: v.bleiben.checked,
                  antwort: {
                    id: s.id,
                    rawId: g.aus(s.rawId),
                    type: s.type,
                    clientExtensionResults: s.getClientExtensionResults(),
                    response: {
                      clientDataJSON: g.aus(s.response.clientDataJSON),
                      authenticatorData: g.aus(s.response.authenticatorData),
                      signature: g.aus(s.response.signature),
                      userHandle: s.response.userHandle ? g.aus(s.response.userHandle) : null,
                    },
                  },
                });
              if (!l.rumpf.ok) throw new Error(l.rumpf.grund || "Anmeldung nicht m\xF6glich.");
              de(l.rumpf.kunde, !1, !0);
            } catch (r) {
              const n = r && (r.name === "NotAllowedError" || r.name === "AbortError");
              (k(v, n ? "" : r.message || "Die Anmeldung mit Passkey hat nicht geklappt.", n ? null : "fehler"),
                n && v.anmeldename.focus());
            } finally {
              j.removeAttribute("aria-busy");
            }
          }));
      const J = m("anfrage").querySelector("[data-passkey-anbieten]");
      J.addEventListener("click", async () => {
        J.setAttribute("aria-busy", "true");
        try {
          const r = await A("passkey-einrichten-start");
          if (!r.rumpf.ok) throw new Error(r.rumpf.grund || "Das geht hier nicht.");
          const n = r.rumpf.optionen,
            s = await navigator.credentials.create({
              publicKey: {
                ...n,
                challenge: g.ein(n.challenge),
                user: { ...n.user, id: g.ein(n.user.id) },
                excludeCredentials: (n.excludeCredentials || []).map((h) => ({ ...h, id: g.ein(h.id) })),
              },
            }),
            l = await A("passkey-einrichten-ende", {
              marke: r.rumpf.marke,
              geraet: F(),
              antwort: {
                id: s.id,
                rawId: g.aus(s.rawId),
                type: s.type,
                clientExtensionResults: s.getClientExtensionResults(),
                response: {
                  clientDataJSON: g.aus(s.response.clientDataJSON),
                  attestationObject: g.aus(s.response.attestationObject),
                  transports: s.response.getTransports ? s.response.getTransports() : [],
                },
              },
            });
          if (!l.rumpf.ok) throw new Error(l.rumpf.grund || "Der Passkey konnte nicht gespeichert werden.");
          ((E = l.rumpf.kunde),
            (J.hidden = !0),
            k(
              m("anfrage").querySelector(".kb-formular"),
              "Beim n\xE4chsten Mal gen\xFCgt Face ID oder Ihr Ger\xE4tecode.",
              null,
            ));
        } catch (r) {
          (r && (r.name === "NotAllowedError" || r.name === "AbortError")) ||
            k(m("anfrage").querySelector(".kb-formular"), r.message || "Das hat nicht geklappt.", "fehler");
        } finally {
          J.removeAttribute("aria-busy");
        }
      });
      const P = m("anfrage"),
        M = P.querySelector(".kb-formular");
      function de(r, n, s) {
        E = r;
        const l = (E.ansprechpartner || []).find((h) => h.haupt) || (E.ansprechpartner || [])[0];
        ((P.querySelector("[data-firma]").textContent = E.firma || ""),
          (P.querySelector("[data-person]").textContent = l ? [l.vorname, l.nachname].filter(Boolean).join(" ") : ""),
          (P.querySelector("[data-kundennummer]").textContent = "Kundennummer " + (E.kundennummer || "")),
          (J.hidden = !(n && f && E.passkeyMoeglich && (E.passkeys || []).length === 0)),
          Me(),
          u("anfrage"),
          s !== !1 && (d(!0), P.scrollIntoView({ block: "start", behavior: q ? "auto" : "smooth" })));
      }
      P.querySelector("[data-abmelden]").addEventListener("click", async () => {
        (await A("abmelden"), (E = null), (v.hidden = !1), (C.hidden = !0), k(v, "", null), u("anmelden"));
      });
      const Y = P.querySelector("[data-tage]");
      function Ve(r) {
        const n = new Date();
        return (n.setDate(n.getDate() + r), n.toISOString().slice(0, 10));
      }
      function Re(r) {
        if (!r) return "";
        const n = new Date(r + "T12:00:00");
        return (n.setDate(n.getDate() + 1), n.toISOString().slice(0, 10));
      }
      function We(r) {
        const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r || "");
        if (!n) return "";
        const s = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
          l = new Date(r + "T12:00:00");
        return `${s[l.getDay()]}, ${n[3]}.${n[2]}.${n[1]}`;
      }
      function Ie(r) {
        const n = {};
        return (
          b.forEach((s) => {
            n[s.schluessel] = r ? r.mengen[s.schluessel] : 0;
          }),
          { datum: r ? Re(r.datum) : "", von: r ? r.von : L, bis: r ? r.bis : x, mengen: n }
        );
      }
      function Me() {
        ((S = [Ie(null)]), (D = ""), me(), M.reset(), k(M, "", null));
      }
      function me() {
        ((Y.textContent = ""),
          S.forEach((r, n) => Y.appendChild(Ke(r, n))),
          (P.querySelector("[data-tag-plus]").hidden = S.length >= 14));
      }
      function Ke(r, n) {
        const s = document.createElement("div");
        s.className = "kb-tag";
        const l = document.createElement("div");
        if (((l.className = "kb-tag__kopf"), S.length > 1)) {
          const w = document.createElement("span");
          ((w.className = "kb-tag__marke"), (w.textContent = "Tag " + (n + 1)), l.appendChild(w));
        }
        if (
          (l.appendChild(
            fe(
              "Datum",
              "date",
              r.datum,
              (w) => {
                r.datum = w;
              },
              "kb-datum-" + n,
              Ve(0),
              "datum",
            ),
          ),
          l.appendChild(
            fe(
              "Von",
              "time",
              r.von,
              (w) => {
                r.von = w;
              },
              "kb-von-" + n,
              null,
              "zeit",
            ),
          ),
          l.appendChild(
            fe(
              "Bis",
              "time",
              r.bis,
              (w) => {
                r.bis = w;
              },
              "kb-bis-" + n,
              null,
              "zeit",
            ),
          ),
          S.length > 1)
        ) {
          const w = document.createElement("button");
          ((w.type = "button"),
            (w.className = "kb-textknopf kb-tag__weg"),
            (w.textContent = "Tag entfernen"),
            w.addEventListener("click", () => {
              (S.splice(n, 1), me());
            }),
            l.appendChild(w));
        }
        s.appendChild(l);
        const h = document.createElement("div");
        return ((h.className = "kb-arten"), b.forEach((w) => h.appendChild(Ze(w, r))), s.appendChild(h), s);
      }
      function fe(r, n, s, l, h, w, z) {
        const I = document.createElement("div");
        I.className = "kb-tag__feld" + (z ? " kb-tag__feld--" + z : "");
        const B = document.createElement("label");
        (B.setAttribute("for", h), (B.textContent = r));
        const N = document.createElement("input");
        return (
          (N.type = n),
          (N.id = h),
          (N.value = s || ""),
          w && (N.min = w),
          N.addEventListener("input", () => l(N.value)),
          I.appendChild(B),
          I.appendChild(N),
          I
        );
      }
      function Ze(r, n) {
        const s = document.createElement("div");
        s.className = "kb-art";
        const l = document.createElement("div");
        l.className = "kb-art__wort";
        const h = document.createElement("span");
        ((h.className = "kb-art__name"), (h.textContent = r.name));
        const w = document.createElement("span");
        ((w.className = "kb-art__hinweis"), (w.textContent = r.hinweis || ""), l.appendChild(h), l.appendChild(w));
        const z = document.createElement("div");
        z.className = "kb-menge";
        const I = document.createElement("span");
        I.className = "kb-menge__zahl";
        const B = Be("\u2212", "Eine Person weniger " + r.name),
          N = Be("+", "Eine Person mehr " + r.name);
        function V($) {
          const W = n.mengen[r.schluessel] || 0;
          ((I.textContent = String(W)),
            s.classList.toggle("kb-art--an", W > 0),
            (B.disabled = W <= 0),
            (N.disabled = W >= 999),
            $ && !q && (I.classList.add("stups"), setTimeout(() => I.classList.remove("stups"), 200)));
        }
        function R($) {
          const W = Math.min(999, Math.max(0, (n.mengen[r.schluessel] || 0) + $));
          ((n.mengen[r.schluessel] = W), V(!0));
        }
        return (
          B.addEventListener("click", () => R(-1)),
          N.addEventListener("click", () => R(1)),
          z.appendChild(B),
          z.appendChild(I),
          z.appendChild(N),
          s.appendChild(l),
          s.appendChild(z),
          V(!1),
          s
        );
      }
      function Be(r, n) {
        const s = document.createElement("button");
        return ((s.type = "button"), (s.textContent = r), s.setAttribute("aria-label", n), s);
      }
      P.querySelector("[data-tag-plus]").addEventListener("click", () => {
        (S.push(Ie(S[S.length - 1])), me());
        const r = Y.lastElementChild;
        r && r.scrollIntoView({ block: "nearest", behavior: q ? "auto" : "smooth" });
      });
      function Ue() {
        const r = [];
        return (
          S.forEach((n) => {
            b.forEach((s) => {
              const l = n.mengen[s.schluessel] || 0;
              l > 0 &&
                r.push({
                  art: s.schluessel,
                  artName: s.name,
                  anzahl: l,
                  datum: n.datum,
                  von: n.von,
                  bis: n.bis,
                  ueberNacht: n.bis <= n.von,
                });
            });
          }),
          r
        );
      }
      M.addEventListener("submit", (r) => {
        if (
          (r.preventDefault(),
          k(M, "", null),
          ["projekt", "einsatzort"].forEach((l) => i(M[l], "")),
          !M.projekt.value.trim())
        ) {
          (i(M.projekt, "Bitte geben Sie an, worum es geht."), M.projekt.focus());
          return;
        }
        if (!M.einsatzort.value.trim()) {
          (i(M.einsatzort, "Bitte geben Sie den Einsatzort an."), M.einsatzort.focus());
          return;
        }
        const n = S.findIndex((l) => !l.datum);
        if (n >= 0) {
          k(M, `Bitte tragen Sie beim ${S.length > 1 ? n + 1 + ". Tag" : "Einsatz"} ein Datum ein.`, "fehler");
          const l = Y.querySelector(`#kb-datum-${n}`);
          l && l.focus();
          return;
        }
        const s = Ue();
        if (!s.length) {
          (k(M, "Bitte w\xE4hlen Sie mindestens eine Personalart aus.", "fehler"),
            Y.scrollIntoView({ block: "nearest", behavior: q ? "auto" : "smooth" }));
          return;
        }
        ((y = {
          projekt: M.projekt.value.trim(),
          einsatzort: M.einsatzort.value.trim(),
          adresse: M.adresse.value.trim(),
          hinweise: M.hinweise.value.trim(),
          positionen: s,
        }),
          D || (D = "a-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36)),
          Ne(m("pruefen").querySelector("[data-uebersicht]"), y),
          u("pruefen"),
          m("pruefen").scrollIntoView({ block: "start", behavior: q ? "auto" : "smooth" }));
      });
      function Ne(r, n) {
        r.textContent = "";
        const s = (h, w) => {
          if (!w) return;
          const z = document.createElement("div");
          z.className = "kb-ueber__zeile";
          const I = document.createElement("span");
          ((I.className = "kb-ueber__was"), (I.textContent = h));
          const B = document.createElement("span");
          ((B.className = "kb-ueber__wert"), (B.textContent = w), z.appendChild(I), z.appendChild(B), r.appendChild(z));
        };
        (s("Firma", E ? E.firma : ""), s("Projekt", n.projekt), s("Einsatzort", n.einsatzort), s("Adresse", n.adresse));
        const l = new Map();
        if (
          (n.positionen.forEach((h) => {
            (l.has(h.datum) || l.set(h.datum, []), l.get(h.datum).push(h));
          }),
          [...l.entries()]
            .sort((h, w) => (h[0] < w[0] ? -1 : 1))
            .forEach(([h, w]) => {
              const z = document.createElement("div");
              z.className = "kb-ueber__tag";
              const I = document.createElement("span");
              ((I.className = "kb-ueber__tagmarke"),
                (I.textContent = We(h)),
                z.appendChild(I),
                w.forEach((B) => {
                  const N = document.createElement("div");
                  N.className = "kb-ueber__posten";
                  const V = document.createElement("span");
                  ((V.className = "kb-ueber__anzahl"), (V.textContent = B.anzahl + " \xD7"));
                  const R = document.createElement("span");
                  ((R.className = "kb-ueber__art"), (R.textContent = B.artName));
                  const $ = document.createElement("span");
                  (($.className = "kb-ueber__zeit"),
                    ($.textContent = `${B.von}\u2013${B.bis} Uhr` + (B.ueberNacht ? " (\xFCber Nacht)" : "")),
                    N.appendChild(V),
                    N.appendChild(R),
                    N.appendChild($),
                    z.appendChild(N));
                }),
                r.appendChild(z));
            }),
          n.hinweise)
        ) {
          const h = document.createElement("div");
          h.className = "kb-ueber__tag";
          const w = document.createElement("span");
          ((w.className = "kb-ueber__tagmarke"), (w.textContent = "Hinweise zum Einsatz"));
          const z = document.createElement("p");
          ((z.className = "kb-ueber__wert"),
            (z.textContent = n.hinweise),
            h.appendChild(w),
            h.appendChild(z),
            r.appendChild(h));
        }
      }
      m("pruefen")
        .querySelector("[data-zurueck-bearbeiten]")
        .addEventListener("click", () => {
          (u("anfrage"), P.scrollIntoView({ block: "start", behavior: q ? "auto" : "smooth" }));
        });
      const he = m("pruefen").querySelector("[data-senden]");
      let pe = !1;
      (he.addEventListener("click", async () => {
        if (pe) return;
        ((pe = !0), he.setAttribute("aria-busy", "true"), k(m("pruefen"), "Wird gesendet \u2026", "laeuft"));
        const r = await A("anfrage", {
          ...y,
          positionen: y.positionen.map((s) => ({
            art: s.art,
            anzahl: s.anzahl,
            datum: s.datum,
            von: s.von,
            bis: s.bis,
            ueberNacht: s.ueberNacht,
          })),
          vorgangsschluessel: D,
        });
        if (((pe = !1), he.removeAttribute("aria-busy"), r.code === 401 && r.rumpf.abgelaufen)) {
          p();
          return;
        }
        if (!r.rumpf.ok) {
          k(m("pruefen"), r.rumpf.grund || "Die Anfrage konnte nicht gespeichert werden.", "fehler");
          return;
        }
        k(m("pruefen"), "", null);
        const n = m("fertig");
        ((n.querySelector("[data-nummer]").textContent = r.rumpf.anfragenummer || ""),
          (n.querySelector("[data-fertig-satz]").textContent = r.rumpf.benachrichtigt
            ? "Ihre Anfrage liegt unserem Dispositionsteam vor. Sie erhalten gleich eine Best\xE4tigung per E-Mail."
            : "Ihre Anfrage ist gespeichert. Die Best\xE4tigung per E-Mail konnte gerade nicht zugestellt werden: melden Sie sich im Zweifel unter +49 (40) 27075100 mit Ihrer Anfragenummer."),
          Ne(n.querySelector("[data-uebersicht-fertig]"), y),
          u("fertig"),
          n.scrollIntoView({ block: "start", behavior: q ? "auto" : "smooth" }));
      }),
        m("fertig")
          .querySelector("[data-neue-anfrage]")
          .addEventListener("click", () => {
            ((y = null), Me(), u("anfrage"), P.scrollIntoView({ block: "start", behavior: q ? "auto" : "smooth" }));
          }),
        (async function () {
          const n = await A("stand");
          n.code === 503 ||
            !n.rumpf ||
            n.rumpf.bereit !== !0 ||
            ((b = n.rumpf.personal || []),
            b.length &&
              ((e.hidden = !1),
              j && n.rumpf.passkeyMoeglich && (j.hidden = !1),
              n.rumpf.angemeldet &&
                n.rumpf.kunde &&
                (de(n.rumpf.kunde, !1, !0), d(!1), a.setAttribute("aria-expanded", "false"))));
        })());
    })(),
    window.addEventListener("resize", () => {
      (se(), oe(), q || De());
    }),
    se(),
    oe(),
    q || De());
})();
