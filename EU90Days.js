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
  AT: "\u0410\u0432\u0441\u0442\u0440\u0456\u044f", BE: "\u0411\u0435\u043b\u044c\u0433\u0456\u044f", BG: "\u0411\u043e\u043b\u0433\u0430\u0440\u0456\u044f", HR: "\u0425\u043e\u0440\u0432\u0430\u0442\u0456\u044f", CY: "\u041a\u0456\u043f\u0440",
  CZ: "\u0427\u0435\u0445\u0456\u044f", DK: "\u0414\u0430\u043d\u0456\u044f", EE: "\u0415\u0441\u0442\u043e\u043d\u0456\u044f", FI: "\u0424\u0456\u043d\u043b\u044f\u043d\u0434\u0456\u044f", FR: "\u0424\u0440\u0430\u043d\u0446\u0456\u044f",
  DE: "\u041d\u0456\u043c\u0435\u0447\u0447\u0438\u043d\u0430", GR: "\u0413\u0440\u0435\u0446\u0456\u044f", HU: "\u0423\u0433\u043e\u0440\u0449\u0438\u043d\u0430", IE: "\u0406\u0440\u043b\u0430\u043d\u0434\u0456\u044f", IT: "\u0406\u0442\u0430\u043b\u0456\u044f",
  LV: "\u041b\u0430\u0442\u0432\u0456\u044f", LT: "\u041b\u0438\u0442\u0432\u0430", LU: "\u041b\u044e\u043a\u0441\u0435\u043c\u0431\u0443\u0440\u0433", MT: "\u041c\u0430\u043b\u044c\u0442\u0430", NL: "\u041d\u0456\u0434\u0435\u0440\u043b\u0430\u043d\u0434\u0438",
  PL: "\u041f\u043e\u043b\u044c\u0449\u0430", PT: "\u041f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u0456\u044f", RO: "\u0420\u0443\u043c\u0443\u043d\u0456\u044f", SK: "\u0421\u043b\u043e\u0432\u0430\u0447\u0447\u0438\u043d\u0430", SI: "\u0421\u043b\u043e\u0432\u0435\u043d\u0456\u044f",
  ES: "\u0406\u0441\u043f\u0430\u043d\u0456\u044f", SE: "\u0428\u0432\u0435\u0446\u0456\u044f", NO: "\u041d\u043e\u0440\u0432\u0435\u0433\u0456\u044f", CH: "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0456\u044f", IS: "\u0406\u0441\u043b\u0430\u043d\u0434\u0456\u044f", LI: "\u041b\u0456\u0445\u0442\u0435\u043d\u0448\u0442\u0435\u0439\u043d"
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
    : "\u{1f30d}";

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
  AT: "\u0432 \u0410\u0432\u0441\u0442\u0440\u0456\u0457", BE: "\u0432 \u0411\u0435\u043b\u044c\u0433\u0456\u0457", BG: "\u0443 \u0411\u043e\u043b\u0433\u0430\u0440\u0456\u0457", HR: "\u0443 \u0425\u043e\u0440\u0432\u0430\u0442\u0456\u0457", CY: "\u043d\u0430 \u041a\u0456\u043f\u0440\u0456",
  CZ: "\u0432 \u0427\u0435\u0445\u0456\u0457", DK: "\u0443 \u0414\u0430\u043d\u0456\u0457", EE: "\u0432 \u0415\u0441\u0442\u043e\u043d\u0456\u0457", FI: "\u0443 \u0424\u0456\u043d\u043b\u044f\u043d\u0434\u0456\u0457", FR: "\u0443 \u0424\u0440\u0430\u043d\u0446\u0456\u0457",
  DE: "\u0432 \u041d\u0456\u043c\u0435\u0447\u0447\u0438\u043d\u0456", GR: "\u0443 \u0413\u0440\u0435\u0446\u0456\u0457", HU: "\u0432 \u0423\u0433\u043e\u0440\u0449\u0438\u043d\u0456", IE: "\u0432 \u0406\u0440\u043b\u0430\u043d\u0434\u0456\u0457", IT: "\u0432 \u0406\u0442\u0430\u043b\u0456\u0457",
  LV: "\u0443 \u041b\u0430\u0442\u0432\u0456\u0457", LT: "\u0443 \u041b\u0438\u0442\u0432\u0456", LU: "\u0443 \u041b\u044e\u043a\u0441\u0435\u043c\u0431\u0443\u0440\u0437\u0456", MT: "\u043d\u0430 \u041c\u0430\u043b\u044c\u0442\u0456", NL: "\u0443 \u041d\u0456\u0434\u0435\u0440\u043b\u0430\u043d\u0434\u0430\u0445",
  PL: "\u0443 \u041f\u043e\u043b\u044c\u0449\u0456", PT: "\u0443 \u041f\u043e\u0440\u0442\u0443\u0433\u0430\u043b\u0456\u0457", RO: "\u0443 \u0420\u0443\u043c\u0443\u043d\u0456\u0457", SK: "\u0443 \u0421\u043b\u043e\u0432\u0430\u0447\u0447\u0438\u043d\u0456", SI: "\u0443 \u0421\u043b\u043e\u0432\u0435\u043d\u0456\u0457",
  ES: "\u0432 \u0406\u0441\u043f\u0430\u043d\u0456\u0457", SE: "\u0443 \u0428\u0432\u0435\u0446\u0456\u0457", NO: "\u0443 \u041d\u043e\u0440\u0432\u0435\u0433\u0456\u0457", CH: "\u0443 \u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0456\u0457", IS: "\u0432 \u0406\u0441\u043b\u0430\u043d\u0434\u0456\u0457", LI: "\u0443 \u041b\u0456\u0445\u0442\u0435\u043d\u0448\u0442\u0435\u0439\u043d\u0456"
};
const MILESTONES = { 30: "\u041f\u0435\u0440\u0448\u0430 \u0442\u0440\u0435\u0442\u0438\u043d\u0430 \u043f\u043e\u0437\u0430\u0434\u0443", 45: "\u0420\u0456\u0432\u043d\u043e \u043f\u043e\u043b\u043e\u0432\u0438\u043d\u0430 \u0448\u043b\u044f\u0445\u0443", 60: "\u0414\u0432\u0456 \u0442\u0440\u0435\u0442\u0438\u043d\u0438 \u043f\u043e\u0437\u0430\u0434\u0443" };
const PHRASES = [
  [15, ["\u041f\u043e\u0447\u0438\u043d\u0430\u0454\u043c\u043e \u0431\u0435\u0437 \u043f\u043e\u0441\u043f\u0456\u0445\u0443", "\u0404 \u0437 \u0447\u043e\u0433\u043e \u043e\u0431\u0438\u0440\u0430\u0442\u0438 \u043c\u0430\u0440\u0448\u0440\u0443\u0442", "\u0423\u0441\u0435 \u0442\u0456\u043b\u044c\u043a\u0438 \u043f\u043e\u0447\u0438\u043d\u0430\u0454\u0442\u044c\u0441\u044f"]],
  [45, ["\u0420\u0430\u0445\u0443\u0454\u043c\u043e \u0434\u043d\u0456, \u0430 \u043d\u0435 \u043d\u0435\u0440\u0432\u0438", "\u0422\u0435\u043c\u043f \u0440\u0456\u0432\u043d\u0438\u0439, \u0442\u0430\u043a \u0442\u0440\u0438\u043c\u0430\u0442\u0438", "\u0427\u0430\u0441\u0443 \u0449\u0435 \u0432\u0434\u043e\u0441\u0442\u0430\u043b\u044c"]],
  [60, ["\u0412\u0436\u0435 \u043c\u0430\u0439\u0436\u0435 \u043f\u043e\u043b\u043e\u0432\u0438\u043d\u0430", "\u0421\u0435\u0440\u0435\u0434\u0438\u043d\u0430 \u0448\u043b\u044f\u0445\u0443, \u043c\u043e\u0436\u043d\u0430 \u0432\u0438\u0434\u0438\u0445\u043d\u0443\u0442\u0438", "\u0427\u0430\u0441 \u043f\u043e\u0433\u043b\u044f\u043d\u0443\u0442\u0438 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443"]],
  [85, ["\u041f\u043b\u0430\u043d\u0443\u0454\u043c\u043e \u043d\u0430\u0441\u0442\u0443\u043f\u043d\u0438\u0439 \u043a\u0440\u043e\u043a", "\u041f\u043e\u0437\u0430\u0434\u0443 \u0431\u0456\u043b\u044c\u0448\u0430 \u0447\u0430\u0441\u0442\u0438\u043d\u0430", "\u0427\u0430\u0441 \u0437\u0432\u0456\u0440\u0438\u0442\u0438 \u043c\u0430\u0440\u0448\u0440\u0443\u0442"]],
  [100, ["\u041b\u0438\u0448\u0438\u043b\u043e\u0441\u044c \u0437\u043e\u0432\u0441\u0456\u043c \u0442\u0440\u043e\u0445\u0438", "\u041f\u043e\u0440\u0430 \u0437\u0431\u0438\u0440\u0430\u0442\u0438 \u0432\u0430\u043b\u0456\u0437\u0443", "\u0424\u0456\u043d\u0456\u0448\u043d\u0430 \u043f\u0440\u044f\u043c\u0430"]]
];

// фраза дня: привітання в новій країні > віха > пауза > фраза за етапом
function phrase(state, passed, pct, paused) {
  const day = Math.floor(Date.now() / 86400000);
  const pick = (arr) => arr[day % arr.length];
  const ar = state.arrived;
  if (ar && LOC[ar.cc] && Date.now() - ar.at < 36 * 3600 * 1000) return `${flag(ar.cc)} \u0412\u0456\u0442\u0430\u0454\u043c\u043e ${LOC[ar.cc]}`;
  if (MILESTONES[passed]) return MILESTONES[passed];
  if (paused) return pick(["\u0422\u0443\u0442 \u0434\u043d\u0456 \u043d\u0435 \u0440\u0430\u0445\u0443\u044e\u0442\u044c\u0441\u044f", "\u041b\u0456\u0447\u0438\u043b\u044c\u043d\u0438\u043a \u0432\u0456\u0434\u043f\u043e\u0447\u0438\u0432\u0430\u0454"]);
  if (pct >= 100) return "\u041b\u0456\u043c\u0456\u0442 \u0432\u0438\u0447\u0435\u0440\u043f\u0430\u043d\u043e, \u0447\u0430\u0441 \u0432\u0438\u0457\u0436\u0434\u0436\u0430\u0442\u0438";
  const stage = PHRASES.find(([lim]) => pct < lim) || PHRASES[PHRASES.length - 1];
  return pick(stage[1]);
}

// ---------- віджет ----------
// Теми кольорів. Кольори підібрані в OKLCH: однакова світлота й насиченість, різні відтінки,
// фон трохи підфарбований у тон теми. ok -> warn -> danger — шкала "добре -> увага -> ліміт",
// protect — окремий колір для країни тимчасового захисту.
const THEMES = {
  forest: { name: "\u041b\u0456\u0441", bg: "#17211c", ok: "#75d78d", warn: "#edb345", danger: "#fe8b83", protect: "#e3a2f2" },
  sunset: { name: "\u0417\u0430\u0445\u0456\u0434 \u0441\u043e\u043d\u0446\u044f", bg: "#241c18", ok: "#e9c769", warn: "#fc984c", danger: "#f97770", protect: "#8ed09c" },
  graphite: { name: "\u0413\u0440\u0430\u0444\u0456\u0442", bg: "#1c1c1c", ok: "#f2f2f2", warn: "#edb345", danger: "#fe8b83", protect: "#e3a2f2" },
  bordeaux: { name: "\u0411\u043e\u0440\u0434\u043e", bg: "#2a1216", ok: "#ecc69c", warn: "#ebbd57", danger: "#ff7c8a", protect: "#94cf9f" },
  mint: { name: "\u041c'\u044f\u0442\u0430", bg: "#0c221c", ok: "#87e8bf", warn: "#e3d372", danger: "#fd8c7b", protect: "#f6b294" },
  lavender: { name: "\u041b\u0430\u0432\u0430\u043d\u0434\u0430", bg: "#201528", ok: "#f4b2e5", warn: "#e9c769", danger: "#ff8880", protect: "#92e2b7" },
  desert: { name: "\u041f\u0443\u0441\u0442\u0435\u043b\u044f", bg: "#281c13", ok: "#e3cfa5", warn: "#f49157", danger: "#f17264", protect: "#afc48b" },
  cream: { name: "\u041a\u0440\u0435\u043c (\u0441\u0432\u0456\u0442\u043b\u0430)", bg: "#f4f0e6", fg: "#2b221a", ok: "#2d8949", warn: "#b77610", danger: "#cb4644", protect: "#9856a7" },
  gold: { name: "\u0427\u043e\u0440\u043d\u0435 \u0437\u043e\u043b\u043e\u0442\u043e", bg: "#151410", ok: "#eccb61", warn: "#f99549", danger: "#fd736d", protect: "#dcd7c9" }
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
  if (pct >= 100) return "\u041b\u0456\u043c\u0456\u0442 \u0432\u0438\u0447\u0435\u0440\u043f\u0430\u043d\u043e, \u0437\u0430\u043b\u0438\u0448\u0442\u0435 \u0404\u0421";
  if (pct >= 85) return "\u0414\u043d\u0456\u0432 \u043c\u0430\u0439\u0436\u0435 \u043d\u0435 \u043b\u0438\u0448\u0438\u043b\u043e\u0441\u044c, \u043f\u043b\u0430\u043d\u0443\u0439\u0442\u0435 \u0432\u0438\u0457\u0437\u0434";
  if (pct >= 60) return "\u041f\u043e\u0437\u0430\u0434\u0443 \u043f\u043e\u043b\u043e\u0432\u0438\u043d\u0430, \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u043c\u0430\u0440\u0448\u0440\u0443\u0442";
  if (pct >= 45) return "\u041f\u043e\u043b\u043e\u0432\u0438\u043d\u0430 \u0448\u043b\u044f\u0445\u0443, \u043f\u043b\u0430\u043d\u0443\u0439\u0442\u0435 \u043f\u043e\u0457\u0437\u0434\u043a\u0443";
  if (pct >= 15) return "\u0427\u0430\u0441\u0443 \u0449\u0435 \u0431\u0430\u0433\u0430\u0442\u043e";
  return "\u0422\u0456\u043b\u044c\u043a\u0438 \u043f\u043e\u0447\u0430\u043b\u0438";
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
  const t = c.addText(`${flag(cc)} ${n} \u0434\u043d`);
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
  const p = head.addText(paused ? `\u041f\u0410\u0423\u0417\u0410 \u0412 ${state.protection}` : `${pct}%`);
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
  const of = row.addText(`/ ${TOTAL} \u0434\u043d\u0456\u0432`);
  of.font = Font.mediumSystemFont(14);
  of.textColor = secondary;
  row.addSpacer();
  const l = row.addText(`\u0449\u0435 ${left} \u0434\u043d`);
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
  a.title = "\u0404\u0421: 90 \u0434\u043d\u0456\u0432";
  a.message = `\u041c\u0438\u043d\u0443\u043b\u043e \u0434\u043d\u0456\u0432: ${daysPassed(state)} / ${TOTAL}\n\u0422\u0435\u043c\u0430: ${(THEMES[state.theme] || THEMES.forest).name}\n\u0422\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u0438\u0439 \u0437\u0430\u0445\u0438\u0441\u0442: ${state.protection ? flag(state.protection) + " " + (COUNTRIES[state.protection] || state.protection) : "\u043d\u0435\u043c\u0430\u0454"}\n\u0412\u0438\u0437\u043d\u0430\u0447\u0435\u043d\u043e: ${flag(state.country)} ${state.country || "\u2014"}`;
  a.addAction("\u0412\u043a\u0430\u0437\u0430\u0442\u0438, \u0441\u043a\u0456\u043b\u044c\u043a\u0438 \u0434\u043d\u0456\u0432 \u043c\u0438\u043d\u0443\u043b\u043e");
  a.addAction("\u041e\u0431\u0440\u0430\u0442\u0438 \u043a\u0440\u0430\u0457\u043d\u0443 \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e\u0433\u043e \u0437\u0430\u0445\u0438\u0441\u0442\u0443");
  a.addAction("\u041e\u043d\u043e\u0432\u0438\u0442\u0438 \u0433\u0435\u043e\u043b\u043e\u043a\u0430\u0446\u0456\u044e \u0437\u0430\u0440\u0430\u0437");
  a.addAction("\u041f\u0435\u0440\u0435\u0433\u043b\u044f\u043d\u0443\u0442\u0438 \u0432\u0456\u0434\u0436\u0435\u0442");
  a.addAction("\u0414\u043e\u0434\u0430\u0442\u0438 \u043c\u0438\u043d\u0443\u043b\u0456 \u0434\u043d\u0456 \u0434\u043b\u044f \u043a\u0440\u0430\u0457\u043d\u0438");
  a.addAction("\u0421\u043a\u0438\u043d\u0443\u0442\u0438 \u0436\u0443\u0440\u043d\u0430\u043b \u043a\u0440\u0430\u0457\u043d");
  a.addAction("\u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0442\u0435\u0441\u0442\u043e\u0432\u0456 \u0434\u0430\u043d\u0456");
  a.addAction("\u041a\u043e\u043b\u044c\u043e\u0440\u043e\u0432\u0430 \u0442\u0435\u043c\u0430");
  a.addCancelAction("\u0417\u0430\u043a\u0440\u0438\u0442\u0438");
  return await a.presentSheet();
}

async function chooseCode(title) {
  const codes = Object.keys(COUNTRIES);
  const a = new Alert();
  a.title = title;
  codes.forEach((c) => a.addAction(`${flag(c)} ${COUNTRIES[c]}`));
  a.addCancelAction("\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438");
  const i = await a.presentSheet();
  return i >= 0 ? codes[i] : null;
}

async function pickCountry(state) {
  const codes = Object.keys(COUNTRIES);
  const a = new Alert();
  a.title = "\u041a\u0440\u0430\u0457\u043d\u0430 \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e\u0433\u043e \u0437\u0430\u0445\u0438\u0441\u0442\u0443";
  a.message = "\u041d\u0435\u043e\u0431\u043e\u0432\u2019\u044f\u0437\u043a\u043e\u0432\u043e. \u041e\u0431\u0435\u0440\u0456\u0442\u044c \u00ab\u041d\u0435\u043c\u0430\u0454\u00bb, \u044f\u043a\u0449\u043e \u0437\u0430\u0445\u0438\u0441\u0442\u0443 \u043d\u0435\u043c\u0430\u0454.";
  a.addAction("\u041d\u0435\u043c\u0430\u0454");
  codes.forEach((c) => a.addAction(`${flag(c)} ${COUNTRIES[c]}`));
  a.addCancelAction("\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438");
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
      q.title = "\u0421\u043a\u0456\u043b\u044c\u043a\u0438 \u0434\u043d\u0456\u0432 \u0443\u0436\u0435 \u043c\u0438\u043d\u0443\u043b\u043e?";
      q.message = "\u0427\u0438\u0441\u043b\u043e \u0437 \u0432\u0430\u0448\u043e\u0433\u043e \u043b\u0456\u0447\u0438\u043b\u044c\u043d\u0438\u043a\u0430, 0\u201390. \u0414\u0430\u043b\u0456 \u0432\u0456\u0434\u0436\u0435\u0442 \u0434\u043e\u0434\u0430\u0454 +1 \u0449\u043e\u0434\u043d\u044f.";
      q.addTextField("\u043d\u0430\u043f\u0440. 44", String(daysPassed(state)));
      q.addAction("\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438");
      q.addCancelAction("\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438");
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
      const cc = await chooseCode("\u042f\u043a\u0430 \u043a\u0440\u0430\u0457\u043d\u0430?");
      if (cc) {
        const q = new Alert();
        q.title = `\u0414\u043d\u0456\u0432 \u0443\u0436\u0435 \u043f\u0440\u043e\u0432\u0435\u0434\u0435\u043d\u043e: ${COUNTRIES[cc]}`;
        q.message = "\u0426\u0435 \u0447\u0438\u0441\u043b\u043e \u0434\u043e\u0434\u0430\u0454\u0442\u044c\u0441\u044f \u0434\u043e \u0442\u043e\u0433\u043e, \u0449\u043e \u0432\u0456\u0434\u0436\u0435\u0442 \u0440\u0430\u0445\u0443\u0454 \u0441\u0430\u043c.";
        q.addTextField("\u043d\u0430\u043f\u0440. 30", String((state.offsets || {})[cc] || 0));
        q.addAction("\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438");
        q.addCancelAction("\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438");
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
      ta.title = "\u041a\u043e\u043b\u044c\u043e\u0440\u043e\u0432\u0430 \u0442\u0435\u043c\u0430";
      keys.forEach((k) => ta.addAction(THEMES[k].name));
      ta.addCancelAction("\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438");
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
