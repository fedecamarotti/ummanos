/* =====================================================================
   CAJA: APERTURA / CIERRE
   ===================================================================== */

// Neto en efectivo (ingresos - egresos) que impacta en la caja física para un movimiento.
// ---- Caja chica / Caja grande ----
const esCajaGrande = m => m && m.caja === 'grande';
const conceptoNorm = m => normBusqueda((m && m.concepto) || '').replace(/\s+/g,' ').trim();
// Egreso de caja chica "GUARDA EN CAJA GRANDE": sale de la chica y entra a la grande
const esGuardaEnGrande = m => !esCajaGrande(m) && esGastoMov(m) && conceptoNorm(m) === 'guarda en caja grande';
// Egreso de caja grande "GUARDA EN CAJA CHICA": sale de la grande y entra a la chica
// Ingreso de caja chica "INGRESO CAMBIO DE CAJA GRANDE" (antes "INGRESO CAMBIO"): entra a la chica y sale de la grande
const esCambioDeGrande = m => !esCajaGrande(m) && !esGastoMov(m) && ['ingreso cambio de caja grande','ingreso cambio'].includes(conceptoNorm(m));
// Lo que mueve un movimiento en la caja grande: efectivo $ / USD y Mercado Pago (MP es todo caja grande)
function netoCajaGrande(m){
  const out = {};
  const add = (k, v)=>{ if(v) out[k] = (out[k]||0) + v; };
  const gasto = esGastoMov(m);
  // efectivo: lo cargado en CAJA GRANDE y lo que la chica manda con "GUARDA EN CAJA GRANDE"
  // y resta el "INGRESO CAMBIO DE CAJA GRANDE" (plata que la grande le pasa a la chica)
  const sEf = esCajaGrande(m) ? (gasto ? -1 : 1) : (esGuardaEnGrande(m) ? 1 : (esCambioDeGrande(m) ? -1 : 0));
  pagosDe(m).forEach(p=>{
    const v = pagoMontoReal(p);
    if(p.medio==="efectivo"){ if(sEf) add(pagoMoneda(m, p)==='USD' ? 'USD' : '$', sEf * v); return; }
    if(p.medio==="mp"){
      if(!gasto && p.cobradoPor==="profesional") return;   // si lo cobró el profesional, no entró a nuestro MP
      add(pagoMoneda(m, p)==='USD' ? 'MPUSD' : 'MP', gasto ? -v : v);
    }
  });
  return out;
}
let cgDatos = {movs:null}, cgUnsub = [];
function suscribirCajaGrande(){
  if(cgUnsub.length) return;
  const err = e=>{ document.getElementById('cgHoja').innerHTML = `<div class="empty-state" style="color:#a13a3a">No se pudo leer la caja grande: ${escHtml(e.message)}</div>`; };
  // todo desde el inicio de la caja grande (noviembre 2026): lo cargado en GRANDE, los "guarda" y los Mercado Pago de caja chica
  cgUnsub.push(db.collection('movimientos').where('fechaISO','>=', CG_DESDE + '-01').onSnapshot(sn=>{
    cgDatos.movs = sn.docs.map(d=> ({id:d.id, ...d.data()})).filter(noMigrado); renderCajaGrande();
  }, err));
  cajaChicaSaldo().then(renderCajaGrande);
}
// Saldo actual de caja chica: si hay una caja abierta, lo esperado hasta ahora; si no, lo contado en el último cierre
let cgChica = null;
async function cajaChicaSaldo(){
  try{
    if(cajaActual) cgChica = {pesos: await calcularEsperadoCaja(), usd: await calcularEsperadoCaja('USD'), abierta:true};
    else {
      const ult = await db.collection('cajaSesiones').orderBy('cerradaEn','desc').limit(1).get();
      const c = ult.empty ? null : ult.docs[0].data();
      cgChica = c ? {pesos: Number(c.montoContado)||0, usd: c.montoContadoUsd!=null ? Number(c.montoContadoUsd) : null, abierta:false} : null;
    }
  }catch(e){ cgChica = null; }
}
function renderCajaGrande(){
  const hoja = document.getElementById('cgHoja'), saldos = document.getElementById('cgSaldos');
  if(!hoja) return;
  if(cgDatos.movs==null){ hoja.innerHTML = '<div class="empty-state">Cargando…</div>'; return; }
  const ms = x=> x && x.toMillis ? x.toMillis() : 0;
  const todos = cgDatos.movs.filter(m=> Object.keys(netoCajaGrande(m)).length)
    .sort((a,b)=> (a.fechaISO||'').localeCompare(b.fechaISO||'') || ms(a.creadoEn)-ms(b.creadoEn));
  const ini = mesInicioISO(), fin = mesFinISO();
  const total = {}, alInicio = {};
  todos.forEach(m=>{ const n = netoCajaGrande(m); Object.keys(n).forEach(k=>{ total[k] = (total[k]||0) + n[k]; if((m.fechaISO||'') < ini) alInicio[k] = (alInicio[k]||0) + n[k]; }); });
  const delMes = todos.filter(m=> m.fechaISO >= ini && m.fechaISO < fin);
  const pill = (t, v, tip)=> `<span class="cg-pill"${tip ? ` title="${tip}"` : ''}>${t}<b>${v}</b></span>`;
  saldos.innerHTML = pill('Grande $', fmtMonto(total['$']||0,'$')) + pill('Grande USD', fmtMonto(total.USD||0,'USD'))
    + pill('MP', fmtMonto(total.MP||0,'$')) + (total.MPUSD ? pill('MP USD', fmtMonto(total.MPUSD,'USD')) : '')
    + '<span class="cg-sep"></span>'
    + (cgChica ? pill('Chica $', fmtMonto(cgChica.pesos,'$'), cgChica.abierta ? 'Caja abierta: lo esperado ahora' : 'Último cierre')
               + pill('Chica USD', cgChica.usd==null ? '—' : fmtMonto(cgChica.usd,'USD'), cgChica.abierta ? 'Caja abierta: lo esperado ahora' : 'Último cierre')
             : pill('Caja chica', '—'));
  const SECC = [['$','EFECTIVO $','$'], ['USD','EFECTIVO USD','USD'], ['MP','MERCADO PAGO','$'], ['MPUSD','MERCADO PAGO USD','USD']];
  hoja.innerHTML = SECC.filter(([k])=> k!=='MPUSD' || alInicio[k] || delMes.some(m=> netoCajaGrande(m)[k])).map(([k, tit, mon])=>{
    let saldo = alInicio[k]||0;
    const filas = delMes.filter(m=> netoCajaGrande(m)[k]).map(m=>{
      const v = netoCajaGrande(m)[k]; saldo += v;
      const origen = esCajaGrande(m) ? '' : ` <span class="cg-auto">(${(k==='$'||k==='USD') && esCambioDeGrande(m) ? 'a caja chica' : 'desde caja chica'})</span>`;
      const quien = m.creadoPor ? nombreCortoUsuario(m.creadoPor) : '';
      return `<tr><td class="editcol"><button class="editbtn" title="Editar" onclick="abrirEdicion('${m.id}')">&#9998;</button></td><td>${ecFecha(m.fechaISO).slice(0,5)}</td><td class="left">${escHtml(m.pac||'')} · ${escHtml(m.concepto||'')}${m.notas ? ' · ' + escHtml(m.notas) : ''}${origen}</td><td>${escHtml(quien)}</td>`
        + `<td class="ing">${v>0 ? fmtMonto(v,mon) : ''}</td><td class="egr">${v<0 ? fmtMonto(-v,mon) : ''}</td><td class="sal">${fmtMonto(saldo,mon)}</td></tr>`;
    }).join('');
    return `<div class="sheet-wrap cg-cuadro"><table class="cg-tabla"><colgroup><col style="width:34px"><col style="width:64px"><col><col style="width:100px"><col style="width:130px"><col style="width:130px"><col style="width:140px"></colgroup>
      <thead><tr><th></th><th>Fecha</th><th class="left cg-tit">${tit}</th><th>Cargó</th><th>Ingreso</th><th>Egreso</th><th>Saldo</th></tr></thead>
      <tbody>${filas || `<tr><td colspan="7" class="cg-vacio">Sin movimientos este mes · saldo ${fmtMonto(saldo,mon)}</td></tr>`}</tbody></table></div>`;
  }).join('');
}
function netoEfectivoMovimiento(m, mon){
  mon = mon || '$';
  if(esCajaGrande(m)) return 0;   // lo cargado en caja grande no toca la caja chica
  const esGasto = esGastoMov(m);
  let neto = 0;
  pagosDe(m).filter(p=>p.medio==="efectivo" && pagoMoneda(m, p)===mon).forEach(p=>{   // efectivo de la moneda pedida ($ o USD)
    // Si lo cobró el profesional directamente, esa plata nunca entró a nuestra caja física.
    if(!esGasto && p.cobradoPor === "profesional") return;
    const v = pagoMontoReal(p);
    neto += esGasto ? -v : v;
  });
  return neto;
}
const tsMs = ts => ts && ts.toMillis ? ts.toMillis() : null;

// Un movimiento pertenece a una caja si fue cargado con esa caja abierta (cajaId).
// Para movimientos viejos sin cajaId, se usa la hora de carga: entre la apertura y el cierre.
// ¿A qué caja pertenece un movimiento?
// - Movimientos nuevos: la caja que estaba abierta al cargarlo (cajaId).
// - Movimientos viejos (sin cajaId): una caja de la MISMA FECHA del movimiento
//   (igual que el reporte diario). Si ese día hubo varias, la que estaba abierta
//   cuando se cargó; si se cargó fuera de todos los horarios, la más cercana en el tiempo.
function sesionDeMovimiento(m, sesiones){
  // si la caja con la que se cargó fue eliminada, se reparte como un movimiento viejo (por fecha y hora)
  if(m.cajaId && !m._cajaBorrada) return sesiones.find(c=> c.id === m.cajaId) || null;
  const delDia = sesiones.filter(c=> c.fechaISO === m.fechaISO && c.abiertaEn);
  if(!delDia.length) return null;
  if(delDia.length === 1) return delDia[0];
  const t = tsMs(m.creadoEn);
  if(t === null) return delDia[0];
  let mejor = null, mejorDist = Infinity;
  delDia.forEach(c=>{
    const ini = tsMs(c.abiertaEn), fin = tsMs(c.cerradaEn) ?? Date.now();
    const dist = t < ini ? ini - t : (t > fin ? t - fin : 0);
    if(dist < mejorDist){ mejorDist = dist; mejor = c; }
  });
  return mejor;
}
// Trae los movimientos que pueden pertenecer a un conjunto de cajas:
// los viejos por fecha y los nuevos por cajaId / hora de carga.
const cajaExisteCache = {};
async function movimientosParaSesiones(sesiones){
  const conApertura = sesiones.filter(c=>c.abiertaEn);
  if(!conApertura.length) return [];
  const fechas = conApertura.map(c=>c.fechaISO).sort();
  const desde = conApertura.reduce((a,c)=> tsMs(c.abiertaEn) < tsMs(a) ? c.abiertaEn : a, conApertura[0].abiertaEn);
  let qNuevos = db.collection('movimientos').where('creadoEn','>=', desde);
  if(conApertura.every(c=>c.cerradaEn)){
    const hasta = conApertura.reduce((a,c)=> tsMs(c.cerradaEn) > tsMs(a) ? c.cerradaEn : a, conApertura[0].cerradaEn);
    qNuevos = qNuevos.where('creadoEn','<=', hasta);
  }
  const [snapFecha, snapNuevos] = await Promise.all([
    db.collection('movimientos').where('fechaISO','>=', fechas[0]).where('fechaISO','<=', fechas[fechas.length-1]).get(),
    qNuevos.get(),
  ]);
  const porId = {};
  snapFecha.docs.forEach(d=> porId[d.id] = d.data());
  snapNuevos.docs.forEach(d=> porId[d.id] = d.data());
  const movs = Object.values(porId).filter(noMigrado);
  // Movimientos de cajas que ya no existen (eliminadas desde el panel Cajas): se marcan para repartirlos por fecha
  const ids = [...new Set(movs.map(m=> m.cajaId).filter(id=> id && id!=='SIN_CAJA' && !sesiones.some(c=> c.id===id)))];
  const borradas = new Set();
  await Promise.all(ids.map(async id=>{
    if(!(id in cajaExisteCache)){ try{ cajaExisteCache[id] = (await db.collection('cajaSesiones').doc(id).get()).exists; }catch(e){ cajaExisteCache[id] = true; } }
    if(!cajaExisteCache[id]) borradas.add(id);
  }));
  movs.forEach(m=>{ if(borradas.has(m.cajaId)) m._cajaBorrada = true; });
  return movs;
}
function netoPorSesion(movs, sesiones, mon){
  const neto = {};
  movs.forEach(m=>{
    const ses = sesionDeMovimiento(m, sesiones);
    if(ses) neto[ses.id] = (neto[ses.id]||0) + netoEfectivoMovimiento(m, mon);
  });
  return neto;
}
async function netoEfectivoDeSesion(sesionId, sesion, mon){
  if(!sesion.abiertaEn) return 0;
  // Todas las cajas de ese día, para repartir bien los movimientos viejos
  const snapDia = await db.collection('cajaSesiones').where('fechaISO','==', sesion.fechaISO).get();
  const sesiones = snapDia.docs.map(d=>({id:d.id, ...d.data()}));
  if(!sesiones.some(c=>c.id===sesionId)) sesiones.push({id:sesionId, ...sesion});
  const movs = await movimientosParaSesiones(sesiones.filter(c=>c.id===sesionId));
  // también los viejos de ese día que pudieran caer en esta caja
  return netoPorSesion(movs, sesiones, mon)[sesionId] || 0;
}
async function calcularEsperadoCaja(mon){
  if(!cajaActual) return 0;
  if(mon==='USD') return (Number(cajaActual.aperturaMontoUsd)||0) + await netoEfectivoDeSesion(cajaActual.id, cajaActual, 'USD');
  return cajaActual.aperturaMonto + await netoEfectivoDeSesion(cajaActual.id, cajaActual);
}

// Cartel de entrada: con la caja de otra abierta, "Abrir caja" se ve apagado
function gateModo(deOtra){
  const b = document.getElementById('btnAbrirDesdeGate');
  b.disabled = deOtra;
  b.title = deOtra ? 'Ya hay una caja abierta' : '';
  document.getElementById('gateTit').textContent = deOtra ? 'Caja abierta' : 'Apertura de caja';
  document.getElementById('gateTxt').textContent = deOtra
    ? `La caja la abrió ${cajaActual.recepcionista}. Podés entrar en vista previa; para cargar movimientos, esperá a que la cierre y abrí la tuya.`
    : 'Abrí la caja con el monto inicial en efectivo para empezar a cargar movimientos.';
}
function actualizarEstadoCaja(){
  const el = document.getElementById('cajaStatus');
  const btn = document.getElementById('btnCierre');
  const hint = document.getElementById('cajaHint');
  const btnNuevo = document.getElementById('btnNuevo');
  const gate = document.getElementById('panelGate');
  const content = document.getElementById('panelContent');

  const btnPrev = document.getElementById('btnVistaPrevia');
  const banner = document.getElementById('previewBanner');

  if(currentUser && currentUser.rol === 'admin'){
    btnNuevo.disabled = false;
    gate.classList.remove('show');
    content.classList.remove('panel-blur');
    btnPrev.classList.add('col-hidden');
    banner.classList.add('col-hidden');
    document.body.classList.remove('modo-lectura');
    return;
  }
  if(cajaActual){
    const esQuienAbrio = cajaActual.recepcionista === currentUser.nombre;
    el.classList.remove('closed');
    el.querySelector('span').innerHTML = `Caja abierta · Apertura $${cajaActual.aperturaMonto.toLocaleString('es-AR')}`;
    el.title = `Abrió la caja: ${cajaActual.recepcionista}`;
    btn.textContent = "Cerrar caja";
    btn.disabled = !esQuienAbrio;
    hint.textContent = esQuienAbrio ? "" : `La caja la abrió ${cajaActual.recepcionista} — solo ella puede cargar movimientos y cerrarla.`;
    btnNuevo.disabled = false;   // si no es su caja, al tocarlo avisa
    if(esQuienAbrio){
      gate.classList.remove('show');
      content.classList.remove('panel-blur');
      vistaPrevia = false;
      btnPrev.classList.add('col-hidden');
      banner.classList.add('col-hidden');
      document.body.classList.remove('modo-lectura', 'en-vista-previa');
    } else {
      // Caja de otra: al entrar se ve el cartel; "Abrir caja" queda apagado y solo se puede entrar en vista previa
      gateModo(true);
      btnPrev.classList.remove('col-hidden');
      btnPrev.textContent = vistaPrevia ? "Salir de vista previa" : "Vista previa";
      document.body.classList.toggle('en-vista-previa', vistaPrevia);
      document.body.classList.add('modo-lectura');
      banner.classList.toggle('col-hidden', !vistaPrevia);
      gate.classList.toggle('show', !vistaPrevia);
      content.classList.toggle('panel-blur', !vistaPrevia);
    }
  } else {
    gateModo(false);
    el.classList.add('closed');
    el.querySelector('span').innerHTML = ultimoCierre!==null
      ? `Caja cerrada · Último cierre $${ultimoCierre.toLocaleString('es-AR')}`
      : "Caja cerrada · Todavía no hay ningún cierre";
    btn.textContent = "Abrir caja";
    btn.disabled = false;
    btnNuevo.disabled = false; // se muestra activo; al tocarlo avisa que hay que abrir caja
    btnPrev.classList.remove('col-hidden');
    btnPrev.textContent = vistaPrevia ? "Salir de vista previa" : "Vista previa";
    document.body.classList.toggle('en-vista-previa', vistaPrevia);
    document.body.classList.add('modo-lectura');
    if(vistaPrevia){
      hint.textContent = "";
      banner.classList.remove('col-hidden');
      gate.classList.remove('show');
      content.classList.remove('panel-blur');
    } else {
      hint.textContent = "";
      banner.classList.add('col-hidden');
      gate.classList.add('show');
      content.classList.add('panel-blur');
      const sw = document.querySelector('#panelContent > .sheet-wrap'); if(sw) sw.scrollTop = 0;
    }
  }
}
document.getElementById('btnAbrirDesdeGate').onclick = abrirModalApertura;


document.getElementById('btnCierre').onclick = ()=>{
  if(cajaActual){
    if(cajaActual.recepcionista !== currentUser.nombre){
      alert(`La caja la abrió ${cajaActual.recepcionista}. Solo ella puede cerrarla desde su usuario.`);
      return;
    }
    abrirModalCierre();
  } else {
    abrirModalApertura();
  }
};

const overlayApertura = document.getElementById('overlayApertura');
const inpAperturaMonto = document.getElementById('inpAperturaMonto');

function abrirModalApertura(){
  const sugerido = ultimoCierre !== null ? ultimoCierre : 0;
  inpAperturaMonto.value = sugerido.toLocaleString('es-AR');
  document.getElementById('inpFechaApertura').value = hoyISO();
  const sugUsd = ultimoCierreUsd !== null ? Number(ultimoCierreUsd) : 0;
  document.getElementById('inpAperturaUsd').value = sugUsd.toLocaleString('es-AR');
  document.getElementById('aperturaUsdSug').textContent = ultimoCierreUsd !== null ? `(último cierre: US$ ${sugUsd.toLocaleString('es-AR')})` : '';
  document.getElementById('aperturaSugeridaTxt').textContent = ultimoCierre !== null
    ? `Sugerido según el último cierre: $${ultimoCierre.toLocaleString('es-AR')}`
    : "No hay un cierre anterior registrado — ingresá el monto real con el que arrancás.";
  document.getElementById('aperturaWarning').classList.add('col-hidden');
  document.getElementById('confirmarApertura').textContent = "Abrir caja";
  overlayApertura.classList.add('show');
}
document.getElementById('closeApertura').onclick = ()=> overlayApertura.classList.remove('show');
document.getElementById('cancelApertura').onclick = ()=> overlayApertura.classList.remove('show');
inpAperturaMonto.addEventListener('input', ()=>{
  let raw = inpAperturaMonto.value.replace(/\D/g,"");
  inpAperturaMonto.value = raw ? Number(raw).toLocaleString('es-AR') : "";
  document.getElementById('aperturaWarning').classList.add('col-hidden');
  document.getElementById('confirmarApertura').textContent = "Abrir caja";
});
document.getElementById('inpAperturaUsd').addEventListener('input', e=>{ formatearInputMonto(e.target); document.getElementById('aperturaWarning').classList.add('col-hidden'); document.getElementById('confirmarApertura').textContent = "Abrir caja"; });
document.getElementById('confirmarApertura').onclick = async ()=>{
  const monto = Number(inpAperturaMonto.value.replace(/\D/g,""));
  const montoUsd = Number(document.getElementById('inpAperturaUsd').value.replace(/\D/g,"")) || 0;
  if(inpAperturaMonto.value==="" || isNaN(monto)){ alert("Ingresá un monto de apertura."); return; }
  const fechaElegida = document.getElementById('inpFechaApertura').value;
  if(!fechaElegida){ alert("Elegí una fecha para esta caja."); return; }

  const diferenciaApertura = ultimoCierre !== null ? (monto - ultimoCierre) : 0;
  const diferenciaAperturaUsd = ultimoCierreUsd !== null ? (montoUsd - Number(ultimoCierreUsd)) : 0;
  const warn = document.getElementById('aperturaWarning');
  if((diferenciaApertura !== 0 || diferenciaAperturaUsd !== 0) && warn.classList.contains('col-hidden')){
    const partes = [];
    if(diferenciaApertura) partes.push(`${diferenciaApertura > 0 ? 'de más' : 'de menos'}: $${Math.abs(diferenciaApertura).toLocaleString('es-AR')} (último cierre $${ultimoCierre.toLocaleString('es-AR')})`);
    if(diferenciaAperturaUsd) partes.push(`${diferenciaAperturaUsd > 0 ? 'de más' : 'de menos'}: US$ ${Math.abs(diferenciaAperturaUsd).toLocaleString('es-AR')} (último cierre US$ ${Number(ultimoCierreUsd).toLocaleString('es-AR')})`);
    warn.innerHTML = ico('alerta') + ' ' + escHtml(`Estás abriendo con una diferencia respecto del último cierre — ${partes.join(' · ')}. Revisá antes de continuar.`);
    warn.classList.remove('col-hidden');
    document.getElementById('confirmarApertura').textContent = "Abrir caja de todos modos";
    return;
  }

  await db.collection('cajaSesiones').add({
    fechaISO: fechaElegida, recepcionista: currentUser.nombre,
    aperturaMonto: monto, aperturaMontoUsd: montoUsd, abiertaEn: firebase.firestore.FieldValue.serverTimestamp(),
    diferenciaApertura, diferenciaAperturaUsd,
    cerradaEn: null, montoContado: null, esperadoCierre: null, diferencia: null,
  });
  overlayApertura.classList.remove('show');
};

const overlayCierre = document.getElementById('overlayCierre');
const inpCierreMonto = document.getElementById('inpCierreMonto');

function ocultarAvisoCierre(){
  document.getElementById('cierreWarning').classList.add('col-hidden');
  document.getElementById('cierreExplicWrap').classList.add('col-hidden');
}
async function abrirModalCierre(){
  document.getElementById('cierreExplic').value = '';
  document.getElementById('cierreEsperadoTxt').textContent = `Monto esperado en caja: calculando…`;
  document.getElementById('inpFechaCierre').value = cajaActual.fechaISO;
  inpCierreMonto.value = ""; document.getElementById('inpCierreUsd').value = "";
  ocultarAvisoCierre();
  document.getElementById('confirmarCierre').textContent = "Cerrar caja";
  overlayCierre.classList.add('show');
  await recalcularEsperadoCierre();
}
async function recalcularEsperadoCierre(){
  const fecha = document.getElementById('inpFechaCierre').value;
  const esperado = await calcularEsperadoCaja();
  const esperadoUsd = await calcularEsperadoCaja('USD');
  document.getElementById('cierreEsperadoTxt').textContent = `Monto esperado en caja: $${esperado.toLocaleString('es-AR')} y US$ ${esperadoUsd.toLocaleString('es-AR')}`;
  inpCierreMonto.value = esperado.toLocaleString('es-AR');
  document.getElementById('inpCierreUsd').value = esperadoUsd.toLocaleString('es-AR');
  document.getElementById('cierreUsdEsp').textContent = `(esperado: US$ ${esperadoUsd.toLocaleString('es-AR')})`;
  ocultarAvisoCierre();
  document.getElementById('confirmarCierre').textContent = "Cerrar caja";
}
document.getElementById('inpFechaCierre').addEventListener('input', recalcularEsperadoCierre);
document.getElementById('closeCierre').onclick = ()=> overlayCierre.classList.remove('show');
document.getElementById('cancelCierre').onclick = ()=> overlayCierre.classList.remove('show');
inpCierreMonto.addEventListener('input', ()=>{
  let raw = inpCierreMonto.value.replace(/\D/g,"");
  inpCierreMonto.value = raw ? Number(raw).toLocaleString('es-AR') : "";
  ocultarAvisoCierre();
  document.getElementById('confirmarCierre').textContent = "Cerrar caja";
});
document.getElementById('inpCierreUsd').addEventListener('input', e=>{ formatearInputMonto(e.target); ocultarAvisoCierre(); document.getElementById('confirmarCierre').textContent = "Cerrar caja"; });
document.getElementById('confirmarCierre').onclick = async ()=>{
  const contado = Number(inpCierreMonto.value.replace(/\D/g,""));
  const contadoUsd = Number(document.getElementById('inpCierreUsd').value.replace(/\D/g,"")) || 0;
  if(inpCierreMonto.value==="" || isNaN(contado)){ alert("Ingresá el monto real contado en caja."); return; }
  const fechaCierre = document.getElementById('inpFechaCierre').value || cajaActual.fechaISO;
  const esperado = await calcularEsperadoCaja();
  const esperadoUsd = await calcularEsperadoCaja('USD');
  const diferencia = contado - esperado;
  const diferenciaUsd = contadoUsd - esperadoUsd;
  const warn = document.getElementById('cierreWarning');

  if((diferencia !== 0 || diferenciaUsd !== 0) && warn.classList.contains('col-hidden')){
    const partes = [];
    if(diferencia) partes.push(diferencia > 0 ? `hay $${diferencia.toLocaleString('es-AR')} de más (esperado $${esperado.toLocaleString('es-AR')})` : `faltan $${Math.abs(diferencia).toLocaleString('es-AR')} (esperado $${esperado.toLocaleString('es-AR')})`);
    if(diferenciaUsd) partes.push(diferenciaUsd > 0 ? `hay US$ ${diferenciaUsd.toLocaleString('es-AR')} de más (esperado US$ ${esperadoUsd.toLocaleString('es-AR')})` : `faltan US$ ${Math.abs(diferenciaUsd).toLocaleString('es-AR')} (esperado US$ ${esperadoUsd.toLocaleString('es-AR')})`);
    warn.innerHTML = ico('alerta') + ' ' + escHtml(`${partes.join(' · ')}. Revisá antes de cerrar.`);
    warn.classList.remove('col-hidden');
    document.getElementById('cierreExplicWrap').classList.remove('col-hidden');
    setTimeout(()=> document.getElementById('cierreExplic').focus(), 50);
    document.getElementById('confirmarCierre').textContent = "Cerrar caja con diferencia";
    return;
  }
  const explicacion = mayus(document.getElementById('cierreExplic').value.trim());
  if((diferencia !== 0 || diferenciaUsd !== 0) && !explicacion){
    alert('Escribí la explicación de la diferencia para poder cerrar la caja.');
    document.getElementById('cierreExplic').focus();
    return;
  }

  await db.collection('cajaSesiones').doc(cajaActual.id).update({
    fechaISO: fechaCierre,
    cerradaEn: firebase.firestore.FieldValue.serverTimestamp(),
    cerradaPor: currentUser.nombre,
    montoContado: contado, esperadoCierre: esperado, diferencia,
    montoContadoUsd: contadoUsd, esperadoCierreUsd: esperadoUsd, diferenciaUsd,
    ...(explicacion && (diferencia !== 0 || diferenciaUsd !== 0) ? {explicacionDiferencia: explicacion} : {}),
  });
  overlayCierre.classList.remove('show');
};

/* =====================================================================
   MODAL: NUEVO / EDITAR MOVIMIENTO
   ===================================================================== */
const overlay = document.getElementById('overlay');
const selPaciente = document.getElementById('selPaciente');
const selProfesional = document.getElementById('selProfesional');
const selConcepto = document.getElementById('selConcepto');
const inpValor = document.getElementById('inpValor');
const modalTitle = document.querySelector('#overlay .modal h2');
const btnGuardarMov = document.getElementById('guardarMov');
const btnEliminar = document.getElementById('btnEliminar');
let modo = 'nuevo';
let editingId = null;
let monedaSel = "$";

const MEDIO_OPCIONES = [
  {value:"efectivo", label:"Efectivo"},
  {value:"mp", label:"Mercado Pago"},
  {value:"tarjeta", label:"Tarjeta"},
  {value:"transferencia", label:"Transferencia"},
  {value:"debe", label:"Debe"},
];
function opcionesMedioHTML(seleccion){
  return '<option value="">Medio…</option>' + MEDIO_OPCIONES.map(o=>
    `<option value="${o.value}" ${o.value===seleccion?"selected":""}>${o.label}</option>`
  ).join('');
}
function agregarFilaPago(monto, medio, cobradoPor, extra){
  extra = extra || {};
  const row = document.createElement('div');
  row.className = 'pago-row';
  const monFila = extra.moneda || monedaSel;
  row.innerHTML = `
    <select class="pago-mon" title="Moneda de este pago"><option value="$">$</option><option value="USD">USD</option></select>
    <input type="text" class="pago-monto" inputmode="numeric" placeholder="Monto">
    <select class="pago-medio">${opcionesMedioHTML(medio||"")}</select>
    <select class="pago-quien">
      <option value="ummana" ${cobradoPor!=='profesional'?'selected':''}>Cobra Ummana</option>
      <option value="profesional" ${cobradoPor==='profesional'?'selected':''}>Cobra el profesional</option>
    </select>
    <button type="button" class="btn-quitar" title="Quitar">✕</button>
    <div class="pago-cot-fila col-hidden">
      <label>Cotización</label><input type="text" class="pago-cot" inputmode="numeric" placeholder="Ej: 1.550">
      <span class="pago-eq"></span>
    </div>
  `;
  const inp = row.querySelector('.pago-monto');
  const selMon = row.querySelector('.pago-mon');
  const inpCot = row.querySelector('.pago-cot');
  selMon.value = monFila;
  row.dataset.sigue = extra.moneda && extra.moneda!==monedaSel ? '0' : '1';   // sigue a la moneda del total hasta que se cambie a mano
  // al editar: si el pago fue en otra moneda, se muestra el monto que se pagó en esa moneda
  const montoVisible = extra.montoOriginal!=null ? extra.montoOriginal : monto;
  inp.value = montoVisible ? Number(montoVisible).toLocaleString('es-AR') : "";
  if(extra.cotizacion) inpCot.value = Number(extra.cotizacion).toLocaleString('es-AR');
  if(extra.auto) row.dataset.auto = '1';   // propuesto con lo que resta: se actualiza solo hasta que se toque
  inp.addEventListener('input', ()=>{
    let raw = inp.value.replace(/\D/g,"");
    inp.value = raw ? Number(raw).toLocaleString('es-AR') : "";
    delete row.dataset.auto;
    recalcularPagos(row);
  });
  inpCot.addEventListener('input', ()=>{ formatearInputMonto(inpCot); recalcularPagos(row); });
  selMon.addEventListener('change', ()=>{ row.dataset.sigue = '0'; recalcularPagos(row); });
  const selMedio = row.querySelector('.pago-medio');
  const selQuien = row.querySelector('.pago-quien');
  // Transferencia: siempre la cobra el profesional (única opción).
  // Resto de los medios: ambas opciones, "Cobra Ummana" primero.
  // Excepción: un movimiento viejo cargado como transferencia cobrada por Ummana
  // conserva su valor al editarlo, para no cambiarlo sin querer.
  const legadoTransfUmmana = medio === 'transferencia' && cobradoPor === 'ummana';
  // Mercado Pago: siempre lo cobra Ummana (única opción). Un movimiento viejo de MP cobrado por el profesional conserva su valor al editarlo.
  const legadoMpProf = medio === 'mp' && cobradoPor === 'profesional';
  function opcionesQuien(soloProfesional, valor, soloUmmana){
    selQuien.innerHTML = soloProfesional
      ? `<option value="profesional">Cobra el profesional</option>`
      : soloUmmana ? `<option value="ummana">Cobra Ummana</option>`
      : `<option value="ummana">Cobra Ummana</option><option value="profesional">Cobra el profesional</option>`;
    selQuien.value = soloProfesional ? 'profesional' : soloUmmana ? 'ummana' : (valor==='profesional' ? 'profesional' : 'ummana');
  }
  function sincronizarQuienSegunMedio(inicial){
    if(selMedio.value === 'debe'){
      opcionesQuien(false, 'ummana');
      selQuien.disabled = true;
      return;
    }
    selQuien.disabled = false;
    if(selMedio.value === 'transferencia' && !(inicial && legadoTransfUmmana)){
      opcionesQuien(true);
    } else if(selMedio.value === 'mp' && !(inicial && legadoMpProf)){
      opcionesQuien(false, 'ummana', true);
    } else {
      // al cambiar el medio se respeta lo que ya estaba elegido (si eligió "Cobra el profesional" antes del medio)
      opcionesQuien(false, inicial ? cobradoPor : quienElegido);
    }
  }
  let quienElegido = cobradoPor === 'profesional' ? 'profesional' : 'ummana';
  selQuien.addEventListener('change', ()=>{ if(!selQuien.disabled && selMedio.value!=='transferencia' && selMedio.value!=='mp') quienElegido = selQuien.value; });
  selMedio.addEventListener('change', ()=> sincronizarQuienSegunMedio(false));
  sincronizarQuienSegunMedio(true);
  row.querySelector('.btn-quitar').onclick = ()=>{ row.remove(); recalcularPagos(); };
  document.getElementById('pagosLista').appendChild(row);
  recalcularPagos();
}
// Valor de un pago expresado en la moneda del total (con la cotización si es otra moneda)
function valorPagoEnTotal(row){
  const monto = Number(row.querySelector('.pago-monto').value.replace(/\D/g,"")) || 0;
  const mon = row.querySelector('.pago-mon').value;
  if(mon === monedaSel) return {ok:true, valor:monto, monto, mon};
  const cot = parseMonto(row.querySelector('.pago-cot').value);
  if(!cot) return {ok:false, valor:0, monto, mon};
  const v = monedaSel === '$' ? monto * cot : monto / cot;
  return {ok:true, valor: Math.round(v*100)/100, monto, mon, cot};
}
// Muestra la cotización y la equivalencia en los pagos en otra moneda, y completa lo que resta
function recalcularPagos(origen){
  const filas = [...document.querySelectorAll('#pagosLista .pago-row')];
  const total = Number(inpValor.value.replace(/\D/g,"")) || 0;
  let suma = 0;
  filas.forEach(r=>{
    const otra = r.querySelector('.pago-mon').value !== monedaSel;
    r.querySelector('.pago-cot-fila').classList.toggle('col-hidden', !otra);
    const x = valorPagoEnTotal(r);
    const eq = r.querySelector('.pago-eq');
    eq.textContent = otra ? (x.ok && x.monto ? `= ${fmtMonto(x.valor, monedaSel)}` : 'Cargá la cotización') : '';
    if(!r.dataset.auto) suma += x.valor;
  });
  // si hay un pago en otra moneda, el de la moneda del total que quedó vacío (o autocompletado) se llena con lo que resta
  const hayOtra = filas.some(r=> r.querySelector('.pago-mon').value !== monedaSel && valorPagoEnTotal(r).ok);
  const resto = Math.max(0, Math.round((total - suma)*100)/100);
  filas.forEach(r=>{
    if(r===origen || r.querySelector('.pago-mon').value !== monedaSel) return;
    const inpM = r.querySelector('.pago-monto');
    if(hayOtra && total && (r.dataset.auto || !inpM.value)){
      inpM.value = resto ? Math.round(resto).toLocaleString('es-AR') : '';
      r.dataset.auto = '1';
    }
  });
  const aviso = document.getElementById('pagosResto');
  if(aviso){
    let s2 = 0; filas.forEach(r=> s2 += valorPagoEnTotal(r).valor);
    const r2 = Math.round((total - s2)*100)/100;
    aviso.classList.toggle('ok', Math.abs(r2) < 1);
    aviso.textContent = hayOtra && total ? (Math.abs(r2) < 1 ? 'Pagos completos.' : (r2 > 0 ? `Resta: ${fmtMonto(r2, monedaSel)} (queda como deuda)` : `Los pagos superan el total por ${fmtMonto(-r2, monedaSel)}`)) : '';
  }
}
document.getElementById('btnAgregarPago').onclick = ()=>{
  // el pago nuevo se propone con lo que falta para llegar al total
  const total = Number(inpValor.value.replace(/\D/g,"")) || 0;
  let suma = 0; document.querySelectorAll('#pagosLista .pago-row').forEach(r=> suma += valorPagoEnTotal(r).valor);
  const resto = Math.max(0, Math.round(total - suma));
  agregarFilaPago(resto || '', '', 'ummana', {auto:true});
};
agregarFilaPago();

function leerPagosForm(){
  const pagos = [];
  let falta = false, sinMedio = false;
  document.querySelectorAll('#pagosLista .pago-row').forEach(row=>{
    const x = valorPagoEnTotal(row);
    const medio = row.querySelector('.pago-medio').value;
    const cobradoPor = medio === 'debe' ? 'ummana' : row.querySelector('.pago-quien').value;
    if(x.monto>0 && !medio){ sinMedio = true; return; }
    if(!(x.monto>0 && medio)) return;
    if(!x.ok){ falta = true; return; }
    const p = {medio, valor: x.valor, cobradoPor, saldada:false, fechaSaldadoISO:null, fechaSaldadoDisplay:null};
    if(x.mon !== monedaSel){ p.moneda = x.mon; p.montoOriginal = x.monto; p.cotizacion = x.cot; }   // pago en otra moneda
    pagos.push(p);
  });
  if(sinMedio){ alert("Elegí el medio de pago."); return null; }
  if(falta){ alert("Cargá la cotización del pago en otra moneda."); return null; }
  return pagos;
}

function ordenarConceptos(profesional, opts){
  const copia = opts.slice();
  copia.sort((a,b)=> a.concepto.localeCompare(b.concepto, 'es', {numeric:true, sensitivity:'base'}));   // orden alfabético
  return copia;
}

let conceptosDisponiblesActual = [];

// Tipo del movimiento (Ingreso / Egreso): filtra profesionales/áreas y conceptos
let movTipo = 'ingreso';
const tipoConcepto = (prof, concepto)=> esEgreso(prof, concepto) ? 'egreso' : 'ingreso';
function profesionalesDelTipo(){
  return todosLosNombresDeProfesionales().filter(n=>{
    const cs = CONCEPTOS[n] || [];
    return cs.length ? cs.some(c=> tipoConcepto(n, c.concepto)===movTipo) : movTipo==='ingreso';
  });
}
function setMovTipo(t, limpiar){
  movTipo = t;
  document.querySelectorAll('#movTipo button').forEach(b=> b.classList.toggle('active', b.dataset.tipo===t));
  if(limpiar){
    selProfesional.value = ''; selConcepto.value = '';
    selPaciente.value = ''; document.getElementById('inpDestinatario').value = '';
  }
  actualizarConceptosDesdeProfesional();
}
document.querySelectorAll('#movTipo button').forEach(b=> b.onclick = ()=>{ if(b.dataset.tipo!==movTipo) setMovTipo(b.dataset.tipo, true); });

// Cremas / colágenos / geles: en el desplegable solo lo que tiene stock
const INDICA_OPCIONES = ['PARTICULAR', 'BARBIERI, VICTORIA', 'BASLINI, GABRIELA'];
let stockFormListo = false;
function claveConceptoCrema(prof, c){ return mayus((c.codigo||'').trim()) || mayus((c.concepto||'').trim()); }
async function cargarStockCremasForm(){
  stockFormListo = false;
  try{
    if(esFede()) suscribirCremas();
    else {
      const [si, aj] = await Promise.all([db.collection('cremas').doc('_stockInicial').get(), db.collection('cremas').doc('_ajustes').get()]);
      cremasInicial = {fecha:'', cantidades:{}, ...(si.exists ? si.data() : {})};
      cremasAjustes = aj.exists ? (aj.data().items || []) : [];
    }
    cremasVentas = null; cargandoVentasCremas = false;
    await cargarVentasCremas();
    stockFormListo = true;
  }catch(e){ console.warn('No se pudo leer el stock de cremas', e); stockFormListo = null; }
  if(overlay.classList.contains('show') && esProfCremas(selProfesional.value||'')) actualizarSoloConceptos();
}
function actualizarIndicaVisible(){
  const ok = movTipo==='ingreso' && esProfCremas(selProfesional.value||'');
  document.getElementById('indicaWrap').classList.toggle('col-hidden', !ok);
}
function actualizarSoloConceptos(){
  let opts = (CONCEPTOS[selProfesional.value] || []).filter(c=> tipoConcepto(selProfesional.value, c.concepto)===movTipo);
  if(movTipo==='ingreso' && esProfCremas(selProfesional.value||'') && stockFormListo){
    const actual = modo==='editar' ? selConcepto.value : null;   // al editar, se mantiene el que ya tenía
    opts = opts.filter(c=> c.concepto===actual || /salda deuda/i.test(c.concepto) || (stockProducto(claveConceptoCrema(selProfesional.value, c)) || 0) > 0);
  }
  actualizarIndicaVisible();
  if(opts.length){
    selConcepto.disabled = false;
    selConcepto.placeholder = "Escribí para buscar…";
    conceptosDisponiblesActual = ordenarConceptos(selProfesional.value, opts);
  } else {
    selConcepto.disabled = true;
    selConcepto.value = "";
    selConcepto.placeholder = selProfesional.value.trim() ? (esProfCremas(selProfesional.value) && movTipo==='ingreso' ? "No hay productos con stock" : "Sin conceptos de este tipo") : "Elegí primero un profesional/área…";
    conceptosDisponiblesActual = [];
  }
}
function actualizarConceptosDesdeProfesional(){
  if(esProfCremas(selProfesional.value||'') && stockFormListo===false && !cargandoVentasCremas) cargarStockCremasForm();
  actualizarSoloConceptos();
  actualizarCampoPacienteSegunTipo();
}
attachAutocomplete(selConcepto, ()=> conceptosDisponiblesActual.map(c=>c.concepto));

// Caja: CHICA (la del cierre diario, por defecto) o GRANDE (seguimiento aparte, ver "Caja grande")
let movCaja = 'chica';
// La caja la define desde dónde se carga: el "+" de Caja grande carga en GRANDE; el de movimientos diarios, en CHICA
function setMovCaja(c){
  movCaja = c==='grande' ? 'grande' : 'chica';
  document.getElementById('movCajaWrap').classList.toggle('col-hidden', movCaja!=='grande');
}

// Jornada: solo ingresos de profesionales con nombre propio ("APELLIDO, NOMBRE")
let movJornada = false;
function setJornada(v){
  movJornada = !!v;
  const b = document.getElementById('btnJornada');
  b.classList.toggle('on', movJornada);
  b.setAttribute('aria-pressed', movJornada ? 'true' : 'false');
}
document.getElementById('btnJornada').onclick = ()=> setJornada(!movJornada);
function actualizarJornadaVisible(){
  const ok = movTipo==='ingreso' && /,/.test(selProfesional.value||'');
  document.getElementById('jornadaWrap').classList.toggle('col-hidden', !ok);
  if(!ok) setJornada(false);
}
function actualizarCampoPacienteSegunTipo(){
  actualizarJornadaVisible();
  const egreso = movTipo==='egreso';
  document.getElementById('campoPacienteIngreso').classList.toggle('col-hidden', egreso);
  document.getElementById('campoPacienteEgreso').classList.toggle('col-hidden', !egreso);
  document.getElementById('pagosLista').classList.toggle('oculta-quien', egreso);
  if(egreso){
    document.getElementById('deudasPacienteBox').classList.add('col-hidden');
  } else {
    refreshDeudasPaciente();
  }
  sugerirTotalMov(false);
}
selConcepto.addEventListener('input', actualizarCampoPacienteSegunTipo);
selConcepto.addEventListener('input', ()=> sugerirTotalMov(true));
selProfesional.addEventListener('input', ()=> setTimeout(()=> sugerirTotalMov(true), 0));
refrescarSelectsDescuento();
document.getElementById('selDescMov').addEventListener('change', ()=> sugerirTotalMov(false));

function poblarProfesionalesUI(){
  actualizarConceptosDesdeProfesional();
}
attachAutocomplete(selPaciente, ()=> pacienteRegistry);
attachAutocomplete(document.getElementById('inpDestinatario'), ()=> proveedoresRegistry);

document.getElementById('btnAddProveedor').onclick = ()=> document.getElementById('cardNuevoProveedor').classList.remove('col-hidden');
document.getElementById('cancelProveedor').onclick = ()=> document.getElementById('cardNuevoProveedor').classList.add('col-hidden');
document.getElementById('guardarProveedor').onclick = async ()=>{
  const nombre = document.getElementById('npProveedorNombre').value.trim();
  if(!nombre){ alert("Ingresá un nombre."); return; }
  try{
    await db.collection('proveedores').add({nombre});
    document.getElementById('inpDestinatario').value = nombre;
    document.getElementById('cardNuevoProveedor').classList.add('col-hidden');
    document.getElementById('npProveedorNombre').value = "";
  }catch(e){
    alert("No se pudo guardar: " + e.message);
  }
};
attachAutocomplete(selProfesional, ()=> profesionalesDelTipo());
selProfesional.addEventListener('input', actualizarConceptosDesdeProfesional);

document.getElementById('btnNuevo').onclick = ()=>{
  if(soloLectura()){ alert(cajaDeOtra() ? `La caja la abrió ${cajaActual.recepcionista}: solo ella puede cargar movimientos. Cuando la cierre, abrí la tuya.` : "Para cargar movimientos hay que abrir caja."); return; }
  if(!cajaActual && !esFede()){ alert("La caja se encuentra cerrada, no se pueden cargar movimientos."); return; }
  modo = 'nuevo'; editingId = null; document.getElementById('movCargadoPor').classList.add('col-hidden');
  setMovCaja(movSub==='grande' ? 'grande' : 'chica');
  modalTitle.textContent = "Nuevo movimiento";
  btnGuardarMov.textContent = "Guardar movimiento";
  btnEliminar.classList.add('col-hidden');
  document.getElementById('inpFechaMovimiento').value = hoyISO(); document.getElementById('inpFechaMovimiento').max = hoyISO();
  document.getElementById('selIndica').innerHTML = INDICA_OPCIONES.map(o=> `<option>${o}</option>`).join('');
  overlay.classList.add('show');
  cargarStockCremasForm();
};

// "Oriana" a partir del nombre guardado del usuario; "13/10, 14:30 hs" a partir de una fecha
function nombreCortoUsuario(n){ const p = String(n||'').trim().split(/[\s,]+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; }
function fechaHoraCorta(d){ const z = x=> String(x).padStart(2,'0'); return `${z(d.getDate())}/${z(d.getMonth()+1)}, ${z(d.getHours())}:${z(d.getMinutes())} hs`; }
function abrirEdicion(id){
  if(soloLectura()){ alert(cajaDeOtra() ? `La caja la abrió ${cajaActual.recepcionista}: solo ella puede editar movimientos.` : "Para editar movimientos hay que abrir caja."); return; }
  let m = movimientos.find(x=>x.id===id);
  if(!m && cgDatos.movs){ m = cgDatos.movs.find(x=> x.id===id); if(m) movimientos.push(m); }   // desde Caja grande
  if(!m) return;
  modo = 'editar'; editingId = id;
  setMovTipo(tipoConcepto(m.prof, m.concepto), false);
  modalTitle.textContent = "Editar movimiento";
  btnGuardarMov.textContent = "Guardar cambios";
  btnEliminar.classList.remove('col-hidden');
  {
    const cp = document.getElementById('movCargadoPor');
    const ts = m.creadoEn && m.creadoEn.toDate ? m.creadoEn.toDate() : null;
    const quien = m.creadoPor ? nombreCortoUsuario(m.creadoPor) : '';
    cp.textContent = quien ? `cargado por ${quien}${ts ? ` (${fechaHoraCorta(ts)})` : ''}` : '';
    cp.classList.toggle('col-hidden', !quien);
  }

  selPaciente.value = m.pac;
  document.getElementById('inpDestinatario').value = m.pac;
  document.getElementById('inpFechaMovimiento').value = m.fechaISO;
  bloquearFechaMovimiento(true);
  selProfesional.value = m.prof;
  actualizarConceptosDesdeProfesional();
  selConcepto.value = m.concepto;
  actualizarCampoPacienteSegunTipo();
  refreshDeudasPaciente();

  document.getElementById('inpNotas').value = m.notas || "";
  document.querySelectorAll('.currency-toggle button').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.currency-toggle button[data-cur="${m.moneda}"]`).classList.add('active');
  monedaSel = m.moneda;

  document.getElementById('pagosLista').innerHTML = "";
  pagosDe(m).forEach(p=> agregarFilaPago(p.valor, p.medio, p.cobradoPor, {moneda:p.moneda, montoOriginal:p.montoOriginal, cotizacion:p.cotizacion}));
  const pagosIniciales = pagosDe(m);
  montoAutoSync = pagosIniciales.length===1 ? String(pagosIniciales[0].valor) : null;

  inpValor.value = Number(m.valor).toLocaleString('es-AR');
  { const sd = document.getElementById('selDescMov');
    sd.value = m.descuentoPct ? `${m.descuentoPct}|${m.descuentoLbl}` : '';
    if(m.descuentoPct && sd.value === ''){ sd.insertAdjacentHTML('beforeend', `<option value="${m.descuentoPct}|${escHtml(m.descuentoLbl||'')}">${escHtml(m.descuentoLbl||'')}</option>`); sd.value = `${m.descuentoPct}|${m.descuentoLbl}`; }
    sugerirTotalMov(false); }
  setJornada(!!m.jornada && !document.getElementById('jornadaWrap').classList.contains('col-hidden'));
  setMovCaja(m.caja);
  { const ind = (cremasExtra[m.id] && cremasExtra[m.id].indica) || m.indicaCrema || 'PARTICULAR';
    document.getElementById('selIndica').innerHTML = [...new Set([...INDICA_OPCIONES, ind])].map(o=> `<option ${o===ind?'selected':''}>${o}</option>`).join('');
    actualizarIndicaVisible(); }
  overlay.classList.add('show');
}
window.abrirEdicion = abrirEdicion;

document.getElementById('closeModal').onclick = cerrarModal;
document.getElementById('cancelMov').onclick = cerrarModal;
function cerrarModal(){ overlay.classList.remove('show'); resetModal(); }
const MSG_FECHA_NO_EDITABLE = "La fecha no se puede editar. En caso de querer editar la fecha, elimine el movimiento y vuelva a cargarlo en la fecha correspondiente.";
function bloquearFechaMovimiento(bloquear){
  const inp = document.getElementById('inpFechaMovimiento');
  inp.readOnly = bloquear;
  inp.classList.toggle('fecha-bloqueada', bloquear);
  inp.title = bloquear ? "La fecha no se puede editar" : "";
}
(function(){
  const inp = document.getElementById('inpFechaMovimiento');
  const avisar = (e)=>{
    if(!inp.readOnly) return;
    if(e.type==='keydown' && ['Tab','Shift'].includes(e.key)) return;
    e.preventDefault();
    inp.blur();
    alert(MSG_FECHA_NO_EDITABLE);
  };
  inp.addEventListener('mousedown', avisar);
  inp.addEventListener('keydown', avisar);
})();
function resetModal(){
  montoAutoSync = null;
  document.getElementById('indicaWrap').classList.add('col-hidden');
  setJornada(false); setMovCaja(movSub==='grande' ? 'grande' : 'chica');
  document.getElementById('jornadaWrap').classList.add('col-hidden');
  bloquearFechaMovimiento(false);
  document.getElementById('inpFechaMovimiento').value = hoyISO(); document.getElementById('inpFechaMovimiento').max = hoyISO();
  selPaciente.value = "";
  document.getElementById('inpDestinatario').value = "";
  document.getElementById('campoPacienteIngreso').classList.remove('col-hidden');
  document.getElementById('campoPacienteEgreso').classList.add('col-hidden');
  document.getElementById('cardNuevoProveedor').classList.add('col-hidden');
  selProfesional.value = "";
  selConcepto.value = "";
  selConcepto.placeholder = "Elegí primero un profesional/área…";
  selConcepto.disabled = true;
  conceptosDisponiblesActual = [];
  document.getElementById('inpNotas').value = "";
  inpValor.value = "";
  document.getElementById('selDescMov').value = "";
  inpValor.placeholder = "0"; inpValor.classList.remove('con-sugerido');
  document.getElementById('movDescWrap').classList.remove('col-hidden');
  document.querySelectorAll('.currency-toggle button').forEach(b=>b.classList.remove('active'));
  document.querySelector('.currency-toggle button[data-cur="$"]').classList.add('active');
  monedaSel = "$";
  document.getElementById('pagosLista').innerHTML = "";
  document.getElementById('pagosLista').classList.remove('oculta-quien');
  agregarFilaPago();
  document.getElementById('cardNuevoPaciente').classList.add('col-hidden');
  document.getElementById('deudasPacienteBox').classList.add('col-hidden');
  document.getElementById('deudasPacienteLista').innerHTML = "";
  setMovTipo('ingreso', false);
  modo = 'nuevo'; editingId = null; document.getElementById('movCargadoPor').classList.add('col-hidden');
  modalTitle.textContent = "Nuevo movimiento";
  btnGuardarMov.textContent = "Guardar movimiento";
  btnEliminar.classList.add('col-hidden');
}

btnEliminar.onclick = async ()=>{
  if(editingId===null) return;
  if(await ummConfirm("¿Está seguro de eliminar este registro? Esta opción no tiene vuelta atrás.")){
    try{
      const ref = db.collection('movimientos').doc(editingId);
      const snap = await ref.get();
      const datos = snap.exists ? snap.data() : null;
      if(datos && (datos.saldaDeuda || (datos.saldaDeudas||[]).length)){
        // este movimiento había saldado deudas de otros registros: las revertimos a "Debe"
        const lista = (datos.saldaDeudas && datos.saldaDeudas.length) ? datos.saldaDeudas : [datos.saldaDeuda];
        const porMov = {};
        lista.forEach(d=> (porMov[d.movId] = porMov[d.movId] || []).push(d.idx));
        for(const movId of Object.keys(porMov)){
          const refDeuda = db.collection('movimientos').doc(movId);
          const snapDeuda = await refDeuda.get();
          if(!snapDeuda.exists) continue;
          const pagosDeuda = pagosDe(snapDeuda.data()).slice();
          porMov[movId].forEach(idx=>{
            if(pagosDeuda[idx]) pagosDeuda[idx] = {...pagosDeuda[idx], saldada:false, fechaSaldadoISO:null, fechaSaldadoDisplay:null, saldadoPorMovId:null};
          });
          await refDeuda.update({ pagos: pagosDeuda, tieneDeudaPendiente: tieneDeudaPendiente(pagosDeuda) });
        }
      }
      await ref.delete();
      cerrarModal();
    }catch(e){
      alert("No se pudo eliminar: " + e.message);
    }
  }
};

document.getElementById('btnAddPaciente').onclick = ()=> document.getElementById('cardNuevoPaciente').classList.remove('col-hidden');
document.getElementById('cancelPaciente').onclick = ()=> document.getElementById('cardNuevoPaciente').classList.add('col-hidden');
// Si falta teléfono, DNI, fecha de nacimiento o método de llegada, se avisa (y se puede seguir igual)
async function confirmarDatosFaltantes(d){
  const falta = [];
  if(!String(d.tel||'').trim()) falta.push('teléfono');
  if(!String(d.dni||'').trim()) falta.push('DNI');
  if(!String(d.fnac||'').trim()) falta.push('fecha de nacimiento');
  if(!String(d.medio||'').trim()) falta.push('método de llegada');
  if(!falta.length) return true;
  const lista = falta.length===1 ? falta[0] : falta.slice(0,-1).join(', ') + ' y ' + falta[falta.length-1];
  return await ummConfirm(`¿Está seguro de que quiere cargar sin ${lista}?`);
}
document.getElementById('guardarPaciente').onclick = async ()=>{
  const ape = document.getElementById('npApellido').value.trim();
  const nom = document.getElementById('npNombre').value.trim();
  const tel = document.getElementById('npTelefono').value.trim();
  if(!ape || !nom){ alert("Apellido y nombre son obligatorios."); return; }
  if(!await confirmarDatosFaltantes({tel, dni: document.getElementById('npDni').value, fnac: document.getElementById('npFnac').value, medio: document.getElementById('npMedio').value})) return;
  const nombreCompleto = `${ape.toUpperCase()}, ${nom}`;
  await db.collection('pacientes').add({
    apellido: ape.toUpperCase(), nombre: nom, nombreCompleto,
    telefono: tel,
    email: document.getElementById('npEmail').value.trim(),
    fnac: document.getElementById('npFnac').value,
    dni: document.getElementById('npDni').value.trim(),
    medioLlegada: document.getElementById('npMedio').value,
    referidoPor: document.getElementById('npMedio').value==='REFERIDO' ? mayus(document.getElementById('npReferido').value.trim()) : '',
    creadoEn: firebase.firestore.FieldValue.serverTimestamp(), ...marcaPac(),
  });
  selPaciente.value = nombreCompleto;
  document.getElementById('cardNuevoPaciente').classList.add('col-hidden');
  ['npApellido','npNombre','npTelefono','npEmail','npFnac','npDni','npMedio','npReferido'].forEach(id=>document.getElementById(id).value="");
  document.getElementById('npRefWrap').classList.add('col-hidden');
};
document.getElementById('npMedio').addEventListener('change', e=> document.getElementById('npRefWrap').classList.toggle('col-hidden', e.target.value!=='REFERIDO'));

selPaciente.addEventListener('input', refreshDeudasPaciente);
function refreshDeudasPaciente(){
  const box = document.getElementById('deudasPacienteBox');
  const lista = document.getElementById('deudasPacienteLista');
  const pendientes = movimientosDeuda.filter(d=>d.pac===selPaciente.value && d.movId!==editingId);
  if(!selPaciente.value || !pendientes.length){
    box.classList.add('col-hidden'); lista.innerHTML=""; return;
  }
  box.classList.remove('col-hidden');
  lista.innerHTML = (pendientes.length > 1 ? '<div class="deuda-ayuda">Podés marcar varias. El total puede quedar en 0 si se saldaron de otra forma (explicalo en el detalle).</div>' : '') + pendientes.map(d=>`
    <div class="deuda-mini">
      <label><input type="checkbox" name="saldarDeuda" value="${d.movId}::${d.idx}"> Saldar "${d.concepto}" del ${d.fechaDisplay} — ${fmtMonto(d.valor, d.moneda)}</label>
      ${d.notas ? `<div class="det">${d.notas}</div>` : ""}
    </div>
  `).join('');
}

document.getElementById('deudasPacienteLista').addEventListener('change', (e)=>{
  if(!e.target.matches('input[name="saldarDeuda"]')) return;
  const elegidas = [...document.querySelectorAll('input[name="saldarDeuda"]:checked')].map(inp=>{
    const [movId, idxStr] = inp.value.split('::');
    return movimientosDeuda.find(d=> d.movId===movId && d.idx===Number(idxStr));
  }).filter(Boolean);
  if(!elegidas.length) return;
  selProfesional.value = elegidas[0].prof;
  actualizarSoloConceptos();
  selConcepto.disabled = false;
  const fechas = [...new Set(elegidas.map(d=> d.fechaDisplay))];
  selConcepto.value = elegidas.length===1 ? `Salda deuda del ${elegidas[0].fechaDisplay}` : `Salda deudas del ${fechas.join(', ')}`;
});

document.querySelectorAll('.currency-toggle button').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.currency-toggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    monedaSel = btn.dataset.cur;
    document.querySelectorAll('#pagosLista .pago-row').forEach(r=>{ if(r.dataset.sigue!=='0') r.querySelector('.pago-mon').value = monedaSel; });
    recalcularPagos();
    sugerirTotalMov(false);
  };
});
let montoAutoSync = null; // último monto que autocompletamos en el primer pago, para saber si el usuario lo tocó
inpValor.addEventListener('input', ()=>{
  let raw = inpValor.value.replace(/\D/g,"");
  inpValor.value = raw ? Number(raw).toLocaleString('es-AR') : "";
  setTimeout(()=> recalcularPagos(), 0);

  const filas = document.querySelectorAll('#pagosLista .pago-row');
  if(filas.length === 1){
    const montoInput = filas[0].querySelector('.pago-monto');
    const valorActual = montoInput.value.replace(/\D/g,"");
    if(!valorActual || valorActual === montoAutoSync){
      montoInput.value = raw ? Number(raw).toLocaleString('es-AR') : "";
      montoAutoSync = raw;
    }
  }
});


btnGuardarMov.onclick = async ()=>{
  const egreso = esEgreso(selProfesional.value, selConcepto.value);
  const pacValor = egreso ? document.getElementById('inpDestinatario').value.trim() : selPaciente.value;
  if(!pacValor){ alert(egreso ? "Ingresá a quién se le paga." : "Elegí un paciente/alumno."); return; }
  if(!selProfesional.value){ alert("Elegí un profesional/área."); return; }
  if(!selConcepto.value){ alert("Elegí un concepto."); return; }
  const conceptoCat = (CONCEPTOS[selProfesional.value]||[]).find(c=> c.concepto===selConcepto.value);
  if(conceptoCat && conceptoCat.detObligatorio && !document.getElementById('inpNotas').value.trim()){
    alert("Detalle obligatorio en este concepto.");
    document.getElementById('inpNotas').focus();
    return;
  }
  const valorNum = Number(inpValor.value.replace(/\D/g,""));
  if(inpValor.value.trim() === "" && inpValor.classList.contains('con-sugerido')){ alert(`Escribí el total para confirmarlo (sugerido: ${monedaSel==='USD' ? 'USD ' : '$'}${inpValor.placeholder}).`); inpValor.focus(); return; }
  if(inpValor.value.trim() === "" || isNaN(valorNum)){ alert("Ingresá un total (puede ser 0)."); return; }
  const dMov = egreso ? {pct:0, lbl:''} : descMovSel();
  const cMov = conceptoCatActual();
  const datosDesc = dMov.pct
    ? {descuentoPct: dMov.pct, descuentoLbl: dMov.lbl, ...(cMov && cMov.valor && (cMov.valorMoneda||'$')===monedaSel ? {valorLista: cMov.valor} : {})}
    : null;

  let pagos = leerPagosForm();
  if(!pagos) return;
  // con cotización pueden quedar centavos de diferencia: se ajusta el último pago en otra moneda
  {
    const dif = Math.round((valorNum - pagos.reduce((a,p)=>a+p.valor,0))*100)/100;
    const conv = pagos.filter(p=> p.moneda).pop();
    if(conv && Math.abs(dif) < 1) conv.valor = Math.round((conv.valor + dif)*100)/100;
  }
  const sumaPagos = pagos.reduce((a,p)=>a+p.valor,0);
  if(sumaPagos > valorNum){
    alert(`La suma de los pagos cargados (${fmtMonto(sumaPagos, monedaSel)}) supera el total (${fmtMonto(valorNum, monedaSel)}). Corregí los montos.`);
    return;
  }
  // Saldando una deuda: si lo cargado no cubre el total, no se genera otra deuda por error
  if(sumaPagos < valorNum && document.querySelector('input[name="saldarDeuda"]:checked')){
    alert(`Para saldar la deuda, los pagos tienen que cubrir el total (${fmtMonto(valorNum, monedaSel)}). Faltan ${fmtMonto(valorNum - sumaPagos, monedaSel)}: revisá el monto y el medio de cada pago.`);
    return;
  }
  if(sumaPagos < valorNum){
    // Si hay un solo pago cargado, la parte que queda como deuda se la debe el mismo que cobró ese pago.
    // Si hay varios (o ninguno), por defecto se la debe a Ummana.
    const cobradoPorDeuda = pagos.length === 1 ? pagos[0].cobradoPor : "ummana";
    pagos.push({medio:"debe", valor: valorNum - sumaPagos, cobradoPor: cobradoPorDeuda, saldada:false, fechaSaldadoISO:null, fechaSaldadoDisplay:null});
  }
  if(egreso && pagos.some(p=>p.medio==="debe")){
    alert('Un gasto no puede quedar como "Debe" — revisá que los pagos cubran el total completo.');
    return;
  }

  const deudasASaldar = [...document.querySelectorAll('input[name="saldarDeuda"]:checked')].map(inp=>{
    const [movId, idxStr] = inp.value.split('::');
    return {movId, idx: Number(idxStr)};
  });
  // Pago parcial de deuda: si se paga menos de lo que se debe, la diferencia puede quedar como deuda
  let restoDeuda = false;
  if(deudasASaldar.length && valorNum > 0){
    const info = deudasASaldar.map(d=> movimientosDeuda.find(x=> x.movId===d.movId && x.idx===d.idx)).filter(Boolean);
    const mismaMoneda = info.length===deudasASaldar.length && info.every(x=> (x.moneda||'$')===monedaSel);
    const suma = info.reduce((a,x)=> a + (Number(x.valor)||0), 0);
    if(mismaMoneda && valorNum < suma){
      restoDeuda = await ummConfirm(`La deuda es de ${fmtMonto(suma, monedaSel)} y se pagan ${fmtMonto(valorNum, monedaSel)}.\n\n¿Queda debiendo ${fmtMonto(suma - valorNum, monedaSel)}?`, {si: 'Sí, queda debiendo', no: 'No, se salda completa'});
      if(restoDeuda) deudasASaldar.forEach(d=>{ const x = info.find(y=> y.movId===d.movId && y.idx===d.idx); d.valor = Number(x.valor)||0; });
    }
  }
  const fechaISO = document.getElementById('inpFechaMovimiento').value || hoyISO();
  if(!document.getElementById('inpFechaMovimiento').value){ alert("Elegí una fecha."); return; }
  if(modo!=='editar'){
    if(fechaISO > hoyISO()){ alert("No se pueden cargar movimientos con fecha posterior a hoy."); return; }
    if(fechaISO < hoyISO() && !await ummConfirm(`ATENCIÓN: está cargando un movimiento con fecha ${ecFecha(fechaISO)}, que no es la fecha de hoy (${ecFecha(hoyISO())}).\n\n¿Está seguro de continuar?`)) return;
  }
  const fechaDisplay = isoToDisplay(fechaISO);
  const codigo = CODIGO_POR_CONCEPTO[selProfesional.value+"||"+selConcepto.value] || "";
  const pendienteDeuda = tieneDeudaPendiente(pagos);

  let nuevoMovId = null;
  if(modo==='editar'){
    if(!await ummConfirm("¿Está seguro de editar este registro? Esta opción no tiene vuelta atrás.")) return;
    const cambios = {
      pac: pacValor, prof: selProfesional.value, concepto: selConcepto.value, codigo,
      notas: document.getElementById('inpNotas').value, moneda: monedaSel, valor: valorNum,
      pagos, tieneDeudaPendiente: pendienteDeuda, jornada: movJornada, caja: movCaja,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      ...(datosDesc || {descuentoPct: firebase.firestore.FieldValue.delete(), descuentoLbl: firebase.firestore.FieldValue.delete(), valorLista: firebase.firestore.FieldValue.delete()}),
    };
    if(!document.getElementById('indicaWrap').classList.contains('col-hidden')) cambios.indicaCrema = document.getElementById('selIndica').value || 'PARTICULAR';
    await db.collection('movimientos').doc(editingId).update(cambios);
    nuevoMovId = editingId;
  } else {
    if(!cajaActual && !esFede()){ alert("La caja se encuentra cerrada, no se pueden cargar movimientos."); return; }
    if(cajaActual && fechaISO !== cajaActual.fechaISO){
      try{
        const snapDia = await db.collection('cajaSesiones').where('fechaISO','==', fechaISO).get();
        const tieneCajaCerrada = snapDia.docs.some(d=> d.id !== cajaActual.id && d.data().cerradaEn);
        if(tieneCajaCerrada && !await ummConfirm("Está cargando un movimiento en un día que ya tiene su caja cerrada, ¿está seguro de continuar?")) return;
      }catch(e){ console.error(e); }
    }
    const nuevoRef = await db.collection('movimientos').add({
      fechaISO, fechaDisplay, pac: pacValor, prof: selProfesional.value,
      concepto: selConcepto.value, codigo, notas: document.getElementById('inpNotas').value,
      moneda: monedaSel, valor: valorNum, pagos, tieneDeudaPendiente: pendienteDeuda, jornada: movJornada, caja: movCaja,
      ...(datosDesc || {}),
      ...(!document.getElementById('indicaWrap').classList.contains('col-hidden') ? {indicaCrema: document.getElementById('selIndica').value || 'PARTICULAR'} : {}),
      creadoPor: currentUser.nombre, creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      cajaId: cajaActual ? cajaActual.id : 'SIN_CAJA',
    });
    nuevoMovId = nuevoRef.id;
  }

  if(deudasASaldar.length){
    // se agrupan por movimiento (un mismo registro puede tener varias partes en "Debe")
    // con pago parcial: lo pagado cubre las deudas en orden; la que queda a medias se divide (parte saldada + resto en "Debe")
    let disponible = valorNum;
    const parte = {};   // "movId::idx" → monto saldado (si es menos que la deuda)
    if(restoDeuda){
      deudasASaldar.forEach(d=>{
        const k = d.movId + '::' + d.idx;
        if(disponible >= d.valor){ disponible -= d.valor; }
        else { parte[k] = disponible; disponible = 0; }
      });
    }
    const porMov = {};
    deudasASaldar.forEach(d=> (porMov[d.movId] = porMov[d.movId] || []).push(d.idx));
    const saldadas = [];
    for(const movId of Object.keys(porMov)){
      const ref = db.collection('movimientos').doc(movId);
      const snap = await ref.get();
      if(!snap.exists) continue;
      const pagosDeuda = pagosDe(snap.data()).slice();
      porMov[movId].forEach(idx=>{
        if(!pagosDeuda[idx]) return;
        const k = movId + '::' + idx;
        if(k in parte){
          const pagado = parte[k], resto = (Number(pagosDeuda[idx].valor)||0) - pagado;
          if(pagado <= 0) return;   // no le llegó nada del pago: sigue igual
          pagosDeuda.push({medio:'debe', valor: resto, cobradoPor: pagosDeuda[idx].cobradoPor || 'ummana', saldada:false, fechaSaldadoISO:null, fechaSaldadoDisplay:null});
          pagosDeuda[idx] = {...pagosDeuda[idx], valor: pagado};
        }
        pagosDeuda[idx] = {...pagosDeuda[idx], saldada:true, fechaSaldadoISO:fechaISO, fechaSaldadoDisplay:fechaDisplay, saldadoPorMovId:nuevoMovId};
        saldadas.push({movId, idx});
      });
      await ref.update({ pagos: pagosDeuda, tieneDeudaPendiente: tieneDeudaPendiente(pagosDeuda) });
    }
    // guardamos en el movimiento nuevo qué deudas saldó, para poder revertirlas si este movimiento se borra
    if(saldadas.length) await db.collection('movimientos').doc(nuevoMovId).update({ saldaDeuda: saldadas[0], saldaDeudas: saldadas });
  }

  cerrarModal();
};

/* =====================================================================
   DEUDORES
   ===================================================================== */
const overlayDeudores = document.getElementById('overlayDeudores');
document.getElementById('btnDeudores').onclick = ()=>{ document.getElementById('deuBuscar').value = ''; renderDeudores(); overlayDeudores.classList.add('show'); };
document.getElementById('deuBuscar').addEventListener('input', renderDeudores);
attachAutocomplete(document.getElementById('deuBuscar'), ()=> [...new Set(movimientosDeuda.map(d=> d.pac))].sort());
document.getElementById('deuLimpiar').onclick = ()=>{ document.getElementById('deuBuscar').value = ''; renderDeudores(); };

/* ---- Back up del mes (Fede y Pedro): todos los movimientos diarios del mes en Excel o PDF ---- */
const overlayBackup = document.getElementById('overlayBackup');
function abrirBackup(){
  if(!(currentUser && currentUser.rol==='admin')) return;
  document.getElementById('bkMes').value = `${mesActual.year}-${String(mesActual.month).padStart(2,'0')}`;
  document.getElementById('bkMes').max = hoyISO().slice(0,7);
  document.getElementById('bkInfo').textContent = '';
  overlayBackup.classList.add('show');
}
['closeBackup','cancelBackup'].forEach(id=> document.getElementById(id).onclick = ()=> overlayBackup.classList.remove('show'));
async function bkMovimientos(){
  const ym = document.getElementById('bkMes').value;
  if(!ym){ alert('Elegí el mes.'); return null; }
  let [y,m] = ym.split('-').map(Number); const ini = `${ym}-01`; m++; if(m>12){ m=1; y++; }
  const fin = `${y}-${String(m).padStart(2,'0')}-01`;
  document.getElementById('bkInfo').textContent = 'Buscando movimientos…';
  const snap = await db.collection('movimientos').where('fechaISO','>=', ini).where('fechaISO','<', fin).orderBy('fechaISO','asc').get();
  const ms = (x)=> x && x.toMillis ? x.toMillis() : 0;
  const lista = snap.docs.map(d=> ({id:d.id, ...d.data()})).sort((a,b)=> a.fechaISO.localeCompare(b.fechaISO) || ms(a.creadoEn)-ms(b.creadoEn));
  document.getElementById('bkInfo').textContent = `${lista.length} ${lista.length===1?'movimiento':'movimientos'} en el mes.`;
  return {ym, lista};
}
function bkFilas(lista){
  const fh = ts=> ts && ts.toDate ? fechaHoraCorta(ts.toDate()) : '';
  return lista.map(m=> ({
    'Fecha': ecFecha(m.fechaISO), 'Caja': esCajaGrande(m) ? 'GRANDE' : 'CHICA', 'Tipo': esGastoMov(m) ? 'Egreso' : 'Ingreso', 'Paciente / Destinatario': m.pac||'',
    'Profesional / Área': m.prof||'', 'Concepto': m.concepto||'', 'Notas': (m.notas||'') + (m.jornada ? ' (JORNADA)' : ''),
    'Moneda': m.moneda==='USD' ? 'USD' : '$', 'Total': (Number(m.valor)||0) * (esGastoMov(m) ? -1 : 1),
    'Medio de pago': medioDisplayText(m), 'Cobró': cobroTextoPlano(m), 'Cargado por': (m.creadoPor||'') + (m.creadoEn ? ` (${fh(m.creadoEn)})` : ''),
  }));
}
const bkNombreMes = ym=> { const [y,m] = ym.split('-'); return `${MESES[+m-1]} ${y}`; };
document.getElementById('bkExcel').onclick = async ()=>{
  const btn = document.getElementById('bkExcel'); btn.disabled = true;
  try{
    const r = await bkMovimientos(); if(!r) return;
    if(!r.lista.length){ alert('No hay movimientos en ese mes.'); return; }
    const ws = XLSX.utils.json_to_sheet(bkFilas(r.lista));
    ws['!cols'] = [10,8,8,28,24,8,32,30,7,12,24,18,26].map(w=> ({wch:w}));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, `backup-movimientos-${r.ym}.xlsx`);
  }catch(e){ alert('No se pudo generar el Excel: ' + e.message); }
  finally{ btn.disabled = false; }
};
document.getElementById('bkPdf').onclick = async ()=>{
  const btn = document.getElementById('bkPdf'); btn.disabled = true;
  try{
    const r = await bkMovimientos(); if(!r) return;
    if(!r.lista.length){ alert('No hay movimientos en ese mes.'); return; }
    const filas = bkFilas(r.lista);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
    doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(58,47,28);
    doc.text(limpiarTextoPDF(`Back up de movimientos - ${bkNombreMes(r.ym)}`), 30, 34);
    doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(122,106,72);
    doc.text(limpiarTextoPDF(`Exportado por ${nombreCortoUsuario(currentUser ? currentUser.nombre : '')} (${fechaHoraCorta(new Date())}) - ${filas.length} movimientos`), 30, 48);
    const cols = ['Fecha','Caja','Tipo','Paciente / Destinatario','Profesional / Área','Concepto','Notas','Total','Medio de pago','Cobró','Cargado por'];
    doc.autoTable({
      startY: 60, margin:{left:30, right:30},
      head: [cols.map(limpiarTextoPDF)],
      body: filas.map(f=> cols.map(c=> limpiarTextoPDF(c==='Total' ? fmtMonto(Math.abs(f.Total), f.Moneda==='USD'?'USD':'$') : String(f[c]??'')))),
      styles: {font:'helvetica', fontSize:6.8, cellPadding:3, textColor:[36,38,43], lineColor:[231,225,210], lineWidth:0.4},
      headStyles: {fillColor:[182,154,98], textColor:255, fontStyle:'bold', fontSize:7},
      alternateRowStyles: {fillColor:[251,248,240]},
      columnStyles: {0:{cellWidth:48}, 1:{cellWidth:40}, 2:{cellWidth:38}, 7:{halign:'right', cellWidth:58}},
      didParseCell: c=>{ if(c.section==='body' && c.column.index===7){ c.cell.styles.fontStyle='bold'; c.cell.styles.textColor = filas[c.row.index].Tipo==='Egreso' ? [161,58,58] : [47,122,47]; } },
    });
    doc.save(`backup-movimientos-${r.ym}.pdf`);
  }catch(e){ alert('No se pudo generar el PDF: ' + e.message); }
  finally{ btn.disabled = false; }
};

/* ---- Formato de PDF Ummana (presupuestos y cuentas corrientes): logo con hoja, tarjeta de datos, tabla, notas, observaciones y contacto ---- */
const UMM_VERDE = [178,177,156], UMM_VERDE_OSC = [143,142,120], UMM_TXT = [61,61,51];
const ummImgCache = {};
async function ummImg(src){
  if(ummImgCache[src] !== undefined) return ummImgCache[src];
  try{
    const im = await new Promise((ok, mal)=>{ const i = new Image(); i.onload = ()=> ok(i); i.onerror = mal; i.src = src; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
    ummImgCache[src] = {url: c.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight};
  }catch(e){ ummImgCache[src] = null; }
  return ummImgCache[src];
}
// Montserrat embebida en el PDF (tipografía de Ummana); si no carga, se usa Helvetica
let ummFuente = null;
async function ummCargarFuente(doc){
  if(ummFuente === null){
    try{
      const b64 = async f=>{ const buf = await (await fetch(f)).arrayBuffer(); let bin = ''; const u = new Uint8Array(buf); for(let i=0;i<u.length;i+=0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i+0x8000)); return btoa(bin); };
      ummFuente = {normal: await b64('fonts/Montserrat-Regular.ttf'), bold: await b64('fonts/Montserrat-Bold.ttf')};
    }catch(e){ ummFuente = false; }
  }
  if(!ummFuente) return 'helvetica';
  doc.addFileToVFS('Montserrat-Regular.ttf', ummFuente.normal); doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
  doc.addFileToVFS('Montserrat-Bold.ttf', ummFuente.bold); doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
  return 'Montserrat';
}
// opts: {titulo, datos:[[etiqueta, valor]], head, body, columnStyles, totales:[{lbl, val, tipo:'sub'|'desc'|'total'}], notas, observaciones:[{t, b}]}
async function pdfFormatoUmmana(opts){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42;
  const T = s=> limpiarTextoPDF(s);
  const F = await ummCargarFuente(doc);
  // logo
  const logo = await ummImg('images/logo-hoja.png');
  const LH = 100, LW = logo ? LH * logo.w / logo.h : 80;
  if(logo) doc.addImage(logo.url, 'PNG', M, 40, LW, LH);
  // tarjeta de datos
  const cx = M + LW + 24, cw = W - M - cx, rh = 24, hh = 26, ch = hh + rh * opts.datos.length, cy = 40 + Math.max(0, (LH - ch) / 2);
  doc.setFillColor(...UMM_VERDE); doc.roundedRect(cx, cy, cw, hh, 6, 6, 'F'); doc.rect(cx, cy + hh - 6, cw, 6, 'F');
  doc.setDrawColor(...UMM_VERDE); doc.setLineWidth(1.2); doc.roundedRect(cx, cy, cw, ch, 6, 6, 'S');
  doc.setTextColor(255,255,255); doc.setFont(F,'bold'); doc.setFontSize(10); doc.setCharSpace(2);
  doc.text(T(opts.titulo), cx + 12, cy + hh/2 + 3.5); doc.setCharSpace(0);
  opts.datos.forEach(([k, v, negrita], i)=>{
    const y = cy + hh + rh * i;
    if(i){ doc.setDrawColor(236,235,227); doc.setLineWidth(0.6); doc.line(cx + 1, y, cx + cw - 1, y); }
    doc.setFont(F,'bold'); doc.setFontSize(7.5); doc.setTextColor(...UMM_VERDE); doc.text(T(k), cx + 12, y + rh/2 + 2.7);
    doc.setFont(F, negrita ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(...UMM_TXT); doc.text(T(v), cx + 92, y + rh/2 + 3.5);
  });
  // tabla
  let y = Math.max(40 + LH, cy + ch) + 22;
  doc.autoTable({
    startY: y, margin:{left:M, right:M, bottom:70},
    head: [opts.head.map(T)], body: opts.body.map(f=> f.map(T)),
    theme: 'plain',
    styles: {font:F, fontSize:9.5, textColor:UMM_TXT, cellPadding:{top:7, bottom:7, left:7, right:7}},
    headStyles: {fillColor:UMM_VERDE, textColor:255, fontStyle:'bold', fontSize:8.5},
    alternateRowStyles: {fillColor:[247,247,242]},
    columnStyles: opts.columnStyles || {},
    didParseCell: c=>{ const cs = (opts.columnStyles||{})[c.column.index]; if(c.section==='head' && cs && cs.halign) c.cell.styles.halign = cs.halign; },
  });
  y = doc.lastAutoTable.finalY + 22;
  const nuevaPagSi = alto=>{ if(y + alto > H - 80){ doc.addPage(); y = 50; } };
  // totales
  const tx = W - M - 250;
  (opts.totales||[]).forEach(t=>{
    nuevaPagSi(30);
    if(t.tipo==='total'){
      y -= 4; doc.setDrawColor(...UMM_VERDE); doc.setLineWidth(2); doc.line(tx, y, W - M, y); y += 18;
      doc.setFont(F,'bold'); doc.setFontSize(13); doc.setTextColor(...UMM_TXT);
    } else {
      doc.setFont(F,'normal'); doc.setFontSize(9.5); doc.setTextColor(...(t.tipo==='desc' ? UMM_VERDE_OSC : UMM_TXT));
    }
    doc.text(T(t.lbl), tx + 6, y); doc.text(T(t.val), W - M - 6, y, {align:'right'});
    y += t.tipo==='total' ? 22 : 16;
  });
  const etiqueta = txt=>{ nuevaPagSi(40); y += 10; doc.setFont(F,'bold'); doc.setFontSize(7.5); doc.setTextColor(...UMM_VERDE); doc.setCharSpace(1); doc.text(txt, M, y); doc.setCharSpace(0); y += 7; };
  // notas
  if(opts.notas && opts.notas.trim()){
    etiqueta('NOTAS');
    doc.setFont(F,'normal'); doc.setFontSize(9.5);
    const lineas = doc.splitTextToSize(T(opts.notas.trim()), W - 2*M - 26);
    const bh = lineas.length * 13 + 14; nuevaPagSi(bh);
    doc.setFillColor(247,247,242); doc.rect(M, y, W - 2*M, bh, 'F'); doc.setFillColor(...UMM_VERDE); doc.rect(M, y, 3, bh, 'F');
    doc.setTextColor(...UMM_TXT); doc.text(lineas, M + 14, y + 16); y += bh + 6;
  }
  // observaciones
  if(opts.observaciones && opts.observaciones.length){
    etiqueta('OBSERVACIONES');
    opts.observaciones.forEach(o=>{
      nuevaPagSi(16); y += 6;
      doc.setFillColor(...UMM_TXT); doc.circle(M + 4, y - 3, 1.3, 'F');
      doc.setFont(F, o.b ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(...UMM_TXT); doc.text(T(o.t), M + 12, y); y += 8;
    });
  }
  // pie de contacto en todas las páginas
  const contactos = opts.contacto ? opts.contacto.map(c=> [c.ic, c.t]) : UMM_CONTACTO;
  const icons = await Promise.all(contactos.map(([ic])=> ummImg(`images/${ic}.png`)));
  doc.setFont(F,'normal'); doc.setFontSize(8);
  const anchos = contactos.map(([,t])=> 15 + doc.getTextWidth(t)), gap = 16, total = anchos.reduce((a,b)=> a+b, 0) + gap * (contactos.length - 1);
  for(let pg = 1; pg <= doc.getNumberOfPages(); pg++){
    doc.setPage(pg);
    const py = H - 44;
    doc.setDrawColor(217,216,204); doc.setLineWidth(0.8); doc.line(M, py - 14, W - M, py - 14);
    let x = (W - total) / 2;
    contactos.forEach(([, t], i)=>{
      if(icons[i]) doc.addImage(icons[i].url, 'PNG', x, py - 8, 11, 11);
      doc.setTextColor(...UMM_VERDE_OSC); doc.text(t, x + 15, py + 0.5); x += anchos[i] + gap;
    });
  }
  return doc;
}

/* ---- Presupuestos (todas las cuentas) ---- */
const overlayPresupuesto = document.getElementById('overlayPresupuesto');
// Descuentos: el total con descuento se redondea SIEMPRE para arriba, de 5.000 en 5.000 (en USD, de 5 en 5).
// Nunca supera el valor sin descuento.
// ---- Valor sugerido en el movimiento: sale del concepto y se muestra en gris (placeholder);
// la recepcionista lo tiene que escribir para confirmarlo.
function conceptoCatActual(){
  return (CONCEPTOS[selProfesional.value]||[]).find(c=> c.concepto===selConcepto.value) || null;
}
function descMovSel(){
  const [pct, lbl] = (document.getElementById('selDescMov').value || '').split('|');
  return {pct: Number(pct) || 0, lbl: lbl || ''};
}
function sugerirTotalMov(cambioConcepto){
  const inp = document.getElementById('inpValor');
  const egreso = movTipo==='egreso';
  document.getElementById('movDescWrap').classList.toggle('col-hidden', egreso);
  const c = egreso ? null : conceptoCatActual();
  if(c && c.valor && cambioConcepto && !inp.value.trim() && monedaSel !== c.valorMoneda){
    const b = document.querySelector(`#overlay .currency-toggle button[data-cur="${c.valorMoneda}"]`);
    if(b){ b.click(); return; }   // el click vuelve a llamar a esta función
  }
  if(c && c.valor && monedaSel === (c.valorMoneda||'$')){
    inp.placeholder = Number(totalConDescuento(c.valor, descMovSel().pct, monedaSel)).toLocaleString('es-AR');
    inp.classList.add('con-sugerido');
  } else {
    inp.placeholder = '0';
    inp.classList.remove('con-sugerido');
  }
}
function totalConDescuento(base, pct, moneda){
  base = Number(base) || 0; pct = Number(pct) || 0;
  if(!pct || !base) return base;
  const paso = moneda==='USD' ? 5 : 5000;
  return Math.min(base, Math.ceil(base * (100 - pct) / 100 / paso) * paso);
}
let prMon = '$';
let prConTotal = true;
function prSetTotModo(v){ prConTotal = v; document.querySelectorAll('#prTotModo button').forEach(b=> b.classList.toggle('active', (b.dataset.tm==='1')===v)); prRecalc(); }
document.querySelectorAll('#prTotModo button').forEach(b=> b.onclick = ()=> prSetTotModo(b.dataset.tm==='1'));
function prSetMon(m){ prMon = m; document.querySelectorAll('#prMoneda button').forEach(b=> b.classList.toggle('active', b.dataset.mon===m)); prRecalc(); }
document.querySelectorAll('#prMoneda button').forEach(b=> b.onclick = ()=> prSetMon(b.dataset.mon));
attachAutocomplete(document.getElementById('prPac'), ()=> pacienteRegistry);
attachAutocomplete(document.getElementById('prProf'), ()=> todosLosNombresDeProfesionales());
const PR_FUERA = 'TRATAMIENTO FUERA DE LISTA';
function prConceptosProf(){
  const prof = mayus(document.getElementById('prProf').value.trim());
  const vistos = new Set();
  return (CONCEPTOS[prof] || []).filter(c=> (c.tipo||'ingreso')!=='egreso' && !vistos.has(c.concepto) && vistos.add(c.concepto))
    .sort((a,b)=> a.concepto.localeCompare(b.concepto,'es',{numeric:true}));
}
function prAgregarFila(){
  const d = document.createElement('div'); d.className = 'pr-fila';
  d.innerHTML = `<div class="ac-wrap"><input type="text" class="pr-det" placeholder="Elegí el tratamiento…" autocomplete="off" data-ac-siempre="${PR_FUERA}"><span class="pr-fuera-tag">Fuera de lista</span></div><input type="text" class="pr-cant" inputmode="numeric" value="1"><input type="text" class="pr-val" inputmode="numeric" placeholder="0"><button type="button" class="btn-quitar" title="Quitar">✕</button>`;
  document.getElementById('prItems').appendChild(d);
  const det = d.querySelector('.pr-det');
  // Fuera de lista: el casillero pasa a ser de texto libre (sin sugerencias)
  const setLibre = v=>{
    d.classList.toggle('libre', v);
    if(v){ det.dataset.acSiempreBak = PR_FUERA; delete det.dataset.acSiempre; det.setAttribute('data-ac-libre',''); det.placeholder = 'Escribí el tratamiento…'; }
    else { det.dataset.acSiempre = PR_FUERA; det.removeAttribute('data-ac-libre'); det.placeholder = 'Elegí el tratamiento…'; }
  };
  attachAutocomplete(det, ()=> d.classList.contains('libre') ? [] : prConceptosProf().map(c=> c.concepto), valor=>{
    if(valor === PR_FUERA){ det.value = ''; setLibre(true); setTimeout(()=> det.focus(), 0); return; }
    const c = prConceptosProf().find(x=> x.concepto===valor);
    const val = d.querySelector('.pr-val');
    if(c && c.valor && (c.valorMoneda||'$')===prMon){ val.value = Number(c.valor).toLocaleString('es-AR'); prRecalc(); }
  });
  det.addEventListener('blur', ()=>{
    setTimeout(()=>{
      if(d.classList.contains('libre')){ if(!det.value.trim()) setLibre(false); return; }
      // si no eligió de la lista, se borra: lo libre solo va por "Tratamiento fuera de lista"
      if(det.value.trim() && !prConceptosProf().some(c=> c.concepto===mayus(det.value.trim()))){ det.value = ''; prRecalc(); }
    }, 150);
  });

  d.querySelector('.pr-val').addEventListener('input', e=>{ formatearInputMonto(e.target); prRecalc(); });
  d.querySelector('.pr-cant').addEventListener('input', e=>{ e.target.value = e.target.value.replace(/\D/g,''); prRecalc(); });
  d.querySelector('.btn-quitar').onclick = ()=>{ d.remove(); if(!document.querySelector('#prItems .pr-fila')) prAgregarFila(); prRecalc(); };
}
document.getElementById('prAgregar').onclick = prAgregarFila;
document.getElementById('prDesc').onchange = prRecalc;
document.getElementById('prTotalInp').addEventListener('input', e=>{ formatearInputMonto(e.target); prRecalc(); });
function prDatos(){
  const items = [...document.querySelectorAll('#prItems .pr-fila')].map(f=> ({
    det: mayus(f.querySelector('.pr-det').value.trim()),
    cant: Number(f.querySelector('.pr-cant').value) || 1,
    val: Number(f.querySelector('.pr-val').value.replace(/\D/g,'')) || 0,
  })).filter(i=> i.det || i.val);
  const sub = items.reduce((a,i)=> a + i.cant * i.val, 0);
  const [pct, lbl] = (document.getElementById('prDesc').value || '').split('|');
  const sugerido = totalConDescuento(sub, pct, prMon);
  const escrito = document.getElementById('prTotalInp').value.replace(/\D/g,'');
  const total = escrito ? Number(escrito) : sugerido;
  const desc = sub - total;
  return {items, sub, sugerido, desc: desc > 0 ? desc : 0, descLbl: desc > 0 ? (lbl || 'Descuento') : '', total};
}
function prRecalc(){
  const d = prDatos();
  document.getElementById('prTotalWrap').classList.toggle('col-hidden', !prConTotal);
  if(!prConTotal){
    const pct = Number((document.getElementById('prDesc').value || '').split('|')[0]) || 0;
    document.getElementById('prTot').innerHTML = d.items.length
      ? `Sin total: cada tratamiento es una opción${pct ? `<br>${escHtml(d.descLbl)} se aplica a cada opción` : ''}` : '';
    return;
  }
  document.getElementById('prTot').innerHTML = d.items.length
    ? `Subtotal ${fmtMonto(d.sub, prMon)}${d.desc ? ` · ${escHtml(d.descLbl)}: −${fmtMonto(d.desc, prMon)}` : ''}` : '';
  document.getElementById('prTotalInp').placeholder = d.items.length ? Number(d.sugerido).toLocaleString('es-AR') : '0';
}
function abrirPresupuesto(){
  document.getElementById('prFecha').value = hoyISO();
  ['prPac','prProf','prNotas'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('prDesc').value = '';
  document.getElementById('prTotalInp').value = '';
  document.getElementById('prItems').innerHTML = ''; prAgregarFila(); prSetTotModo(true); prSetMon('$');
  overlayPresupuesto.classList.add('show');
}
['closePresupuesto','cancelPresupuesto'].forEach(id=> document.getElementById(id).onclick = ()=> overlayPresupuesto.classList.remove('show'));
// Textos que quedan "congelados" en cada presupuesto guardado: si mañana cambian, los viejos se siguen viendo como se enviaron
const PR_OBSERVACIONES = [{t:'Presupuesto válido por 15 días desde el envío del mismo.', b:true}, {t:'Los valores de las cotizaciones se ajustarán por IPC.'}];
const UMM_CONTACTO = [['ic-mail','info@ummana.ar'],['ic-wa','11 3920-8108'],['ic-pin','M. Castro 1125, Banfield'],['ic-ig','somos.ummana'],['ic-web','ummana.ar']];
// Arma el PDF de un presupuesto a partir de sus datos (se usa al crearlo y al volver a abrirlo desde la ficha)
async function pdfPresupuesto(pr){
  if(pr.sinTotal) return pdfPresupuestoOpciones(pr);
  const tot = [{lbl:'Subtotal', val: fmtMonto(pr.subtotal, pr.moneda), tipo:'sub'}];
  if(pr.descuento) tot.push({lbl: 'Descuento', val: '-' + fmtMonto(pr.descuento, pr.moneda), tipo:'desc'});
  tot.push({lbl:'TOTAL', val: fmtMonto(pr.total, pr.moneda), tipo:'total'});
  const doc = await pdfFormatoUmmana({
    titulo: 'PRESUPUESTO',
    datos: [['PACIENTE', pr.paciente, true], ['FECHA', ecFecha(pr.fechaISO)], ['DR. DRA. / ÁREA', pr.profesional || '-']],
    head: ['Detalle','Cant.','Valor','Subtotal'],
    body: pr.items.map(i=> [i.det, String(i.cant), fmtMonto(i.val, pr.moneda), fmtMonto(i.cant * i.val, pr.moneda)]),
    columnStyles: {1:{halign:'center', cellWidth:44}, 2:{halign:'right', cellWidth:90}, 3:{halign:'right', cellWidth:95}},
    totales: tot,
    notas: pr.notas || '',
    observaciones: pr.observaciones || PR_OBSERVACIONES,
    contacto: pr.contacto,
  });
  return {doc, archivo: `presupuesto-${pr.paciente.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}-${pr.fechaISO}.pdf`};
}
// Variante "sin total": cada fila es una opción distinta, no se suman. Si hay descuento se muestra el valor con descuento de cada opción.
async function pdfPresupuestoOpciones(pr){
  const pct = pr.descuentoPct || 0;
  const head = ['Opción','Cant.','Valor','Subtotal'];
  if(pct) head.push('Con descuento');
  const body = pr.items.map(i=>{
    const sub = i.cant * i.val, f = [i.det, String(i.cant), fmtMonto(i.val, pr.moneda), fmtMonto(sub, pr.moneda)];
    if(pct) f.push(fmtMonto(pr.redondeo ? totalConDescuento(sub, pct, pr.moneda) : sub - Math.round(sub * pct / 100), pr.moneda));
    return f;
  });
  const columnStyles = pct
    ? {1:{halign:'center', cellWidth:38}, 2:{halign:'right', cellWidth:78}, 3:{halign:'right', cellWidth:82}, 4:{halign:'right', cellWidth:92, fontStyle:'bold'}}
    : {1:{halign:'center', cellWidth:44}, 2:{halign:'right', cellWidth:90}, 3:{halign:'right', cellWidth:95, fontStyle:'bold'}};
  const doc = await pdfFormatoUmmana({
    titulo: 'PRESUPUESTO',
    datos: [['PACIENTE', pr.paciente, true], ['FECHA', ecFecha(pr.fechaISO)], ['DR. DRA. / ÁREA', pr.profesional || '-']],
    head, body, columnStyles, totales: [],
    notas: pr.notas || '',
    observaciones: pr.observaciones || PR_OBSERVACIONES,
    contacto: pr.contacto,
  });
  return {doc, archivo: `presupuesto-${pr.paciente.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}-${pr.fechaISO}.pdf`};
}
document.getElementById('descargarPresupuesto').onclick = async ()=>{
  const pac = mayus(document.getElementById('prPac').value.trim()), prof = mayus(document.getElementById('prProf').value.trim());
  const fecha = document.getElementById('prFecha').value;
  const d = prDatos();
  if(!pac){ alert('Completá el paciente.'); return; }
  if(!d.items.length){ alert('Agregá al menos un tratamiento.'); return; }
  if(d.items.some(i=> !i.det || !i.val)){ alert('Cada tratamiento necesita detalle y valor.'); return; }
  if([...document.querySelectorAll('#prItems .pr-fila:not(.libre) .pr-det')].some(i=> i.value.trim() && !prConceptosProf().some(c=> c.concepto===mayus(i.value.trim())))){
    alert('Hay tratamientos que no están en la lista. Elegilos de la lista o usá "Tratamiento fuera de lista".'); return;
  }
  const btn = document.getElementById('descargarPresupuesto'); btn.disabled = true;
  try{
    // se guardan solo los datos (no el PDF): ocupa ~1 KB por presupuesto
    const pr = {paciente: pac, profesional: prof, fechaISO: fecha, moneda: prMon, items: d.items,
      subtotal: d.sub, descuento: d.desc, descuentoLbl: d.descLbl, total: d.total, redondeo: true,
      ...(prConTotal ? {} : {sinTotal: true, descuentoPct: Number((document.getElementById('prDesc').value || '').split('|')[0]) || 0}),
      notas: mayus(document.getElementById('prNotas').value.trim()),
      observaciones: PR_OBSERVACIONES, contacto: UMM_CONTACTO.map(([ic, t])=> ({ic, t}))};
    const {doc, archivo} = await pdfPresupuesto(pr);
    try{
      await db.collection('presupuestos').add({...pr, creadoPor: currentUser ? currentUser.nombre : '', creadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    }catch(e){ alert('El PDF se generó, pero el presupuesto no se pudo guardar en la ficha del paciente: ' + e.message); }
    mostrarPreviewPDF(doc, archivo);
    overlayPresupuesto.classList.remove('show');
  }catch(e){ alert('No se pudo generar el PDF: ' + e.message); }
  btn.disabled = false;
};
// Ficha del paciente: lista de sus presupuestos (se leen solo al abrir la ficha)
let pfPresDatos = [];
async function cargarPresupuestosFicha(nombre){
  const lista = document.getElementById('pfPresLista');
  lista.innerHTML = '<div class="pf-pres-vacio">Cargando…</div>';
  try{
    const snap = await db.collection('presupuestos').where('paciente','==', nombre).get();
    pfPresDatos = snap.docs.map(d=> ({id:d.id, ...d.data()})).sort((a,b)=> (b.fechaISO||'').localeCompare(a.fechaISO||''));
    lista.innerHTML = pfPresDatos.length ? pfPresDatos.map((p,i)=> `<div class="pf-pres-it" data-pr="${i}" title="Abrir PDF"><span class="f">${ecFecha(p.fechaISO)}${p.profesional ? ' · ' + escHtml(p.profesional) : ''}</span><span class="t">${p.sinTotal ? `${p.items.length} opciones` : fmtMonto(p.total, p.moneda)}</span><span class="d">${escHtml(p.items.map(x=> x.det).join(' + '))}</span></div>`).join('')
      : '<div class="pf-pres-vacio">Sin presupuestos.</div>';
  }catch(e){ lista.innerHTML = `<div class="pf-pres-vacio">No se pudieron leer los presupuestos.</div>`; }
}
document.getElementById('pfPresLista').addEventListener('click', async e=>{
  const it = e.target.closest('.pf-pres-it'); if(!it) return;
  const pr = pfPresDatos[+it.dataset.pr]; if(!pr) return;
  try{ const {doc, archivo} = await pdfPresupuesto(pr); mostrarPreviewPDF(doc, archivo); }
  catch(err){ alert('No se pudo generar el PDF: ' + err.message); }
});

/* ---- Estado de cuenta en PDF para mandarle al deudor (el concepto se puede corregir solo para el PDF) ---- */
const overlayEstadoCuenta = document.getElementById('overlayEstadoCuenta');
let ecDeudas = [];
const ecFecha = iso => { const [y,m,d] = (iso||'').split('-'); return d ? `${d}/${m}/${y}` : ''; };
document.getElementById('deuExportar').onclick = ()=>{
  const lista = deuFiltradas();
  const nombres = [...new Set(lista.map(d=> d.pac))];
  if(!document.getElementById('deuBuscar').value.trim() || nombres.length !== 1){
    alert(nombres.length ? 'Buscá y elegí un solo deudor para exportar su estado de cuenta.' : 'No hay deudas para exportar.'); return;
  }
  ecDeudas = lista.slice().sort((a,b)=> (a.fechaISO||'').localeCompare(b.fechaISO||''));
  document.getElementById('ecPac').textContent = nombres[0];
  document.getElementById('ecNotas').value = '';
  document.getElementById('ecBody').innerHTML = ecDeudas.map((d,i)=> `<tr><td>${ecFecha(d.fechaISO) || escHtml(d.fechaDisplay||'')}</td><td><input type="text" data-ec="${i}" value="${escHtml(mayus(d.concepto||''))}"></td><td>${fmtMonto(d.valor, d.moneda)}</td></tr>`).join('');
  document.getElementById('ecTot').innerHTML = ecTotales().map(([mon,v])=> `Total adeudado${ecTotales().length>1 ? ' en ' + (mon==='USD'?'USD':'$') : ''}: ${fmtMonto(v, mon)}`).join('<br>');
  overlayEstadoCuenta.classList.add('show');
};
function ecTotales(){
  const t = {}; ecDeudas.forEach(d=>{ const k = d.moneda==='USD' ? 'USD' : '$'; t[k] = (t[k]||0) + (Number(d.valor)||0); });
  return Object.entries(t).sort((a,b)=> a[0]==='$' ? -1 : 1);
}
['closeEstadoCuenta','cancelEstadoCuenta'].forEach(id=> document.getElementById(id).onclick = ()=> overlayEstadoCuenta.classList.remove('show'));
let ecLogo = null;
async function ecLogoData(){
  if(ecLogo) return ecLogo;
  try{
    const im = await new Promise((ok, mal)=>{ const i = new Image(); i.onload = ()=> ok(i); i.onerror = mal; i.src = 'images/logo.png'; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    ecLogo = {url: c.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight};
  }catch(e){ ecLogo = null; }
  return ecLogo;
}
document.getElementById('descargarEstadoCuenta').onclick = async ()=>{
  const btn = document.getElementById('descargarEstadoCuenta'); btn.disabled = true;
  try{
    const conceptos = [...document.querySelectorAll('#ecBody input[data-ec]')].map(i=> mayus(i.value.trim()));
    const pac = document.getElementById('ecPac').textContent;
    const totales = ecTotales().map(([mon, v], i, arr)=> ({lbl: 'TOTAL' + (arr.length>1 ? (mon==='USD' ? ' EN USD' : ' EN $') : ''), val: fmtMonto(v, mon), tipo:'total'}));
    const doc = await pdfFormatoUmmana({
      titulo: 'CUENTA CORRIENTE',
      datos: [['PACIENTE', pac, true], ['FECHA', ecFecha(hoyISO())]],
      head: ['Fecha','Concepto','Importe'],
      body: ecDeudas.map((d,i)=> [ecFecha(d.fechaISO) || d.fechaDisplay || '', conceptos[i] || mayus(d.concepto||''), fmtMonto(d.valor, d.moneda)]),
      columnStyles: {0:{cellWidth:80}, 2:{halign:'right', cellWidth:110}},
      totales,
      notas: document.getElementById('ecNotas').value,
    });
    mostrarPreviewPDF(doc, `cuenta-corriente-${pac.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}.pdf`);
    overlayEstadoCuenta.classList.remove('show');
  }catch(e){ alert('No se pudo generar el PDF: ' + e.message); }
  btn.disabled = false;
};
document.getElementById('closeDeudores').onclick = ()=> overlayDeudores.classList.remove('show');
document.getElementById('cerrarDeudores').onclick = ()=> overlayDeudores.classList.remove('show');

function renderDeudoresCount(){
  const pendientes = movimientosDeuda;
  const badge = document.getElementById('deudoresCount');
  if(pendientes.length){ badge.textContent = pendientes.length; badge.classList.remove('col-hidden'); }
  else badge.classList.add('col-hidden');
  const b2 = document.getElementById('mSubDeudoresN');
  if(b2){ b2.textContent = pendientes.length; b2.classList.toggle('col-hidden', !pendientes.length); }
  document.getElementById('menuDot').classList.toggle('col-hidden', !pendientes.length);
  if(vistaActual==='conta' && typeof renderConta==='function') renderConta();   // por "Deuda Victoria"
}
function deuFiltradas(){
  const q = document.getElementById('deuBuscar').value.trim();
  return q ? movimientosDeuda.filter(d=> contiene(d.pac, q)) : movimientosDeuda;
}
function renderDeudores(){
  const pendientes = deuFiltradas();
  const resumen = document.getElementById('deudoresResumen');
  const lista = document.getElementById('deudoresLista');
  const totalPesos = pendientes.filter(m=>m.moneda==="$").reduce((a,m)=>a+m.valor,0);
  const totalUsd = pendientes.filter(m=>m.moneda==="USD").reduce((a,m)=>a+m.valor,0);
  resumen.innerHTML = "";
  if(totalPesos>0) resumen.innerHTML += `<div class="chip">Total en $ : $${totalPesos.toLocaleString('es-AR')}</div>`;
  if(totalUsd>0) resumen.innerHTML += `<div class="chip">Total en USD : US$ ${totalUsd.toLocaleString('es-AR')}</div>`;
  if(!pendientes.length){ lista.innerHTML = `<div class="empty-state">${document.getElementById('deuBuscar').value.trim() ? 'Sin deudas para esa búsqueda.' : 'No hay deudas pendientes.'}</div>`; return; }
  lista.innerHTML = pendientes.slice().sort((a,b)=> (b.fechaISO||'').localeCompare(a.fechaISO||'') || (a.pac||'').localeCompare(b.pac||'')).map(m=>`
    <div class="deuda-row">
      <div class="deuda-info">
        <span class="nom">${m.pac}</span>
        <span class="det">${m.concepto} — ${m.fechaDisplay}${m.notas ? " · " + m.notas : ""}</span>
      </div>
      <span class="deuda-total">${fmtTotal(m)}</span>
    </div>
  `).join('');
}

/* =====================================================================
   REPORTE DIARIO (PDF horizontal)
   ===================================================================== */
const overlayReporteFecha = document.getElementById('overlayReporteFecha');
document.getElementById('btnReporteDiario').onclick = ()=>{
  document.getElementById('inpFechaReporte').value = hoyISO();
  overlayReporteFecha.classList.add('show');
};
document.getElementById('closeReporteFecha').onclick = ()=> overlayReporteFecha.classList.remove('show');
document.getElementById('cancelReporteFecha').onclick = ()=> overlayReporteFecha.classList.remove('show');
document.getElementById('generarReporteFecha').onclick = async ()=>{
  const fechaISO = document.getElementById('inpFechaReporte').value;
  if(!fechaISO){ alert("Elegí una fecha."); return; }
  const btn = document.getElementById('generarReporteFecha');
  btn.disabled = true; btn.textContent = "Generando…";
  try{
    const [snapMov, snapCaja] = await Promise.all([
      db.collection('movimientos').where('fechaISO','==', fechaISO).orderBy('creadoEn','asc').get(),
      db.collection('cajaSesiones').where('fechaISO','==', fechaISO).get(),
    ]);
    const filas = snapMov.docs.map(d=>({id:d.id, ...d.data()})).filter(noMigrado).filter(m=> !esCajaGrande(m));   // el reporte es de la caja chica
    if(!filas.length){ alert("No hay movimientos cargados en esa fecha."); return; }
    const sesiones = snapCaja.docs.map(d=> d.data())
      .sort((a,b)=> (a.abiertaEn?.toMillis()||0) - (b.abiertaEn?.toMillis()||0));
    await generarPNGReporteDiario(filas, fechaISO, sesiones);
    overlayReporteFecha.classList.remove('show');
  }catch(e){
    alert("Error al generar el reporte: " + e.message);
  }
  btn.disabled = false; btn.textContent = "Ver vista previa";
};

function limpiarTextoPDF(str){
  if(str===null || str===undefined) return "";
  return String(str)
    .replace(/[\u200B-\u200D\uFEFF\uFE00-\uFE0F]/g, '')  // selectores de variación (emoji), invisibles
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7EáéíóúÁÉÍÓÚñÑüÜ¿¡®°]/g, '');      // cualquier otro carácter no soportado, se descarta
}

const overlayPreviewPDF = document.getElementById('overlayPreviewPDF');
let pdfListoParaDescargar = null;

function cerrarOtrosOverlays(idExcluido){
  document.querySelectorAll('.overlay.show').forEach(ov=>{
    if(ov.id !== idExcluido) ov.classList.remove('show');
  });
}

function mostrarPreviewPDF(doc, filename){
  pdfListoParaDescargar = {tipo:'pdf', doc, filename};
  document.getElementById('whatsappPreview').classList.add('col-hidden');
  document.getElementById('waNota').classList.add('col-hidden');
  document.getElementById('iframePreviewPDF').style.display = 'block';
  document.getElementById('imgPreviewPNG').style.display = 'none';
  document.getElementById('iframePreviewPDF').src = doc.output('bloburl');
  cerrarOtrosOverlays('overlayPreviewPDF');
  overlayPreviewPDF.classList.add('show');
}
function mostrarPreviewPNG(dataUrl, filename, whatsapp){
  pdfListoParaDescargar = {tipo:'png', dataUrl, filename, whatsapp: whatsapp||null, blob:null};
  fetch(dataUrl).then(r=>r.blob()).then(b=>{ if(pdfListoParaDescargar && pdfListoParaDescargar.dataUrl===dataUrl) pdfListoParaDescargar.blob = b; });
  document.getElementById('whatsappPreview').classList.toggle('col-hidden', !whatsapp);
  document.getElementById('waNota').classList.add('col-hidden');
  document.getElementById('imgPreviewPNG').style.display = 'block';
  document.getElementById('iframePreviewPDF').style.display = 'none';
  document.getElementById('imgPreviewPNG').src = dataUrl;
  cerrarOtrosOverlays('overlayPreviewPDF');
  overlayPreviewPDF.classList.add('show');
}
document.getElementById('closePreviewPDF').onclick = ()=> overlayPreviewPDF.classList.remove('show');
document.getElementById('cancelPreviewPDF').onclick = ()=> overlayPreviewPDF.classList.remove('show');
/* ---------- Enviar pago profesional por WhatsApp ---------- */
// Normaliza un teléfono argentino al formato de wa.me (549 + área + número)
function telWhatsApp(tel){
  let d = String(tel||'').replace(/\D/g,'');
  if(!d) return '';
  if(d.startsWith('00')) d = d.slice(2);
  if(d.startsWith('54')){ d = d.slice(2); if(d.startsWith('9')) d = d.slice(1); }
  if(d.startsWith('0')) d = d.slice(1);
  // quita el "15" después del código de área (ej. 11 15 2345 6789)
  const m = d.match(/^(11|[2368]\d{1,3})15(\d{6,8})$/);
  if(m && (m[1]+m[2]).length===10) d = m[1]+m[2];
  return '549' + d;
}
function telefonoDeProfesional(nombre){
  const p = profesionalesFullList.find(x=> x.nombre === nombre);
  return p ? (p.telefono||'') : '';
}
function mostrarNotaWA(txt){
  const n = document.getElementById('waNota');
  n.textContent = txt; n.classList.remove('col-hidden');
}
document.getElementById('whatsappPreview').onclick = async ()=>{
  const info = pdfListoParaDescargar;
  if(!info || !info.whatsapp) return;
  const {prof, texto} = info.whatsapp;
  const numero = telWhatsApp(telefonoDeProfesional(prof));
  if(!numero){
    alert(`${prof} no tiene un teléfono cargado.\nAgregalo en Menú → Profesionales/Áreas y volvé a intentar.`);
    return;
  }
  const blob = info.blob || await (await fetch(info.dataUrl)).blob();
  const file = new File([blob], info.filename, {type:'image/png'});
  const esCelular = window.matchMedia('(pointer:coarse)').matches;

  // En el celular: menú de compartir del sistema (elegís WhatsApp y el chat)
  if(esCelular && navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], text: texto});
      return;
    }catch(e){
      if(e.name === 'AbortError') return;
    }
  }

  // En la compu: copiamos la imagen y abrimos el chat del profesional
  let copiada = false;
  try{
    await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
    copiada = true;
  }catch(e){ console.warn('No se pudo copiar la imagen', e); }
  if(!copiada){
    const a = document.createElement('a');
    a.href = info.dataUrl; a.download = info.filename; a.click();
  }
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank');
  const atajo = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘+V' : 'Ctrl+V';
  mostrarNotaWA(copiada
    ? `✓ Imagen copiada. En el chat de WhatsApp pegala con ${atajo} y enviala.`
    : `✓ Imagen descargada. Adjuntala en el chat de WhatsApp que se abrió.`);
};

document.getElementById('descargarPreviewPDF').onclick = ()=>{
  if(!pdfListoParaDescargar) return;
  if(pdfListoParaDescargar.tipo==='pdf'){
    pdfListoParaDescargar.doc.save(pdfListoParaDescargar.filename);
  } else {
    const a = document.createElement('a');
    a.href = pdfListoParaDescargar.dataUrl;
    a.download = pdfListoParaDescargar.filename;
    a.click();
  }
};

function construirFilaVisual(m){
  const esGasto = esGastoMov(m);
  const totalClass = m.valor==0 ? '' : (esGasto?'egreso':'ingreso');
  return `
    <tr>
      <td>${m.fechaDisplay}</td>
      <td class="left">${m.pac}</td>
      <td>${m.prof}</td>
      <td class="concepto" style="white-space:normal;">${m.concepto}</td>
      <td class="notas" style="white-space:normal;overflow:visible;text-overflow:clip;max-width:220px;">${m.notas||""}</td>
      <td class="total ${totalClass}">${fmtTotal(m)}</td>
      <td class="badges-cell">${medioBadgesHTML(m)}</td>
      <td class="badges-cell">${cobroBadgesHTML(m)}</td>
    </tr>
  `;
}

// Opciones de captura de imagen. En el celular el navegador agranda solo el texto de los bloques anchos
// ("font boosting") y la imagen salía con las palabras encimadas: se desactiva en la copia que se fotografía.
const H2C_OPC = {scale:2, backgroundColor:'#f8f3e8', useCORS:true, windowWidth:1500,
  onclone: doc=>{ const st = doc.createElement('style'); st.textContent = 'html,body,*{-webkit-text-size-adjust:100% !important;text-size-adjust:100% !important;}'; doc.head.appendChild(st); }};
async function generarPNGReporteDiario(filas, fechaISO, sesiones){
  const [y_, m_, d_] = fechaISO.split('-');
  document.getElementById('rvFecha').textContent = `${d_}/${m_}/${y_}`;
  document.getElementById('rvExportado').textContent = `(Exportado por ${nombreCortoUsuario(currentUser ? currentUser.nombre : '')} (${fechaHoraCorta(new Date())}))`;
  document.getElementById('rvTbody').innerHTML = filas.map(construirFilaVisual).join('');

  let inPesosEf=0, outPesosEf=0, inUsdEf=0, outUsdEf=0;
  let inPesosMp=0, outPesosMp=0, inPesosTransf=0, outPesosTransf=0;
  const usdOtros = {};   // dólares por Mercado Pago / transferencia / tarjeta (no entran a la caja física)
  const pagosProfesionales = [];
  filas.forEach(m=>{
    if(esCajaGrande(m)) return;   // caja grande: no es plata de la caja chica
    const esGasto = esGastoMov(m);
    if(/honorario/i.test(m.concepto||"")) pagosProfesionales.push(m);
    pagosDe(m).forEach(p=>{
      // Igual que en "Cerrar caja": si lo cobró el profesional directo, esa plata nunca entró a nuestra caja física.
      if(!esGasto && p.cobradoPor === "profesional") return;
      const monP = pagoMoneda(m, p), vP = pagoMontoReal(p);
      if(p.medio==="efectivo"){
        if(monP==="USD"){ esGasto ? outUsdEf+=vP : inUsdEf+=vP; }
        else { esGasto ? outPesosEf+=vP : inPesosEf+=vP; }
      } else if(monP==="USD"){
        const o = usdOtros[p.medio] = usdOtros[p.medio] || {in:0, out:0}; esGasto ? o.out+=vP : o.in+=vP;
      } else if(p.medio==="mp"){
        esGasto ? outPesosMp+=vP : inPesosMp+=vP;
      } else if(p.medio==="transferencia"){
        esGasto ? outPesosTransf+=vP : inPesosTransf+=vP;
      }
    });
  });

  const sesionApertura = sesiones[0];
  const netoPesosEf = inPesosEf - outPesosEf;
  const cajaFinalTxt = sesionApertura
    ? `$${(Number(sesionApertura.aperturaMonto)+netoPesosEf).toLocaleString('es-AR')}`
    : 'Sin registro de apertura';

  document.getElementById('rvCaja').innerHTML = `
    <div class="kpi-row" style="margin-bottom:0;">
      <div class="kpi"><div class="lbl">Caja inicial</div><div class="val">${sesionApertura ? '$'+Number(sesionApertura.aperturaMonto).toLocaleString('es-AR') : 'Sin registro'}</div></div>
      <div class="kpi"><div class="lbl">Movimientos efectivo (neto)</div><div class="val">$${netoPesosEf.toLocaleString('es-AR')}${(inUsdEf||outUsdEf) ? ' / US$ '+(inUsdEf-outUsdEf).toLocaleString('es-AR') : ''}</div></div>
      <div class="kpi"><div class="lbl">Caja final</div><div class="val">${cajaFinalTxt}</div></div>
    </div>
  `;

  document.getElementById('rvPagosProf').innerHTML = pagosProfesionales.length
    ? pagosProfesionales.map(m=>`
        <div class="deuda-row">
          <div class="deuda-info"><span class="nom">${m.pac}</span></div>
          <span class="deuda-total" style="color:#2f7a2f;">${fmtTotal(m)}</span>
        </div>
      `).join('')
    : `<div class="empty-state">No hubo retiros de honorarios este día.</div>`;

  document.getElementById('rvIngresosEgresos').innerHTML = `
    <table style="width:100%;">
      <thead><tr><th class="left">Medio</th><th>Ingresos</th><th>Egresos</th></tr></thead>
      <tbody>
        <tr><td class="left">Efectivo $</td><td style="color:#2f7a2f;font-weight:700;">$${inPesosEf.toLocaleString('es-AR')}</td><td style="color:#a13a3a;font-weight:700;">$${outPesosEf.toLocaleString('es-AR')}</td></tr>
        <tr><td class="left">Efectivo USD</td><td style="color:#2f7a2f;font-weight:700;">US$ ${inUsdEf.toLocaleString('es-AR')}</td><td style="color:#a13a3a;font-weight:700;">US$ ${outUsdEf.toLocaleString('es-AR')}</td></tr>
        <tr><td class="left">Mercado Pago</td><td style="color:#2f7a2f;font-weight:700;">$${inPesosMp.toLocaleString('es-AR')}</td><td style="color:#a13a3a;font-weight:700;">$${outPesosMp.toLocaleString('es-AR')}</td></tr>
        <tr><td class="left">Transferencia</td><td style="color:#2f7a2f;font-weight:700;">$${inPesosTransf.toLocaleString('es-AR')}</td><td style="color:#a13a3a;font-weight:700;">$${outPesosTransf.toLocaleString('es-AR')}</td></tr>
        ${Object.entries(usdOtros).map(([medio, o])=> `<tr><td class="left">${escHtml(medioLabelDe(medio, 'USD'))} USD</td><td style="color:#2f7a2f;font-weight:700;">US$ ${o.in.toLocaleString('es-AR')}</td><td style="color:#a13a3a;font-weight:700;">US$ ${o.out.toLocaleString('es-AR')}</td></tr>`).join('')}
      </tbody>
    </table>
  `;

  const el = document.getElementById('reporteVisualHidden');
  const canvas = await html2canvas(el, H2C_OPC);
  const dataUrl = canvas.toDataURL('image/png');
  mostrarPreviewPNG(dataUrl, `reporte-dia-${fechaISO}.png`);
}

function generarPDFReporteDiario(filas, fechaISO, sesiones){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  const MORADO = [111,106,248];
  const GRIS = [138,141,148];
  const TEXTO = [36,38,43];
  const VERDE_BG = [227,241,222], VERDE_TXT = [47,122,47];
  const ROJO_BG = [251,234,234], ROJO_TXT = [161,58,58];

  // ---------- Encabezado ----------
  const [y_, m_, d_] = fechaISO.split('-');
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(...TEXTO);
  doc.text(`Reporte dia ${d_}/${m_}/${y_}`, 40, 34);
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...GRIS);
  doc.text('CAJA UMMANA', 40, 50);

  // ---------- Tabla principal (mismo orden y columnas que la pantalla) ----------
  const body = filas.map(m=>[
    m.fechaDisplay, m.pac, m.prof, m.concepto, m.notas||"",
    fmtTotal(m), medioDisplayText(m), cobroTextoPlano(m)
  ].map(limpiarTextoPDF));
  doc.autoTable({
    startY: 64,
    head: [["Fecha","Paciente/Alumno","Profesional","Concepto","Notas","Total","Medio de pago","Cobró"]],
    body,
    styles:{font:'helvetica', fontSize:8, cellPadding:4.5, textColor:TEXTO, lineColor:[231,231,234], lineWidth:0.5},
    headStyles:{fillColor:MORADO, textColor:255, fontStyle:'bold', fontSize:8},
    alternateRowStyles:{fillColor:[250,250,252]},
    didParseCell: (data)=>{
      if(data.section==='body' && data.column.index===5){
        const m = filas[data.row.index];
        if(m.valor != 0){
          data.cell.styles.fontStyle = 'bold';
          if(esGastoMov(m)){ data.cell.styles.fillColor = ROJO_BG; data.cell.styles.textColor = ROJO_TXT; }
          else { data.cell.styles.fillColor = VERDE_BG; data.cell.styles.textColor = VERDE_TXT; }
        }
      }
    },
  });

  // ---------- Cálculos para el resumen ----------
  let inPesosEf=0, outPesosEf=0, inUsdEf=0, outUsdEf=0;
  let inPesosMp=0, outPesosMp=0, inPesosTransf=0, outPesosTransf=0;
  const pagosProfesionales = [];
  filas.forEach(m=>{
    const esGasto = esGastoMov(m);
    if(/honorario/i.test(m.concepto||"")) pagosProfesionales.push(m);
    pagosDe(m).forEach(p=>{
      const monP = pagoMoneda(m, p), vP = pagoMontoReal(p);
      if(p.medio==="efectivo"){
        if(monP==="USD"){ esGasto ? outUsdEf+=vP : inUsdEf+=vP; }
        else { esGasto ? outPesosEf+=vP : inPesosEf+=vP; }
      } else if(p.medio==="mp" && monP!=="USD"){
        esGasto ? outPesosMp+=vP : inPesosMp+=vP;
      } else if(p.medio==="transferencia" && monP!=="USD"){
        esGasto ? outPesosTransf+=vP : inPesosTransf+=vP;
      }
    });
  });

  const sesionApertura = sesiones[0];
  const sesionesCerradas = sesiones.filter(s=>s.cerradaEn);
  const sesionCierre = sesionesCerradas[sesionesCerradas.length-1];

  let y = doc.lastAutoTable.finalY + 26;
  const colIzq = 40, colDer = 430;

  // ---------- CAJA DEL DÍA ----------
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...MORADO);
  doc.text('CAJA DEL DÍA', colIzq, y);
  let yCaja = y + 18;
  doc.setFontSize(9.5); doc.setTextColor(...TEXTO);
  doc.setFont('helvetica','normal');
  doc.text('Caja inicial:', colIzq, yCaja);
  doc.text(sesionApertura ? `$ ${Number(sesionApertura.aperturaMonto).toLocaleString('es-AR')}` : 'Sin registro', colIzq+90, yCaja);
  yCaja += 15;
  doc.text('Movimientos en efectivo (neto, cobro Ummana + profesional):', colIzq, yCaja);
  yCaja += 15;
  doc.text(`$ ${(inPesosEf-outPesosEf).toLocaleString('es-AR')}   ·   US$ ${(inUsdEf-outUsdEf).toLocaleString('es-AR')}`, colIzq+10, yCaja);
  yCaja += 17;
  doc.setFont('helvetica','bold');
  doc.text('Caja final:', colIzq, yCaja);
  doc.text(sesionCierre ? `$ ${Number(sesionCierre.montoContado).toLocaleString('es-AR')}` : 'Sin cierre registrado', colIzq+90, yCaja);
  yCaja += 22;

  // ---------- DETALLE PAGOS PROFESIONALES ----------
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...MORADO);
  doc.text('DETALLE PAGOS PROFESIONALES DEL DÍA', colIzq, yCaja);
  yCaja += 8;
  if(pagosProfesionales.length){
    doc.autoTable({
      startY: yCaja,
      margin:{left: colIzq},
      tableWidth: 340,
      head: [["Profesional","Total"]],
      body: pagosProfesionales.map(m=>[limpiarTextoPDF(m.pac), fmtTotal(m)]),
      styles:{font:'helvetica', fontSize:9, cellPadding:5, textColor:TEXTO},
      headStyles:{fillColor:MORADO, textColor:255},
    });
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
    doc.text('No hubo retiros de honorarios registrados este día.', colIzq, yCaja+14);
  }

  // ---------- INGRESOS VS EGRESOS DEL DÍA ----------
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...MORADO);
  doc.text('INGRESOS VS EGRESOS DEL DÍA', colDer, y);
  doc.autoTable({
    startY: y+10,
    margin:{left: colDer},
    tableWidth: 380,
    head: [["Medio","Ingresos","Egresos"]],
    body: [
      ["Efectivo $", `$ ${inPesosEf.toLocaleString('es-AR')}`, `$ ${outPesosEf.toLocaleString('es-AR')}`],
      ["Efectivo USD", `US$ ${inUsdEf.toLocaleString('es-AR')}`, `US$ ${outUsdEf.toLocaleString('es-AR')}`],
      ["Mercado Pago", `$ ${inPesosMp.toLocaleString('es-AR')}`, `$ ${outPesosMp.toLocaleString('es-AR')}`],
      ["Transferencia", `$ ${inPesosTransf.toLocaleString('es-AR')}`, `$ ${outPesosTransf.toLocaleString('es-AR')}`],
    ],
    styles:{font:'helvetica', fontSize:9, cellPadding:5, textColor:TEXTO},
    headStyles:{fillColor:MORADO, textColor:255},
    columnStyles:{1:{textColor:VERDE_TXT, fontStyle:'bold'}, 2:{textColor:ROJO_TXT, fontStyle:'bold'}},
  });

  mostrarPreviewPDF(doc, `reporte-dia-${d_}-${m_}-${y_}.pdf`);
}

/* =====================================================================
   CALCULAR PAGO A PROFESIONAL
   ===================================================================== */
const overlayPago = document.getElementById('overlayPago');
const selProfesionalPago = document.getElementById('selProfesionalPago');
const inpFechaPago = document.getElementById('inpFechaPago');
let pagoMovsActuales = [];
let pagoJornadaExcluidos = 0;
attachAutocomplete(selProfesionalPago, ()=> todosLosNombresDeProfesionales());

document.getElementById('btnPagoProfesional').onclick = ()=>{
  selProfesionalPago.value = "";
  inpFechaPago.value = hoyISO();
  document.getElementById('pagoPreview').innerHTML = "";
  document.getElementById('btnExportarPago').disabled = true;
  overlayPago.classList.add('show');
};
document.getElementById('closePago').onclick = ()=> overlayPago.classList.remove('show');
document.getElementById('cancelPago').onclick = ()=> overlayPago.classList.remove('show');

async function refreshPagoPreview(){
  const prof = selProfesionalPago.value;
  const fechaISO = inpFechaPago.value;
  const preview = document.getElementById('pagoPreview');
  const btnExp = document.getElementById('btnExportarPago');
  if(!prof || !fechaISO){ preview.innerHTML = ""; btnExp.disabled = true; return; }

  preview.innerHTML = '<div class="empty-state">Buscando…</div>';
  try{
    const snap = await db.collection('movimientos').where('fechaISO','==', fechaISO).where('prof','==', prof).orderBy('creadoEn','asc').get();
    const todos = snap.docs.map(d=> d.data()).filter(noMigrado);
    pagoJornadaExcluidos = todos.filter(m=> m.jornada).length;
    pagoMovsActuales = todos.filter(m=> !m.jornada && !esCajaGrande(m));   // caja grande no entra en el pago del día   // lo de jornada se liquida aparte a fin de mes
  }catch(e){
    preview.innerHTML = `<div class="empty-state">Error al buscar: ${e.message}</div>`;
    btnExp.disabled = true; return;
  }

  if(!pagoMovsActuales.length){
    preview.innerHTML = `<div class="empty-state">Sin movimientos de este profesional en esa fecha.${pagoJornadaExcluidos ? `<br>(${pagoJornadaExcluidos} de jornada, que se liquidan aparte)` : ''}</div>`;
    btnExp.disabled = true; return;
  }
  let totalPesos=0, totalUsd=0, profPesos=0, profUsd=0, ummPesos=0, ummUsd=0, debePesos=0, debeUsd=0;
  const lineas = [];
  pagoMovsActuales.forEach(m=>{
    pagosDe(m).forEach(p=>{
      const debe = p.medio==="debe";   // lo que quedó en "Debe" no se le paga al profesional (se paga el día que se salda)
      lineas.push({pac:m.pac, concepto:m.concepto, notas:m.notas, moneda:m.moneda, valor:p.valor, cobradoPor:p.cobradoPor||'ummana', debe});
      const esUsd = m.moneda==="USD";
      if(esUsd) totalUsd+=p.valor; else totalPesos+=p.valor;
      if(debe){ esUsd ? debeUsd+=p.valor : debePesos+=p.valor; }
      else if(p.cobradoPor==="profesional"){ esUsd ? profUsd+=p.valor : profPesos+=p.valor; }
      else { esUsd ? ummUsd+=p.valor : ummPesos+=p.valor; }
    });
  });
  preview.innerHTML = `
    ${pagoJornadaExcluidos ? `<div class="hint" style="padding:0 0 10px;">No se incluyen ${pagoJornadaExcluidos} ${pagoJornadaExcluidos===1?'movimiento':'movimientos'} de jornada (se liquidan a fin de mes).</div>` : ''}
    <div class="deudores-summary">
      ${totalPesos>0 ? `<div class="chip" style="background:#f3ead3;border-color:#e3d3ad;color:#6b5530;">Total del día $ : $${totalPesos.toLocaleString('es-AR')}</div>` : ""}
      ${totalUsd>0 ? `<div class="chip" style="background:#f3ead3;border-color:#e3d3ad;color:#6b5530;">Total del día USD : US$ ${totalUsd.toLocaleString('es-AR')}</div>` : ""}
      ${profPesos>0 ? `<div class="chip" style="background:#f0e8cf;border-color:#e6dbc2;color:#7a7159;">Cobrado por el profesional $ : $${profPesos.toLocaleString('es-AR')}</div>` : ""}
      ${profUsd>0 ? `<div class="chip" style="background:#f0e8cf;border-color:#e6dbc2;color:#7a7159;">Cobrado por el profesional USD : US$ ${profUsd.toLocaleString('es-AR')}</div>` : ""}
      ${ummPesos>0 || totalPesos>0 ? `<div class="chip" style="background:#e3f1de;border-color:#c6e3ba;color:#2f7a2f;">A pagar (cobrado por Ummana) $ : $${ummPesos.toLocaleString('es-AR')}</div>` : ""}
      ${ummUsd>0 ? `<div class="chip" style="background:#e3f1de;border-color:#c6e3ba;color:#2f7a2f;">A pagar (cobrado por Ummana) USD : US$ ${ummUsd.toLocaleString('es-AR')}</div>` : ""}
      ${debePesos>0 ? `<div class="chip" style="background:#fdecea;border-color:#f5c6c2;color:#c62828;">Debe $ : $${debePesos.toLocaleString('es-AR')}</div>` : ""}
      ${debeUsd>0 ? `<div class="chip" style="background:#fdecea;border-color:#f5c6c2;color:#c62828;">Debe USD : US$ ${debeUsd.toLocaleString('es-AR')}</div>` : ""}
    </div>
    ${lineas.map(l=>`
      <div class="deuda-row">
        <div class="deuda-info"><span class="nom">${l.pac}</span><span class="det">${l.concepto}${l.notas ? " · " + l.notas : ""} — ${l.debe ? 'debe (no se paga)' : (l.cobradoPor==='profesional' ? 'cobró el profesional' : 'cobró Ummana')}</span></div>
        <span class="deuda-total" style="color:${l.debe ? '#c62828' : (l.cobradoPor==='profesional' ? '#7a7159' : '#2f7a2f')};">${fmtMonto(l.valor, l.moneda)}</span>
      </div>
    `).join('')}
  `;
  btnExp.disabled = false;
}
selProfesionalPago.addEventListener('input', refreshPagoPreview);
inpFechaPago.addEventListener('input', refreshPagoPreview);

document.getElementById('btnExportarPago').onclick = async ()=>{
  const prof = selProfesionalPago.value;
  const fechaISO = inpFechaPago.value;
  if(!pagoMovsActuales.length) return;
  await generarPNGPagoProfesional(prof, fechaISO, pagoMovsActuales);
};

async function generarPNGPagoProfesional(prof, fechaISO, movs){
  const [y_, m_, d_] = fechaISO.split('-');
  document.getElementById('pvProfesional').textContent = prof;
  document.getElementById('pvFecha').textContent = `${d_}/${m_}/${y_}`;
  document.getElementById('pvTbody').innerHTML = movs.map(construirFilaVisual).join('');

  let totalPesos=0, totalUsd=0, profPesos=0, profUsd=0, ummPesos=0, ummUsd=0, debePesos=0, debeUsd=0;
  movs.forEach(m=>{
    pagosDe(m).forEach(p=>{
      const esUsd = m.moneda==="USD";
      if(esUsd) totalUsd+=p.valor; else totalPesos+=p.valor;
      if(p.medio==="debe"){ esUsd ? debeUsd+=p.valor : debePesos+=p.valor; }
      else if(p.cobradoPor==="profesional"){ esUsd ? profUsd+=p.valor : profPesos+=p.valor; }
      else { esUsd ? ummUsd+=p.valor : ummPesos+=p.valor; }
    });
  });

  document.getElementById('pvResumen').innerHTML = `
    <div class="kpi-row" style="margin-bottom:0;">
      <div class="kpi"><div class="lbl">Total del día</div><div class="val">$${totalPesos.toLocaleString('es-AR')}${totalUsd?' / US$ '+totalUsd.toLocaleString('es-AR'):''}</div></div>
      <div class="kpi"><div class="lbl">Cobrado por el profesional</div><div class="val">$${profPesos.toLocaleString('es-AR')}${profUsd?' / US$ '+profUsd.toLocaleString('es-AR'):''}</div></div>
      <div class="kpi"><div class="lbl">A pagar (cobrado por Ummana)</div><div class="val" style="color:#2f7a2f;">$${ummPesos.toLocaleString('es-AR')}${ummUsd?' / US$ '+ummUsd.toLocaleString('es-AR'):''}</div></div>
      ${debePesos||debeUsd ? `<div class="kpi"><div class="lbl">Debe (no se paga)</div><div class="val" style="color:#c62828;">$${debePesos.toLocaleString('es-AR')}${debeUsd?' / US$ '+debeUsd.toLocaleString('es-AR'):''}</div></div>` : ''}
    </div>
  `;

  const el = document.getElementById('pagoVisualHidden');
  const canvas = await html2canvas(el, H2C_OPC);
  const dataUrl = canvas.toDataURL('image/png');
  const aPagar = `$${ummPesos.toLocaleString('es-AR')}${ummUsd?' y US$ '+ummUsd.toLocaleString('es-AR'):''}`;
  const texto = `Hola! Te paso el detalle de tu pago del ${isoToDisplay(fechaISO)}. Total a pagar: ${aPagar}.`;
  mostrarPreviewPNG(dataUrl, `pago-${prof.replace(/[^a-z0-9]+/gi,'-')}-${fechaISO}.png`, {prof, texto});
}


