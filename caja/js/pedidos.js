/* =====================================================================
   PEDIDOS A SECRETARÍA
   La Dra. Victoria (y Fede/Pedro) cargan pedidos para un paciente de Ummana;
   recepción los ve en Movimientos → Pedidos secretaría, copia la indicación,
   se asigna, cambia el estado y deja notas.
   Colección: pedidosSecretaria (nunca se borra: se cancela con nota obligatoria).
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
    pdLista = snap.docs.map(d=> ({id:d.id, ...d.data()}));
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
  const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
  let lista = pdLista.filter(p=> !pdFiltro || p.estado === pdFiltro);
  // pendientes: primero los que vencen antes; el resto, lo último arriba
  lista.sort((a,b)=> pdFiltro === 'pendiente'
    ? ((a.limiteISO||'') < (b.limiteISO||'') ? -1 : (a.limiteISO||'') > (b.limiteISO||'') ? 1 : ms(a.creadoEn)-ms(b.creadoEn))
    : ((a.fechaISO||'') > (b.fechaISO||'') ? -1 : (a.fechaISO||'') < (b.fechaISO||'') ? 1 : ms(b.creadoEn)-ms(a.creadoEn)));
  if(!lista.length){
    tb.innerHTML = `<tr><td colspan="9" class="empty-state">${pdFiltro==='pendiente' ? 'No hay pedidos pendientes.' : 'No hay pedidos en esta lista.'}</td></tr>`;
    return;
  }
  tb.innerHTML = lista.map(p=> `<tr data-id="${p.id}" class="pd-fila">
      <td>${cpFechaCorta(p.fechaISO)}</td>
      <td class="left"><b>${escHtml(p.paciente||'')}</b></td>
      <td class="pd-tipo">${escHtml(pdQuienCorto(p.creadoPor))}</td>
      <td class="pd-tipo">${escHtml(p.tipo||'')}</td>
      <td class="left">${escHtml(p.detalle||'')}</td>
      <td class="${pdVencido(p) ? 'pd-vencido' : ''}">${cpFechaCorta(p.limiteISO)}</td>
      <td><span class="pd-estado pd-${p.estado}">${PD_ESTADOS[p.estado] || ''}</span></td>
      <td>${escHtml(p.responsable || '—')}</td>
      <td class="left pd-notas">${escHtml(p.notas || '')}</td>
    </tr>`).join('');
}
new MutationObserver(()=> plFiltrar('pdBody')).observe(document.getElementById('pdBody'), {childList:true});

document.querySelectorAll('#pdEstados [data-pde]').forEach(b=> b.onclick = ()=>{ pdFiltro = b.dataset.pde; renderPd(); });
document.getElementById('pdBody').addEventListener('click', e=>{
  const tr = e.target.closest('tr[data-id]'); if(tr) pdAbrirDetalle(tr.dataset.id);
});

/* ---------- Nuevo pedido ---------- */
const ovPdNuevo = document.getElementById('overlayPdNuevo');
document.getElementById('pdnTipo').innerHTML = '<option value="">Elegí el tipo…</option>' + PD_TIPOS.map(t=> `<option>${t}</option>`).join('');
attachAutocomplete(document.getElementById('pdnPaciente'), ()=> pacienteRegistry);
function pdContarDetalle(){
  const n = document.getElementById('pdnDetalle').value.length, c = document.getElementById('pdnCont');
  c.textContent = `${n}/50`; c.classList.toggle('lleno', n >= 50);
}
document.getElementById('pdnDetalle').addEventListener('input', pdContarDetalle);
function pdAbrirNuevo(){
  if(!pdPuedeCrear()) return;
  ['pdnPaciente','pdnDetalle','pdnIndicacion'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('pdnTipo').value = '';
  document.getElementById('pdnError').textContent = '';
  document.getElementById('pdnLimite').innerHTML = `Fecha límite automática: <b>${cpFechaCorta(pdLimite(hoyISO()))}</b> (el día siguiente; si cae domingo, el lunes).`;
  pdContarDetalle();
  ovPdNuevo.classList.add('show');
  setTimeout(()=> document.getElementById('pdnPaciente').focus(), 50);
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
  document.getElementById('pddIndDe').textContent = 'Indicación de ' + (pdQuienCorto(p.creadoPor) || 'la médica');
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

/* ---------- Portal (Gabriela y otras médicas con "pedidos" que entran por Sueroterapia) ---------- */
function pdPortalPreparar(){
  const ok = pdEsMedica();
  document.getElementById('pBtnPedidos').classList.toggle('col-hidden', !ok);
  if(ok) pdIniciar();
}
document.getElementById('pBtnPedidos').onclick = ()=> portalIr('pedidos');
document.getElementById('pPdVolver').onclick = ()=> portalIr('sueros');
document.getElementById('pPdNuevo').onclick = pdAbrirNuevo;
