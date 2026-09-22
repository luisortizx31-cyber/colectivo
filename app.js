/* Colectivo — registro de cobros del colectivo (efectivo / Yape).
   Sin dependencias. Todo se guarda en el teléfono (localStorage).
   Los montos van en céntimos enteros (350 = S/ 3.50) para evitar errores de decimales. */
'use strict';

/* ───────────── Utilidades ───────────── */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/** Crea un elemento: h('button', { class: 'x', onclick: fn }, 'texto', otroNodo). Los textos van como texto, nunca como HTML. */
function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const x of hijos) if (x != null && x !== false) el.append(x);
  return el;
}

function reemplazarHijos(el, hijos) {
  el.textContent = '';
  hijos.forEach(x => el.append(x));
}

const pad = n => String(n).padStart(2, '0');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const soles = cent => 'S/ ' + (cent / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const solesConSigno = cent => (cent < 0 ? '−' + soles(-cent) : soles(cent));
const nombreMetodo = m => (m === 'yape' ? 'Yape' : 'Efectivo');
const descripcion = c => soles(c.monto) + (c.etiqueta ? ' · ' + c.etiqueta : '');

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Un “día” es la fecha local en formato AAAA-MM-DD (se puede comparar como texto).
const claveDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const claveDia = ts => claveDe(new Date(ts));
const fechaDe = clave => { const [y, m, d] = clave.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const sumarDias = (clave, n) => { const d = fechaDe(clave); d.setDate(d.getDate() + n); return claveDe(d); };
const fechaTexto = clave => { const d = fechaDe(clave); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
/** "hoy", "ayer" o "el jue 17 sep 2026", para frases como "¿Cuánto gastaste hoy?". */
const nombreDia = clave => (clave === hoyClave ? 'hoy' : clave === sumarDias(hoyClave, -1) ? 'ayer' : 'el ' + fechaTexto(clave));
function horaDe(ts) {
  const d = new Date(ts), hh = d.getHours();
  return { hm: `${hh % 12 || 12}:${pad(d.getMinutes())}`, ampm: hh < 12 ? 'a. m.' : 'p. m.' };
}
const horaTexto = ts => { const t = horaDe(ts); return `${t.hm} ${t.ampm}`; };

/** "3.5", "3,50", "S/ 2" → 350, 350, 200. Devuelve null si no es un precio válido. */
function leerMonto(texto) {
  const n = Number(String(texto).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n <= 0 || n > 999) return null;
  return Math.round(n * 100);
}

/* ───────────── Datos guardados en el teléfono ───────────── */

const LS = { cobros: 'colectivo.cobros.v1', tarifas: 'colectivo.tarifas.v1', ajustes: 'colectivo.ajustes.v1', gastos: 'colectivo.gastos.v1' };

function leer(clave) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; }
}
const avisarSinEspacio = () => toast('No se pudo guardar: el teléfono no tiene espacio. Guarda una copia de seguridad.', [], { ms: 9000 });

const TARIFAS_INICIALES = [
  { id: 'centro', monto: 350, etiqueta: 'Centro', grande: true },
  { id: 'terminal', monto: 300, etiqueta: 'Terminal', grande: true },
  { id: 'villa-maria', monto: 250, etiqueta: 'Villa María', grande: true },
  { id: 'cerca', monto: 200, etiqueta: 'Cerca', grande: true },
  { id: 'extra-150', monto: 150, etiqueta: '', grande: false },
  { id: 'extra-100', monto: 100, etiqueta: '', grande: false },
];

/** Valida una lista de tarifas (del teléfono o de una copia). Devuelve la lista limpia, o null si no sirve. */
function limpiarTarifas(g) {
  if (!Array.isArray(g) || !g.every(t => t && typeof t.id === 'string' && Number.isInteger(t.monto) && t.monto > 0)) return null;
  return g.map(t => ({ id: t.id, monto: t.monto, etiqueta: String(t.etiqueta || ''), grande: !!t.grande }));
}

// Los ajustes se leen antes que las tarifas porque cargarTarifas() los usa.
const ajustes = Object.assign({ vibracion: true, sonido: true, pantalla: true, volverEfectivo: true, ultimaCopia: 0, terminalAgregada: false }, leer(LS.ajustes));

function cargarTarifas() {
  const guardadas = limpiarTarifas(leer(LS.tarifas));
  const lista = guardadas || TARIFAS_INICIALES.map(t => Object.assign({}, t));
  // "Terminal" (S/ 3.00) se sumó a las tarifas de fábrica: a quien ya tenía las suyas guardadas se le agrega una sola vez.
  if (!ajustes.terminalAgregada) {
    ajustes.terminalAgregada = true;
    guardar(LS.ajustes, ajustes);
    if (guardadas && !lista.some(t => t.monto === 300)) {
      lista.push(Object.assign({}, TARIFAS_INICIALES.find(t => t.id === 'terminal')));
      guardar(LS.tarifas, lista);
    }
  }
  return lista;
}

// Cada cobro se guarda como [marcaDeTiempo, céntimos, 0|1 (1 = Yape), destino]: así ocupa poco espacio.
// La marca de tiempo (ts) hace de identificador único. Las copias de seguridad usan el mismo formato.
const cobroAFila = c => [c.ts, c.monto, c.metodo === 'yape' ? 1 : 0, c.etiqueta];

function filaACobro(f) {
  if (!Array.isArray(f) || !Number.isFinite(f[0]) || !Number.isInteger(f[1]) || f[1] <= 0) return null;
  return { ts: f[0], monto: f[1], metodo: f[2] === 1 ? 'yape' : 'efectivo', etiqueta: String(f[3] || ''), dia: claveDia(f[0]) };
}

function filasACobros(filas) {
  return filas.map(filaACobro).filter(Boolean).sort((a, b) => a.ts - b.ts);
}

function cargarCobros() {
  const g = leer(LS.cobros);
  return Array.isArray(g) ? filasACobros(g) : [];
}

function guardarCobros() {
  if (!guardar(LS.cobros, cobros.map(cobroAFila))) avisarSinEspacio();
}
const guardarTarifas = () => guardar(LS.tarifas, tarifas);

// Gastos del carro (gasolina, gas…). Cada uno se guarda como [marcaDeTiempo, céntimos, tipo].
// Para sumar otro tipo de gasto basta con agregarlo a esta lista.
const TIPOS_GASTO = [
  { id: 'gasolina', nombre: 'Gasolina' },
  { id: 'gas', nombre: 'Gas' },
];
const nombreGasto = tipo => {
  const t = TIPOS_GASTO.find(x => x.id === tipo);
  return t ? t.nombre : String(tipo).charAt(0).toUpperCase() + String(tipo).slice(1);
};

const gastoAFila = g => [g.ts, g.monto, g.tipo];

function filaAGasto(f) {
  if (!Array.isArray(f) || !Number.isFinite(f[0]) || !Number.isInteger(f[1]) || f[1] <= 0 || typeof f[2] !== 'string' || !f[2]) return null;
  return { ts: f[0], monto: f[1], tipo: f[2], dia: claveDia(f[0]) };
}

function filasAGastos(filas) {
  return filas.map(filaAGasto).filter(Boolean).sort((a, b) => a.ts - b.ts);
}

function cargarGastos() {
  const g = leer(LS.gastos);
  return Array.isArray(g) ? filasAGastos(g) : [];
}

function guardarGastos() {
  if (!guardar(LS.gastos, gastos.map(gastoAFila))) avisarSinEspacio();
}

let tarifas = cargarTarifas();
let cobros = cargarCobros();                 // ordenados por hora, del más antiguo al más nuevo
let gastos = cargarGastos();                 // igual: del más antiguo al más nuevo

let metodo = 'efectivo';                     // forma de pago con la que se registrará el siguiente cobro
let vista = 'cobrar';
let hoyClave = claveDia(Date.now());
let diaSel = hoyClave;                       // día que se ve en la pantalla Cobros
let ultimo = null;                           // { c } último cobro de esta sesión · { deshecho: c } si se deshizo

/* ───────────── Operaciones sobre cobros ───────────── */

function agregarCobro({ monto, etiqueta, metodo, ts = Date.now() }) {
  while (cobros.some(x => x.ts === ts)) ts++;
  const c = { ts, monto, etiqueta, metodo, dia: claveDia(ts) };
  cobros.push(c);
  if (cobros.length > 1 && cobros[cobros.length - 2].ts > ts) cobros.sort((a, b) => a.ts - b.ts);
  guardarCobros();
  return c;
}

function quitarCobro(c) {
  const i = cobros.indexOf(c);
  if (i >= 0) { cobros.splice(i, 1); guardarCobros(); }
}

function alternarMetodo(c) {
  c.metodo = c.metodo === 'yape' ? 'efectivo' : 'yape';
  guardarCobros();
  refrescarTodo();
}

/** Cobros de un día, del más reciente al más antiguo. */
function cobrosDelDia(clave) {
  const r = [];
  for (let i = cobros.length - 1; i >= 0; i--) {
    const c = cobros[i];
    if (c.dia === clave) r.push(c);
    else if (c.dia < clave) break;
  }
  return r;
}

const claveTarifa = (monto, etiqueta) => monto + '|' + etiqueta;

function resumir(lista) {
  const r = { total: 0, efectivo: 0, yape: 0, n: 0, nEfectivo: 0, nYape: 0, porTarifa: {} };
  for (const c of lista) {
    r.total += c.monto; r.n++;
    if (c.metodo === 'yape') { r.yape += c.monto; r.nYape++; } else { r.efectivo += c.monto; r.nEfectivo++; }
    const k = claveTarifa(c.monto, c.etiqueta);
    const t = r.porTarifa[k] || (r.porTarifa[k] = { monto: c.monto, etiqueta: c.etiqueta, n: 0 });
    t.n++;
  }
  return r;
}

/* ───────────── Operaciones sobre gastos ───────────── */

/** Hora con la que se anota un gasto en el día que se está viendo: ahora si es hoy, o el mediodía de ese día. */
const tsParaDia = clave => (clave === hoyClave ? Date.now() : fechaDe(clave).getTime());

const sumar = lista => lista.reduce((suma, x) => suma + x.monto, 0);

function agregarGasto({ monto, tipo, ts }) {
  while (gastos.some(x => x.ts === ts)) ts++;
  const g = { ts, monto, tipo, dia: claveDia(ts) };
  gastos.push(g);
  if (gastos.length > 1 && gastos[gastos.length - 2].ts > ts) gastos.sort((a, b) => a.ts - b.ts);
  guardarGastos();
  return g;
}

function quitarGasto(g) {
  const i = gastos.indexOf(g);
  if (i >= 0) { gastos.splice(i, 1); guardarGastos(); }
}

/** Gastos de un día, del más reciente al más antiguo. */
function gastosDelDia(clave) {
  return gastos.filter(g => g.dia === clave).reverse();
}

/* ───────────── Pantalla COBRAR ───────────── */

function fijarMetodo(m) {
  metodo = m;
  document.body.dataset.metodo = m;
  $$('.metodo button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.metodo === m)));
}

function botonTarifa(t) {
  return h('button', { type: 'button', class: 'tarifa ' + (t.grande ? 'grande' : 'chica'), 'data-id': t.id, 'aria-label': `Cobrar ${descripcion(t)}` },
    h('span', { class: 'cuenta', 'aria-hidden': 'true' }),
    h('span', { class: 'monto' }, h('small', null, 'S/'), (t.monto / 100).toFixed(2)),
    t.etiqueta ? h('span', { class: 'destino' }, t.etiqueta) : null
  );
}

/** Botón de monto libre, para un pasaje distinto a las tarifas fijas (p. ej. un taxi). Siempre está visible. */
function botonTaxi() {
  return h('button', { type: 'button', class: 'taxi', 'aria-label': 'Cobrar un taxi por un monto distinto' },
    h('span', { class: 'taxi-txt' }, 'Taxi'),
    h('span', { class: 'taxi-sub' }, 'Monto distinto')
  );
}

function construirTarifas() {
  const cont = $('#tarifas');
  cont.textContent = '';
  if (!tarifas.length) {
    cont.append(h('p', { class: 'sin-tarifas' }, 'Aún no tienes tarifas. Agrégalas en Ajustes.'));
  } else {
    const ordenadas = tarifas.slice().sort((a, b) => b.monto - a.monto);
    const grandes = ordenadas.filter(t => t.grande);
    const chicas = ordenadas.filter(t => !t.grande);
    if (grandes.length) cont.append(h('div', { class: 'grandes' }, ...grandes.map(botonTarifa)));
    if (chicas.length) cont.append(h('div', { class: 'chicas' + (grandes.length ? '' : ' solas') }, ...chicas.map(botonTarifa)));
  }
  cont.append(botonTaxi());
  actualizarHoy();
}

function actualizarHoy() {
  const r = resumir(cobrosDelDia(hoyClave));
  $('#hoy-total').textContent = soles(r.total);
  $('#hoy-pasajeros').textContent = plural(r.n, 'pasajero', 'pasajeros');
  $('#hoy-efectivo').textContent = soles(r.efectivo);
  $('#hoy-yape').textContent = soles(r.yape);
  $$('#tarifas .tarifa').forEach(b => {
    const t = tarifas.find(x => x.id === b.dataset.id);
    const n = t && r.porTarifa[claveTarifa(t.monto, t.etiqueta)];
    $('.cuenta', b).textContent = n ? '×' + n.n : '';
  });
}

function pintarUltimo() {
  if (ultimo && ultimo.c && cobros.indexOf(ultimo.c) < 0) ultimo = null;   // ya lo borraron desde Cobros
  const info = $('#ultimo-info'), acc = $('#ultimo-acciones');
  info.textContent = '';
  acc.textContent = '';
  if (!ultimo) {
    info.append(h('strong', null, 'Listo para cobrar'), h('span', null, 'Toca un precio cada vez que suba un pasajero'));
    return;
  }
  if (ultimo.deshecho) {
    const c = ultimo.deshecho;
    info.append(h('strong', null, 'Cobro deshecho'), h('span', null, descripcion(c)));
    acc.append(h('button', { type: 'button', class: 'btn-mini', onclick: () => { ultimo = { c: agregarCobro(c) }; refrescarTodo(); } }, 'Rehacer'));
    return;
  }
  const c = ultimo.c;
  info.append(
    h('strong', null, h('i', { class: 'punto p-' + c.metodo }), soles(c.monto)),
    h('span', null, [nombreMetodo(c.metodo), c.etiqueta, horaTexto(c.ts)].filter(Boolean).join(' · '))
  );
  acc.append(
    h('button', { type: 'button', class: 'btn-mini', onclick: () => alternarMetodo(c) }, c.metodo === 'yape' ? 'Es efectivo' : 'Es Yape'),
    h('button', { type: 'button', class: 'btn-mini', onclick: () => { quitarCobro(c); ultimo = { deshecho: c }; refrescarTodo(); } }, 'Deshacer')
  );
}

function cobrar(t, boton) {
  const m = metodo;
  ultimo = { c: agregarCobro({ monto: t.monto, etiqueta: t.etiqueta, metodo: m }) };
  if (m === 'yape' && ajustes.volverEfectivo) fijarMetodo('efectivo');
  refrescarTodo();
  animar(boton);
  feedback(m);
}

/** Un taxi (u otro pasaje) de monto distinto a las tarifas fijas: se escribe el precio y se cobra con el
    modo Efectivo/Yape que esté seleccionado arriba. */
function cobrarTaxi(boton) {
  abrirHoja('Taxi', `¿Cuánto cobraste? Se registra como ${nombreMetodo(metodo)}.`, [
    {
      etq: 'Cobrar', pide: true,
      fn: monto => {
        const m = metodo;
        ultimo = { c: agregarCobro({ monto, etiqueta: 'Taxi', metodo: m }) };
        if (m === 'yape' && ajustes.volverEfectivo) fijarMetodo('efectivo');
        refrescarTodo();
        animar(boton);
        feedback(m);
      },
    },
  ], { valor: '', etiqueta: 'Monto del taxi en soles' });
}

function refrescarTodo() {
  actualizarHoy();
  pintarUltimo();
  pintarCopia();
  if (vista === 'cobros') renderCobros();
}

/* Confirmación al cobrar: destello, vibración y un “tic” para no tener que mirar la pantalla. */

function animar(boton) {
  if (!boton || !boton.animate) return;
  const destello = h('i', { class: 'destello' });
  boton.append(destello);
  destello.animate([{ opacity: .5 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => destello.remove();
  const cuenta = $('.cuenta', boton);
  if (cuenta) cuenta.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
}

function feedback(m) {
  if (ajustes.vibracion && navigator.vibrate) navigator.vibrate(m === 'yape' ? [25, 45, 25] : 30);
  if (!ajustes.sonido) return;
  // La primera vez, crear el audio tarda ~100 ms: se hace después de pintar para que el toque se sienta instantáneo.
  if (audio) beep(m);
  else requestAnimationFrame(() => setTimeout(() => beep(m), 0));
}

let audio = null;
function beep(m) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime;
    (m === 'yape' ? [660, 990] : [740]).forEach((f, i) => {
      const t = t0 + i * 0.09, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + 0.16);
    });
  } catch (e) { /* sin audio: no pasa nada */ }
}

/* ───────────── Pantalla COBROS (historial por día) ───────────── */

function filaCobro(c) {
  const t = horaDe(c.ts);
  return h('li', null,
    h('button', { type: 'button', class: 'fila', onclick: () => abrirCobro(c) },
      h('span', { class: 'fila-hora' }, t.hm, h('small', null, t.ampm)),
      h('span', { class: 'fila-info' }, h('strong', null, soles(c.monto)), c.etiqueta ? h('span', null, c.etiqueta) : null),
      h('span', { class: 'chip ' + c.metodo }, nombreMetodo(c.metodo))
    )
  );
}

function renderCobros() {
  if (diaSel > hoyClave) diaSel = hoyClave;
  const lista = cobrosDelDia(diaSel);
  const r = resumir(lista);
  const gastosDia = gastosDelDia(diaSel);
  const totalGastos = sumar(gastosDia);
  const ganancia = r.total - totalGastos;             // lo cobrado menos los gastos del día

  $('#dia-etq').textContent = diaSel === hoyClave ? 'Hoy' : diaSel === sumarDias(hoyClave, -1) ? 'Ayer' : DIAS_LARGO[fechaDe(diaSel).getDay()];
  $('#dia-fecha').textContent = fechaTexto(diaSel);
  $('#dia-picker').value = diaSel;
  $('#dia-picker').max = hoyClave;
  $('#dia-next').disabled = diaSel >= hoyClave;

  $('#dia-ganancia').textContent = solesConSigno(ganancia);
  $('#card-ganancia').classList.toggle('negativa', ganancia < 0);
  $('#dia-total').textContent = soles(r.total);
  $('#dia-pasajeros').textContent = plural(r.n, 'pasajero', 'pasajeros');
  $('#dia-gastos-resta').textContent = totalGastos ? '− ' + soles(totalGastos) : soles(0);
  $('#dia-efectivo').textContent = soles(r.efectivo);
  $('#dia-efectivo-n').textContent = plural(r.nEfectivo, 'cobro', 'cobros');
  $('#dia-yape').textContent = soles(r.yape);
  $('#dia-yape-n').textContent = plural(r.nYape, 'cobro', 'cobros');

  const destinos = Object.keys(r.porTarifa).map(k => r.porTarifa[k]).sort((a, b) => b.monto - a.monto);
  reemplazarHijos($('#dia-destinos'), destinos.map(t => h('span', { class: 'chip-dest' }, h('b', null, t.n + '×'), ' ' + descripcion(t))));
  renderGastos(gastosDia, totalGastos);
  reemplazarHijos($('#lista'), lista.map(filaCobro));
  const vacio = $('#vacio');
  vacio.hidden = lista.length > 0;
  vacio.textContent = diaSel === hoyClave
    ? 'Aún no hay cobros hoy. Cada precio que toques en Cobrar aparecerá aquí con su hora.'
    : 'No hay cobros registrados este día.';

  $('#borrar-fila').hidden = cobros.length === 0 && gastos.length === 0;            // sin historial no hay nada que borrar
  $('#btn-borrar-dia').disabled = lista.length === 0 && gastosDia.length === 0;
}

function renderGastos(lista, total) {
  $('#gastos-total').textContent = soles(total);
  $('#gastos-vacio').hidden = lista.length > 0;
  reemplazarHijos($('#gastos-lista'), lista.map(g => h('li', null,
    h('button', { type: 'button', class: 'gasto', onclick: () => abrirGasto(g) },
      h('span', { class: 'gasto-nombre' }, h('i', { class: 'punto p-gasto' }), nombreGasto(g.tipo)),
      h('strong', null, soles(g.monto))
    )
  )));
}

/** Anota un gasto (gasolina, gas…) en el día que se está viendo. */
function nuevoGasto(tipo) {
  const clave = diaSel;
  abrirHoja(nombreGasto(tipo), `¿Cuánto gastaste ${nombreDia(clave)}?`, [
    {
      etq: 'Guardar gasto', pide: true,
      fn: monto => {
        const g = agregarGasto({ monto, tipo, ts: tsParaDia(clave) });
        refrescarTodo();
        toast(`Gasto anotado: ${nombreGasto(tipo)} ${soles(monto)}`, [{ etq: 'Deshacer', fn: () => { quitarGasto(g); refrescarTodo(); } }]);
      },
    },
  ], { valor: '', etiqueta: `Monto de ${nombreGasto(tipo).toLowerCase()} en soles` });
}

/** Cambiar el monto de un gasto o eliminarlo. */
function abrirGasto(g) {
  abrirHoja(nombreGasto(g.tipo), `${fechaTexto(g.dia)}. Cambia el monto o elimínalo.`, [
    {
      etq: 'Guardar cambio', pide: true,
      fn: monto => {
        const antes = g.monto;
        if (monto === antes) return;
        g.monto = monto;
        guardarGastos();
        refrescarTodo();
        toast('Gasto actualizado', [{ etq: 'Deshacer', fn: () => { g.monto = antes; guardarGastos(); refrescarTodo(); } }]);
      },
    },
    {
      etq: 'Eliminar gasto', tipo: 'peligro',
      fn: () => {
        quitarGasto(g);
        refrescarTodo();
        toast('Gasto eliminado', [{ etq: 'Deshacer', fn: () => { agregarGasto(g); refrescarTodo(); } }]);
      },
    },
  ], { valor: (g.monto / 100).toFixed(2), etiqueta: 'Monto en soles' });
}

function abrirCobro(c) {
  const otro = c.metodo === 'yape' ? 'efectivo' : 'yape';
  abrirHoja(descripcion(c), `${fechaTexto(c.dia)} · ${horaTexto(c.ts)} · ${nombreMetodo(c.metodo)}`, [
    {
      etq: 'Cambiar a ' + nombreMetodo(otro),
      fn: () => {
        const antes = c.metodo;
        c.metodo = otro;
        guardarCobros();
        refrescarTodo();
        toast('Cobro cambiado a ' + nombreMetodo(otro), [{ etq: 'Deshacer', fn: () => { c.metodo = antes; guardarCobros(); refrescarTodo(); } }]);
      },
    },
    {
      etq: 'Eliminar cobro', tipo: 'peligro',
      fn: () => {
        quitarCobro(c);
        refrescarTodo();
        toast('Cobro eliminado', [{ etq: 'Deshacer', fn: () => { agregarCobro(c); refrescarTodo(); } }]);
      },
    },
  ]);
}

function irADia(clave) {
  diaSel = clave;
  renderCobros();
}

/* ───────────── Pantalla AJUSTES ───────────── */

function construirEditor() {
  const cont = $('#editor-tarifas');
  cont.textContent = '';
  tarifas.slice().sort((a, b) => b.monto - a.monto).forEach(t => cont.append(filaEditor(t)));
}

function cambioTarifas() {
  guardarTarifas();
  construirTarifas();
}

function filaEditor(t) {
  const monto = h('input', { class: 'campo monto', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: (t.monto / 100).toFixed(2), 'aria-label': 'Precio en soles' });
  monto.addEventListener('focus', () => setTimeout(() => monto.select(), 0));   // se escribe el precio nuevo directo
  monto.addEventListener('change', () => {
    const c = leerMonto(monto.value);
    if (c == null) {
      monto.value = (t.monto / 100).toFixed(2);
      toast('Escribe un precio válido, por ejemplo 2.50');
      return;
    }
    t.monto = c;
    monto.value = (c / 100).toFixed(2);
    cambioTarifas();
  });

  const destino = h('input', { class: 'campo', type: 'text', maxlength: '20', autocomplete: 'off', placeholder: 'Destino (opcional)', value: t.etiqueta, 'aria-label': 'Destino' });
  destino.addEventListener('change', () => {
    t.etiqueta = destino.value.trim();
    destino.value = t.etiqueta;
    cambioTarifas();
  });

  const grande = h('button', { type: 'button', class: 'fila-sw', role: 'switch', 'aria-checked': String(t.grande) },
    h('span', { class: 'fila-txt' }, 'Botón grande'), h('i', { class: 'sw' }));
  grande.addEventListener('click', () => {
    t.grande = !t.grande;
    grande.setAttribute('aria-checked', String(t.grande));
    cambioTarifas();
  });

  const quitar = h('button', { type: 'button', class: 'btn-texto', onclick: () => quitarTarifa(t) }, 'Quitar');

  return h('div', { class: 'tarifa-ed', 'data-id': t.id },
    h('div', { class: 'tarifa-ed-fila' }, h('span', { class: 'prefijo' }, 'S/'), monto, destino),
    h('div', { class: 'tarifa-ed-fila2' }, grande, quitar)
  );
}

function quitarTarifa(t) {
  const i = tarifas.indexOf(t);
  if (i < 0) return;
  tarifas.splice(i, 1);
  construirEditor();
  cambioTarifas();
  toast('Tarifa quitada. Tus cobros anteriores no cambian.', [{ etq: 'Deshacer', fn: () => { tarifas.push(t); construirEditor(); cambioTarifas(); } }]);
}

function agregarTarifa() {
  const t = { id: 't' + Date.now().toString(36), monto: 100, etiqueta: '', grande: false };
  tarifas.push(t);
  construirEditor();
  cambioTarifas();
  const fila = $(`.tarifa-ed[data-id="${t.id}"]`);
  fila.scrollIntoView({ block: 'center' });
  const inp = $('.monto', fila);
  inp.focus();
  inp.select();
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportarCSV() {
  if (!cobros.length && !gastos.length) { toast('Todavía no hay cobros ni gastos para exportar.'); return; }
  const celda = s => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  // Una sola tabla en orden de hora: los cobros suman y los gastos van en negativo, así la suma de "Monto" es la ganancia.
  const movimientos = cobros.map(c => ({ ts: c.ts, dia: c.dia, monto: c.monto, detalle: c.etiqueta, pago: nombreMetodo(c.metodo), tipo: 'Cobro' }))
    .concat(gastos.map(g => ({ ts: g.ts, dia: g.dia, monto: -g.monto, detalle: nombreGasto(g.tipo), pago: '', tipo: 'Gasto' })))
    .sort((a, b) => a.ts - b.ts);
  const filas = [['Fecha', 'Hora', 'Monto (S/)', 'Destino / Gasto', 'Pago', 'Tipo']];
  movimientos.forEach(m => {
    const d = new Date(m.ts);
    filas.push([m.dia, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, (m.monto / 100).toFixed(2), m.detalle, m.pago, m.tipo]);
  });
  const BOM = String.fromCharCode(0xFEFF);   // con esto Excel lee bien las tildes
  const csv = BOM + filas.map(f => f.map(celda).join(',')).join('\r\n');
  descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `cobros-colectivo-${claveDia(Date.now())}.csv`);
}

/** "5 cobros", "5 cobros y 2 gastos" o "2 gastos" (si solo hay gastos). */
const cuantos = (c, g) => (c && g ? `${plural(c, 'cobro', 'cobros')} y ${plural(g, 'gasto', 'gastos')}` : g ? plural(g, 'gasto', 'gastos') : plural(c, 'cobro', 'cobros'));

/* ───────────── Copia de seguridad ───────────── */

const DIAS_SIN_COPIA = 7;          // pasado este tiempo sin copia, aparece un puntito de aviso en Ajustes
let actualizacionLista = false;    // hay una versión nueva de la app esperando

const diasEntre = (a, b) => Math.round((fechaDe(b) - fechaDe(a)) / 864e5);

/** Muestra cuándo fue la última copia y enciende el puntito de aviso de Ajustes si toca hacer una (o hay versión nueva). */
function pintarCopia() {
  const t = ajustes.ultimaCopia;
  const primero = Math.min(cobros.length ? cobros[0].ts : Infinity, gastos.length ? gastos[0].ts : Infinity);
  const hayDatos = primero !== Infinity;
  const desde = t || (hayDatos ? primero : 0);                      // sin copia: se cuenta desde el primer movimiento
  const pendiente = hayDatos && diasEntre(claveDia(desde), hoyClave) >= DIAS_SIN_COPIA;
  const dias = t ? diasEntre(claveDia(t), hoyClave) : 0;
  const estado = $('#copia-estado');
  estado.textContent = !t ? 'Aún no has guardado ninguna copia.' : dias <= 0 ? 'Última copia: hoy.' : `Última copia: hace ${plural(dias, 'día', 'días')}.`;
  estado.classList.toggle('aviso', pendiente);
  $('.tab[data-vista="ajustes"]').toggleAttribute('data-aviso', pendiente || actualizacionLista);
}

function crearCopia() {
  return { app: 'colectivo', version: 2, creada: new Date().toISOString(), tarifas, cobros: cobros.map(cobroAFila), gastos: gastos.map(gastoAFila) };
}

/** Lee el texto de un archivo de copia. Devuelve { cobros, gastos, tarifas } o null si no es una copia de Colectivo.
    `gastos` es null en las copias viejas (anteriores a los gastos). */
function leerCopia(texto) {
  let d;
  try { d = JSON.parse(texto); } catch (e) { return null; }
  if (!d || d.app !== 'colectivo' || !Array.isArray(d.cobros)) return null;
  return { cobros: filasACobros(d.cobros), gastos: Array.isArray(d.gastos) ? filasAGastos(d.gastos) : null, tarifas: limpiarTarifas(d.tarifas) };
}

async function guardarCopia() {
  const nombre = `colectivo-copia-${claveDia(Date.now())}.json`;
  const texto = JSON.stringify(crearCopia());
  let mensaje = 'Copia descargada. Súbela a Drive o envíatela por WhatsApp para tenerla fuera del teléfono.';
  const archivo = window.File ? new File([texto], nombre, { type: 'application/json' }) : null;
  if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    // En el celular abre el menú de compartir: Drive, WhatsApp, etc.
    try {
      await navigator.share({ files: [archivo], title: 'Copia de seguridad de Colectivo' });
      mensaje = 'Copia guardada.';
    } catch (e) {
      if (e && e.name === 'AbortError') return;      // cerró el menú sin elegir nada
      descargar(new Blob([texto], { type: 'application/json' }), nombre);
    }
  } else {
    descargar(new Blob([texto], { type: 'application/json' }), nombre);
  }
  ajustes.ultimaCopia = Date.now();
  guardar(LS.ajustes, ajustes);
  pintarCopia();
  toast(mensaje, [], { ms: 7000 });
}

/** Lo que trae la copia y todavía no está en el teléfono (se compara por la marca de tiempo). */
function faltantes(copia) {
  const tengoC = new Set(cobros.map(c => c.ts)), tengoG = new Set(gastos.map(g => g.ts));
  return { cobros: copia.cobros.filter(c => !tengoC.has(c.ts)), gastos: (copia.gastos || []).filter(g => !tengoG.has(g.ts)) };
}

function ofrecerRestaurar(copia) {
  const nuevos = faltantes(copia);
  const n = copia.cobros.length, m = copia.gastos ? copia.gastos.length : 0;
  const dias = copia.cobros.map(c => c.dia).concat(copia.gastos ? copia.gastos.map(g => g.dia) : []).sort();
  const primero = dias[0], ultimoDia = dias[dias.length - 1];
  const rango = !dias.length ? '' : primero === ultimoDia ? ` (${fechaTexto(primero)})` : ` (del ${fechaTexto(primero)} al ${fechaTexto(ultimoDia)})`;
  abrirHoja('Restaurar copia de seguridad',
    `La copia tiene ${cuantos(n, m)}${rango}. Ahora en este teléfono tienes ${cuantos(cobros.length, gastos.length)}.`, [
      { etq: `Unir con lo que tengo (+${nuevos.cobros.length + nuevos.gastos.length} nuevos)`, fn: () => restaurar(copia, true) },
      { etq: 'Reemplazar todo con la copia', tipo: 'peligro', fn: () => restaurar(copia, false) },
    ]);
}

/** unir = true: se suman solo los que faltan (las tarifas no se tocan) · false: se reemplazan cobros, gastos y tarifas por los de la copia. */
function restaurar(copia, unir) {
  const antes = { cobros, gastos, tarifas };
  let aviso;
  if (unir) {
    const nuevos = faltantes(copia);
    cobros = cobros.concat(nuevos.cobros).sort((a, b) => a.ts - b.ts);
    gastos = gastos.concat(nuevos.gastos).sort((a, b) => a.ts - b.ts);
    aviso = `Se agregaron ${cuantos(nuevos.cobros.length, nuevos.gastos.length)}.`;
  } else {
    cobros = copia.cobros;
    if (copia.gastos) gastos = copia.gastos;         // una copia vieja (sin gastos) no borra los gastos que ya tienes
    if (copia.tarifas) tarifas = copia.tarifas;
    aviso = `Copia restaurada: ${cuantos(copia.cobros.length, copia.gastos ? copia.gastos.length : 0)}.`;
  }
  aplicarDatos();
  toast(aviso, [{ etq: 'Deshacer', fn: () => { cobros = antes.cobros; gastos = antes.gastos; tarifas = antes.tarifas; aplicarDatos(); } }], { ms: 10000 });
}

/** Guarda y repinta todo después de cambiar cobros, gastos y/o tarifas de golpe. */
function aplicarDatos() {
  ultimo = null;
  guardarCobros();
  guardarGastos();
  guardarTarifas();
  construirTarifas();
  if (vista === 'ajustes') construirEditor();
  refrescarTodo();
}

/** Borra un grupo de cobros y gastos: pide confirmar y deja 10 segundos para deshacer (el deshacer los devuelve a su lugar). */
function borrarGrupo(cobrosFuera, gastosFuera, titulo, detalle, botonSi, aviso) {
  abrirHoja(titulo, detalle, [{
    etq: botonSi, tipo: 'peligro',
    fn: () => {
      const c = new Set(cobrosFuera), g = new Set(gastosFuera);
      cobros = cobros.filter(x => !c.has(x));
      gastos = gastos.filter(x => !g.has(x));
      ultimo = null;
      guardarCobros();
      guardarGastos();
      refrescarTodo();
      toast(aviso, [{
        etq: 'Deshacer',
        fn: () => {
          cobros = cobros.concat(cobrosFuera).sort((a, b) => a.ts - b.ts);
          gastos = gastos.concat(gastosFuera).sort((a, b) => a.ts - b.ts);
          guardarCobros();
          guardarGastos();
          refrescarTodo();
        },
      }], { ms: 10000 });
    },
  }]);
}

/** Borra el historial (cobros y gastos) del día que se está viendo en Cobros. */
function borrarDia() {
  const clave = diaSel, lista = cobrosDelDia(clave), gastosDia = gastosDelDia(clave);
  if (!lista.length && !gastosDia.length) return;
  const cuando = clave === hoyClave ? 'de hoy' : clave === sumarDias(hoyClave, -1) ? 'de ayer' : 'del ' + fechaTexto(clave);
  const que = lista.length && gastosDia.length ? 'los cobros y gastos' : gastosDia.length ? 'los gastos' : 'los cobros';
  const partes = [
    lista.length ? `${plural(lista.length, 'cobro', 'cobros')} (${soles(sumar(lista))})` : '',
    gastosDia.length ? `${plural(gastosDia.length, 'gasto', 'gastos')} (${soles(sumar(gastosDia))})` : '',
  ].filter(Boolean).join(' y ');
  borrarGrupo(lista, gastosDia, `¿Borrar ${que} ${cuando}?`,
    `Vas a eliminar ${partes}. Los demás días no se tocan.`,
    'Sí, borrar este día',
    `Listo: ${cuantos(lista.length, gastosDia.length)} ${lista.length + gastosDia.length === 1 ? 'borrado' : 'borrados'} ${cuando}.`);
}

/** Borra el historial (cobros y gastos) de todos los días. */
function borrarTodo() {
  if (!cobros.length && !gastos.length) return;
  const dias = new Set(cobros.map(c => c.dia).concat(gastos.map(g => g.dia))).size;
  const total = cuantos(cobros.length, gastos.length);
  borrarGrupo(cobros.slice(), gastos.slice(), '¿Borrar todo el historial?',
    `Vas a eliminar ${total} de ${plural(dias, 'día', 'días')}. Si los necesitas, guarda antes una copia de seguridad en Ajustes.`,
    'Sí, borrar todo el historial',
    `Listo: ${total} ${cobros.length + gastos.length === 1 ? 'borrado' : 'borrados'}.`);
}

/* ───────────── Avisos y hoja inferior ───────────── */

let temporizadorToast = 0;

function toast(texto, acciones = [], { ms = 5000 } = {}) {
  const el = $('#toast');
  el.textContent = '';
  el.append(h('span', { class: 'toast-texto' }, texto));
  acciones.forEach(a => el.append(h('button', { type: 'button', class: 'toast-btn', onclick: () => { ocultarToast(); a.fn(); } }, a.etq)));
  el.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(ocultarToast, ms);
}
function ocultarToast() {
  clearTimeout(temporizadorToast);
  $('#toast').classList.remove('visible');
}

/** Hoja inferior con botones. Si se pasa `campo`, muestra además una casilla de monto: las acciones con
    `pide: true` reciben el monto en céntimos (y la hoja no se cierra mientras el monto no sea válido). */
function abrirHoja(titulo, sub, acciones, campo) {
  $('#hoja-titulo').textContent = titulo;
  $('#hoja-sub').textContent = sub || '';
  const cont = $('#hoja-acciones');
  cont.textContent = '';
  let entrada = null, error = null;
  if (campo) {
    entrada = h('input', { class: 'campo monto', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: campo.valor || '', 'aria-label': campo.etiqueta });
    error = h('p', { class: 'hoja-error', hidden: true }, 'Escribe un monto válido, por ejemplo 40 o 25.50');
    entrada.addEventListener('input', () => { error.hidden = true; });
    cont.append(h('div', { class: 'hoja-monto' }, h('span', { class: 'prefijo' }, 'S/'), entrada), error);
  }
  const botones = acciones.map(a => h('button', {
    type: 'button', class: 'hoja-btn' + (a.tipo ? ' ' + a.tipo : ''),
    onclick: () => {
      if (!a.pide) { cerrarHoja(); a.fn(); return; }
      const monto = leerMonto(entrada.value);
      if (monto == null) { error.hidden = false; entrada.focus(); return; }
      cerrarHoja();
      a.fn(monto);
    },
  }, a.etq));
  botones.forEach(b => cont.append(b));
  cont.append(h('button', { type: 'button', class: 'hoja-btn cancelar', onclick: cerrarHoja }, 'Cerrar'));
  if (entrada) {
    entrada.addEventListener('keydown', e => {           // Enter en el teclado = el primer botón que pide monto
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const i = acciones.findIndex(a => a.pide);
      if (i >= 0) botones[i].click();
    });
  }
  $('#hoja').hidden = false;
  if (entrada) setTimeout(() => { entrada.focus(); entrada.select(); }, 60);
}
function cerrarHoja() { $('#hoja').hidden = true; }

/* ───────────── Navegación, pantalla encendida y arranque ───────────── */

function mostrarVista(nombre) {
  vista = nombre;
  $$('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + nombre));
  $$('.tab').forEach(t => { if (t.dataset.vista === nombre) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  ocultarToast();
  if (nombre === 'cobros') { diaSel = hoyClave; renderCobros(); }
  if (nombre === 'ajustes') construirEditor();
  const scroll = $('#vista-' + nombre + ' .scroll');
  if (scroll) scroll.scrollTop = 0;
}

// Si la app queda abierta pasada la medianoche, “Hoy” pasa al día nuevo.
function revisarDia() {
  const k = claveDia(Date.now());
  if (k === hoyClave) return;
  if (diaSel === hoyClave) diaSel = k;
  hoyClave = k;
  refrescarTodo();
}

let candado = null;
async function pedirPantalla() {
  if (!ajustes.pantalla || candado || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    candado = await navigator.wakeLock.request('screen');
    candado.addEventListener('release', () => { candado = null; });
  } catch (e) { candado = null; }
}
function soltarPantalla() {
  if (candado) { candado.release().catch(() => {}); candado = null; }
}

function iniciar() {
  fijarMetodo('efectivo');
  construirTarifas();
  pintarUltimo();
  pintarCopia();

  // Cobrar
  $('#tarifas').addEventListener('click', e => {
    const taxi = e.target.closest('.taxi');
    if (taxi) { cobrarTaxi(taxi); return; }
    const b = e.target.closest('.tarifa');
    const t = b && tarifas.find(x => x.id === b.dataset.id);
    if (t) cobrar(t, b);
  });
  $('.metodo').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) fijarMetodo(b.dataset.metodo);
  });

  // Pantalla completa (donde el navegador lo permita)
  const btnPantalla = $('#btn-pantalla');
  if (document.documentElement.requestFullscreen) {
    btnPantalla.hidden = false;
    btnPantalla.addEventListener('click', () => {
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    });
  }

  // Pestañas
  $$('.tab').forEach(t => t.addEventListener('click', () => mostrarVista(t.dataset.vista)));

  // Cobros
  $('#dia-prev').addEventListener('click', () => irADia(sumarDias(diaSel, -1)));
  $('#dia-next').addEventListener('click', () => irADia(sumarDias(diaSel, 1)));
  const picker = $('#dia-picker');
  picker.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(picker.value)) irADia(picker.value); });
  picker.addEventListener('click', () => { try { picker.showPicker(); } catch (e) { /* el navegador lo abre solo */ } });

  // Ajustes
  $$('[data-ajuste]').forEach(b => {
    const k = b.dataset.ajuste;
    b.setAttribute('aria-checked', String(!!ajustes[k]));
    b.addEventListener('click', () => {
      ajustes[k] = !ajustes[k];
      b.setAttribute('aria-checked', String(ajustes[k]));
      guardar(LS.ajustes, ajustes);
      if (k === 'pantalla') { if (ajustes.pantalla) pedirPantalla(); else soltarPantalla(); }
      if (k === 'vibracion' && ajustes.vibracion && navigator.vibrate) navigator.vibrate(30);
      if (k === 'sonido' && ajustes.sonido) beep('efectivo');
    });
  });
  $('#btn-agregar').addEventListener('click', agregarTarifa);
  $('#btn-csv').addEventListener('click', exportarCSV);
  $('#btn-copia').addEventListener('click', guardarCopia);
  $('#btn-restaurar').addEventListener('click', () => $('#archivo-copia').click());
  $('#archivo-copia').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';                       // así se puede volver a elegir el mismo archivo
    if (!f) return;
    let copia = null;
    try { if (f.size < 20e6) copia = leerCopia(await f.text()); } catch (err) { /* no se pudo leer */ }
    if (copia) ofrecerRestaurar(copia);
    else toast('Ese archivo no es una copia de seguridad de Colectivo.', [], { ms: 6000 });
  });
  $('#btn-actualizar').addEventListener('click', () => location.reload());
  $('#btn-borrar').addEventListener('click', () => (cobros.length || gastos.length ? borrarTodo() : toast('No hay historial que borrar.')));
  reemplazarHijos($('#gastos-botones'), TIPOS_GASTO.map(t => h('button', { type: 'button', class: 'btn-gasto', onclick: () => nuevoGasto(t.id) }, '+ ' + t.nombre)));
  $('#btn-borrar-dia').addEventListener('click', borrarDia);
  $('#btn-borrar-todo').addEventListener('click', borrarTodo);

  // Hoja inferior
  $('#hoja-fondo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });

  // Instalar como app (Android / Chrome)
  let instalador = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    instalador = e;
    $('#btn-instalar').hidden = false;
  });
  $('#btn-instalar').addEventListener('click', async () => {
    if (!instalador) return;
    instalador.prompt();
    try { await instalador.userChoice; } catch (e) { /* cancelado */ }
    instalador = null;
    $('#btn-instalar').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btn-instalar').hidden = true; });

  // Pantalla encendida y cambio de día
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { pedirPantalla(); revisarDia(); }
  });
  setInterval(revisarDia, 60000);
  pedirPantalla();

  // Pedir al navegador que no borre los datos cuando le falte espacio
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Funcionar sin internet (solo cuando se abre desde http/https)
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    const yaHabiaVersion = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Si se instala una versión nueva, no se recarga sola (podrías estar cobrando): se avisa con un puntito en Ajustes.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!yaHabiaVersion) return;
      actualizacionLista = true;
      $('#btn-actualizar').hidden = false;
      pintarCopia();
    });
  }
}

iniciar();
