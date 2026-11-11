/* =====================================================================
   CREMAS / COLÁGENOS (solo Fede)
   Toma de los movimientos diarios todo lo cargado con profesional Cremas o Colágenos.
   Datos propios en la colección "cremas":
     cremas/{idMovimiento} → { indica, cot }
     cremas/_stock         → { productos: { CODIGO: { venta, costo } } }   (USD)
   ===================================================================== */
let cTab = 'stock';
let mesCremas = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };
let cremasMovsMes = [];          // movimientos diarios del mes elegido (si no es el mes de la tabla principal)
let cremasMesCargado = null;
let cremasExtra = {};            // { idMovimiento: {indica, cot} }
let cremasStock = {};            // { CODIGO: {venta, costo} }
let unsubCremas = null;
let cremasInicial = {fecha:'', cantidades:{}};   // cremas/_stockInicial
let cremasVentas = null;                          // todos los movimientos de cremas/colágenos (para descontar stock)
const PARTICULAR = 'PARTICULAR';
const fmtUsd = v => 'US$ ' + Number(v).toLocaleString('es-AR', {maximumFractionDigits: 2});
const parseDecimal = v => { const n = Number(String(v||'').replace(/\./g,'').replace(',','.')); return isNaN(n) ? 0 : n; };

// Tipo de producto según el área: crema (USD), colágeno o gel (costo en pesos)
function esGel(prof){ return /(^|[^a-z])gel(es)?([^a-z]|$)/.test(normBusqueda(prof)); }
function tipoProductoCrema(prof){ const n = normBusqueda(prof); return n.includes('colag') ? 'colageno' : (esGel(prof) ? 'gel' : 'crema'); }
function esColageno(prof){ return normBusqueda(prof).includes('colag') || esGel(prof); }   // "en pesos": colágenos y geles
function esProfCremas(prof){ const n = normBusqueda(prof); return n.includes('crema') || n.includes('colag') || esGel(prof); }
// Lo que no es una venta: saldar deudas (marcadas o con concepto "SALDA DEUDA")
const esSaldaDeudaCrema = m => !!m.saldaDeuda || (m.saldaDeudas||[]).length > 0 || normBusqueda(m.concepto||'').includes('salda deuda');
function cMesInicio(){ return `${mesCremas.year}-${String(mesCremas.month).padStart(2,'0')}-01`; }
function cMesFin(){ let y = mesCremas.year, m = mesCremas.month+1; if(m>12){ m=1; y++; } return `${y}-${String(m).padStart(2,'0')}-01`; }
function cEsMesTabla(){ return mesCremas.year===mesActual.year && mesCremas.month===mesActual.month; }
function claveProducto(m){ return mayus((m.codigo||'').trim()) || mayus((m.concepto||'').trim()); }

function suscribirCremas(){
  if(unsubCremas || !esFede()) return;
  unsubCremas = db.collection('cremas').onSnapshot(snap=>{
    cremasExtra = {}; cremasStock = {}; cremasInicial = {fecha:'', cantidades:{}};
    snap.docs.forEach(d=>{
      if(d.id==='_stock'){ cremasStock = d.data().productos || {}; cremasOcultos = d.data().ocultos || []; }
      else if(d.id==='_stockInicial') cremasInicial = {fecha:'', cantidades:{}, ...d.data()};
      else if(d.id==='_pagos') cremasPagos = d.data().lineas || [];
      else if(d.id==='_ajustes') cremasAjustes = d.data().items || [];
      else cremasExtra[d.id] = d.data();
    });
    renderCremas();
  }, err=>{
    document.getElementById('cTbody').innerHTML = `<tr><td colspan="12" class="empty-state" style="color:#a13a3a;">No se pudieron cargar los datos de cremas: ${err.message}</td></tr>`;
  });
}
// Movimientos del mes: si coincide con el mes de la tabla principal se usan esos (ya están en vivo);
// si no, se leen una vez de la base.
async function cargarMovsCremas(){
  if(cEsMesTabla()){ cremasMesCargado = null; return; }
  const key = cMesInicio();
  if(cremasMesCargado === key) return;
  cremasMesCargado = key;
  try{
    const snap = await db.collection('movimientos').where('fechaISO','>=', cMesInicio()).where('fechaISO','<', cMesFin()).get();
    if(cremasMesCargado !== key) return;
    cremasMovsMes = snap.docs.map(d=> ({id:d.id, ...d.data()}));
  }catch(e){ cremasMovsMes = []; alert("No se pudieron cargar los movimientos: " + e.message); }
  renderCremas();
}
function movimientosCremas(){
  const base = cEsMesTabla() ? movimientos : cremasMovsMes;
  return base
    .filter(m=> !m.migrado && esProfCremas(m.prof) && !esSaldaDeudaCrema(m) && !esGastoMov(m) && tipoProductoCrema(m.prof)===cTab)
    .sort((a,b)=> a.fechaISO===b.fechaISO ? 0 : (a.fechaISO < b.fechaISO ? -1 : 1));
}
// Cuentas de cada fila
// Precio (venta y costo) vigente a una fecha: cada cambio de precio rige desde el día en que se hizo
function precioCremaAl(clave, fechaISO){
  const p = cremasStock[clave] || {};
  const hist = Array.isArray(p.hist) ? p.hist : [];
  if(!hist.length) return p;
  let vig = hist[0];
  hist.forEach(h=>{ if(h.desde <= fechaISO) vig = h; });
  return vig;
}
function calcularCrema(m){
  const ex = cremasExtra[m.id] || {};
  const prod = precioCremaAl(claveProducto(m), m.fechaISO);
  // Pago px: lo cargado en la caja, salvo que en esta planilla se haya puesto el valor en pesos (pagos en dólares, por ejemplo)
  const pagoEditado = ex.pagoPx!=null && ex.pagoPx!=='';
  const pago = pagoEditado ? Number(ex.pagoPx) : (Number(m.valor)||0);
  const indica = ex.indica || m.indicaCrema || PARTICULAR;   // en la planilla se puede cambiar; si no, lo que se eligió al cargar la venta
  const cot = Number(ex.cot)||0;
  const costo = prod.costo!=null && prod.costo!=='' ? Number(prod.costo) : null;
  const colageno = esColageno(m.prof);
  // Cremas: costo en USD × cotización. Colágenos: el costo ya está en pesos.
  const bon = ex.pagado==='bon';
  const aPagar = bon ? 0 : (colageno ? (costo!=null ? Math.round(costo) : null) : (cot && costo!=null ? Math.round(costo * cot) : null));
  const prof = aPagar==null ? null : (bon || indica===PARTICULAR ? 0 : Math.round((pago - aPagar) / 2));
  const ummana = aPagar==null ? null : pago - aPagar - prof;
  return { pago, pagoEditado, indica, cot, colageno, pagado: ['si','bon'].includes(ex.pagado) ? ex.pagado : 'no', venta: !colageno && prod.venta!=null && prod.venta!=='' ? Number(prod.venta) : null, costo, aPagar, prof, ummana };
}

/* ---- Vista, mes y pestañas ---- */
document.getElementById('btnCremas').onclick = ()=> mostrarVista('cremas');
document.getElementById('cMesPrev').onclick = ()=>{ mesCremas.month--; if(mesCremas.month<1){ mesCremas.month=12; mesCremas.year--; } cargarMovsCremas(); renderCremas(); };
document.getElementById('cMesNext').onclick = ()=>{ mesCremas.month++; if(mesCremas.month>12){ mesCremas.month=1; mesCremas.year++; } cargarMovsCremas(); renderCremas(); };
document.querySelectorAll('.c-tab[data-ctab]').forEach(b=> b.onclick = ()=>{ cTab = b.dataset.ctab; renderCremas(); });
['cfFecha','cfPaciente','cfConcepto','cfIndica'].forEach(id=> document.getElementById(id).addEventListener('input', renderCremas));
['cfStock','cfsArea','cfsVenta','cfsCosto','cfsStock'].forEach(id=> document.getElementById(id).addEventListener('input', renderCremasStock));

function renderCremas(){
  if(vistaActual!=='cremas') return;
  document.getElementById('cMesLabel').textContent = `${MESES[mesCremas.month-1]} ${mesCremas.year}`;
  document.getElementById('cMesNext').disabled = mesCremas.year===hoyRef.getFullYear() && mesCremas.month===(hoyRef.getMonth()+1);
  document.querySelectorAll('.c-tab[data-ctab]').forEach(b=> b.classList.toggle('active', b.dataset.ctab===cTab));
  document.getElementById('cPanelMovs').classList.toggle('col-hidden', cTab==='stock');
  document.getElementById('cPanelStock').classList.toggle('col-hidden', cTab!=='stock');
  document.getElementById('cBtnLinea').classList.toggle('col-hidden', cTab==='stock');
  if(cTab==='stock') document.getElementById('cBtnPagados').classList.add('col-hidden');
  if(cremasVentas==null) cargarVentasCremas();
  if(cTab!=='stock') renderCremasMovs(); else { if(cremasVentas==null) cargarVentasCremas(); renderCremasStock(); }
}

/* ---- Pestaña: movimientos cremas/colágenos ---- */
const celdaMonto = v => v==null ? '<span class="pend">—</span>' : fmtPesos(v);
/* ---- Pestañas Cremas / Colágenos / Geles: todo acumulado desde el 20/8, con líneas de pago ---- */
const CREMAS_DESDE = '2026-08-20';
let cremasPagos = [];   // cremas/_pagos → lineas: [{id, tipo, fechaPago, ids:[movId…]}]
const msCreado = m => m.creadoEn && m.creadoEn.toMillis ? m.creadoEn.toMillis() : 0;
function ventasCremasTodas(){
  const porId = {};
  (cremasVentas||[]).forEach(m=> porId[m.id] = m);
  movimientos.forEach(m=>{ if(esProfCremas(m.prof)) porId[m.id] = m; });   // lo del mes en curso, en vivo
  return Object.values(porId)
    .filter(m=> !m.migrado && m.fechaISO >= CREMAS_DESDE && esProfCremas(m.prof) && !esSaldaDeudaCrema(m) && !esGastoMov(m))
    .sort((a,b)=> a.fechaISO===b.fechaISO ? msCreado(a)-msCreado(b) : (a.fechaISO < b.fechaISO ? -1 : 1));
}
/* ---- Ingresos / retiros de stock (los trae o se los lleva el proveedor) ---- */
let cremasAjustes = [];   // cremas/_ajustes → items: [{id, fechaISO, clave, tipo:'ingreso'|'retiro', cant, detalle, creadoMs}]
function ajustesCremas(){ return (cremasAjustes||[]).filter(a=> a.fechaISO >= CREMAS_DESDE); }
// Stock de cada producto después de cada venta / ingreso / retiro (a partir del stock inicial)
function stockDespuesDeVenta(ventas){
  const ini = cremasInicial.cantidades || {}, fIni = cremasInicial.fecha || '0000-00-00';
  const res = {};
  const eventos = {};
  ventas.forEach(m=> (eventos[claveProducto(m)] = eventos[claveProducto(m)] || []).push({id:m.id, fecha:m.fechaISO, orden:msCreado(m), delta:-1}));
  ajustesCremas().forEach(a=> (eventos[a.clave] = eventos[a.clave] || []).push({id:a.id, fecha:a.fechaISO, orden:a.creadoMs||0, delta: a.tipo==='retiro' ? -Number(a.cant) : Number(a.cant)}));
  Object.entries(eventos).forEach(([k, lista])=>{
    if(ini[k]==null || ini[k]==='') return;
    lista.sort((a,b)=> a.fecha===b.fecha ? a.orden-b.orden : (a.fecha < b.fecha ? -1 : 1));
    const base = Number(ini[k]);
    let acum = base;
    lista.filter(e=> e.fecha >= fIni).forEach(e=>{ acum += e.delta; res[e.id] = acum; });
    // antes del conteo: se reconstruye hacia atrás
    const antes = lista.filter(e=> e.fecha < fIni);
    let atras = base;
    for(let i = antes.length - 1; i >= 0; i--){ res[antes[i].id] = atras; atras -= antes[i].delta; }
  });
  return res;
}
function renderCremasMovs(){
  const tb = document.getElementById('cTbody'), tf = document.getElementById('cTfoot');
  if(document.activeElement && tb.contains(document.activeElement) && (document.activeElement.classList.contains('c-cot') || document.activeElement.classList.contains('c-pagopx'))) return; // no pisar lo que se está escribiendo
  const usd = cTab==='crema';   // colágenos y geles: sin dólares ni cotización
  const tabla = tb.closest('table');
  tabla.classList.toggle('c-pesos', !usd);
  document.getElementById('cCols').innerHTML = usd
    ? '<col style="width:58px"><col style="width:15%"><col><col style="width:44px"><col style="width:56px"><col style="width:84px"><col style="width:100px"><col style="width:150px"><col style="width:84px"><col style="width:84px"><col style="width:100px"><col style="width:56px"><col style="width:100px"><col style="width:110px">'
    : '<col style="width:64px"><col style="width:18%"><col><col style="width:44px"><col style="width:56px"><col style="width:110px"><col style="width:170px"><col style="width:110px"><col style="width:70px"><col style="width:100px"><col style="width:120px">';
  document.getElementById('cThCosto').textContent = usd ? 'Costo' : 'Costo';
  const nCols = usd ? 14 : 11;
  if(cremasVentas==null){ tb.innerHTML = `<tr><td colspan="${nCols}" class="empty-state">Cargando ventas…</td></tr>`; tf.innerHTML = ''; return; }
  const f = id => document.getElementById(id).value;
  const todas = ventasCremasTodas();
  const stockTras = stockDespuesDeVenta(todas);
  const delTipo = todas.filter(m=> tipoProductoCrema(m.prof)===cTab);
  const prods = {}; productosCremas().forEach(p=> prods[p.clave] = p);
  const ajTipo = ajustesCremas().filter(a=> prods[a.clave] ? tipoProductoCrema(prods[a.clave].prof)===cTab : false);
  const pasa = m=>{
    const c = calcularCrema(m);
    return (!f('cfFecha') || contiene(isoToDisplay(m.fechaISO), f('cfFecha')))
      && (!f('cfPaciente') || contiene(m.pac, f('cfPaciente')))
      && (!f('cfConcepto') || contiene(m.concepto, f('cfConcepto')))
      && (!f('cfIndica') || contiene(c.indica, f('cfIndica')));
  };
  const pasaAj = a=>{
    const p = prods[a.clave] || {};
    return (!f('cfFecha') || contiene(isoToDisplay(a.fechaISO), f('cfFecha')))
      && (!f('cfPaciente') || contiene((a.tipo==='retiro' ? 'RETIRO ' : 'INGRESO ') + (a.detalle||''), f('cfPaciente')))
      && (!f('cfConcepto') || contiene(p.nombre||'', f('cfConcepto')))
      && !f('cfIndica');
  };
  const nombreTipo = ({crema:'cremas', colageno:'colágenos', gel:'geles'})[cTab];
  if(!delTipo.length && !ajTipo.length){
    tb.innerHTML = `<tr><td colspan="${nCols}" class="empty-state">No hay ventas de ${nombreTipo} desde el 20/8/2026.</td></tr>`;
    tf.innerHTML = ''; return;
  }
  const grupos = gruposDePago(delTipo, cTab);
  const ultima = grupos.length ? grupos[grupos.length-1].linea.fechaPago : '';
  const pendientes = delTipo.filter(m=> m.fechaISO > ultima);
  const profs = [PARTICULAR, ...todosLosNombresDeProfesionales().filter(n=> !esProfCremas(n))];
  const sumas = vs=> vs.reduce((a,m)=>{ const c = calcularCrema(m); a.pago += c.pago; a.pagar += c.aPagar||0; a.prof += c.prof||0; a.umm += c.ummana||0; return a; }, {pago:0, pagar:0, prof:0, umm:0});
  const celdaStock = id=>{ const st = stockTras[id]; return `<td class="${st!=null && st<0 ? 'neg' : ''}" style="font-weight:700;">${st==null ? '<span class="pend">—</span>' : st}</td>`; };
  const filaVenta = m=>{
    const c = calcularCrema(m);
    const opts = profs.map(n=> `<option ${n===c.indica?'selected':''}>${n}</option>`).join('');
    const sinStock = c.colageno ? c.costo==null : (c.venta==null && c.costo==null);
    const pagoCelda = `<td><input class="c-pagopx ${c.pagoEditado ? 'editado' : ''} ${!c.pagoEditado && m.moneda==='USD' ? 'usd' : ''}" data-id="${m.id}" inputmode="numeric"
        value="${c.pagoEditado ? fmtPesos(c.pago) : (m.moneda==='USD' ? 'US$ ' : '$') + Number(m.valor||0).toLocaleString('es-AR')}"
        title="${c.pagoEditado ? `Editado acá. En la caja: ${m.moneda==='USD' ? 'US$ ' : '$'}${Number(m.valor||0).toLocaleString('es-AR')}. Borralo para volver a ese valor.` : 'Podés poner el valor en pesos (por ejemplo, si pagó en dólares)'}"></td>`;
    const pagSel = `<td><select class="c-pag c-pag-${c.pagado}" data-id="${m.id}">
        <option value="no" ${c.pagado==='no'?'selected':''}>NO</option>
        <option value="si" ${c.pagado==='si'?'selected':''}>SI</option>
        <option value="bon" ${c.pagado==='bon'?'selected':''}>BON</option>
      </select></td>`;
    return `<tr>
      <td>${isoToDisplay(m.fechaISO)}</td>
      <td class="left">${m.pac||''}</td>
      <td class="concepto">${m.concepto||''}${sinStock ? ' <span class="c-aviso" title="Este producto no tiene precios en Stock">sin precio</span>' : ''}</td>
      <td class="c-cant">-1</td>
      ${celdaStock(m.id)}
      ${usd ? `<td class="monto">${c.venta==null ? '<span class="pend">—</span>' : fmtUsd(c.venta)}</td>` : ''}
      ${pagoCelda}
      <td><select class="c-indica" data-id="${m.id}">${opts}</select></td>
      <td class="monto">${c.costo==null ? '<span class="pend">—</span>' : (c.colageno ? fmtPesos(c.costo) : fmtUsd(c.costo))}</td>
      ${usd ? `<td><input class="c-cot" data-id="${m.id}" inputmode="numeric" value="${c.cot ? c.cot.toLocaleString('es-AR') : ''}" placeholder="—"></td>
      <td class="monto">${celdaMonto(c.aPagar)}</td>` : ''}
      ${pagSel}
      <td class="monto">${celdaMonto(c.prof)}</td>
      <td class="monto ${c.ummana!=null && c.ummana<0 ? 'neg' : ''}">${celdaMonto(c.ummana)}</td>
    </tr>`;
  };
  const filaAjuste = a=>{
    const p = prods[a.clave] || {};
    const ing = a.tipo!=='retiro';
    return `<tr class="c-ajuste ${ing ? 'ing' : 'ret'}">
      <td>${isoToDisplay(a.fechaISO)}</td>
      <td class="left">${ing ? 'INGRESO' : 'RETIRO'}${a.detalle ? ' · ' + a.detalle : ''}</td>
      <td class="concepto">${p.nombre || p.codigo || a.clave}</td>
      <td class="c-cant">${ing ? '+' : '-'}${Number(a.cant).toLocaleString('es-AR')}</td>
      ${celdaStock(a.id)}
      <td colspan="${nCols-6}"></td>
      <td><button class="c-linea-quitar" data-quitar-ajuste="${a.id}" title="Eliminar este ${ing ? 'ingreso' : 'retiro'}">✕</button></td>
    </tr>`;
  };
  const filaSuma = (s, linea, n)=>{
    const titulo = linea
      ? `<span class="c-linea-tit">PAGO</span> <span class="c-linea-n">${n} ${n===1?'venta':'ventas'}</span>`
      : `<span class="c-linea-tit">PENDIENTE DE PAGO</span> <span class="c-linea-n">${n} ${n===1?'venta':'ventas'} desde el último pago</span>`;
    const fecha = linea ? `<button class="c-linea-fecha" data-linea="${linea.id}" title="Cambiar la fecha de pago">${isoToDisplay(linea.fechaPago)}</button>` : '';
    const quitar = linea ? ` <button class="c-linea-quitar" data-quitar-linea="${linea.id}" title="Eliminar la línea de pago">✕</button>` : '';
    return `<tr class="${linea ? 'c-linea' : 'c-linea c-linea-pend'}">
      <td colspan="${usd ? 7 : 6}" class="left">${titulo}</td>
      <td class="monto">${fmtPesos(s.pago)}</td><td></td>
      ${usd ? `<td></td><td></td><td class="monto">${fmtPesos(s.pagar)}</td>` : `<td class="monto">${fmtPesos(s.pagar)}</td>`}
      <td>${fecha}</td>
      <td class="monto">${fmtPesos(s.prof)}</td>
      <td class="monto ${s.umm<0?'neg':''}">${fmtPesos(s.umm)}${quitar}</td>
    </tr>`;
  };
  // filas de ventas e ingresos/retiros en orden de fecha
  const filas = (ventas, desde, hasta)=>{
    const items = [
      ...ventas.filter(pasa).map(m=> ({f:m.fechaISO, o:msCreado(m), html:()=> filaVenta(m)})),
      ...ajTipo.filter(a=> a.fechaISO > desde && (hasta==null || a.fechaISO <= hasta)).filter(pasaAj).map(a=> ({f:a.fechaISO, o:a.creadoMs||0, html:()=> filaAjuste(a)})),
    ].sort((a,b)=> a.f===b.f ? a.o-b.o : (a.f < b.f ? -1 : 1));
    return items.map(x=> x.html()).join('');
  };
  // Lo ya pagado queda oculto; se despliega con "Ver pagados"
  let html = '', prev = '';
  const btnPag = document.getElementById('cBtnPagados');
  btnPag.classList.toggle('col-hidden', !grupos.length);
  btnPag.textContent = cVerPagados ? `▴ Ocultar pagados` : `▾ Ver pagados (${grupos.length})`;
  btnPag.classList.toggle('btn-primary', cVerPagados);
  grupos.forEach(g=>{
    if(cVerPagados){
      html += filas(g.ventas, prev, g.linea.fechaPago);
      html += filaSuma(sumas(g.ventas), g.linea, g.ventas.length);
    }
    prev = g.linea.fechaPago;
  });
  if(!cVerPagados && grupos.length){
    const ult = grupos[grupos.length-1].linea;
    html += `<tr class="c-ocultos"><td colspan="${nCols}"><button class="c-ver-pagados" type="button">▾ ${grupos.length} ${grupos.length===1?'pago anterior oculto':'pagos anteriores ocultos'} (último: ${isoToDisplay(ult.fechaPago)}) — tocá para verlos</button></td></tr>`;
  }
  html += filas(pendientes, prev, null);
  if(pendientes.length) html += filaSuma(sumas(pendientes), null, pendientes.length);
  if(!html) html = `<tr><td colspan="${nCols}" class="empty-state">No hay ventas pendientes de pago.</td></tr>`;
  tb.innerHTML = html;
  tf.innerHTML = '';
  const verBtn = tb.querySelector('.c-ver-pagados');
  if(verBtn) verBtn.onclick = ()=>{ cVerPagados = true; renderCremasMovs(); };
  tb.querySelectorAll('.c-indica').forEach(sel=> sel.onchange = ()=> guardarExtraCrema(sel.dataset.id, {indica: sel.value}));
  tb.querySelectorAll('.c-pag').forEach(sel=> sel.onchange = ()=> guardarExtraCrema(sel.dataset.id, {pagado: sel.value}));
  tb.querySelectorAll('.c-pagopx').forEach(inp=>{
    inp.addEventListener('focus', ()=>{
      const ex = cremasExtra[inp.dataset.id] || {};
      inp.value = ex.pagoPx!=null && ex.pagoPx!=='' ? Number(ex.pagoPx).toLocaleString('es-AR') : '';
      inp.placeholder = 'pesos';
    });
    inp.addEventListener('input', ()=> formatearInputMonto(inp));
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } if(e.key==='Escape'){ e.preventDefault(); inp.dataset.cancelar='1'; inp.blur(); } });
    inp.addEventListener('blur', ()=>{
      const id = inp.dataset.id, ex = cremasExtra[id] || {};
      const antes = ex.pagoPx!=null && ex.pagoPx!=='' ? Number(ex.pagoPx) : null;
      const v = inp.value.trim()==='' ? null : parseMonto(inp.value);
      if(inp.dataset.cancelar || v===antes){ delete inp.dataset.cancelar; renderCremasMovs(); return; }
      guardarExtraCrema(id, {pagoPx: v});
    });
  });
  tb.querySelectorAll('.c-cot').forEach(inp=>{
    inp.addEventListener('input', ()=> formatearInputMonto(inp));
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } });
    inp.addEventListener('blur', ()=>{
      const v = parseMonto(inp.value), antes = Number((cremasExtra[inp.dataset.id]||{}).cot)||0;
      if(v !== antes) guardarExtraCrema(inp.dataset.id, {cot: v}); else renderCremasMovs();
    });
  });
  tb.querySelectorAll('[data-linea]').forEach(b=> b.onclick = ()=> abrirLineaPago(b.dataset.linea));
  tb.querySelectorAll('[data-quitar-linea]').forEach(b=> b.onclick = ()=> quitarLineaPago(b.dataset.quitarLinea));
  tb.querySelectorAll('[data-quitar-ajuste]').forEach(b=> b.onclick = ()=> quitarAjusteCrema(b.dataset.quitarAjuste));
  // al entrar, se ve el final (lo más nuevo)
  const wrap = tb.closest('.sheet-wrap');
  if(wrap && renderCremasMovs._tab !== cTab){ renderCremasMovs._tab = cTab; wrap.scrollTop = wrap.scrollHeight; }
}

let cVerPagados = false;
document.getElementById('cBtnPagados').onclick = ()=>{ cVerPagados = !cVerPagados; renderCremasMovs(); };

/* ---- Modal ingreso / retiro ---- */
const overlayCAjuste = document.getElementById('overlayCAjuste');
let caTipo = 'ingreso';
function setCaTipo(t){
  caTipo = t;
  document.querySelectorAll('#caTipo button').forEach(b=> b.classList.toggle('active', b.dataset.tipo===t));
}
document.querySelectorAll('#caTipo button').forEach(b=> b.onclick = ()=> setCaTipo(b.dataset.tipo));
function productosParaAjuste(){
  return productosCremas().filter(p=> cTab==='stock' || tipoProductoCrema(p.prof)===cTab);
}
document.getElementById('cBtnAjuste').onclick = ()=>{
  if(!esFede()) return;
  setCaTipo('ingreso');
  document.getElementById('caFecha').value = hoyISO();
  document.getElementById('caCant').value = '1';
  document.getElementById('caDetalle').value = '';
  const sel = document.getElementById('caProducto');
  sel.innerHTML = '<option value="">Elegí el producto…</option>' + productosParaAjuste().map(p=> `<option value="${escAttr(p.clave)}">${p.codigo ? p.codigo + ' · ' : ''}${p.nombre || p.clave}</option>`).join('');
  overlayCAjuste.classList.add('show');
};
const cerrarCAjuste = ()=> overlayCAjuste.classList.remove('show');
document.getElementById('closeCAjuste').onclick = cerrarCAjuste;
document.getElementById('caCancelar').onclick = cerrarCAjuste;
document.getElementById('caCant').addEventListener('input', e=> e.target.value = e.target.value.replace(/\D/g,''));
document.getElementById('caGuardar').onclick = async ()=>{
  if(!esFede()) return;
  const fechaISO = document.getElementById('caFecha').value;
  const clave = document.getElementById('caProducto').value;
  const cant = Number(document.getElementById('caCant').value)||0;
  const detalle = mayus(document.getElementById('caDetalle').value.trim());
  if(!fechaISO){ alert("Elegí la fecha."); return; }
  if(!clave){ alert("Elegí el producto."); return; }
  if(!cant){ alert("Poné la cantidad."); return; }
  const nuevos = [...cremasAjustes, {id: 'aj' + Date.now().toString(36), fechaISO, clave, tipo: caTipo, cant, detalle, creadoMs: Date.now()}];
  try{
    await db.collection('cremas').doc('_ajustes').set({items: nuevos});
    cremasAjustes = nuevos;
    cerrarCAjuste(); renderCremas();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
};
async function quitarAjusteCrema(id){
  if(!esFede()) return;
  const a = cremasAjustes.find(x=> x.id===id);
  if(!a || !await ummConfirm(`¿Eliminar este ${a.tipo==='retiro' ? 'retiro' : 'ingreso'} de ${a.cant}?`)) return;
  const nuevos = cremasAjustes.filter(x=> x.id!==id);
  try{ await db.collection('cremas').doc('_ajustes').set({items: nuevos}); cremasAjustes = nuevos; renderCremas(); }
  catch(e){ alert("No se pudo eliminar: " + e.message); }
}


/* ---- Línea de pago ---- */
// Agrupa por fecha: cada línea toma las ventas con fecha posterior a la línea anterior y hasta su fecha de pago
function gruposDePago(ventas, tipo, lineas){
  lineas = (lineas || cremasPagos).filter(l=> l.tipo===tipo).slice().sort((a,b)=> a.fechaPago < b.fechaPago ? -1 : (a.fechaPago > b.fechaPago ? 1 : 0));
  let prev = '';
  return lineas.map(l=>{
    const g = {linea:l, ventas: ventas.filter(m=> m.fechaISO > prev && m.fechaISO <= l.fechaPago)};
    prev = l.fechaPago;
    return g;
  });
}
const overlayCLinea = document.getElementById('overlayCLinea');
let cLineaEdit = null;
function lineasConFecha(fecha){
  return cLineaEdit ? cremasPagos.map(l=> l.id===cLineaEdit ? {...l, fechaPago: fecha} : l)
                    : [...cremasPagos, {id:'__nueva', tipo:cTab, fechaPago: fecha}];
}
function resumenLineaPago(){
  const fecha = document.getElementById('clFecha').value;
  const cont = document.getElementById('clResumen');
  if(!fecha){ cont.textContent = 'Elegí la fecha de pago.'; return; }
  const ventas = ventasCremasTodas().filter(m=> tipoProductoCrema(m.prof)===cTab);
  const g = gruposDePago(ventas, cTab, lineasConFecha(fecha)).find(x=> x.linea.id===(cLineaEdit || '__nueva'));
  const vs = g ? g.ventas : [];
  const aPagar = vs.reduce((a,m)=> a + (calcularCrema(m).aPagar||0), 0);
  const renta = vs.reduce((a,m)=> a + (calcularCrema(m).ummana||0), 0);
  cont.innerHTML = vs.length
    ? `Toma las <b>${vs.length}</b> ${vs.length===1?'venta':'ventas'} de ${({crema:'cremas', colageno:'colágenos', gel:'geles'})[cTab]} hasta el ${fechaLarga(fecha)} (desde la línea de pago anterior). A pagar: <b>${fmtPesos(aPagar)}</b> · Renta Ummana: <b>${fmtPesos(renta)}</b>.`
    : `No hay ventas entre la línea de pago anterior y el ${fechaLarga(fecha)}.`;
}
function abrirLineaPago(idEditar){
  if(!esFede()) return;
  cLineaEdit = idEditar || null;
  const l = idEditar ? cremasPagos.find(x=> x.id===idEditar) : null;
  document.getElementById('clTitulo').textContent = l ? 'Editar línea de pago' : 'Nueva línea de pago';
  document.getElementById('clFecha').value = l ? l.fechaPago : hoyISO();
  resumenLineaPago();
  overlayCLinea.classList.add('show');
}
document.getElementById('clFecha').addEventListener('change', resumenLineaPago);
document.getElementById('cBtnLinea').onclick = ()=> abrirLineaPago(null);
const cerrarCLinea = ()=> overlayCLinea.classList.remove('show');
document.getElementById('closeCLinea').onclick = cerrarCLinea;
document.getElementById('clCancelar').onclick = cerrarCLinea;
document.getElementById('clGuardar').onclick = async ()=>{
  if(!esFede()) return;
  const fechaPago = document.getElementById('clFecha').value;
  if(!fechaPago){ alert("Elegí la fecha de pago."); return; }
  if(cremasPagos.some(l=> l.tipo===cTab && l.fechaPago===fechaPago && l.id!==cLineaEdit)){ alert("Ya hay una línea de pago en esa fecha."); return; }
  const nuevas = cLineaEdit
    ? cremasPagos.map(l=> l.id===cLineaEdit ? {id:l.id, tipo:l.tipo, fechaPago} : l)
    : [...cremasPagos, {id: Date.now().toString(36), tipo: cTab, fechaPago}];
  try{
    await db.collection('cremas').doc('_pagos').set({lineas: nuevas});
    cremasPagos = nuevas;
    cerrarCLinea(); renderCremasMovs();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
};
async function quitarLineaPago(id){
  if(!esFede()) return;
  if(!await ummConfirm("¿Eliminar esta línea de pago? Sus ventas vuelven a quedar pendientes (no se borra ninguna venta).")) return;
  const nuevas = cremasPagos.filter(l=> l.id!==id);
  try{ await db.collection('cremas').doc('_pagos').set({lineas: nuevas}); cremasPagos = nuevas; renderCremasMovs(); }
  catch(e){ alert("No se pudo eliminar: " + e.message); }
}

async function guardarExtraCrema(id, datos){
  if(!esFede()) return;
  cremasExtra[id] = {...(cremasExtra[id]||{}), ...datos};
  renderCremasMovs();
  try{ await db.collection('cremas').doc(id).set(datos, {merge:true}); }
  catch(e){ alert("No se pudo guardar: " + e.message); }
}
/* ---- Pestaña: stock (precios de venta y costo en USD) ---- */
function precioTxt(v, mon){
  if(v==null || v==='') return '';
  return mon==='ars' ? fmtPesos(Number(v)) : 'USD ' + Number(v).toLocaleString('es-AR', {maximumFractionDigits:2});
}
// Ventas (movimientos diarios de cremas/colágenos) desde la fecha del stock inicial
let cargandoVentasCremas = false;
async function cargarVentasCremas(){
  if(cargandoVentasCremas) return;
  const profs = Object.keys(CONCEPTOS).filter(esProfCremas);
  if(!profs.length){ cremasVentas = []; return; }
  cargandoVentasCremas = true;
  try{
    const snap = await db.collection('movimientos').where('prof','in', profs.slice(0,10)).get();
    cremasVentas = snap.docs.map(d=> ({id:d.id, ...d.data()}));
  }catch(e){ cremasVentas = []; console.warn('No se pudieron leer las ventas de cremas', e); }
  cargandoVentasCremas = false;
  renderCremas();
}
function stockProducto(clave){
  const c = cremasInicial.cantidades || {};
  if(c[clave]==null || c[clave]==='') return null;
  const desde = cremasInicial.fecha || '0000-00-00';
  const vendidos = (cremasVentas||[]).filter(m=> claveProducto(m)===clave && m.fechaISO>=desde && !esSaldaDeudaCrema(m) && !esGastoMov(m)).length;
  const ajuste = (cremasAjustes||[]).filter(a=> a.clave===clave && a.fechaISO>=desde).reduce((t,a)=> t + (a.tipo==='retiro' ? -Number(a.cant) : Number(a.cant)), 0);
  return Number(c[clave]) - vendidos + ajuste;
}
function stockTxt(clave){
  const n = stockProducto(clave);
  if(n==null) return {txt:'<span class="pend">—</span>', neg:false};
  if(cremasVentas==null) return {txt:'…', neg:false};
  return {txt: n.toLocaleString('es-AR'), neg: n<0};
}

/* ---- Stock inicial ---- */
const overlayCStockIni = document.getElementById('overlayCStockIni');
document.getElementById('cBtnStockIni').onclick = ()=>{
  if(!esFede()) return;
  document.getElementById('csiFecha').value = cremasInicial.fecha || hoyISO();
  document.getElementById('csiBuscar').value = '';
  const c = cremasInicial.cantidades || {};
  document.getElementById('csiLista').innerHTML = productosCremas().map(p=>`
    <div class="csi-fila" data-texto="${(p.codigo+' '+p.nombre).replace(/"/g,'&quot;')}">
      <span class="nom">${p.nombre || p.codigo}</span>
      <input type="text" inputmode="numeric" data-k="${p.clave.replace(/"/g,'&quot;')}" value="${c[p.clave]!=null && c[p.clave]!=='' ? c[p.clave] : ''}" placeholder="—">
    </div>`).join('') || '<div class="empty-state">No hay productos de cremas o colágenos en Conceptos.</div>';
  document.querySelectorAll('#csiLista input').forEach(inp=> inp.addEventListener('input', ()=> inp.value = inp.value.replace(/\D/g,'')));
  overlayCStockIni.classList.add('show');
};
document.getElementById('csiBuscar').addEventListener('input', e=>{
  const q = e.target.value;
  document.querySelectorAll('#csiLista .csi-fila').forEach(f=> f.style.display = !q || contiene(f.dataset.texto, q) ? '' : 'none');
});
const cerrarCStockIni = ()=> overlayCStockIni.classList.remove('show');
document.getElementById('closeCStockIni').onclick = cerrarCStockIni;
document.getElementById('cancelCStockIni').onclick = cerrarCStockIni;
document.getElementById('guardarCStockIni').onclick = async ()=>{
  if(!esFede()) return;
  const fecha = document.getElementById('csiFecha').value;
  if(!fecha){ alert("Elegí la fecha del conteo."); return; }
  const cantidades = {};
  document.querySelectorAll('#csiLista input').forEach(inp=>{ if(inp.value!=='') cantidades[inp.dataset.k] = Number(inp.value); });
  try{
    await db.collection('cremas').doc('_stockInicial').set({fecha, cantidades, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    cremasInicial = {fecha, cantidades};
    cerrarCStockIni();
    cTab = 'stock'; renderCremas();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
};
let cremasOcultos = [];   // productos eliminados del stock de cremas (cremas/_stock.ocultos)
function productosCremas(){
  const porClave = {};
  Object.keys(CONCEPTOS).filter(esProfCremas).forEach(prof=>
    CONCEPTOS[prof].forEach(c=>{ const k = mayus((c.codigo||'').trim()) || mayus(c.concepto); if(k) porClave[k] = {clave:k, codigo:c.codigo||'', nombre:c.concepto, prof}; }));
  Object.keys(cremasStock).forEach(k=>{ if(!porClave[k]) porClave[k] = {clave:k, codigo:k, nombre:'', prof:''}; });
  const ocultos = new Set(cremasOcultos);
  return Object.values(porClave).filter(p=> !ocultos.has(p.clave))
    .sort((a,b)=> (a.codigo||a.nombre).localeCompare(b.codigo||b.nombre, 'es', {numeric:true}));
}
async function eliminarProductoCrema(clave){
  if(!esFede()) return;
  const p = productosCremas().find(x=> x.clave===clave);
  if(!await ummConfirm(`¿Eliminar ${p && p.nombre ? p.nombre + ' (' + clave + ')' : clave} del stock de cremas y colágenos?\n\nSe borran su precio y su costo. Los movimientos de la caja no se tocan.`)) return;
  try{
    await db.collection('cremas').doc('_stock').set({
      productos: {[clave]: firebase.firestore.FieldValue.delete()},
      ocultos: firebase.firestore.FieldValue.arrayUnion(clave),
    }, {merge:true});
    delete cremasStock[clave];
    if(!cremasOcultos.includes(clave)) cremasOcultos = [...cremasOcultos, clave];
    if(document.activeElement) document.activeElement.blur();
    renderCremasStock();
  }catch(e){ alert("No se pudo eliminar: " + e.message); }
}
function renderCremasStock(){
  const tb = document.getElementById('cStockBody');
  if(document.activeElement && tb.contains(document.activeElement)) return;
  const q = document.getElementById('cfStock').value;
  const fv = id => document.getElementById(id).value;
  const lista = productosCremas().filter(p=>{
    const s = cremasStock[p.clave] || {};
    const pesos = esColageno(p.prof);
    const stockPlano = (stockTxt(p.clave).txt || '').replace(/<[^>]*>/g,'');
    return (!q || contiene(p.codigo+' '+p.nombre, q))
      && (!fv('cfsArea') || contiene(p.prof, fv('cfsArea')))
      && (!fv('cfsVenta') || contiene(pesos ? '' : precioTxt(s.venta,'usd'), fv('cfsVenta')))
      && (!fv('cfsCosto') || contiene(precioTxt(s.costo, pesos ? 'ars' : 'usd'), fv('cfsCosto')))
      && (!fv('cfsStock') || contiene(stockPlano, fv('cfsStock')));
  });
  if(!lista.length){ tb.innerHTML = `<tr><td colspan="5" class="empty-state">No hay productos de cremas, colágenos o geles en Conceptos.</td></tr>`; document.getElementById('cStockFoot').innerHTML = ''; return; }
  tb.innerHTML = lista.map(p=>{
    const s = cremasStock[p.clave] || {};
    return `<tr>
      <td class="left">${p.nombre || p.codigo}</td>
      <td class="codigo">${p.prof}</td>
      <td>${esColageno(p.prof) ? '<span class="pend">—</span>' : `<input class="c-precio" data-k="${p.clave.replace(/"/g,'&quot;')}" data-campo="venta" data-mon="usd" inputmode="decimal" value="${precioTxt(s.venta,'usd')}">`}</td>
      <td><input class="c-precio" data-k="${p.clave.replace(/"/g,'&quot;')}" data-campo="costo" data-mon="${esColageno(p.prof)?'ars':'usd'}" inputmode="decimal" value="${precioTxt(s.costo, esColageno(p.prof)?'ars':'usd')}"></td>
      <td class="${stockTxt(p.clave).neg ? 'neg' : ''}" style="font-weight:700;">${stockTxt(p.clave).txt}</td>
      <td class="editcol"><button class="c-quitar" title="Eliminar producto" data-quitar="${p.clave.replace(/"/g,'&quot;')}">✕</button></td>
    </tr>`;
  }).join('');
  // Totales de lo que está a la vista: unidades, y valor del stock (venta y costo) en dólares y en pesos
  let tUnid = 0, tVentaUsd = 0, tCostoUsd = 0, tCostoArs = 0;
  lista.forEach(p=>{
    const n = stockProducto(p.clave);
    if(n==null || cremasVentas==null) return;
    tUnid += n;
    const st = cremasStock[p.clave] || {}, u = Math.max(0, n);   // el valor se calcula sobre lo que hay (sin negativos)
    if(esColageno(p.prof)){ if(st.costo!=null && st.costo!=='') tCostoArs += u * Number(st.costo); }
    else {
      if(st.venta!=null && st.venta!=='') tVentaUsd += u * Number(st.venta);
      if(st.costo!=null && st.costo!=='') tCostoUsd += u * Number(st.costo);
    }
  });
  const usd = v => 'USD ' + Math.round(v).toLocaleString('es-AR');
  document.getElementById('cStockFoot').innerHTML = `<tr>
    <td colspan="2" class="left">TOTALES <span class="tot-cant">(${lista.length} ${lista.length===1?'producto':'productos'})</span></td>
    <td>${tVentaUsd ? usd(tVentaUsd) : '<span class="pend">—</span>'}</td>
    <td>${[tCostoUsd ? usd(tCostoUsd) : '', tCostoArs ? fmtPesos(tCostoArs) : ''].filter(Boolean).join('<br>') || '<span class="pend">—</span>'}</td>
    <td class="${tUnid<0?'neg':''}">${tUnid.toLocaleString('es-AR')}</td>
    <td></td></tr>`;
  tb.querySelectorAll('[data-quitar]').forEach(b=> b.onclick = ()=> eliminarProductoCrema(b.dataset.quitar));
  tb.querySelectorAll('.c-precio').forEach(inp=>{
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } });
    inp.addEventListener('focus', ()=>{   // al editar se ve solo el número
      const v = (cremasStock[inp.dataset.k]||{})[inp.dataset.campo];
      inp.value = v==null || v==='' ? '' : String(v).replace('.',',');
      inp.select();
    });
    inp.addEventListener('blur', async ()=>{
      const k = inp.dataset.k, campo = inp.dataset.campo;
      const limpio = inp.value.replace(/[^\d,.]/g,'');
      const v = limpio==='' ? '' : parseDecimal(limpio);
      inp.value = precioTxt(v, inp.dataset.mon);
      if(String((cremasStock[k]||{})[campo] ?? '') === String(v)) return;
      // historial: lo vendido antes de hoy mantiene el precio que tenía
      const prev = cremasStock[k] || {};
      const hoy = hoyISO();
      let hist = Array.isArray(prev.hist) ? prev.hist.slice() : [];
      if(!hist.length && (prev.venta!=null || prev.costo!=null)) hist.push({desde:'0000-00-00', venta: prev.venta ?? '', costo: prev.costo ?? ''});
      const nuevo = {...prev, [campo]: v};
      if(hist.length && hist[hist.length-1].desde===hoy) hist[hist.length-1] = {desde: hoy, venta: nuevo.venta ?? '', costo: nuevo.costo ?? ''};
      else hist.push({desde: hist.length ? hoy : '0000-00-00', venta: nuevo.venta ?? '', costo: nuevo.costo ?? ''});
      nuevo.hist = hist;
      cremasStock[k] = nuevo;
      try{ await db.collection('cremas').doc('_stock').set({productos: {[k]: {[campo]: v, hist}}}, {merge:true}); }
      catch(e){ alert("No se pudo guardar el precio: " + e.message); }
    });
  });
}

