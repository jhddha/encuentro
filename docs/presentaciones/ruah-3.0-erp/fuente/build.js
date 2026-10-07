// Presentación RUAH 3.0 — ERP de La Mansión
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fa = require("react-icons/fa6");
const sharp = require("sharp");
const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");
const { applyTheme } = require("/root/.claude/skills/synced/6d476814-9a29-4a56-be74-a4ef49a22999_88c7095a-99eb-4315-8bfe-08575eac895e/pptx/scripts/apply_theme.js");

const OUT = process.argv[2] || path.join(__dirname, "RUAH_3.0_ERP_La_Mansion.pptx");
const IMG = path.join(__dirname, "img");

const THEME = {
  name: "RUAH 3.0",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1A1D21", lt1: "FFFFFF", dk2: "0F2238", lt2: "F4F6F9",
    accent1: "1E3A5F", accent2: "E0A526", accent3: "0E7C86",
    accent4: "6B4FA0", accent5: "D9822B", accent6: "2E8B57",
    hlink: "2563EB", folHlink: "6B4FA0",
  },
};
const HEX = {
  navy: "1E3A5F", deep: "0F2238", gold: "E0A526", teal: "0E7C86", violet: "6B4FA0",
  orange: "D9822B", green: "2E8B57", steel: "4F6D8A", ice: "E6EDF5", bg: "F4F6F9",
  ink: "1A1D21", muted: "5A6069", line: "E3E6E9", amber: "6B4A05", amberBg: "FBF2DC",
  okFg: "1B5E2B", okBg: "E3F4E8", grayBg: "EEF0F3", grayFg: "3C4249",
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "La Mansión";
pres.title = "RUAH 3.0 — El ERP de La Mansión";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ---------- iconos ----------
const iconCache = {};
async function icon(name, color = "FFFFFF") {
  const key = name + color;
  if (!iconCache[key]) {
    const svg = renderToStaticMarkup(React.createElement(fa[name], { color: "#" + color, size: 256 }));
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    iconCache[key] = "image/png;base64," + buf.toString("base64");
  }
  return iconCache[key];
}

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "CONTENIDO",
  background: { color: HEX.bg },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 34, bold: true, color: C.accent1, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: "80868F", align: "right" },
});
pres.defineSlideMaster({
  title: "OSCURO",
  background: { color: HEX.deep },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 34, bold: true, color: C.background1, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: "9FB0C5", align: "right" },
});
pres.defineSlideMaster({ title: "PORTADA", background: { color: HEX.deep }, objects: [] });

// ---------- helpers ----------
const anims = {}; // slideIndex -> [[objectName,...] por clic]
let slideNo = 0;
function newSlide(master, section) {
  slideNo++;
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  s._n = slideNo;
  return s;
}
function anim(s, step, name) {
  (anims[s._n] ||= []);
  (anims[s._n][step] ||= []).push(name);
}
const shadow = () => ({ type: "outer", color: "0F2238", opacity: 0.12, blur: 8, offset: 2, angle: 90 });

async function iconCircle(s, x, y, d, name, fill, iconColor = "FFFFFF", oname) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: oname + "_c" });
  const p = d * 0.26;
  s.addImage({ data: await icon(name, iconColor), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: oname + "_i" });
  return [oname + "_c", oname + "_i"];
}
const STATUS = {
  ok: ["EN PRODUCCIÓN", HEX.okBg, HEX.okFg],
  dec: ["POR DECIDIR", HEX.amberBg, HEX.amber],
  plan: ["PLANIFICADO", HEX.grayBg, HEX.grayFg],
  prop: ["PROPUESTA NUEVA", "F1ECF9", HEX.violet],
  closed: ["CERRADA", HEX.okBg, HEX.okFg],
  blocked: ["BLOQUEADA", HEX.amberBg, HEX.amber],
  pend: ["PENDIENTE", HEX.grayBg, HEX.grayFg],
};
function chip(s, x, y, st, oname, w = 1.55) {
  const [t, bg, fg] = STATUS[st];
  s.addText(t, { x, y, w, h: 0.3, fontSize: 10, bold: true, color: fg, fill: { color: bg }, align: "center", valign: "middle", margin: 0, charSpacing: 1, rectRadius: 0.06, shape: pres.shapes.ROUNDED_RECTANGLE, isTextBox: true, objectName: oname });
  return oname;
}
function card(s, x, y, w, h, oname, fill = "FFFFFF") {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: HEX.line, width: 0.75 }, shadow: shadow(), objectName: oname });
  return oname;
}

(async () => {
  // ===== 1. Portada =====
  pres.addSection({ title: "Apertura" });
  let s = newSlide("PORTADA", "Apertura");
  s.addImage({ path: path.join(IMG, "hero.png"), x: 6.55, y: 0.45, w: 7.09 * 0.93, h: 6.5 * 0.93, objectName: "hero" });
  s.addText("LA MANSIÓN · INFORME DE AVANCE", { x: 0.7, y: 1.7, w: 6, h: 0.4, fontSize: 14, bold: true, color: HEX.gold, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText("RUAH 3.0", { x: 0.7, y: 2.15, w: 6, h: 1.2, fontSize: 72, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
  s.addText("Un solo sistema para toda La Mansión", { x: 0.7, y: 3.4, w: 6, h: 0.6, fontSize: 26, color: HEX.ice, margin: 0, isTextBox: true });
  s.addText("Cómo el ERP engloba cada área, qué ya funciona y qué falta decidir", { x: 0.7, y: 4.1, w: 5.6, h: 0.8, fontSize: 18, color: "9FB0C5", margin: 0, isTextBox: true });
  s.addText("7 de octubre de 2026", { x: 0.7, y: 6.3, w: 4, h: 0.4, fontSize: 14, color: "9FB0C5", margin: 0, isTextBox: true });
  s.addNotes("Buenos días. Hoy les presento RUAH 3.0, el sistema de gestión institucional de La Mansión. La idea central: no es «el sistema del Encuentro», es el ERP de toda la institución. Vamos a ver el mapa completo de áreas, cuánto está construido y qué decisiones necesitamos para avanzar.");

  // ===== 2. Qué es RUAH =====
  pres.addSection({ title: "Qué es RUAH" });
  s = newSlide("CONTENIDO", "Qué es RUAH");
  s.addText("El Encuentro es el primer módulo, no el sistema entero", { placeholder: "title" });
  const rows2 = [
    ["FaBuildingColumns", HEX.navy, "Un ERP institucional", "RUAH 3.0 gestiona toda La Mansión: personas, dinero, actividades y operaciones."],
    ["FaUsers", HEX.gold, "Una persona, muchos papeles", "Feligrés, servidor, peregrino, alumno, donante y cliente son la misma persona, nunca registros separados."],
    ["FaLayerGroup", HEX.teal, "Se construye por capas", "Primero el núcleo compartido; luego cada área se conecta sin rehacer nada."],
  ];
  for (let i = 0; i < rows2.length; i++) {
    const [ic, col, h, d] = rows2[i];
    const y = 1.75 + i * 1.65;
    const n = "r" + i;
    const ids = await iconCircle(s, 0.6, y, 0.9, ic, col, col === HEX.gold ? HEX.deep : "FFFFFF", n);
    s.addText(h, { x: 1.75, y: y - 0.05, w: 5.3, h: 0.45, fontSize: 22, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(d, { x: 1.75, y: y + 0.42, w: 5.3, h: 0.8, fontSize: 16, color: HEX.muted, margin: 0, valign: "top", isTextBox: true, objectName: n + "_d" });
    [...ids, n + "_h", n + "_d"].forEach(o => anim(s, i, o));
  }
  s.addImage({ path: path.join(IMG, "personas.png"), x: 7.55, y: 1.35, w: 5.4, h: 5.4, objectName: "personas" });
  s.addNotes("RUAH nace con el Encuentro porque era la urgencia, pero cuatro quintas partes de lo construido es núcleo institucional. Principio clave: una persona, muchos papeles. Quien viene al Encuentro como peregrino puede ser después alumno de la escuela, cliente de la cafetería o donante, y el sistema lo reconoce como la misma persona.");

  // ===== 3. Ecosistema =====
  s = newSlide("CONTENIDO", "Qué es RUAH");
  s.addText("Así engloba RUAH a toda La Mansión", { placeholder: "title" });
  s.addImage({ path: path.join(IMG, "ecosistema.png"), x: 1.75, y: 1.3, w: 9.83, h: 6.0, objectName: "eco" });
  s.addNotes("Este es el mapa completo. Al centro, RUAH 3.0 como ERP de La Mansión. Alrededor, el núcleo compartido: Personas, Cobranza, Gobierno e Institucional. Todas las áreas se conectan a ese núcleo. En verde lo que ya está en producción: Contabilidad, Caja y el Encuentro. En amarillo lo que espera una decisión: Escuela de formación, Salones y grupos, Cafetería y tienda, Ofrendas. Gastos y proveedores está planificado para la fase 6. Empleados aparece como propuesta nueva: todavía no está en el mapa canónico y hay que definir su alcance.");

  // ===== 4. Avance en cifras =====
  pres.addSection({ title: "Avance" });
  s = newSlide("OSCURO", "Avance");
  s.addText("El avance en cifras", { placeholder: "title" });
  const stats = [["34/34", "ventanas contratadas, construidas"], ["357", "cuentas del plan contable"], ["65", "tablas en base de datos"], ["61", "permisos en 4 ámbitos"], ["14", "roles definidos"]];
  stats.forEach(([n, l], i) => {
    const x = 0.6 + i * 2.48;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.55, w: 2.28, h: 1.85, rectRadius: 0.12, fill: { color: "1A3150" }, line: { color: "2B4A70", width: 0.75 }, objectName: "st" + i + "_b" });
    s.addText(n, { x: x + 0.15, y: 1.7, w: 1.98, h: 0.9, fontSize: 44, bold: true, color: HEX.gold, margin: 0, isTextBox: true, objectName: "st" + i + "_n" });
    s.addText(l, { x: x + 0.15, y: 2.6, w: 1.98, h: 0.7, fontSize: 14, color: HEX.ice, margin: 0, valign: "top", isTextBox: true, objectName: "st" + i + "_l" });
    ["_b", "_n", "_l"].forEach(k => anim(s, 0, "st" + i + k));
  });
  s.addChart(pres.charts.DOUGHNUT, [{ name: "Fases", labels: ["Cerradas", "Bloqueadas", "Pendiente"], values: [4, 2, 1] }], {
    x: 0.6, y: 3.75, w: 3.4, h: 3.3, holeSize: 62, chartColors: ["2E8B57", "E0A526", "80868F"],
    showLegend: false, showValue: false, showPercent: false, showLabel: false, dataBorder: { pt: 2, color: "0F2238" }, objectName: "dona",
  });
  s.addText([{ text: "4", options: { fontSize: 40, bold: true, color: "FFFFFF", breakLine: true } }, { text: "de 7 fases", options: { fontSize: 14, color: HEX.ice } }], { x: 1.55, y: 4.85, w: 1.5, h: 1.1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "dona_t" });
  anim(s, 1, "dona"); anim(s, 1, "dona_t");
  const leg = [["2E8B57", "4 fases cerradas", "Documentos, núcleo, contabilidad y el Encuentro completo"], ["E0A526", "2 fases bloqueadas", "Esperan definiciones de negocio, no desarrollo"], ["80868F", "1 fase pendiente", "Operaciones: proveedores, compras y obras"]];
  leg.forEach(([c, h, d], i) => {
    const y = 4.0 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: 4.5, y: y + 0.08, w: 0.28, h: 0.28, fill: { color: c }, line: { color: c }, objectName: "lg" + i + "_d" });
    s.addText(h, { x: 5.0, y, w: 7.5, h: 0.4, fontSize: 20, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "lg" + i + "_h" });
    s.addText(d, { x: 5.0, y: y + 0.4, w: 7.5, h: 0.35, fontSize: 15, color: "9FB0C5", margin: 0, isTextBox: true, objectName: "lg" + i + "_t" });
    ["_d", "_h", "_t"].forEach(k => anim(s, 1, "lg" + i + k));
  });
  s.addNotes("Lo construido está terminado, no esbozado. Las 34 ventanas contratadas existen, con sus estados de carga, vacío, error y solo lectura, y probadas en cinco anchos de pantalla. 357 cuentas contables, 65 tablas, 61 permisos y 14 roles. De las siete fases, cuatro están cerradas; dos están bloqueadas por decisiones de negocio y una, la de operaciones, está pendiente.");

  // ===== 5. Núcleo =====
  pres.addSection({ title: "Áreas en producción" });
  s = newSlide("CONTENIDO", "Áreas en producción");
  s.addText("El núcleo compartido: lo que usan todas las áreas", { placeholder: "title" });
  const core = [
    ["FaBuildingColumns", "Institucional", "La organización y sus períodos contables anuales."],
    ["FaUsers", "Personas", "Padrón único de la comunidad, con o sin cuenta de acceso."],
    ["FaReceipt", "Cobranza", "Cargo, comprobante, pago y recibo numerado para todo el sistema."],
    ["FaCalculator", "Contabilidad", "Partida doble, libro diario, reportes y cierre de período."],
    ["FaShieldHalved", "Gobierno", "Permisos por ámbito, auditoría inmutable y notificaciones."],
  ];
  for (let i = 0; i < core.length; i++) {
    const [ic, h, d] = core[i];
    const x = 0.6 + i * 2.46, n = "k" + i;
    card(s, x, 1.6, 2.26, 4.3, n + "_b");
    const ids = await iconCircle(s, x + 0.63, 1.95, 1.0, ic, HEX.navy, "FFFFFF", n);
    s.addText(h, { x: x + 0.15, y: 3.15, w: 1.96, h: 0.5, fontSize: 20, bold: true, color: HEX.ink, align: "center", margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(d, { x: x + 0.2, y: 3.7, w: 1.86, h: 1.9, fontSize: 15, color: HEX.muted, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: n + "_d" });
    chip(s, x + 0.35, 5.4, "ok", n + "_s");
    [n + "_b", ...ids, n + "_h", n + "_d", n + "_s"].forEach(o => anim(s, i, o));
  }
  s.addText("Nunca depende del Encuentro: por eso cualquier área nueva se conecta sin tocarlo.", { x: 0.6, y: 6.3, w: 11, h: 0.35, fontSize: 14, italic: true, color: HEX.muted, margin: 0, isTextBox: true });
  s.addNotes("El núcleo son cinco piezas, todas en producción. Institucional, Personas, Cobranza, Contabilidad y Gobierno. Lo importante: el núcleo nunca depende del Encuentro. La tienda o la escuela cobrarán por aquí sin tocar nada.");

  // ===== 6. Encuentro =====
  s = newSlide("CONTENIDO", "Áreas en producción");
  s.addText("El Encuentro: operativo de punta a punta", { placeholder: "title" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.5, w: 3.3, h: 5.3, rectRadius: 0.15, fill: { color: HEX.teal }, line: { color: HEX.teal } });
  const big = [["21", "ventanas del módulo"], ["42", "comisiones en 7 áreas"], ["8 días", "de retiro, todo registrado"]];
  big.forEach(([n, l], i) => {
    s.addText(n, { x: 0.9, y: 1.75 + i * 1.65, w: 2.8, h: 0.85, fontSize: 48, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(l, { x: 0.9, y: 2.55 + i * 1.65, w: 2.8, h: 0.4, fontSize: 16, color: "D7EFF1", margin: 0, isTextBox: true });
  });
  const enc = [
    ["FaClipboardList", "Inscripciones", "Ventanilla, paquetes y reporte"],
    ["FaCashRegister", "Caja y cobros", "Efectivo y evidencias bancarias"],
    ["FaBed", "Hospedaje", "Hoteles, habitaciones y camas"],
    ["FaUtensils", "Alimentación", "Comidas por escaneo de credencial"],
    ["FaBoxOpen", "Materiales", "Entrega sin duplicados"],
    ["FaVanShuttle", "Transporte", "Viajes de llegada y salida"],
    ["FaHandshakeAngle", "Servidores", "Comisiones y asignaciones"],
    ["FaQrcode", "Credenciales", "Código para cada asistente"],
  ];
  for (let i = 0; i < enc.length; i++) {
    const [ic, h, d] = enc[i];
    const col = i % 4, row = Math.floor(i / 4);
    const x = 4.25 + col * 2.14, y = 1.5 + row * 2.75, n = "e" + i;
    card(s, x, y, 1.98, 2.55, n + "_b");
    const ids = await iconCircle(s, x + 0.59, y + 0.25, 0.8, ic, HEX.teal, "FFFFFF", n);
    s.addText(h, { x: x + 0.1, y: y + 1.15, w: 1.78, h: 0.4, fontSize: 17, bold: true, color: HEX.ink, align: "center", margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(d, { x: x + 0.12, y: y + 1.55, w: 1.74, h: 0.85, fontSize: 13, color: HEX.muted, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: n + "_d" });
    [n + "_b", ...ids, n + "_h", n + "_d"].forEach(o => anim(s, row, o));
  }
  s.addNotes("El Encuentro es el módulo más grande y el único operativo de punta a punta. Gestión del evento e inscripciones, caja, hospedaje, alimentación con escaneo de credencial en el comedor, materiales sin doble entrega, transporte y servidores con 42 comisiones en 7 áreas. Son 21 ventanas solo de este módulo.");

  // ===== 7. Caja y Contabilidad =====
  s = newSlide("CONTENIDO", "Áreas en producción");
  s.addText("Caja y Contabilidad: el dinero, bajo control", { placeholder: "title" });
  const panels = [
    ["FaCashRegister", HEX.green, "Caja", "3 ventanas", [
      "Sesión de caja obligatoria para todo cobro en efectivo",
      "Comprobantes emitidos y numerados",
      "Revisión y aprobación de comprobantes bancarios",
      "Cada cajero ve solo su punto de caja",
    ]],
    ["FaCalculator", HEX.navy, "Contabilidad", "9 ventanas", [
      "Plan de 357 cuentas y partida doble por período",
      "Asientos automáticos desde cada cobro",
      "Canales de cobro, cuentas bancarias y divisa del día",
      "Reportes contables y cierre de período",
    ]],
  ];
  for (let i = 0; i < panels.length; i++) {
    const [ic, col, h, sub, items] = panels[i];
    const x = 0.6 + i * 6.17, n = "p" + i;
    card(s, x, 1.5, 5.93, 5.3, n + "_b");
    const ids = await iconCircle(s, x + 0.4, 1.85, 1.0, ic, col, "FFFFFF", n);
    s.addText(h, { x: x + 1.6, y: 1.9, w: 3.5, h: 0.55, fontSize: 28, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(sub, { x: x + 1.6, y: 2.45, w: 2.5, h: 0.35, fontSize: 15, color: col, bold: true, margin: 0, isTextBox: true, objectName: n + "_s" });
    chip(s, x + 4.05, 1.98, "ok", n + "_c");
    s.addText(items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1 } })), { x: x + 0.45, y: 3.2, w: 5.1, h: 3.4, fontSize: 20, color: HEX.ink, paraSpaceAfter: 18, valign: "top", margin: 0, isTextBox: true, objectName: n + "_l" });
    [n + "_b", ...ids, n + "_h", n + "_s", n + "_c", n + "_l"].forEach(o => anim(s, i, o));
  }
  s.addNotes("Caja y contabilidad ya están en producción. Regla de oro: ningún cobro en efectivo sin sesión de caja abierta, sin excepción, y eso aplicará también a la cafetería y la tienda. Contabilidad trabaja con partida doble por período, 357 cuentas, y cada cobro genera su asiento automáticamente.");

  // ===== 8. Cobranza =====
  s = newSlide("CONTENIDO", "Áreas en producción");
  s.addText("Todas las áreas cobran por el mismo circuito", { placeholder: "title" });
  s.addImage({ path: path.join(IMG, "dinero.png"), x: 0.6, y: 1.55, w: 12.1, h: 5.51, objectName: "dinero" });
  s.addNotes("Este es el corazón financiero. Hoy el Encuentro ya cobra por este circuito: cargo, comprobante de pago, pago y recibo numerado, con asiento automático en contabilidad. La escuela, la cafetería y las ofrendas cobrarán exactamente por el mismo camino. No hay que construir otro sistema de cobro.");

  // ===== 9. Áreas que vienen =====
  pres.addSection({ title: "Lo que viene" });
  s = newSlide("CONTENIDO", "Lo que viene");
  s.addText("Las áreas que vienen", { placeholder: "title" });
  const next = [
    ["FaGraduationCap", HEX.violet, "Escuela de formación", "Cursos, sesiones, inscripción y matrícula.", "dec", "Espera D-7"],
    ["FaDoorOpen", HEX.violet, "Salones y grupos de oración", "Reservas sin solapamientos y grupos permanentes.", "dec", "Espera D-6"],
    ["FaMugHot", HEX.orange, "Cafetería y tienda", "Ventas con cobro, caja y asiento contable.", "dec", "Espera D-8"],
    ["FaHandHoldingHeart", HEX.orange, "Ofrendas y donaciones", "Monetarias y en especie.", "dec", "Política de valoración"],
    ["FaFileInvoiceDollar", HEX.steel, "Gastos y proveedores", "Compras, servicios básicos, cuentas por pagar y obras.", "plan", "Fase 6"],
    ["FaIdBadge", HEX.steel, "Empleados", "Personal y planilla. Aún no está en el mapa.", "prop", "Definir alcance"],
  ];
  for (let i = 0; i < next.length; i++) {
    const [ic, col, h, d, st, why] = next[i];
    const c = i % 3, r = Math.floor(i / 3);
    const x = 0.6 + c * 4.1, y = 1.5 + r * 2.7, n = "n" + i;
    card(s, x, y, 3.86, 2.5, n + "_b");
    const ids = await iconCircle(s, x + 0.3, y + 0.3, 0.85, ic, col, "FFFFFF", n);
    s.addText(h, { x: x + 1.3, y: y + 0.3, w: 2.4, h: 0.85, fontSize: 18, bold: true, color: HEX.ink, valign: "middle", margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(d, { x: x + 0.3, y: y + 1.3, w: 3.3, h: 0.6, fontSize: 14, color: HEX.muted, valign: "top", margin: 0, isTextBox: true, objectName: n + "_d" });
    chip(s, x + 0.3, y + 1.98, st, n + "_s", st === "prop" ? 1.75 : 1.4);
    s.addText(why, { x: x + 2.15, y: y + 1.98, w: 1.5, h: 0.3, fontSize: 12, color: HEX.muted, align: "right", valign: "middle", margin: 0, isTextBox: true, objectName: n + "_w" });
    [n + "_b", ...ids, n + "_h", n + "_d", n + "_s", n + "_w"].forEach(o => anim(s, r, o));
  }
  s.addNotes("Estas son las áreas que faltan. La escuela, los salones y grupos, la cafetería y tienda y las ofrendas tienen alcance definido pero esperan una decisión. Gastos y proveedores es la fase 6, el lado del gasto. Empleados lo incluimos como propuesta: hoy no está en el mapa canónico, así que hay que decidir si entra y con qué alcance (personal, planilla).");

  // ===== 10. Hoja de ruta =====
  s = newSlide("CONTENIDO", "Lo que viene");
  s.addText("La hoja de ruta: 7 fases", { placeholder: "title" });
  const phases = [
    ["0", "Rescate documental", "closed"], ["1", "Núcleo e institucional", "closed"], ["2", "Contabilidad institucional", "closed"],
    ["3", "El Encuentro completo", "closed"], ["4", "Salones, grupos y formación", "blocked"], ["5", "Ofrendas, tienda y cafetería", "blocked"],
    ["6", "Operaciones y gastos", "pend"],
  ];
  const px = i => 0.85 + i * 1.8;
  s.addShape(pres.shapes.LINE, { x: px(0) + 0.5, y: 3.0, w: px(6) - px(0), h: 0, line: { color: "CDD2D8", width: 3, dashType: "dash" } });
  s.addShape(pres.shapes.LINE, { x: px(0) + 0.5, y: 3.0, w: px(3) - px(0), h: 0, line: { color: HEX.green, width: 5 }, objectName: "prog" });
  phases.forEach(([n, t, st], i) => {
    const col = st === "closed" ? HEX.green : st === "blocked" ? HEX.gold : "80868F";
    const o = "f" + i;
    s.addShape(pres.shapes.OVAL, { x: px(i), y: 2.5, w: 1.0, h: 1.0, fill: { color: col }, line: { color: "FFFFFF", width: 4 }, objectName: o + "_c" });
    s.addText(n, { x: px(i), y: 2.5, w: 1.0, h: 1.0, fontSize: 30, bold: true, color: st === "blocked" ? HEX.deep : "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: o + "_n" });
    s.addText("FASE " + n, { x: px(i) - 0.35, y: 3.7, w: 1.7, h: 0.3, fontSize: 12, bold: true, color: col === HEX.gold ? HEX.amber : col, charSpacing: 2, align: "center", margin: 0, isTextBox: true, objectName: o + "_f" });
    s.addText(t, { x: px(i) - 0.35, y: 4.05, w: 1.7, h: 0.8, fontSize: 15, bold: true, color: HEX.ink, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: o + "_t" });
    chip(s, px(i) - 0.2, 4.95, st, o + "_s", 1.4);
    const step = i < 4 ? 0 : i < 6 ? 1 : 2;
    [o + "_c", o + "_n", o + "_f", o + "_t", o + "_s"].forEach(k => anim(s, step, k));
  });
  anim(s, 0, "prog");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px(3) + 0.15, y: 1.6, w: 0.7, h: 0.4, rectRadius: 0.08, fill: { color: HEX.navy }, line: { color: HEX.navy }, objectName: "hoy_b" });
  s.addText("HOY", { x: px(3) + 0.15, y: 1.6, w: 0.7, h: 0.4, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "hoy_t" });
  anim(s, 0, "hoy_b"); anim(s, 0, "hoy_t");
  card(s, 0.6, 5.65, 12.1, 1.15, "rm_b", HEX.ice);
  s.addText([{ text: "El orden es deliberado. ", options: { bold: true, color: HEX.navy } }, { text: "El núcleo se validó primero, con poca superficie y sin urgencia; el Encuentro llegó después sobre una base probada. Las fases 4 y 5 no esperan desarrollo: esperan definiciones.", options: { color: HEX.ink } }], { x: 0.9, y: 5.75, w: 11.5, h: 0.95, fontSize: 16, valign: "middle", margin: 0, isTextBox: true, objectName: "rm_t" });
  anim(s, 2, "rm_b"); anim(s, 2, "rm_t");
  s.addNotes("Fases 0 a 3 cerradas: documentos, núcleo, contabilidad y el Encuentro completo. Estamos aquí. Las fases 4 y 5 están bloqueadas por preguntas de negocio: quién aprueba un salón, qué es un curso, si la tienda maneja existencias con costo. La fase 6, operaciones y gastos, está pendiente.");

  // ===== 11. Quién ve qué =====
  pres.addSection({ title: "Gobierno" });
  s = newSlide("CONTENIDO", "Gobierno");
  s.addText("Quién ve qué: permisos por ámbito", { placeholder: "title" });
  s.addImage({ path: path.join(IMG, "ambitos.png"), x: 0.6, y: 1.45, w: 5.4, h: 5.4, objectName: "amb" });
  const amb = [
    [HEX.navy, "GLOBAL", "Toda la institución", "Admin master, Contabilidad"],
    [HEX.teal, "EVENTO", "Una edición del Encuentro", "Administrador y coordinadores del Encuentro"],
    [HEX.green, "PUNTO DE CAJA", "Un punto de caja concreto", "Servidor cajero"],
    [HEX.gold, "PROPIO", "Solo sus propios registros", "Cuenta base: el peregrino"],
  ];
  amb.forEach(([c, t, d, r], i) => {
    const y = 1.6 + i * 1.25, o = "a" + i;
    card(s, 6.5, y, 6.2, 1.05, o + "_b");
    s.addShape(pres.shapes.OVAL, { x: 6.75, y: y + 0.33, w: 0.4, h: 0.4, fill: { color: c }, line: { color: c }, objectName: o + "_d" });
    s.addText(t, { x: 7.35, y: y + 0.12, w: 2.4, h: 0.4, fontSize: 18, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: o + "_t" });
    s.addText(d, { x: 7.35, y: y + 0.52, w: 2.6, h: 0.4, fontSize: 14, color: HEX.muted, margin: 0, isTextBox: true, objectName: o + "_x" });
    s.addText(r, { x: 9.9, y: y + 0.12, w: 2.6, h: 0.8, fontSize: 14, color: HEX.ink, valign: "middle", margin: 0, isTextBox: true, objectName: o + "_r" });
    ["_b", "_d", "_t", "_x", "_r"].forEach(k => anim(s, i, o + k));
  });
  s.addText("Un ámbito estrecho nunca alcanza hacia arriba ni hacia los lados.", { x: 6.5, y: 6.65, w: 6.2, h: 0.35, fontSize: 14, italic: true, color: HEX.muted, margin: 0, isTextBox: true });
  s.addNotes("Seguridad: cada persona ve solo lo que su rol y su ámbito le permiten, y el servidor lo vuelve a comprobar en cada operación. Quien coordina una comisión no alcanza otra, ni la gestión, ni el dinero. Todo queda en una auditoría inmutable con actor y motivo.");

  // ===== 12. Decisiones =====
  pres.addSection({ title: "Decisiones" });
  s = newSlide("CONTENIDO", "Decisiones");
  s.addText("Siete preguntas que desbloquean el resto del mapa", { placeholder: "title" });
  const hdr = ["Ref.", "Pregunta", "Quién decide", "Qué desbloquea"].map(t => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: HEX.navy }, fontSize: 14 } }));
  const dec = [
    ["D-4", "Series de comprobantes, NIT, factura y crédito fiscal", "Administración", "La facturación boliviana"],
    ["D-6", "¿Quién aprueba una reserva de salón?", "Administración", "Módulo de salones"],
    ["D-7", "Un curso, ¿es un evento más o lleva sesiones, asistencia y notas?", "Escuela", "Módulo de formación"],
    ["D-8", "¿La tienda necesita existencias con costo o basta registrar la venta?", "Administración", "Tienda y cafetería"],
    ["D-9", "Roles reales: quién hace qué fuera del Encuentro", "Dirección", "Roles más allá del evento"],
    ["D-13", "¿El alta de cuentas es libre o requiere aprobación?", "Dirección", "Autorregistro de personas"],
    ["D-12", "¿Existe manual de marca de La Mansión?", "Dirección", "Identidad visual"],
  ].map((r, i) => r.map((t, k) => ({ text: t, options: { fontSize: 14, bold: k === 0, color: k === 0 ? HEX.navy : HEX.ink, fill: { color: i % 2 ? "FFFFFF" : "F9FAFC" } } })));
  s.addTable([hdr, ...dec], { x: 0.6, y: 1.5, w: 12.1, colW: [0.9, 6.0, 2.0, 3.2], rowH: 0.62, border: { type: "solid", pt: 0.75, color: HEX.line }, valign: "middle", margin: [0.06, 0.12, 0.06, 0.12], objectName: "tabla" });
  s.addNotes("Ninguna de estas preguntas la puede responder el sistema ni quien lo construye: definen qué hace la institución, no cómo se programa. Cada una detiene un alcance concreto. Las más urgentes: D-7 para la escuela, D-8 para la cafetería y tienda, y D-6 para los salones. A esto sumaría una octava: el alcance del módulo de empleados.");

  // ===== 13. Datos institucionales =====
  s = newSlide("CONTENIDO", "Decisiones");
  s.addText("Datos que solo la institución puede entregar", { placeholder: "title" });
  const data = [
    ["FaCalendarDays", "Fechas reales del Encuentro", "Código, inicio y fin", "Crear el evento en el sistema"],
    ["FaBuildingColumns", "Cuentas bancarias, QR y PayPal", "Datos de cada canal", "Cobro por transferencia y pasarela"],
    ["FaTags", "Artículo de merchandising", "Cuál es", "Una regla de asiento de la tienda"],
    ["FaCashRegister", "Cuenta contable por punto de caja", "Una por cada punto", "El asiento del cobro en efectivo"],
  ];
  for (let i = 0; i < data.length; i++) {
    const [ic, h, sub, blk] = data[i];
    const x = 0.6 + i * 3.06, n = "d" + i;
    card(s, x, 1.6, 2.86, 4.6, n + "_b");
    const ids = await iconCircle(s, x + 0.93, 1.95, 1.0, ic, HEX.gold, HEX.deep, n);
    s.addText(h, { x: x + 0.2, y: 3.15, w: 2.46, h: 0.85, fontSize: 18, bold: true, color: HEX.ink, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: n + "_h" });
    s.addText(sub, { x: x + 0.2, y: 4.0, w: 2.46, h: 0.4, fontSize: 14, color: HEX.muted, align: "center", margin: 0, isTextBox: true, objectName: n + "_s" });
    s.addText([{ text: "DETIENE", options: { bold: true, color: HEX.amber, fontSize: 11, charSpacing: 2, breakLine: true } }, { text: blk, options: { color: HEX.ink, fontSize: 14 } }], { x: x + 0.2, y: 4.75, w: 2.46, h: 1.1, fill: { color: HEX.amberBg }, align: "center", valign: "middle", margin: 0.08, shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.08, isTextBox: true, objectName: n + "_k" });
    [n + "_b", ...ids, n + "_h", n + "_s", n + "_k"].forEach(o => anim(s, i, o));
  }
  s.addNotes("No son decisiones sino hechos, y bloquean igual. Necesitamos las fechas reales del Encuentro, las cuentas bancarias, de QR y de PayPal, cuál es el artículo de merchandising y la cuenta contable de cada punto de caja.");

  // ===== 14. Cierre =====
  pres.addSection({ title: "Cierre" });
  s = newSlide("OSCURO", "Cierre");
  s.addText("Lo que conviene retener", { placeholder: "title" });
  const take = [
    ["No es «el sistema del Encuentro»", "Cuatro quintas partes de lo construido es núcleo institucional: personas, accesos, cobranza y contabilidad."],
    ["Lo construido está terminado", "34 de 34 ventanas, con reglas de negocio impuestas también en la base de datos."],
    ["Lo que queda espera definiciones", "Responder siete preguntas pone en marcha escuela, salones, cafetería, tienda y ofrendas."],
  ];
  take.forEach(([h, d], i) => {
    const x = 0.6 + i * 4.1, o = "t" + i;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.6, w: 3.86, h: 4.2, rectRadius: 0.15, fill: { color: "1A3150" }, line: { color: "2B4A70", width: 0.75 }, objectName: o + "_b" });
    s.addText(String(i + 1), { x: x + 0.35, y: 1.85, w: 1.2, h: 1.1, fontSize: 64, bold: true, color: HEX.gold, margin: 0, isTextBox: true, objectName: o + "_n" });
    s.addText(h, { x: x + 0.35, y: 3.0, w: 3.2, h: 0.9, fontSize: 21, bold: true, color: "FFFFFF", valign: "top", margin: 0, isTextBox: true, objectName: o + "_h" });
    s.addText(d, { x: x + 0.35, y: 3.95, w: 3.2, h: 1.6, fontSize: 16, color: HEX.ice, valign: "top", margin: 0, isTextBox: true, objectName: o + "_d" });
    ["_b", "_n", "_h", "_d"].forEach(k => anim(s, i, o + k));
  });
  s.addText("Siguiente paso: agendar las decisiones D-6, D-7 y D-8, y definir el alcance de Empleados.", { x: 0.6, y: 6.2, w: 12.1, h: 0.5, fontSize: 18, bold: true, color: HEX.gold, margin: 0, isTextBox: true, objectName: "next" });
  anim(s, 3, "next");
  s.addNotes("Tres ideas para llevarse. Primera: RUAH no es el sistema del Encuentro, es el ERP de La Mansión. Segunda: lo construido está terminado. Tercera: lo que falta no espera programación, espera decisiones. Propongo agendar D-6, D-7 y D-8 y definir el alcance de Empleados. Gracias.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  await postProcess(OUT);
  console.log("OK", OUT);
})();

// ---------- transiciones y animaciones ----------
const TRANS = ["<p:fade/>", '<p:push dir="u"/>', "<p:fade/>", '<p:wipe dir="r"/>', '<p:push dir="l"/>', '<p:push dir="l"/>', '<p:push dir="l"/>', '<p:wipe dir="r"/>', '<p:cover dir="l"/>', '<p:push dir="l"/>', "<p:fade/>", '<p:wipe dir="d"/>', '<p:push dir="l"/>', "<p:fade/>"];

function timingXml(steps) {
  let id = 3, clicks = "";
  for (const group of steps) {
    if (!group || !group.length) continue;
    let effects = "";
    group.forEach((spid, k) => {
      const a = id++, b = id++, c = id++;
      effects += `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="${k === 0 ? "clickEffect" : "withEffect"}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="500"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
    });
    const o = id++, i2 = id++;
    clicks += `<p:par><p:cTn id="${o}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${i2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

async function postProcess(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (let n = 1; n <= slideNo; n++) {
    const p = `ppt/slides/slide${n}.xml`;
    let xml = await zip.file(p).async("string");
    // mapa objectName -> id
    const ids = {};
    for (const m of xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]+)"/g)) ids[m[2]] = m[1];
    let timing = "";
    if (anims[n]) {
      const steps = anims[n].map(g => (g || []).map(name => {
        if (!ids[name]) throw new Error(`slide ${n}: objeto ${name} no encontrado`);
        return ids[name];
      }));
      timing = timingXml(steps);
    }
    const trans = `<p:transition spd="med">${TRANS[n - 1] || "<p:fade/>"}</p:transition>`;
    xml = xml.replace(/<p:timing>[\s\S]*?<\/p:timing>/, "");
    if (xml.includes("</p:clrMapOvr>")) xml = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + trans + timing);
    else xml = xml.replace("</p:cSld>", "</p:cSld>" + trans + timing);
    zip.file(p, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
