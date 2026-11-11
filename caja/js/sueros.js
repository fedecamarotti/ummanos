/* =====================================================================
   SUEROS (solo Fede) — aplicaciones, compras de insumos, stock y resumen
   ===================================================================== */
let sueros = [];                 // todos los movimientos de sueros (ordenados por fecha)
let vistaActual = 'movimientos';
let sTabActual = 'movs';
let mesSueros = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };
// Valores fijos del reparto (se editan desde "Valores fijos" y se guardan en sueros/_config)
const SUEROS_CFG_DEFAULT = { sabrina: 50000, fijoGabriela: 27500, pctGabriela: 15 };
let suerosCfg = {...SUEROS_CFG_DEFAULT};
let unsubSuerosCfg = null;

const fmtPesos = v => (v<0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es-AR');
const parseMonto = v => Number(String(v||'').replace(/\D/g,'')) || 0;
function formatearInputMonto(inp){
  const raw = inp.value.replace(/\D/g,'');
  inp.value = raw ? Number(raw).toLocaleString('es-AR') : '';
}
function sMesInicio(){ return `${mesSueros.year}-${String(mesSueros.month).padStart(2,'0')}-01`; }
function sMesFin(){
  let y = mesSueros.year, m = mesSueros.month + 1;
  if(m>12){ m=1; y++; }
  return `${y}-${String(m).padStart(2,'0')}-01`;
}
function sEsMesActual(){ return mesSueros.year===hoyRef.getFullYear() && mesSueros.month===(hoyRef.getMonth()+1); }

/* ---- Cálculo del reparto de una aplicación ----
   Renta    = total paciente − costo insumos − Sabrina
   Gabriela = (Renta − fijo) × % (si da negativo, 0). Se puede pisar a mano.
   Ummana   = Renta − Gabriela (puede dar negativo)                         */
function calcularGabrielaAuto(total, insumos, sabrina){
  const base = (total - insumos - sabrina) - (Number(suerosCfg.fijoGabriela)||0);
  return base > 0 ? Math.round(base * (Number(suerosCfg.pctGabriela)||0) / 100) : 0;
}
function calcularUmmana(total, insumos, sabrina, gabriela){
  return total - insumos - sabrina - gabriela;
}
// Lo que se ve en las columnas: los valores guardados en cada aplicación
function calcularRepartoSuero(m){
  if(m.tipo==='egreso' || m.gabriela==null) return { insumos:null, sabrina:null, gabriela:null, ummana:null };
  return { insumos: m.insumosTotal||0, sabrina: m.sabrina||0, gabriela: m.gabriela||0, ummana: m.ummana||0 };
}
// El stock se contabiliza desde esta fecha: los meses anteriores se muestran sin valores
const STOCK_DESDE = '2026-10-01';
/* ---- "VIAS Y OTROS INSUMOS" es un kit: desde el 1/10/2026 descuenta 1 de cada componente
   y su valor unitario es la suma de los cuatro ---- */
const claveInsumo = v => normBusqueda(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ñ]/g,'');
const esVias = n => claveInsumo(n).startsWith('viasyotros');
const KIT_VIAS = [
  {nombre:'GUIA',                prefijos:['guia']},
  {nombre:'CATETER',             prefijos:['cateter']},
  {nombre:'SOL. FISIOLOGICA',    prefijos:['solfisiolog','solucionfisiolog']},
  {nombre:'OTROS (AGUJAS, ETC)', prefijos:['otros']},
];
// Nombres reales de los componentes, tal como se cargaron en las compras
let cacheComps = {ref:null, len:-1, val:null};
function componentesVias(){
  if(cacheComps.ref===sueros && cacheComps.len===sueros.length) return cacheComps.val;
  const val = calcularComponentesVias();
  cacheComps = {ref:sueros, len:sueros.length, val};
  return val;
}
function calcularComponentesVias(){
  const nombres = new Set();
  sueros.forEach(m=>{ if(m.tipo==='egreso' || m.tipo==='ajuste') (m.items||[]).forEach(it=> it.insumo && nombres.add(it.insumo)); });
  const lista = [...nombres];
  return KIT_VIAS.map(k=> lista.find(n=> k.prefijos.some(p=> claveInsumo(n).startsWith(p))) || k.nombre);
}
// Expande el kit en sus componentes (solo para aplicaciones desde el 1/10/2026)
function expandirKit(items, fechaISO){
  const out = [];
  const comps = (fechaISO||hoyISO()) >= STOCK_DESDE ? componentesVias() : null;
  (items||[]).forEach(it=>{
    const cant = Number(it.cant)||0;
    if(comps && esVias(it.insumo)) comps.forEach(c=> out.push({insumo:c, cant}));
    else out.push({insumo: it.insumo, cant});
  });
  return out;
}
// Insumos que consume cada aplicación (se descuentan del stock)
function consumosDeIngreso(m){
  return expandirKit(m.items, m.fechaISO);
}

function mostrarVista(v){
  if((v==='sueros' && !esAdminSueros()) || ((v==="cremas" || v==='conta' || v==='trat') && !esFede()) || (v==='informes' && currentUser.rol!=='admin')) return;
  vistaActual = v;
  document.getElementById('vistaMovimientos').classList.toggle('col-hidden', v!=='movimientos');
  document.getElementById('vistaSueros').classList.toggle('col-hidden', v!=='sueros');
  document.getElementById('vistaCremas').classList.toggle('col-hidden', v!=='cremas');
  document.getElementById('vistaConta').classList.toggle('col-hidden', v!=='conta');
  document.getElementById('vistaTrat').classList.toggle('col-hidden', v!=='trat');
  document.getElementById('vistaInformes').classList.toggle('col-hidden', v!=='informes');
  document.getElementById('btnNuevo').classList.add('col-hidden');
  document.getElementById('btnVistaMovimientos').classList.toggle('activo', v==='movimientos');
  document.getElementById('btnSueros').classList.toggle('activo', v==='sueros');
  document.getElementById('btnCremas').classList.toggle('activo', v==='cremas');
  document.getElementById('btnConta').classList.toggle('activo', v==='conta');
  // La fila de secciones queda siempre arriba; los botones de cada sección van debajo, más chicos
  if(esUsuarioCaja()){
    const tabs = document.getElementById('fedeTabs');
    const destino = document.querySelector(`#${({movimientos:'vistaMovimientos', sueros:'vistaSueros', cremas:'vistaCremas', conta:'vistaConta', informes:'vistaInformes', trat:'vistaTrat'})[v]} > .fede-nav`);
    destino.classList.remove('col-hidden'); destino.appendChild(tabs);
    tabs.querySelectorAll('[data-ir]').forEach(b=> b.classList.toggle('active', b.dataset.ir===v));
    document.body.classList.add('fede-nav-on');
  }
  if(v==='sueros'){ suscribirSueros(); if(sTabActual==='resumen') sResAlMesActual(); renderSueros(); }
  if(v==='cremas'){ suscribirCremas(); cremasVentas = null; renderCremas(); }
  if(v==='conta'){ suscribirConta(); renderConta(); }
  if(v==='trat') trRender();
  if(v==='informes') cargarAsistencias();
}
document.getElementById('btnVistaMovimientos').onclick = ()=> mostrarVista('movimientos');
document.getElementById('btnSueros').onclick = ()=> mostrarVista('sueros');

let suerosExcepciones = {};   // { "APELLIDO, NOMBRE": {sabrina0:true, gabriela0:true} }
let ordenInsumos = [];        // orden personalizado de insumos
function excepcionDe(nombre){ return suerosExcepciones[mayus(nombre||'')] || {}; }
function suscribirSueros(){
  if(unsubSueros || !(esAdminSueros() || puedeCargarSueros())) return;
  const unsubMovs = db.collection('sueros').orderBy('fechaISO','asc').onSnapshot(snap=>{
    const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
    sueros = snap.docs.filter(d=> d.id!=='_config').map(d=> ({id:d.id, ...d.data()}))
      .sort((a,b)=> a.fechaISO===b.fechaISO ? ms(a.creadoEn)-ms(b.creadoEn) : (a.fechaISO<b.fechaISO?-1:1));
    renderSueros(); renderPortalSueros();
  }, err=>{
    document.getElementById('sTbody').innerHTML = `<tr><td colspan="9" style="padding:20px;text-align:left;color:#a13a3a;">
      No se pudieron cargar los movimientos de sueros: ${err.message}</td></tr>`;
  });
  const unsubCfg = db.collection('sueros').doc('_config').onSnapshot(d=>{
    suerosCfg = {...SUEROS_CFG_DEFAULT, ...(d.exists ? d.data() : {})};
  }, ()=>{});
  const unsubEx = db.collection('sueros').doc('_excepciones').onSnapshot(d=>{
    suerosExcepciones = (d.exists && d.data().lista) || {};
    if(overlayExcep.classList.contains('show')) renderExcepciones();
  }, ()=>{});
  const unsubOrden = db.collection('sueros').doc('_orden').onSnapshot(d=>{
    ordenInsumos = (d.exists && d.data().insumos) || [];
    renderSueros(); renderPortalSueros();
  }, ()=>{});
  const unsubIni = db.collection('sueros').doc('_stockInicial').onSnapshot(d=>{
    suerosStockInicial = d.exists ? d.data() : null;
    renderSueros(); renderPortalSueros();
  }, ()=>{});
  const unsubCont = esFede() ? db.collection('sueros').doc('_conteo').onSnapshot(d=>{
    suerosConteo = (d.exists && d.data().lista) || {};
    if(sTabActual==='stock' && !document.activeElement.classList.contains('s-cont')) renderSueros();
  }, ()=>{}) : ()=>{};
  const unsubCrit = db.collection('sueros').doc('_criticos').onSnapshot(d=>{
    suerosCriticos = (d.exists && d.data().lista) || {};
    if(sTabActual==='stock') renderSueros();
  }, ()=>{});
  unsubSueros = ()=>{ unsubMovs(); unsubCfg(); unsubEx(); unsubOrden(); unsubCrit(); unsubIni(); unsubCont(); };
}

/* ---- Mes y pestañas ---- */
document.getElementById('sMesPrev').onclick = ()=>{
  mesSueros.month--; if(mesSueros.month<1){ mesSueros.month=12; mesSueros.year--; }
  renderSueros();
};
document.getElementById('sMesNext').onclick = ()=>{
  mesSueros.month++; if(mesSueros.month>12){ mesSueros.month=1; mesSueros.year++; }
  renderSueros();
};
document.querySelectorAll('.s-tab[data-tab]').forEach(b=>{
  b.onclick = ()=>{ if(suerosLimitado() && b.dataset.tab==='movs') return; sTabActual = b.dataset.tab; if(sTabActual==='resumen') sResAlMesActual(); renderSueros(); };
});
['sfFecha','sfTercero','sfDetalle','sfTotal','sfInsumos','sfSabrina','sfGabriela','sfUmmana'].forEach(id=>
  document.getElementById(id).addEventListener('input', renderSuerosTabla));
document.getElementById('sfInsumoStock').addEventListener('input', renderStock);
document.getElementById('sStockProv').addEventListener('change', renderStock);

function renderSueros(){
  if(vistaActual!=='sueros') return;
  document.getElementById('sMesLabel').textContent = `${MESES[mesSueros.month-1]} ${mesSueros.year}`;
  document.getElementById('sMesNext').disabled = sEsMesActual();
  document.querySelectorAll('.s-tab[data-tab]').forEach(b=>{
    const act = b.dataset.tab===sTabActual;
    b.classList.toggle('active', act);
    b.setAttribute('aria-selected', act ? 'true' : 'false');
  });
  document.getElementById('sPanelMovs').classList.toggle('col-hidden', sTabActual!=='movs');
  document.getElementById('sPanelStock').classList.toggle('col-hidden', sTabActual!=='stock');
  document.getElementById('sPanelResumen').classList.toggle('col-hidden', sTabActual!=='resumen');
  const vv = vencimientosProximos();
  const bVenc = document.getElementById('sBtnVenc');
  bVenc.classList.toggle('col-hidden', !vv.length);
  bVenc.innerHTML = ico('alerta') + ' ' + (vv.some(v=> v.dias<0) ? `Vencidos / por vencer (${vv.length})` : `Por vencer (${vv.length})`);
  bVenc.title = vv.map(v=> `${v.insumo}: ${v.cant} u. ${v.dias<0 ? 'vencido el' : 'vence el'} ${fechaLarga(v.vence)}`).join('\n');
  if(sTabActual==='movs') renderSuerosTabla();
  if(sTabActual==='stock') renderStock();
  if(sTabActual==='resumen') renderResumenSueros();
}

function suerosDelMes(){
  const ini = sMesInicio(), fin = sMesFin();
  return sueros.filter(m=> m.tipo!=='ajuste' && m.fechaISO>=ini && m.fechaISO<fin);
}
// "VITAMINA C / BERBERIS / GALIUM (2)" — la cantidad solo si es más de 1
function insumosTxt(m){
  return (m.items||[]).map(it=> it.insumo + (Number(it.cant)>1 ? ` (${Number(it.cant).toLocaleString('es-AR')})` : '')).join(' / ');
}
function insumosHTML(m){
  return (m.items||[]).map(it=> it.insumo + (Number(it.cant)>1 ? ` (${Number(it.cant).toLocaleString('es-AR')})` : '')).join('<b class="ins-sep"> / </b>');
}
// Ajusta el ancho de una columna al texto más largo que se ve (+ margen)
const medidorTexto = document.createElement('canvas').getContext('2d');
function ajustarColumna(col, textos, fuente, extra, minimo){
  if(!col) return;
  medidorTexto.font = fuente;
  const max = textos.reduce((a,t)=> Math.max(a, medidorTexto.measureText(t||'').width), (minimo||80) - (extra||24));
  col.style.width = Math.ceil(max + (extra||24)) + 'px';
}
// Tooltip solo si el texto quedó cortado con "…"
function tooltipSiCortado(cont){
  cont.querySelectorAll('.cortable').forEach(td=>{
    td.onmouseenter = ()=>{ td.title = td.scrollWidth > td.clientWidth ? td.dataset.full : ''; };
  });
}
function detalleSuero(m){
  // Egresos: el detalle escrito (los insumos se ven solo al editar). Aplicaciones: las notas.
  return m.tipo==='egreso' ? (m.detalle || 'COMPRA DE INSUMOS') : (m.notas || m.detalle || '');
}
const celdaReparto = v => v==null ? '<span class="pend">—</span>' : fmtPesos(v);

/* ---- Pestaña 1: Movimientos sueros ---- */
// Cargar el pago directo desde la celda "FALTA" (Enter o al salir del campo)
async function guardarTotalInline(id, valor){
  const m = sueros.find(x=> x.id===id);
  if(!m || !esAdminSueros() || String(valor).trim()==='') return;
  const total = parseMonto(valor);
  const insumos = Number(m.insumosTotal)||0, sabrina = Number(m.sabrina)||0;
  const gabriela = m.gabrielaManual ? (Number(m.gabriela)||0) : calcularGabrielaAuto(total, insumos, sabrina);
  try{
    await db.collection('sueros').doc(id).update({
      total, pagoPendiente: false, gabriela,
      ummana: calcularUmmana(total, insumos, sabrina, gabriela),
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(e){ alert("No se pudo guardar el pago: " + e.message); }
}
function activarInputsFalta(tb){
  // Pagos ya cargados: al tocarlos se pueden modificar (Esc o vacío deja el valor como estaba)
  tb.querySelectorAll('.total-edit').forEach(sp=>{
    sp.onclick = ()=>{
      const m = sueros.find(x=> x.id===sp.dataset.total);
      if(!m) return;
      const inp = document.createElement('input');
      inp.className = 'falta-input'; inp.inputMode = 'numeric';
      inp.value = Number(m.total||0).toLocaleString('es-AR');
      sp.replaceWith(inp);
      inp.focus(); inp.select();
      inp.addEventListener('input', ()=> formatearInputMonto(inp));
      let listo = false;
      const terminar = guardar=>{
        if(listo) return; listo = true;
        if(guardar && inp.value.trim()!=='' && parseMonto(inp.value)!==Number(m.total||0)) guardarTotalInline(m.id, inp.value);
        renderSuerosTabla();
      };
      inp.addEventListener('keydown', e=>{
        if(e.key==='Enter'){ e.preventDefault(); terminar(true); }
        if(e.key==='Escape'){ e.preventDefault(); terminar(false); }
      });
      inp.addEventListener('blur', ()=> terminar(true));
    };
  });
  tb.querySelectorAll('.falta-input').forEach(inp=>{
    inp.addEventListener('input', ()=> formatearInputMonto(inp));
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); inp.blur(); }
      if(e.key==='Escape'){ e.preventDefault(); inp.value=''; inp.blur(); }
    });
    inp.addEventListener('blur', ()=>{ if(inp.value.trim()!=='') guardarTotalInline(inp.dataset.falta, inp.value); });
  });
}
function renderSuerosTabla(){
  const tb = document.getElementById('sTbody');
  const f = id => document.getElementById(id).value;
  const filas = suerosDelMes().filter(m=>{
    const r = calcularRepartoSuero(m);
    const tot = m.tipo==='egreso' ? -m.total : m.total;
    const totTxt = m.pagoPendiente ? 'FALTA' : fmtPesos(tot||0);
    const vs = v => v==null ? '' : fmtPesos(v);
    return (!f('sfFecha')    || contiene(isoToDisplay(m.fechaISO), f('sfFecha')))
        && (!f('sfTercero')  || contiene(m.tercero, f('sfTercero')))
        && (!f('sfDetalle')  || contiene(m.tipo==='egreso' ? detalleSuero(m) : insumosTxt(m), f('sfDetalle')))
        && (!f('sfTotal')    || contiene(totTxt, f('sfTotal')))
        && (!f('sfInsumos')  || contiene(vs(r.insumos), f('sfInsumos')))
        && (!f('sfSabrina')  || contiene(vs(r.sabrina), f('sfSabrina')))
        && (!f('sfGabriela') || contiene(vs(r.gabriela), f('sfGabriela')))
        && (!f('sfUmmana')   || contiene(vs(r.ummana), f('sfUmmana')));
  });
  if(!filas.length){
    tb.innerHTML = `<tr><td colspan="10" class="empty-state">${sueros.length ? 'No hay movimientos de sueros en este mes.' : 'Todavía no cargaste movimientos de sueros. Empezá con "+ Nuevo mov."'}</td></tr>`;
    document.getElementById('sTfoot').innerHTML = '';
    return;
  }
  tb.innerHTML = filas.map(m=>{
    const esEg = m.tipo==='egreso';
    const r = calcularRepartoSuero(m);
    return `
      <tr>
        <td class="editcol"><button class="editbtn" title="Editar" onclick="abrirModalSuero('${m.id}')">&#9998;</button></td>
        <td>${isoToDisplay(m.fechaISO)}</td>
        <td class="left">${m.tercero||''}</td>
        ${esEg ? `<td class="concepto cortable" data-full="${detalleSuero(m).replace(/"/g,'&quot;')}">${detalleSuero(m)}</td>`
               : `<td class="concepto cortable" data-full="${insumosTxt(m).replace(/"/g,'&quot;')}">${insumosHTML(m) || '<span class="pend">—</span>'}</td>`}
        <td>${esEg ? '' : `<button type="button" class="sw-mt ${m.turno==='M' ? 'm' : m.turno==='T' ? 't' : ''}" data-turno="${m.id}" title="Mañana / sin asignar / tarde"><i>${m.turno||''}</i></button>`}</td>
        <td class="monto total ${esEg?'egreso':'ingreso'}">${m.pagoPendiente ? `<input class="falta-input" data-falta="${m.id}" inputmode="numeric" placeholder="FALTA" title="Escribí el pago y tocá Enter">` : esEg ? fmtPesos(-m.total) : `<span class="total-edit" data-total="${m.id}" title="Tocá para modificar el pago">${fmtPesos(m.total||0)}</span>`}</td>
        <td class="monto">${celdaReparto(r.insumos)}</td>
        <td class="monto">${celdaReparto(r.sabrina)}</td>
        <td class="monto">${celdaReparto(r.gabriela)}</td>
        <td class="monto ${r.ummana!=null && r.ummana<0 ? 'neg' : ''}">${celdaReparto(r.ummana)}</td>
      </tr>`;
  }).join('');
  // Fila "Totales" (solo lo filtrado; egresos restan; los FALTA no suman)
  const t = {total:0, insumos:0, sabrina:0, gabriela:0, ummana:0};
  filas.forEach(m=>{
    const r = calcularRepartoSuero(m);
    if(!m.pagoPendiente) t.total += m.tipo==='egreso' ? -(m.total||0) : (m.total||0);
    ['insumos','sabrina','gabriela','ummana'].forEach(k=>{ if(r[k]!=null) t[k] += Number(r[k])||0; });
  });
  const c = v => `<td class="monto ${v<0?'neg':''}">${fmtPesos(v)}</td>`;
  document.getElementById('sTfoot').innerHTML = `<tr>
    <td class="editcol"></td>
    <td colspan="4" class="left">TOTALES <span class="tot-cant">(${filas.length} ${filas.length===1?'movimiento':'movimientos'})</span></td>
    ${c(t.total)}${c(t.insumos)}${c(t.sabrina)}${c(t.gabriela)}${c(t.ummana)}
  </tr>`;
  activarInputsFalta(tb);
  tb.querySelectorAll('[data-turno]').forEach(b=> b.onclick = e=>{
    const m = sueros.find(x=> x.id===b.dataset.turno); if(!m) return;
    const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    let nuevo = x < 0.4 ? 'M' : x > 0.6 ? 'T' : '';
    if(nuevo && nuevo===m.turno) nuevo = '';   // tocar el mismo lado lo vuelve a "sin asignar"
    m.turno = nuevo;
    b.className = 'sw-mt ' + (nuevo==='M' ? 'm' : nuevo==='T' ? 't' : ''); b.querySelector('i').textContent = nuevo;
    db.collection('sueros').doc(m.id).update({turno: nuevo}).catch(err=> alert('No se pudo guardar: ' + err.message));
  });
  ajustarColumna(document.querySelector('.tabla-sueros col:nth-child(3)'), filas.map(m=> m.tercero), '500 10.5px Montserrat, sans-serif', 26, 165);
  tooltipSiCortado(tb);
}

/* ---- Pestaña 2: Stock ---- */
// Stock acumulado hasta el fin del mes elegido: compras suman, aplicaciones restan.
// Valor unitario = precio de la última compra de ese insumo.
/* ---- Stock por lotes: se usan primero las unidades más viejas (FIFO) ----
   Compras: agregan un lote (cantidad, valor unitario, vencimiento).
   Aplicaciones: consumen del lote más viejo; si no alcanza, queda en negativo al último precio.
   Ajustes (editar insumo): suman/restan unidades y, si cambian el valor, revalúan lo que queda. */
const diaSiguiente = iso=>{
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
let cacheSim = {ref:null, len:-1, map:new Map()};
let suerosStockInicial = null;   // sueros/_stockInicial → {fecha, items:{INSUMO:{cant, valorUnit}}}
// Ajustes (lápiz) hechos antes de guardar el stock inicial: el conteo ya los reemplaza, no se cuentan
function ajusteSuperado(m){
  const ini = suerosStockInicial;
  if(!ini || !ini.items || m.tipo!=='ajuste') return false;
  const iniMs = ini.actualizadoEn && ini.actualizadoEn.toMillis ? ini.actualizadoEn.toMillis() : Date.now();
  const mMs = m.creadoEn && m.creadoEn.toMillis ? m.creadoEn.toMillis() : Infinity;
  return mMs < iniMs;
}
function simularLotes(hastaISO, opts){
  opts = opts || {};
  const usarCache = !opts.excluirId && !opts.sinCache;
  if(usarCache){
    if(cacheSim.ref!==sueros || cacheSim.len!==sueros.length || cacheSim.ini!==suerosStockInicial) cacheSim = {ref:sueros, len:sueros.length, ini:suerosStockInicial, map:new Map()};
    if(cacheSim.map.has(hastaISO)) return cacheSim.map.get(hastaISO);
  }
  const inv = {}, costos = {};
  const get = k=> inv[k] || (inv[k] = {lotes:[], todos:[], deficit:0, ultimo:0});
  const agregarLote = (k, cant, vu, meta)=>{
    const s = get(k); let n = cant;
    if(s.deficit > 0){ const a = Math.min(s.deficit, n); s.deficit -= a; n -= a; }
    const lote = {cant:n, valorUnit:vu, consumos:[], ...meta};
    s.todos.push(lote);
    if(n > 0) s.lotes.push(lote);
  };
  const consumir = (k, cant, app)=>{
    const s = get(k); let rest = cant, costo = 0;
    while(rest > 0 && s.lotes.length){
      const l = s.lotes[0], t = Math.min(rest, l.cant);
      costo += t * l.valorUnit; l.cant -= t; rest -= t;
      if(app) l.consumos.push({appId: app.id, cant: t, costoUnit: l.valorUnit});
      if(l.cant <= 0) s.lotes.shift();
    }
    if(rest > 0){ s.deficit += rest; costo += rest * s.ultimo; }
    return costo;
  };
  // Stock inicial (conteo al 1/10): reemplaza lo anterior; de antes solo se toma el último precio
  const ini = suerosStockInicial && suerosStockInicial.items && Object.keys(suerosStockInicial.items).length ? suerosStockInicial : null;
  const fIni = ini ? (ini.fecha || STOCK_DESDE) : null;
  let iniHecho = false;
  const aplicarIni = ()=>{
    if(iniHecho || !ini) return; iniHecho = true;
    Object.entries(ini.items).forEach(([k, v])=>{
      const st = get(k), vu = Number(v.valorUnit)||0, n = Number(v.cant)||0;
      if(vu) st.ultimo = vu;
      if(n > 0) agregarLote(k, n, vu || st.ultimo, {fechaISO:fIni, esCompra:false, inicial:true, cantOriginal:n});
    });
  };
  sueros.forEach(m=>{
    if(!(m.fechaISO < hastaISO) || m.id===opts.excluirId) return;
    if(ini && m.fechaISO < fIni){
      if(m.tipo==='egreso' || m.tipo==='ajuste') (m.items||[]).forEach(it=>{ if(it.insumo){ const st = get(it.insumo); if(Number(it.valorUnit)) st.ultimo = Number(it.valorUnit); } });
      else (m.items||[]).forEach(it=> it.insumo && get(it.insumo));
      return;
    }
    if(ini) aplicarIni();
    if(ini && ajusteSuperado(m)) return;
    if(m.tipo==='egreso'){
      // Lo que realmente se pagó (con descuento) se reparte entre los insumos; las unidades sin cargo entran al stock al valor de la ampolla
      const subtotal = (m.items||[]).reduce((a,it)=> a + (Number(it.cant)||0)*(Number(it.valorUnit)||0), 0);
      const factor = subtotal > 0 && m.total!=null && !isNaN(Number(m.total)) ? Number(m.total)/subtotal : 1;
      (m.items||[]).forEach(it=>{
        if(!it.insumo) return;
        const vu = Number(it.valorUnit)||0, n = Number(it.cant)||0, sc = Number(it.sinCargo)||0;
        const s = get(it.insumo); if(vu) s.ultimo = vu;
        agregarLote(it.insumo, n + sc, vu, {fechaISO:m.fechaISO, compraId:m.id, proveedor:m.tercero||'', vence:it.vence||'', cantOriginal:n + sc, sinCargo:sc, inversion:n*vu*factor, esCompra:true});
      });
    } else if(m.tipo==='ajuste'){
      (m.items||[]).forEach(it=>{
        const k = it.insumo; if(!k) return;
        const s = get(k), vu = Number(it.valorUnit)||0, n = Number(it.cant)||0;
        if(vu){ s.ultimo = vu; s.lotes.forEach(l=> l.valorUnit = vu); }
        if(n > 0) agregarLote(k, n, vu || s.ultimo, {fechaISO:m.fechaISO, esCompra:false, cantOriginal:n});
        else if(n < 0) consumir(k, -n, null);
      });
    } else {
      const c = costos[m.id] = {total:0, unidades:0};
      consumosDeIngreso(m).forEach(x=>{
        if(!x.insumo || !x.cant) return;
        c.total += consumir(x.insumo, x.cant, m);
        c.unidades += x.cant;
      });
    }
  });
  if(ini && hastaISO > fIni) aplicarIni();
  const res = {inv, costos, consumir};
  if(usarCache) cacheSim.map.set(hastaISO, res);
  return res;
}
// Costo real de una aplicación (lote más viejo primero), ubicándola en su fecha
function costearFIFO(items, fechaISO, excluirId){
  const sim = simularLotes(diaSiguiente(fechaISO), {excluirId, sinCache:true});
  const comps = componentesVias();
  return items.map(it=>{
    const cant = Number(it.cant)||0;
    let costo = 0;
    if(esVias(it.insumo)) comps.forEach(c=> costo += sim.consumir(c, cant, null));
    else if(it.insumo) costo = sim.consumir(it.insumo, cant, null);
    return {...it, valorUnit: cant ? Math.round(costo/cant) : 0, subtotal: Math.round(costo)};
  });
}
function calcularStock(hastaISO){
  const {inv} = simularLotes(hastaISO);
  const filas = {};
  Object.entries(inv).forEach(([k, s])=>{
    const cant = s.lotes.reduce((a,l)=> a+l.cant, 0) - s.deficit;
    const valorUnit = s.lotes.length ? s.lotes[0].valorUnit : s.ultimo;
    const total = s.lotes.reduce((a,l)=> a+l.cant*l.valorUnit, 0) - s.deficit*s.ultimo;
    filas[k] = {insumo:k, cant, valorUnit, total, ultimo:s.ultimo, kit:esVias(k), lotes:s.lotes};
  });
  // Kit: valor unitario = suma de los componentes (si ya tienen precio)
  const kit = Object.keys(filas).find(esVias);
  if(kit){
    const comps = componentesVias();
    const suma = comps.reduce((a,c)=> a + ((filas[c]||{}).valorUnit||0), 0);
    const sumaUlt = comps.reduce((a,c)=> a + ((filas[c]||{}).ultimo||0), 0);
    if(suma > 0) filas[kit].valorUnit = suma;
    if(sumaUlt > 0) filas[kit].ultimo = sumaUlt;
  }
  return ordenarPorInsumo(Object.values(filas));
}
// Vencimientos: unidades que quedan de lotes que vencen dentro de 30 días (o ya vencidos)
function vencimientosProximos(){
  const hoy = hoyISO();
  const lim = new Date(hoy + 'T12:00:00'); lim.setDate(lim.getDate()+30);
  const limISO = lim.getFullYear()+'-'+String(lim.getMonth()+1).padStart(2,'0')+'-'+String(lim.getDate()).padStart(2,'0');
  const out = [];
  Object.entries(simularLotes('9999-12-31').inv).forEach(([k, s])=>{
    s.lotes.forEach(l=>{
      if(l.vence && l.cant > 0 && l.vence <= limISO){
        const dias = Math.round((new Date(l.vence+'T12:00:00') - new Date(hoy+'T12:00:00'))/86400000);
        out.push({insumo:k, vence:l.vence, cant:l.cant, dias});
      }
    });
  });
  return out.sort((a,b)=> a.vence < b.vence ? -1 : 1);
}

// Orden personalizado (Stock → Ordenar); los que no están en la lista van al final, alfabéticos
function ordenarPorInsumo(lista){
  const pos = {}; ordenInsumos.forEach((n,i)=> pos[n] = i);
  return lista.sort((a,b)=>{
    const pa = pos[a.insumo], pb = pos[b.insumo];
    if(pa!=null && pb!=null) return pa - pb;
    if(pa!=null) return -1;
    if(pb!=null) return 1;
    return a.insumo.localeCompare(b.insumo,'es');
  });
}
let suerosCriticos = {};   // sueros/_criticos → { "INSUMO": {min, max} }
let sCalcCompra = false;
const escAttr = v => String(v).replace(/"/g,'&quot;');
function renderStock(){
  const y = mesSueros.year, m = mesSueros.month;
  const ultimoDia = new Date(y, m, 0).getDate();
  const previo = sMesInicio() < STOCK_DESDE;
  document.getElementById('sStockCaption').innerHTML = (sEsMesActual()
    ? 'Stock actual'
    : `Stock al ${ultimoDia}/${m}/${y}`)
    + (previo ? ' <span class="s-stock-aviso">Stock contabilizado a partir del 1/10/2026</span>' : '');
  const q = document.getElementById('sfInsumoStock').value;
  const todos = previo ? insumosStock() : calcularStock(sMesFin());
  const btnOrd = document.getElementById('sBtnOrdenar');
  btnOrd.textContent = sOrdenando ? '✓ Listo' : '↕ Ordenar';
  btnOrd.classList.toggle('btn-primary', sOrdenando);
  const btnCalc = document.getElementById('sBtnCalcCompra');
  btnCalc.innerHTML = ico(sCalcCompra ? 'check' : 'calc') + ' Calcular compra';
  btnCalc.classList.toggle('btn-primary', sCalcCompra);
  // Columnas (la de "Faltan" solo con Calcular compra)
  const verCont = esFede();
  document.getElementById('sThCont').classList.toggle('col-hidden', !verCont);
  document.getElementById('sStockCols').innerHTML = `<col><col style="width:116px"><col style="width:124px"><col style="width:80px"><col style="width:84px">${verCont ? '<col style="width:104px">' : ''}${sCalcCompra ? '<col style="width:90px">' : ''}<col style="width:56px">`;
  document.getElementById('sThFaltan').classList.toggle('col-hidden', !sCalcCompra);
  // Filtro por proveedor: los insumos que alguna vez se le compraron (el kit, si le compraste algún componente)
  const selProv = document.getElementById('sStockProv');
  const provs = [...new Set(sueros.filter(x=> x.tipo==='egreso' && x.tercero).map(x=> x.tercero))].sort((a,b)=> a.localeCompare(b,'es'));
  const provActual = provs.includes(selProv.value) ? selProv.value : '';
  selProv.innerHTML = '<option value="">Todos los proveedores</option>' + provs.map(pv=> `<option value="${escAttr(pv)}">${pv}</option>`).join('');
  selProv.value = provActual;
  let delProv = null;
  if(provActual){
    delProv = new Set();
    sueros.filter(x=> x.tipo==='egreso' && x.tercero===provActual).forEach(x=> (x.items||[]).forEach(it=> it.insumo && delProv.add(it.insumo)));
    if(componentesVias().some(c=> delProv.has(c))) todos.filter(i=> esVias(i.insumo)).forEach(i=> delProv.add(i.insumo));
  }
  const lista = todos.filter(i=> (!q || contiene(i.insumo, q)) && (!delProv || delProv.has(i.insumo)));
  const body = document.getElementById('sStockBody');
  const foot = document.getElementById('sStockFoot');
  const nCols = 6 + (sCalcCompra ? 1 : 0) + (esFede() ? 1 : 0);
  const guion = '<span class="pend">—</span>';
  if(!lista.length){
    body.innerHTML = `<tr><td colspan="${nCols}" class="empty-state">${todos.length ? 'No hay insumos con ese nombre.' : 'Todavía no hay insumos. Cargá una compra (egreso) para empezar el stock.'}</td></tr>`;
    foot.innerHTML = '';
    return;
  }
  if(previo){
    body.innerHTML = lista.map(i=>`
    <tr>
      <td class="left">${i.insumo}</td>
      ${`<td>${guion}</td>`.repeat(nCols-2)}
      <td class="editcol"></td>
    </tr>`).join('');
    foot.innerHTML = '';
    return;
  }
  const venc = {};
  vencimientosProximos().forEach(v=> (venc[v.insumo] = venc[v.insumo] || []).push(v));
  const puedeEditar = esAdminSueros();
  const celdaCrit = (i, campo)=>{
    const v = (suerosCriticos[i.insumo]||{})[campo];
    if(puedeEditar) return `<td><input class="s-crit" data-k="${escAttr(i.insumo)}" data-campo="${campo}" inputmode="numeric" value="${v!=null && v!=='' ? v : ''}" placeholder="—"></td>`;
    return `<td>${v!=null && v!=='' ? Number(v).toLocaleString('es-AR') : guion}</td>`;
  };
  // Conteo manual (solo Fede): al lado muestra ✓ si coincide con el stock o ✗ si no
  const celdaCont = i=>{
    if(!esFede()) return '';
    const v = suerosConteo[i.insumo];
    const hay = v!=null && v!=='';
    const marca = !hay ? '' : (Number(v)===i.cant ? '<span class="s-cont-ok" title="Coincide">✓</span>' : `<span class="s-cont-mal" title="No coincide: el stock es ${i.cant.toLocaleString('es-AR')}">✗</span>`);
    return `<td class="s-cont-td"><input class="s-cont" data-k="${escAttr(i.insumo)}" inputmode="numeric" value="${hay ? v : ''}" placeholder="—">${marca || '<span class="s-cont-esp"></span>'}</td>`;
  };
  const faltanDe = i=>{
    const min = (suerosCriticos[i.insumo]||{}).min;   // Calcular compra: cuánto falta para llegar al mínimo crítico
    if(min==null || min==='') return null;
    return Math.max(0, Number(min) - i.cant);
  };
  const ordCell = i=> sOrdenando
    ? `<span class="s-ord"><button title="Subir" data-sube="${escAttr(i.insumo)}">▲</button><button title="Bajar" data-baja="${escAttr(i.insumo)}">▼</button></span>`
    : null;
  body.innerHTML = lista.map(i=>{
    if(i.kit) return `
    <tr>
      <td class="left" title="Suma de ${componentesVias().join(', ')}">${i.insumo}</td>
      <td>${i.valorUnit ? fmtPesos(i.valorUnit) : guion}</td>
      <td>${guion}</td><td>${guion}</td><td>${guion}</td>${esFede() ? `<td>${guion}</td>` : ''}${sCalcCompra ? `<td>${guion}</td>` : ''}
      <td class="editcol">${ordCell(i) || '<button class="editbtn" style="visibility:hidden" tabindex="-1">&#9998;</button>'}</td>
    </tr>`;
    const min = (suerosCriticos[i.insumo]||{}).min;
    const critico = min!=null && min!=='' && i.cant <= Number(min);
    const chips = (venc[i.insumo]||[]).map(v=> `<span class="venc-chip ${v.dias<0?'vencido':''}" title="${v.cant} u. de ese lote">${v.dias<0 ? 'Vencido' : 'Vence'} ${fechaLarga(v.vence)}</span>`).join('');
    const f = sCalcCompra ? faltanDe(i) : null;
    return `
    <tr class="${critico ? 's-critico' : ''}">
      <td class="left k-link" data-k="${escAttr(i.insumo)}" title="Ver movimientos desde el 1/10">${i.insumo}${chips}</td>
      <td>${i.valorUnit ? fmtPesos(i.valorUnit) : guion}</td>
      <td class="${i.total<0?'neg':''}">${fmtPesos(i.total)}</td>
      <td class="${i.cant<0?'neg':''}" style="font-weight:700;">${i.cant.toLocaleString('es-AR')}</td>
      ${celdaCrit(i,'min')}${celdaCont(i)}
      ${sCalcCompra ? `<td class="s-faltan">${f==null ? guion : (f>0 ? `<b>Faltan ${f.toLocaleString('es-AR')}</b>` : '<span class="ok">0</span>')}</td>` : ''}
      <td class="editcol">${ordCell(i) || `<button class="editbtn" title="Editar insumo" data-insumo="${escAttr(i.insumo)}">&#9998;</button>`}</td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.editbtn[data-insumo]').forEach(b=> b.onclick = ()=> abrirEdicionInsumo(b.dataset.insumo));
  body.querySelectorAll('[data-sube]').forEach(b=> b.onclick = ()=> moverInsumo(b.dataset.sube, -1));
  body.querySelectorAll('[data-baja]').forEach(b=> b.onclick = ()=> moverInsumo(b.dataset.baja, 1));
  body.querySelectorAll('.s-crit').forEach(inp=>{
    inp.addEventListener('input', ()=> inp.value = inp.value.replace(/\D/g,''));
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } });
    inp.addEventListener('blur', ()=> guardarCritico(inp.dataset.k, inp.dataset.campo, inp.value));
  });
  body.querySelectorAll('.s-cont').forEach(inp=>{
    inp.addEventListener('input', ()=> inp.value = inp.value.replace(/[^\d-]/g,''));
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){   // Enter pasa al siguiente para contar rápido
        e.preventDefault();
        const todos = [...body.querySelectorAll('.s-cont')], j = todos.indexOf(inp);
        sContSiguiente = todos[j+1] ? todos[j+1].dataset.k : null;
        inp.blur();
      }
    });
    inp.addEventListener('blur', ()=> guardarConteo(inp.dataset.k, inp.value));
  });
  if(sContSiguiente){ const sig = body.querySelector(`.s-cont[data-k="${CSS.escape(sContSiguiente)}"]`); sContSiguiente = null; if(sig){ sig.focus(); sig.select(); } }
  const sinKit = lista.filter(i=> !i.kit);
  const totVal = sinKit.reduce((a,i)=> a+i.total, 0);
  const totCant = sinKit.reduce((a,i)=> a+i.cant, 0);
  let totFaltan = 0, costoCompra = 0;
  if(sCalcCompra) sinKit.forEach(i=>{ const f = faltanDe(i); if(f){ totFaltan += f; costoCompra += f * (i.ultimo || i.valorUnit || 0); } });
  foot.innerHTML = `
    <tr>
      <td class="left">TOTALES</td>
      <td></td>
      <td>${fmtPesos(totVal)}</td>
      <td>${totCant.toLocaleString('es-AR')}</td>
      <td></td>
      ${esFede() ? '<td><button type="button" class="btn s-cont-limpiar" id="sContLimpiar" title="Borra toda la columna Cont">Limpiar</button></td>' : ''}
      ${sCalcCompra ? `<td title="Costo estimado al último precio: ${fmtPesos(costoCompra)}">${totFaltan.toLocaleString('es-AR')}</td>` : ''}
      <td></td>
    </tr>`;
  const bl = document.getElementById('sContLimpiar');
  if(bl) bl.onclick = async ()=>{
    if(!Object.keys(suerosConteo).length) return;
    if(!await ummConfirm('¿Limpiar toda la columna Cont?')) return;
    suerosConteo = {}; renderStock();
    try{ await db.collection('sueros').doc('_conteo').set({lista: {}}); }catch(e){ alert('No se pudo limpiar: ' + e.message); }
  };
  document.getElementById('sCalcInfo').classList.toggle('col-hidden', !sCalcCompra);
  document.getElementById('sCalcInfo').innerHTML = sCalcCompra
    ? `Para llegar al mín. crítico faltan <b>${totFaltan.toLocaleString('es-AR')}</b> unidades · costo estimado (al último precio de compra): <b>${fmtPesos(costoCompra)}</b>` : '';
}
let suerosConteo = {};       // sueros/_conteo → { "INSUMO": n } (conteo manual de Fede)
let sContSiguiente = null;
async function guardarConteo(insumo, valor){
  if(!esFede()) return;
  const v = valor==='' || valor==='-' ? null : Number(valor);
  const actual = suerosConteo[insumo];
  if((actual==null) && v==null){ if(sContSiguiente) renderStock(); return; }
  if(actual===v){ if(sContSiguiente) renderStock(); return; }
  const nuevo = {...suerosConteo};
  if(v==null) delete nuevo[insumo]; else nuevo[insumo] = v;
  suerosConteo = nuevo;
  renderStock();
  try{ await db.collection('sueros').doc('_conteo').set({lista: nuevo}); }
  catch(e){ alert("No se pudo guardar el conteo: " + e.message); }
}
async function guardarCritico(insumo, campo, valor){
  if(!esAdminSueros()) return;
  const v = valor==='' ? null : Number(valor);
  const actual = (suerosCriticos[insumo]||{})[campo];
  if((actual==null || actual==='') && v==null) return;
  if(actual===v) return;
  const nuevo = {...suerosCriticos, [insumo]: {...(suerosCriticos[insumo]||{}), [campo]: v}};
  suerosCriticos = nuevo;
  renderStock();
  try{ await db.collection('sueros').doc('_criticos').set({lista: nuevo}); }
  catch(e){ alert("No se pudo guardar: " + e.message); }
}
document.getElementById('sBtnCalcCompra').onclick = ()=>{ sCalcCompra = !sCalcCompra; renderStock(); };

/* ---- Ordenar insumos (se usa en Stock y en todos los desplegables de insumos) ---- */
let sOrdenando = false;
document.getElementById('sBtnOrdenar').onclick = ()=>{ sOrdenando = !sOrdenando; renderStock(); };
async function moverInsumo(nombre, dir){
  const nombres = insumosStock().map(i=> i.insumo);
  const i = nombres.indexOf(nombre), j = i + dir;
  if(i<0 || j<0 || j>=nombres.length) return;
  [nombres[i], nombres[j]] = [nombres[j], nombres[i]];
  ordenInsumos = nombres;
  renderStock();
  try{ await db.collection('sueros').doc('_orden').set({insumos: nombres}); }
  catch(e){ alert("No se pudo guardar el orden: " + e.message); }
}

/* ---- Editar un insumo del stock ---- */
const overlayInsumo = document.getElementById('overlayInsumo');
let eiOriginal = null;
function abrirEdicionInsumo(nombre){
  if(!esAdminSueros()) return;
  const actual = insumosStock().find(i=> i.insumo===nombre);
  if(!actual) return;
  eiOriginal = actual;
  document.getElementById('eiNombre').value = actual.insumo;
  document.getElementById('eiValor').value = actual.valorUnit ? actual.valorUnit.toLocaleString('es-AR') : '';
  document.getElementById('eiStock').value = actual.cant.toLocaleString('es-AR');
  document.getElementById('eiSub').textContent = sEsMesActual()
    ? 'Los cambios de valor y stock quedan registrados como un ajuste con fecha de hoy.'
    : 'Estos son los valores de HOY (no los del mes que estás mirando). Los cambios quedan registrados como un ajuste con fecha de hoy.';
  overlayInsumo.classList.add('show');
}
['eiValor','eiStock'].forEach(id=>{
  const inp = document.getElementById(id);
  inp.addEventListener('input', ()=> formatearInputMonto(inp));
});
const cerrarInsumo = ()=> overlayInsumo.classList.remove('show');
document.getElementById('closeInsumo').onclick = cerrarInsumo;
document.getElementById('cancelInsumo').onclick = cerrarInsumo;
document.getElementById('guardarInsumo').onclick = async ()=>{
  if(!esAdminSueros() || !eiOriginal) return;
  const nuevoNombre = mayus(document.getElementById('eiNombre').value.trim());
  const nuevoValor = parseMonto(document.getElementById('eiValor').value);
  const nuevoStock = parseMonto(document.getElementById('eiStock').value);
  if(!nuevoNombre){ alert("El nombre no puede quedar vacío."); return; }
  const renombrar = nuevoNombre !== eiOriginal.insumo;
  if(renombrar && insumosConocidos().includes(nuevoNombre)){
    alert(`Ya existe un insumo llamado "${nuevoNombre}".`); return;
  }
  const deltaStock = nuevoStock - eiOriginal.cant;
  const cambiaValor = nuevoValor && nuevoValor !== eiOriginal.valorUnit;
  if(!renombrar && !deltaStock && !cambiaValor){ cerrarInsumo(); return; }

  const btn = document.getElementById('guardarInsumo');
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    // 1) Renombrar en todas las compras, aplicaciones y ajustes donde aparece
    if(renombrar){
      const afectados = sueros.filter(m=> (m.items||[]).some(it=> it.insumo===eiOriginal.insumo));
      for(let i=0; i<afectados.length; i+=400){
        const lote = db.batch();
        afectados.slice(i, i+400).forEach(m=>{
          const items = m.items.map(it=> it.insumo===eiOriginal.insumo ? {...it, insumo: nuevoNombre} : it);
          lote.update(db.collection('sueros').doc(m.id), {items});
        });
        await lote.commit();
      }
    }
    if(renombrar && ordenInsumos.includes(eiOriginal.insumo)){
      await db.collection('sueros').doc('_orden').set({insumos: ordenInsumos.map(n=> n===eiOriginal.insumo ? nuevoNombre : n)});
    }
    // 2) Ajuste de stock y/o valor unitario (queda registrado con fecha de hoy)
    if(deltaStock || cambiaValor){
      await db.collection('sueros').add({
        tipo: 'ajuste', fechaISO: hoyISO(), fechaDisplay: isoToDisplay(hoyISO()),
        tercero: '', detalle: 'AJUSTE DE STOCK', total: 0,
        items: [{ insumo: nuevoNombre, cant: deltaStock, valorUnit: cambiaValor ? nuevoValor : 0, subtotal: 0 }],
        creadoPor: currentUser.nombre, creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    mesSueros = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };   // el ajuste es de hoy: se muestra el stock actual
    cerrarInsumo(); renderSueros();
  }catch(e){
    alert("No se pudo guardar: " + e.message);
  }
  btn.disabled = false; btn.textContent = "Guardar";
};

/* ---- Pestaña 3: Informes (resumen mensual, por paciente, por producto, por proveedor) ---- */
// Rango: por defecto el mes elegido; se puede cambiar con Desde / Hasta
let sResDesde = null, sResHasta = null, sResMesKey = null;
let sInfTipo = 'mensual';
function ultimoDiaMesISO(){
  const y = mesSueros.year, m = mesSueros.month;
  return `${y}-${String(m).padStart(2,'0')}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`;
}
function fechaLarga(iso){ const [y,m,d] = iso.split('-'); return `${Number(d)}/${Number(m)}/${y}`; }
function sResAlMes(){ sResDesde = sMesInicio(); sResHasta = sEsMesActual() ? hoyISO() : ultimoDiaMesISO(); }
// Al entrar a Informes: siempre el mes en curso, del 1 al día de hoy
function sResAlMesActual(){ mesSueros = {year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1}; sResMesKey = sMesInicio(); sResAlMes(); }
const INF_PLACEHOLDER = { paciente:'Elegí un paciente…', producto:'Elegí un producto…', proveedor:'Elegí un proveedor…', recupero:'Todas las compras (o elegí una)…' };
function opcionesInforme(){
  const set = new Set();
  if(sInfTipo==='paciente') aplicacionesSueros().forEach(m=> m.tercero && set.add(m.tercero));
  if(sInfTipo==='producto'){
    sueros.forEach(m=> (m.items||[]).forEach(it=> it.insumo && set.add(it.insumo)));
  }
  if(sInfTipo==='proveedor') sueros.filter(m=> m.tipo==='egreso').forEach(m=> m.tercero && set.add(m.tercero));
  if(sInfTipo==='recupero') return etiquetasCompras().map(c=> c.etiqueta);
  return [...set].sort((a,b)=> a.localeCompare(b,'es'));
}
function seleccionInforme(){
  const v = mayus(document.getElementById('infSel').value.trim());
  return opcionesInforme().find(o=> mayus(o)===v) || null;
}
const infTipoSel = document.getElementById('infTipo');
const infSel = document.getElementById('infSel');
infTipoSel.onchange = ()=>{
  sInfTipo = infTipoSel.value;
  infSel.value = '';
  renderResumenSueros();
  if(sInfTipo!=='mensual') infSel.focus();
};
attachAutocomplete(infSel, opcionesInforme, ()=> renderResumenSueros());
infSel.addEventListener('input', ()=>{ if(seleccionInforme() || !infSel.value.trim()) renderResumenSueros(); });
document.getElementById('sResDesde').onchange = e=>{ if(e.target.value){ sResDesde = e.target.value; renderResumenSueros(); } };
document.getElementById('sResHasta').onchange = e=>{ if(e.target.value){ sResHasta = e.target.value; renderResumenSueros(); } };
document.getElementById('sResMes').onclick = ()=>{ sResAlMes(); renderResumenSueros(); };
document.getElementById('sResTodo').onclick = ()=>{
  const fechas = sueros.filter(m=> m.tipo!=='ajuste' && m.fechaISO).map(m=> m.fechaISO).sort();
  sResDesde = fechas[0] || sMesInicio();
  sResHasta = hoyISO() > (fechas[fechas.length-1]||'') ? hoyISO() : fechas[fechas.length-1];
  renderResumenSueros();
};

function renderResumenSueros(){
  const key = sMesInicio();
  if(sResMesKey !== key || !sResDesde || !sResHasta){ sResMesKey = key; sResAlMes(); }
  if(suerosLimitado() && sInfTipo==='mensual') sInfTipo = 'paciente';
  if(sResDesde > sResHasta){ const t = sResDesde; sResDesde = sResHasta; sResHasta = t; }
  const esMesCompleto = sResDesde===sMesInicio() && (sResHasta===ultimoDiaMesISO() || (sEsMesActual() && sResHasta===hoyISO()));
  document.getElementById('sResDesde').value = sResDesde;
  document.getElementById('sResHasta').value = sResHasta;
  document.getElementById('sResMes').classList.toggle('col-hidden', esMesCompleto);
  infTipoSel.value = sInfTipo;
  document.getElementById('infSelWrap').classList.toggle('col-hidden', sInfTipo==='mensual');
  document.getElementById('infVolver').classList.toggle('col-hidden', !(sInfTipo==='recupero' && infSel.value.trim()));
  infSel.placeholder = INF_PLACEHOLDER[sInfTipo] || '';
  const rangoTxt = sResDesde===sResHasta ? `del ${fechaLarga(sResDesde)}` : `del ${fechaLarga(sResDesde)} al ${fechaLarga(sResHasta)}`;
  const enRango = m=> m.tipo!=='ajuste' && m.fechaISO>=sResDesde && m.fechaISO<=sResHasta;
  const cont = document.getElementById('sResumen');

  if(sInfTipo==='mensual'){
    const titulo = esMesCompleto ? `Resumen de ${MESES[mesSueros.month-1]} ${mesSueros.year}` : `Resumen ${rangoTxt}`;
    const delMes = sueros.filter(enRango);
    const ingresos = delMes.filter(m=> m.tipo!=='egreso');
    const compras = delMes.filter(m=> m.tipo==='egreso');
    const suma = campo => {
      let hay = false, tot = 0;
      ingresos.forEach(m=>{ const v = calcularRepartoSuero(m)[campo]; if(v!=null){ hay = true; tot += v; } });
      return hay ? tot : null;
    };
    const total = ingresos.reduce((a,m)=> a+(Number(m.total)||0), 0);
    const kpi = (lbl, v, cls='') => `<div class="s-kpi ${cls}"><div class="lbl">${lbl}</div><div class="val" ${v!=null && v<0 ? 'style="color:#a13a3a;"' : ''}>${v==null ? '<span class="pend">—</span>' : fmtPesos(v)}</div></div>`;
    cont.innerHTML = `
      <h3>${titulo}</h3>
      <div class="sub">Suma de los ingresos del período.</div>
      <div class="s-kpis">
        ${kpi('Total', total, 'principal')}
        ${kpi('Insumos', suma('insumos'))}
        ${kpi('Sabrina', suma('sabrina'))}
        ${kpi('Gabriela', suma('gabriela'))}
        ${kpi('Ummana', suma('ummana'))}
      </div>
      <div class="s-kpis-sec">
        <div class="s-kpi"><div class="lbl">Aplicaciones</div><div class="val">${ingresos.length}</div></div>
        <div class="s-kpi"><div class="lbl">Pagos pendientes</div><div class="val" style="${ingresos.some(m=>m.pagoPendiente)?'color:#b26a00;':''}">${ingresos.filter(m=>m.pagoPendiente).length}</div></div>
        <div class="s-kpi"><div class="lbl">Compras de insumos</div><div class="val" style="color:#a13a3a;">${fmtPesos(compras.reduce((a,m)=> a+(Number(m.total)||0), 0))}</div></div>
      </div>`;
    return;
  }

  if(sInfTipo==='recupero'){
    if(suerosLimitado()){ sInfTipo = 'paciente'; return renderResumenSueros(); }
    cont.innerHTML = htmlRecupero(seleccionInforme(), sResDesde, sResHasta, rangoTxt);
    return;
  }
  const sel = seleccionInforme();
  if(!sel){
    cont.innerHTML = `<div class="empty-state">${INF_PLACEHOLDER[sInfTipo].replace('…','')} para ver el informe.</div>`;
    return;
  }
  const num = numerosDeAplicacion();
  const apps = aplicacionesSueros().filter(enRango);
  const neg = v => v<0 ? 'neg' : '';
  const vacio = cols => `<tr><td colspan="${cols}" class="empty-state">No hay datos en estas fechas.</td></tr>`;
  const cant = n => Number(n).toLocaleString('es-AR');

  if(sInfTipo==='paciente' && suerosLimitado()){
    const filas = apps.filter(m=> m.tercero===sel);
    cont.innerHTML = `
      <h3>${sel}</h3>
      <div class="sub">Aplicaciones ${rangoTxt} · ${filas.length} ${filas.length===1?'aplicación':'aplicaciones'}</div>
      <div class="inf-wrap" style="max-width:900px;"><table class="inf-tabla">
        <colgroup><col style="width:96px"><col style="width:60px"><col></colgroup>
        <thead><tr><th>Fecha</th><th>N°</th><th class="left">Insumos aplicados</th></tr></thead>
        <tbody>${filas.length ? filas.map(m=> `<tr>
          <td>${fechaLarga(m.fechaISO)}</td><td>${num[m.id]}</td>
          <td class="left">${insumosHTML(m) || '<span class="pend">—</span>'}</td></tr>`).join('') : vacio(3)}</tbody>
      </table></div>`;
    return;
  }
  if(sInfTipo==='paciente'){
    const filas = apps.filter(m=> m.tercero===sel);
    const t = {total:0, insumos:0, sabrina:0, gabriela:0, ummana:0};
    filas.forEach(m=>{
      const r = calcularRepartoSuero(m);
      if(!m.pagoPendiente) t.total += Number(m.total)||0;
      ['insumos','sabrina','gabriela','ummana'].forEach(k=>{ if(r[k]!=null) t[k] += Number(r[k])||0; });
    });
    const pend = filas.filter(m=> m.pagoPendiente).length;
    cont.innerHTML = `
      <h3>${sel}</h3>
      <div class="sub">Aplicaciones ${rangoTxt} · ${filas.length} ${filas.length===1?'aplicación':'aplicaciones'}${pend ? ` · <span style="color:#b26a00;">${pend} con pago pendiente (no suman)</span>` : ''}</div>
      <div class="inf-wrap"><table class="inf-tabla">
        <colgroup><col style="width:86px"><col style="width:52px"><col><col style="width:104px"><col style="width:104px"><col style="width:104px"><col style="width:104px"><col style="width:104px"></colgroup>
        <thead><tr><th>Fecha</th><th>N°</th><th class="left">Insumos aplicados</th><th>Total</th><th>Insumos</th><th>Sabrina</th><th>Gabriela</th><th>Ummana</th></tr></thead>
        <tbody>${filas.length ? filas.map(m=>{ const r = calcularRepartoSuero(m); return `<tr>
          <td>${fechaLarga(m.fechaISO)}</td><td>${num[m.id]}</td>
          <td class="left">${insumosHTML(m) || '<span class="pend">—</span>'}</td>
          <td class="monto">${m.pagoPendiente ? '<span style="color:#b26a00;">FALTA</span>' : fmtPesos(Number(m.total)||0)}</td>
          <td class="monto">${celdaReparto(r.insumos)}</td><td class="monto">${celdaReparto(r.sabrina)}</td>
          <td class="monto">${celdaReparto(r.gabriela)}</td><td class="monto ${r.ummana!=null ? neg(r.ummana) : ''}">${celdaReparto(r.ummana)}</td>
        </tr>`; }).join('') : vacio(8)}</tbody>
        ${filas.length ? `<tfoot><tr><td colspan="3" class="left">TOTALES</td>
          <td class="monto ${neg(t.total)}">${fmtPesos(t.total)}</td><td class="monto">${fmtPesos(t.insumos)}</td><td class="monto">${fmtPesos(t.sabrina)}</td>
          <td class="monto">${fmtPesos(t.gabriela)}</td><td class="monto ${neg(t.ummana)}">${fmtPesos(t.ummana)}</td></tr></tfoot>` : ''}
      </table></div>`;
    return;
  }

  if(sInfTipo==='producto'){
    const fuente = m=> esVias(sel) ? (m.items||[]).map(it=> ({insumo:it.insumo, cant:Number(it.cant)||0})) : consumosDeIngreso(m);
    const filas = apps.map(m=> ({m, cant: fuente(m).filter(c=> c.insumo===sel).reduce((a,c)=> a+c.cant, 0)}))
      .filter(f=> f.cant>0);
    const tot = filas.reduce((a,f)=> a+f.cant, 0);
    cont.innerHTML = `
      <h3>${sel}</h3>
      <div class="sub">Aplicaciones ${rangoTxt} · ${filas.length} ${filas.length===1?'aplicación':'aplicaciones'}</div>
      <div class="inf-wrap" style="max-width:720px;"><table class="inf-tabla">
        <colgroup><col style="width:96px"><col style="width:60px"><col><col style="width:200px"></colgroup>
        <thead><tr><th>Fecha</th><th>N°</th><th class="left">Paciente</th><th>Cantidad</th></tr></thead>
        <tbody>${filas.length ? filas.map(f=> `<tr>
          <td>${fechaLarga(f.m.fechaISO)}</td><td>${num[f.m.id]}</td><td class="left">${f.m.tercero||''}</td>
          <td><b>${sel} x${cant(f.cant)}</b></td></tr>`).join('') : vacio(4)}</tbody>
        ${filas.length ? `<tfoot><tr><td colspan="3" class="left">TOTALES</td><td>${sel} x${cant(tot)}</td></tr></tfoot>` : ''}
      </table></div>`;
    return;
  }

  if(sInfTipo==='proveedor'){
    // Insumos de este proveedor: los que alguna vez se le compraron
    const delProv = new Set();
    sueros.filter(m=> m.tipo==='egreso' && m.tercero===sel).forEach(m=> (m.items||[]).forEach(it=> it.insumo && delProv.add(it.insumo)));
    const uso = {};
    const preciosDia = {};
    const precioAl = (insumo, fechaISO)=>{
      if(!preciosDia[fechaISO]){
        const d = new Date(fechaISO + 'T12:00:00'); d.setDate(d.getDate()+1);
        const sig = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        preciosDia[fechaISO] = {};
        calcularStock(sig).forEach(i=> preciosDia[fechaISO][i.insumo] = i.valorUnit);
      }
      return preciosDia[fechaISO][insumo] || 0;
    };
    const sumar = (insumo, c, costo)=>{
      uso[insumo] = uso[insumo] || {cant:0, costo:0};
      uso[insumo].cant += c; uso[insumo].costo += costo;
    };
    apps.forEach(m=> (m.items||[]).forEach(it=>{
      const c = Number(it.cant)||0;
      if(esVias(it.insumo) && m.fechaISO >= STOCK_DESDE){
        componentesVias().forEach(comp=>{ if(delProv.has(comp)) sumar(comp, c, c*precioAl(comp, m.fechaISO)); });
        return;
      }
      if(!delProv.has(it.insumo)) return;
      sumar(it.insumo, c, it.subtotal!=null ? Number(it.subtotal)||0 : c*(Number(it.valorUnit)||0));
    }));
    const filas = Object.entries(uso).filter(([,v])=> v.cant>0).sort((a,b)=> a[0].localeCompare(b[0],'es'));
    const tCant = filas.reduce((a,[,v])=> a+v.cant, 0), tCosto = filas.reduce((a,[,v])=> a+v.costo, 0);
    cont.innerHTML = `
      <h3>${sel}</h3>
      <div class="sub">Insumos de este proveedor usados en las aplicaciones ${rangoTxt}. El costo es el valor de cada insumo al día de la aplicación.</div>
      <div class="inf-wrap" style="max-width:640px;"><table class="inf-tabla">
        <colgroup><col><col style="width:120px"><col style="width:150px"></colgroup>
        <thead><tr><th class="left">Insumo</th><th>Cantidad usada</th><th>Costo total</th></tr></thead>
        <tbody>${filas.length ? filas.map(([ins,v])=> `<tr>
          <td class="left">${ins}</td><td>${cant(v.cant)}</td><td class="monto">${fmtPesos(v.costo)}</td></tr>`).join('') : vacio(3)}</tbody>
        ${filas.length ? `<tfoot><tr><td class="left">TOTALES</td><td>${cant(tCant)}</td><td class="monto">${fmtPesos(tCosto)}</td></tr></tfoot>` : ''}
      </table></div>`;
  }
}

/* ---- Valores fijos (Sabrina, descuento y % de Gabriela) ---- */
const overlaySueroCfg = document.getElementById('overlaySueroCfg');
document.getElementById('sBtnCfg').onclick = ()=>{
  if(!esAdminSueros()) return;
  document.getElementById('cfgSabrina').value = Number(suerosCfg.sabrina).toLocaleString('es-AR');
  document.getElementById('cfgFijoGabriela').value = Number(suerosCfg.fijoGabriela).toLocaleString('es-AR');
  document.getElementById('cfgPctGabriela').value = suerosCfg.pctGabriela;
  overlaySueroCfg.classList.add('show');
};
['cfgSabrina','cfgFijoGabriela'].forEach(id=>{
  const inp = document.getElementById(id);
  inp.addEventListener('input', ()=> formatearInputMonto(inp));
});
const cerrarCfg = ()=> overlaySueroCfg.classList.remove('show');
document.getElementById('closeSueroCfg').onclick = cerrarCfg;
document.getElementById('cancelSueroCfg').onclick = cerrarCfg;
document.getElementById('guardarSueroCfg').onclick = async ()=>{
  if(!esAdminSueros()) return;
  const pct = Number(String(document.getElementById('cfgPctGabriela').value).replace(',','.'));
  if(isNaN(pct) || pct<0 || pct>100){ alert("El porcentaje tiene que estar entre 0 y 100."); return; }
  const datos = {
    sabrina: parseMonto(document.getElementById('cfgSabrina').value),
    fijoGabriela: parseMonto(document.getElementById('cfgFijoGabriela').value),
    pctGabriela: pct,
  };
  try{
    await db.collection('sueros').doc('_config').set(datos);
    suerosCfg = {...SUEROS_CFG_DEFAULT, ...datos};
    cerrarCfg();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
};

/* ---- Excepciones ---- */
const overlayExcep = document.getElementById('overlayExcep');
attachAutocomplete(document.getElementById('exPaciente'), ()=> pacienteRegistry);
document.getElementById('sBtnExcep').onclick = ()=>{ if(!esAdminSueros()) return; renderExcepciones(); overlayExcep.classList.add('show'); };
const cerrarExcep = ()=> overlayExcep.classList.remove('show');
document.getElementById('closeExcep').onclick = cerrarExcep;
document.getElementById('cerrarExcep').onclick = cerrarExcep;
async function guardarExcepciones(lista){
  suerosExcepciones = lista;
  renderExcepciones();
  try{ await db.collection('sueros').doc('_excepciones').set({lista}); }
  catch(e){ alert("No se pudo guardar: " + e.message); }
}
function renderExcepciones(){
  const cont = document.getElementById('exLista');
  const nombres = Object.keys(suerosExcepciones).sort((a,b)=> a.localeCompare(b,'es'));
  if(!nombres.length){ cont.innerHTML = '<div class="empty-state">Todavía no hay excepciones.</div>'; return; }
  cont.innerHTML = nombres.map(n=>{
    const e = suerosExcepciones[n], k = n.replace(/"/g,'&quot;');
    return `<div class="ex-row">
      <span class="ex-nom">${n}</span>
      <label class="ex-chk"><input type="checkbox" data-n="${k}" data-c="sabrina0" ${e.sabrina0?'checked':''}> Sabrina $0</label>
      <label class="ex-chk"><input type="checkbox" data-n="${k}" data-c="gabriela0" ${e.gabriela0?'checked':''}> Gabriela $0</label>
      <button class="btn-quitar" data-quitar="${k}" title="Quitar">✕</button>
    </div>`;
  }).join('');
  cont.querySelectorAll('input[type=checkbox]').forEach(ch=> ch.onchange = ()=>{
    const lista = JSON.parse(JSON.stringify(suerosExcepciones));
    lista[ch.dataset.n][ch.dataset.c] = ch.checked;
    if(!lista[ch.dataset.n].sabrina0 && !lista[ch.dataset.n].gabriela0) delete lista[ch.dataset.n];
    guardarExcepciones(lista);
  });
  cont.querySelectorAll('[data-quitar]').forEach(b=> b.onclick = ()=>{
    const lista = {...suerosExcepciones}; delete lista[b.dataset.quitar]; guardarExcepciones(lista);
  });
}
document.getElementById('exAgregar').onclick = ()=>{
  const nombre = mayus(document.getElementById('exPaciente').value.trim());
  const sab = document.getElementById('exSab').checked, gab = document.getElementById('exGab').checked;
  if(!pacienteRegistry.some(p=> mayus(p)===nombre)){ alert("Elegí un paciente de la lista."); return; }
  if(!sab && !gab){ alert("Marcá Sabrina, Gabriela o las dos."); return; }
  guardarExcepciones({...suerosExcepciones, [nombre]: {sabrina0: sab, gabriela0: gab}});
  document.getElementById('exPaciente').value = '';
};

/* ---- + Nuevo mov. (modal) ---- */
const overlaySuero = document.getElementById('overlaySuero');
const sTercero = document.getElementById('sTercero');
const sTotalIngreso = document.getElementById('sTotalIngreso');
const sSabrina = document.getElementById('sSabrina');
const sGabriela = document.getElementById('sGabriela');
let sEditId = null;
let sTipo = 'ingreso';
let sGabrielaManual = false;

function conceptosSueroterapia(){
  const set = new Set();
  Object.keys(CONCEPTOS).filter(k=> normBusqueda(k).includes('suero'))
    .forEach(k=> CONCEPTOS[k].forEach(c=> set.add(c.concepto)));
  return [...set].sort((a,b)=> a.localeCompare(b,'es'));
}
// Insumos de la planilla Stock (nombre + valor unitario de la última compra)
function insumosStock(){
  return calcularStock('9999-12-31');
}
function insumosConocidos(){ return insumosStock().map(i=> i.insumo); }
// Precio vigente a la fecha de la ficha: el de la última compra/ajuste hasta ese día inclusive
function hastaFechaFicha(){
  const f = document.getElementById('sFecha').value || hoyISO();
  const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function precioStock(nombre){
  const f = document.getElementById('sFecha').value || hoyISO();
  const i = calcularStock(hastaFechaFicha()).find(x=> x.insumo===nombre)
         || insumosStock().find(x=> x.insumo===nombre);
  if(!i) return 0;
  return f >= STOCK_DESDE ? i.valorUnit : (i.ultimo || i.valorUnit);
}
const etiquetaInsumo = nombre => {
  const i = { valorUnit: precioStock(nombre) };
  return i && i.valorUnit
    ? `${nombre} <span style="float:right;color:var(--muted);font-weight:600;">${fmtPesos(i.valorUnit)}</span>`
    : nombre;
};
attachAutocomplete(sTercero, ()=> sTipo==='ingreso' ? pacienteRegistry : proveedoresRegistry);
sTercero.addEventListener('change', ()=> aplicarExcepcionesFicha());
sTercero.addEventListener('blur', ()=> setTimeout(aplicarExcepcionesFicha, 150));
sTotalIngreso.addEventListener('input', ()=>{ formatearInputMonto(sTotalIngreso); sRecalcular(); });
sSabrina.addEventListener('input', ()=>{ formatearInputMonto(sSabrina); sRecalcular(); });
sGabriela.addEventListener('input', ()=>{ formatearInputMonto(sGabriela); sGabrielaManual = true; sRecalcular(); });
document.getElementById('sGabrielaAuto').onclick = ()=>{ sGabrielaManual = false; sRecalcular(); };
document.getElementById('sFecha').addEventListener('change', ()=> sRecalcular());

function setTipoSuero(t, limpiar){
  sTipo = t;
  document.querySelectorAll('#sTipo button').forEach(b=> b.classList.toggle('active', b.dataset.tipo===t));
  document.getElementById('sTerceroLabel').textContent = t==='ingreso' ? 'Paciente' : 'Proveedor';
  document.getElementById('sBloqueIngreso').classList.toggle('col-hidden', t!=='ingreso');
  document.getElementById('sBloqueEgreso').classList.toggle('col-hidden', t!=='egreso');
  if(limpiar) sTercero.value = '';
  if(t==='egreso' && !document.querySelector('#sItems .s-item')) sAgregarItem(null, 'sItems');
  if(t==='ingreso' && !document.querySelector('#sItemsIng .s-item')){
    const v = insumoVias();
    if(v) sAgregarItem({insumo: v, cant: 1, valorUnit: precioStock(v)}, 'sItemsIng');
    sAgregarItem(null, 'sItemsIng');
  }
  sRecalcular();
}
document.querySelectorAll('#sTipo button').forEach(b=>{
  b.onclick = ()=>{ if(b.dataset.tipo!==sTipo) setTipoSuero(b.dataset.tipo, true); };
});

// Fila de insumo (sirve para compras "sItems" y para insumos usados en una aplicación "sItemsIng")
// Pasa al próximo insumo; si era el último, agrega una fila vacía (las vacías no se guardan)
function siguienteInsumo(row, contId, sel, agregar){
  const filas = [...document.getElementById(contId).children];
  const i = filas.indexOf(row);
  if(i === filas.length - 1) agregar();
  const next = document.getElementById(contId).children[i+1];
  const inp = next && next.querySelector(sel);
  if(inp) inp.focus();
}
// Insumos sin stock suficiente para una aplicación (al editar, se devuelve lo que ya usaba)
function insumosSinStock(items, editId, fechaISO){
  fechaISO = fechaISO || hoyISO();
  if(fechaISO < STOCK_DESDE) return [];   // antes del 1/10/2026 el stock no se controla
  const disp = {};
  insumosStock().forEach(i=> disp[i.insumo] = i.cant);
  const prev = editId ? sueros.find(x=> x.id===editId) : null;
  if(prev && prev.tipo!=='egreso') consumosDeIngreso(prev).forEach(c=> disp[c.insumo] = (disp[c.insumo]||0) + c.cant);
  const pedido = {};
  expandirKit(items, fechaISO).forEach(c=> pedido[c.insumo] = (pedido[c.insumo]||0) + c.cant);
  return Object.keys(pedido).filter(k=> pedido[k] > (disp[k]||0)).map(k=> ({insumo:k, quedan: Math.max(0, disp[k]||0)}));
}
function avisoSinStock(faltan){
  alert(faltan.map(f=> f.quedan > 0 ? `No hay stock suficiente de ${f.insumo} (quedan ${f.quedan}).` : `No hay stock de ${f.insumo}.`).join('\n'));
}
// "VIAS Y OTROS INSUMOS" va precargado (cantidad 1) en cada aplicación nueva
function insumoVias(){ return insumosConocidos().find(n=> normBusqueda(n).startsWith('vias y otros')) || null; }
function sAgregarItem(it, contId){
  const row = document.createElement('div');
  const esCompra = contId==='sItems';
  row.className = 's-item' + (esCompra ? ' compra' : '');
  row.innerHTML = `
    <div class="ac-wrap"><input type="text" class="si-insumo" placeholder="Insumo…" autocomplete="off"></div>
    <input type="text" class="si-cant" inputmode="numeric" placeholder="0">
    ${esCompra ? '<input type="text" class="si-sc" inputmode="numeric" placeholder="0" title="Unidades sin cargo"><input type="date" class="si-vence" title="Vencimiento (opcional)">' : ''}
    <input type="text" class="si-vu" inputmode="numeric" placeholder="$0">
    <div class="s-sub">$0</div>
    <button type="button" class="btn-quitar" title="Quitar">✕</button>`;
  document.getElementById(contId).appendChild(row);
  const inIns = row.querySelector('.si-insumo'), inCant = row.querySelector('.si-cant'), inVu = row.querySelector('.si-vu');
  if(contId==='sItems') inIns.setAttribute('data-ac-libre','');   // compras: se pueden escribir insumos nuevos
  if(it){
    inIns.value = it.insumo||'';
    inCant.value = it.cant ? Number(it.cant).toLocaleString('es-AR') : '';
    inVu.value = it.valorUnit ? Number(it.valorUnit).toLocaleString('es-AR') : '';
    if(esCompra && it.vence) row.querySelector('.si-vence').value = it.vence;
    if(esCompra && it.sinCargo) row.querySelector('.si-sc').value = Number(it.sinCargo).toLocaleString('es-AR');
  }
  attachAutocomplete(inIns, insumosConocidos, (nombre)=>{
    const p = precioStock(nombre);
    if(p && (contId==='sItemsIng' || !inVu.value)) inVu.value = p.toLocaleString('es-AR');
    if(contId==='sItemsIng' && !inCant.value) inCant.value = '1';
    sRecalcular();
    if(contId==='sItemsIng') siguienteInsumo(row, 'sItemsIng', '.si-insumo', ()=> sAgregarItem(null, 'sItemsIng'));
    else { inCant.focus(); inCant.select(); }
  }, etiquetaInsumo);
  [inCant, inVu].forEach(inp=> inp.addEventListener('input', ()=>{ formatearInputMonto(inp); sRecalcular(); }));
  if(esCompra) row.querySelector('.si-sc').addEventListener('input', e=> formatearInputMonto(e.target));
  row.querySelector('.btn-quitar').onclick = ()=>{ row.remove(); sRecalcular(); };
  sRecalcular();
}
document.getElementById('sAddItem').onclick = ()=> sAgregarItem(null, 'sItems');
document.getElementById('sAddItemIng').onclick = ()=> sAgregarItem(null, 'sItemsIng');

function sLeerItems(contId){
  return [...document.querySelectorAll(`#${contId} .s-item`)].map(r=>{
    const cant = parseMonto(r.querySelector('.si-cant').value);
    const valorUnit = parseMonto(r.querySelector('.si-vu').value);
    const it = { insumo: mayus(r.querySelector('.si-insumo').value.trim()), cant, valorUnit, subtotal: cant*valorUnit };
    const ve = r.querySelector('.si-vence');
    if(ve) it.vence = ve.value || '';
    const sc = r.querySelector('.si-sc');
    if(sc) it.sinCargo = parseMonto(sc.value);
    return it;
  });
}
function sTotalItems(contId){
  let tot = 0;
  document.querySelectorAll(`#${contId} .s-item`).forEach(r=>{
    const sub = parseMonto(r.querySelector('.si-cant').value) * parseMonto(r.querySelector('.si-vu').value);
    r.querySelector('.s-sub').textContent = fmtPesos(sub);
    tot += sub;
  });
  return tot;
}
function sCosteoAutomatico(){
  // Aplicaciones desde el 1/10/2026: el valor unitario sale solo (primero las unidades más viejas)
  const fifo = sTipo==='ingreso' && (document.getElementById('sFecha').value || hoyISO()) >= STOCK_DESDE;
  const filas = [...document.querySelectorAll('#sItemsIng .s-item')];
  filas.forEach(r=>{ const vu = r.querySelector('.si-vu'); vu.readOnly = fifo; vu.title = fifo ? 'Costo automático: se usan primero las unidades más viejas' : ''; vu.classList.toggle('vu-auto', fifo); });
  if(!fifo) return;
  const conocidos = new Set(insumosConocidos());
  const items = filas.map(r=> ({insumo: mayus(r.querySelector('.si-insumo').value.trim()), cant: parseMonto(r.querySelector('.si-cant').value)}));
  const costeados = costearFIFO(items.map(it=> conocidos.has(it.insumo) ? it : {insumo:'', cant:0}), document.getElementById('sFecha').value || hoyISO(), sEditId);
  filas.forEach((r,i)=>{ const v = costeados[i].valorUnit; r.querySelector('.si-vu').value = v ? v.toLocaleString('es-AR') : ''; });
}
function descuentoCompra(subtotal){
  const v = parseDecimal(document.getElementById('sDescValor').value || '0') || 0;
  const tipo = document.getElementById('sDescTipo').value;
  const monto = tipo==='%' ? Math.round(subtotal * Math.min(v,100) / 100) : Math.min(Math.round(v), subtotal);
  return {tipo, valor: v, monto: Math.max(0, monto)};
}
function sRecalcular(){
  sCosteoAutomatico();
  const subEg = sTotalItems('sItems');
  const desc = descuentoCompra(subEg);
  document.getElementById('sSubtotRow').classList.toggle('col-hidden', !desc.monto);
  document.getElementById('sDescRow').classList.toggle('col-hidden', !desc.monto);
  document.getElementById('sSubtotEgreso').textContent = fmtPesos(subEg);
  document.getElementById('sDescMonto').textContent = '−' + fmtPesos(desc.monto) + (desc.tipo==='%' && desc.valor ? ` (${String(desc.valor).replace('.',',')}%)` : '');
  document.getElementById('sTotalEgreso').textContent = fmtPesos(subEg - desc.monto);
  // Reparto de la aplicación
  const total = parseMonto(sTotalIngreso.value);
  const insumos = sTotalItems('sItemsIng');
  const sabrina = parseMonto(sSabrina.value);
  if(!sGabrielaManual){
    const g = calcularGabrielaAuto(total, insumos, sabrina);
    sGabriela.value = g.toLocaleString('es-AR');
  }
  const gabriela = parseMonto(sGabriela.value);
  const ummana = calcularUmmana(total, insumos, sabrina, gabriela);
  document.getElementById('sInsumosTotal').textContent = fmtPesos(insumos);
  const elU = document.getElementById('sUmmana');
  elU.textContent = fmtPesos(ummana);
  elU.classList.toggle('neg', ummana < 0);
  document.getElementById('sGabrielaModo').textContent = sGabrielaManual ? 'manual' : 'automático';
  document.getElementById('sGabrielaAuto').classList.toggle('col-hidden', !sGabrielaManual);
}

let sTerceroInicial = '';
function aplicarExcepcionesFicha(){
  if(sTipo!=='ingreso') return;
  const nombre = mayus(sTercero.value.trim());
  if(!nombre || nombre===sTerceroInicial) return;   // al editar sin cambiar paciente, se respetan los valores guardados
  sTerceroInicial = nombre;
  const ex = excepcionDe(nombre);
  sSabrina.value = Number(ex.sabrina0 ? 0 : suerosCfg.sabrina).toLocaleString('es-AR');
  if(ex.gabriela0){ sGabrielaManual = true; sGabriela.value = '0'; }
  else if(sGabrielaManual && parseMonto(sGabriela.value)===0){ sGabrielaManual = false; }
  sRecalcular();
}
function abrirModalSuero(id){
  if(!esAdminSueros()) return;
  const m = id ? sueros.find(x=> x.id===id) : null;
  const esIng = !m || m.tipo!=='egreso';
  sEditId = m ? m.id : null;
  document.getElementById('sueroTitulo').textContent = m ? 'Editar movimiento de sueros' : 'Nuevo movimiento de sueros';
  document.getElementById('sGuardar').textContent = m ? 'Guardar cambios' : 'Guardar';
  document.getElementById('sEliminar').classList.toggle('col-hidden', !m);
  document.getElementById('sItems').innerHTML = '';
  document.getElementById('sItemsIng').innerHTML = '';
  document.getElementById('sFecha').value = m ? m.fechaISO : hoyISO();
  sTercero.value = m ? (m.tercero||'') : '';
  document.getElementById('sNotas').value = m && esIng ? (m.notas||'') : '';
  sTerceroInicial = sTercero.value;
  document.getElementById('sDetalleEgreso').value = m && !esIng ? (m.detalle||'') : '';
  document.getElementById('sDescValor').value = m && !esIng && m.descuento ? String(m.descuento.valor).replace('.',',') : '';
  document.getElementById('sDescTipo').value = m && !esIng && m.descuento ? m.descuento.tipo : '%';
  sTotalIngreso.value = m && esIng && m.total!=null && !m.pagoPendiente ? Number(m.total).toLocaleString('es-AR') : '';
  // Sabrina / Gabriela: en una aplicación ya cargada se respetan los valores guardados
  const sab = m && esIng && m.sabrina!=null ? m.sabrina : suerosCfg.sabrina;
  sSabrina.value = Number(sab).toLocaleString('es-AR');
  sGabrielaManual = !!(m && esIng && m.gabrielaManual);
  sGabriela.value = m && esIng && m.gabriela!=null ? Number(m.gabriela).toLocaleString('es-AR') : '';
  if(m) (m.items||[]).forEach(it=> sAgregarItem(it, esIng ? 'sItemsIng' : 'sItems'));
  setTipoSuero(esIng ? 'ingreso' : 'egreso', false);
  overlaySuero.classList.add('show');
}
window.abrirModalSuero = abrirModalSuero;
document.getElementById('sBtnNuevo').onclick = ()=> abrirModalSuero(null);
const cerrarModalSuero = ()=> overlaySuero.classList.remove('show');
document.getElementById('closeSuero').onclick = cerrarModalSuero;
document.getElementById('sCancelar').onclick = cerrarModalSuero;

document.getElementById('sGuardar').onclick = async ()=>{
  if(!esAdminSueros()) return;
  const fechaISO = document.getElementById('sFecha').value;
  const tercero = mayus(sTercero.value.trim());
  if(!fechaISO){ alert("Elegí una fecha."); return; }
  if(!tercero){ alert(sTipo==='ingreso' ? "Elegí un paciente." : "Elegí un proveedor."); return; }

  const datos = { tipo: sTipo, fechaISO, fechaDisplay: isoToDisplay(fechaISO), tercero };
  if(sTipo==='ingreso'){
    if(!pacienteRegistry.some(p=> mayus(p)===tercero)){
      alert(`"${tercero}" no está en la lista de pacientes. Elegilo de la lista, o si es nuevo, crealo primero en Menú → Pacientes.`);
      return;
    }
    datos.notas = mayus(document.getElementById('sNotas').value.trim());
    datos.detalle = '';
    datos.pagoPendiente = sTotalIngreso.value.trim()==='';
    datos.total = datos.pagoPendiente ? null : parseMonto(sTotalIngreso.value);
    let items = sLeerItems('sItemsIng').filter(it=> it.insumo || it.cant || it.valorUnit);
    const enStock = new Set(insumosConocidos());
    const noExiste = items.find(it=> !enStock.has(it.insumo));
    if(noExiste){ alert(`"${noExiste.insumo || '(vacío)'}" no está en el stock. Elegí un insumo de la lista.`); return; }
    if(items.some(it=> !it.cant)){ alert("Cada insumo necesita una cantidad."); return; }
    const sinStockF = insumosSinStock(items, sEditId, fechaISO);
    if(sinStockF.length){ avisoSinStock(sinStockF); return; }
    if(fechaISO >= STOCK_DESDE) items = costearFIFO(items.map(it=> ({insumo:it.insumo, cant:it.cant})), fechaISO, sEditId);
    datos.items = items;
    datos.insumosTotal = items.reduce((a,it)=> a+it.subtotal, 0);
    datos.sabrina = parseMonto(sSabrina.value);
    datos.gabriela = parseMonto(sGabriela.value);
    datos.gabrielaManual = sGabrielaManual;
    datos.ummana = calcularUmmana(datos.total||0, datos.insumosTotal, datos.sabrina, datos.gabriela);
  } else {
    const items = sLeerItems('sItems').filter(it=> it.insumo || it.cant || it.sinCargo || it.valorUnit);
    if(!items.length){ alert("Agregá al menos un insumo."); return; }
    if(items.some(it=> !it.insumo || !(it.cant || it.sinCargo) || !it.valorUnit)){ alert("Cada insumo necesita detalle, cantidad (o unidades sin cargo) y valor unitario."); return; }
    if(!proveedoresRegistry.some(p=> mayus(p)===tercero)){
      if(!await ummConfirm(`"${tercero}" no está en Proveedores. ¿Agregarlo?`)) return;
      try{ await db.collection('proveedores').add({nombre: tercero}); }
      catch(e){ alert("No se pudo crear el proveedor: " + e.message); return; }
    }
    datos.items = items;
    datos.subtotal = items.reduce((a,it)=> a+it.subtotal, 0);
    const desc = descuentoCompra(datos.subtotal);
    datos.descuento = desc.monto ? {tipo: desc.tipo, valor: desc.valor, monto: desc.monto} : null;
    datos.total = datos.subtotal - desc.monto;
    datos.detalle = mayus(document.getElementById('sDetalleEgreso').value.trim()) || 'COMPRA DE INSUMOS';
    datos.insumosTotal = null; datos.sabrina = null; datos.gabriela = null; datos.gabrielaManual = false; datos.ummana = null;
  }

  const btn = document.getElementById('sGuardar');
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    if(sEditId){
      datos.actualizadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('sueros').doc(sEditId).update(datos);
    } else {
      datos.creadoPor = currentUser.nombre;
      datos.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('sueros').add(datos);
    }
    // si se cargó en otro mes, vamos a ese mes
    const [y,m] = fechaISO.split('-').map(Number);
    mesSueros = { year:y, month:m };
    cerrarModalSuero();
    renderSueros();
  }catch(e){
    alert("No se pudo guardar: " + e.message);
  }
  btn.disabled = false; btn.textContent = txt;
};

document.getElementById('sEliminar').onclick = async ()=>{
  if(!sEditId || !esAdminSueros()) return;
  if(!await ummConfirm("¿Eliminar este movimiento de sueros? Esta acción no se puede deshacer.")) return;
  try{
    await db.collection('sueros').doc(sEditId).delete();
    cerrarModalSuero();
  }catch(e){
    alert("No se pudo eliminar: " + e.message);
  }
};


/* =====================================================================
   PORTAL — usuarios que no trabajan en la caja (profesionales, etc.)
   Inicio con botones: Glosario y, si corresponde, Aplicación de sueros.
   ===================================================================== */
let unsubPortalPac = null;
let unsubFichasSueros = null;
let fichasSuerosIds = new Set();
// Pacientes de sueroterapia: los que tienen ficha de sueros o ya tienen aplicaciones cargadas
function pacientesSueros(){
  const conApps = new Set(aplicacionesSueros().map(m=> m.tercero));
  return pacientesFullList
    .filter(p=> fichasSuerosIds.has(p.id) || conApps.has(p.nombreCompleto))
    .map(p=> p.nombreCompleto)
    .sort((a,b)=> a.localeCompare(b,'es'));
}
const NOMBRES_FEMENINOS = ['ORIANA','TIARA','STEPHANIE','GABRIELA','SABRINA','VICTORIA','LUCIANA','EUGENIA','CECILIA'];
const USUARIOS_CAJA = ['FEDE','FEDERICO','PEDRO','ORIANA','TIARA','STEPHANIE'];
function primerNombre(){ return mayus(((currentUser && currentUser.nombre) || '').trim()).split(/[\s,]+/)[0]; }
function esUsuarioCaja(){
  if(!currentUser) return false;
  if(currentUser.rol === 'admin') return true;
  return USUARIOS_CAJA.includes(primerNombre());
}
// Quién carga aplicaciones de sueros: usuarios con secciones: ["sueros"] (o Sabrina)
const SIN_SUEROS = ['VICTORIA','LUCIANA'];   // por ahora sin Sueroterapia (solo Glosario)
function puedeCargarSueros(){
  if(!currentUser) return false;
  if(SIN_SUEROS.includes(primerNombre())) return false;
  const sec = Array.isArray(currentUser.secciones) ? currentUser.secciones : [];
  return sec.includes('sueros') || sec.includes('sueros-informes') || primerNombre()==='SABRINA';
}

function mostrarPortal(){
  document.getElementById('app').classList.add('col-hidden');
  document.getElementById('portal').classList.remove('col-hidden');
  const nom = (currentUser.nombre||'').trim();
  document.getElementById('pUser').textContent = nom;
  document.getElementById('pHola').textContent = nom ? `Hola, ${nom}` : 'Hola';
  document.getElementById('pIrSueros').classList.toggle('col-hidden', !puedeCargarSueros());
  if(!puedeCargarSueros()){ location.replace('../'); return; }
  if(suerosLimitado()){
    // Stock e Informes: se usa la misma vista de sueros, sin lo que es solo de administración
    document.body.classList.add('sueros-limitado');
    document.getElementById('pExtra').appendChild(document.getElementById('vistaSueros'));
    const opMensual = document.querySelector('#infTipo option[value="mensual"]');
    if(opMensual) opMensual.remove();
    const opRec = document.querySelector('#infTipo option[value="recupero"]');
    if(opRec) opRec.remove();
    sInfTipo = 'paciente';
    document.getElementById('pBtnStock').classList.remove('col-hidden');
    document.getElementById('pBtnInformes').classList.remove('col-hidden');
  }
  if(puedeCrearPacientes()) document.getElementById('pBtnNuevoPac').classList.remove('col-hidden');
  portalIr('sueros');
  if(puedeCargarSueros()){
    suscribirSueros();
    if(!unsubPortalPac){
      unsubPortalPac = suscribirPacientes(lista=>{
        pacientesFullList = lista;
        pacienteRegistry = pacientesFullList.map(p=> p.nombreCompleto);
      });
    }
    if(!unsubFichasSueros){
      unsubFichasSueros = db.collection('historiasSueros').onSnapshot(snap=>{
        fichasSuerosIds = new Set(snap.docs.map(d=> d.id));
        snap.docs.forEach(d=>{
          const v = d.data().derivante;
          if(!v) return;
          const n = derivanteNormalizado(v);
          if(n && n !== v) db.collection('historiasSueros').doc(d.id).update({derivante: n}).catch(()=>{});
        });
      }, ()=>{});
    }
  }
}
function portalIr(v){
  document.getElementById('pHome').classList.toggle('col-hidden', v!=='home');
  document.getElementById('pSueros').classList.toggle('col-hidden', v!=='sueros');
  document.getElementById('pExtra').classList.toggle('col-hidden', v!=='extra');
  if(v==='extra'){
    vistaActual = 'sueros';
    document.getElementById('vistaSueros').classList.remove('col-hidden');
    renderSueros();
  } else if(suerosLimitado()) vistaActual = 'movimientos';
  if(v==='sueros'){
    if(!document.getElementById('pDesde').value) document.getElementById('pDesde').value = hoyISO();
    if(!document.getElementById('pHasta').value) document.getElementById('pHasta').value = hoyISO();
    renderPortalSueros();
  }
}
document.getElementById('pLogout').onclick = ()=> auth.signOut().then(()=> location.replace('../'));
document.getElementById('pIrSueros').onclick = ()=>{ if(puedeCargarSueros()) portalIr('sueros'); };
document.getElementById('pBtnStock').onclick = ()=>{ if(!suerosLimitado()) return; sTabActual = 'stock'; portalIr('extra'); };
document.getElementById('pBtnInformes').onclick = ()=>{ if(!suerosLimitado()) return; sTabActual = 'resumen'; sResAlMesActual(); portalIr('extra'); };
document.getElementById('sBtnVolverPortal').onclick = ()=> portalIr('sueros');
document.getElementById('sBtnVenc').onclick = ()=>{ sTabActual = 'stock'; mesSueros = {year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1}; renderSueros(); };
document.getElementById('pVolver').onclick = ()=> location.href = '../';
['pDesde','pHasta'].forEach(id=> document.getElementById(id).addEventListener('change', renderPortalSueros));
function rangoPortal(){
  let d = document.getElementById('pDesde').value || hoyISO();
  let h = document.getElementById('pHasta').value || d;
  if(d > h){ [d, h] = [h, d]; document.getElementById('pDesde').value = d; document.getElementById('pHasta').value = h; }
  return [d, h];
}

/* ---- Aplicaciones (sin valores) ---- */
function aplicacionesSueros(){ return sueros.filter(m=> m.tipo==='ingreso'); }
// Número de aplicación de cada paciente (1, 2, 3… en orden de fecha y carga)
function numerosDeAplicacion(){
  const cont = {}, num = {};
  aplicacionesSueros().forEach(m=>{ cont[m.tercero] = (cont[m.tercero]||0) + 1; num[m.id] = cont[m.tercero]; });
  return num;
}
const insumosTexto = m => insumosHTML(m);

function renderPortalSueros(){
  const tb = document.getElementById('pLista');
  if(!tb || document.getElementById('pSueros').classList.contains('col-hidden')) return;
  const [desde, hasta] = rangoPortal();
  document.getElementById('pTitulo').textContent = desde===hasta ? 'Aplicaciones del día' : 'Aplicaciones';
  const num = numerosDeAplicacion();
  const delDia = aplicacionesSueros().filter(m=> m.fechaISO>=desde && m.fechaISO<=hasta);
  if(!delDia.length){
    tb.innerHTML = `<tr><td colspan="5" class="empty-state">${desde===hasta ? 'No hay aplicaciones cargadas este día.' : 'No hay aplicaciones cargadas en estas fechas.'}</td></tr>`;
  } else {
    tb.innerHTML = delDia.map((m, i)=>`
      <tr>
        <td class="editcol"><button class="editbtn" title="Editar" onclick="abrirAplic('${m.id}')">&#9998;</button></td>
        <td class="p-cuenta">${i+1}</td>
        <td>${fechaLarga(m.fechaISO)}</td>
        <td><span class="p-num">${num[m.id]}</span></td>
        <td class="left">${m.tercero||''}</td>
        <td class="concepto">${insumosHTML(m) || '<span class="pend">—</span>'}</td>
        <td class="notas">${m.notas||''}</td>
      </tr>`).join('');
    ajustarColumna(document.querySelector('#pSueros col:nth-child(5)'), delDia.map(m=> m.tercero), '500 10.5px Montserrat, sans-serif', 26);
  }
  if(document.getElementById('overlayPPacientes').classList.contains('show')) renderPortalPacientes();
}

/* ---- Pacientes: lista, paciente nuevo, ficha (historia clínica) e historial ---- */
const overlayPPac = document.getElementById('overlayPPacientes');
let hcPaciente = null;        // {id, nombreCompleto, fnac}
let hcDatos = {};             // documento historiasSueros/{id}
let unsubHC = null;
const HC_CAMPOS = ['antPersonales','antFamiliares','medicaciones','suplementos','motivo','plan','derivante'];

document.getElementById('pBtnPacientes').onclick = ()=>{
  document.getElementById('pBuscarPac').value = '';
  pacVista('lista');
  overlayPPac.classList.add('show');
  document.getElementById('pBuscarPac').focus();
};
const cerrarPPac = ()=>{ overlayPPac.classList.remove('show'); cerrarFichaHC(); };
document.getElementById('closePPac').onclick = cerrarPPac;
document.getElementById('pBuscarPac').addEventListener('input', renderPortalPacientes);
document.getElementById('pPacVolver').onclick = ()=>{ cerrarFichaHC(); pacVista('lista'); };

function pacVista(v){
  document.getElementById('pPacVistaLista').classList.toggle('col-hidden', v!=='lista');
  document.getElementById('pPacVistaFicha').classList.toggle('col-hidden', v!=='ficha');
  if(v==='lista') renderPortalPacientes();
  overlayPPac.scrollTop = 0;
}

function renderPortalPacientes(){
  if(overlayPPac.classList.contains('show') && !document.getElementById('pPacVistaFicha').classList.contains('col-hidden')){
    renderHistorialHC();   // ficha abierta: solo se actualiza el historial
    return;
  }
  const q = document.getElementById('pBuscarPac').value;
  const cuenta = {};
  aplicacionesSueros().forEach(m=> cuenta[m.tercero] = (cuenta[m.tercero]||0) + 1);
  let lista = pacientesFullList.filter(p=> !q || contiene(p.nombreCompleto, q))
    .sort((a,b)=> (a.nombreCompleto||'').localeCompare(b.nombreCompleto||'','es'));
  if(!q) lista = lista.filter(p=> cuenta[p.nombreCompleto]);   // sin búsqueda: solo los que ya tienen sueros
  const cont = document.getElementById('pPacLista');
  if(!lista.length){
    cont.innerHTML = `<div class="empty-state">${q ? (puedeCrearPacientes() ? 'No hay pacientes con ese nombre. Si es nuevo, tocá "+ Nuevo paciente".' : 'No hay pacientes con ese nombre. Los pacientes nuevos se cargan desde la caja diaria.') : 'Escribí un nombre para buscar.'}</div>`;
    return;
  }
  cont.innerHTML = lista.slice(0,80).map(p=>{
    const n = cuenta[p.nombreCompleto]||0;
    return `<button class="hc-item" data-id="${p.id}"><span>${p.nombreCompleto}</span><span class="cant">${n ? `${n} ${n===1?'aplicación':'aplicaciones'}` : ''}</span></button>`;
  }).join('');
  cont.querySelectorAll('.hc-item').forEach(b=> b.onclick = ()=> abrirFichaHC(b.dataset.id));
}

/* Ficha */
// Profesionales derivantes (en este orden)
const DERIVANTES = ['Dra. María Gabriela Baslini', 'Dra. Victoria Barbieri', 'Dra. Luciana Real'];
// Reconoce lo que se escribió antes a mano ("GABRIELA", "BARBIERI"…) y lo pasa al nombre de la lista
function derivanteNormalizado(v){
  const k = claveInsumo(v||'');
  if(!k) return '';
  if(k.includes('gabriela') || k.includes('baslini')) return DERIVANTES[0];
  if(k.includes('victoria') || k.includes('barbieri')) return DERIVANTES[1];
  if(k.includes('luciana') || /\breal\b/.test(normBusqueda(v))) return DERIVANTES[2];
  const exacto = DERIVANTES.find(d=> claveInsumo(d)===k);
  return exacto || null;   // null: no se reconoce, se deja como está
}
function llenarDerivantes(actual){
  const sel = document.getElementById('hcDerivante');
  const opciones = ['', ...DERIVANTES];
  if(actual && !opciones.includes(actual)) opciones.push(actual);   // valor viejo no reconocido: se conserva
  sel.innerHTML = opciones.map(o=> `<option value="${o.replace(/"/g,'&quot;')}">${o || '—'}</option>`).join('');
  sel.value = actual || '';
}
(function(){
  const ses = document.querySelector('[data-hc="sesiones"]');
  ses.innerHTML = '<option value="">—</option>' + Array.from({length:20}, (_,i)=> `<option>${i+1}</option>`).join('');
})();
const HC_SIN_MAYUS = ['derivante','planTipo','sesiones'];
function edadDesde(iso){
  if(!iso) return '—';
  const n = new Date(iso + 'T12:00:00'), h = new Date();
  if(isNaN(n)) return '—';
  let e = h.getFullYear() - n.getFullYear();
  if(h.getMonth() < n.getMonth() || (h.getMonth()===n.getMonth() && h.getDate() < n.getDate())) e--;
  return e >= 0 ? `${e} años` : '—';
}
// fnac guardado en pacientes puede venir como AAAA-MM-DD o DD/MM/AAAA
function fnacISO(v){
  if(!v) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = String(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(!m) return '';
  const y = m[3].length===2 ? '19'+m[3] : m[3];
  return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function abrirFichaHC(id){
  const p = pacientesFullList.find(x=> x.id===id);
  if(!p) return;
  hcPaciente = p;
  hcDatos = {};
  document.getElementById('hcPaciente').textContent = p.nombreCompleto;
  document.getElementById('hcFnac').value = fnacISO(p.fnac);
  document.getElementById('hcEdad').textContent = edadDesde(fnacISO(p.fnac));
  document.getElementById('hcInicio').value = hoyISO();
  document.querySelectorAll('[data-hc]').forEach(el=> el.value = '');
  llenarDerivantes('');
  document.getElementById('hcEstado').textContent = '';
  document.getElementById('hcNotaForm').classList.add('col-hidden');
  pacVista('ficha');
  renderHistorialHC();
  if(unsubHC) unsubHC();
  let primera = true;
  unsubHC = db.collection('historiasSueros').doc(id).onSnapshot(d=>{
    hcDatos = d.exists ? d.data() : {};
    if(primera){   // los campos se completan al abrir; después no se pisa lo que se está escribiendo
      primera = false;
      document.getElementById('hcInicio').value = hcDatos.hcInicio || hoyISO();
      document.querySelectorAll('[data-hc]').forEach(el=>{ if(el.dataset.hc==='derivante') return; const v = hcDatos[el.dataset.hc] || '';
        if(el.tagName==='SELECT' && v && ![...el.options].some(o=> o.value===v)) el.add(new Option(v, v));   // opción vieja que ya no está en la lista
        el.value = v; });
      const dv = hcDatos.derivante || '';
      llenarDerivantes(derivanteNormalizado(dv) ?? dv);
      document.getElementById('hcEstado').textContent = hcDatos.actualizadoPor ? `Última edición: ${hcDatos.actualizadoPor}` : '';
    }
    renderHistorialHC();
  }, err=>{
    document.getElementById('hcEstado').textContent = 'No se pudo cargar la ficha: ' + err.message;
  });
}
function cerrarFichaHC(){
  if(unsubHC){ unsubHC(); unsubHC = null; }
  hcPaciente = null;
}
document.getElementById('hcFnac').addEventListener('change', e=>{
  document.getElementById('hcEdad').textContent = edadDesde(e.target.value);
});
document.getElementById('hcGuardar').onclick = async ()=>{
  if(!hcPaciente) return;
  const datos = { hcInicio: document.getElementById('hcInicio').value || '',
    actualizadoPor: currentUser.nombre, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() };
  document.querySelectorAll('[data-hc]').forEach(el=> datos[el.dataset.hc] = HC_SIN_MAYUS.includes(el.dataset.hc) ? el.value : mayus(el.value.trim()));
  const btn = document.getElementById('hcGuardar');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try{
    await db.collection('historiasSueros').doc(hcPaciente.id).set(datos, {merge:true});
    const fnac = document.getElementById('hcFnac').value;
    if(fnac !== fnacISO(hcPaciente.fnac)){
      await db.collection('pacientes').doc(hcPaciente.id).update({fnac, ...marcaPac()});
      hcPaciente.fnac = fnac;
    }
    cerrarFichaHC(); pacVista('lista');   // vuelve a la lista de pacientes
  }catch(e){ alert("No se pudo guardar la ficha: " + e.message); }
  btn.disabled = false; btn.textContent = 'Guardar ficha';
};

/* Notas */
document.getElementById('hcBtnNota').onclick = ()=>{
  const f = document.getElementById('hcNotaForm');
  f.classList.toggle('col-hidden');
  document.getElementById('hcNotaFecha').value = hoyISO();
  document.getElementById('hcNotaTexto').value = '';
  if(!f.classList.contains('col-hidden')) document.getElementById('hcNotaTexto').focus();
};
document.getElementById('hcNotaCancelar').onclick = ()=> document.getElementById('hcNotaForm').classList.add('col-hidden');
document.getElementById('hcNotaGuardar').onclick = async ()=>{
  if(!hcPaciente) return;
  const texto = mayus(document.getElementById('hcNotaTexto').value.trim());
  const fechaISO = document.getElementById('hcNotaFecha').value || hoyISO();
  if(!texto){ alert("Escribí la nota."); return; }
  const nota = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), fechaISO, texto, autor: currentUser.nombre, creadoMs: Date.now() };
  try{
    await db.collection('historiasSueros').doc(hcPaciente.id).set(
      { notas: firebase.firestore.FieldValue.arrayUnion(nota) }, {merge:true});
    document.getElementById('hcNotaForm').classList.add('col-hidden');
  }catch(e){ alert("No se pudo guardar la nota: " + e.message); }
};
async function quitarNotaHC(id){
  const nota = (hcDatos.notas||[]).find(n=> n.id===id);
  if(!nota || !hcPaciente) return;
  if(!await ummConfirm("¿Eliminar esta nota?")) return;
  try{
    await db.collection('historiasSueros').doc(hcPaciente.id).update({ notas: firebase.firestore.FieldValue.arrayRemove(nota) });
  }catch(e){ alert("No se pudo eliminar: " + e.message); }
}
window.quitarNotaHC = quitarNotaHC;

/* Historial: aplicaciones y notas juntas, de la más reciente a la más vieja */
function renderHistorialHC(){
  const cont = document.getElementById('hcHistorial');
  if(!hcPaciente || !cont) return;
  const num = numerosDeAplicacion();
  const ev = [];
  aplicacionesSueros().filter(m=> m.tercero===hcPaciente.nombreCompleto).forEach(m=>{
    const t = m.creadoEn && m.creadoEn.toMillis ? m.creadoEn.toMillis() : 0;
    ev.push({ tipo:'app', fechaISO: m.fechaISO, orden: t, m });
  });
  (hcDatos.notas||[]).forEach(n=> ev.push({ tipo:'nota', fechaISO: n.fechaISO, orden: n.creadoMs||0, n }));
  ev.sort((a,b)=> a.fechaISO===b.fechaISO ? b.orden - a.orden : (a.fechaISO < b.fechaISO ? 1 : -1));
  if(!ev.length){ cont.innerHTML = '<div class="empty-state">Todavía no hay aplicaciones ni notas.</div>'; return; }
  cont.innerHTML = ev.map(e=> e.tipo==='app' ? `
    <div class="hc-ev">
      <div><div class="fecha">${fechaLarga(e.fechaISO)}</div><span class="p-num tipo">N° ${num[e.m.id]}</span></div>
      <div class="det"><div>${insumosTexto(e.m) || '<span class="muted">Sin insumos</span>'}</div>${e.m.notas ? `<div class="muted">${e.m.notas}</div>` : ''}</div>
    </div>` : `
    <div class="hc-ev nota">
      <div><div class="fecha">${fechaLarga(e.fechaISO)}</div><span class="tag-nota tipo">NOTA</span></div>
      <div class="det"><button class="quitar" title="Eliminar nota" onclick="quitarNotaHC('${e.n.id}')">✕</button>${e.n.texto}${e.n.autor ? `<div class="muted" style="margin-top:3px;font-size:10.5px;">${e.n.autor}</div>` : ''}</div>
    </div>`).join('');
}

/* ---- + Nuevo suero ---- */
const overlayAplic = document.getElementById('overlayAplic');
const aPaciente = document.getElementById('aPaciente');
let aEditId = null;
attachAutocomplete(aPaciente, ()=> pacientesSueros(), ()=> actualizarNotasPaciente());
aPaciente.addEventListener('change', ()=> actualizarNotasPaciente());
aPaciente.addEventListener('blur', ()=> setTimeout(actualizarNotasPaciente, 150));

/* ---- "ver notas": notas de la ficha y de aplicaciones anteriores del paciente ---- */
let notasPacToken = 0, notasPacNombre = null;
async function actualizarNotasPaciente(){
  const nombre = mayus(aPaciente.value.trim());
  if(nombre === notasPacNombre) return;
  notasPacNombre = nombre;
  const token = ++notasPacToken;
  const wrap = document.getElementById('aNotasWrap');
  wrap.classList.add('col-hidden');
  document.getElementById('aNotasPop').classList.add('col-hidden');
  if(!nombre) return;
  const notas = aplicacionesSueros()
    .filter(m=> m.tercero===nombre && m.notas && m.id!==aEditId)
    .map(m=> ({fechaISO: m.fechaISO, texto: m.notas, autor: m.creadoPor||'', orden: m.creadoEn && m.creadoEn.toMillis ? m.creadoEn.toMillis() : 0, tipo:'Aplicación'}));
  const p = pacientesFullList.find(x=> mayus(x.nombreCompleto)===nombre);
  if(p){
    try{
      const d = await db.collection('historiasSueros').doc(p.id).get();
      if(d.exists) (d.data().notas||[]).forEach(n=> notas.push({fechaISO: n.fechaISO, texto: n.texto, autor: n.autor||'', orden: n.creadoMs||0, tipo:'Nota'}));
    }catch(e){ /* sin acceso a la ficha: se muestran solo las notas de aplicaciones */ }
  }
  if(token !== notasPacToken || !notas.length) return;
  notas.sort((a,b)=> a.fechaISO===b.fechaISO ? b.orden - a.orden : (a.fechaISO < b.fechaISO ? 1 : -1));
  document.getElementById('aVerNotas').textContent = `ver notas (${notas.length})`;
  document.getElementById('aNotasLista').innerHTML = notas.map(n=>`
    <div class="an-nota">
      <div class="an-meta">${fechaLarga(n.fechaISO)}${n.autor ? ` · ${n.autor}` : ''}<span class="an-tipo">${n.tipo}</span></div>
      <div>${n.texto}</div>
    </div>`).join('');
  wrap.classList.remove('col-hidden');
}
document.getElementById('aVerNotas').onclick = ()=> document.getElementById('aNotasPop').classList.toggle('col-hidden');
document.getElementById('aNotasCerrar').onclick = ()=> document.getElementById('aNotasPop').classList.add('col-hidden');

function pAgregarItem(it){
  const row = document.createElement('div');
  row.className = 'p-item';
  row.innerHTML = `
    <div class="ac-wrap"><input type="text" class="pi-insumo" placeholder="Insumo…" autocomplete="off"></div>
    <div class="pi-cant-wrap">
      <input type="text" class="pi-cant" inputmode="numeric" placeholder="0">
      <div class="pi-flechas"><button type="button" tabindex="-1" data-d="1" title="Sumar">▲</button><button type="button" tabindex="-1" data-d="-1" title="Restar">▼</button></div>
    </div>
    <button type="button" class="btn-quitar" title="Quitar">✕</button>`;
  document.getElementById('aItems').appendChild(row);
  row.querySelectorAll('.pi-flechas button').forEach(b=> b.onclick = ()=>{
    const c = row.querySelector('.pi-cant');
    const n = Math.max(1, (parseMonto(c.value)||0) + Number(b.dataset.d));
    c.value = n.toLocaleString('es-AR');
  });
  const inIns = row.querySelector('.pi-insumo'), inCant = row.querySelector('.pi-cant');
  if(it){ inIns.value = it.insumo||''; inCant.value = it.cant ? Number(it.cant).toLocaleString('es-AR') : ''; }
  attachAutocomplete(inIns, insumosConocidos, ()=>{
    if(!inCant.value) inCant.value = '1';
    siguienteInsumo(row, 'aItems', '.pi-insumo', ()=> pAgregarItem());
  });
  inCant.addEventListener('input', ()=> formatearInputMonto(inCant));
  row.querySelector('.btn-quitar').onclick = ()=> row.remove();
}
document.getElementById('aAddItem').onclick = ()=> pAgregarItem();

function abrirAplic(id){
  if(!puedeCargarSueros()) return;
  const m = id ? sueros.find(x=> x.id===id) : null;
  aEditId = m ? m.id : null;
  document.getElementById('aplicTitulo').textContent = m ? 'Editar aplicación' : 'Nuevo suero';
  document.getElementById('aGuardar').textContent = m ? 'Guardar cambios' : 'Guardar';
  document.getElementById('aEliminar').classList.toggle('col-hidden', !m);
  document.getElementById('aFecha').value = m ? m.fechaISO : (rangoPortal()[0]===rangoPortal()[1] ? rangoPortal()[0] : hoyISO());
  aPaciente.value = m ? (m.tercero||'') : '';
  notasPacNombre = null;
  actualizarNotasPaciente();
  document.getElementById('aNotas').value = m ? (m.notas||'') : '';
  document.getElementById('aItems').innerHTML = '';
  if(m && (m.items||[]).length) m.items.forEach(it=> pAgregarItem(it));
  else { const v = insumoVias(); if(v) pAgregarItem({insumo: v, cant: 1}); pAgregarItem(); }
  overlayAplic.classList.add('show');
}
window.abrirAplic = abrirAplic;
document.getElementById('pBtnNuevo').onclick = ()=> abrirAplic(null);
const cerrarAplic = ()=> overlayAplic.classList.remove('show');
document.getElementById('closeAplic').onclick = cerrarAplic;
document.getElementById('aCancelar').onclick = cerrarAplic;

// Precios de cada insumo vigentes a una fecha (última compra/ajuste hasta ese día)
function preciosAFecha(fechaISO){
  const d = new Date(fechaISO + 'T12:00:00'); d.setDate(d.getDate()+1);
  const hasta = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const precios = {};
  insumosStock().forEach(i=> precios[i.insumo] = i.ultimo || i.valorUnit);
  calcularStock(hasta).forEach(i=>{ if(i.ultimo) precios[i.insumo] = i.ultimo; });
  return precios;
}

document.getElementById('aGuardar').onclick = async ()=>{
  if(!puedeCargarSueros()) return;
  const fechaISO = document.getElementById('aFecha').value;
  let tercero = mayus(aPaciente.value.trim());
  if(!fechaISO){ alert("Elegí una fecha."); return; }
  if(!tercero){ alert("Elegí un paciente."); return; }
  const itemsRaw = [...document.querySelectorAll('#aItems .p-item')].map(r=>({
    insumo: mayus(r.querySelector('.pi-insumo').value.trim()),
    cant: parseMonto(r.querySelector('.pi-cant').value),
  })).filter(it=> it.insumo || it.cant);
  if(!itemsRaw.length){ alert("Agregá al menos un insumo."); return; }
  const enStock = new Set(insumosConocidos());
  const noExiste = itemsRaw.find(it=> !enStock.has(it.insumo));
  if(noExiste){ alert(`"${noExiste.insumo || '(vacío)'}" no está en la lista de insumos. Elegilo de la lista.`); return; }
  if(itemsRaw.some(it=> !it.cant)){ alert("Cada insumo necesita una cantidad."); return; }
  const sinStockP = insumosSinStock(itemsRaw, aEditId, fechaISO);
  if(sinStockP.length){ avisoSinStock(sinStockP); return; }

  // Los pacientes se dan de alta solo desde la caja diaria
  if(!pacientesSueros().some(p=> mayus(p)===tercero)){
    alert(`"${tercero}" no tiene ficha de sueros. Creale la ficha desde Pacientes (si es nuevo, primero tiene que cargarse en la caja diaria).`);
    return;
  }

  // Valores (ella no los ve): precios a la fecha, Sabrina/Gabriela según valores fijos y excepciones
  let items;
  if(fechaISO >= STOCK_DESDE) items = costearFIFO(itemsRaw, fechaISO, aEditId);   // primero las unidades más viejas
  else {
    const precios = preciosAFecha(fechaISO);
    items = itemsRaw.map(it=> ({ ...it, valorUnit: precios[it.insumo]||0, subtotal: it.cant*(precios[it.insumo]||0) }));
  }
  const insumosTotal = items.reduce((a,it)=> a+it.subtotal, 0);
  const m = aEditId ? sueros.find(x=> x.id===aEditId) : null;
  const mismoPaciente = m && m.tercero===tercero;
  const ex = excepcionDe(tercero);
  const pagoPendiente = m ? !!m.pagoPendiente : true;
  const total = pagoPendiente ? null : (m.total||0);
  const sabrina = mismoPaciente && m.sabrina!=null ? m.sabrina : (ex.sabrina0 ? 0 : Number(suerosCfg.sabrina)||0);
  const gabrielaManual = mismoPaciente ? !!m.gabrielaManual : !!ex.gabriela0;
  const gabriela = gabrielaManual ? (mismoPaciente ? (m.gabriela||0) : 0) : calcularGabrielaAuto(total||0, insumosTotal, sabrina);
  const datos = {
    tipo:'ingreso', fechaISO, fechaDisplay: isoToDisplay(fechaISO), tercero,
    notas: mayus(document.getElementById('aNotas').value.trim()), detalle: '',
    items, insumosTotal, sabrina, gabriela, gabrielaManual,
    ummana: calcularUmmana(total||0, insumosTotal, sabrina, gabriela),
    total, pagoPendiente,
  };

  const btn = document.getElementById('aGuardar'); const txt = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    if(aEditId){
      datos.actualizadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('sueros').doc(aEditId).update(datos);
    } else {
      datos.creadoPor = currentUser.nombre;
      datos.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('sueros').add(datos);
    }
    const [d0, h0] = rangoPortal();
    if(fechaISO < d0 || fechaISO > h0){ document.getElementById('pDesde').value = fechaISO; document.getElementById('pHasta').value = fechaISO; }
    cerrarAplic();
    renderPortalSueros();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
  btn.disabled = false; btn.textContent = txt;
};
document.getElementById('aEliminar').onclick = async ()=>{
  if(!aEditId || !puedeCargarSueros()) return;
  if(!await ummConfirm("¿Eliminar esta aplicación? Esta acción no se puede deshacer.")) return;
  try{ await db.collection('sueros').doc(aEditId).delete(); cerrarAplic(); }
  catch(e){ alert("No se pudo eliminar: " + e.message); }
};


