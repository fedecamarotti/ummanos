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
    document.getElementById('pdBody').innerHTML = `<tr><td colspan="9" class="empty-state" style="color:#a13a3a;">No se pudieron leer los pedidos: ${escHtml(err.message)}<br>Revisá que en las reglas de Firebase esté la colección <b>pedidosSecretaria</b>.</td></tr>`;
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
  if(pdLista == null){ tb.innerHTML = '<tr><td colspan="9" class="empty-state">Cargando…</td></tr>'; return; }
  document.querySelectorAll('#pdEstados [data-pde]').forEach(b=> b.classList.toggle('active', b.dataset.pde === pdFiltro));
  let lista = pdLista.filter(p=> !pdFiltro || p.estado === pdFiltro);
  if(!lista.length){
    tb.innerHTML = `<tr><td colspan="9" class="empty-state">${pdFiltro==='pendiente' ? 'No hay pedidos pendientes.' : 'No hay pedidos en esta lista.'}</td></tr>`;
    return;
  }
  // Agrupados por paciente: arriba el paciente con el pedido más nuevo; dentro, del más nuevo al más viejo
  const grupos = new Map();
  lista.forEach(p=>{ const k = mayus(p.paciente||'').trim(); if(!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
  const orden = [...grupos.values()].map(g=> g.sort((a,b)=> pdClave(b) - pdClave(a))).sort((a,b)=> pdClave(b[0]) - pdClave(a[0]));
  tb.innerHTML = orden.map(g=> `<tr class="pd-grupo"><td colspan="9"><b>${escHtml(g[0].paciente||'')}</b><span>${g.length} ${g.length===1?'pedido':'pedidos'}</span></td></tr>` + g.map(p=> `<tr data-id="${p.id}" class="pd-fila">
      <td>${cpFechaCorta(p.fechaISO)}</td>
      <td class="left pd-pac-rep"><span>${escHtml(p.paciente||'')}</span></td>
      <td class="pd-tipo">${escHtml(pdQuienCorto(p.creadoPor))}</td>
      <td class="pd-tipo">${escHtml(p.tipo||'')}</td>
      <td class="left">${escHtml(p.detalle||'')}</td>
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
document.getElementById('pdtLista').innerHTML = PD_TIPOS.map(t=> `<button type="button" class="pd-tipo-op" data-t="${t}">${t}</button>`).join('');
document.getElementById('pdtLista').addEventListener('click', e=>{
  const b = e.target.closest('[data-t]'); if(!b) return;
  ovPdTipo.classList.remove('show');
  if(b.dataset.t === PD_DEV) pdDevAbrir(); else pdAbrirSimple(b.dataset.t);
});
document.getElementById('pdtCerrar').onclick = ()=> ovPdTipo.classList.remove('show');
attachAutocomplete(document.getElementById('pdnPaciente'), ()=> pacienteRegistry);
function pdContarDetalle(){
  const n = document.getElementById('pdnDetalle').value.length, c = document.getElementById('pdnCont');
  c.textContent = `${n}/50`; c.classList.toggle('lleno', n >= 50);
}
document.getElementById('pdnDetalle').addEventListener('input', pdContarDetalle);
function pdAbrirNuevo(){
  if(!pdPuedeCrear()) return;
  ovPdTipo.classList.add('show');
}
function pdAbrirSimple(tipo){
  ['pdnPaciente','pdnDetalle','pdnIndicacion'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('pdnTipo').value = tipo;
  document.getElementById('pdnTipoTxt').textContent = tipo;
  document.getElementById('pdnError').textContent = '';
  document.getElementById('pdnLimite').innerHTML = `Fecha límite automática: <b>${cpFechaCorta(pdLimite(hoyISO()))}</b> (el día siguiente; si cae domingo, el lunes).`;
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
function pdAbrirDetalle(id){
  const p = (pdLista || []).find(x=> x.id === id); if(!p) return;
  pdAbierto = id;
  const gestiona = currentUser.rol === 'admin' || !pdEsMedica();   // recepción y admins
  const cerradoParaVic = !gestiona && p.estado !== 'pendiente';
  document.getElementById('pddTitulo').textContent = p.detalle || 'Pedido';
  document.getElementById('pddMeta').innerHTML = pdMetaHtml(p);
  document.getElementById('pddPaciente').textContent = p.paciente || '';
  document.getElementById('pddIndicacion').textContent = p.indicacion || '';
  const esDev = !!p.devolucion;
  document.getElementById('pddIndDe').textContent = (esDev ? 'Devolución de ' : 'Indicación de ') + (pdQuienCorto(p.creadoPor) || 'la médica');
  document.getElementById('pddPdf').classList.toggle('col-hidden', !esDev);
  document.getElementById('pddIndicacion').classList.toggle('pd-ind-corto', esDev);
  const selR = document.getElementById('pddResp');
  const resp = p.responsable || (gestiona && PD_RESPONSABLES.includes(primerNombre()) ? primerNombre() : '');
  const opcR = PD_RESPONSABLES.includes(resp) || !resp ? PD_RESPONSABLES : [...PD_RESPONSABLES, resp];
  selR.innerHTML = '<option value="">Sin asignar</option>' + opcR.map(r=> `<option ${r===resp?'selected':''}>${r}</option>`).join('');
  selR.disabled = !gestiona;
  const selE = document.getElementById('pddEstado');
  const estados = gestiona ? Object.keys(PD_ESTADOS) : (p.estado === 'pendiente' ? ['pendiente','cancelado'] : [p.estado]);
  selE.innerHTML = estados.map(k=> `<option value="${k}" ${k===p.estado?'selected':''}>${PD_ESTADOS[k]}</option>`).join('');
  selE.disabled = cerradoParaVic;
  const notas = document.getElementById('pddNotas');
  notas.value = p.notas || ''; notas.disabled = cerradoParaVic;
  document.getElementById('pddGuardar').classList.toggle('col-hidden', cerradoParaVic);
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
const DV_UNIDADES = ['mg','mcg','g','UI','mL','gotas','cápsulas','comprimidos','ampollas','mg/mL','UI/mL'];
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
function dvPicker(key, label, valores, {req=false, sinMayus=false}={}){
  return `<label class="${req?'dv-req':''}">${label}<select data-dv="${key}"><option value="">Seleccionar…</option>${valores.map(v=> `<option>${escHtml(v)}</option>`).join('')}<option value="__otro">Otro / escribir</option></select><input data-dv-otro="${key}" class="col-hidden" placeholder="Especificar" ${sinMayus?'data-no-mayus':''} autocomplete="off"></label>`;
}
function dvLeer(root, key){
  const s = root.querySelector(`[data-dv="${key}"]`); if(!s) return '';
  if(s.tagName !== 'SELECT') return s.value.trim();
  if(s.value === '__otro'){ const o = root.querySelector(`[data-dv-otro="${key}"]`).value.trim(); return s.dataset.sinMayus ? o : mayus(o); }
  return s.value.trim();
}
function dvConectarPickers(root){
  // sin elegir: "Seleccionar…" en gris, como sugerencia
  root.querySelectorAll('select[data-dv]').forEach(s=>{ const pin = ()=> s.classList.toggle('dv-vacio', !s.value); pin(); s.addEventListener('change', pin); });
  root.querySelectorAll('select[data-dv]').forEach(s=> s.addEventListener('change', ()=>{
    const o = s.parentElement.querySelector('[data-dv-otro]'); if(!o) return;
    o.classList.toggle('col-hidden', s.value !== '__otro'); if(s.value === '__otro') o.focus();
  }));
}
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
    <div class="dv-magistral col-hidden"><div class="dv-g2"><label>Nombre del preparado · opcional<input data-dv="nombre" placeholder="Identificación del preparado" autocomplete="off"></label>${dvPicker('base','Las cantidades de los componentes corresponden a', DV_BASE, {req:true})}</div></div>
    <div class="dv-g2">${dvPicker('etapa','Etapa / inicio', DV_ETAPAS)}${dvPicker('duracion','Duración', DV_DURACIONES)}</div>
    <div class="dv-botones"><button type="button" class="dv-mas-comp">+ Agregar componente al mismo preparado</button><button type="button" class="dv-mas-comp dv-mas-nota">+ Agregar nota para esta indicación</button></div>
    <label class="dv-nota col-hidden">Notas<textarea data-dv="notas" rows="2" placeholder="Aclaraciones particulares para esta indicación"></textarea></label>`;
  dvConectarPickers(c);
  // con más de un componente es un preparado (formulación magistral)
  const pintar = ()=>{
    const varias = c.querySelectorAll('.dv-droga').length > 1;
    c.querySelector('.dv-magistral').classList.toggle('col-hidden', !varias);
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
  document.getElementById('pdvTitulo').textContent = p === 'prev' ? 'Revisá la devolución' : 'Indicaciones / devolución';
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
    if(it.tipo === DV_MAGISTRAL && !it.base) return {error: `${n}: indicá a qué corresponden las cantidades del preparado.`};
    items.push(it);
  }
  const habitos = Object.fromEntries(DV_HABITOS.map(([k])=> [k, v('pdv-' + k)]));
  const seguimiento = Object.fromEntries(DV_SEGUIMIENTO.map(([k])=> [k, v('pdv-' + k)]));
  const docs = [...document.querySelectorAll('#pdvDocs .dv-doc')].map(r=> ({nombre: mayus(dvLeer(r,'nombre')), estado: dvLeer(r,'estado')})).filter(d=> d.nombre);
  if(!items.length && !Object.values(habitos).some(Boolean) && !Object.values(seguimiento).some(Boolean))
    return {error: 'Completá al menos una indicación para generar la devolución.'};
  return {pac, dv: {fechaConsulta: fecha, profesional: document.getElementById('pdvProf').value, plan: v('pdvPlan'), habitos, items, seguimiento, docs},
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
    const body = dv.items.map(it=>{
      const L = [];
      if(it.nombre) L.push('PREPARADO: ' + it.nombre);
      const distintos = new Set(it.componentes.map(c=> (c.momento||'') + '|' + (c.frecuencia||''))).size > 1;
      it.componentes.forEach(c=> L.push(`${c.droga}  ${c.cantidad} ${c.unidad}` + (distintos ? [c.momento, c.frecuencia].filter(Boolean).map(x=> ' · ' + x).join('') : '')));
      if(it.tipo === DV_MAGISTRAL && it.base) L.push('CANTIDADES POR: ' + it.base);
      if(it.composicion) L.push(it.composicion);
      if(it.presentacion) L.push('POR TOMA: ' + it.presentacion);
      const distintosF = new Set(it.componentes.map(c=> (c.momento||'') + '|' + (c.frecuencia||''))).size > 1;
      const extra = [it.via && 'VÍA ' + it.via, !distintosF && it.frecuencia].filter(Boolean).join(' · ');
      if(extra) L.push(extra);
      if(it.notas) L.push(it.notas);
      return [distintosF ? '-' : it.momento, L.join('\n'), [it.etapa, it.duracion].filter(Boolean).join('\n') || '-'];
    });
    doc.autoTable({
      startY: y, margin:{left:M, right:M, bottom:70},
      head: [['Cuándo','Indicación','Inicio / duración'].map(T)], body: body.map(f=> f.map(T)),
      theme: 'plain',
      styles: {font:F, fontSize:9.5, textColor:UMM_TXT, cellPadding:{top:7, bottom:7, left:7, right:7}, valign:'top'},
      headStyles: {fillColor:UMM_VERDE, textColor:255, fontStyle:'bold', fontSize:8.5},
      alternateRowStyles: {fillColor:[247,247,242]},
      columnStyles: {0:{cellWidth:130, fontStyle:'bold'}, 2:{cellWidth:110}},
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  const seg = DV_SEGUIMIENTO.filter(([k])=> dv.seguimiento && dv.seguimiento[k]);
  if(seg.length){ etiqueta('SEGUIMIENTO'); seg.forEach(([k,l])=> bloque(mayus(l), dv.seguimiento[k])); }
  if(dv.docs && dv.docs.length){
    etiqueta('DOCUMENTOS');
    dv.docs.forEach(d=>{ nuevaPagSi(16); y += 6; doc.setFillColor(...UMM_TXT); doc.circle(M + 4, y - 3, 1.3, 'F');
      doc.setFont(F,'normal'); doc.setFontSize(9.5); doc.setTextColor(...UMM_TXT); doc.text(T(d.nombre), M + 12, y); y += 8; });
  }
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
  const p = (pdLista || []).find(x=> x.id === pdAbierto); if(!p || !p.devolucion) return;
  try{ const {doc, archivo} = await pdfDevolucion(p); pdAbierto = null; mostrarPreviewPDF(doc, archivo); }
  catch(e){ document.getElementById('pddError').textContent = 'No se pudo armar el PDF: ' + e.message; }
};
