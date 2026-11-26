/* =====================================================================
   PEDIDOS A SECRETARÍA
   La Dra. Victoria (y Fede/Pedro) cargan pedidos para un paciente de Ummana;
   recepción los ve en Movimientos → Pedidos secretaría, copia la indicación,
   se asigna, cambia el estado y deja notas.
   Colección: pedidosSecretaria. Fede y la Dra. Victoria pueden eliminar: el pedido se marca eliminado:true
   (no se borra de la base) y deja de verse en todas las listas.
   ===================================================================== */
// Tipos en orden alfabético; OTRO PEDIDO siempre último
const PD_TIPOS = [
  'BONO DE DESCUENTO',
  'FORMULACION SUPLEMENTACION VIP',
  'INDICACIONES / DEVOLUCION',
  'ORDEN DE ESTUDIOS / LABORATORIO',
  'PRESUPUESTO TRATAMIENTOS',
  'RECETA BIOHELPER / YSONUT',
  'RECETA MEDICACION (OTROS)',
  'OTRO PEDIDO'];
const PD_ESTADOS = {pendiente:'PENDIENTE', realizado:'REALIZADO', cancelado:'CANCELADO'};
const PD_RESPONSABLES = ['ORIANA','STEPHANIE','TIARA MEDINA'];
let pdLista = null, unsubPd = null, pdFiltro = 'pendiente', pdAbierto = null, pdPendienteRender = false;

// Médicas que piden: Victoria (secciones ["victoria"]) y quien tenga "pedidos" en secciones (Gabriela Baslini).
// Cargan pedidos y pueden cancelar los pendientes. Recepción los gestiona. Admins (Fede, Pedro) hacen todo.
const pdEsMedica = ()=> !!currentUser && currentUser.rol !== 'admin' && (esVictoria() || seccionesUsuario().includes('pedidos'));
const pdPuedeCrear = ()=> !!currentUser && (currentUser.rol === 'admin' || pdEsMedica());
const pdPuedeVer = ()=> !!currentUser && (currentUser.rol === 'admin' || pdEsMedica() || USUARIOS_CAJA.includes(primerNombre()));
// Eliminar: Fede cualquiera; la Dra. Victoria los que pidió ella
const pdPuedeEliminar = p=> !!currentUser && !!p && (esFede() || (esVictoria() && (p.creadoPorUid ? p.creadoPorUid === currentUser.uid : pdQuienCorto(p.creadoPor) === 'VICTORIA')));
const pdNombreUsuario = ()=> mayus(((currentUser && currentUser.nombre) || '').trim()) || 'USUARIO';

// Fecha límite: el día siguiente al envío; si cae domingo, pasa al lunes
function pdLimite(iso){
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1);
  if(d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// "VICTORIA BARBIERI" → "VICTORIA" (para la columna Pidió)
const pdQuienCorto = n=> mayus(String(n||'')).trim().split(/[\s,]+/)[0] || '';
const pdVencido = p=> p.estado === 'pendiente' && p.limiteISO && p.limiteISO < hoyISO();
const pdAhora = ()=> { const d = new Date(); return cpFechaCorta(hoyISO()) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };

function pdIniciar(){
  if(unsubPd){ unsubPd(); unsubPd = null; }
  if(!pdPuedeVer()) return;
  unsubPd = db.collection('pedidosSecretaria').onSnapshot(snap=>{
    pdLista = snap.docs.map(d=> ({id:d.id, ...d.data()})).filter(p=> !p.eliminado);   // los eliminados no se ven
    pdContadores(); renderPd();
    if(pdAbierto && document.getElementById('overlayPdDet').classList.contains('show')){
      const p = pdLista.find(x=> x.id === pdAbierto);
      if(p) document.getElementById('pddMeta').innerHTML = pdMetaHtml(p);
    }
  }, err=>{
    pdLista = [];
    document.getElementById('pdBody').innerHTML = `<tr><td colspan="8" class="empty-state" style="color:#a13a3a;">No se pudieron leer los pedidos: ${escHtml(err.message)}<br>Revisá que en las reglas de Firebase esté la colección <b>pedidosSecretaria</b>.</td></tr>`;
  });
}

function pdContadores(){
  const l = pdLista || [];
  const n = k=> l.filter(p=> p.estado === k).length;
  document.getElementById('pdN-pendiente').textContent = n('pendiente');
  document.getElementById('pdN-realizado').textContent = n('realizado');
  document.getElementById('pdN-cancelado').textContent = n('cancelado');
  document.getElementById('pdN-todos').textContent = l.length;
  // globito en el botón de Movimientos y en el de Victoria: pedidos pendientes
  ['mSubPedN','vicPedN','vicPedN2'].forEach(id=>{ const b = document.getElementById(id); if(b){ b.textContent = n('pendiente'); b.classList.toggle('col-hidden', !n('pendiente')); } });
}

// El mismo panel se muestra en Movimientos (recepción y admins) y en Victoria
function pdMostrarEn(contenedorId){
  const panel = document.getElementById('pdPanel');
  const cont = document.getElementById(contenedorId);
  if(panel.parentElement !== cont) cont.appendChild(panel);
  panel.classList.remove('col-hidden');
  document.getElementById('pdFab').classList.toggle('col-hidden', !(pdPuedeCrear() && contenedorId === 'vistaPedidos'));
  renderPd();
}

function renderPd(){
  const panel = document.getElementById('pdPanel');
  if(panel.classList.contains('col-hidden')) return;
  const tb = document.getElementById('pdBody');
  if(pdLista == null){ tb.innerHTML = '<tr><td colspan="8" class="empty-state">Cargando…</td></tr>'; return; }
  document.querySelectorAll('#pdEstados [data-pde]').forEach(b=> b.classList.toggle('active', b.dataset.pde === pdFiltro));
  let lista = pdLista.filter(p=> !pdFiltro || p.estado === pdFiltro);
  if(!lista.length){
    tb.innerHTML = `<tr><td colspan="8" class="empty-state">${pdFiltro==='pendiente' ? 'No hay pedidos pendientes.' : 'No hay pedidos en esta lista.'}</td></tr>`;
    return;
  }
  // Agrupados por paciente: arriba el paciente con el pedido más nuevo; dentro, del más nuevo al más viejo
  const grupos = new Map();
  lista.forEach(p=>{ const k = mayus(p.paciente||'').trim(); if(!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
  const orden = [...grupos.values()].map(g=> g.sort((a,b)=> pdClave(b) - pdClave(a))).sort((a,b)=> pdClave(b[0]) - pdClave(a[0]));
  tb.innerHTML = orden.map(g=> `<tr class="pd-grupo"><td colspan="8"><b>${escHtml(g[0].paciente||'')}</b><span>${g.length} ${g.length===1?'pedido':'pedidos'}</span></td></tr>` + g.map(p=> `<tr data-id="${p.id}" class="pd-fila">
      <td>${cpFechaCorta(p.fechaISO)}</td>
      <td class="left pd-pac-rep"><span>${escHtml(p.paciente||'')}</span></td>
      <td class="pd-tipo">${escHtml(pdQuienCorto(p.creadoPor))}</td>
      <td class="pd-tipo">${escHtml(p.tipo||'')}</td>
      <td class="${pdVencido(p) ? 'pd-vencido' : ''}">${cpFechaCorta(p.limiteISO)}</td>
      <td><span class="pd-estado pd-${p.estado}">${PD_ESTADOS[p.estado] || ''}</span></td>
      <td>${escHtml(p.responsable || '—')}</td>
      <td class="left pd-notas">${escHtml(p.notas || '')}</td>
    </tr>`).join('')).join('');
}
// orden por momento de carga (fecha + hora del servidor; si todavía no llegó, ahora)
function pdClave(p){
  const ms = p.creadoEn && p.creadoEn.toMillis ? p.creadoEn.toMillis() : (p.creadoEn === undefined ? 0 : Date.now());
  return Math.max(ms, Date.parse((p.fechaISO||'1970-01-01') + 'T00:00:00'));
}
// con los buscadores, los encabezados de paciente que quedan sin pedidos visibles se esconden
function pdOcultarGrupos(){
  let cab = null, alguno = false;
  [...document.getElementById('pdBody').rows].forEach(tr=>{
    if(tr.classList.contains('pd-grupo')){ if(cab) cab.style.display = alguno ? '' : 'none'; cab = tr; alguno = false; }
    else if(tr.dataset.id && tr.style.display !== 'none') alguno = true;
  });
  if(cab) cab.style.display = alguno ? '' : 'none';
}
document.querySelectorAll('#pdPanel .pl-busca').forEach(i=> i.addEventListener('input', ()=> setTimeout(pdOcultarGrupos, 0)));
new MutationObserver(()=>{ plFiltrar('pdBody'); pdOcultarGrupos(); }).observe(document.getElementById('pdBody'), {childList:true});

document.querySelectorAll('#pdEstados [data-pde]').forEach(b=> b.onclick = ()=>{ pdFiltro = b.dataset.pde; renderPd(); });
document.getElementById('pdBody').addEventListener('click', e=>{
  const tr = e.target.closest('tr[data-id]'); if(tr) pdAbrirDetalle(tr.dataset.id);
});

/* ---------- Nuevo pedido ---------- */
const ovPdNuevo = document.getElementById('overlayPdNuevo');
const PD_DEV = 'INDICACIONES / DEVOLUCION';
document.getElementById('pdnTipo').innerHTML = '<option value="">Elegí el tipo…</option>' + PD_TIPOS.map(t=> `<option>${t}</option>`).join('');
// "+": primero se elige qué pedido es; cada tipo abre su formulario
const ovPdTipo = document.getElementById('overlayPdTipo');
document.getElementById('pdtLista').innerHTML = PD_TIPOS.filter(t=> t !== 'OTRO PEDIDO').map(t=> `<button type="button" class="pd-tipo-op" data-t="${t}">${t}</button>`).join('');
document.getElementById('pdtLista').addEventListener('click', e=>{
  const b = e.target.closest('[data-t]'); if(!b) return;
  ovPdTipo.classList.remove('show');
  if(b.dataset.t === PD_DEV) pdDevAbrir(); else if(PD_FORMS[b.dataset.t]) pdFormAbrir(b.dataset.t); else pdAbrirSimple(b.dataset.t);
});
document.getElementById('pdtCerrar').onclick = ()=> ovPdTipo.classList.remove('show');
attachAutocomplete(document.getElementById('pdnPaciente'), ()=> pacienteRegistry);
function pdContarDetalle(){
  const n = document.getElementById('pdnDetalle').value.length, c = document.getElementById('pdnCont');
  c.textContent = `${n}/50`; c.classList.toggle('lleno', n >= 50);
}
document.getElementById('pdnDetalle').addEventListener('input', pdContarDetalle);
/* ---------- Pedidos con formulario propio (mismo estilo que Indicaciones / devolución) ----------
   Cada tipo es una lista de secciones: 01 paciente y fecha, sus campos, notas para el paciente y notas internas.
   Lo que ve recepción: "detalle" (título en la lista), "indicacion" (texto para copiar, con las notas para el paciente)
   y "notas" (las notas internas). Los datos quedan además estructurados en "datos". */
const PD_BONO = 'BONO DE DESCUENTO', PD_VIP = 'FORMULACION SUPLEMENTACION VIP', PD_EST = 'ORDEN DE ESTUDIOS / LABORATORIO',
  PD_PRES = 'PRESUPUESTO TRATAMIENTOS', PD_BIO = 'RECETA BIOHELPER / YSONUT', PD_MED = 'RECETA MEDICACION (OTROS)';
const PDB_MARCAS = ['Isdin','La Roche-Posay','Eucerin','Avène','Vichy'];
const PDF_VIP_PRODS = ['Vitamina C','Vitamina D','Omega 3','Magnesio'];
const PD_FORMS = {
  [PD_BONO]: {titulo:'BONOS DE DESCUENTO', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Productos', k:'marcas'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
  [PD_VIP]:  {titulo:'FORMULACIÓN VIP', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Producto', k:'vip'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
  [PD_EST]:  {titulo:'ORDEN DE ESTUDIOS', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Detalle breve', k:'breve'}, {t:'Indicación de estudios', k:'texto', ph:'Estudios a pedir, ayuno, indicaciones…'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
  [PD_PRES]: {titulo:'PRESUPUESTO TRATAMIENTOS', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Tratamientos', k:'trat'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
  [PD_BIO]:  {titulo:'RECETA BIOHELPER / YSONUT', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Proveedor', k:'prov'}, {t:'Producto', k:'prods'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
  [PD_MED]:  {titulo:'RECETA MEDICACIÓN (OTROS)', secs:[{t:'Paciente / fecha', k:'pac'}, {t:'Pedido receta', k:'texto', ph:'Medicación, dosis, presentación…'}, {t:'Notas para paciente', k:'npac'}, {t:'Notas interno', k:'nint'}]},
};
const ovPdForm = document.getElementById('overlayPdForm');
let pfmTipo = null;
const pfmOpts = (lista, ph='Seleccionar…')=> `<option value="">${ph}</option>` + lista.map(v=> `<option>${escHtml(v)}</option>`).join('');
// desplegables: "Seleccionar…" en gris; "Otra/Otros" abre un casillero para escribir
function pfmConectarSelect(sel, otro){
  const pin = ()=> sel.classList.toggle('dv-vacio', !sel.value); pin();
  sel.addEventListener('change', ()=>{ pin(); if(otro){ otro.classList.toggle('col-hidden', sel.value !== '__otro'); if(sel.value === '__otro') otro.focus(); } });
}
function pfmPintarQuitar(cont){
  const filas = cont.querySelectorAll('.pdb-fila');
  filas.forEach(f=>{ const q = f.querySelector('.dv-quitar'); if(q) q.style.display = filas.length > 1 ? '' : 'none'; });
}
// Victoria: sus tratamientos (de los conceptos de la caja) con el valor sugerido
const pfmProfVic = ()=> Object.keys(CONCEPTOS).find(vcEsVictoria) || '';
function pfmTratamientos(){
  const vistos = new Set();
  return (CONCEPTOS[pfmProfVic()] || []).filter(c=> (c.tipo||'ingreso')!=='egreso' && !vistos.has(c.concepto) && vistos.add(c.concepto))
    .sort((a,b)=> a.concepto.localeCompare(b.concepto,'es',{numeric:true}));
}
function pfmFila(k){
  const r = document.createElement('div'); r.className = 'pdb-fila pfm-' + k;
  const quitar = `<button type="button" class="dv-quitar">Quitar</button>`;
  const combo = (key, label, lista, o)=> pdCombo('data-f', key, label, lista, o);
  if(k === 'marcas') r.innerHTML = `${combo('marca','Marca', PDB_MARCAS, {req:true})}
      <label class="dv-req"><span class="pd-lab">Producto <em class="pd-cont">0/80</em></span><input data-f="producto" maxlength="80" placeholder="Nombre completo del producto a comprar" autocomplete="off"></label>${quitar}`;
  if(k === 'vip') r.innerHTML = `${combo('producto','Producto', PDF_VIP_PRODS, {req:true})}
      <label class="dv-req">Cantidad<input data-f="cantidad" inputmode="decimal" placeholder="Ej.: 500" data-no-mayus autocomplete="off"></label>
      ${combo('unidad','Unidad', DV_UNIDADES, {req:true, sinMayus:true})}${quitar}`;
  if(k === 'prods') r.innerHTML = `<label class="dv-req">Producto<input data-f="producto" placeholder="Nombre del producto" autocomplete="off"></label>
      <label class="dv-req">Cantidad<input data-f="cantidad" inputmode="decimal" placeholder="Ej.: 1" data-no-mayus autocomplete="off"></label>
      ${combo('unidad','Unidad', DV_UNIDADES, {req:true, sinMayus:true})}${quitar}`;
  if(k === 'trat') r.innerHTML = `${combo('trat','Tratamiento', pfmTratamientos().map(c=> c.concepto), {req:true, ph: pfmTratamientos().length ? 'Escribí o elegí…' : 'Sin tratamientos cargados'})}
      <label>Valor sugerido<input data-f="valor" inputmode="numeric" placeholder="$0" autocomplete="off"></label>${quitar}`;
  pdConectarCombos(r);
  const prod = r.querySelector('[data-f="producto"][maxlength]'), cont = r.querySelector('.pd-cont');
  if(prod && cont) prod.addEventListener('input', ()=>{ cont.textContent = `${prod.value.length}/80`; cont.classList.toggle('lleno', prod.value.length >= 80); });
  if(k === 'trat'){
    const sel = r.querySelector('[data-f="trat"]'), val = r.querySelector('[data-f="valor"]');
    sel.addEventListener('change', ()=>{
      const c = pfmTratamientos().find(x=> x.concepto === mayus(sel.value.trim()));
      val.value = c && c.valor ? Number(c.valor).toLocaleString('es-AR') : ''; val.dataset.mon = c ? (c.valorMoneda || '$') : '$';
      pfmTotal();
    });
    val.addEventListener('input', ()=>{ formatearInputMonto(val); pfmTotal(); });
  }
  const lista = ()=> r.parentElement;
  r.querySelector('.dv-quitar').onclick = ()=>{ const c = lista(); r.remove(); pfmPintarQuitar(c); if(k === 'trat') pfmTotal(); };
  return r;
}
function pfmTotal(){
  const box = document.getElementById('pfmTotal'); if(!box) return;
  const filas = [...document.querySelectorAll('#pfmBody .pfm-trat')];
  const sub = filas.reduce((a,f)=> a + parseMonto(f.querySelector('[data-f="valor"]').value), 0);
  const pct = Number((document.getElementById('pfmDesc').value || '').split('|')[0]) || 0;
  const total = totalConDescuento(sub, pct, '$');
  box.innerHTML = sub ? `Subtotal ${fmtMonto(sub,'$')}${pct ? ` · Descuento −${fmtMonto(sub - total,'$')}` : ''} · <b>Total ${fmtMonto(total,'$')}</b>` : '';
}
function pfmSeccion(n, sec){
  const h = `<div class="dv-sec-h"><span>${String(n).padStart(2,'0')}</span><div><h3>${sec.t}${sec.k === 'nint' ? ' <small>Solo equipo</small>' : ''}</h3></div></div>`;
  const id = 'pfm-' + sec.k;
  let body = '';
  if(sec.k === 'pac') body = `<div class="pdb-g1"><label class="dv-req">Nombre del paciente<div class="ac-wrap"><input type="text" id="pfmPaciente" placeholder="Buscá en pacientes/alumnos…" autocomplete="off"></div></label><label class="dv-req">Fecha<input type="date" id="pfmFecha"></label></div>`;
  if(sec.k === 'breve') body = `<label class="pfm-lab"><span class="pd-lab">Detalle breve <em class="pd-cont" id="pfmBreveCont">0/50</em></span><input id="${id}" maxlength="50" placeholder="Ej.: LABORATORIO DE CONTROL" autocomplete="off"></label>`;
  if(sec.k === 'texto') body = `<textarea id="${id}" rows="5" placeholder="${sec.ph || ''}"></textarea>`;
  if(sec.k === 'npac') body = `<textarea id="${id}" rows="3" placeholder="Lo que tiene que saber el paciente"></textarea>`;
  if(sec.k === 'nint') body = `<textarea id="${id}" rows="3" placeholder="Coordinaciones y tareas para recepción (no lo ve el paciente)"></textarea>`;
  if(sec.k === 'prov') body = `<div class="pdb-g1"><label class="dv-req">Proveedor<select id="${id}">${pfmOpts(['BIOHELPER','YSONUT'])}</select></label></div>`;
  if(['marcas','vip','prods','trat'].includes(sec.k)){
    const mas = {marcas:'+ Agregar otra', vip:'+ Agregar formulación', prods:'+ Agregar otro producto', trat:'+ Agregar tratamiento'}[sec.k];
    body = `<div class="pfm-filas" data-k="${sec.k}"></div><button type="button" class="dv-agregar" data-mas="${sec.k}">${mas}</button>`;
    if(sec.k === 'trat') body += `<div class="pdb-g1 pfm-desc"><label>Descuento<select id="pfmDesc"><option value="">Sin descuento</option>${DESC_VICTORIA.map(d=> `<option value="${d.p}|${escHtml(d.n)}">${escHtml(d.n)}</option>`).join('')}</select></label></div><div class="pfm-total" id="pfmTotal"></div>`;
  }
  return `<section class="dv-sec">${h}${body}</section>`;
}
function pdFormAbrir(tipo){
  if(!pdPuedeCrear()) return;
  const f = PD_FORMS[tipo]; pfmTipo = tipo;
  document.getElementById('pfmTitulo').textContent = f.titulo;
  const body = document.getElementById('pfmBody');
  body.innerHTML = f.secs.map((s,i)=> pfmSeccion(i+1, s)).join('');
  attachAutocomplete(document.getElementById('pfmPaciente'), ()=> pacienteRegistry);
  document.getElementById('pfmFecha').value = hoyISO();
  body.querySelectorAll('.pfm-filas').forEach(c=>{ c.appendChild(pfmFila(c.dataset.k)); pfmPintarQuitar(c); });
  body.querySelectorAll('[data-mas]').forEach(b=> b.onclick = ()=>{
    const c = body.querySelector(`.pfm-filas[data-k="${b.dataset.mas}"]`); const r = pfmFila(b.dataset.mas);
    c.appendChild(r); pfmPintarQuitar(c); const x = r.querySelector('select,input'); if(x) x.focus();
  });
  body.querySelectorAll('select[id]').forEach(sel=> pfmConectarSelect(sel));
  const d = document.getElementById('pfmDesc'); if(d) d.onchange = pfmTotal;
  const breve = document.getElementById('pfm-breve'), bc = document.getElementById('pfmBreveCont');
  if(breve) breve.addEventListener('input', ()=>{ bc.textContent = `${breve.value.length}/50`; bc.classList.toggle('lleno', breve.value.length >= 50); });
  document.getElementById('pfmError').textContent = '';
  pfmPaso('form');
  ovPdForm.classList.add('show'); ovPdForm.querySelector('.modal').scrollTop = 0;
}
// Presupuesto: primero se revisa en el formato de presupuesto y después se envía
let pfmPendiente = null;
function pfmPaso(p){
  const pres = pfmTipo === PD_PRES;
  document.getElementById('pfmBody').classList.toggle('col-hidden', p !== 'form');
  document.getElementById('pfmPrev').classList.toggle('col-hidden', p !== 'prev');
  document.getElementById('pfmVolver').classList.toggle('col-hidden', p !== 'prev');
  document.getElementById('pfmGuardar').textContent = pres && p === 'form' ? 'Revisar presupuesto →' : 'Enviar a secretaría';
  document.getElementById('pfmTitulo').textContent = pres && p === 'prev' ? 'REVISÁ EL PRESUPUESTO' : (PD_FORMS[pfmTipo] || {}).titulo || '';
  if(p === 'form') pfmPendiente = null;
}
document.getElementById('pfmVolver').onclick = ()=> pfmPaso('form');
const pfmCerrar = ()=> ovPdForm.classList.remove('show');
document.getElementById('pfmCerrar').onclick = pfmCerrar;
document.getElementById('pfmCancelar').onclick = pfmCerrar;
// lee las filas de una sección; devuelve {items} o {error}
function pfmLeerFilas(k){
  const filas = [...document.querySelectorAll(`#pfmBody .pfm-filas[data-k="${k}"] .pdb-fila`)];
  const items = [], varias = filas.length > 1;
  for(const [i, r] of filas.entries()){
    const g = n=>{ const e = r.querySelector(`[data-f="${n}"]`); return e ? e.value.trim() : ''; };
    const conOtro = (n, o)=> g(n) === '__otro' ? mayus(g(o)) : g(n);
    const ln = varias ? ` (línea ${i+1})` : '';
    if(k === 'marcas'){
      const marca = mayus(g('marca')), producto = mayus(g('producto')).slice(0,80);
      if(!marca && !producto) continue;
      if(!marca) return {error:`Elegí la marca${ln}.`}; if(!producto) return {error:`Completá el producto${ln}.`};
      items.push({marca, producto});
    }
    if(k === 'vip' || k === 'prods'){
      const producto = mayus(g('producto')), cantidad = g('cantidad'), unidad = g('unidad');
      if(!producto && !cantidad && !unidad) continue;
      if(!producto) return {error:`Completá el producto${ln}.`};
      if(!(Number(String(cantidad).replace(',','.')) > 0)) return {error:`La cantidad debe ser mayor que cero${ln}.`};
      if(!unidad) return {error:`Elegí la unidad${ln}.`};
      items.push({producto, cantidad, unidad});
    }
    if(k === 'trat'){
      const det = mayus(g('trat')), val = parseMonto(g('valor'));
      if(!det && !val) continue;
      if(!det) return {error:`Elegí el tratamiento${ln}.`}; if(!val) return {error:`Completá el valor${ln}.`};
      items.push({det, cant:1, val});
    }
  }
  if(!items.length) return {error: {marcas:'Completá al menos una marca y su producto.', vip:'Completá al menos una formulación.', prods:'Completá al menos un producto.', trat:'Elegí al menos un tratamiento.'}[k]};
  return {items};
}
document.getElementById('pfmGuardar').onclick = async ()=>{
  const err = document.getElementById('pfmError'); err.textContent = '';
  if(pfmPendiente) return pfmEnviar(pfmPendiente);
  const tipo = pfmTipo, f = PD_FORMS[tipo]; if(!f) return;
  const pacTxt = mayus(document.getElementById('pfmPaciente').value.trim());
  const pac = (pacientesFullList || []).find(p=> mayus(p.nombreCompleto || '') === pacTxt);
  if(!pac){ err.textContent = 'Elegí el paciente de la lista. Si no aparece, pedile a recepción que lo dé de alta en Pacientes/alumnos.'; return; }
  const fecha = document.getElementById('pfmFecha').value;
  if(!fecha){ err.textContent = 'Completá la fecha.'; return; }
  const val = id=>{ const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const notasPac = mayus(val('pfm-npac')), notasInt = mayus(val('pfm-nint'));
  const datos = {}; let detalle = '', lineas = [];
  for(const sec of f.secs){
    if(['marcas','vip','prods','trat'].includes(sec.k)){
      const r = pfmLeerFilas(sec.k); if(r.error){ err.textContent = r.error; return; }
      datos[sec.k] = r.items;
    }
  }
  if(tipo === PD_BONO){
    detalle = [...new Set(datos.marcas.map(x=> x.marca))].join(' / ');
    lineas = datos.marcas.map(x=> `${x.marca} — ${x.producto}`);
  }
  if(tipo === PD_VIP){
    detalle = datos.vip.map(x=> x.producto).join(' + ');
    lineas = datos.vip.map(x=> `${x.producto} ${x.cantidad} ${x.unidad}`);
  }
  if(tipo === PD_BIO){
    const prov = val('pfm-prov'); if(!prov){ err.textContent = 'Elegí el proveedor.'; return; }
    datos.proveedor = prov;
    detalle = prov + ': ' + datos.prods.map(x=> x.producto).join(' + ');
    lineas = ['PROVEEDOR: ' + prov, ...datos.prods.map(x=> `${x.producto} ${x.cantidad} ${x.unidad}`)];
  }
  if(tipo === PD_EST){
    detalle = mayus(val('pfm-breve')); const t = val('pfm-texto');
    if(!detalle){ err.textContent = 'Completá el detalle breve.'; return; }
    if(!t){ err.textContent = 'Escribí la indicación de estudios.'; return; }
    lineas = [t];
  }
  if(tipo === PD_MED){
    const t = val('pfm-texto'); if(!t){ err.textContent = 'Escribí el pedido de receta.'; return; }
    detalle = mayus(t.split('\n')[0]); lineas = [t];
  }
  let presupuesto = null;
  if(tipo === PD_PRES){
    const [pct, lbl] = (val('pfmDesc') || '').split('|');
    const sub = datos.trat.reduce((a,x)=> a + x.val, 0), total = totalConDescuento(sub, Number(pct)||0, '$');
    // mismo formato que los presupuestos de la caja (así se arma el PDF igual)
    presupuesto = {paciente: pac.nombreCompleto || pacTxt, profesional: pfmProfVic(), fechaISO: fecha, moneda:'$', items: datos.trat,
      subtotal: sub, costoAdm: 0, descuento: sub - total, descuentoLbl: sub > total ? (lbl || 'Descuento') : '', descuentoPct: Number(pct) || 0, total, redondeo: true,
      notas: notasPac, observaciones: PR_OBSERVACIONES, contacto: UMM_CONTACTO.map(([ic, t])=> ({ic, t}))};
    detalle = datos.trat.map(x=> x.det).join(' + ');
    lineas = [...datos.trat.map(x=> `${x.det} — ${fmtMonto(x.val,'$')}`), lbl ? 'DESCUENTO: ' + lbl : '', 'TOTAL: ' + fmtMonto(presupuesto.total,'$')].filter(Boolean);
  }
  if(notasPac) lineas.push('', 'NOTAS PARA EL PACIENTE: ' + notasPac);
  const pedido = {
      fechaISO: fecha, limiteISO: pdLimite(fecha), pacienteId: pac.id || '', paciente: pac.nombreCompleto || pacTxt,
      tipo, detalle: mayus(detalle).slice(0, 50), indicacion: lineas.join('\n'), datos, notasPaciente: notasPac,
      ...(presupuesto ? {presupuesto} : {}), ...(tipo === PD_BONO ? {bono: datos.marcas} : {}),
      estado: 'pendiente', responsable: '', notas: notasInt};
  if(presupuesto){
    const bt = document.getElementById('pfmGuardar'); bt.disabled = true;
    try{
      const {doc} = await pdfPresupuesto(presupuesto);
      document.getElementById('pfmIframe').src = doc.output('bloburl');
      pfmPaso('prev'); pfmPendiente = pedido; ovPdForm.querySelector('.modal').scrollTop = 0;
    }catch(e){ err.textContent = 'No se pudo armar el presupuesto: ' + e.message; }
    finally{ bt.disabled = false; }
    return;
  }
  return pfmEnviar(pedido);
};
async function pfmEnviar(pedido){
  const err = document.getElementById('pfmError');
  const bt = document.getElementById('pfmGuardar'); if(bt.disabled) return; bt.disabled = true;
  const quien = pdNombreUsuario();
  try{
    await db.collection('pedidosSecretaria').add({
      ...pedido,
      creadoPor: quien, creadoPorUid: currentUser.uid || '',
      historial: [{f: pdAhora(), q: quien, a: 'PEDIDO ENVIADO'}],
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(), actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    pfmCerrar(); pfmPendiente = null; pdFiltro = 'pendiente'; renderPd();
  }catch(e){ err.textContent = 'No se pudo guardar: ' + e.message; }
  finally{ bt.disabled = false; }
}
// Recepción: abre el armado de presupuesto con lo que pidió la médica, para editarlo y exportarlo
document.getElementById('pddPres').onclick = ()=>{
  const p = (pdLista || []).find(x=> x.id === pdAbierto); if(!p || !p.presupuesto) return;
  const pr = p.presupuesto;
  abrirPresupuesto();
  document.getElementById('prPac').value = p.paciente || '';
  document.getElementById('prProf').value = pr.profesional || pfmProfVic();
  document.getElementById('prFecha').value = hoyISO();
  document.getElementById('prNotas').value = p.notasPaciente || '';
  document.getElementById('prItems').innerHTML = '';
  (pr.items || []).forEach(it=>{
    prAgregarFila();
    const f = document.querySelector('#prItems .pr-fila:last-child');
    f.querySelector('.pr-det').value = it.det; f.querySelector('.pr-cant').value = it.cant || 1;
    f.querySelector('.pr-val').value = Number(it.val||0).toLocaleString('es-AR');
  });
  if(!(pr.items || []).length) prAgregarFila();
  const sd = document.getElementById('prDesc');
  if(pr.descuentoPct){
    const v = `${pr.descuentoPct}|${pr.descuentoLbl}`;
    if(![...sd.options].some(o=> o.value === v)) sd.insertAdjacentHTML('beforeend', `<option value="${escHtml(v)}">${escHtml(pr.descuentoLbl)}</option>`);
    sd.value = v;
  }
  prRecalc();
};

function pdAbrirNuevo(){
  if(!pdPuedeCrear()) return;
  ovPdTipo.classList.add('show');
}
function pdAbrirSimple(tipo){
  ['pdnPaciente','pdnDetalle','pdnIndicacion'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('pdnTipo').value = tipo;
  document.getElementById('pdnTipoTxt').textContent = tipo;
  document.getElementById('pdnError').textContent = '';
  document.getElementById('pdnTitulo').textContent = tipo;
  pdContarDetalle();
  ovPdNuevo.classList.add('show');
}
document.getElementById('pdFab').onclick = pdAbrirNuevo;
const pdnCerrar = ()=> ovPdNuevo.classList.remove('show');
document.getElementById('pdnCerrar').onclick = pdnCerrar;
document.getElementById('pdnCancelar').onclick = pdnCerrar;
document.getElementById('pdnGuardar').onclick = async ()=>{
  const err = document.getElementById('pdnError');
  const pacTxt = mayus(document.getElementById('pdnPaciente').value.trim());
  const pac = (pacientesFullList || []).find(p=> mayus(p.nombreCompleto || '') === pacTxt);
  const tipo = document.getElementById('pdnTipo').value;
  const detalle = mayus(document.getElementById('pdnDetalle').value.trim()).slice(0, 50);
  const indicacion = document.getElementById('pdnIndicacion').value.trim();
  if(!pac){ err.textContent = 'Elegí el paciente de la lista. Si no aparece, pedile a recepción que lo dé de alta en Pacientes/alumnos.'; return; }
  if(!tipo){ err.textContent = 'Elegí el tipo de pedido.'; return; }
  if(!detalle){ err.textContent = 'Completá el detalle breve.'; return; }
  if(!indicacion){ err.textContent = 'Escribí la indicación.'; return; }
  const bt = document.getElementById('pdnGuardar'); if(bt.disabled) return; bt.disabled = true;
  const fechaISO = hoyISO(), quien = pdNombreUsuario();
  try{
    await db.collection('pedidosSecretaria').add({
      fechaISO, limiteISO: pdLimite(fechaISO), pacienteId: pac.id || '', paciente: pac.nombreCompleto || pacTxt,
      tipo, detalle, indicacion, estado: 'pendiente', responsable: '', notas: '',
      creadoPor: quien, creadoPorUid: currentUser.uid || '',
      historial: [{f: pdAhora(), q: quien, a: 'PEDIDO ENVIADO'}],
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(), actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    pdnCerrar(); pdFiltro = 'pendiente'; renderPd();
  }catch(e){ err.textContent = 'No se pudo guardar: ' + e.message; }
  finally{ bt.disabled = false; }
};

/* ---------- Detalle (recepción gestiona; Victoria ve y puede cancelar) ---------- */
const ovPdDet = document.getElementById('overlayPdDet');
function pdMetaHtml(p){
  return `<span class="pd-estado pd-${p.estado}">${PD_ESTADOS[p.estado]}</span>
    <span>${escHtml(p.tipo||'')}</span>
    <span class="pd-meta-der">Enviado ${cpFechaCorta(p.fechaISO)} por ${escHtml(p.creadoPor||'')} · Límite <b class="${pdVencido(p)?'pd-vencido':''}">${cpFechaCorta(p.limiteISO)}</b></span>`;
}
const pdTituloTipo = t=> (PD_FORMS[t] && PD_FORMS[t].titulo) || (t === PD_DEV ? 'INDICACIONES / DEVOLUCIÓN' : (t || 'PEDIDO'));
// Presupuesto guardado en el pedido, completo para el PDF (los primeros no guardaban el monto del descuento)
function pdPresCompleto(p){
  const pr = {paciente: p.paciente, fechaISO: p.fechaISO, costoAdm: 0, redondeo: true, notas: p.notasPaciente || '', ...p.presupuesto};
  const sub = Number(pr.subtotal) || (pr.items||[]).reduce((a,i)=> a + (i.cant||1) * (i.val||0), 0);
  pr.subtotal = sub;
  if(pr.descuento == null || (!pr.descuento && sub > pr.total)){ pr.descuento = Math.max(0, sub - (Number(pr.total)||sub)); }
  if(pr.descuento && !pr.descuentoLbl) pr.descuentoLbl = 'Descuento';
  return pr;
}
function pdAbrirDetalle(id){
  const p = (pdLista || []).find(x=> x.id === id); if(!p) return;
  pdAbierto = id;
  const gestiona = currentUser.rol === 'admin' || !pdEsMedica();   // recepción y admins
  const cerradoParaVic = !gestiona && p.estado !== 'pendiente';
  document.getElementById('pddTitulo').textContent = pdTituloTipo(p.tipo);   // siempre el título del formulario (PRESUPUESTO TRATAMIENTOS, INDICACIONES / DEVOLUCIÓN…)
  document.getElementById('pddMeta').innerHTML = pdMetaHtml(p);
  document.getElementById('pddPaciente').textContent = p.paciente || '';
  document.getElementById('pddIndicacion').textContent = p.indicacion || '';
  const esDev = !!p.devolucion;
  document.getElementById('pddIndDe').textContent = (esDev ? 'Devolución de ' : 'Indicación de ') + (pdQuienCorto(p.creadoPor) || 'la médica');
  document.getElementById('pddPdf').classList.toggle('col-hidden', !esDev && !p.presupuesto);
  document.getElementById('pddPres').classList.toggle('col-hidden', !p.presupuesto || !gestiona);
  document.getElementById('pddIndicacion').classList.toggle('pd-ind-corto', esDev);
  const selR = document.getElementById('pddResp');
  const resp = p.responsable || (gestiona && PD_RESPONSABLES.includes(primerNombre()) ? primerNombre() : '');
  const opcR = PD_RESPONSABLES.includes(resp) || !resp ? PD_RESPONSABLES : [...PD_RESPONSABLES, resp];
  selR.innerHTML = '<option value="">Sin asignar</option>' + opcR.map(r=> `<option ${r===resp?'selected':''}>${r}</option>`).join('');
  selR.disabled = !gestiona && !esVictoria();   // la Dra. Victoria también puede asignar el responsable
  const selE = document.getElementById('pddEstado');
  const estados = gestiona ? Object.keys(PD_ESTADOS) : (p.estado === 'pendiente' ? ['pendiente','cancelado'] : [p.estado]);
  selE.innerHTML = estados.map(k=> `<option value="${k}" ${k===p.estado?'selected':''}>${PD_ESTADOS[k]}</option>`).join('');
  selE.disabled = cerradoParaVic;
  const notas = document.getElementById('pddNotas');
  notas.value = p.notas || ''; notas.disabled = cerradoParaVic;
  document.getElementById('pddGuardar').classList.toggle('col-hidden', cerradoParaVic && !esVictoria());
  document.getElementById('pddError').textContent = '';
  const h = Array.isArray(p.historial) ? p.historial.slice().reverse() : [];
  document.getElementById('pddHistN').textContent = h.length;
  document.getElementById('pddHist').innerHTML = h.map(x=> `<div>${escHtml(x.f||'')} · ${escHtml(x.q||'')} · ${escHtml(x.a||'')}</div>`).join('');
  document.getElementById('pddHistWrap').open = false;
  document.getElementById('pddEliminar').classList.toggle('col-hidden', !pdPuedeEliminar(p));
  ovPdDet.classList.add('show');
}
document.getElementById('pddCopiar').onclick = async ()=>{
  const txt = document.getElementById('pddIndicacion').textContent;
  const b = document.getElementById('pddCopiar');
  try{ await navigator.clipboard.writeText(txt); b.textContent = '¡Copiado!'; }
  catch(_){
    const r = document.createRange(); r.selectNodeContents(document.getElementById('pddIndicacion'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Ctrl+C para copiar';
  }
  setTimeout(()=> b.textContent = 'Copiar', 1800);
};
const pddCerrar = ()=>{ ovPdDet.classList.remove('show'); pdAbierto = null; };
document.getElementById('pddCerrar').onclick = pddCerrar;
document.getElementById('pddCerrar2').onclick = pddCerrar;
document.getElementById('pddGuardar').onclick = async ()=>{
  const p = (pdLista || []).find(x=> x.id === pdAbierto); if(!p) return;
  const err = document.getElementById('pddError');
  const resp = document.getElementById('pddResp').value;
  const estado = document.getElementById('pddEstado').value;
  const notas = mayus(document.getElementById('pddNotas').value.trim());
  if(estado === 'cancelado' && !notas){ err.textContent = 'Para cancelar el pedido escribí en Notas el motivo.'; document.getElementById('pddNotas').focus(); return; }
  const quien = pdNombreUsuario(), hist = [];
  const cambios = {};
  if(resp !== (p.responsable||'') && !document.getElementById('pddResp').disabled){ cambios.responsable = resp; hist.push('RESPONSABLE: ' + (resp || 'SIN ASIGNAR')); }
  if(estado !== p.estado){ cambios.estado = estado; hist.push('ESTADO: ' + PD_ESTADOS[estado]); }
  if(notas !== (p.notas||'')){ cambios.notas = notas; hist.push('NOTAS ACTUALIZADAS'); }
  if(!hist.length){ pddCerrar(); return; }
  cambios.historial = [...(Array.isArray(p.historial) ? p.historial : []), ...hist.map(a=> ({f: pdAhora(), q: quien, a}))];
  cambios.actualizadoEn = firebase.firestore.FieldValue.serverTimestamp();
  const bt = document.getElementById('pddGuardar'); if(bt.disabled) return; bt.disabled = true;
  try{ await db.collection('pedidosSecretaria').doc(p.id).update(cambios); pddCerrar(); }
  catch(e){ err.textContent = 'No se pudo guardar: ' + e.message; }
  finally{ bt.disabled = false; }
};

document.getElementById('pddEliminar').onclick = async ()=>{
  const p = (pdLista || []).find(x=> x.id === pdAbierto); if(!pdPuedeEliminar(p)) return;
  if(!await ummConfirm(`¿Eliminar el pedido "${p.detalle || p.tipo || ''}" de ${p.paciente || ''}?\n\nDeja de aparecer en Pedidos secretaría (para Victoria y para recepción).`, {si:'Eliminar'})) return;
  const quien = pdNombreUsuario();
  try{
    await db.collection('pedidosSecretaria').doc(p.id).update({
      eliminado: true, eliminadoPor: quien,
      historial: [...(Array.isArray(p.historial) ? p.historial : []), {f: pdAhora(), q: quien, a: 'PEDIDO ELIMINADO'}],
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    pddCerrar();
  }catch(e){ document.getElementById('pddError').textContent = 'No se pudo eliminar: ' + e.message; }
};

/* ---------- Portal (Gabriela y otras médicas con "pedidos" que entran por Sueroterapia) ---------- */
function pdPortalPreparar(){
  const ok = pdEsMedica();
  document.getElementById('pBtnPedidos').classList.toggle('col-hidden', !ok);
  if(ok) pdIniciar();
}
document.getElementById('pBtnPedidos').onclick = ()=> portalIr('pedidos');
document.getElementById('pPdVolver').onclick = ()=> portalIr('sueros');
document.getElementById('pPdNuevo').onclick = pdAbrirNuevo;

/* =====================================================================
   INDICACIONES / DEVOLUCIÓN (formulario del módulo de Pedro, adaptado)
   La médica completa la devolución, la revisa en PDF y la envía a secretaría.
   Recepción baja el PDF (mismo estilo que los presupuestos) y se lo manda al paciente.
   La "Nota interna" va a las Notas del pedido y no sale en el PDF.
   ===================================================================== */
const DV_DROGAS = ['Ácido alfa-lipoico (ALA)','Ácido glutámico','Ashwaghanda','BCAA','Benfotiamina','Berberina','Berberina clorhidrato',
  'Bisglicinato de magnesio','Cinamaldehído (extracto estandarizado de canela)','Cisteína','Citrato de magnesio','Cobre','Coenzima Q10',
  'Cromo picolinato','DailyLact Kol','GABA','Glicina','Glutamina','Hepar compositum','L-teanina','L-tirosina','Lymphomyosot','Manganeso',
  'Melatonina','Metilcobalamina','Myo-inositol + D-chiro-inositol (40:1)','N-acetil cisteína','Omega 3 (EPA + DHA)','Probiovance D12',
  'Pycnogenol','Rozuvastatina','Selenio','Silimarina','Vitamina B6','Vitamina B9','Vitamina B12','Vitamina C','Vitamina D3','Vitamina K2',
  'Vitamina D3 + K2','Vitamina E','Zinc'].map(mayus);
const DV_UNIDADES = ['mg','mcg','g','UI','mL','gotas','cápsulas','comprimidos','ampollas','caja','frasco','mg/mL','UI/mL'];
const DV_MOMENTOS = ['En ayunas','Con el desayuno','Con la primera comida del día','30 minutos antes del almuerzo','30 minutos antes de la cena',
  '30 minutos antes del almuerzo y de la cena','Con el almuerzo','Con la cena','Con el almuerzo y con la cena','Después de la comida principal',
  'Lejos de las comidas','Antes de acostarse'].map(mayus);
const DV_TIPOS = ['Suplemento o medicación','Formulación magistral','Procedimiento'].map(mayus);
const DV_MAGISTRAL = mayus('Formulación magistral');
const DV_BASE = ['Una cápsula','Un comprimido','Una toma','Un mL','El preparado completo'].map(mayus);
const DV_ETAPAS = ['Desde esta consulta','Primer mes','Meses 2, 3 y 4','Después del primer mes'].map(mayus);
const DV_DURACIONES = ['30 días','5 semanas','12 semanas','1 mes','2 meses','3 meses','4 meses'].map(mayus);
const DV_VIAS = ['Oral','Sublingual','Subcutánea','Endovenosa','Tópica'].map(mayus);
const DV_FRECUENCIAS = ['Todos los días','Cada 12 horas','1 vez por semana','1 a 2 veces por semana','Lunes, miércoles y viernes'].map(mayus);
const DV_DOC_ESTADOS = ['Por preparar','Disponible para envío','Pendiente de envío'].map(mayus);
const DV_HABITOS = [['alimentacion','Alimentación'],['movimiento','Movimiento'],['hidratacion','Hidratación'],['descanso','Descanso y otros cuidados']];
const DV_SEGUIMIENTO = [['registros','Registros domiciliarios'],['estudios','Estudios solicitados'],['control','Próximo control'],['derivaciones','Derivaciones']];
const ovPdDev = document.getElementById('overlayPdDev');
let dvDatos = null, dvN = 0;

// Desplegable con "Otro / escribir" (como en el módulo original)
// Casillero con autocompletado: se escribe y van apareciendo las opciones (también se puede escribir algo que no está)
const PD_LISTAS = {};
function pdCombo(attr, key, label, valores, {req=false, sinMayus=false, ph='Escribí o elegí…'}={}){
  PD_LISTAS[key] = valores;
  return `<label class="${req?'dv-req':''}">${label}<div class="ac-wrap"><input ${attr}="${key}" data-lista="${key}" data-ac-libre data-ac-sin-enter placeholder="${ph}" ${sinMayus?'data-no-mayus':''} autocomplete="off"></div></label>`;
}
function pdConectarCombos(root){
  root.querySelectorAll('input[data-lista]').forEach(inp=>{
    if(inp.dataset.acOk) return; inp.dataset.acOk = '1';
    attachAutocomplete(inp, ()=> PD_LISTAS[inp.dataset.lista] || [], v=> inp.dispatchEvent(new Event('change', {bubbles:true})));
    // si lo escrito coincide con una opción, queda escrito como la opción
    inp.addEventListener('blur', ()=>{ const v = normBusqueda(inp.value.trim()); const o = (PD_LISTAS[inp.dataset.lista] || []).find(x=> normBusqueda(x) === v); if(o && inp.value !== o){ inp.value = o; inp.dispatchEvent(new Event('change', {bubbles:true})); } });
  });
}
const dvPicker = (key, label, valores, opts)=> pdCombo('data-dv', key, label, valores, opts);
function dvLeer(root, key){
  const s = root.querySelector(`[data-dv="${key}"]`); if(!s) return '';
  return s.hasAttribute('data-no-mayus') ? s.value.trim() : mayus(s.value.trim());
}
const dvConectarPickers = root=> pdConectarCombos(root);
function dvAgregarDroga(card){
  const r = document.createElement('div'); r.className = 'dv-droga';
  // Cada componente es una línea completa: Droga / suplemento · Cuándo · Frecuencia · Cantidad · Unidad
  r.innerHTML = dvPicker('droga','Droga / suplemento', DV_DROGAS, {req:true})
    + dvPicker('momento','Cuándo', DV_MOMENTOS, {req:true}) + dvPicker('frecuencia','Frecuencia', DV_FRECUENCIAS)
    + `<label class="dv-req">Cantidad<input data-dv="cantidad" inputmode="decimal" placeholder="Ej.: 500" data-no-mayus autocomplete="off"></label>`
    + dvPicker('unidad','Unidad', DV_UNIDADES, {req:true, sinMayus:true})
    + `<button type="button" class="dv-quitar dv-quitar-comp">Quitar</button>`;
  r.querySelector('[data-dv="unidad"]').dataset.sinMayus = '1';
  r.querySelector('.dv-quitar').onclick = ()=>{ r.remove(); card.dispatchEvent(new Event('dvcomp')); };
  card.querySelector('.dv-componentes').appendChild(r);
  dvConectarPickers(r);
}
function dvAgregarIndicacion(){
  dvN++;
  const c = document.createElement('div'); c.className = 'dv-item';
  c.innerHTML = `<div class="dv-item-h"><b>Indicación ${dvN}</b><button type="button" class="dv-quitar dv-eliminar">Eliminar indicación</button></div>
    <div class="dv-componentes"></div>
    <div class="dv-g2">${dvPicker('etapa','Etapa / inicio', DV_ETAPAS)}${dvPicker('duracion','Duración', DV_DURACIONES)}</div>
    <div class="dv-botones"><button type="button" class="dv-mas-comp">+ Agregar componente al mismo preparado</button><button type="button" class="dv-mas-comp dv-mas-nota">+ Agregar nota para esta indicación</button></div>
    <label class="dv-nota col-hidden">Notas<textarea data-dv="notas" rows="2" placeholder="Aclaraciones particulares para esta indicación"></textarea></label>`;
  dvConectarPickers(c);
  // con más de un componente es un preparado (formulación magistral)
  const pintar = ()=>{
    const varias = c.querySelectorAll('.dv-droga').length > 1;
    c.querySelectorAll('.dv-quitar-comp').forEach(b=> b.style.visibility = varias ? '' : 'hidden');   // con una sola línea no se puede quitar
  };
  c.addEventListener('dvcomp', pintar);
  c.querySelector('.dv-eliminar').onclick = ()=> c.remove();
  c.querySelector('.dv-mas-comp').onclick = ()=>{ dvAgregarDroga(c); pintar(); };
  c.querySelector('.dv-mas-nota').onclick = ()=>{
    const n = c.querySelector('.dv-nota'); n.classList.remove('col-hidden');
    c.querySelector('.dv-mas-nota').classList.add('col-hidden'); n.querySelector('textarea').focus();
  };
  document.getElementById('pdvItems').appendChild(c);
  dvAgregarDroga(c); pintar();
}
function dvAgregarDoc(){
  const r = document.createElement('div'); r.className = 'dv-doc';
  r.innerHTML = `<label>Nombre del documento<input data-dv="nombre" placeholder="Nombre del material o receta" autocomplete="off"></label><label>Estado<select data-dv="estado">${DV_DOC_ESTADOS.map(t=> `<option>${t}</option>`).join('')}</select></label><button type="button" class="dv-quitar">Eliminar</button>`;
  r.querySelector('.dv-quitar').onclick = ()=> r.remove();
  document.getElementById('pdvDocs').appendChild(r);
}
document.getElementById('pdvAddItem').onclick = dvAgregarIndicacion;
document.getElementById('pdvAddDoc').onclick = dvAgregarDoc;
attachAutocomplete(document.getElementById('pdvPaciente'), ()=> pacienteRegistry);

// Profesional: el usuario que carga (Dra. Victoria Barbieri / Dra. Gabriela Baslini)
function dvProfesional(){
  const n = mayus(((currentUser && currentUser.nombre) || '').trim());
  return pdEsMedica() ? 'DRA. ' + n : n;
}
function pdDevAbrir(){
  if(!pdPuedeCrear()) return;
  ovPdDev.querySelectorAll('#pdvForm input, #pdvForm textarea').forEach(x=> x.value = '');
  document.getElementById('pdvFecha').value = hoyISO();
  document.getElementById('pdvProf').value = dvProfesional();
  document.getElementById('pdvItems').innerHTML = ''; dvN = 0; dvAgregarIndicacion();
  document.getElementById('pdvDocs').innerHTML = '';
  document.getElementById('pdvError').textContent = '';
  dvPaso('form');
  ovPdDev.classList.add('show');
  ovPdDev.querySelector('.modal').scrollTop = 0;
}
function dvPaso(p){
  document.getElementById('pdvForm').classList.toggle('col-hidden', p !== 'form');
  document.getElementById('pdvPrev').classList.toggle('col-hidden', p !== 'prev');
  document.getElementById('pdvRevisar').classList.toggle('col-hidden', p !== 'form');
  document.getElementById('pdvVolver').classList.toggle('col-hidden', p !== 'prev');
  document.getElementById('pdvEnviar').classList.toggle('col-hidden', p !== 'prev');
  document.getElementById('pdvTitulo').textContent = p === 'prev' ? 'REVISÁ LA DEVOLUCIÓN' : 'INDICACIONES / DEVOLUCIÓN';
}
const dvVacia = c=> !dvLeer(c,'momento') && [...c.querySelectorAll('.dv-droga')].every(r=> !dvLeer(r,'droga') && !dvLeer(r,'cantidad') && !dvLeer(r,'unidad'))
  && !dvLeer(c,'notas');
function dvRecolectar(){
  const v = id=> mayus(document.getElementById(id).value.trim());
  const pacTxt = v('pdvPaciente');
  const pac = (pacientesFullList || []).find(p=> mayus(p.nombreCompleto || '') === pacTxt);
  if(!pac) return {error: 'Elegí el paciente de la lista. Si no aparece, pedile a recepción que lo dé de alta en Pacientes/alumnos.'};
  const fecha = document.getElementById('pdvFecha').value;
  if(!fecha) return {error: 'Completá la fecha de consulta.'};
  const items = [];
  for(const c of document.querySelectorAll('#pdvItems .dv-item')){
    if(dvVacia(c)) continue;
    const varios = c.querySelectorAll('.dv-droga').length > 1;
    const comps = [...c.querySelectorAll('.dv-droga')].map(r=> ({droga: dvLeer(r,'droga'), momento: dvLeer(r,'momento'), frecuencia: dvLeer(r,'frecuencia'), cantidad: dvLeer(r,'cantidad'), unidad: dvLeer(r,'unidad')}));
    const unicos = k=> [...new Set(comps.map(x=> x[k]).filter(Boolean))].join(' / ');
    const it = {momento: unicos('momento'), tipo: varios ? DV_MAGISTRAL : DV_TIPOS[0], nombre: mayus(dvLeer(c,'nombre')), base: dvLeer(c,'base'),
      etapa: dvLeer(c,'etapa'), duracion: dvLeer(c,'duracion'), notas: mayus(dvLeer(c,'notas')), frecuencia: unicos('frecuencia'),
      componentes: comps};
    const n = c.querySelector('.dv-item-h b').textContent;
    if(it.componentes.some(x=> !x.momento)) return {error: `${n}: elegí cuándo se toma${it.componentes.length > 1 ? ' en cada línea' : ''}.`};
    if(it.componentes.some(x=> !x.droga)) return {error: `${n}: elegí la droga o suplemento.`};
    if(it.componentes.some(x=> !(Number(String(x.cantidad).replace(',','.')) > 0))) return {error: `${n}: cada cantidad debe ser mayor que cero.`};
    if(it.componentes.some(x=> !x.unidad)) return {error: `${n}: elegí la unidad.`};
    items.push(it);
  }
  const habitos = Object.fromEntries(DV_HABITOS.map(([k])=> [k, v('pdv-' + k)]));
  const seguimiento = Object.fromEntries(DV_SEGUIMIENTO.map(([k])=> [k, v('pdv-' + k)]));
  const docs = [...document.querySelectorAll('#pdvDocs .dv-doc')].map(r=> ({nombre: mayus(dvLeer(r,'nombre')), estado: dvLeer(r,'estado')})).filter(d=> d.nombre);
  if(!items.length && !Object.values(habitos).some(Boolean) && !Object.values(seguimiento).some(Boolean) && !v('pdv-notaspac'))
    return {error: 'Completá al menos una indicación para generar la devolución.'};
  return {pac, dv: {fechaConsulta: fecha, profesional: document.getElementById('pdvProf').value, plan: v('pdvPlan'), habitos, items, seguimiento, docs, notasPaciente: v('pdv-notaspac')},
    interno: v('pdv-interno')};
}
// Texto plano de la devolución (para buscar y copiar)
function dvResumen(dv){
  const L = [];
  if(dv.plan) L.push('DURACION DEL PLAN: ' + dv.plan);
  DV_HABITOS.forEach(([k,l])=>{ if(dv.habitos[k]) L.push(mayus(l) + ': ' + dv.habitos[k]); });
  dv.items.forEach((it,i)=> L.push(`${i+1}. ${it.momento} · ${it.componentes.map(c=> `${c.droga} ${c.cantidad} ${c.unidad}`).join(' + ')}${it.duracion ? ' · ' + it.duracion : ''}`));
  DV_SEGUIMIENTO.forEach(([k,l])=>{ if(dv.seguimiento[k]) L.push(mayus(l) + ': ' + dv.seguimiento[k]); });
  dv.docs.forEach(d=> L.push('DOCUMENTO: ' + d.nombre));
  if(dv.notasPaciente) L.push('NOTAS PARA EL PACIENTE: ' + dv.notasPaciente);
  return L.join('\n');
}
document.getElementById('pdvRevisar').onclick = async ()=>{
  const err = document.getElementById('pdvError'); err.textContent = '';
  const r = dvRecolectar();
  if(r.error){ err.textContent = r.error; return; }
  dvDatos = r;
  const bt = document.getElementById('pdvRevisar'); bt.disabled = true;
  try{
    const {doc} = await pdfDevolucion({paciente: r.pac.nombreCompleto, devolucion: r.dv});
    document.getElementById('pdvIframe').src = doc.output('bloburl');
    dvPaso('prev'); ovPdDev.querySelector('.modal').scrollTop = 0;
  }catch(e){ err.textContent = 'No se pudo armar el PDF: ' + e.message; }
  finally{ bt.disabled = false; }
};
document.getElementById('pdvVolver').onclick = ()=> dvPaso('form');
const pdvCerrar = ()=> ovPdDev.classList.remove('show');
document.getElementById('pdvCerrar').onclick = pdvCerrar;
document.getElementById('pdvCancelar').onclick = pdvCerrar;
document.getElementById('pdvEnviar').onclick = async ()=>{
  if(!dvDatos) return;
  const bt = document.getElementById('pdvEnviar'); if(bt.disabled) return; bt.disabled = true;
  const err = document.getElementById('pdvError');
  const fechaISO = hoyISO(), quien = pdNombreUsuario(), {pac, dv, interno} = dvDatos;
  try{
    await db.collection('pedidosSecretaria').add({
      fechaISO, limiteISO: pdLimite(fechaISO), pacienteId: pac.id || '', paciente: pac.nombreCompleto,
      tipo: PD_DEV, detalle: ('DEVOLUCION CONSULTA ' + cpFechaCorta(dv.fechaConsulta)).slice(0, 50),
      indicacion: dvResumen(dv), devolucion: dv, estado: 'pendiente', responsable: '', notas: interno,
      creadoPor: quien, creadoPorUid: currentUser.uid || '',
      historial: [{f: pdAhora(), q: quien, a: 'DEVOLUCION ENVIADA'}],
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(), actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    pdvCerrar(); dvDatos = null; pdFiltro = 'pendiente'; renderPd();
  }catch(e){ err.textContent = 'No se pudo enviar: ' + e.message; }
  finally{ bt.disabled = false; }
};

// PDF de la devolución: mismo encabezado, colores, letra y pie que los presupuestos
async function pdfDevolucion(p){
  const dv = p.devolucion;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42;
  const T = s=> String(s==null?'':s).split('\n').map(limpiarTextoPDF).join('\n');   // respeta los renglones
  const F = await ummCargarFuente(doc);
  const logo = await ummImg('images/logo-hoja.png');
  const LH = 100, LW = logo ? LH * logo.w / logo.h : 80;
  if(logo) doc.addImage(logo.url, 'PNG', M, 40, LW, LH);
  const datos = [['PACIENTE', p.paciente, true], ['FECHA', ecFecha(dv.fechaConsulta)], ['PROFESIONAL', dv.profesional || '-']];
  if(dv.plan) datos.push(['DURACIÓN', dv.plan]);
  const cx = M + LW + 24, cw = W - M - cx, rh = 24, hh = 26, ch = hh + rh * datos.length, cy = 40 + Math.max(0, (LH - ch) / 2);
  doc.setFillColor(...UMM_VERDE); doc.roundedRect(cx, cy, cw, hh, 6, 6, 'F'); doc.rect(cx, cy + hh - 6, cw, 6, 'F');
  doc.setDrawColor(...UMM_VERDE); doc.setLineWidth(1.2); doc.roundedRect(cx, cy, cw, ch, 6, 6, 'S');
  doc.setTextColor(255,255,255); doc.setFont(F,'bold'); doc.setFontSize(10); doc.setCharSpace(2);
  doc.text(T('INDICACIONES Y SUGERENCIAS'), cx + 12, cy + hh/2 + 3.5); doc.setCharSpace(0);
  datos.forEach(([k, v, negrita], i)=>{
    const y = cy + hh + rh * i;
    if(i){ doc.setDrawColor(236,235,227); doc.setLineWidth(0.6); doc.line(cx + 1, y, cx + cw - 1, y); }
    doc.setFont(F,'bold'); doc.setFontSize(7.5); doc.setTextColor(...UMM_VERDE); doc.text(T(k), cx + 12, y + rh/2 + 2.7);
    doc.setFont(F, negrita ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(...UMM_TXT);
    doc.text(doc.splitTextToSize(T(v), cw - 104)[0], cx + 92, y + rh/2 + 3.5);
  });
  let y = Math.max(40 + LH, cy + ch) + 18;
  const nuevaPagSi = alto=>{ if(y + alto > H - 80){ doc.addPage(); y = 50; } };
  const etiqueta = txt=>{ nuevaPagSi(46); y += 14; doc.setFont(F,'bold'); doc.setFontSize(8); doc.setTextColor(...UMM_VERDE); doc.setCharSpace(1.2); doc.text(T(txt), M, y); doc.setCharSpace(0); y += 8; };
  // bloque de texto con subtítulo y barra verde (como las notas de los presupuestos)
  const bloque = (sub, txt)=>{
    doc.setFont(F,'normal'); doc.setFontSize(9.5);
    const lineas = doc.splitTextToSize(T(txt), W - 2*M - 26);
    const bh = lineas.length * 13 + 30;
    nuevaPagSi(Math.min(bh, 200));
    doc.setFillColor(247,247,242); doc.rect(M, y, W - 2*M, bh, 'F'); doc.setFillColor(...UMM_VERDE); doc.rect(M, y, 3, bh, 'F');
    doc.setFont(F,'bold'); doc.setFontSize(8); doc.setTextColor(...UMM_VERDE_OSC); doc.text(T(sub), M + 14, y + 15);
    doc.setFont(F,'normal'); doc.setFontSize(9.5); doc.setTextColor(...UMM_TXT); doc.text(lineas, M + 14, y + 29);
    y += bh + 6;
  };
  const habitos = DV_HABITOS.filter(([k])=> dv.habitos && dv.habitos[k]);
  if(habitos.length){ etiqueta('HÁBITOS Y CUIDADOS'); habitos.forEach(([k,l])=> bloque(mayus(l), dv.habitos[k])); }
  if(dv.items && dv.items.length){
    etiqueta('MEDICACIÓN, SUPLEMENTACIÓN Y PROCEDIMIENTOS');
    // Cada componente: droga con cantidad y unidad (negrita) y debajo cuándo · frecuencia · inicio · duración; una línea fina entre uno y otro
    const ancho = W - 2*M - 28;
    const filas = [];
    dv.items.forEach(it=> (it.componentes||[]).forEach((c, j, arr)=>{
      const ult = j === arr.length - 1;
      filas.push({
        titulo: [c.droga, [c.cantidad, c.unidad].filter(Boolean).join(' ')].filter(Boolean).join('   '),
        detalle: [c.momento || it.momento, c.frecuencia || (arr.length === 1 ? it.frecuencia : ''), it.etapa, it.duracion].filter(Boolean).join('  ·  '),
        notas: ult ? (it.notas || '') : '',
      });
    }));
    y += 6;
    filas.forEach((f, i)=>{
      doc.setFont(F,'normal'); doc.setFontSize(9);
      const det = f.detalle ? doc.splitTextToSize(T(f.detalle), ancho) : [];
      const nts = f.notas ? doc.splitTextToSize(T(f.notas), ancho) : [];
      const alto = 16 + det.length * 12 + (nts.length ? nts.length * 12 + 3 : 0) + 12;
      nuevaPagSi(alto);
      if(i){ doc.setDrawColor(226,224,212); doc.setLineWidth(0.5); doc.line(M + 14, y, W - M - 14, y); }
      y += 17;
      doc.setFont(F,'bold'); doc.setFontSize(10.5); doc.setTextColor(...UMM_TXT);
      doc.text(doc.splitTextToSize(T(f.titulo), ancho)[0], M + 14, y);
      if(det.length){ y += 13; doc.setFont(F,'normal'); doc.setFontSize(9); doc.setTextColor(...UMM_VERDE_OSC); doc.text(det, M + 14, y); y += (det.length - 1) * 12; }
      if(nts.length){ y += 14; doc.setFont(F,'italic'); doc.setFontSize(9); doc.setTextColor(110,110,104); doc.text(nts, M + 14, y); y += (nts.length - 1) * 12; }
      y += 11;
    });
    y += 4;
  }
  const seg = DV_SEGUIMIENTO.filter(([k])=> dv.seguimiento && dv.seguimiento[k]);
  if(seg.length){ etiqueta('SEGUIMIENTO'); seg.forEach(([k,l])=> bloque(mayus(l), dv.seguimiento[k])); }
  if(dv.docs && dv.docs.length){
    etiqueta('DOCUMENTOS');
    dv.docs.forEach(d=>{ nuevaPagSi(16); y += 6; doc.setFillColor(...UMM_TXT); doc.circle(M + 4, y - 3, 1.3, 'F');
      doc.setFont(F,'normal'); doc.setFontSize(9.5); doc.setTextColor(...UMM_TXT); doc.text(T(d.nombre), M + 12, y); y += 8; });
  }
  if(dv.notasPaciente){ etiqueta('NOTAS'); bloque('PARA EL PACIENTE', dv.notasPaciente); }
  // pie de contacto en todas las páginas
  const contactos = UMM_CONTACTO;
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
  const archivo = `indicaciones-${String(p.paciente||'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}-${dv.fechaConsulta}.pdf`;
  return {doc, archivo};
}
document.getElementById('pddPdf').onclick = async ()=>{
  const p = (pdLista || []).find(x=> x.id === pdAbierto); if(!p || (!p.devolucion && !p.presupuesto)) return;
  try{
    const {doc, archivo} = p.devolucion ? await pdfDevolucion(p) : await pdfPresupuesto(pdPresCompleto(p));
    pdAbierto = null; mostrarPreviewPDF(doc, archivo);
  }
  catch(e){ document.getElementById('pddError').textContent = 'No se pudo armar el PDF: ' + e.message; }
};
