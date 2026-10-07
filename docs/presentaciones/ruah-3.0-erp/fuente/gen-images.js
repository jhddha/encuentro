// Genera las ilustraciones de la presentación (HTML + SVG -> PNG con Playwright)
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fa = require("react-icons/fa6");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "img");
fs.mkdirSync(OUT, { recursive: true });

const ic = (name, color = "#fff", size = 40) =>
  renderToStaticMarkup(React.createElement(fa[name], { color, size }));

const C = {
  navy: "#1E3A5F", deep: "#0F2238", ice: "#E6EDF5", gold: "#E0A526",
  teal: "#0E7C86", violet: "#6B4FA0", orange: "#D9822B", steel: "#4F6D8A",
  green: "#2E8B57", amber: "#C98A0B", gray: "#80868F", ink: "#1A1D21",
};

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;background:transparent}
.abs{position:absolute}
`;

// Mansión estilizada (SVG propio)
const mansion = (w = 260, fill = "#fff", accent = C.gold) => `
<svg width="${w}" viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M130 8 L150 30 L110 30 Z" fill="${accent}"/>
  <rect x="127" y="0" width="6" height="14" fill="${accent}"/>
  <path d="M20 78 L130 30 L240 78 Z" fill="${fill}"/>
  <rect x="30" y="80" width="200" height="12" rx="2" fill="${fill}"/>
  ${[44, 78, 112, 146, 180, 208].map(x => `<rect x="${x}" y="96" width="10" height="70" rx="2" fill="${fill}" opacity=".92"/>`).join("")}
  <rect x="116" y="120" width="28" height="46" rx="14" fill="${accent}"/>
  <rect x="20" y="168" width="220" height="12" rx="2" fill="${fill}"/>
  <rect x="8" y="182" width="244" height="12" rx="2" fill="${fill}" opacity=".8"/>
  <circle cx="130" cy="60" r="9" fill="${accent}"/>
</svg>`;

// ---------- 1. Hero (portada) ----------
function heroHtml() {
  const W = 1200, H = 1100, cx = 600, cy = 560;
  const nodes = [
    ["FaCalculator", C.navy], ["FaCashRegister", C.green], ["FaPeopleRoof", C.teal],
    ["FaGraduationCap", C.violet], ["FaMugHot", C.orange], ["FaHandHoldingHeart", C.orange],
    ["FaDoorOpen", C.violet], ["FaFileInvoiceDollar", C.steel], ["FaIdBadge", C.steel],
  ];
  const R = 430;
  let lines = "", dots = "";
  nodes.forEach(([n, col], i) => {
    const a = (-90 + i * 360 / nodes.length) * Math.PI / 180;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    lines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#ffffff" stroke-opacity=".22" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>`;
    dots += `<div class="abs" style="left:${x - 56}px;top:${y - 56}px;width:112px;height:112px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 10px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.35)">${ic(n, "#fff", 50)}</div>`;
  });
  return `<html><head><style>${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative">
  <svg class="abs" width="${W}" height="${H}" style="left:0;top:0">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="300" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
    ${lines}
  </svg>
  <div class="abs" style="left:${cx - 210}px;top:${cy - 210}px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#2B5283,#1E3A5F 70%);box-shadow:0 0 0 18px rgba(224,165,38,.18),0 30px 60px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
    ${mansion(270)}
  </div>
  ${dots}
  </body></html>`;
}

// ---------- 2. Ecosistema (diagrama principal) ----------
const STATUS = {
  ok: ["En producción", "#E3F4E8", "#1B5E2B"],
  dec: ["Por decidir", "#FBF2DC", "#6B4A05"],
  plan: ["Planificado", "#EEF0F3", "#3C4249"],
  prop: ["Propuesta nueva", "#FFFFFF", "#6B4FA0"],
};
const AREAS = [
  { t: "Contabilidad", s: "357 cuentas · libro diario · cierre", i: "FaCalculator", c: C.navy, st: "ok" },
  { t: "Caja", s: "Sesión obligatoria para todo efectivo", i: "FaCashRegister", c: C.green, st: "ok" },
  { t: "Encuentro", s: "Retiro de 8 días · 7 submódulos", i: "FaPeopleRoof", c: C.teal, st: "ok" },
  { t: "Escuela de formación", s: "Cursos, sesiones y matrícula", i: "FaGraduationCap", c: C.violet, st: "dec" },
  { t: "Salones y grupos", s: "Reservas y grupos de oración", i: "FaDoorOpen", c: C.violet, st: "dec" },
  { t: "Cafetería y tienda", s: "Ventas con cobro y asiento", i: "FaMugHot", c: C.orange, st: "dec" },
  { t: "Ofrendas y donaciones", s: "Monetarias y en especie", i: "FaHandHoldingHeart", c: C.orange, st: "dec" },
  { t: "Gastos y proveedores", s: "Compras, servicios, obras", i: "FaFileInvoiceDollar", c: C.steel, st: "plan" },
  { t: "Empleados", s: "Personal y planilla", i: "FaIdBadge", c: C.steel, st: "prop" },
];
const CORE = [
  ["Personas", "FaUsers"], ["Cobranza", "FaReceipt"], ["Gobierno", "FaShieldHalved"], ["Institucional", "FaBuildingColumns"],
];

function ecoHtml() {
  const W = 1800, H = 1100, cx = 900, cy = 560;
  const rx = 690, ry = 395;
  let lines = "", nodes = "";
  AREAS.forEach((a, i) => {
    const ang = (-90 + i * 360 / AREAS.length) * Math.PI / 180;
    const x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang);
    const dash = a.st === "ok" ? "" : 'stroke-dasharray="10 10"';
    lines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${a.c}" stroke-opacity=".55" stroke-width="5" ${dash} stroke-linecap="round"/>`;
    const [lab, bg, fg] = STATUS[a.st];
    const border = a.st === "prop" ? `border:2px dashed ${fg};` : "";
    nodes += `
    <div class="abs" style="left:${x - 160}px;top:${y - 62}px;width:320px;display:flex;align-items:center;gap:16px;background:#fff;border-radius:22px;padding:14px 18px;box-shadow:0 10px 28px rgba(15,34,56,.16);border:1px solid #E3E6E9">
      <div style="flex:none;width:76px;height:76px;border-radius:50%;background:${a.c};display:flex;align-items:center;justify-content:center">${ic(a.i, "#fff", 36)}</div>
      <div style="min-width:0">
        <div style="font-weight:700;font-size:23px;color:${C.ink};line-height:1.15">${a.t}</div>
        <div style="font-size:15px;color:#5A6069;line-height:1.3;margin-top:2px">${a.s}</div>
        <div style="display:inline-block;margin-top:7px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:6px;background:${bg};color:${fg};${border}">${lab}</div>
      </div>
    </div>`;
  });
  // anillo núcleo
  let core = "";
  const cr = 262;
  CORE.forEach(([t, i], k) => {
    const ang = (-45 + k * 90) * Math.PI / 180;
    const x = cx + cr * Math.cos(ang), y = cy + cr * Math.sin(ang) * 0.82;
    core += `<div class="abs" style="left:${x - 92}px;top:${y - 24}px;width:184px;height:48px;border-radius:24px;background:${C.ice};border:2px solid ${C.navy};display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700;font-size:18px;color:${C.navy}">${ic(i, C.navy, 20)}${t}</div>`;
  });
  return `<html><head><style>${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative;background:#F4F6F9">
  <svg class="abs" width="${W}" height="${H}" style="left:0;top:0">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#CDD2D8" stroke-width="2" stroke-dasharray="4 12"/>
    ${lines}
    <ellipse cx="${cx}" cy="${cy}" rx="300" ry="230" fill="#FFFFFF" stroke="${C.navy}" stroke-opacity=".25" stroke-width="3"/>
  </svg>
  <div class="abs" style="left:${cx - 300}px;top:${cy - 222}px;width:600px;text-align:center;font-size:15px;font-weight:700;letter-spacing:.14em;color:${C.navy};opacity:.7">NÚCLEO COMPARTIDO</div>
  <div class="abs" style="left:${cx - 135}px;top:${cy - 135}px;width:270px;height:270px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#2B5283,${C.navy} 72%);box-shadow:0 0 0 12px rgba(224,165,38,.25),0 18px 40px rgba(15,34,56,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff">
    ${mansion(130)}
    <div style="font-weight:800;font-size:30px;margin-top:8px">RUAH 3.0</div>
    <div style="font-size:15px;opacity:.85;letter-spacing:.06em">ERP · LA MANSIÓN</div>
  </div>
  ${core}
  ${nodes}
  </body></html>`;
}

// ---------- 3. Una persona, muchos papeles ----------
function personasHtml() {
  const W = 1000, H = 1000, cx = 500, cy = 500, R = 340;
  const roles = [
    ["Feligrés", "FaChurch", C.navy], ["Servidor", "FaHandshakeAngle", C.teal], ["Peregrino", "FaPersonWalkingLuggage", C.teal],
    ["Alumno", "FaGraduationCap", C.violet], ["Donante", "FaHandHoldingHeart", C.orange], ["Cliente", "FaMugHot", C.orange],
  ];
  let s = "", l = "";
  roles.forEach(([t, i, c], k) => {
    const a = (-90 + k * 60) * Math.PI / 180;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    l += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c}" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>`;
    const name = fa[i] ? i : "FaUser";
    s += `<div class="abs" style="left:${x - 85}px;top:${y - 70}px;width:170px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="width:104px;height:104px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(15,34,56,.2)">${ic(name, "#fff", 46)}</div>
      <div style="font-weight:700;font-size:26px;color:${C.ink};background:#fff;padding:2px 14px;border-radius:14px">${t}</div></div>`;
  });
  return `<html><head><style>${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative">
  <svg class="abs" width="${W}" height="${H}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#CDD2D8" stroke-width="3" stroke-dasharray="4 12"/>${l}</svg>
  <div class="abs" style="left:${cx - 130}px;top:${cy - 130}px;width:260px;height:260px;border-radius:50%;background:${C.gold};display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 0 14px rgba(224,165,38,.2),0 16px 36px rgba(15,34,56,.25)">
    ${ic("FaUser", C.deep, 100)}
    <div style="font-weight:800;font-size:28px;color:${C.deep};margin-top:10px">1 persona</div>
  </div>
  ${s}</body></html>`;
}

// ---------- 4. Circuito del dinero ----------
function dineroHtml() {
  const W = 1800, H = 820;
  const ins = [
    ["Encuentro", "FaPeopleRoof", C.teal, true], ["Escuela", "FaGraduationCap", C.violet, false],
    ["Cafetería y tienda", "FaMugHot", C.orange, false], ["Ofrendas", "FaHandHoldingHeart", C.orange, false],
  ];
  const steps = [["Cargo", "FaFileLines"], ["Comprobante de pago", "FaFileImage"], ["Pago", "FaMoneyBillWave"], ["Recibo numerado", "FaReceipt"]];
  let left = "";
  ins.forEach(([t, i, c, on], k) => {
    const y = 110 + k * 165;
    left += `<div class="abs" style="left:40px;top:${y}px;width:330px;height:120px;border-radius:24px;background:#fff;box-shadow:0 10px 26px rgba(15,34,56,.14);display:flex;align-items:center;gap:18px;padding:0 20px;${on ? "" : "border:3px dashed #CDD2D8"}">
      <div style="width:80px;height:80px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;flex:none">${ic(i, "#fff", 38)}</div>
      <div><div style="font-weight:700;font-size:25px;color:${C.ink}">${t}</div><div style="font-size:16px;color:${on ? "#1B5E2B" : "#6B4A05"};font-weight:700">${on ? "YA COBRA AQUÍ" : "COBRARÁ AQUÍ"}</div></div></div>`;
  });
  let mid = "";
  steps.forEach(([t, i], k) => {
    const x = 520 + k * 210;
    mid += `<div class="abs" style="left:${x}px;top:300px;width:180px;display:flex;flex-direction:column;align-items:center;gap:12px">
      <div style="width:120px;height:120px;border-radius:50%;background:#fff;border:5px solid ${C.navy};display:flex;align-items:center;justify-content:center">${ic(fa[i] ? i : "FaFile", C.navy, 50)}</div>
      <div style="font-weight:700;font-size:22px;color:${C.ink};text-align:center;line-height:1.2">${t}</div></div>`;
    if (k < 3) mid += `<div class="abs" style="left:${x + 158}px;top:342px">${ic("FaChevronRight", C.gold, 40)}</div>`;
  });
  const arrows = ins.map((_, k) => `<path d="M370 ${170 + k * 165} C 450 ${170 + k * 165}, 450 360, 520 360" fill="none" stroke="${C.navy}" stroke-opacity=".35" stroke-width="5"/>`).join("");
  return `<html><head><style>${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative">
  <svg class="abs" width="${W}" height="${H}">${arrows}
    <path d="M1360 360 L1420 360" stroke="${C.navy}" stroke-width="6" stroke-opacity=".5"/>
    <rect x="490" y="240" width="880" height="280" rx="40" fill="none" stroke="${C.navy}" stroke-opacity=".25" stroke-width="3" stroke-dasharray="6 10"/>
  </svg>
  <div class="abs" style="left:490px;top:190px;width:880px;text-align:center;font-weight:800;font-size:22px;letter-spacing:.14em;color:${C.navy}">COBRANZA · UN SOLO CIRCUITO</div>
  ${left}${mid}
  <div class="abs" style="left:1420px;top:200px;width:340px;height:320px;border-radius:30px;background:${C.navy};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;box-shadow:0 16px 36px rgba(15,34,56,.3)">
    ${ic("FaBookOpen", C.gold, 72)}
    <div style="font-weight:800;font-size:32px">Contabilidad</div>
    <div style="font-size:19px;opacity:.9;text-align:center;padding:0 24px">Asiento automático en el libro diario</div>
  </div>
  <div class="abs" style="left:1420px;top:560px;width:340px;display:flex;align-items:center;gap:14px;background:#fff;border-radius:20px;padding:16px 20px;box-shadow:0 10px 24px rgba(15,34,56,.12)">
    <div style="width:64px;height:64px;border-radius:50%;background:${C.green};display:flex;align-items:center;justify-content:center;flex:none">${ic("FaCashRegister", "#fff", 30)}</div>
    <div style="font-size:18px;color:${C.ink};line-height:1.3"><b>Caja:</b> todo efectivo exige sesión abierta</div>
  </div>
  </body></html>`;
}

// ---------- 5. Ámbitos de autorización ----------
function ambitosHtml() {
  const W = 1000, H = 1000, cx = 500, cy = 500;
  const rings = [
    [460, C.navy, "GLOBAL", "Toda la institución"],
    [340, C.teal, "EVENTO", "Una edición del Encuentro"],
    [225, C.green, "PUNTO DE CAJA", "Un punto de caja"],
    [115, C.gold, "PROPIO", "Solo lo suyo"],
  ];
  let svg = "", labels = "";
  rings.forEach(([r, c, t, s], k) => {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" fill-opacity="${k === 3 ? 1 : 0.14 + k * 0.06}" stroke="${c}" stroke-width="4"/>`;
    const y = k === 3 ? cy - 30 : cy - r + 34;
    labels += `<div class="abs" style="left:${cx - 200}px;top:${y}px;width:400px;text-align:center">
      <div style="font-weight:800;font-size:${k === 3 ? 30 : 30}px;letter-spacing:.06em;color:${k === 3 ? C.deep : c}">${t}</div>
      <div style="font-size:21px;color:${k === 3 ? C.deep : "#3C4249"}">${s}</div></div>`;
  });
  return `<html><head><style>${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative">
  <svg class="abs" width="${W}" height="${H}">${svg}</svg>${labels}</body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: undefined });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const jobs = [
    ["hero", heroHtml(), 1200, 1100, true],
    ["ecosistema", ecoHtml(), 1800, 1100, false],
    ["personas", personasHtml(), 1000, 1000, true],
    ["dinero", dineroHtml(), 1800, 820, true],
    ["ambitos", ambitosHtml(), 1000, 1000, true],
  ];
  for (const [name, html, w, h, transparent] of jobs) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUT, name + ".png"), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
    console.log("ok", name);
  }
  await browser.close();
})();
