/* =====================================================================
   AVISOS Y CONFIRMACIONES CON EL ESTILO DE UMMANA
   (reemplazan las ventanitas grises del navegador: alert / confirm)
   ===================================================================== */
/* =====================================================================
   ÍCONOS: un solo set de línea fina (en el color del texto / dorado), en vez de emojis.
   En el HTML se escriben como <i data-ico="nombre"></i> y acá se convierten.
   ===================================================================== */
const ICONOS = {
  glosario:'<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
  suero:'<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>',
  pdf:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  inicio:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  lista:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  cajas:'<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  pacientes:'<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  profesionales:'<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
  conceptos:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  proveedores:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  deudores:'<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
  cremas:'<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  conta:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  informes:'<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  recibo:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  subir:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  descargar:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  ojo:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ajustes:'<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  bandera:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  paquete:'<path d="m7.5 4.3 9 5.2"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
  lapiz:'<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  alerta:'<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  buscar:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  porcentaje:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
};
function ico(n){ return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n] || ''}</svg>`; }
document.querySelectorAll('i[data-ico]').forEach(el=> el.outerHTML = ico(el.dataset.ico));

/* ---- Lista de descuentos (editable por administradores en Menú → Descuentos).
   Se guarda en presupuestos/_descuentos (colección que ya existe: no hace falta cambiar las reglas). */
const DESC_INICIALES = [{n:'EFECTIVO', p:10}, {n:'PROTOCOLO + DE 1 SESION', p:20}, {n:'JORNADA DE TRATAMIENTOS', p:20}, {n:'UMMANOS', p:40}, {n:'FAMILIA', p:40}];
let descuentosLista = DESC_INICIALES.slice();
const descEtiqueta = d=> `${d.n.charAt(0) + d.n.slice(1).toLowerCase()} ${d.p}%`;
function refrescarSelectsDescuento(){
  const escAttr = v=> String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'), escHtml = escAttr;   // (las globales se definen más abajo)
  const html = '<option value="">Sin descuento</option>' + descuentosLista.map(d=> `<option value="${d.p}|${escAttr(descEtiqueta(d))}">${escHtml(descEtiqueta(d))}</option>`).join('');
  ['prDesc','selDescMov','trDesc'].forEach(id=>{
    const sel = document.getElementById(id); if(!sel) return;
    const v = sel.value;
    sel.innerHTML = html;
    if(v){
      if(![...sel.options].some(o=> o.value===v)) sel.insertAdjacentHTML('beforeend', `<option value="${escAttr(v)}">${escHtml(v.split('|')[1]||'')}</option>`);
      sel.value = v;
    }
  });
}
let unsubDesc = null;
function suscribirDescuentos(){
  if(unsubDesc) unsubDesc();
  unsubDesc = db.collection('presupuestos').doc('_descuentos').onSnapshot(d=>{
    const l = d.exists && Array.isArray(d.data().lista) ? d.data().lista : null;
    descuentosLista = l && l.length ? l : DESC_INICIALES.slice();
    refrescarSelectsDescuento();
  }, ()=>{});
}

const ummDlgCola = [];
let ummDlgAbierto = false;
function ummDlgHtml(msg){
  return String(msg ?? '').replace(/[&<>"]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/\n/g,'<br>');
}
function ummDlgSiguiente(){
  if(ummDlgAbierto || !ummDlgCola.length) return;
  const {msg, botones, resolver} = ummDlgCola.shift();
  ummDlgAbierto = true;
  const previo = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'umm-dlg';
  ov.innerHTML = `<div class="umm-dlg-card" role="alertdialog" aria-modal="true"><div class="umm-dlg-msg">${ummDlgHtml(msg)}</div>
    <div class="umm-dlg-acc">${botones.map((b,i)=> `<button type="button" class="btn ${b.primario ? 'btn-primary' : ''}" data-i="${i}">${ummDlgHtml(b.txt)}</button>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=> ov.classList.add('show'));
  const cerrar = valor=>{
    document.removeEventListener('keydown', teclas, true);
    ov.remove(); ummDlgAbierto = false;
    if(previo && previo.focus && document.contains(previo)) try{ previo.focus({preventScroll:true}); }catch(_){}
    resolver(valor);
    ummDlgSiguiente();
  };
  const teclas = e=>{
    if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); const c = botones.find(b=> b.cancelar); cerrar(c ? c.valor : false); }
    else if(e.key==='Enter'){ e.preventDefault(); e.stopImmediatePropagation(); cerrar(botones.find(b=> b.primario).valor); }
  };
  document.addEventListener('keydown', teclas, true);
  ov.querySelectorAll('button').forEach(b=> b.onclick = ()=> cerrar(botones[+b.dataset.i].valor));
  setTimeout(()=>{ const p = ov.querySelector('.btn-primary'); if(p) p.focus({preventScroll:true}); }, 30);
}
function ummAviso(msg){
  return new Promise(res=>{ ummDlgCola.push({msg, botones: [{txt: 'Entendido', valor: true, primario: true, cancelar: true}], resolver: res}); ummDlgSiguiente(); });
}
function ummConfirm(msg, o = {}){
  return new Promise(res=>{ ummDlgCola.push({msg, botones: [{txt: o.no || 'Cancelar', valor: false, cancelar: true}, {txt: o.si || 'Aceptar', valor: true, primario: true}], resolver: res}); ummDlgSiguiente(); });
}
window.alert = msg=> { ummAviso(msg); };

/* =====================================================================
   CONFIGURACIÓN DE FIREBASE
   Reemplazá estos valores por los de tu proyecto de Firebase
   (Configuración del proyecto → Tus apps → SDK setup and configuration).
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAql_waJ1I2gIeV6V3MCwVx0OhncgxCsko",
  authDomain: "ummanasistema.firebaseapp.com",
  projectId: "ummanasistema",
  storageBucket: "ummanasistema.firebasestorage.app",
  messagingSenderId: "370814125756",
  appId: "1:370814125756:web:0a42e08ba90376fab032b9"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// Caché local de Firestore: al recargar la página no se vuelve a leer todo desde el servidor,
// solo lo que cambió (baja mucho las "lecturas" que cuenta Firebase). Sirve con varias pestañas abiertas.
db.enablePersistence({ synchronizeTabs: true }).catch(err=> console.warn('Sin caché local de Firestore:', err.code));

/* =====================================================================
   CATÁLOGO DE PROFESIONALES / CONCEPTOS
   Ahora vive en Firestore, colección "conceptos" — un doc por cada
   concepto/tratamiento: { profesional, concepto, codigo }.
   CONCEPTOS se arma en vivo agrupando esa colección por profesional.
   Se carga vacío al principio: importá el catálogo con el botón
   "Importar catálogo" (solo administradores) para completarlo.
   ===================================================================== */
let CONCEPTOS = {};              // { "SUEROTERAPIA": [{concepto, codigo}, ...], ... }
let CODIGO_POR_CONCEPTO = {};    // "SUEROTERAPIA||SUERO BASE..." -> "SUE-01", para buscar el código al guardar
let TIPO_POR_CONCEPTO = {};      // "SUEROTERAPIA||SUERO BASE..." -> "ingreso" | "egreso" (por defecto: ingreso)
function esEgreso(prof, concepto){ return TIPO_POR_CONCEPTO[prof+"||"+concepto] === "egreso"; }
// Movimientos migrados de la planilla vieja: traen su propio tipo (los conceptos viejos no están en el catálogo)
function esGastoMov(m){ return m && m.migrado ? m.tipo === 'egreso' : esEgreso(m.prof, m.concepto); }
const noMigrado = m => !m.migrado;
// Áreas que no cuentan como "área de Ummana" en la ficha del paciente
const NO_ES_AREA = /^(CAJA DIARIA|ALQUILER CONSUL|GASTOS )/i;
// Mes con información migrada de la planilla (dic 2024 → ago 2026)
const MIGRADO_HASTA = '2026-08', MIGRADO_DESDE = '2024-12';
function esViejoCatalogo(m, campo){
  if(!m.migrado) return false;
  const lista = CONCEPTOS[m.prof];
  if(campo==='prof') return !lista;
  return !lista || !lista.some(c=> c.concepto === m.concepto);
}

const MEDIO_LABELS = {
  efectivo: (m)=> m.moneda==="USD" ? "Efectivo USD" : "Efectivo $",
  mp: ()=> "Mercado Pago",
  tarjeta: ()=> "Tarjeta",
  transferencia: ()=> "Transferencia",
};

// ---------------- ESTADO LOCAL (espejo en vivo de Firestore) ----------------
let currentUser = null;       // {uid, nombre, rol}
let pacienteRegistry = [];    // ["APELLIDO, Nombre", ...]
let nombresPacientes = new Set();   // para que los nombres de la tabla abran la ficha
let movimientos = [];         // espejo local de "movimientos" del mes que se está mirando (tabla + filtros)
let movimientosHoy = [];      // espejo local de los movimientos de HOY, sin importar qué mes se esté mirando (caja, reportes)
let movimientosDeuda = [];    // espejo local de todas las deudas pendientes, de cualquier fecha (deudores)
let cajaActual = null;        // doc de la sesión de caja abierta (o null)
let ultimoCierre = null;      // último cierre registrado (para sugerir la próxima apertura)
let ultimoCierreUsd = null;   // ídem, en dólares

function excelSerialToISODate(valor){
  const n = Number(valor);
  // Excel guarda las fechas como un número de días desde el 30/12/1899.
  // Solo lo tratamos como fecha si es un número entero "razonable" (entre 1900 y 2100 aprox).
  if(!valor || isNaN(n) || !/^\d+$/.test(String(valor).trim()) || n < 1 || n > 73000) return valor;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,'0')+"-"+String(d.getUTCDate()).padStart(2,'0');
}

function formatearMiles(input){
  const raw = input.value.replace(/\D/g,"");
  input.value = raw ? Number(raw).toLocaleString('es-AR') : "";
}

function todosLosNombresDeProfesionales(){
  const set = new Set(Object.keys(CONCEPTOS));
  profesionalesFullList.forEach(p=> set.add(p.nombre));
  return [...set].sort((a,b)=> a.localeCompare(b,'es'));
}

function hoyISO(){
  const d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0');
}
function isoToDisplay(iso){
  const [y,m,d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}
function fmtTotal(m){
  const pref = m.moneda==="USD" ? "US$ " : "$";
  return pref + Number(m.valor).toLocaleString('es-AR') + (m.valorUsd ? ' + US$ ' + Number(m.valorUsd).toLocaleString('es-AR') : '');
}
function fmtMonto(valor, moneda){
  const pref = moneda==="USD" ? "US$ " : "$";
  return pref + Number(valor).toLocaleString('es-AR');
}
// Devuelve el array de pagos de un movimiento, con compatibilidad para
// movimientos viejos que todavía tienen un solo medio/valor a nivel raíz
// (antes de que existiera el reparto en varios pagos).
function pagosDe(m){
  if(m.pagos && m.pagos.length) return m.pagos.map(p=> ({cobradoPor: 'ummana', ...p}));
  if(m.medio) return [{medio: m.medio, valor: m.valor, saldada: !!m.saldada, fechaSaldadoISO: m.fechaSaldadoISO||null, fechaSaldadoDisplay: m.fechaSaldadoDisplay||null, cobradoPor: 'ummana'}];
  return [];
}
// Moneda y monto reales de un pago (puede ser distinto del total si se pagó en otra moneda con cotización)
const pagoMoneda = (m, p) => p.moneda || m.moneda;
const pagoMontoReal = p => p.montoOriginal!=null ? Number(p.montoOriginal) : Number(p.valor);
function medioLabelDe(medio, moneda){
  return MEDIO_LABELS[medio] ? MEDIO_LABELS[medio]({moneda}) : medio;
}
function medioDisplayText(m){
  return pagosDe(m).map(p=>{
    if(p.medio==="debe") return p.saldada ? `Pagó ${fmtMonto(pagoMontoReal(p), pagoMoneda(m, p))}${p.fechaSaldadoDisplay ? ' el ' + p.fechaSaldadoDisplay : ''}` : "Debe";
    return medioLabelDe(p.medio, pagoMoneda(m, p));
  }).join(', ');
}
function medioBadgesHTML(m){
  const pagos = pagosDe(m);
  const varios = pagos.length > 1;
  return pagos.map(p=>{
    const otra = p.moneda && p.moneda !== m.moneda;
    const montoTxt = (varios || otra) ? ` ${fmtMonto(pagoMontoReal(p), pagoMoneda(m, p))}${otra && p.cotizacion ? ` (×${Number(p.cotizacion).toLocaleString('es-AR')})` : ''}` : "";
    if(p.medio==="debe"){
      if(p.saldada) return `<span class="badge badge-pagado">Pagó ${fmtMonto(pagoMontoReal(p), pagoMoneda(m, p))}${p.fechaSaldadoDisplay ? ' el ' + p.fechaSaldadoDisplay : ''}</span>`;
      return `<span class="badge badge-debe">Debe${montoTxt}</span>`;
    }
    return `<span class="badge badge-${p.medio}">${medioLabelDe(p.medio, pagoMoneda(m, p))}${montoTxt}</span>`;
  }).join('');
}
function cobroDesglose(m){
  const pagos = pagosDe(m);
  const totalUmmana = pagos.filter(p=>p.cobradoPor!=="profesional").reduce((a,p)=>a+p.valor,0);
  const totalProfesional = pagos.filter(p=>p.cobradoPor==="profesional").reduce((a,p)=>a+p.valor,0);
  return {totalUmmana, totalProfesional, hayAmbos: totalUmmana>0 && totalProfesional>0};
}
function cobroBadgesHTML(m){
  const {totalUmmana, totalProfesional, hayAmbos} = cobroDesglose(m);
  const lineas = [];
  if(totalUmmana>0) lineas.push(`Ummana${hayAmbos ? " " + fmtMonto(totalUmmana, m.moneda) : ""}`);
  if(totalProfesional>0) lineas.push(`Profesional${hayAmbos ? " " + fmtMonto(totalProfesional, m.moneda) : ""}`);
  return lineas.join('<br>');
}
function cobroTextoPlano(m){
  const {totalUmmana, totalProfesional, hayAmbos} = cobroDesglose(m);
  const partes = [];
  if(totalUmmana>0) partes.push(`Ummana${hayAmbos ? " " + fmtMonto(totalUmmana, m.moneda) : ""}`);
  if(totalProfesional>0) partes.push(`Profesional${hayAmbos ? " " + fmtMonto(totalProfesional, m.moneda) : ""}`);
  return partes.join(' / ');
}
function tieneDeudaPendiente(pagos){
  return pagos.some(p=>p.medio==="debe" && !p.saldada);
}

/* =====================================================================
   LOGIN
   ===================================================================== */
document.getElementById('btnLogin').onclick = ()=> intentarLogin();
document.getElementById('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') intentarLogin(); });

function intentarLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.classList.add('col-hidden');
  if(!email || !pass){ err.textContent = "Completá email y contraseña."; err.classList.remove('col-hidden'); return; }
  auth.signInWithEmailAndPassword(email, pass).catch(e=>{
    err.textContent = "No pudimos iniciar sesión: revisá el email y la contraseña.";
    err.classList.remove('col-hidden');
  });
}
document.getElementById('btnLogout').onclick = ()=> auth.signOut().then(()=> location.replace('../'));
/* ---------- Menú desplegable ---------- */
const btnMenu = document.getElementById('btnMenu');
const menuDropdown = document.getElementById('menuDropdown');
// El menú se ubica siempre dentro de la pantalla (celular vertical/horizontal, cualquier ancho)
function ubicarMenu(){
  const r = btnMenu.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 8;
  const ancho = Math.min(270, vw - m*2);
  let left = r.right - ancho;                       // alineado al borde derecho del botón
  if(left < m) left = Math.min(r.left, vw - ancho - m);   // si no entra, alineado al borde izquierdo
  left = Math.max(m, Math.min(left, vw - ancho - m));
  const top = r.bottom + 10;
  Object.assign(menuDropdown.style, {position:'fixed', left:left+'px', right:'auto', top:top+'px', width:ancho+'px',
    maxHeight:Math.max(160, vh - top - m)+'px', overflowY:'auto', overscrollBehavior:'contain'});
}
window.addEventListener('resize', ()=>{ if(menuDropdown.classList.contains('open')) ubicarMenu(); });
function abrirMenu(){
  ubicarMenu();
  menuDropdown.classList.add('open');
  btnMenu.setAttribute('aria-expanded','true');
  // índice para la animación escalonada (solo ítems visibles)
  [...menuDropdown.querySelectorAll('.menu-links button')]
    .filter(b=>!b.classList.contains('col-hidden'))
    .forEach((b,i)=> b.style.setProperty('--i', i));
}
function cerrarMenu(){
  menuDropdown.classList.remove('open');
  btnMenu.setAttribute('aria-expanded','false');
}
btnMenu.onclick = (e)=>{
  e.stopPropagation();
  menuDropdown.classList.contains('open') ? cerrarMenu() : abrirMenu();
};
document.getElementById('menuClose').onclick = (e)=>{ e.stopPropagation(); cerrarMenu(); btnMenu.focus(); };
document.addEventListener('click', (e)=>{
  if(menuDropdown.classList.contains('open') && !document.getElementById('menuWrap').contains(e.target)) cerrarMenu();
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape' && menuDropdown.classList.contains('open')){ e.preventDefault(); cerrarMenu(); btnMenu.focus(); }
});
// al elegir una opción, el menú se cierra (el handler propio de cada botón sigue funcionando)
menuDropdown.querySelectorAll('.menu-links button').forEach(b=> b.addEventListener('click', cerrarMenu));

/* ---------- Vista previa (solo lectura con la caja cerrada) ---------- */
let vistaPrevia = false;
// Recepcionistas: solo cargan/editan movimientos con SU caja abierta (la que abrió otra la pueden ver, no tocar)
const cajaDeOtra = ()=> !!currentUser && currentUser.rol !== 'admin' && !!cajaActual && cajaActual.recepcionista !== currentUser.nombre;
function soloLectura(){
  return !!currentUser && currentUser.rol !== 'admin' && (!cajaActual || cajaDeOtra());
}
function toggleVistaPrevia(){
  vistaPrevia = !vistaPrevia;
  actualizarEstadoCaja();
}
document.getElementById('btnVistaPrevia').onclick = toggleVistaPrevia;
document.getElementById('btnVistaPreviaGate').onclick = toggleVistaPrevia;

// Mientras se guarda una fila de un panel, no se redibuja la lista desde Firestore:
// si no, la fila se reemplaza en medio del guardado (se pierde el "¡Guardado!", el
// scroll salta y se borran cambios sin guardar de otras filas).
/* ---------- Todo en MAYÚSCULAS ---------- */
// Mayúsculas y vocales sin tilde (Á→A, É→E, Í→I, Ó→O, Ú→U). La Ñ queda como está.
const SIN_TILDE = {'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U'};
const mayus = v => typeof v === 'string'
  ? v.toLocaleUpperCase('es-AR').replace(/[ÁÉÍÓÚ]/g, c=> SIN_TILDE[c])
  : v;
// Para comparar en buscadores sin importar mayúsculas ni tildes
const normBusqueda = v => (v||"").toString().toLowerCase().normalize('NFD').replace(/[\u0301]/g,'').normalize('NFC');
// Campos de texto que se guardan siempre en mayúsculas, por colección
const CAMPOS_MAYUS = {
  movimientos:   ['pac','prof','concepto','codigo','notas'],
  sueros:        ['tercero','detalle'],
  pacientes:    ['apellido','nombre','nombreCompleto','medioLlegada'],
  profesionales: ['nombre'],
  conceptos:     ['profesional','concepto','codigo'],
  proveedores:   ['nombre'],
};
function mayusDoc(coleccion, dato){
  const out = {...dato};
  (CAMPOS_MAYUS[coleccion]||[]).forEach(k=>{ if(typeof out[k]==='string') out[k] = mayus(out[k]); });
  return out;
}
// Todo lo que se escribe en un campo de texto pasa a mayúsculas al instante
// (excepto login, emails, contraseñas, fechas, teléfonos, números y campos marcados data-no-mayus).
document.addEventListener('input', (e)=>{
  const el = e.target;
  if(!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if(el instanceof HTMLInputElement && !['text','search',''].includes((el.getAttribute('type')||'').toLowerCase())) return;
  if(el.hasAttribute('data-no-mayus') || el.closest('#loginScreen, .login-card')) return;
  const v = el.value, up = mayus(v);
  if(v === up) return;
  const a = el.selectionStart, b = el.selectionEnd;
  el.value = up;
  try{ el.setSelectionRange(a, b); }catch(_){}
}, true);

let pausaRenderPaneles = 0;
function conPausaRender(fn){
  return async function(...args){
    pausaRenderPaneles++;
    try{ return await fn.apply(this, args); }
    finally{ setTimeout(()=>{ pausaRenderPaneles = Math.max(0, pausaRenderPaneles-1); }, 600); }
  };
}
let unsubSueros = null;
let unsubMovimientos = null, unsubPacientes = null, unsubCajaAbierta = null, unsubHoy = null, unsubDeuda = null, unsubConceptos = null, unsubProfesionales = null, unsubProveedores = null;
let profesionalesFullList = [];
let proveedoresFullList = [];
let proveedoresRegistry = [];

// Se arranca recién cuando cargaron todos los archivos js (ver el final de extras.js)
const alCambiarSesion = async (user)=>{
  if(!user){
    location.replace('../');   // el login es único, en ummanos.com.ar
    return;
    document.getElementById('loginScreen').classList.remove('col-hidden');
    document.getElementById('app').classList.add('col-hidden');
    if(unsubMovimientos) unsubMovimientos();
    if(unsubPacientes) unsubPacientes();
    if(unsubCajaAbierta) unsubCajaAbierta();
    if(unsubHoy) unsubHoy();
    if(unsubDeuda) unsubDeuda();
    if(unsubConceptos) unsubConceptos();
    if(unsubProfesionales) unsubProfesionales();
    if(unsubProveedores) unsubProveedores();
    if(unsubSueros){ unsubSueros(); unsubSueros = null; }
    if(typeof unsubCremas!=='undefined' && unsubCremas){ unsubCremas(); unsubCremas = null; }
    if(typeof unsubConta!=='undefined' && unsubConta){ unsubConta(); unsubConta = null; }
    if(typeof unsubCp!=='undefined' && unsubCp){ unsubCp(); unsubCp = null; }
    if(typeof unsubDv!=='undefined' && unsubDv){ unsubDv(); unsubDv = null; }
    if(typeof unsubVcCfg!=='undefined' && unsubVcCfg){ unsubVcCfg(); unsubVcCfg = null; }
    if(typeof unsubContaCaja!=='undefined' && unsubContaCaja){ unsubContaCaja(); unsubContaCaja = null; }
    if(unsubPortalPac){ unsubPortalPac(); unsubPortalPac = null; }
    if(unsubFichasSueros){ unsubFichasSueros(); unsubFichasSueros = null; }
    document.getElementById('portal').classList.add('col-hidden');
    return;
  }
  const doc = await db.collection('usuarios').doc(user.uid).get();
  if(!doc.exists){
    location.replace('../');
    return;
  }
  currentUser = { uid: user.uid, ...doc.data() };
  document.getElementById('loginScreen').classList.add('col-hidden');
  if(!esUsuarioCaja()){ mostrarPortal(); return; }
  document.getElementById('portal').classList.add('col-hidden');
  document.getElementById('app').classList.remove('col-hidden');
  aplicarRolUI();
  iniciarListeners();
};

/* =====================================================================
   MES SELECCIONADO (para el panel de movimientos)
   ===================================================================== */
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const hoyRef = new Date();
let mesActual = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 }; // month: 1-12

function mesInicioISO(){ return `${mesActual.year}-${String(mesActual.month).padStart(2,'0')}-01`; }
function mesFinISO(){
  let y = mesActual.year, m = mesActual.month + 1;
  if(m>12){ m=1; y++; }
  return `${y}-${String(m).padStart(2,'0')}-01`;
}
function actualizarMesLabel(){
  document.getElementById('mesLabel').textContent = `${MESES[mesActual.month-1]} ${mesActual.year}`;
  const esMesActualReal = mesActual.year===hoyRef.getFullYear() && mesActual.month===(hoyRef.getMonth()+1);
  document.getElementById('mesNext').disabled = esMesActualReal;
  const ym = `${mesActual.year}-${String(mesActual.month).padStart(2,'0')}`;
  document.getElementById('mesMigrado').classList.toggle('col-hidden', !(ym >= MIGRADO_DESDE && ym <= MIGRADO_HASTA));
  // Caja grande arranca en noviembre 2026: no se puede ir más atrás
  let enGrande = false; try{ enGrande = movSub==='grande'; }catch(_){}
  document.getElementById('mesPrev').disabled = enGrande && ym <= CG_DESDE;
}
const CG_DESDE = '2026-11';
document.getElementById('mesPrev').onclick = ()=>{
  mesActual.month--; if(mesActual.month<1){ mesActual.month=12; mesActual.year--; }
  actualizarMesLabel(); suscribirMovimientos();
  if(movSub==='prueba'){ suscribirClasesPrueba(); renderClasesPrueba(); }
  if(movSub==='deriv'){ suscribirDerivaciones(); renderDerivaciones(); }
  if(movSub==='grande') renderCajaGrande();
};
document.getElementById('mesNext').onclick = ()=>{
  mesActual.month++; if(mesActual.month>12){ mesActual.month=1; mesActual.year++; }
  actualizarMesLabel(); suscribirMovimientos();
  if(movSub==='prueba'){ suscribirClasesPrueba(); renderClasesPrueba(); }
  if(movSub==='deriv'){ suscribirDerivaciones(); renderDerivaciones(); }
  if(movSub==='grande') renderCajaGrande();
};
actualizarMesLabel();

// "Importar catálogo" es exclusivo del usuario de Fede (ni otros admins lo ven)
function esFede(){
  if(!currentUser || currentUser.rol !== 'admin') return false;
  return /^fede(rico)?\b/i.test((currentUser.nombre||'').trim());
}
// Secciones del usuario (documento usuarios/{uid}, campo "secciones")
function seccionesUsuario(){ return currentUser && Array.isArray(currentUser.secciones) ? currentUser.secciones : []; }
// Sueros completo, igual que Fede: secciones ["sueros-admin"]
function esAdminSueros(){ return esFede() || seccionesUsuario().includes('sueros-admin'); }
// Portal de sueros + Stock e Informes (sin resumen mensual ni valores): secciones ["sueros","sueros-informes"]
function suerosLimitado(){ return !esAdminSueros() && seccionesUsuario().includes('sueros-informes'); }
function aplicarRolUI(){
  const esAdmin = currentUser.rol === 'admin';
  document.getElementById('btnCierre').classList.toggle('col-hidden', esAdmin);
  document.getElementById('cajaStatus').classList.toggle('col-hidden', esAdmin);
  // Saludo centrado arriba: "Bienvenido Fede!" / "Bienvenida Tiara!"
  const pn = primerNombre();
  const nombreLindo = pn ? pn.charAt(0) + pn.slice(1).toLowerCase() : '';
  document.getElementById('bienvenida').textContent = nombreLindo ? `${NOMBRES_FEMENINOS.includes(pn) ? 'Bienvenida' : 'Bienvenido'} ${nombreLindo}!` : '';
  document.getElementById('cajaHint').classList.toggle('col-hidden', esAdmin);
  document.getElementById('btnInformes').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnImportar').classList.toggle('col-hidden', !esFede());
  document.getElementById('btnCajas').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnProfesionalesPanel').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnConceptosPanel').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnDescuentosPanel').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnProveedoresPanel').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('btnVistaMovimientos').classList.toggle('col-hidden', !esAdminSueros());
  document.getElementById('btnSueros').classList.toggle('col-hidden', !esAdminSueros());
  document.getElementById('btnCremas').classList.toggle('col-hidden', !esFede());
  document.getElementById('btnConta').classList.toggle('col-hidden', !esFede());
  document.getElementById('sBtnPacientes').classList.toggle('col-hidden', !esAdminSueros());
  // Fila de secciones arriba y los botones de cada sección debajo (cada uno ve solo lo que tiene acceso)
  const tabs = document.getElementById('fedeTabs');
  const verTab = {movimientos:true, sueros:esAdminSueros(), cremas:esFede(), informes:esAdmin, conta:esFede(), trat:esFede()};
  tabs.querySelectorAll('[data-ir]').forEach(b=> b.classList.toggle('col-hidden', !verTab[b.dataset.ir]));
  tabs.classList.toggle('una-sola', Object.values(verTab).filter(Boolean).length===1);
  tabs.classList.remove('col-hidden');
  document.getElementById('movSubTabs').classList.remove('col-hidden');
  document.getElementById('mSubCajas').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('mSubBackup').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('mSubGrande').classList.toggle('col-hidden', !esAdmin);
  // Recepcionistas: Tipo como antes (Ingreso / Egreso) y sin selector de caja (siempre CHICA). Fede y Pedro: ING / EGR + CAJA
  document.getElementById('movTipo').classList.toggle('chico', esAdmin);
  document.querySelector('#movTipo [data-tipo="ingreso"]').textContent = esAdmin ? 'ING' : 'Ingreso';
  document.querySelector('#movTipo [data-tipo="egreso"]').textContent = esAdmin ? 'EGR' : 'Egreso';
  // Recepcionistas: "Calcular pago prof." como botón y sin Menú (todo lo que usan está en los botones)
  document.getElementById('mSubPago').classList.toggle('col-hidden', esAdmin);
  document.getElementById('menuWrap').classList.toggle('col-hidden', !esAdmin);
  document.getElementById('movBar').classList.add('con-tabs');
  document.getElementById('btnNuevo').classList.add('col-hidden');   // "+ Nuevo mov." ahora está debajo de Movimientos
  mostrarVista('movimientos');
}

/* =====================================================================
   LISTENERS EN VIVO
   ===================================================================== */
function suscribirMovimientos(){
  if(unsubMovimientos) unsubMovimientos();
  unsubMovimientos = db.collection('movimientos')
    .where('fechaISO','>=', mesInicioISO())
    .where('fechaISO','<', mesFinISO())
    .orderBy('fechaISO','asc')
    .orderBy('creadoEn','asc')
    .onSnapshot(snap=>{
      movimientos = snap.docs.map(d=> ({id:d.id, ...d.data()}));
      renderTabla();
    }, err=>{
      tbody.innerHTML = `<tr><td colspan="9" style="padding:20px;text-align:left;color:#a13a3a;">
        No se pudieron cargar los movimientos: ${err.message}
      </td></tr>`;
    });
}

/* ---- PACIENTES con ahorro de lecturas ----
   Antes, cada vez que alguien abría la caja se leían TODOS los pacientes (~1.900 lecturas por apertura,
   más del 80% del consumo de Firebase). Ahora:
   · La lista completa se lee una sola vez por día en cada compu y se guarda en el navegador.
   · Después solo se escuchan los pacientes que cambian (los que tienen "modificadoEn" posterior a esa lectura).
   Por eso TODA escritura en "pacientes" tiene que llevar ...marcaPac() (y para borrar, usar borrarPaciente()). */
const PAC_CACHE_KEY = 'ummanaPacientesCache_v1';
const marcaPac = ()=> ({ modificadoEn: firebase.firestore.FieldValue.serverTimestamp() });
async function borrarPaciente(id){
  // Primero se marca (así las otras compus se enteran por su escucha) y después se borra
  await db.collection('pacientes').doc(id).update(marcaPac());
  await db.collection('pacientes').doc(id).delete();
}
function pacSerializar(lista){
  return JSON.stringify(lista, function(k, v){
    const orig = this[k];
    return (orig instanceof firebase.firestore.Timestamp) ? {__ts: [orig.seconds, orig.nanoseconds]} : v;
  });
}
function pacDeserializar(txt){
  return JSON.parse(txt, (k, v)=> (v && Array.isArray(v.__ts)) ? new firebase.firestore.Timestamp(v.__ts[0], v.__ts[1]) : v);
}
function pacLeerCache(){
  try{
    const raw = localStorage.getItem(PAC_CACHE_KEY);
    if(!raw) return null;
    const c = pacDeserializar(raw);
    if(!c || c.proyecto !== firebaseConfig.projectId || c.dia !== hoyISO() || !Array.isArray(c.docs) || !c.docs.length) return null;
    return c;
  }catch(_){ return null; }
}
// Devuelve una función para cortar la escucha (igual que onSnapshot)
function suscribirPacientes(alCambiar){
  let cortado = false, unsubDelta = null, unsubCompleto = null;
  const entregar = (lista)=>{
    if(cortado) return;
    lista = lista.filter(p=> 'apellido' in p)   // igual que orderBy('apellido'): sin apellido no aparece
      .sort((a,b)=>{ const x = String(a.apellido??''), y = String(b.apellido??''); return x<y ? -1 : x>y ? 1 : 0; });
    alCambiar(lista.filter(p=> !p.fusionadoCon));   // los duplicados unificados quedan ocultos
  };
  // Plan B: si algo de lo nuevo falla, se vuelve a la escucha completa de siempre
  const planB = (motivo)=>{
    if(cortado || unsubCompleto) return;
    console.warn('Pacientes: se usa la lectura completa', motivo);
    if(unsubDelta){ unsubDelta(); unsubDelta = null; }
    unsubCompleto = db.collection('pacientes').orderBy('apellido').onSnapshot(snap=>{
      entregar(snap.docs.map(d=> ({id:d.id, ...d.data()})));
    });
  };
  const escucharCambios = (base, marca)=>{
    const porId = new Map(base.map(p=> [p.id, p]));
    entregar([...porId.values()]);
    const borrados = new Set();
    unsubDelta = db.collection('pacientes').where('modificadoEn','>', marca).onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{ if(ch.type==='removed') borrados.add(ch.doc.id); else borrados.delete(ch.doc.id); });
      const m = new Map(porId);
      snap.docs.forEach(d=> m.set(d.id, {id:d.id, ...d.data()}));
      borrados.forEach(id=> m.delete(id));
      entregar([...m.values()]);
    }, err=> planB(err));
  };
  const cache = pacLeerCache();
  if(cache){
    escucharCambios(cache.docs, cache.marca || firebase.firestore.Timestamp.fromMillis(0));
  } else {
    db.collection('pacientes').orderBy('apellido').get().then(snap=>{
      if(cortado) return;
      const docs = snap.docs.map(d=> ({id:d.id, ...d.data()}));
      let marca = firebase.firestore.Timestamp.fromMillis(0);
      docs.forEach(p=>{ if(p.modificadoEn instanceof firebase.firestore.Timestamp && p.modificadoEn.toMillis() > marca.toMillis()) marca = p.modificadoEn; });
      try{ localStorage.setItem(PAC_CACHE_KEY, pacSerializar({proyecto: firebaseConfig.projectId, dia: hoyISO(), marca, docs})); }
      catch(e){ console.warn('Pacientes: no se pudo guardar la copia local', e); }
      escucharCambios(docs, marca);
    }).catch(err=> planB(err));
  }
  return ()=>{ cortado = true; if(unsubDelta) unsubDelta(); if(unsubCompleto) unsubCompleto(); };
}

function iniciarListeners(){
  // Pacientes
  unsubPacientes = suscribirPacientes(lista=>{
    pacientesFullList = lista;
    pacienteRegistry = pacientesFullList.map(p=> p.nombreCompleto);
    if(!pausaRenderPaneles && overlayPacientes.classList.contains('show')) renderPacientesBusqueda();
    if(vistaActual==='movimientos') renderTabla();   // para que los nombres se puedan tocar y abran la ficha
  });

  // Catálogo de profesionales/conceptos (con su código)
  unsubConceptos = db.collection('conceptos').orderBy('profesional').onSnapshot(snap=>{
    CONCEPTOS = {};
    CODIGO_POR_CONCEPTO = {};
    TIPO_POR_CONCEPTO = {};
    snap.docs.forEach(d=>{
      const c = d.data();
      if(!CONCEPTOS[c.profesional]) CONCEPTOS[c.profesional] = [];
      CONCEPTOS[c.profesional].push({id: d.id, concepto: c.concepto, codigo: c.codigo||"", tipo: c.tipo||"ingreso", detObligatorio: !!c.detObligatorio, valor: c.valor!=null ? Number(c.valor) : null, valorMoneda: c.valorMoneda==='USD' ? 'USD' : '$'});
      CODIGO_POR_CONCEPTO[c.profesional+"||"+c.concepto] = c.codigo||"";
      TIPO_POR_CONCEPTO[c.profesional+"||"+c.concepto] = c.tipo||"ingreso";
    });
    poblarProfesionalesUI();
    actualizarCampoPacienteSegunTipo();
    renderTabla();
    if(vistaActual==='trat') trRender();
    if(!pausaRenderPaneles && overlayConceptos.classList.contains('show')) renderConceptosBusqueda();
  });

  // Tipo (ingreso/egreso) de cada profesional/área
  unsubProfesionales = db.collection('profesionales').onSnapshot(snap=>{
    profesionalesFullList = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    if(!pausaRenderPaneles && overlayProfesionalesPanel.classList.contains('show')) renderProfesionalesBusqueda();
    if(!pausaRenderPaneles && overlayConceptos.classList.contains('show')) renderConceptosBusqueda();
  });

  // Proveedores/destinatarios de gastos
  unsubProveedores = db.collection('proveedores').orderBy('nombre').onSnapshot(snap=>{
    proveedoresFullList = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    proveedoresRegistry = proveedoresFullList.map(p=> p.nombre);
    if(!pausaRenderPaneles && overlayProveedores.classList.contains('show')) renderProveedoresBusqueda();
  });

  // Movimientos del mes elegido (por defecto, el mes en curso)
  suscribirMovimientos();

  // Movimientos de HOY (independiente del mes que se esté mirando) — para caja y reportes
  unsubHoy = db.collection('movimientos').where('fechaISO','==', hoyISO()).onSnapshot(snap=>{
    movimientosHoy = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    actualizarEstadoCaja();
  });

  // Deudas pendientes, de cualquier fecha — para el botón Deudores
  unsubDeuda = db.collection('movimientos').where('tieneDeudaPendiente','==',true).onSnapshot(snap=>{
    movimientosDeuda = [];
    snap.docs.forEach(d=>{
      const m = {id:d.id, ...d.data()};
      pagosDe(m).forEach((p, idx)=>{
        if(p.medio==="debe" && !p.saldada){
          movimientosDeuda.push({movId:m.id, idx, pac:m.pac, prof:m.prof, concepto:m.concepto, notas:m.notas, fechaDisplay:m.fechaDisplay, fechaISO:m.fechaISO, moneda:m.moneda, valor:p.valor});
        }
      });
    });
    renderDeudoresCount();
  });
  suscribirCpContactos();
  const DERIVACIONES_ACTIVAS = false;   // botón Derivaciones oculto por ahora: no se leen sus alarmas
  if(DERIVACIONES_ACTIVAS) suscribirDvContactos();
  pasarNotasAMayus();
  suscribirAlertas();
  suscribirDescuentos();

  // Sesión de caja abierta (si hay)
  unsubCajaAbierta = db.collection('cajaSesiones').where('cerradaEn','==', null).onSnapshot(async snap=>{
    if(!snap.empty){
      const d = snap.docs[0];
      cajaActual = {id:d.id, ...d.data()};
    } else {
      cajaActual = null;
      // buscamos el último cierre para sugerir la próxima apertura
      const ult = await db.collection('cajaSesiones').orderBy('cerradaEn','desc').limit(1).get();
      ultimoCierre = ult.empty ? null : ult.docs[0].data().montoContado;
      ultimoCierreUsd = ult.empty ? null : (ult.docs[0].data().montoContadoUsd ?? null);
    }
    actualizarEstadoCaja();
  });
}

/* =====================================================================
   TABLA + FILTROS
   ===================================================================== */
const tbody = document.getElementById('tbody');

function compareFechas(a,b){
  const [da,ma] = a.split('/').map(Number);
  const [db_,mb] = b.split('/').map(Number);
  return (ma-mb) || (da-db_);
}

function attachAutocomplete(input, getOptions, onPick, etiqueta){
  const wrap = input.closest('.ac-wrap');
  const dd = document.createElement('div');
  dd.className = 'ac-dropdown';
  wrap.appendChild(dd);
  let suppressOpen = false;
  let opcionesActuales = [];
  let indiceActivo = -1;

  function pintarActivo(){
    dd.querySelectorAll('.ac-option').forEach((el,i)=>{
      el.classList.toggle('activo', i===indiceActivo);
      if(i===indiceActivo) el.scrollIntoView({block:'nearest'});
    });
  }

  function renderList(){
    if(suppressOpen){ suppressOpen = false; return; }
    const q = normBusqueda(input.value.trim());
    opcionesActuales = getOptions().filter(o=> !q || normBusqueda(o).includes(q)).slice(0,40);
    if(input.dataset.acSiempre && !opcionesActuales.includes(input.dataset.acSiempre)) opcionesActuales.push(input.dataset.acSiempre);
    indiceActivo = -1;
    if(!opcionesActuales.length && input.hasAttribute('data-ac-libre')){ dd.classList.remove('show'); return; }
    dd.innerHTML = opcionesActuales.length
      ? opcionesActuales.map((o,i)=>`<div class="ac-option" data-i="${i}">${etiqueta ? etiqueta(o) : o}</div>`).join('')
      : '<div class="ac-empty">Sin resultados</div>';
    dd.classList.add('show');
  }

  function elegir(valor){
    input.value = valor;
    dd.classList.remove('show');
    suppressOpen = true;
    input.dispatchEvent(new Event('input', {bubbles:true}));
    if(onPick) onPick(valor);
  }

  input.addEventListener('focus', renderList);
  input.addEventListener('input', renderList);
  input.addEventListener('keydown', (e)=>{
    if(!dd.classList.contains('show') || !opcionesActuales.length) return;
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      indiceActivo = Math.min(indiceActivo+1, opcionesActuales.length-1);
      pintarActivo();
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      indiceActivo = Math.max(indiceActivo-1, 0);
      pintarActivo();
    } else if(e.key === 'Enter'){
      if(indiceActivo >= 0){
        e.preventDefault();
        elegir(opcionesActuales[indiceActivo]);
      } else if(input.value.trim() && opcionesActuales.length && !input.hasAttribute('data-ac-sin-enter')){
        e.preventDefault();
        elegir(opcionesActuales[0]);
      }
    } else if(e.key === 'Escape'){
      if(dd.classList.contains('show')) e.preventDefault();   // primero se cierra la lista; el próximo Esc cierra la ventana
      dd.classList.remove('show');
    }
  });
  dd.addEventListener('mousedown', (e)=>{
    const opt = e.target.closest('.ac-option');
    if(!opt) return;
    elegir(opcionesActuales[Number(opt.dataset.i)]);
  });
  document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) dd.classList.remove('show'); });
}

const filtroFecha = document.getElementById('filtroFecha');
const filtroPaciente = document.getElementById('filtroPaciente');
const filtroProfesional = document.getElementById('filtroProfesional');
const filtroCodigo = {value:''};   // la columna Código ya no se usa
const filtroConcepto = document.getElementById('filtroConcepto');
const filtroNotas = document.getElementById('filtroNotas');
const filtroTotal = document.getElementById('filtroTotal');
const filtroMedio = document.getElementById('filtroMedio');
const filtroCobro = document.getElementById('filtroCobro');

const filtrosTabla = [filtroFecha, filtroPaciente, filtroProfesional, filtroConcepto, filtroNotas, filtroTotal, filtroMedio, filtroCobro];
filtrosTabla.forEach(f=> f.addEventListener('input', renderTabla));

// Búsqueda de fechas estricta: "2/10" encuentra solo el 2/10 (no el 22/10); "3" solo los días 3; "/10" todo octubre.
// Se aplica cuando lo buscado es una fecha (números y "/") y el campo tiene fechas; si no, búsqueda común por texto.
function coincideFecha(campo, q){
  q = (q||'').trim();
  if(!/^\d{0,2}(\/\d{0,4}){0,2}$/.test(q) || !/\d/.test(q)) return null;
  const fechas = String(campo||'').match(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g);
  if(!fechas) return null;
  const qp = q.split('/');
  return fechas.some(f=>{
    const fp = f.split('/');
    return qp.every((x, i)=>{
      if(x==='') return true;                       // "/10": cualquier día
      if(i===2){ if(!fp[2]) return false; return x.length<=2 ? +fp[2].slice(-2)===+x : (fp[2].length===4 ? fp[2].startsWith(x) : false); }
      return fp[i]!=null && +fp[i]===+x;
    });
  });
}
function contiene(campo, texto){
  const f = coincideFecha(campo, texto); if(f!==null) return f;
  return normBusqueda(campo).includes(normBusqueda(texto.trim()));
}

function pasaFiltros(m){
  if(esCajaGrande(m)) return false;   // lo de caja grande se ve solo en "Caja grande"
  if(filtroFecha.value && !contiene(m.fechaDisplay, filtroFecha.value)) return false;
  if(filtroPaciente.value && !contiene(m.pac, filtroPaciente.value)) return false;
  if(filtroProfesional.value && !contiene(m.prof, filtroProfesional.value)) return false;
  if(filtroCodigo.value && !contiene(m.codigo, filtroCodigo.value)) return false;
  if(filtroConcepto.value && !contiene(m.concepto, filtroConcepto.value)) return false;
  if(filtroNotas.value && !contiene((m.notas||'') + (m.jornada ? ' (JORNADA)' : ''), filtroNotas.value)) return false;
  if(filtroTotal.value && !contiene(fmtTotal(m), filtroTotal.value)) return false;
  if(filtroMedio.value && !contiene(medioDisplayText(m), filtroMedio.value)) return false;
  if(filtroCobro.value && !contiene(cobroTextoPlano(m), filtroCobro.value)) return false;
  return true;
}

function renderTabla(){
  if(vistaActual==='cremas' && typeof renderCremas==='function') renderCremas();
  nombresPacientes = new Set(pacientesFullList.map(p=> mayus(p.nombreCompleto||'')));
  tbody.innerHTML = "";
  movimientos.filter(pasaFiltros).forEach(m=>{
    const esGasto = esGastoMov(m);
    const tr = document.createElement('tr');
    const esPac = !esGasto && nombresPacientes.has(mayus(m.pac||''));
    tr.innerHTML = `
      <td class="editcol">${m.migrado ? '' : `<button class="editbtn" title="Editar" onclick="abrirEdicion('${m.id}')">&#9998;</button>`}</td>
      <td>${m.fechaDisplay}</td>
      <td class="left">${esPac ? `<span class="pac-link" data-pac="${escHtml(m.pac)}" title="Ver ficha del paciente">${m.pac}</span>` : m.pac}</td>
      <td${esViejoCatalogo(m,'prof') ? ' class="mig-viejo"' : ''}>${m.prof}</td>
      <td class="concepto${esViejoCatalogo(m,'concepto') ? ' mig-viejo' : ''}">${m.concepto}</td>
      <td class="notas" title="${(m.notas||"").replace(/"/g,'&quot;')}${m.jornada?' (JORNADA)':''}">${m.notas||""}${m.jornada ? `${m.notas ? ' ' : ''}<i class="tag-jornada">(JORNADA)</i>` : ''}${esCajaGrande(m) ? '<i class="tag-grande">CAJA GRANDE</i>' : ''}</td>
      <td class="total ${m.valor==0 ? '' : (esGasto?'egreso':'ingreso')}">${fmtTotal(m)}</td>
      <td class="badges-cell">${medioBadgesHTML(m)}</td>
      <td class="concepto">${cobroBadgesHTML(m)}</td>
    `;
    tbody.appendChild(tr);
  });
  renderTotalesCaja(movimientos.filter(pasaFiltros));
  renderDeudoresCount();
}

// Fila "Totales": suma solo lo que queda a la vista con los filtros (egresos restan)
function renderTotalesCaja(filas){
  const tf = document.getElementById('tfootCaja');
  if(!tf) return;
  tf.innerHTML = ''; return;   // sin totales: mezclaban cosas que no se cuentan (deudas, lo cobrado por el profesional…)
  if(!filas.length){ tf.innerHTML = ''; return; }
  let pesos = 0, usd = 0, hayUsd = false;
  filas.forEach(m=>{
    const v = (Number(m.valor)||0) * (esGastoMov(m) ? -1 : 1);
    if(m.moneda==="USD"){ usd += v; hayUsd = true; } else pesos += v;
    if(m.valorUsd){ usd += (Number(m.valorUsd)||0) * (esGastoMov(m) ? -1 : 1); hayUsd = true; }
  });
  const cls = v => v<0 ? 'egreso' : (v>0 ? 'ingreso' : '');
  tf.innerHTML = `<tr>
    <td class="editcol"></td>
    <td colspan="5" class="left">TOTALES <span class="tot-cant">(${filas.length} ${filas.length===1?'movimiento':'movimientos'})</span></td>
    <td class="total ${cls(pesos)}">${fmtMonto(pesos,'$')}${hayUsd ? `<div class="${cls(usd)}">${fmtMonto(usd,'USD')}</div>` : ''}</td>
    <td></td><td></td>
  </tr>`;
}

