// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: calendar-check;
// EU 90 Days — Scriptable widget
// Рахує правило 90/180: у будь-якому 180-денному вікні можна бути в Шенгені не більше 90 днів.
// Дні задаються перебуваннями (країна + дати), далі їх доповнює геолокація двічі на день.
// Запуск усередині застосунку Scriptable відкриває меню налаштувань.

const VERSION = "1.1.1"; // версія скрипта: збільшуйте при кожній зміні
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
  return { stays: [], protection: null, country: null, lastCheck: 0 };
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

// ---------- перебування і правило 90/180 ----------
const WINDOW = 180;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function parseDay(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDay(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}
function fmtFull(d) {
  return `${fmtDay(d)}.${d.getFullYear()}`;
}

function pauseOn(state) {
  return !!state.protection;
}
// день зараховується, якщо в ньому була хоч одна країна, крім випадку "лише країна захисту"
function countsToward(state, arr) {
  if (!arr || !arr.length) return false;
  return !(pauseOn(state) && arr.every((c) => c === state.protection));
}

// карта днів: "РРРР-ММ-ДД" -> [країни]; береться з перебувань і з журналу геолокації
function dayMap(state) {
  const map = {};
  const add = (key, cc) => {
    const a = map[key] || (map[key] = []);
    if (!a.includes(cc)) a.push(cc);
  };
  (state.stays || []).forEach((s) => {
    let d = parseDay(s.from);
    const end = parseDay(s.to);
    for (let i = 0; i < 800 && d <= end; i++) {
      add(isoDay(d), s.cc);
      d = addDays(d, 1);
    }
  });
  Object.entries(state.log || {}).forEach(([k, arr]) => arr.forEach((cc) => add(k, cc)));
  return map;
}

// скільки днів використано у 180-денному вікні, що закінчується датою T
function usedOn(state, map, T) {
  let n = 0;
  for (let i = 0; i < WINDOW; i++) {
    if (countsToward(state, map[isoDay(addDays(T, -i))])) n++;
  }
  return n;
}

// used — використано днів; left — скільки ще днів можна лишитись безперервно (після сьогодні);
// exit — остання дата, до якої можна лишатись (null, якщо ліміт уже перевищено)
function summary(state) {
  const map = dayMap(state);
  const today = startOfDay(new Date());
  const used = usedOn(state, map, today);
  let last = null;
  for (let d = 0; d <= WINDOW + TOTAL; d++) {
    const T = addDays(today, d);
    let n = 0;
    for (let i = 0; i < WINDOW; i++) {
      const k = addDays(T, -i);
      // сьогодні й майбутні дні вважаємо проведеними в Шенгені
      if (k >= today || countsToward(state, map[isoDay(k)])) n++;
    }
    if (n <= TOTAL) last = d;
    else break;
  }
  return { map, used, left: last == null ? 0 : last, exit: last == null ? null : addDays(today, last) };
}

// дні по країнах у поточному 180-денному вікні
function countryDays(state, map) {
  const today = startOfDay(new Date());
  const res = {};
  for (let i = 0; i < WINDOW; i++) {
    const arr = map[isoDay(addDays(today, -i))];
    if (arr) arr.forEach((cc) => (res[cc] = (res[cc] || 0) + 1));
  }
  return Object.entries(res).sort((a, b) => b[1] - a[1]);
}

// чи був сьогодні лише в країні захисту (тоді лічильник стоїть на паузі)
function inProtectionToday(state, map) {
  if (!pauseOn(state)) return false;
  const arr = map[isoDay(new Date())] || [];
  return arr.length > 0 && arr.every((c) => c === state.protection);
}

// чи є дані користувача (перебування, журнал геолокації або обрана країна захисту)
function hasUserData(state) {
  return (state.stays || []).length > 0 || Object.keys(state.log || {}).length > 0 || !!state.protection;
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

// ---------- зайчик із символів ----------
const BUNNY = {
  idle: ["(\\_/)", "(o.o)"],
  hop: ["(\\_/)", "(^.^)"],
  sleep: ["(\\_/)", "(-.-)"],
  alert: ["(\\_/)", "(O.O)"],
  limit: ["(\\_/)", "(>.<)"],
  wave: ["(\\_/)", "(^o^)/"]
};
// поза залежить від стану; "idle" і "hop" чергуються з кожним оновленням віджета (блоки по 10 хвилин)
function bunnyPose(state, pct, paused) {
  const ar = state.arrived;
  if (ar && Date.now() - ar.at < 36 * 3600 * 1000) return "wave";
  if (paused) return "sleep";
  if (pct >= 100) return "limit";
  if (pct >= 85) return "alert";
  return Math.floor(Date.now() / (10 * 60 * 1000)) % 2 ? "hop" : "idle";
}

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
  const sm = summary(state);
  const passed = Math.min(TOTAL, sm.used);
  const left = sm.left;
  const pct = Math.round((passed / TOTAL) * 100);
  const paused = inProtectionToday(state, sm.map);
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
  const p = head.addText(paused ? `ПАУЗА В ${state.protection}` : sm.exit ? `до ${fmtDay(sm.exit)}` : "ЛІМІТ");
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

  // зайчик стоїть над баром там, де закінчується заповнення (рухається разом із прогресом)
  if (config.widgetFamily !== "small") {
    const pose = bunnyPose(state, pct, paused);
    const zone = w.addStack();
    zone.bottomAlignContent();
    const bx = Math.round((W - 30) * (passed / TOTAL));
    if (bx > 0) zone.addSpacer(bx);
    const bunny = zone.addStack();
    bunny.layoutVertically();
    bunny.setPadding(0, 0, pose === "hop" ? 4 : 0, 0);
    BUNNY[pose].forEach((line) => {
      const bt = bunny.addText(line);
      bt.font = Font.regularMonospacedSystemFont(8);
      bt.textColor = new Color(PAL.fg, 0.75);
    });
    zone.addSpacer();
    w.addSpacer(2);
  }

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
  const all = countryDays(state, sm.map);
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

  // просимо iOS оновлювати віджет раз на 15 хвилин (геолокація при цьому запитується не частіше, ніж раз на 12 годин)
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// діагностика: які дні є в даних і чи зараховуються до 90/180
async function showDebug(state) {
  const map = dayMap(state);
  const today = startOfDay(new Date());
  const lines = [
    `версія=${VERSION}`,
    `захист=${state.protection || "немає"}, пауза=${pauseOn(state)}`,
    `використано=${usedOn(state, map, today)}`
  ];
  for (let i = 0; i < WINDOW; i++) {
    const k = isoDay(addDays(today, -i));
    const arr = map[k];
    if (arr) lines.push(`${k.slice(5)}: ${arr.join("+")} ${countsToward(state, arr) ? "✓" : "–"}`);
  }
  const a = new Alert();
  a.title = "Діагностика";
  a.message = lines.join("\n");
  a.addAction("OK");
  await a.presentAlert();
}
// ---------- меню (у застосунку) ----------
async function menu(state) {
  const sm = summary(state);
  const a = new Alert();
  a.title = "ЄС: правило 90/180";
  a.message = `Версія: ${VERSION}\nВикористано: ${Math.min(TOTAL, sm.used)} із ${TOTAL} днів\nМожна лишатись до: ${sm.exit ? fmtFull(sm.exit) : "ліміт вичерпано"}\nТема: ${(THEMES[state.theme] || THEMES.forest).name}\nТимчасовий захист: ${state.protection ? flag(state.protection) + " " + (COUNTRIES[state.protection] || state.protection) : "немає"}\nВизначено: ${flag(state.country)} ${state.country || "—"}`;
  const items = [
    ["stay", "Додати перебування"],
    ["stays", "Перебування (перегляд, видалення)"],
    ["protect", "Обрати країну тимчасового захисту"],
    ["geo", "Оновити геолокацію зараз"],
    ["preview", "Переглянути віджет"],
    ["debug", "Діагностика (журнал днів)"],
    ["clear", "Очистити всі дані"]
  ];
  // тестові дані доступні лише коли даних користувача немає, щоб їх не затерти
  if (!hasUserData(state)) items.push(["test", "Завантажити тестові дані"]);
  items.push(["theme", "Кольорова тема"]);
  items.forEach(([, label]) => a.addAction(label));
  a.addCancelAction("Закрити");
  const i = await a.presentSheet();
  return i >= 0 ? items[i][0] : null;
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

// додати перебування: країна, дата в'їзду, дата виїзду (обидва дні рахуються)
async function addStay(state) {
  const cc = await chooseCode("Країна перебування");
  if (!cc) return;
  let from, to;
  try {
    const dp = new DatePicker();
    dp.initialDate = addDays(startOfDay(new Date()), -30);
    from = await dp.pickDate();
  } catch (e) {
    return;
  }
  const q = new Alert();
  q.title = "Дата виїзду";
  q.message = "Останній день перебування. День в'їзду й день виїзду рахуються.";
  q.addAction("Сьогодні");
  q.addAction("Обрати дату");
  q.addCancelAction("Скасувати");
  const r = await q.presentSheet();
  if (r < 0) return;
  to = startOfDay(new Date());
  if (r === 1) {
    try {
      const dp2 = new DatePicker();
      dp2.initialDate = from;
      to = await dp2.pickDate();
    } catch (e) {
      return;
    }
  }
  from = startOfDay(from);
  to = startOfDay(to);
  if (to < from) [from, to] = [to, from];
  state.stays = state.stays || [];
  state.stays.push({ cc, from: isoDay(from), to: isoDay(to) });
}

// перегляд і видалення перебувань
async function manageStays(state) {
  const list = (state.stays || []).slice().sort((x, y) => (x.from < y.from ? 1 : -1));
  const a = new Alert();
  if (!list.length) {
    a.title = "Перебувань ще немає";
    a.addAction("Гаразд");
    await a.present();
    return;
  }
  a.title = "Перебування";
  a.message = "Оберіть запис, щоб видалити його.";
  list.forEach((s) =>
    a.addAction(`${flag(s.cc)} ${COUNTRIES[s.cc] || s.cc}: ${fmtFull(parseDay(s.from))} – ${fmtFull(parseDay(s.to))}`)
  );
  a.addCancelAction("Назад");
  const i = await a.presentSheet();
  if (i < 0) return;
  const c = new Alert();
  c.title = "Видалити перебування?";
  c.addDestructiveAction("Видалити");
  c.addCancelAction("Скасувати");
  if ((await c.presentAlert()) === 0) state.stays = state.stays.filter((s) => s !== list[i]);
}

// ---------- запуск ----------
const state = loadState();

// міграція зі старої версії (лічильник "скільки днів минуло") на перебування
if (state.baseDays != null || state.baseDate || state.start || state.offsets) {
  state.stays = state.stays || [];
  if (state.baseDays > 0 && state.baseDate) {
    const base = startOfDay(state.baseDate);
    state.stays.push({ cc: "EU", from: isoDay(addDays(base, -(state.baseDays - 1))), to: isoDay(base) });
  }
  delete state.baseDays;
  delete state.baseDate;
  delete state.start;
  delete state.offsets;
  delete state.lastParam;
}
state.stays = state.stays || [];

// застарілий прапорець старих версій, який міг вимикати паузу; тепер пауза залежить лише від країни захисту
delete state.pauseInProtection;

if (config.runsInApp) {
  let id = await menu(state);
  while (id) {
    if (id === "stay") {
      await addStay(state);
    } else if (id === "stays") {
      await manageStays(state);
    } else if (id === "protect") {
      await pickCountry(state);
    } else if (id === "geo") {
      await updateGeo(state, true);
    } else if (id === "preview") {
      saveState(state);
      const pw = await buildWidget(state);
      await pw.presentMedium();
    } else if (id === "debug") {
      await showDebug(state);
    } else if (id === "clear") {
      const c = new Alert();
      c.title = "Очистити всі дані?";
      c.message = "Буде видалено перебування, журнал геолокації й обрану країну захисту.";
      c.addDestructiveAction("Очистити");
      c.addCancelAction("Скасувати");
      if ((await c.presentAlert()) === 0) {
        state.stays = [];
        state.log = {};
        state.protection = null;
        state.country = null;
        delete state.arrived;
      }
    } else if (id === "test") {
      // тестові дані для перегляду дизайну; ніколи не перезаписують дані користувача
      if (hasUserData(state)) {
        const g = new Alert();
        g.title = "Тестові дані не завантажено";
        g.message = "Є ваші дані. Щоб їх не затерти, тестові дані доступні лише на порожньому стані.";
        g.addAction("Гаразд");
        await g.present();
        saveState(state);
        id = await menu(state);
        continue;
      }
      const t = startOfDay(new Date());
      const S = (cc, a, b) => ({ cc, from: isoDay(addDays(t, -a)), to: isoDay(addDays(t, -b)) });
      state.stays = [S("DE", 69, 31), S("CZ", 30, 29), S("PL", 28, 3), S("AT", 2, 1), S("DE", 0, 0)];
      state.protection = "PL";
      state.country = "DE";
      state.log = {};
      state.arrived = { cc: "DE", at: Date.now() };
    } else if (id === "theme") {
      const keys = Object.keys(THEMES);
      const ta = new Alert();
      ta.title = "Кольорова тема";
      keys.forEach((k) => ta.addAction(THEMES[k].name));
      ta.addCancelAction("Скасувати");
      const ti = await ta.presentSheet();
      if (ti >= 0) state.theme = keys[ti];
    }
    saveState(state);
    id = await menu(state);
  }
  saveState(state);
} else {
  await updateGeo(state);
  saveState(state);
  const widget = await buildWidget(state);
  Script.setWidget(widget);
}
Script.complete();
