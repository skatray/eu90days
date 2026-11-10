// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: calendar-check;
// EU 90 Days — Scriptable widget
// Параметр віджета (необов’язково): скільки днів уже минуло за лічильником, наприклад 44
// Далі віджет сам додає по +1 на день.
// Запуск усередині застосунку Scriptable відкриває меню налаштувань.

const TOTAL = 90;
const GEO_INTERVAL_MS = 12 * 3600 * 1000; // двічі на день

const COUNTRIES = {
  AT: "Австрія", BE: "Бельгія", BG: "Болгарія", HR: "Хорватія", CY: "Кіпр",
  CZ: "Чехія", DK: "Данія", EE: "Естонія", FI: "Фінляндія", FR: "Франція",
  DE: "Німеччина", GR: "Греція", HU: "Угорщина", IE: "Ірландія", IT: "Італія",
  LV: "Латвія", LT: "Литва", LU: "Люксембург", MT: "Мальта", NL: "Нідерланди",
  PL: "Польща", PT: "Португалія", RO: "Румунія", SK: "Словаччина", SI: "Словенія",
  ES: "Іспанія", SE: "Швеція", NO: "Норвегія", CH: "Швейцарія", IS: "Ісландія", LI: "Ліхтенштейн"
};

// ---------- стан ----------
const fm = FileManager.local();
const statePath = fm.joinPath(fm.documentsDirectory(), "eu90_state.json");

function loadState() {
  try {
    if (fm.fileExists(statePath)) return JSON.parse(fm.readString(statePath));
  } catch (e) {}
  return { baseDays: null, baseDate: null, protection: null, pauseInProtection: true, country: null, lastCheck: 0 };
}
function saveState(s) { fm.writeString(statePath, JSON.stringify(s)); }

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)))
    : "🌍";

// ---------- дні по країнах ----------
function isoDay(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// день записується за кожною країною, де ти був хоча б раз протягом цієї доби
function logCountry(state, cc) {
  state.log = state.log || {};
  const key = isoDay(new Date());
  const arr = state.log[key] || [];
  if (!arr.includes(cc)) arr.push(cc);
  state.log[key] = arr;
  const cutoff = isoDay(new Date(Date.now() - 200 * 86400000));
  Object.keys(state.log).forEach((k) => { if (k < cutoff) delete state.log[k]; });
}
function countryDays(state) {
  const res = {};
  Object.values(state.log || {}).forEach((arr) =>
    arr.forEach((cc) => (res[cc] = (res[cc] || 0) + 1))
  );
  Object.entries(state.offsets || {}).forEach(([cc, n]) => (res[cc] = (res[cc] || 0) + n));
  return Object.entries(res).sort((a, b) => b[1] - a[1]);
}

// ---------- геолокація ----------
async function updateGeo(state, force = false) {
  const now = Date.now();
  if (!force && now - state.lastCheck < GEO_INTERVAL_MS) return;
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    const res = await Location.reverseGeocode(loc.latitude, loc.longitude);
    if (res && res[0] && res[0].isoCountryCode) {
      const cc = res[0].isoCountryCode;
      // перетнули кордон — запам'ятовуємо, щоб привітати на наступну добу
      if (state.country && state.country !== cc) state.arrived = { cc, at: now };
      state.country = cc;
      logCountry(state, cc);
    }
    state.lastCheck = now;
    saveState(state);
  } catch (e) {
    // немає дозволу/мережі — лишаємо попереднє значення
  }
}

// ---------- лічильник ----------
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function setDaysPassed(state, n) {
  state.baseDays = Math.min(TOTAL, Math.max(0, Math.round(n)));
  state.baseDate = startOfDay(new Date()).toISOString();
}
function pauseOn(state) {
  return !!state.protection && state.pauseInProtection !== false;
}
// чи був сьогодні лише в країні захисту (тоді лічильник стоїть на паузі)
function inProtectionToday(state) {
  if (!pauseOn(state)) return false;
  const arr = (state.log || {})[isoDay(new Date())] || [];
  return arr.length > 0 && arr.every((c) => c === state.protection);
}
function daysPassed(state) {
  const base = startOfDay(state.baseDate);
  const elapsed = Math.round((startOfDay(new Date()) - base) / 86400000);
  let n = state.baseDays;
  for (let i = 1; i <= elapsed && i <= 400; i++) {
    if (pauseOn(state)) {
      // дні лише в країні захисту не рахуємо; дні без даних рахуємо (обережно)
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const arr = (state.log || {})[isoDay(d)];
      if (arr && arr.length && arr.every((c) => c === state.protection)) continue;
    }
    n++;
  }
  return Math.min(TOTAL, Math.max(0, n));
}

// ---------- фрази ----------
const LOC = {
  AT: "в Австрії", BE: "в Бельгії", BG: "у Болгарії", HR: "у Хорватії", CY: "на Кіпрі",
  CZ: "в Чехії", DK: "у Данії", EE: "в Естонії", FI: "у Фінляндії", FR: "у Франції",
  DE: "в Німеччині", GR: "у Греції", HU: "в Угорщині", IE: "в Ірландії", IT: "в Італії",
  LV: "у Латвії", LT: "у Литві", LU: "у Люксембурзі", MT: "на Мальті", NL: "у Нідерландах",
  PL: "у Польщі", PT: "у Португалії", RO: "у Румунії", SK: "у Словаччині", SI: "у Словенії",
  ES: "в Іспанії", SE: "у Швеції", NO: "у Норвегії", CH: "у Швейцарії", IS: "в Ісландії", LI: "у Ліхтенштейні"
};
const MILESTONES = { 30: "Перша третина позаду", 45: "Рівно половина шляху", 60: "Дві третини позаду" };
const PHRASES = [
  [15, ["Починаємо без поспіху", "Є з чого обирати маршрут", "Усе тільки починається"]],
  [45, ["Рахуємо дні, а не нерви", "Темп рівний, так тримати", "Часу ще вдосталь"]],
  [60, ["Вже майже половина", "Середина шляху, можна видихнути", "Час поглянути на карту"]],
  [85, ["Плануємо наступний крок", "Позаду більша частина", "Час звірити маршрут"]],
  [100, ["Лишилось зовсім трохи", "Пора збирати валізу", "Фінішна пряма"]]
];

// фраза дня: привітання в новій країні > віха > пауза > фраза за етапом
function phrase(state, passed, pct, paused) {
  const day = Math.floor(Date.now() / 86400000);
  const pick = (arr) => arr[day % arr.length];
  const ar = state.arrived;
  if (ar && LOC[ar.cc] && Date.now() - ar.at < 36 * 3600 * 1000) return `${flag(ar.cc)} Вітаємо ${LOC[ar.cc]}`;
  if (MILESTONES[passed]) return MILESTONES[passed];
  if (paused) return pick(["Тут дні не рахуються", "Лічильник відпочиває"]);
  if (pct >= 100) return "Ліміт вичерпано, час виїжджати";
  const stage = PHRASES.find(([lim]) => pct < lim) || PHRASES[PHRASES.length - 1];
  return pick(stage[1]);
}

// ---------- віджет ----------
// Теми кольорів. Кольори підібрані в OKLCH: однакова світлота й насиченість, різні відтінки,
// фон трохи підфарбований у тон теми. ok -> warn -> danger — шкала "добре -> увага -> ліміт",
// protect — окремий колір для країни тимчасового захисту.
const THEMES = {
  forest: { name: "Ліс", bg: "#17211c", ok: "#75d78d", warn: "#edb345", danger: "#fe8b83", protect: "#e3a2f2" },
  sunset: { name: "Захід сонця", bg: "#241c18", ok: "#e9c769", warn: "#fc984c", danger: "#f97770", protect: "#8ed09c" },
  graphite: { name: "Графіт", bg: "#1c1c1c", ok: "#f2f2f2", warn: "#edb345", danger: "#fe8b83", protect: "#e3a2f2" },
  bordeaux: { name: "Бордо", bg: "#2a1216", ok: "#ecc69c", warn: "#ebbd57", danger: "#ff7c8a", protect: "#94cf9f" },
  mint: { name: "М'ята", bg: "#0c221c", ok: "#87e8bf", warn: "#e3d372", danger: "#fd8c7b", protect: "#f6b294" },
  lavender: { name: "Лаванда", bg: "#201528", ok: "#f4b2e5", warn: "#e9c769", danger: "#ff8880", protect: "#92e2b7" },
  desert: { name: "Пустеля", bg: "#281c13", ok: "#e3cfa5", warn: "#f49157", danger: "#f17264", protect: "#afc48b" },
  cream: { name: "Крем (світла)", bg: "#f4f0e6", fg: "#2b221a", ok: "#2d8949", warn: "#b77610", danger: "#cb4644", protect: "#9856a7" },
  gold: { name: "Чорне золото", bg: "#151410", ok: "#eccb61", warn: "#f99549", danger: "#fd736d", protect: "#dcd7c9" }
};
let PAL = THEMES.forest;
function setTheme(state) {
  // fg — колір тексту й напівпрозорих елементів (білий для темних тем, темний для світлої)
  PAL = Object.assign({ fg: "#ffffff" }, THEMES[state.theme] || THEMES.forest);
}

// ширина віджета (pt) за шириною екрана; віднімаємо бічні відступи
const MEDIUM_W = { 430: 364, 428: 364, 414: 360, 393: 338, 390: 338, 375: 321, 360: 329, 320: 292 };
const SMALL_W = { 430: 170, 428: 170, 414: 169, 393: 158, 390: 158, 375: 148, 360: 155, 320: 141 };
function contentWidth() {
  const sz = Device.screenSize();
  const sw = Math.round(Math.min(sz.width, sz.height));
  const small = config.widgetFamily === "small";
  const full = (small ? SMALL_W : MEDIUM_W)[sw] || Math.round(sw * (small ? 0.42 : 0.86));
  return full - 32;
}

function message(pct) {
  if (pct >= 100) return "Ліміт вичерпано, залиште ЄС";
  if (pct >= 85) return "Днів майже не лишилось, плануйте виїзд";
  if (pct >= 60) return "Позаду половина, перевірте маршрут";
  if (pct >= 45) return "Половина шляху, плануйте поїздку";
  if (pct >= 15) return "Часу ще багато";
  return "Тільки почали";
}

function addIcon(stack, name, size, color) {
  const sym = SFSymbol.named(name);
  if (!sym) return;
  sym.applyFont(Font.mediumSystemFont(size));
  const im = stack.addImage(sym.image);
  im.imageSize = new Size(size, size);
  im.tintColor = color;
}

// чип країни; поточна країна — з рамкою (оранжева, якщо ти поза країною захисту)
function addChip(parent, cc, n, { isCur, protect, warn }) {
  const c = parent.addStack();
  c.centerAlignContent();
  c.setPadding(4, 9, 4, 9);
  c.cornerRadius = 10;
  c.spacing = 4;
  c.backgroundColor = protect ? new Color(PAL.protect, 0.18) : new Color(PAL.fg, 0.08);
  const tint = protect ? new Color(PAL.protect) : warn && isCur ? new Color(PAL.warn) : new Color(PAL.fg, 0.8);
  if (isCur) {
    c.borderWidth = 1;
    c.borderColor = warn ? new Color(PAL.warn, 0.7) : new Color(PAL.fg, 0.35);
  }
  if (protect) addIcon(c, "shield.fill", 10, tint);
  const t = c.addText(`${flag(cc)} ${n} дн`);
  t.font = Font.mediumRoundedSystemFont(11);
  t.textColor = tint;
}

async function buildWidget(state) {
  setTheme(state);
  const passed = daysPassed(state);
  const left = TOTAL - passed;
  const pct = Math.round((passed / TOTAL) * 100);
  const paused = inProtectionToday(state);
  const accent = new Color(paused ? PAL.protect : pct >= 85 ? PAL.danger : pct >= 60 ? PAL.warn : PAL.ok);
  const secondary = new Color(PAL.fg, 0.55);
  const W = contentWidth();

  const w = new ListWidget();
  w.backgroundColor = new Color(PAL.bg);
  w.setPadding(16, 16, 14, 16);

  // заголовок
  const head = w.addStack();
  head.centerAlignContent();
  const t = head.addText(phrase(state, passed, pct, paused));
  t.font = Font.semiboldSystemFont(12);
  t.textColor = secondary;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.8;
  head.addSpacer();
  const p = head.addText(paused ? `ПАУЗА В ${state.protection}` : `${pct}%`);
  p.font = Font.semiboldSystemFont(12);
  p.textColor = paused ? new Color(PAL.protect) : secondary;

  w.addSpacer();

  // числа
  const row = w.addStack();
  row.bottomAlignContent();
  const big = row.addText(String(passed));
  big.font = Font.semiboldRoundedSystemFont(38);
  big.textColor = new Color(PAL.fg);
  row.addSpacer(4);
  const of = row.addText(`/ ${TOTAL} днів`);
  of.font = Font.mediumSystemFont(14);
  of.textColor = secondary;
  row.addSpacer();
  const l = row.addText(`ще ${left} дн`);
  l.font = Font.semiboldRoundedSystemFont(15);
  l.textColor = paused ? secondary : accent;

  w.addSpacer();

  // прогрес-бар із трьох сегментів по 30 днів (віхи), зі стеків без зображень
  const GAP = 3;
  const segW = (W - 2 * GAP) / 3;
  const bar = w.addStack();
  bar.size = new Size(W, 8);
  bar.spacing = GAP;
  for (let k = 0; k < 3; k++) {
    const seg = bar.addStack();
    seg.size = new Size(segW, 8);
    seg.cornerRadius = 4;
    seg.backgroundColor = new Color(PAL.fg, 0.14);
    const f = Math.min(1, Math.max(0, (passed - k * 30) / 30));
    if (f > 0) {
      const fill = seg.addStack();
      fill.size = new Size(Math.max(8, Math.round(segW * f)), 8);
      fill.cornerRadius = 4;
      fill.backgroundColor = accent;
    }
    seg.addSpacer();
  }

  w.addSpacer();

  // країни: країна захисту — окремий лічильник, решта — чипи (без дублювання)
  const cur = state.country;
  const all = countryDays(state);
  const maxOthers = state.protection ? 2 : 3;
  let others = all.filter(([cc]) => cc !== state.protection).slice(0, maxOthers);
  if (cur && cur !== state.protection && !others.some(([cc]) => cc === cur)) {
    others = others.slice(0, maxOthers - 1).concat([[cur, 0]]);
  }
  const protDays = (all.find(([cc]) => cc === state.protection) || [0, 0])[1];

  if (state.protection || others.length) {
    const chips = w.addStack();
    chips.spacing = 6;
    if (state.protection) {
      addChip(chips, state.protection, protDays, { isCur: cur === state.protection, protect: true, warn: false });
    }
    others.forEach(([cc, n]) =>
      addChip(chips, cc, n, { isCur: cc === cur, protect: false, warn: !!state.protection })
    );
  } else {
    const m = w.addText(message(pct));
    m.font = Font.systemFont(12);
    m.textColor = secondary;
  }

  w.refreshAfterDate = new Date(Date.now() + GEO_INTERVAL_MS);
  return w;
}

// ---------- меню (у застосунку) ----------
async function menu(state) {
  const a = new Alert();
  a.title = "ЄС: 90 днів";
  a.message = `Минуло днів: ${daysPassed(state)} / ${TOTAL}\nТема: ${(THEMES[state.theme] || THEMES.forest).name}\nТимчасовий захист: ${state.protection ? flag(state.protection) + " " + (COUNTRIES[state.protection] || state.protection) : "немає"}\nВизначено: ${flag(state.country)} ${state.country || "—"}`;
  a.addAction("Вказати, скільки днів минуло");
  a.addAction("Обрати країну тимчасового захисту");
  a.addAction("Оновити геолокацію зараз");
  a.addAction("Переглянути віджет");
  a.addAction("Додати минулі дні для країни");
  a.addAction("Скинути журнал країн");
  a.addAction("Завантажити тестові дані");
  a.addAction("Кольорова тема");
  a.addCancelAction("Закрити");
  return await a.presentSheet();
}

async function chooseCode(title) {
  const codes = Object.keys(COUNTRIES);
  const a = new Alert();
  a.title = title;
  codes.forEach((c) => a.addAction(`${flag(c)} ${COUNTRIES[c]}`));
  a.addCancelAction("Скасувати");
  const i = await a.presentSheet();
  return i >= 0 ? codes[i] : null;
}

async function pickCountry(state) {
  const codes = Object.keys(COUNTRIES);
  const a = new Alert();
  a.title = "Країна тимчасового захисту";
  a.message = "Необов’язково. Оберіть «Немає», якщо захисту немає.";
  a.addAction("Немає");
  codes.forEach((c) => a.addAction(`${flag(c)} ${COUNTRIES[c]}`));
  a.addCancelAction("Скасувати");
  const i = await a.presentSheet();
  if (i === 0) state.protection = null;
  else if (i > 0) state.protection = codes[i - 1];
}

// ---------- запуск ----------
const state = loadState();

// параметр віджета = швидка зміна лічильника
const param = (args.widgetParameter || "").trim();
if (/^\d{1,3}$/.test(param)) {
  // застосовуємо параметр лише коли він змінився, інакше він щодня "скидав" би лічильник
  if (state.lastParam !== param) {
    setDaysPassed(state, parseInt(param, 10));
    state.lastParam = param;
  }
}
if (state.baseDays == null || !state.baseDate) {
  // міграція зі старої версії (дата початку) або перший запуск
  if (state.start) {
    setDaysPassed(state, Math.floor((startOfDay(new Date()) - startOfDay(state.start)) / 86400000));
    delete state.start;
  } else {
    setDaysPassed(state, 0);
  }
}

if (config.runsInApp) {
  let i = await menu(state);
  while (i >= 0) {
    if (i === 0) {
      const q = new Alert();
      q.title = "Скільки днів уже минуло?";
      q.message = "Число з вашого лічильника, 0–90. Далі віджет додає +1 щодня.";
      q.addTextField("напр. 44", String(daysPassed(state)));
      q.addAction("Зберегти");
      q.addCancelAction("Скасувати");
      if ((await q.presentAlert()) === 0) {
        const n = parseInt(q.textFieldValue(0), 10);
        if (!isNaN(n)) setDaysPassed(state, n);
      }
    } else if (i === 1) {
      await pickCountry(state);
    } else if (i === 2) {
      await updateGeo(state, true);
    } else if (i === 3) {
      saveState(state);
      const pw = await buildWidget(state);
      await pw.presentMedium();
    } else if (i === 4) {
      const cc = await chooseCode("Яка країна?");
      if (cc) {
        const q = new Alert();
        q.title = `Днів уже проведено: ${COUNTRIES[cc]}`;
        q.message = "Це число додається до того, що віджет рахує сам.";
        q.addTextField("напр. 30", String((state.offsets || {})[cc] || 0));
        q.addAction("Зберегти");
        q.addCancelAction("Скасувати");
        if ((await q.presentAlert()) === 0) {
          const n = parseInt(q.textFieldValue(0), 10);
          if (!isNaN(n) && n >= 0) {
            state.offsets = state.offsets || {};
            state.offsets[cc] = n;
          }
        }
      }
    } else if (i === 5) {
      state.log = {};
      state.offsets = {};
    } else if (i === 6) {
      // тестові дані для перегляду дизайну
      setDaysPassed(state, 44);
      state.protection = "PL";
      state.country = "DE";
      state.log = {};
      state.offsets = { PL: 30, DE: 12, CZ: 2 };
      state.arrived = { cc: "DE", at: Date.now() };
    } else if (i === 7) {
      const keys = Object.keys(THEMES);
      const ta = new Alert();
      ta.title = "Кольорова тема";
      keys.forEach((k) => ta.addAction(THEMES[k].name));
      ta.addCancelAction("Скасувати");
      const ti = await ta.presentSheet();
      if (ti >= 0) state.theme = keys[ti];
    }
    saveState(state);
    i = await menu(state);
  }
  saveState(state);
} else {
  await updateGeo(state);
  saveState(state);
  const widget = await buildWidget(state);
  Script.setWidget(widget);
}
Script.complete();
