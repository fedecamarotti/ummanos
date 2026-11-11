/* =====================================================================
   VICTORIA CONTABILIDAD — solo Fede. Colección propia "contaVictoria":
   no toca caja, sueros, cremas ni nada más.
   ===================================================================== */
const VC_DETALLES_DEFAULT = {
  ingreso: ['Tratamientos del día', '% Jornada', 'Otros'],
  egreso:  ['Alquiler consultorio', 'Horas extra', 'Aplicación sueroterapia (solo insumos)', 'Compra insumos', 'Otros'],
};
let VC_DETALLES = JSON.parse(JSON.stringify(VC_DETALLES_DEFAULT));   // se reemplaza con contaVictoria/_config
let unsubVcCfg = null;
let mesConta = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };
let contaMovs = [];
let unsubConta = null, contaMesSuscripto = null;
let vcEditId = null, vcTipo = 'ingreso', vcMoneda = '$', vcMedio = '';
const VC_MEDIOS = {efectivo:'Efectivo', transferencia:'Transferencia', debe:'Debe', mp:'Mercado Pago', tarjeta:'Tarjeta'};
/* Ingresos automáticos desde Movimientos (no se guardan acá; se calculan cada vez):
   1) Paciente/alumno = BARBIERI, VICTORIA y concepto RETIRO HONORARIOS MEDICOS
   2) Profesional = BARBIERI, VICTORIA y el cobro lo hizo "profesional" (con o sin jornada) */
let contaAuto = null, unsubContaCaja = null;
const vcClave = v => normBusqueda(v||'').replace(/[^a-z]/g,'');
const vcEsVictoria = v => { const k = vcClave(v); return k.includes('barbieri') && k.includes('victoria'); };
function vcCalcularAuto(movs){
  const out = [];
  movs.filter(noMigrado).forEach(m=>{
    const pagos = pagosDe(m);
    if(vcEsVictoria(m.pac) && vcClave(m.concepto).startsWith('retirohonorariosmedicos')){
      const ps = pagos.filter(p=> p.medio!=='debe');
      (ps.length ? ps : [{medio:'', valor:m.valor}]).forEach((p, i)=> out.push({
        id:`auto_r_${m.id}_${i}`, auto:true, fechaISO:m.fechaISO, tipo:'ingreso', detalle:'Retiro honorarios médicos',
        extra: m.notas || '', moneda: m.moneda==='USD' ? 'USD' : '$', valor: Number(p.valor)||0, medio: p.medio||'', creadoEn: m.creadoEn,
      }));
    }
    if(vcEsVictoria(m.prof)){
      pagos.forEach((p, i)=>{
        // deudas pendientes de sus pacientes (las debe a Ummana o a ella): van a la columna Debe
        if(p.medio==='debe' && !p.saldada){
          out.push({
            id:`auto_d_${m.id}_${i}`, auto:true, fechaISO:m.fechaISO, tipo:'ingreso', detalle: m.pac || 'Sin nombre',
            extra: (m.concepto || '') + (m.jornada ? ' (jornada)' : ''),
            moneda: m.moneda==='USD' ? 'USD' : '$', valor: Number(p.valor)||0, medio: 'debe', creadoEn: m.creadoEn,
          });
          return;
        }
        if(p.cobradoPor!=='profesional' || p.medio==='debe') return;
        out.push({
          id:`auto_c_${m.id}_${i}`, auto:true, fechaISO:m.fechaISO, tipo:'ingreso', detalle:'Cobrado por Victoria',
          extra: (m.pac || '') + (m.jornada ? ' (jornada)' : ''),
          moneda: m.moneda==='USD' ? 'USD' : '$', valor: Number(p.valor)||0, medio: p.medio||'', creadoEn: m.creadoEn,
        });
      });
    }
  });
  return out.filter(x=> x.valor > 0);
}
// Todo lo del mes: lo cargado a mano + lo automático, por fecha
function vcListaCompleta(){
  if(contaMovs==null || contaAuto==null) return null;
  const ms = ts => ts && ts.toMillis ? ts.toMillis() : 0;
  return [...contaMovs, ...contaAuto].sort((a,b)=> a.fechaISO===b.fechaISO ? ms(a.creadoEn)-ms(b.creadoEn) : (a.fechaISO<b.fechaISO?-1:1));
}
const vcEsDebe = m => m.medio==='debe';
// Lo que Victoria le debe a Ummana: movimientos donde ella es la paciente/alumna y quedó "Debe" (de cualquier mes)
function vcDeudaVictoria(){
  return (movimientosDeuda||[]).filter(d=> vcEsVictoria(d.pac))
    .map(d=> ({fecha: d.fechaDisplay||'', detalle: [d.prof, d.concepto].filter(Boolean).join(' · '), notas: d.notas||'', moneda: d.moneda==='USD' ? 'USD' : '$', valor: Number(d.valor)||0}));
}
const vcDeudaFilaHTML = d => `<td>${vcEsc(d.fecha)}</td><td class="left">${vcEsc(d.detalle)}${d.notas ? ` <span class="vc-extra">— ${vcEsc(d.notas)}</span>` : ''}</td><td class="deb">${vcMonto(d.valor, d.moneda)}</td>`;
const vcMesIni = ()=> `${mesConta.year}-${String(mesConta.month).padStart(2,'0')}-01`;
const vcMesFin = ()=>{ let y = mesConta.year, m = mesConta.month+1; if(m>12){ m=1; y++; } return `${y}-${String(m).padStart(2,'0')}-01`; };
const vcEsc = t => String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const vcMonto = (v, mon) => (mon==='USD' ? 'USD ' : '$') + Math.round(Math.abs(v)).toLocaleString('es-AR');
const vcFecha = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}`; };
const vcDetalleHTML = m => vcEsc(m.detalle) + (m.extra ? ` <span class="vc-extra">— ${vcEsc(m.extra)}</span>` : '');

function suscribirConta(){
  if(!esFede()) return;
  if(!unsubVcCfg){
    unsubVcCfg = db.collection('contaVictoria').doc('_config').onSnapshot(d=>{
      const det = d.exists && d.data().detalles;
      if(det && Array.isArray(det.ingreso) && Array.isArray(det.egreso)) VC_DETALLES = {ingreso: det.ingreso, egreso: det.egreso};
    }, ()=>{});
  }
  const clave = vcMesIni();
  if(unsubConta && contaMesSuscripto===clave) return;
  if(unsubConta) unsubConta();
  if(unsubContaCaja) unsubContaCaja();
  contaMesSuscripto = clave;
  contaMovs = null; contaAuto = null;
  unsubContaCaja = db.collection('movimientos').where('fechaISO','>=', vcMesIni()).where('fechaISO','<', vcMesFin())
    .onSnapshot(snap=>{ contaAuto = vcCalcularAuto(snap.docs.map(d=> ({id:d.id, ...d.data()}))); renderConta(); },
      err=>{ contaAuto = []; console.warn('No se pudieron leer los movimientos de la caja', err); renderConta(); });
  unsubConta = db.collection('contaVictoria').where('fechaISO','>=', vcMesIni()).where('fechaISO','<', vcMesFin())
    .onSnapshot(snap=>{
      const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
      contaMovs = snap.docs.map(d=> ({id:d.id, ...d.data()}))
        .sort((a,b)=> a.fechaISO===b.fechaISO ? ms(a.creadoEn)-ms(b.creadoEn) : (a.fechaISO<b.fechaISO?-1:1));
      renderConta();
    }, err=>{
      contaMovs = [];
      document.getElementById('vcTbody').innerHTML = `<tr><td colspan="5" class="empty-state" style="color:#a13a3a;">No se pudieron leer los movimientos: ${vcEsc(err.message)}<br>Revisá que en las reglas de Firebase esté la colección <b>contaVictoria</b>.</td></tr>`;
    });
}
function vcTotales(lista){
  const t = {'$':{ing:0, egr:0, deb:0, n:0}, 'USD':{ing:0, egr:0, deb:0, n:0}};
  // lo que está en "Debe" no entra en ingresos/egresos (todavía no se cobró/pagó)
  lista.forEach(m=>{ const k = m.moneda==='USD' ? 'USD' : '$'; t[k][vcEsDebe(m) ? 'deb' : (m.tipo==='egreso' ? 'egr' : 'ing')] += Number(m.valor)||0; if(!vcEsDebe(m)) t[k].n++; });
  return t;
}
function renderConta(){
  if(vistaActual!=='conta') return;
  document.getElementById('vcMesLabel').textContent = `${MESES[mesConta.month-1]} ${mesConta.year}`;
  const tb = document.getElementById('vcTbody'), tf = document.getElementById('vcTfoot');
  const lista = vcListaCompleta();
  const deudWrap = document.getElementById('vcDeudWrap'); deudWrap.classList.add('col-hidden');
  const dv = vcDeudaVictoria(), dvWrap = document.getElementById('vcDeudVicWrap');
  dvWrap.classList.toggle('col-hidden', !dv.length);
  document.getElementById('vcDeudVicTbody').innerHTML = dv.map(d=> `<tr><td class="editcol"></td>${vcDeudaFilaHTML(d)}</tr>`).join('');
  if(lista==null){ tb.innerHTML = '<tr><td colspan="5" class="empty-state">Cargando…</td></tr>'; tf.innerHTML = ''; return; }
  // Deudores del mes: aparte, sin totales (no son ingresos todavía)
  const deudas = lista.filter(vcEsDebe);
  if(deudas.length){
    deudWrap.classList.remove('col-hidden');
    document.getElementById('vcDeudTbody').innerHTML = deudas.map(m=> `<tr class="${m.auto ? 'vc-auto' : ''}">
      <td class="editcol">${m.auto ? '<span class="vc-auto-ico" title="Viene automático de Movimientos (caja diaria). Se modifica allá.">' + ico('link') + '</span>' : `<button class="editbtn" title="Editar" onclick="abrirConta('${m.id}')">&#9998;</button>`}</td>
      <td>${vcFecha(m.fechaISO)}</td><td class="left">${vcDetalleHTML(m)}</td><td class="deb">${vcMonto(m.valor, m.moneda)}</td></tr>`).join('');
  }
  if(lista.length && !lista.some(m=> !vcEsDebe(m))){ tb.innerHTML = '<tr><td colspan="5" class="empty-state">No hay ingresos ni egresos en este mes.</td></tr>'; tf.innerHTML = ''; return; }
  if(!lista.length){ tb.innerHTML = '<tr><td colspan="5" class="empty-state">No hay movimientos en este mes. Cargalos con "+ Nuevo movimiento".</td></tr>'; tf.innerHTML = ''; return; }
  const fila = m => `<tr class="${m.auto ? 'vc-auto' : ''}">
      <td class="editcol">${m.auto ? '<span class="vc-auto-ico" title="Viene automático de Movimientos (caja diaria). Se modifica allá.">' + ico('link') + '</span>' : `<button class="editbtn" title="Editar" onclick="abrirConta('${m.id}')">&#9998;</button>`}</td>
      <td>${vcFecha(m.fechaISO)}</td>
      <td class="left">${vcDetalleHTML(m)}</td>
      <td class="ing">${!vcEsDebe(m) && m.tipo!=='egreso' ? vcMonto(m.valor, m.moneda) : ''}</td>
      <td class="egr">${!vcEsDebe(m) && m.tipo==='egreso' ? vcMonto(m.valor, m.moneda) : ''}</td>
    </tr>`;
  const mov = lista.filter(m=> !vcEsDebe(m));
  const hayUsd2 = mov.some(m=> m.moneda==='USD');
  const pesos = mov.filter(m=> m.moneda!=='USD'), usd = mov.filter(m=> m.moneda==='USD');
  tb.innerHTML = hayUsd2
    ? (pesos.length ? `<tr class="vc-sep"><td colspan="5">Pesos</td></tr>` + pesos.map(fila).join('') : '')
      + `<tr class="vc-sep"><td colspan="5">Dólares</td></tr>` + usd.map(fila).join('')
    : mov.map(fila).join('');
  const t = vcTotales(lista);
  const totFila = (k, lbl) => `<tr><td class="editcol"></td><td></td><td class="left">${lbl}</td><td class="ing">${vcMonto(t[k].ing, k)}</td><td class="egr">${vcMonto(t[k].egr, k)}</td></tr>`;
  const balFila = (k) => { const b = t[k].ing - t[k].egr; return `<tr><td class="editcol"></td><td></td><td class="left">BALANCE ${k==='USD'?'USD':'$'}</td><td colspan="2" class="${b<0?'egr':'ing'}">${b<0?'−':'+'}${vcMonto(b, k)}</td></tr>`; };
  tf.innerHTML = (t['$'].n ? totFila('$', `TOTALES${hayUsd2?' $':''} <span class="tot-cant">(${t['$'].n} ${t['$'].n===1?'movimiento':'movimientos'})</span>`) + balFila('$') : '')
               + (t['USD'].n ? totFila('USD', `TOTALES USD <span class="tot-cant">(${t['USD'].n})</span>`) + balFila('USD') : '');
}
document.getElementById('vcMesPrev').onclick = ()=>{ mesConta.month--; if(mesConta.month<1){ mesConta.month=12; mesConta.year--; } suscribirConta(); renderConta(); };
document.getElementById('vcMesNext').onclick = ()=>{ mesConta.month++; if(mesConta.month>12){ mesConta.month=1; mesConta.year++; } suscribirConta(); renderConta(); };
document.getElementById('btnConta').onclick = ()=> mostrarVista('conta');

/* ---- Alta / edición ---- */
const overlayConta = document.getElementById('overlayConta');
function vcSetTipo(t, detalle){
  vcTipo = t;
  document.querySelectorAll('#vcTipo button').forEach(b=> b.classList.toggle('active', b.dataset.tipo===t));
  const ops = [...VC_DETALLES[t]];
  if(detalle && !ops.includes(detalle)) ops.push(detalle);   // detalle viejo que ya no está en la lista
  document.getElementById('vcDetalle').innerHTML = '<option value="">Elegí…</option>' + ops.map(o=> `<option>${vcEsc(o)}</option>`).join('');
  document.getElementById('vcDetalle').value = detalle || '';
}
function vcSetMedio(md){
  vcMedio = md || '';
  document.querySelectorAll('#vcMedio button').forEach(b=> b.classList.toggle('active', b.dataset.medio===vcMedio));
}
document.querySelectorAll('#vcMedio button').forEach(b=> b.onclick = ()=> vcSetMedio(b.dataset.medio));
function vcSetMoneda(c){
  vcMoneda = c;
  document.querySelectorAll('#vcMoneda button').forEach(b=> b.classList.toggle('active', b.dataset.cur===c));
}
document.querySelectorAll('#vcTipo button').forEach(b=> b.onclick = ()=> vcSetTipo(b.dataset.tipo));
document.querySelectorAll('#vcMoneda button').forEach(b=> b.onclick = ()=> vcSetMoneda(b.dataset.cur));
document.getElementById('vcValor').addEventListener('input', e=> formatearInputMonto(e.target));
function abrirConta(id){
  if(!esFede()) return;
  const m = id ? (contaMovs||[]).find(x=> x.id===id) : null;
  vcEditId = m ? m.id : null;
  document.getElementById('vcTitulo').textContent = m ? 'Editar movimiento' : 'Nuevo movimiento';
  // fecha por defecto: hoy si se está mirando este mes; si no, el 1° del mes que se mira
  const hoy = hoyISO();
  document.getElementById('vcFecha').value = m ? m.fechaISO : (hoy >= vcMesIni() && hoy < vcMesFin() ? hoy : vcMesIni());
  vcSetTipo(m ? (m.tipo==='egreso'?'egreso':'ingreso') : 'ingreso', m ? m.detalle : '');
  document.getElementById('vcExtra').value = m ? (m.extra||'') : '';
  vcSetMoneda(m && m.moneda==='USD' ? 'USD' : '$');
  vcSetMedio(m ? (m.medio||'') : '');
  document.getElementById('vcValor').value = m ? Number(m.valor||0).toLocaleString('es-AR') : '';
  document.getElementById('vcEliminar').classList.toggle('col-hidden', !m);
  overlayConta.classList.add('show');
}
window.abrirConta = abrirConta;
document.getElementById('vcBtnNuevo').onclick = ()=> abrirConta(null);
const cerrarConta = ()=> overlayConta.classList.remove('show');
document.getElementById('closeConta').onclick = cerrarConta;
document.getElementById('vcCancelar').onclick = cerrarConta;
document.getElementById('vcGuardar').onclick = async ()=>{
  if(!esFede()) return;
  const fechaISO = document.getElementById('vcFecha').value;
  const detalle = document.getElementById('vcDetalle').value;
  const extra = document.getElementById('vcExtra').value.trim();
  const valorTxt = document.getElementById('vcValor').value.trim();
  const valor = parseMonto(valorTxt);
  if(!fechaISO){ alert('Elegí una fecha.'); return; }
  if(!detalle){ alert('Elegí un detalle.'); return; }
  if(!valorTxt || !valor){ alert('Ingresá el total.'); return; }
  if(!vcMedio){ alert('Elegí el medio de pago.'); return; }
  const datos = { fechaISO, tipo: vcTipo, detalle, extra, moneda: vcMoneda, valor, medio: vcMedio,
                  actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() };
  const btn = document.getElementById('vcGuardar'); btn.disabled = true;
  try{
    if(vcEditId) await db.collection('contaVictoria').doc(vcEditId).update(datos);
    else await db.collection('contaVictoria').add({...datos, creadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    // si se cargó en otro mes, se pasa a ese mes para verlo
    const [y, mm] = fechaISO.split('-').map(Number);
    if(y!==mesConta.year || mm!==mesConta.month){ mesConta = {year:y, month:mm}; suscribirConta(); renderConta(); }
    cerrarConta();
  }catch(e){ alert('No se pudo guardar: ' + e.message); }
  btn.disabled = false;
};
document.getElementById('vcEliminar').onclick = async ()=>{
  if(!vcEditId || !await ummConfirm('¿Eliminar este movimiento?')) return;
  try{ await db.collection('contaVictoria').doc(vcEditId).delete(); cerrarConta(); }
  catch(e){ alert('No se pudo eliminar: ' + e.message); }
};

/* ---- Modificar detalles (opciones del desplegable) ---- */
const overlayVcDet = document.getElementById('overlayVcDetalles');
let vcdBorrador = null;
function vcdRender(){
  ['ingreso','egreso'].forEach(t=>{
    const cont = document.getElementById(t==='ingreso' ? 'vcdIngreso' : 'vcdEgreso');
    const lista = vcdBorrador[t];
    cont.innerHTML = lista.map((v,i)=> `<div class="vcd-fila">
        <input type="text" data-no-mayus value="${vcEsc(v).replace(/"/g,'&quot;')}" data-t="${t}" data-i="${i}">
        <button type="button" title="Subir" data-mov="-1" data-t="${t}" data-i="${i}" ${i===0?'disabled':''}>▲</button>
        <button type="button" title="Bajar" data-mov="1" data-t="${t}" data-i="${i}" ${i===lista.length-1?'disabled':''}>▼</button>
        <button type="button" class="q" title="Quitar" data-quitar data-t="${t}" data-i="${i}">✕</button>
      </div>`).join('') || '<div class="hint" style="padding:0;">Sin opciones.</div>';
  });
}
overlayVcDet.addEventListener('input', e=>{
  const inp = e.target.closest('.vcd-fila input'); if(!inp) return;
  vcdBorrador[inp.dataset.t][Number(inp.dataset.i)] = inp.value;
});
overlayVcDet.addEventListener('click', e=>{
  const add = e.target.closest('[data-vcd-add]');
  if(add){ vcdBorrador[add.dataset.vcdAdd].push(''); vcdRender();
    const cont = document.getElementById(add.dataset.vcdAdd==='ingreso' ? 'vcdIngreso' : 'vcdEgreso');
    const ult = cont.querySelector('.vcd-fila:last-child input'); if(ult) ult.focus(); return; }
  const b = e.target.closest('.vcd-fila button'); if(!b) return;
  const l = vcdBorrador[b.dataset.t], i = Number(b.dataset.i);
  if(b.hasAttribute('data-quitar')) l.splice(i, 1);
  else { const j = i + Number(b.dataset.mov); if(j<0 || j>=l.length) return; [l[i], l[j]] = [l[j], l[i]]; }
  vcdRender();
});
document.getElementById('vcBtnDetalles').onclick = ()=>{
  if(!esFede()) return;
  vcdBorrador = {ingreso: [...VC_DETALLES.ingreso], egreso: [...VC_DETALLES.egreso]};
  vcdRender();
  overlayVcDet.classList.add('show');
};
const cerrarVcDet = ()=> overlayVcDet.classList.remove('show');
document.getElementById('closeVcDet').onclick = cerrarVcDet;
document.getElementById('vcdCancelar').onclick = cerrarVcDet;
document.getElementById('vcdGuardar').onclick = async ()=>{
  const limpio = l => [...new Set(l.map(v=> v.trim()).filter(Boolean))];
  const det = {ingreso: limpio(vcdBorrador.ingreso), egreso: limpio(vcdBorrador.egreso)};
  if(!det.ingreso.length || !det.egreso.length){ alert('Dejá al menos una opción en ingresos y una en egresos.'); return; }
  const btn = document.getElementById('vcdGuardar'); btn.disabled = true;
  try{
    await db.collection('contaVictoria').doc('_config').set({detalles: det, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    VC_DETALLES = det;
    cerrarVcDet();
  }catch(e){ alert('No se pudo guardar: ' + e.message); }
  btn.disabled = false;
};

/* ---- PDF: Exportar balance contable ---- */
document.getElementById('vcBtnPDF').onclick = ()=>{
  const lista = vcListaCompleta() || [];
  const mesTxt = `${MESES[mesConta.month-1]} ${mesConta.year}`;
  if(!lista.length){ alert(`No hay movimientos en ${mesTxt}.`); return; }
  const ultimo = new Date(mesConta.year, mesConta.month, 0).getDate();
  const t = vcTotales(lista);
  const tabla = (k, titulo) => {
    const movs = lista.filter(m=> !vcEsDebe(m) && (m.moneda==='USD' ? 'USD' : '$')===k);
    if(!movs.length) return '';
    return `<div class="bal-h4">${titulo}</div>
      <table class="bal-tabla"><thead><tr><th>Fecha</th><th>Detalle</th><th>Ingresos</th><th>Egresos</th></tr></thead>
      <tbody>${movs.map(m=> `<tr><td>${vcFecha(m.fechaISO)}</td><td class="left">${vcDetalleHTML(m)}</td>
        <td class="ing">${m.tipo!=='egreso' ? vcMonto(m.valor, k) : ''}</td><td class="egr">${m.tipo==='egreso' ? vcMonto(m.valor, k) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td class="left">TOTALES</td><td class="ing">${vcMonto(t[k].ing, k)}</td><td class="egr">${vcMonto(t[k].egr, k)}</td></tr></tfoot></table>`;
  };
  const deudas = lista.filter(vcEsDebe);
  const tablaDeud = deudas.length ? `<div class="bal-h4">Deudores del mes</div>
      <table class="bal-tabla bal-deud"><thead><tr><th>Fecha</th><th>Detalle</th><th>Debe</th></tr></thead>
      <tbody>${deudas.map(m=> `<tr><td>${vcFecha(m.fechaISO)}</td><td class="left">${vcDetalleHTML(m)}</td><td class="deb">${vcMonto(m.valor, m.moneda)}</td></tr>`).join('')}</tbody></table>` : '';
  const bal = k => t[k].ing - t[k].egr;
  const balTxt = k => (bal(k)<0 ? '−' : '+') + vcMonto(bal(k), k);
  const principal = t['$'].n ? '$' : 'USD';
  const secundario = principal==='$' && t['USD'].n ? 'USD' : null;
  const html = `
    ${tabla('$', 'Movimientos en pesos')}
    ${tabla('USD', 'Movimientos en dólares')}
    ${tablaDeud}
    ${(()=>{ const dv = vcDeudaVictoria(); return dv.length ? `<div class="bal-h4">Deuda Victoria</div>
      <table class="bal-tabla bal-deud"><thead><tr><th>Fecha</th><th>Detalle</th><th>Debe</th></tr></thead>
      <tbody>${dv.map(d=> `<tr>${vcDeudaFilaHTML(d)}</tr>`).join('')}</tbody></table>` : ''; })()}
    <div class="bal-cierre"><div><div class="t">Balance de ${mesTxt}</div></div>
      <div class="v ${bal(principal)<0?'neg':''}">${balTxt(principal)}${secundario ? `<small class="${bal(secundario)<0?'neg':''}">${balTxt(secundario)}</small>` : ''}</div></div>
    <div class="bal-pie"><span>Ummana</span><span>${mesTxt}</span></div>`;
  abrirVistaPDF('Balance contable · Victoria', html, `Balance contable Victoria - ${mesTxt}`, {
    clase: 'pdf-balance', sinFecha: true,
    derecha: `<div class="m">${mesTxt}</div><div class="r">del 1 al ${ultimo} de ${MESES[mesConta.month-1].toLowerCase()}</div>`,
  });
};

document.querySelectorAll('#fedeTabs [data-ir]').forEach(b=> b.onclick = ()=>{
  const ir = b.dataset.ir;
  if(ir==='sueros' || ir==='cremas' || ir==='movimientos' || ir==='conta' || ir==='informes' || ir==='trat') mostrarVista(ir);
});

/* =====================================================================
   TRATAMIENTOS DEL DÍA (prueba en el usuario de Fede): el profesional elige paciente
   y tratamientos y manda a recepción por WhatsApp lo que hay que cobrar.
   El valor de cada tratamiento se guarda en su concepto (campo "valor").
   ===================================================================== */
const TR_WA_RECEPCION = '5491139208108';   // WhatsApp de Ummana (11 3920-8108)
let trSel = [];   // [{concepto, valor}]
let trEditando = null;
refrescarSelectsDescuento();
attachAutocomplete(document.getElementById('trProf'), ()=> Object.keys(CONCEPTOS).sort((a,b)=> a.localeCompare(b,'es')), ()=>{ trSel = []; trRender(); });
attachAutocomplete(document.getElementById('trPac'), ()=> pacienteRegistry);
document.getElementById('trProf').addEventListener('input', ()=>{ trSel = []; trRender(); });
document.getElementById('trBuscar').addEventListener('input', trRenderLista);
document.getElementById('trDesc').onchange = trRenderTotal;
function trConceptos(){
  const prof = mayus(document.getElementById('trProf').value.trim());
  return (CONCEPTOS[prof] || []).filter(c=> (c.tipo||'ingreso')!=='egreso');
}
function trRender(){ trRenderLista(); trRenderRealizados(); trRenderTotal(); }
function trRenderLista(){
  const cont = document.getElementById('trLista');
  if(!document.getElementById('trProf').value.trim()){ cont.innerHTML = '<div class="tr-vacio">Elegí el profesional para ver sus tratamientos.</div>'; return; }
  const q = document.getElementById('trBuscar').value.trim();
  if(!q){ cont.innerHTML = ''; return; }   // sin búsqueda no se lista nada
  const lista = trConceptos().filter(c=> !q || contiene(c.concepto, q)).sort((a,b)=> a.concepto.localeCompare(b.concepto,'es',{numeric:true}));
  if(!lista.length){ cont.innerHTML = '<div class="tr-vacio">No hay tratamientos.</div>'; return; }
  cont.innerHTML = lista.map(c=>{
    const sel = trSel.some(x=> x.concepto===c.concepto);
    const precio = trEditando===c.id
      ? `<input type="text" inputmode="numeric" class="tr-val-inp" data-id="${c.id}" value="${c.valor ? c.valor.toLocaleString('es-AR') : ''}" placeholder="Valor">`
      : (c.valor ? fmtMonto(c.valor,'$') : 'Sin valor · tocá para cargar');
    return `<div class="tr-item${sel ? ' sel' : ''}"><div class="n">${escHtml(c.concepto)}<div class="p${c.valor || trEditando===c.id ? '' : ' sin'}" data-editar="${c.id}" title="Tocá para cambiar el valor">${precio}</div></div>
      <button type="button" class="tr-mas${sel ? ' ok' : ''}" data-con="${escHtml(c.concepto)}" title="${sel ? 'Quitar' : 'Agregar'}">${sel ? '✓' : '+'}</button></div>`;
  }).join('');
  const inp = cont.querySelector('.tr-val-inp');
  if(inp){
    inp.focus();
    inp.addEventListener('input', ()=> formatearInputMonto(inp));
    const guardar = async ()=>{
      if(trEditando===null) return;
      const id = trEditando; trEditando = null;
      const val = Number(inp.value.replace(/\D/g,'')) || 0;
      try{ await db.collection('conceptos').doc(id).update({valor: val || firebase.firestore.FieldValue.delete()}); }
      catch(e){ alert('No se pudo guardar el valor: ' + e.message); }
      trRenderLista();
    };
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); if(e.key==='Escape'){ trEditando = null; trRenderLista(); } });
    inp.addEventListener('blur', guardar);
  }
}
document.getElementById('trLista').addEventListener('click', e=>{
  const ed = e.target.closest('[data-editar]');
  if(ed && !e.target.closest('input')){ trEditando = ed.dataset.editar; trRenderLista(); return; }
  const b = e.target.closest('.tr-mas'); if(!b) return;
  const con = b.dataset.con, c = trConceptos().find(x=> x.concepto===con);
  if(trSel.some(x=> x.concepto===con)) trSel = trSel.filter(x=> x.concepto!==con);
  else {
    if(!c || !c.valor){ alert('Este tratamiento no tiene valor. Tocá "Sin valor" para cargarlo.'); return; }
    trSel.push({concepto: con, valor: c.valor});
    // se limpia el buscador para seguir escribiendo el próximo
    const bus = document.getElementById('trBuscar'); bus.value = ''; bus.focus();
  }
  trRender();
});
function trRenderRealizados(){
  document.getElementById('trRealizadosBox').classList.toggle('col-hidden', !trSel.length);
  document.getElementById('trRealizadosLab').textContent = `Realizados hoy (${trSel.length})`;
  document.getElementById('trRealizados').innerHTML = trSel.map((x,i)=> `<div class="tr-real"><div class="n">${escHtml(x.concepto)}</div><div class="v">${fmtMonto(x.valor,'$')}</div><button type="button" data-quitar="${i}" title="Quitar">✕</button></div>`).join('');
}
document.getElementById('trRealizados').addEventListener('click', e=>{
  const b = e.target.closest('[data-quitar]'); if(!b) return;
  trSel.splice(+b.dataset.quitar, 1); trRender();
});
function trCalculo(){
  const sub = trSel.reduce((a,x)=> a + x.valor, 0);
  const [pct, lbl] = (document.getElementById('trDesc').value || '').split('|');
  const desc = sub - totalConDescuento(sub, pct, '$');
  return {sub, desc, lbl: lbl||'', total: sub - desc};
}
function trRenderTotal(){
  const d = trCalculo();
  document.getElementById('trTot').innerHTML = `<div><span>Subtotal</span><span>${fmtMonto(d.sub,'$')}</span></div>`
    + (d.desc ? `<div class="d"><span>Descuento (${escHtml(d.lbl)})</span><span>−${fmtMonto(d.desc,'$')}</span></div>` : '')
    + `<div class="t"><span>Total a abonar</span><span>${fmtMonto(d.total,'$')}</span></div>`;
}
document.getElementById('trEnviar').onclick = ()=>{
  const pac = mayus(document.getElementById('trPac').value.trim());
  if(!pac){ alert('Completá el paciente.'); return; }
  if(!trSel.length){ alert('Agregá al menos un tratamiento.'); return; }
  const d = trCalculo();
  const lineas = [pac, '', ...trSel.map(x=> `${x.concepto} - ${fmtMonto(x.valor,'$')}`)];
  if(d.desc) lineas.push(`DESCUENTO - ${fmtMonto(d.desc,'$')}`);
  lineas.push('', `Total a abonar: ${fmtMonto(d.total,'$')}`);
  window.open(`https://wa.me/${TR_WA_RECEPCION}?text=` + encodeURIComponent(lineas.join('\n')), '_blank');
};

/* =====================================================================
   CLASES DE PRUEBA — colección "clasesPrueba" (aparte de la caja)
   ===================================================================== */
const CP_CLASES = ['Tai Chi Chuan','Meditación','Ashtanga Vinyasa','Ashtanga Mysore','Yoga Suave','Hatha Yoga','Chi Kung'];
const CP_HORAS = ['8:00','8:30','10:30','12:00','14:00','17:00','18:30'];
const CP_NOTAS_MAX = 70;   // lo que entra en el casillero de notas (igual en PC y celular)
const CP_PACKS = ['1 / 2 clases','4 clases','8 clases','12 clases'];
let movSub = 'diarios';
// Próximo contacto automático: el día después de la clase de prueba
function cpDiaSiguiente(iso){
  const d = new Date(iso+'T12:00:00'); d.setDate(d.getDate()+1);
  while(d.getDay()===6 || d.getDay()===0) d.setDate(d.getDate()+1);   // si cae sábado o domingo, pasa al lunes
  return d.toISOString().slice(0,10);
}
// Chi Kung solo se dio en septiembre 2026: después no aparece ni en el resumen ni en los desplegables
function cpClasesDe(ym){ return CP_CLASES.filter(c=> c!=='Chi Kung' || ym==='2026-09'); }
const cpClasesMes = ()=> cpClasesDe(mesInicioISO().slice(0,7));
let cpLista = null, unsubCp = null, cpMesSuscripto = null, cpPendiente = false;
function mostrarSubMov(sub){
  movSub = sub;
  document.querySelectorAll('#movSubTabs [data-msub]').forEach(x=> x.classList.toggle('active', x.dataset.msub===sub));
  document.getElementById('panelContainer').classList.toggle('col-hidden', sub==='prueba' || sub==='deriv' || sub==='grande');
  document.getElementById('cpPanel').classList.toggle('col-hidden', sub!=='prueba');
  document.getElementById('dvPanel').classList.toggle('col-hidden', sub!=='deriv');
  document.getElementById('cgPanel').classList.toggle('col-hidden', sub!=='grande');
  if(sub==='grande'){
    if(`${mesActual.year}-${String(mesActual.month).padStart(2,'0')}` < CG_DESDE){
      const [y,m] = CG_DESDE.split('-').map(Number); mesActual = {year:y, month:m}; suscribirMovimientos();
    }
    suscribirCajaGrande(); renderCajaGrande(); cajaChicaSaldo().then(renderCajaGrande);
  }
  actualizarMesLabel();
  if(sub==='prueba'){ suscribirClasesPrueba(); renderClasesPrueba(); }
  if(sub==='deriv'){ suscribirDerivaciones(); renderDerivaciones(); }
}
function suscribirClasesPrueba(){
  const clave = mesInicioISO();
  if(unsubCp && cpMesSuscripto===clave) return;
  if(unsubCp) unsubCp();
  cpMesSuscripto = clave; cpLista = null;
  unsubCp = db.collection('clasesPrueba').where('fechaISO','>=', mesInicioISO()).where('fechaISO','<', mesFinISO())
    .onSnapshot(snap=>{
      cpLista = snap.docs.map(d=> ({id:d.id, ...d.data()}));
      renderClasesPrueba();
    }, err=>{
      cpLista = [];
      document.getElementById('cpBody').innerHTML = `<tr><td colspan="12" class="empty-state" style="color:#a13a3a;">No se pudieron leer las clases de prueba: ${escHtml(err.message)}<br>Revisá que en las reglas de Firebase esté la colección <b>clasesPrueba</b>.</td></tr>`;
    });
}
function cpOrdenadas(){
  const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
  const hNum = h => { const [a,b] = String(h||'99:99').split(':').map(Number); return a*60+(b||0); };
  return (cpLista||[]).slice().sort((a,b)=> a.fechaISO!==b.fechaISO ? (a.fechaISO<b.fechaISO?-1:1) : (hNum(a.hora)-hNum(b.hora) || ((a.orden??1e9)-(b.orden??1e9)) || ms(a.creadoEn)-ms(b.creadoEn)));
}
function renderResumenCp(){
  const mesTxt = `${MESES[mesActual.month-1].toLowerCase()}`;
  document.getElementById('cpTitResumen').textContent = `Resumen de ${mesTxt}`;
  const lista = cpLista || [];
  const CLASES = cpClasesMes();
  const st = {}; CLASES.forEach(c=> st[c] = [0,0,0]);
  const packs = {}; CP_PACKS.forEach(p=> packs[p] = 0);
  lista.forEach(x=>{
    const k = st[x.clase] ? x.clase : null;
    const sumar = arr=>{ arr[0]++; if(x.vino) arr[1]++; if(x.compro) arr[2]++; };
    if(k) sumar(st[k]);
    if(x.compro && packs[x.pack]!=null) packs[x.pack]++;
  });
  const T = [0,0,0]; lista.forEach(x=>{ T[0]++; if(x.vino) T[1]++; if(x.compro) T[2]++; });
  const pct = (v,c)=> c ? Math.round(v/c*100)+'%' : '—';
  const fila = (lbl, f, cls='')=> `<tr><td class="l">${lbl}</td>${CLASES.map(c=> `<td class="${cls}">${f(st[c])}</td>`).join('')}<td class="tt ${cls}">${f(T)}</td></tr>`;
  document.getElementById('cpResumen').innerHTML = `<tr><th></th>${CLASES.map(c=> `<th>${c}</th>`).join('')}<th class="tt">Total</th></tr>`
    + fila('Clases', v=> v[0]) + fila('Asistencias', v=> v[1]) + fila('Ventas', v=> v[2], 'g') + fila('No ventas', v=> v[0]-v[2]) + fila('% Conv.', v=> pct(v[2], v[0]), 'b');
  const totP = Object.values(packs).reduce((a,b)=> a+b, 0);
  document.getElementById('cpPacks').innerHTML = CP_PACKS.map(p=> `<div class="cp-pk"><span>${p}</span><b>${packs[p]}</b></div>`).join('') + `<div class="cp-pk tot"><span>Total</span><b>${totP}</b></div>`;
}
function renderClasesPrueba(){
  if(movSub!=='prueba') return;
  renderResumenCp();
  const tb = document.getElementById('cpBody');
  if(tb.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=date]')){ cpPendiente = true; return; }   // no pisar lo que se está escribiendo
  cpPendiente = false;
  if(cpLista==null){ tb.innerHTML = '<tr><td colspan="12" class="empty-state">Cargando…</td></tr>'; return; }
  const lista = cpOrdenadas();
  if(!lista.length){ tb.innerHTML = '<tr><td colspan="12" class="empty-state">No hay clases de prueba cargadas este mes. Agregalas con "+ Nueva clase de prueba".</td></tr>'; return; }
  const opts = (arr, val)=> `<option value="">—</option>` + arr.map(o=> `<option ${o===val?'selected':''}>${escHtml(o)}</option>`).join('') + (val && !arr.includes(val) ? `<option selected>${escHtml(val)}</option>` : '');
  const sw = (campo, on)=> `<button type="button" class="cp-sw ${on?'on':''}" data-campo="${campo}" aria-pressed="${on?'true':'false'}"><i></i></button>`;
  tb.innerHTML = lista.map(x=> `<tr data-id="${x.id}" class="${x.cerrado ? 'cp-cerrado' : (x.compro ? 'cp-compro' : '')}">
      <td><input type="text" readonly class="cp-fc" data-campo="fechaISO" data-iso="${x.fechaISO||''}" value="${cpFechaCorta(x.fechaISO)}"></td>
      <td><select class="cp-pill ${x.clase?'':'vacio'}" data-campo="clase">${opts(cpClasesDe((x.fechaISO||'').slice(0,7)), x.clase)}</select></td>
      <td><select class="cp-pill ${x.hora?'':'vacio'}" data-campo="hora">${opts(CP_HORAS, x.hora)}</select></td>
      <td class="left"><input type="text" data-campo="alumno" value="${escHtml(x.alumno||'')}" placeholder="Apellido, nombre"></td>
      <td>${sw('vino', !!x.vino)}</td>
      <td><input type="checkbox" data-campo="msjProf" ${x.msjProf?'checked':''}></td>
      <td>${sw('compro', !!x.compro)}</td>
      <td><select class="cp-pill ${x.pack?'':'vacio'}" data-campo="pack">${opts(CP_PACKS, x.pack)}</select></td>
      <td><input type="text" readonly data-campo="proxContacto" data-iso="${x.proxContacto||''}" value="${cpFechaCorta(x.proxContacto)}" placeholder="—" class="cp-fc cp-prox ${x.proxContacto && x.proxContacto<=hoyISO() ? 'cp-vencido' : ''}"></td>
      <td><button type="button" class="cp-sw-estado ${x.cerrado?'cerrado':''}" title="${x.cerrado?'Negocio cerrado':'Abierto'} (tocá para cambiar)" aria-pressed="${x.cerrado?'true':'false'}"><i></i></button></td>
      <td class="left"><input type="text" class="cp-notas" data-campo="notas" maxlength="${CP_NOTAS_MAX}" value="${escHtml(x.notas||'')}"></td>
      <td><button type="button" class="cp-del" title="Eliminar">✕</button></td>
    </tr>`).join('');
}
// Fechas de la planilla en formato corto dd/mm/aa (al tocarlas se abre el calendario)
function cpFechaCorta(iso){ if(!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; }
async function cpGuardar(id, cambios){
  try{ await db.collection('clasesPrueba').doc(id).update({...cambios, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()}); }
  catch(e){ alert('No se pudo guardar: ' + e.message); }
}
const cpBody = document.getElementById('cpBody');
cpBody.addEventListener('change', e=>{
  const el = e.target.closest('[data-campo]'); if(!el || el.classList.contains('cp-sw')) return;
  const id = el.closest('tr').dataset.id, campo = el.dataset.campo;
  let v = el.type==='checkbox' ? el.checked : el.value;
  if(campo==='alumno' || campo==='notas') v = mayus(String(v).trim());
  if(campo==='fechaISO' && !v){ renderClasesPrueba(); return; }
  if(campo==='proxContacto') el.classList.toggle('cp-vencido', !!v && v<=hoyISO());
  if(el.classList.contains('cp-fc')) el.dataset.iso = v;
  if(el.tagName==='SELECT') el.classList.toggle('vacio', !v);
  const x = (cpLista||[]).find(y=> y.id===id); if(x){ x._fechaAnt = x.fechaISO; x[campo] = v; }
  const cambios = {[campo]: v};
  if(campo==='pack' && v){ cambios.compro = true; cambios.proxContacto = ''; if(x){ x.compro = true; x.proxContacto = ''; } }   // si se elige un pack, compró: no hay que volver a contactar
  if(campo==='fechaISO' && x && x._fechaAnt && x.proxContacto && x.proxContacto===cpDiaSiguiente(x._fechaAnt)){ cambios.proxContacto = x.proxContacto = cpDiaSiguiente(v); renderClasesPrueba(); }
  cpGuardar(id, cambios);
  renderResumenCp();
  if(campo==='pack' && v) renderClasesPrueba();
  cpCerrarFecha(el);
});
// Títulos-buscadores de Clases de prueba y Derivaciones: filtran las filas del mes por lo que se ve en cada columna
function plTextoCelda(td){
  const el = td.querySelector('input:not([type=checkbox]), textarea, select, .cp-sw, .cp-sw-estado, input[type=checkbox]');
  if(!el) return '';
  if(el.classList.contains('cp-sw')) return el.classList.contains('on') ? 'si' : 'no';
  if(el.classList.contains('cp-sw-estado')) return el.classList.contains('ok') ? 'concretado' : (el.classList.contains('cerrado') ? 'cerrado' : 'abierto');
  if(el.type==='checkbox') return el.checked ? 'si' : 'no';
  return el.value || '';
}
function plFiltrar(tbodyId){
  const tb = document.getElementById(tbodyId); if(!tb) return;
  const tabla = tb.closest('table');
  const filtros = [...tabla.tHead.rows[0].cells].map(th=>{ const f = th.querySelector('.pl-busca'); return f ? normBusqueda(f.value.trim()) : ''; });
  const activos = filtros.some(Boolean);
  let visibles = 0;
  [...tb.rows].forEach(tr=>{
    if(!tr.dataset.id){ tr.style.display = tr.classList.contains('pl-sinres') ? 'none' : ''; return; }
    const ok = !activos || filtros.every((q, i)=> !q || contiene(plTextoCelda(tr.cells[i]), q));
    tr.style.display = ok ? '' : 'none'; if(ok) visibles++;
  });
  let sr = tb.querySelector('.pl-sinres');
  if(activos && !visibles && tb.querySelector('tr[data-id]')){
    if(!sr){ sr = tb.insertRow(); sr.className = 'pl-sinres'; sr.innerHTML = `<td colspan="12" class="empty-state">Sin resultados para esa búsqueda.</td>`; }
    sr.style.display = '';
  } else if(sr) sr.remove();
}
document.querySelectorAll('.cp-tabla .pl-busca').forEach(f=>{
  const tbId = f.closest('table').tBodies[0].id;
  f.addEventListener('input', ()=> plFiltrar(tbId));
  f.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); f.blur(); } if(e.key==='Escape' && f.value){ e.preventDefault(); f.value=''; plFiltrar(tbId); } });
});
new MutationObserver(()=> plFiltrar('cpBody')).observe(document.getElementById('cpBody'), {childList:true});
new MutationObserver(()=> plFiltrar('dvBody')).observe(document.getElementById('dvBody'), {childList:true});

// Apenas se elige la fecha en el calendario, el casillero vuelve a mostrarse como dd/mm (sin esperar a tocar otra cosa).
// Si se está escribiendo a mano, espera a que el año esté completo.
function cpCerrarFecha(el){
  if(el.classList.contains('cp-fc') && el.type==='date' && /^(19|20)\d\d-/.test(el.value)) setTimeout(()=> el.blur(), 0);
}
cpBody.addEventListener('click', async e=>{
  const sw = e.target.closest('.cp-sw');
  if(sw){
    const id = sw.closest('tr').dataset.id, campo = sw.dataset.campo, on = !sw.classList.contains('on');
    sw.classList.toggle('on', on); sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    const x = (cpLista||[]).find(y=> y.id===id); if(x) x[campo] = on;
    const cambios = {[campo]: on};
    if(campo==='compro' && on){ cambios.proxContacto = ''; if(x) x.proxContacto = ''; }   // compró: no hay que volver a contactar
    if(campo==='compro') renderClasesPrueba();   // la fila se pone verde (o vuelve a la normalidad)
    cpGuardar(id, cambios); renderResumenCp();
    return;
  }
  const est = e.target.closest('.cp-sw-estado');
  if(est){
    const tr = est.closest('tr'), id = tr.dataset.id, cerrado = !est.classList.contains('cerrado');
    const x = (cpLista||[]).find(y=> y.id===id); if(x) x.cerrado = cerrado;
    const cambios = {cerrado};
    if(cerrado){ cambios.proxContacto = ''; if(x) x.proxContacto = ''; }   // negocio cerrado: no hay que volver a contactar
    cpGuardar(id, cambios);
    renderClasesPrueba();
    if(cerrado && !((x && x.notas) || '').trim()) setTimeout(()=> alert('Recuerde motivo en nota'), 50);
    return;
  }
  const del = e.target.closest('.cp-del');
  if(del){
    const tr = del.closest('tr'), x = (cpLista||[]).find(y=> y.id===tr.dataset.id);
    if(!await ummConfirm(`¿Eliminar la clase de prueba${x && x.alumno ? ' de ' + x.alumno : ''}?`)) return;
    try{ await db.collection('clasesPrueba').doc(tr.dataset.id).delete(); }catch(err){ alert('No se pudo eliminar: ' + err.message); }
  }
});
// Enter guarda y sale del casillero (como al hacer clic afuera)
cpBody.addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target.matches('input[type=text], input[type=date]')){ e.preventDefault(); e.target.blur(); }
});
// Próx. contacto vacío muestra "—"; al tocarlo se convierte en fecha
cpBody.addEventListener('focusin', e=>{
  const el = e.target;
  if(el.classList && el.classList.contains('cp-fc') && el.type==='text'){ el.readOnly = false; el.type = 'date'; el.value = el.dataset.iso || ''; try{ el.showPicker(); }catch(_){} }
});
cpBody.addEventListener('focusout', e=>{
  const el = e.target;
  if(el.classList && el.classList.contains('cp-fc') && el.type==='date'){
    if(el.value || el.dataset.campo!=='fechaISO') el.dataset.iso = el.value;
    el.type = 'text'; el.readOnly = true; el.value = cpFechaCorta(el.dataset.iso);
  }
});
cpBody.addEventListener('focusout', ()=> setTimeout(()=>{ if(cpPendiente && !cpBody.contains(document.activeElement)) renderClasesPrueba(); }, 50));
const ovCpNueva = document.getElementById('overlayCpNueva');
function cpnLlenarClases(){
  const sel = document.getElementById('cpnClase'), actual = sel.value;
  const cl = cpClasesDe((document.getElementById('cpnFecha').value||'').slice(0,7));
  sel.innerHTML = '<option value="">Elegí la clase…</option>' + cl.map(c=> `<option ${c===actual?'selected':''}>${escHtml(c)}</option>`).join('');
}
function cpAbrirNueva(){
  const hoy = hoyISO();
  document.getElementById('cpnFecha').value = hoy >= mesInicioISO() && hoy < mesFinISO() ? hoy : mesInicioISO();
  document.getElementById('cpnClase').value = '';
  cpnLlenarClases();
  document.getElementById('cpnHora').innerHTML = '<option value="">Elegí la hora…</option>' + CP_HORAS.map(h=> `<option>${h}</option>`).join('');
  document.getElementById('cpnAlumno').value = '';
  ovCpNueva.classList.add('show');
  setTimeout(()=> document.getElementById('cpnClase').focus(), 50);
}
// "+" flotante: en Clases de prueba carga una clase; en el resto, un movimiento
document.getElementById('fabNuevo').onclick = ()=>{
  if(movSub==='prueba') cpAbrirNueva();
  else if(movSub==='deriv') dvAbrirNueva();
  else document.getElementById('btnNuevo').click();
};
// Resumen + packs de clases de prueba: se pueden minimizar (queda recordado en este navegador)
(function(){
  const arriba = document.querySelector('.cp-arriba'), bt = document.getElementById('cpToggle');
  const aplicar = min=>{ arriba.classList.toggle('min', min); bt.title = min ? 'Expandir' : 'Minimizar'; bt.setAttribute('aria-label', bt.title + ' resumen'); };
  let min = false; try{ min = localStorage.getItem('cpResumenMin')==='1'; }catch(_){}
  aplicar(min);
  bt.onclick = ()=>{ min = !arriba.classList.contains('min'); aplicar(min); try{ localStorage.setItem('cpResumenMin', min?'1':'0'); }catch(_){} };
})();
document.getElementById('cpnFecha').addEventListener('change', cpnLlenarClases);
const cpnCerrar = ()=> ovCpNueva.classList.remove('show');
document.getElementById('cpnCerrar').onclick = cpnCerrar;
document.getElementById('cpnCancelar').onclick = cpnCerrar;
document.getElementById('cpnAlumno').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('cpnGuardar').click(); });
document.getElementById('cpnGuardar').onclick = async ()=>{
  const fechaISO = document.getElementById('cpnFecha').value;
  const clase = document.getElementById('cpnClase').value, hora = document.getElementById('cpnHora').value;
  const alumno = mayus(document.getElementById('cpnAlumno').value.trim());
  if(!fechaISO){ alert('Elegí la fecha de la clase de prueba.'); return; }
  if(!clase || !hora || !alumno){ alert('Completá clase, hora y alumno/a.'); return; }
  const btn = document.getElementById('cpnGuardar'); btn.disabled = true;
  try{
    await db.collection('clasesPrueba').add({fechaISO, clase, hora, alumno, vino:false, msjProf:false, compro:false, pack:'', msjPost:false, notas:'', proxContacto: cpDiaSiguiente(fechaISO),
      creadoPor: currentUser ? currentUser.nombre : '', creadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    cpnCerrar();
    // si es de otro mes, se muestra ese mes
    if(fechaISO < mesInicioISO() || fechaISO >= mesFinISO()){
      const [y, m] = fechaISO.split('-').map(Number);
      mesActual = {year:y, month:m}; actualizarMesLabel(); suscribirMovimientos(); suscribirClasesPrueba(); renderClasesPrueba();
    }
  }catch(e){ alert('No se pudo cargar: ' + e.message); }
  btn.disabled = false;
};

// Alarmas de "próx. contacto": vencen el mismo día de la fecha puesta → globo rojo en "Clases de prueba"
let cpContactos = [], unsubCpContactos = null;
function renderCpContactosCount(){
  const hoy = hoyISO();
  const n = cpContactos.filter(x=> x.proxContacto && x.proxContacto <= hoy).length;
  const b = document.getElementById('mSubPruebaN');
  if(b){ b.textContent = n; b.classList.toggle('col-hidden', !n); }
}
function suscribirCpContactos(){
  if(unsubCpContactos) return;
  unsubCpContactos = db.collection('clasesPrueba').where('proxContacto','>','')
    .onSnapshot(snap=>{ cpContactos = snap.docs.map(d=> ({id:d.id, ...d.data()})); renderCpContactosCount(); },
      err=> console.warn('No se pudieron leer los próximos contactos', err));
  setInterval(renderCpContactosCount, 5*60*1000);   // por si la pantalla queda abierta y cambia el día
}

/* =====================================================================
   DERIVACIONES — colección "derivaciones" (misma lógica que Clases de prueba)
   ===================================================================== */
const DV_MOTIVO_MAX = 100;   // dos renglones de ~50 caracteres
let dvLista = null, unsubDv = null, dvMesSuscripto = null, dvPendiente = false;
// Devuelve el nombre tal cual está en la lista ('' si quedó vacío, null si no existe)
function dvProfDeLista(v){
  const k = normBusqueda(String(v||'').trim()); if(!k) return '';
  return dvProfesionales().find(n=> normBusqueda(n)===k) ?? null;
}
// Estado: '' abierto · 'ok' concretado (fila verde) · 'cerrado' (fila pálida)
const dvEstado = x=> x.estado || (x.cerrado ? 'cerrado' : '');
// La fecha de turno agendado avisa (rojo + globito) cuando llega el día, mientras la derivación siga abierta
const dvAgendVencida = x=> !!x.fechaAgend && x.fechaAgend <= hoyISO() && !dvEstado(x);
// Próx. contacto avisa cuando llega el día, salvo que ya tenga turno agendado (si se borra el turno, vuelve a avisar)
const dvProxVencido = x=> !!x.proxContacto && x.proxContacto <= hoyISO() && !x.fechaAgend && !dvEstado(x);
const dvFechaCorta = iso=> { if(!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}`; };
// Profesionales que atienden (sin cajas, alquileres ni gastos)
function dvProfesionales(){
  return todosLosNombresDeProfesionales().filter(n=>{
    if(NO_ES_AREA.test(n)) return false;
    const cs = CONCEPTOS[n] || [];
    return cs.length ? cs.some(c=> tipoConcepto(n, c.concepto)==='ingreso') : true;
  });
}
function suscribirDerivaciones(){
  const clave = mesInicioISO();
  if(unsubDv && dvMesSuscripto===clave) return;
  if(unsubDv) unsubDv();
  dvMesSuscripto = clave; dvLista = null;
  unsubDv = db.collection('derivaciones').where('fechaISO','>=', mesInicioISO()).where('fechaISO','<', mesFinISO())
    .onSnapshot(snap=>{ dvLista = snap.docs.map(d=> ({id:d.id, ...d.data()})); renderDerivaciones(); },
      err=>{
        dvLista = [];
        document.getElementById('dvBody').innerHTML = `<tr><td colspan="12" class="empty-state" style="color:#a13a3a;">No se pudieron leer las derivaciones: ${escHtml(err.message)}<br>Revisá que en las reglas de Firebase esté la colección <b>derivaciones</b>.</td></tr>`;
      });
}
function dvAjustarAlto(t){ t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 34) + 'px'; }
function renderDerivaciones(){
  if(movSub!=='deriv') return;
  const tb = document.getElementById('dvBody');
  if(tb.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=date], textarea')){ dvPendiente = true; return; }
  dvPendiente = false;
  if(dvLista==null){ tb.innerHTML = '<tr><td colspan="12" class="empty-state">Cargando…</td></tr>'; return; }
  const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
  const lista = dvLista.slice().sort((a,b)=> a.fechaISO!==b.fechaISO ? (a.fechaISO<b.fechaISO?-1:1) : ((a.orden??1e9)-(b.orden??1e9) || ms(a.creadoEn)-ms(b.creadoEn)));
  if(!lista.length){ tb.innerHTML = '<tr><td colspan="12" class="empty-state">No hay derivaciones cargadas este mes. Agregalas con el "+".</td></tr>'; return; }
  const sw = (campo, on)=> `<button type="button" class="cp-sw ${on?'on':''}" data-campo="${campo}" aria-pressed="${on?'true':'false'}"><i></i></button>`;
  tb.innerHTML = lista.map(x=> `<tr data-id="${x.id}" class="${({ok:'dv-ok', cerrado:'cp-cerrado'})[dvEstado(x)] || ''}">
      <td><input type="text" readonly class="cp-fc" data-campo="fechaISO" data-iso="${x.fechaISO||''}" value="${dvFechaCorta(x.fechaISO)}"></td>
      <td class="left"><div class="ac-wrap"><input type="text" class="dv-pac" data-campo="paciente" data-ac-libre value="${escHtml(x.paciente||'')}" placeholder="Apellido, nombre" autocomplete="off"></div></td>
      <td class="left"><textarea class="dv-motivo" data-campo="motivo" rows="1" maxlength="${DV_MOTIVO_MAX}">${escHtml(x.motivo||'')}</textarea></td>
      <td><div class="ac-wrap"><input type="text" class="dv-prof" data-campo="profDeriva" value="${escHtml(x.profDeriva||'')}" placeholder="—" autocomplete="off"></div></td>
      <td><div class="ac-wrap"><input type="text" class="dv-prof" data-campo="derivaA" value="${escHtml(x.derivaA||'')}" placeholder="—" autocomplete="off"></div></td>
      <td><input type="text" readonly data-campo="proxContacto" data-iso="${x.proxContacto||''}" value="${dvFechaCorta(x.proxContacto)}" placeholder="—" class="cp-fc cp-prox ${dvProxVencido(x) ? 'cp-vencido' : ''}"></td>
      <td>${sw('enviado', !!x.enviado)}</td>
      <td>${sw('agendado', !!x.agendado)}</td>
      <td><input type="text" readonly data-campo="fechaAgend" data-iso="${x.fechaAgend||''}" value="${dvFechaCorta(x.fechaAgend)}" placeholder="—" class="cp-fc cp-prox ${dvAgendVencida(x) ? 'cp-vencido' : ''}"></td>
      <td><button type="button" class="cp-sw-estado dv-sw3 ${dvEstado(x)}" title="${({ok:'Concretado', cerrado:'Cerrado'})[dvEstado(x)] || 'Abierto'} — izquierda: concretado · medio: abierto · derecha: cerrado"><i></i></button></td>
      <td class="left"><input type="text" class="cp-notas" data-campo="notas" maxlength="${CP_NOTAS_MAX}" value="${escHtml(x.notas||'')}"></td>
      <td><button type="button" class="cp-del" title="Eliminar">✕</button></td>
    </tr>`).join('');
  tb.querySelectorAll('textarea.dv-motivo').forEach(dvAjustarAlto);
}
async function dvGuardar(id, cambios){
  try{ await db.collection('derivaciones').doc(id).update({...cambios, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()}); }
  catch(e){ alert('No se pudo guardar: ' + e.message); }
}
const dvBody = document.getElementById('dvBody');
function dvCambio(el){
  const id = el.closest('tr').dataset.id, campo = el.dataset.campo;
  let v = el.value;
  if(campo==='paciente') v = mayus(String(v).trim());
  if(campo==='profDeriva' || campo==='derivaA'){
    v = dvProfDeLista(v);
    if(v==null){ const x0 = (dvLista||[]).find(y=> y.id===id); el.value = x0 ? (x0[campo]||'') : ''; alert('Elegí un profesional de la lista.'); return; }
    el.value = v;
  }
  if(campo==='motivo') v = mayus(String(v).replace(/\s*\n\s*/g,' ').trim());
  if(campo==='notas') v = mayus(String(v).trim());
  if(campo==='fechaISO' && !v){ renderDerivaciones(); return; }
  const x = (dvLista||[]).find(y=> y.id===id);
  if(campo==='proxContacto') el.classList.toggle('cp-vencido', !!v && v<=hoyISO() && !(x && (x.fechaAgend || dvEstado(x))));
  if(campo==='fechaAgend'){
    const pc = el.closest('tr').querySelector('[data-campo=proxContacto]');
    if(pc && x) pc.classList.toggle('cp-vencido', dvProxVencido({...x, fechaAgend: v}));
  }
  if(campo==='fechaAgend') el.classList.toggle('cp-vencido', !!v && v<=hoyISO() && !(x && dvEstado(x)));
  if(el.classList.contains('cp-fc')) el.dataset.iso = v;
  if(el.tagName==='SELECT') el.classList.toggle('vacio', !v);
  const ant = x ? x.fechaISO : null;
  if(x){ if(x[campo]===v) return; x[campo] = v; }
  const cambios = {[campo]: v};
  // si se corrige la fecha y el próx. contacto era el automático, se corre también
  if(campo==='fechaISO' && x && ant && x.proxContacto && x.proxContacto===cpDiaSiguiente(ant)){ cambios.proxContacto = x.proxContacto = cpDiaSiguiente(v); renderDerivaciones(); }
  dvGuardar(id, cambios);
}
dvBody.addEventListener('change', e=>{
  const el = e.target.closest('[data-campo]'); if(!el || el.classList.contains('cp-sw')) return;
  dvCambio(el);
  cpCerrarFecha(el);
});
dvBody.addEventListener('input', e=>{ if(e.target.matches('textarea.dv-motivo')) dvAjustarAlto(e.target); });
dvBody.addEventListener('click', async e=>{
  const sw = e.target.closest('.cp-sw');
  if(sw){
    const id = sw.closest('tr').dataset.id, campo = sw.dataset.campo, on = !sw.classList.contains('on');
    sw.classList.toggle('on', on); sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    const x = (dvLista||[]).find(y=> y.id===id); if(x) x[campo] = on;
    dvGuardar(id, {[campo]: on});
    return;
  }
  const est = e.target.closest('.cp-sw-estado');
  if(est){
    const id = est.closest('tr').dataset.id;
    const x = (dvLista||[]).find(y=> y.id===id) || {};
    const r = est.getBoundingClientRect(), pos = (e.clientX - r.left) / r.width;
    const zona = pos < 1/3 ? 'ok' : (pos > 2/3 ? 'cerrado' : '');
    const actual = dvEstado(x);
    const estado = zona===actual ? '' : zona;   // tocar donde ya está la vuelve al medio
    const cambios = {estado, cerrado: estado==='cerrado'};
    if(estado){ cambios.proxContacto = ''; }                    // concretado o cerrado: no hay que volver a contactar
    if(estado==='cerrado'){ cambios.fechaAgend = ''; }          // cerrado: tampoco queda turno
    Object.assign(x, cambios);
    dvGuardar(id, cambios);
    renderDerivaciones(); renderDvContactosCount();
    if(estado==='cerrado' && !(x.notas || '').trim()) setTimeout(()=> alert('Recuerde motivo en nota'), 50);
    return;
  }
  const del = e.target.closest('.cp-del');
  if(del){
    const tr = del.closest('tr'), x = (dvLista||[]).find(y=> y.id===tr.dataset.id);
    if(!await ummConfirm(`¿Eliminar la derivación${x && x.paciente ? ' de ' + x.paciente : ''}?`)) return;
    try{ await db.collection('derivaciones').doc(tr.dataset.id).delete(); }catch(err){ alert('No se pudo eliminar: ' + err.message); }
  }
});
// Enter guarda y sale del casillero (también en Motivo: no hay saltos de línea, el texto pasa solo al segundo renglón)
dvBody.addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target.matches('input[type=text], input[type=date], textarea')){
    if((e.target.classList.contains('dv-pac') || e.target.classList.contains('dv-prof')) && e.target.closest('.ac-wrap').querySelector('.ac-dropdown.show .ac-option.activo')) return;   // está eligiendo de la lista
    e.preventDefault(); e.target.blur();
  }
});
dvBody.addEventListener('focusin', e=>{
  const el = e.target;
  if(el.classList && el.classList.contains('cp-fc') && el.type==='text'){ el.readOnly = false; el.type = 'date'; el.value = el.dataset.iso || ''; try{ el.showPicker(); }catch(_){} }
  // Paciente: sugiere de la lista de pacientes (se arma la lista recién al tocar el casillero)
  if(el.classList && el.classList.contains('dv-pac') && !el._ac){
    el._ac = true;
    attachAutocomplete(el, ()=> pacienteRegistry, ()=> dvCambio(el));
    el.dispatchEvent(new Event('focus'));
  }
  if(el.classList && el.classList.contains('dv-prof') && !el._ac){
    el._ac = true;
    attachAutocomplete(el, dvProfesionales, ()=> dvCambio(el));
    el.dispatchEvent(new Event('focus'));
  }
});
dvBody.addEventListener('focusout', e=>{
  const el = e.target;
  if(el.classList && el.classList.contains('cp-fc') && el.type==='date'){
    if(el.value || el.dataset.campo!=='fechaISO') el.dataset.iso = el.value;
    el.type = 'text'; el.readOnly = true; el.value = dvFechaCorta(el.dataset.iso);
  }
  setTimeout(()=>{ if(dvPendiente && !dvBody.contains(document.activeElement)) renderDerivaciones(); }, 50);
});

// Nueva derivación
const ovDvNueva = document.getElementById('overlayDvNueva');
attachAutocomplete(document.getElementById('dvnPaciente'), ()=> pacienteRegistry);
attachAutocomplete(document.getElementById('dvnProfDeriva'), dvProfesionales);
attachAutocomplete(document.getElementById('dvnDerivaA'), dvProfesionales);
function dvAbrirNueva(){
  const hoy = hoyISO();
  document.getElementById('dvnFecha').value = hoy >= mesInicioISO() && hoy < mesFinISO() ? hoy : mesInicioISO();
  document.getElementById('dvnPaciente').value = '';
  document.getElementById('dvnMotivo').value = '';
  document.getElementById('dvnProfDeriva').value = '';
  document.getElementById('dvnDerivaA').value = '';
  ovDvNueva.classList.add('show');
  setTimeout(()=> document.getElementById('dvnPaciente').focus(), 50);
}
const dvnCerrar = ()=> ovDvNueva.classList.remove('show');
document.getElementById('dvnCerrar').onclick = dvnCerrar;
document.getElementById('dvnCancelar').onclick = dvnCerrar;
document.getElementById('dvnMotivo').addEventListener('keydown', e=>{ if(e.key==='Enter') e.preventDefault(); });
document.getElementById('dvnGuardar').onclick = async ()=>{
  const fechaISO = document.getElementById('dvnFecha').value;
  const paciente = mayus(document.getElementById('dvnPaciente').value.trim());
  const motivo = mayus(document.getElementById('dvnMotivo').value.replace(/\s*\n\s*/g,' ').trim());
  const profDeriva = dvProfDeLista(document.getElementById('dvnProfDeriva').value), derivaA = dvProfDeLista(document.getElementById('dvnDerivaA').value);
  if(profDeriva==null || derivaA==null){ alert('Elegí los profesionales de la lista.'); return; }
  if(!fechaISO){ alert('Elegí la fecha.'); return; }
  if(!paciente){ alert('Completá el paciente.'); return; }
  const btn = document.getElementById('dvnGuardar'); btn.disabled = true;
  try{
    await db.collection('derivaciones').add({fechaISO, paciente, motivo, profDeriva, derivaA, proxContacto: cpDiaSiguiente(fechaISO),
      enviado:false, agendado:false, fechaAgend:'', estado:'', cerrado:false, notas:'',
      creadoPor: currentUser ? currentUser.nombre : '', creadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    dvnCerrar();
    if(fechaISO < mesInicioISO() || fechaISO >= mesFinISO()){
      const [y, m] = fechaISO.split('-').map(Number);
      mesActual = {year:y, month:m}; actualizarMesLabel(); suscribirMovimientos(); suscribirDerivaciones(); renderDerivaciones();
    }
  }catch(e){ alert('No se pudo cargar: ' + e.message); }
  btn.disabled = false;
};

// Una sola vez: las notas y motivos que ya estaban cargados en minúscula pasan a MAYÚSCULAS (como el resto del sistema)
async function pasarNotasAMayus(){
  if(!esFede()) return;
  try{ if(localStorage.getItem('notasMayus_v1')==='1') return; }catch(_){}
  try{
    for(const [col, campos] of [['clasesPrueba',['notas']], ['derivaciones',['notas','motivo']]]){
      const snap = await db.collection(col).get();
      let batch = db.batch(), n = 0;
      for(const d of snap.docs){
        const x = d.data(), cambios = {};
        campos.forEach(k=>{ if(typeof x[k]==='string' && x[k] !== mayus(x[k])) cambios[k] = mayus(x[k]); });
        if(Object.keys(cambios).length){ batch.update(d.ref, cambios); if(++n % 400 === 0){ await batch.commit(); batch = db.batch(); } }
      }
      if(n % 400) await batch.commit();
    }
    try{ localStorage.setItem('notasMayus_v1','1'); }catch(_){}
  }catch(e){ console.warn('No se pudieron pasar las notas a mayúsculas', e); }
}

/* =====================================================================
   ALERTAS — campana arriba a la derecha (colección "alertas")
   ===================================================================== */
const AL_RESP = [['ESTEFANIA','Stephanie Medina'],['ORIANA','Oriana Medina'],['TIARA','Tiara Medina']];
const AL_RESP_FORM = [...AL_RESP, ['TODAS','Todas']];
let alPend = [], alHechas = null, unsubAl = null, unsubAlHechas = null;
let alVista = 'pend';          // 'pend' | 'hechas'
let alFiltro = null;           // null = todas, o 'ESTEFANIA' / 'ORIANA' / 'TIARA'
let alEditId = null;           // id de la alerta que se está editando (null = nueva)
const alEdBtn = `<button type="button" class="al-ed" title="Editar o eliminar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>`;
// Responsable que corresponde al usuario que entró (las recepcionistas); Fede y Pedro no tienen
function alMia(){
  const pn = primerNombre();
  if(/^(TIA)/.test(pn)) return 'TIARA';
  if(/^(ORI)/.test(pn)) return 'ORIANA';
  if(/^(EST|STE)/.test(pn)) return 'ESTEFANIA';
  return null;
}
const alEsAdmin = ()=> currentUser && currentUser.rol === 'admin';
const alLabel = r=> r==='ESTEFANIA' ? 'STEPHANIE' : (r || '');
// Una alerta para "TODAS" le aparece a las tres aunque esté filtrado su nombre
const alDeResp = (a, f)=> !f || a.responsable===f || a.responsable==='TODAS';
// Alertas creadas por Fede o Pedro: las recepcionistas no las pueden editar ni eliminar
const alDeAdmin = a=> a.creadoRol ? a.creadoRol==='admin' : /^(FEDE|PEDRO)/.test(mayus(a.creadoPor||'').trim());
const alPuedeEditar = a=> alEsAdmin() || !alDeAdmin(a);
const alVencida = a=> !a.hecha && a.vence && a.vence <= hoyISO();
function suscribirAlertas(){
  if(unsubAl) return;
  alFiltro = alEsAdmin() ? null : alMia();
  unsubAl = db.collection('alertas').where('hecha','==',false).onSnapshot(snap=>{
    alPend = snap.docs.map(d=> ({id:d.id, ...d.data()})).filter(a=> !a.eliminada);
    renderAlertasCount(); if(alVista==='pend') renderAlertas();
  }, err=> console.warn('No se pudieron leer las alertas', err));
  setInterval(renderAlertasCount, 5*60*1000);
}
// Globito: las vencidas (o que vencen hoy) que ve cada una por defecto: las recepcionistas las suyas, Fede y Pedro todas
function renderAlertasCount(){
  const mia = alEsAdmin() ? null : alMia();
  const n = alPend.filter(a=> alVencida(a) && alDeResp(a, mia)).length;
  const b = document.getElementById('alN');
  b.textContent = n; b.classList.toggle('col-hidden', !n);
}
const alCk = ok=> `<button type="button" class="al-ck${ok?' ok':''}" title="${ok?'Volver a pendientes':'Marcar como hecha'}"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
function renderAlertas(){
  const admin = alEsAdmin(), mia = alMia();
  const tit = document.getElementById('alTit'), btns = document.getElementById('alBtns'), fil = document.getElementById('alFiltros');
  if(alVista==='hechas'){
    tit.textContent = 'Tareas realizadas';
    btns.innerHTML = `<button type="button" class="al-chip" data-al="pend">← Pendientes</button>`;
  } else {
    tit.textContent = admin ? 'Alertas' : (alFiltro ? 'Mis alertas' : 'Todas las alertas');
    btns.innerHTML = `<button type="button" class="al-chip nv" data-al="nueva">+ Nueva</button>`
      + (!admin && mia ? `<button type="button" class="al-chip" data-al="toggle">${alFiltro ? 'Todas' : 'Mis alertas'}</button>` : '')
      + `<button type="button" class="al-chip" data-al="hechas">Realizadas</button>`;
  }
  // Fede y Pedro: filtro por responsable
  fil.classList.toggle('col-hidden', !admin);
  if(admin) fil.innerHTML = [[null,'Todas'], ...AL_RESP.map(([k,l])=> [k, l.split(' ')[0]])]
    .map(([k,l])=> `<button type="button" class="al-chip${alFiltro===k?' on':''}" data-alf="${k||''}">${l}</button>`).join('');
  const ls = document.getElementById('alLista');
  let lista;
  if(alVista==='hechas'){
    if(alHechas==null){ ls.innerHTML = '<div class="al-vacio">Cargando…</div>'; return; }
    const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();
    lista = alHechas.filter(a=> alDeResp(a, alFiltro)).sort((a,b)=> ms(b.hechaEn)-ms(a.hechaEn)).slice(0,150);
  } else {
    lista = alPend.filter(a=> alDeResp(a, alFiltro))
      .sort((a,b)=> (a.vence||'9').localeCompare(b.vence||'9') || ((a.creadoEn&&a.creadoEn.toMillis?a.creadoEn.toMillis():0) - (b.creadoEn&&b.creadoEn.toMillis?b.creadoEn.toMillis():0)));
  }
  if(!lista.length){ ls.innerHTML = `<div class="al-vacio">${alVista==='hechas' ? 'No hay tareas realizadas.' : 'No hay alertas pendientes.'}</div>`; return; }
  ls.innerHTML = lista.map(a=> `<div class="al-it${alVista==='hechas' ? ' hecha' : (alVencida(a) ? ' venc' : '')}${a.id===alEditId?' editando':''}" data-id="${a.id}">
      ${alPuedeEditar(a) ? alEdBtn : '<span class="al-ed-x"></span>'}<div class="al-tx"><div class="al-nm">${escHtml(a.paciente || '—')}</div><div class="al-nt">${escHtml(a.nota || '')}</div></div>
      <div class="al-de"><span class="al-vt">${alVista==='hechas' ? 'Venció' : 'Vence'} ${a.vence ? dvFechaCorta(a.vence) : '—'}</span><span class="al-rs">${escHtml(alLabel(a.responsable))}</span></div>
      ${alCk(alVista==='hechas')}
    </div>`).join('');
}
function alVerHechas(){
  alVista = 'hechas'; alHechas = null; renderAlertas();
  if(unsubAlHechas) unsubAlHechas();
  unsubAlHechas = db.collection('alertas').where('hecha','==',true).onSnapshot(snap=>{
    alHechas = snap.docs.map(d=> ({id:d.id, ...d.data()})).filter(a=> !a.eliminada); if(alVista==='hechas') renderAlertas();
  }, err=>{ alHechas = []; console.warn(err); renderAlertas(); });
}
function alVerPend(){ alVista = 'pend'; if(unsubAlHechas){ unsubAlHechas(); unsubAlHechas = null; } renderAlertas(); }
function alAbrirForm(a){
  const f = document.getElementById('alFrm');
  alEditId = a ? a.id : null;
  document.getElementById('alPac').value = a ? (a.paciente || '') : '';
  const nota = a ? (a.nota || '') : '';
  document.getElementById('alNota').value = nota; document.getElementById('alCnt').textContent = `${nota.length} / 80`;
  const sel = a ? a.responsable : alMia();
  document.getElementById('alResp').innerHTML = '<option value="">Elegí…</option>' + AL_RESP_FORM.map(([k,l])=> `<option value="${k}" ${k===sel?'selected':''}>${l}</option>`).join('');
  document.getElementById('alVence').value = a ? (a.vence || '') : hoyISO();
  document.getElementById('alEliminar').classList.toggle('col-hidden', !a);
  f.classList.remove('col-hidden');
  renderAlertas();   // sin foco automático: la lista de pacientes se abre recién al tocar el casillero
}
function alCerrarForm(){
  document.getElementById('alFrm').classList.add('col-hidden');
  if(alEditId){ alEditId = null; renderAlertas(); }
}
function alAbrir(){
  document.getElementById('alPanel').classList.add('open'); document.getElementById('alBell').setAttribute('aria-expanded','true');
  alVista = 'pend'; alFiltro = alEsAdmin() ? null : alMia(); alCerrarForm(); renderAlertas();
}
function alCerrar(){
  document.getElementById('alPanel').classList.remove('open'); document.getElementById('alBell').setAttribute('aria-expanded','false');
  if(unsubAlHechas){ unsubAlHechas(); unsubAlHechas = null; }
}
document.getElementById('alBell').onclick = e=>{ e.stopPropagation(); document.getElementById('alPanel').classList.contains('open') ? alCerrar() : alAbrir(); };
document.addEventListener('mousedown', e=>{
  const p = document.getElementById('alPanel');
  if(p.classList.contains('open') && !document.getElementById('alWrap').contains(e.target)) alCerrar();
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && !e.defaultPrevented && document.getElementById('alPanel').classList.contains('open')){ e.preventDefault(); alCerrar(); }
});
document.getElementById('alPanel').addEventListener('click', async e=>{
  const b = e.target.closest('[data-al]');
  if(b){
    const a = b.dataset.al;
    if(a==='nueva'){ (document.getElementById('alFrm').classList.contains('col-hidden') || alEditId) ? alAbrirForm() : alCerrarForm(); }
    else if(a==='toggle'){ alFiltro = alFiltro ? null : alMia(); renderAlertas(); }
    else if(a==='hechas') alVerHechas();
    else if(a==='pend') alVerPend();
    return;
  }
  const f = e.target.closest('[data-alf]');
  if(f){ alFiltro = f.dataset.alf || null; renderAlertas(); return; }
  const ed = e.target.closest('.al-ed');
  if(ed){
    const id = ed.closest('.al-it').dataset.id;
    if(id===alEditId){ alCerrarForm(); return; }
    const al = [...alPend, ...(alHechas||[])].find(x=> x.id===id);
    if(al && alPuedeEditar(al)){ alAbrirForm(al); document.getElementById('alPanel').scrollTop = 0; }
    return;
  }
  const ck = e.target.closest('.al-ck');
  if(ck){
    const id = ck.closest('.al-it').dataset.id, hecha = alVista!=='hechas';
    ck.classList.toggle('ok', hecha);
    setTimeout(async ()=>{
      try{
        await db.collection('alertas').doc(id).update(hecha
          ? {hecha:true, hechaEn: firebase.firestore.FieldValue.serverTimestamp(), hechaPor: currentUser ? currentUser.nombre : ''}
          : {hecha:false, hechaEn: null, hechaPor: ''});
      }catch(err){ ck.classList.toggle('ok', !hecha); alert('No se pudo guardar: ' + err.message); }
    }, 300);   // que se vea el tilde en verde antes de que se vaya
  }
});
document.getElementById('alNota').addEventListener('input', e=>{ document.getElementById('alCnt').textContent = `${e.target.value.length} / 80`; });
document.getElementById('alNota').addEventListener('keydown', e=>{ if(e.key==='Enter') e.preventDefault(); });
document.getElementById('alCancelar').onclick = alCerrarForm;
// Eliminar: no se borra de Firestore, se marca eliminada y deja de mostrarse
document.getElementById('alEliminar').onclick = async ()=>{
  if(!alEditId || !await ummConfirm('¿Eliminar esta alerta?')) return;
  const id = alEditId, btn = document.getElementById('alEliminar'); btn.disabled = true;
  try{
    await db.collection('alertas').doc(id).update({eliminada:true,
      eliminadaPor: currentUser ? currentUser.nombre : '', eliminadaEn: firebase.firestore.FieldValue.serverTimestamp()});
    if(alHechas) alHechas = alHechas.filter(x=> x.id!==id);
    alCerrarForm();
  }catch(err){ alert('No se pudo eliminar: ' + err.message); }
  btn.disabled = false;
};
attachAutocomplete(document.getElementById('alPac'), ()=> pacienteRegistry);
document.getElementById('alGuardar').onclick = async ()=>{
  const paciente = mayus(document.getElementById('alPac').value.trim());
  const nota = mayus(document.getElementById('alNota').value.replace(/\s+/g,' ').trim());
  const responsable = document.getElementById('alResp').value, vence = document.getElementById('alVence').value;
  if(!nota){ alert('Escribí la nota de la alerta.'); return; }
  if(!responsable){ alert('Elegí la responsable.'); return; }
  if(!vence){ alert('Elegí la fecha de vencimiento.'); return; }
  const btn = document.getElementById('alGuardar'); btn.disabled = true;
  try{
    if(alEditId){
      await db.collection('alertas').doc(alEditId).update({paciente, nota, responsable, vence,
        editadoPor: currentUser ? currentUser.nombre : '', editadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    } else {
      await db.collection('alertas').add({paciente, nota, responsable, vence, hecha:false,
        creadoPor: currentUser ? currentUser.nombre : '', creadoRol: currentUser ? (currentUser.rol || '') : '',
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    }
    alCerrarForm();
  }catch(err){ alert('No se pudo guardar la alerta: ' + err.message); }
  btn.disabled = false;
};

// Alarmas de "próx. contacto" de derivaciones → globo rojo en "Derivaciones"
let dvContactos = [], dvAgendas = [], unsubDvContactos = null, unsubDvAgendas = null;
function renderDvContactosCount(){
  const hoy = hoyISO();
  const n = dvContactos.filter(dvProxVencido).length
          + dvAgendas.filter(dvAgendVencida).length;   // próx. contacto vencidos + turnos agendados que ya llegaron
  const b = document.getElementById('mSubDerivN');
  if(b){ b.textContent = n; b.classList.toggle('col-hidden', !n); }
}
function suscribirDvContactos(){
  if(unsubDvContactos) return;
  unsubDvContactos = db.collection('derivaciones').where('proxContacto','>','')
    .onSnapshot(snap=>{ dvContactos = snap.docs.map(d=> ({id:d.id, ...d.data()})); renderDvContactosCount(); },
      err=> console.warn('No se pudieron leer los próximos contactos de derivaciones', err));
  unsubDvAgendas = db.collection('derivaciones').where('fechaAgend','>','')
    .onSnapshot(snap=>{ dvAgendas = snap.docs.map(d=> ({id:d.id, ...d.data()})); renderDvContactosCount(); },
      err=> console.warn('No se pudieron leer las fechas agendadas de derivaciones', err));
  setInterval(renderDvContactosCount, 5*60*1000);
}

document.querySelectorAll('#movSubTabs [data-msub]').forEach(b=> b.onclick = ()=>{
  const sub = b.dataset.msub;
  if(sub==='diarios' || sub==='prueba' || sub==='deriv' || sub==='grande'){ mostrarSubMov(sub); return; }
  if(sub==='cajas') document.getElementById('btnCajas').click();
  else if(sub==='pacientes') document.getElementById('btnPacientes').click();
  else if(sub==='deudores') document.getElementById('btnDeudores').click();
  else if(sub==='pago') document.getElementById('btnPagoProfesional').click();
  else if(sub==='reporte') document.getElementById('btnReporteDiario').click();
  else if(sub==='backup') abrirBackup();
  else if(sub==='presupuesto') abrirPresupuesto();
  else if(sub==='nuevo') document.getElementById('btnNuevo').click();
});

/* ---- Períodos: en vez de un desplegable eterno "Enero 2025, Febrero 2025…", dos desplegables (mes y año).
   El <select> original queda oculto con los valores 'AAAA-MM' y el resto del código lo sigue usando igual. ---- */
function mesAnioSync(id){
  const sel = document.getElementById(id); if(!sel) return;
  let par = document.getElementById(id + 'Par');
  if(!par){
    par = document.createElement('span'); par.id = id + 'Par'; par.className = 'mes-anio';
    par.innerHTML = `<select class="ma-mes" aria-label="Mes"></select><select class="ma-anio" aria-label="Año"></select>`;
    sel.after(par); sel.classList.add('col-hidden');
    const cambiar = ()=>{
      const m = par.querySelector('.ma-mes').value, y = par.querySelector('.ma-anio').value;
      const disp = [...sel.options].map(o=> o.value);
      let v = `${y}-${m}`;
      if(!disp.includes(v)){   // ese mes no está en ese año: el más cercano de ese año
        const delAnio = disp.filter(x=> x.startsWith(y + '-'));
        v = delAnio.reduce((a,x)=> Math.abs(+x.slice(5) - +m) < Math.abs(+a.slice(5) - +m) ? x : a, delAnio[0]);
      }
      sel.value = v; sel.dispatchEvent(new Event('change'));
      mesAnioSync(id);
    };
    par.querySelector('.ma-mes').onchange = cambiar; par.querySelector('.ma-anio').onchange = cambiar;
  }
  const disp = [...sel.options].map(o=> o.value), v = sel.value || disp[disp.length-1] || '';
  const [y, m] = v.split('-');
  const anios = [...new Set(disp.map(x=> x.slice(0,4)))];
  const mesesAnio = disp.filter(x=> x.startsWith(y + '-')).map(x=> x.slice(5));
  par.querySelector('.ma-anio').innerHTML = anios.map(a=> `<option ${a===y?'selected':''}>${a}</option>`).join('');
  par.querySelector('.ma-mes').innerHTML = mesesAnio.map(mm=> `<option value="${mm}" ${mm===m?'selected':''}>${MESES[+mm-1]}</option>`).join('');
}
function periodoSync(a, b){ mesAnioSync(a); mesAnioSync(b); }

/* =====================================================================
   INFORMES · ASISTENCIAS (datos de Momoyoga: adminCharts/asistencias)
   ===================================================================== */
const ASIS_LC = ['#3d6fb0','#e0913a','#4f9a6a','#b0508a'];
const ASIS_MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
let asisData = null, asisSel = null;   // asisSel: {estilo} o {slot}
let asisTipo = 'asistencias'; const asisCache = {}; let asisModo = 'p';
document.getElementById('asisModo').addEventListener('click', e=>{ const b = e.target.closest('[data-modo]'); if(!b || b.dataset.modo===asisModo) return; asisModo = b.dataset.modo; document.querySelectorAll('#asisModo button').forEach(x=> x.classList.toggle('on', x===b)); renderAsistencias(); });
// Sueroterapia: ene–ago 2026 de la planilla (adminCharts/sueroterapia) + desde sep 2026 automático de Movimientos sueros
const SUERO_AUTO_DESDE = '2026-09';
async function datosSueroterapia(){
  const [d, snap] = await Promise.all([db.collection('adminCharts').doc('sueroterapia').get(), db.collection('sueros').where('fechaISO','>=', SUERO_AUTO_DESDE + '-01').get()]);
  const base = d.exists ? d.data() : {meses:{}, renta:{}};
  const meses = {}, renta = {};
  Object.keys(base.meses||{}).filter(k=> k < SUERO_AUTO_DESDE).forEach(k=>{ meses[k] = base.meses[k].slice(); renta[k] = (base.renta[k]||[0,0,0]).slice(); });
  const actual = hoyISO().slice(0,7);
  for(let k = SUERO_AUTO_DESDE; k <= actual; ){ meses[k] = [0,0,0]; renta[k] = [0,0,0]; let [y,m] = k.split('-').map(Number); m++; if(m>12){ m=1; y++; } k = `${y}-${String(m).padStart(2,'0')}`; }
  snap.docs.forEach(doc=>{ const m = doc.data(); if(m.tipo!=='ingreso' || !m.fechaISO) return; const k = m.fechaISO.slice(0,7); if(!meses[k]) return;
    const i = m.turno==='M' ? 0 : m.turno==='T' ? 1 : 2; meses[k][i]++; renta[k][i] += Number(m.ummana)||0; });
  return {slots:[{estilo:'Mañana vs Tarde', dia:'Mañana', hora:'', color:'#6f9fd0'}, {estilo:'Mañana vs Tarde', dia:'Tarde', hora:'', color:'#e8975a'}, {estilo:'Sin asignar', dia:'Sin asignar', hora:'', oculto:true}],
    meses, mesesRenta: renta, hasta: hoyISO()};
}
// Informes con dos vistas: cantidad / plata (sueroterapia: pacientes y renta; packs: alumnos y cobros)
const ASIS_CON_MODO = {sueroterapia:['Pacientes','Renta','Renta Ummana'], packs:['Alumnos','Cobros','Cobros']};
const ASIS_TIPOS = {
  asistencias: {tit:'Asistencias por mes', unidad:'asistencias', corta:'asist.', nota:'Datos de Momoyoga (yoguis con "Asistida" tildado)', toca:'Tocá un estilo o un horario para verlo en el gráfico; tocá de nuevo para volver a todas.', todas:'Todas las clases'},
  sueroterapia: {tit:'Sueroterapia por mes', unidad:'pacientes', corta:'pacientes', nota:'Enero a agosto 2026: datos de la planilla anterior. Desde septiembre 2026: automático desde Movimientos sueros (cada suero aplicado es un paciente; la renta es la columna Ummana; mañana/tarde según la tecla M/T)', toca:'Con los botones Mañana y Tarde del gráfico de barras ves solo ese turno.', todas:'Todos los sueros'},
  packs: {tit:'Packs vendidos por mes', unidad:'packs', corta:'packs', nota:'Datos de Momoyoga (packs de créditos BIENESTAR pagados, por fecha de compra; los de miembros cuentan como el pack de su cantidad). Cobros: lo que se cobró por esos packs', toca:'Tocá un pack para verlo solo en el gráfico; tocá de nuevo para volver a todos.', todas:'Todos los packs'},
};
document.querySelectorAll('#vistaInformes [data-inf]').forEach(b=> b.onclick = ()=>{
  if(asisTipo===b.dataset.inf) return;
  asisTipo = b.dataset.inf; asisSel = null; asisData = null; asisModo = 'p';
  document.getElementById('asisPanel').classList.toggle('col-hidden', asisTipo==='aumentos');
  document.getElementById('aumPanel').classList.toggle('col-hidden', asisTipo!=='aumentos');
  document.getElementById('venPanel').classList.toggle('col-hidden', asisTipo!=='ventas');
  document.getElementById('asisPanel').classList.toggle('col-hidden', asisTipo==='aumentos' || asisTipo==='ventas');
  if(asisTipo==='ventas'){ document.querySelectorAll('#vistaInformes [data-inf]').forEach(x=> x.classList.toggle('active', x===b)); renderVentas(); return; }
  if(asisTipo==='aumentos'){ document.querySelectorAll('#vistaInformes [data-inf]').forEach(x=> x.classList.toggle('active', x===b)); cargarAumentos(); return; }
  document.querySelectorAll('#asisModo button').forEach(x=> x.classList.toggle('on', x.dataset.modo==='p'));
  document.getElementById('asisModo').classList.toggle('col-hidden', !ASIS_CON_MODO[asisTipo]);
  if(ASIS_CON_MODO[asisTipo]){ document.getElementById('asisModoP').textContent = ASIS_CON_MODO[asisTipo][0]; document.getElementById('asisModoR').textContent = ASIS_CON_MODO[asisTipo][1]; }
  document.querySelectorAll('#vistaInformes [data-inf]').forEach(x=> x.classList.toggle('active', x===b));
  cargarAsistencias();
});
async function cargarAsistencias(){
  if(asisTipo==='aumentos'){ cargarAumentos(); return; }
  if(asisData){ renderAsistencias(); return; }
  document.getElementById('asisBarras').innerHTML = '<div class="inf-proximamente">Cargando…</div>'; document.getElementById('asisEstilos').innerHTML = ''; document.getElementById('asisSub').textContent = ''; document.getElementById('asisNota').textContent = '';
  document.getElementById('asisTit').textContent = ASIS_TIPOS[asisTipo].tit;
  const tipo = asisTipo;
  try{
    if(tipo==='sueroterapia') asisCache[tipo] = await datosSueroterapia();   // siempre al día con lo cargado
    else if(!(tipo in asisCache)){ const d = await db.collection('adminCharts').doc(tipo).get(); asisCache[tipo] = d.exists ? d.data() : null; }
    if(tipo!==asisTipo) return;
    asisData = asisCache[tipo];
  }catch(e){ document.getElementById('asisBarras').innerHTML = `<div class="inf-proximamente">No se pudieron leer las asistencias: ${escHtml(e.message)}</div>`; return; }
  if(!asisData){ document.getElementById('asisBarras').innerHTML = '<div class="inf-proximamente">Todavía no hay datos para este informe.</div>'; return; }
  const mesEnCurso = hoyISO().slice(0,7);
  // Bienestar: el mes en curso no se mide (se mira a principio del mes siguiente)
  const meses = Object.keys(asisData.meses).sort().filter(m=> asisTipo==='sueroterapia' || m < mesEnCurso);
  const lbl = ym => { const [y,m] = ym.split('-'); return `${MESES[+m-1]} ${y}`; };
  const opts = sel => meses.map(m=> `<option value="${m}" ${m===sel?'selected':''}>${lbl(m)}</option>`).join('');
  // por defecto: de enero del año actual al mes actual
  const actual = hoyISO().slice(0,7);
  const hasta = meses.includes(actual) ? actual : meses[meses.length-1];
  const desde = meses.find(m=> m >= hasta.slice(0,4)+'-01') || meses[0];
  document.getElementById('asisDesde').innerHTML = opts(desde);
  document.getElementById('asisHasta').innerHTML = opts(hasta);
  periodoSync('asisDesde','asisHasta');
  renderAsistencias();
}
['asisDesde','asisHasta'].forEach(id=> document.getElementById(id).addEventListener('change', e=>{
  const d = document.getElementById('asisDesde'), h = document.getElementById('asisHasta');
  if(d.value > h.value){ if(id==='asisDesde') h.value = d.value; else d.value = h.value; }
  periodoSync('asisDesde','asisHasta');
  renderAsistencias();
}));
function asisEstilos(){
  const est = [];
  asisData.slots.forEach((s, i)=>{ if(s.oculto) return; let e = est.find(x=> x.nombre===s.estilo); if(!e){ e = {nombre:s.estilo, slots:[]}; est.push(e); } e.slots.push(i); });
  return est;
}
function renderAsistencias(){
  if(!asisData) return;
  const d = document.getElementById('asisDesde').value, h = document.getElementById('asisHasta').value;
  const meses = Object.keys(asisData.meses).sort().filter(m=> m>=d && m<=h);
  const est = asisEstilos();
  const slotsSel = asisSel ? (asisSel.slot!=null ? [asisSel.slot] : est.find(e=> e.nombre===asisSel.estilo).slots) : asisData.slots.map((_, i)=> i);
  const renta = !!ASIS_CON_MODO[asisTipo] && asisModo==='r' && !!asisData.mesesRenta;
  const SRC = renta ? asisData.mesesRenta : asisData.meses;
  const tot = meses.map(m=> slotsSel.reduce((a, i)=> a + ((SRC[m]||[])[i]||0), 0));
  const fmtV = v=> renta ? (Math.abs(v) >= 1e6 ? '$' + (v/1e6).toLocaleString('es-AR', {maximumFractionDigits:2}) + ' M' : '$' + Math.round(v/1000).toLocaleString('es-AR') + 'k') : Math.round(v).toLocaleString('es-AR');
  const fmtTot = v=> renta ? fmtPesos(Math.round(v)) : v.toLocaleString('es-AR');
  const colorSlot = (i,k)=> asisData.slots[i].color || ASIS_LC[k];
  const mesActual = hoyISO().slice(0,7);
  const corto = ym => { const [y,m] = ym.split('-'); return ASIS_MES[+m-1] + (m==='01' || ym===meses[0] ? ' ' + y.slice(2) : ''); };
  // barras
  const chico = window.innerWidth < 700; const W = chico ? 520 : 1000, H = chico ? 300 : 250, pad = renta ? 52 : 36, max = Math.max(1, ...tot)*1.12, bw = (W-pad-10)/Math.max(1, meses.length), y = v=> H-24-(v/max)*(H-40);
  let g = '';
  for(let k=0;k<=4;k++){ const v = max*k/4; g += `<line x1="${pad}" x2="${W-10}" y1="${y(v)}" y2="${y(v)}" stroke="#efe7d3"/><text x="${pad-6}" y="${y(v)+3}" font-size="10" text-anchor="end" fill="#9c9179">${fmtV(v)}</text>`; }
  const fs = chico ? (meses.length > 8 ? 9 : 11) : (meses.length > 18 ? 8.5 : 10);
  meses.forEach((m, j)=>{
    const v = tot[j], act = j===meses.length-1, gap = Math.min(10, bw*.18);
    g += `<rect x="${pad+j*bw+gap/2}" width="${Math.max(1,bw-gap)}" y="${y(v)}" height="${y(0)-y(v)}" rx="${Math.min(5,bw/6)}" fill="${act ? '#c0705a' : '#e3b9a3'}"><title>${corto(m)}: ${fmtTot(v)}${renta ? '' : ' ' + ASIS_TIPOS[asisTipo].unidad}</title></rect>`;
    g += `<text x="${pad+j*bw+bw/2}" y="${y(v)-5}" font-size="${fs}" font-weight="${act?700:400}" text-anchor="middle" fill="#5b5444">${fmtV(v)}</text>`;
    if((chico ? meses.length <= 8 : meses.length <= 18) || j%2===0 || act) g += `<text x="${pad+j*bw+bw/2}" y="${H-8}" font-size="${fs}" text-anchor="middle" fill="${act?'#3a2f1c':'#9c9179'}" font-weight="${act?700:400}">${corto(m)}</text>`;
  });
  document.getElementById('asisBarras').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
  const T = ASIS_TIPOS[asisTipo];
  const slotNom = i=> { const sl = asisData.slots[i]; return asisTipo==='sueroterapia' ? sl.dia : sl.dia ? `${sl.estilo} · ${sl.dia} ${sl.hora}` : sl.estilo; };
  const nombreSel = asisSel ? (asisSel.slot!=null ? slotNom(asisSel.slot) : asisSel.estilo) : '';
  document.getElementById('asisTit').textContent = T.tit;
  document.getElementById('asisSub').innerHTML = (asisSel ? `Mostrando <b>${escHtml(nombreSel)}</b><button id="asisVerTodas">ver todo</button> · ` : T.todas + ' · ')
    + (renta ? `${ASIS_CON_MODO[asisTipo][2]}: ${fmtTot(tot.reduce((a,b)=> a+b, 0))} en el período` : `${tot.reduce((a,b)=> a+b, 0).toLocaleString('es-AR')} ${T.unidad} en el período`);
  const vt = document.getElementById('asisVerTodas'); if(vt) vt.onclick = e=>{ e.stopPropagation(); asisSel = null; renderAsistencias(); };
  // Sueroterapia: botones Mañana / Tarde dentro del cuadro de barras, abajo a la izquierda
  const filt = document.getElementById('asisFiltros');
  filt.classList.toggle('col-hidden', asisTipo!=='sueroterapia');
  if(asisTipo==='sueroterapia') filt.innerHTML = asisData.slots.map((sl,i)=> sl.oculto ? '' : `<button type="button" data-slot="${i}" class="${asisSel && asisSel.slot===i ? 'on' : ''}">${escHtml(sl.dia)}</button>`).join('');
  // tarjetas por estilo
  document.getElementById('asisEstilos').classList.toggle('cuatro', est.length===4);
  document.getElementById('asisEstilos').classList.toggle('uno', est.length===1);
  document.getElementById('asisEstilos').innerHTML = est.map(e=>{
    const series = e.slots.map(i=> meses.map(m=> (SRC[m]||[])[i]||0));
    const ancho = est.length===1;   // una sola tarjeta (Sueroterapia): ocupa todo el ancho, con meses y valores
    const mx = Math.max(1, ...series.flat())*(ancho ? 1.18 : 1.1), w = ancho ? W : 300, hh = ancho ? (chico ? 220 : 190) : 90, n = meses.length;
    const padX = ancho ? 30 : 6, padB = ancho ? 22 : 6, padT = ancho ? 16 : 6;
    const x = j=> padX + (n>1 ? j*(w-2*padX)/(n-1) : (w-2*padX)/2), yy = v=> hh-padB-(v/mx)*(hh-padB-padT);
    const lineas = series.map((sr, k)=> `<polyline points="${sr.map((v,j)=> `${x(j)},${yy(v)}`).join(' ')}" fill="none" stroke="${colorSlot(e.slots[k],k)}" stroke-width="${asisTipo!=='sueroterapia' && asisSel && asisSel.slot===e.slots[k] ? 3 : 2}" stroke-linejoin="round"/>` + (n ? `<circle cx="${x(n-1)}" cy="${yy(sr[n-1])}" r="3" fill="${colorSlot(e.slots[k],k)}"/>` : '')).join('');
    let extra = '';
    if(ancho){
      meses.forEach((m,j)=>{ if((chico ? n <= 8 : true) || j%2===0) extra += `<text x="${x(j)}" y="${hh-5}" font-size="${chico?11:10}" text-anchor="middle" fill="#9c9179">${corto(m)}</text>`; });
      series.forEach((sr,k)=> sr.forEach((v,j)=>{ const c = colorSlot(e.slots[k],k); const otro = series[1-k] ? series[1-k][j] : null; const arriba = otro==null || v >= otro;
        extra += `<circle cx="${x(j)}" cy="${yy(v)}" r="3" fill="${c}"/><text x="${x(j)}" y="${yy(v) + (arriba ? -7 : 14)}" font-size="${chico?10.5:9.5}" font-weight="700" text-anchor="middle" fill="${c}">${fmtV(v)}</text>`; }));
    }
    const total = series.flat().reduce((a,b)=> a+b, 0);
    const selEst = asisSel && asisSel.estilo===e.nombre;
    const ocultos = asisData.slots.map((sl,i)=> sl.oculto ? i : -1).filter(i=> i>=0);
    const sinAsig = ocultos.reduce((a,i)=> a + meses.reduce((b,m)=> b + ((asisData.meses[m]||[])[i]||0), 0), 0);
    if(asisTipo==='sueroterapia') return `<div class="asis-est asis-info">
      <div class="asis-est-h"><div class="asis-tit">${escHtml(e.nombre)}</div><small>${renta ? fmtTot(total) : total.toLocaleString('es-AR') + ' ' + T.corta}${sinAsig ? ` <span style="color:#c0705a">(${sinAsig} sin asignar)</span>` : ''}</small></div>
      <svg viewBox="0 0 ${w} ${hh}">${lineas}${extra}</svg>
      <div class="asis-ley">${e.slots.map((i,k)=> `<span><i style="background:${colorSlot(i,k)}"></i>${asisData.slots[i].dia}</span>`).join('')}</div>
    </div>`;
    return `<div class="asis-est ${selEst || (asisSel && e.slots.includes(asisSel.slot)) ? 'sel' : ''}" data-estilo="${escHtml(e.nombre)}">
      <div class="asis-est-h"><b>${escHtml(e.nombre)}</b><small>${renta ? fmtTot(total) : total.toLocaleString('es-AR') + ' ' + T.corta}${sinAsig ? ` <span style="color:#c0705a">(${sinAsig} sin asignar)</span>` : ''}</small></div>
      <svg viewBox="0 0 ${w} ${hh}">${lineas}${extra}</svg>
      <div class="asis-ley ${asisData.slots[e.slots[0]].dia ? '' : 'col-hidden'}">${e.slots.map((i,k)=> `<span data-slot="${i}" class="${asisSel && asisSel.slot===i ? 'sel' : ''}" title="Ver solo este horario"><i style="background:${colorSlot(i,k)}"></i>${asisData.slots[i].dia} ${asisData.slots[i].hora}</span>`).join('')}</div>
    </div>`;
  }).join('');
  const act = asisData.hasta ? asisData.hasta.split('-').reverse().join('/') : '';
  document.getElementById('asisNota').textContent = `${T.nota}, actualizados al ${act}. ${T.toca}`;
}
/* ---- Informes · Aumentos (valor hora secretaría vs IPC INDEC) — adminCharts/aumentos {valores:{'AAAA-MM':valor}, ipc:{'AAAA-MM':%}} ---- */
let aumData = null;
/* ---- Informe de VENTAS: por profesional, tratamientos más vendidos y descuentos por motivo, con comparación mensual ---- */
function esVentaInforme(m){
  if(!m || esGastoMov(m) || esCajaGrande(m) || m._cajaBorrada) return false;
  if(m.saldaDeuda || (m.saldaDeudas||[]).length || /^salda deuda/i.test(m.concepto||'')) return false;
  if(typeof esCambioDeGrande==='function' && esCambioDeGrande(m)) return false;
  if(mayus(m.prof||'')==='CAJA DIARIA') return false;
  return true;
}
const venMesLbl = ym=> { const [y,mm] = ym.split('-'); return `${MESES[+mm-1].slice(0,3)} ${y.slice(2)}`; };
const venMesAnt = (ym, k)=> { const [y,mm] = ym.split('-').map(Number); const d = new Date(y, mm-1-k, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
function venVar(act, ant){
  if(!ant) return act ? '<span class="ven-up">nuevo</span>' : '<span class="ven-sub">—</span>';
  const v = (act/ant - 1)*100;
  return `<span class="${v>=0 ? 'ven-up' : 'ven-down'}">${v>=0?'+':''}${Math.round(v)}%</span>`;
}
// Los movimientos de cada mes se leen una sola vez por sesión (la caja solo tiene en memoria el mes que se está mirando)
const venCache = {};
async function venMovsMes(ym){
  if(venCache[ym]) return venCache[ym];
  const ini = ym + '-01', fin = venMesAnt(ym, -1) + '-01';
  const snap = await db.collection('movimientos').where('fechaISO','>=', ini).where('fechaISO','<', fin).get();
  const l = snap.docs.map(d=> ({id: d.id, ...d.data()}));
  if(ym < hoyISO().slice(0,7)) venCache[ym] = l;   // los meses cerrados no cambian; el actual se vuelve a leer
  return l;
}
async function renderVentas(){
  const selMes = document.getElementById('venMes');
  const actual = hoyISO().slice(0,7);
  const meses = []; for(let k=0; k<24; k++){ const m = venMesAnt(actual, k); if(m < '2025-01') break; meses.push(m); }
  const elegido = selMes.value || actual;
  selMes.innerHTML = meses.map(m=> `<option value="${m}" ${m===elegido?'selected':''}>${MESES[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('');
  const nComp = Number(document.getElementById('venComp').value) || 3;
  const cols = []; for(let k=nComp; k>=1; k--) cols.push(venMesAnt(elegido, k)); cols.push(elegido);
  const enCols = new Set(cols);
  document.getElementById('venKpis').innerHTML = '<div class="inf-proximamente" style="grid-column:1/-1">Cargando…</div>';
  let movimientos;
  try{ movimientos = (await Promise.all(cols.map(venMovsMes))).flat(); }
  catch(e){ document.getElementById('venKpis').innerHTML = `<div class="inf-proximamente" style="grid-column:1/-1">No se pudieron leer los movimientos: ${escHtml(e.message)}</div>`; return; }
  // agrupar
  const porProf = {}, porTrat = {}, porDesc = {}, tot = {}, totUsd = {}, cant = {};
  cols.forEach(c=>{ tot[c] = 0; totUsd[c] = 0; cant[c] = 0; });
  movimientos.forEach(m=>{
    if(!esVentaInforme(m)) return;
    const ym = (m.fechaISO||'').slice(0,7); if(!enCols.has(ym)) return;
    const v = Number(m.valor)||0, usd = m.moneda==='USD';
    cant[ym]++;
    if(usd){ totUsd[ym] += v; return; }   // los rankings van en pesos
    tot[ym] += v;
    const pf = m.prof || 'SIN ÁREA';
    (porProf[pf] ||= {})[ym] = (porProf[pf][ym]||0) + v;
    const tk = (m.concepto||'—') + '||' + pf;
    const t = (porTrat[tk] ||= {});
    t[ym] = t[ym] || {n:0, v:0}; t[ym].n++; t[ym].v += v;
    if(m.descuentoPct){
      const dk = m.descuentoLbl || `${m.descuentoPct}%`;
      const d = (porDesc[dk] ||= {});
      d[ym] = d[ym] || {n:0, v:0}; d[ym].n++;
      if(m.valorLista && m.valorLista > v) d[ym].v += m.valorLista - v;
    }
  });
  const ant = cols[cols.length-2];
  const fmt = v=> v ? fmtMonto(v,'$') : '<span class="ven-sub">—</span>';
  // KPIs
  const descMes = Object.values(porDesc).reduce((a,d)=> a + ((d[elegido]||{}).v||0), 0);
  const descN = Object.values(porDesc).reduce((a,d)=> a + ((d[elegido]||{}).n||0), 0);
  const prom = cols.slice(0,-1).reduce((a,c)=> a + tot[c], 0) / Math.max(1, cols.length-1);
  document.getElementById('venKpis').innerHTML = `
    <div class="ven-kpi"><div class="l">Ventas del mes</div><div class="v">${fmtMonto(tot[elegido],'$')}</div><div class="c">${venVar(tot[elegido], tot[ant])} vs ${venMesLbl(ant)}${totUsd[elegido] ? ` · + ${fmtMonto(totUsd[elegido],'USD')}` : ''}</div></div>
    <div class="ven-kpi"><div class="l">Promedio meses anteriores</div><div class="v">${fmtMonto(Math.round(prom),'$')}</div><div class="c">${venVar(tot[elegido], prom)} este mes contra el promedio</div></div>
    <div class="ven-kpi"><div class="l">Movimientos de venta</div><div class="v">${cant[elegido].toLocaleString('es-AR')}</div><div class="c">${venVar(cant[elegido], cant[ant])} vs ${venMesLbl(ant)}</div></div>
    <div class="ven-kpi"><div class="l">Descontado en el mes</div><div class="v">${fmtMonto(descMes,'$')}</div><div class="c">${descN} ${descN===1?'venta':'ventas'} con descuento</div></div>`;
  // por profesional
  const profs = Object.keys(porProf).sort((a,b)=> (porProf[b][elegido]||0) - (porProf[a][elegido]||0) || a.localeCompare(b,'es'));
  const maxP = Math.max(1, ...profs.map(p=> porProf[p][elegido]||0));
  document.getElementById('venProf').innerHTML = profs.length ? `<table class="ven-tabla"><thead><tr><th style="text-align:left">Profesional / área</th>${cols.map(c=> `<th>${venMesLbl(c)}</th>`).join('')}<th>vs ${venMesLbl(ant)}</th></tr></thead><tbody>
    ${profs.map(p=> `<tr><td class="l">${escHtml(p)}<div class="ven-bar" style="width:${Math.round((porProf[p][elegido]||0)/maxP*100)}%"></div></td>${cols.map(c=> `<td class="${c===elegido?'sel':''}">${fmt(porProf[p][c])}</td>`).join('')}<td>${venVar(porProf[p][elegido]||0, porProf[p][ant]||0)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td class="l">TOTAL</td>${cols.map(c=> `<td>${fmt(tot[c])}</td>`).join('')}<td>${venVar(tot[elegido], tot[ant])}</td></tr></tfoot></table>` : '<div class="inf-proximamente">Sin ventas en este período.</div>';
  // tratamientos (top 15 del mes elegido)
  const trats = Object.keys(porTrat).filter(k=> porTrat[k][elegido]).sort((a,b)=> porTrat[b][elegido].v - porTrat[a][elegido].v).slice(0,15);
  document.getElementById('venTrat').innerHTML = trats.length ? `<table class="ven-tabla"><thead><tr><th style="text-align:left">Tratamiento</th><th>Cant.</th><th>Monto</th><th>Cant. ${venMesLbl(ant)}</th></tr></thead><tbody>
    ${trats.map((k,i)=>{ const [c, pf] = k.split('||'); const t = porTrat[k]; return `<tr><td class="l">${i+1}. ${escHtml(c)}<div class="ven-sub">${escHtml(pf)}</div></td><td>${t[elegido].n}</td><td class="sel">${fmtMonto(t[elegido].v,'$')}</td><td>${(t[ant]||{}).n || '<span class="ven-sub">—</span>'}</td></tr>`; }).join('')}
    </tbody></table>` : '<div class="inf-proximamente">Sin ventas en este mes.</div>';
  // descuentos por motivo
  const descs = Object.keys(porDesc).filter(k=> cols.some(c=> porDesc[k][c])).sort((a,b)=> ((porDesc[b][elegido]||{}).v||0) - ((porDesc[a][elegido]||{}).v||0));
  document.getElementById('venDesc').innerHTML = descs.length ? `<table class="ven-tabla"><thead><tr><th style="text-align:left">Motivo</th><th>Ventas</th><th>Descontado</th><th>${venMesLbl(ant)}</th></tr></thead><tbody>
    ${descs.map(k=>{ const d = porDesc[k], a = d[elegido]||{n:0,v:0}, b = d[ant]||{n:0,v:0}; return `<tr><td class="l">${escHtml(k)}</td><td>${a.n || '<span class="ven-sub">—</span>'}</td><td class="sel">${fmt(a.v)}</td><td>${fmt(b.v)}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td class="l">TOTAL</td><td>${descN}</td><td>${fmtMonto(descMes,'$')}</td><td>${fmt(Object.values(porDesc).reduce((x,d)=> x + ((d[ant]||{}).v||0), 0))}</td></tr></tfoot></table>` : '<div class="inf-proximamente">Todavía no hay ventas con descuento en este período.</div>';
}
['venMes','venComp'].forEach(id=> document.getElementById(id).addEventListener('change', renderVentas));

async function cargarAumentos(){
  if(!aumData){
    try{ const d = await db.collection('adminCharts').doc('aumentos').get(); aumData = d.exists ? d.data() : null; }
    catch(e){ document.getElementById('aumGraf').innerHTML = `<div class="inf-proximamente">No se pudieron leer los aumentos: ${escHtml(e.message)}</div>`; return; }
    if(!aumData){ document.getElementById('aumGraf').innerHTML = '<div class="inf-proximamente">Todavía no hay datos de aumentos.</div>'; return; }
    const meses = Object.keys(aumData.valores).sort();
    const lbl = ym => { const [y,m] = ym.split('-'); return `${MESES[+m-1]} ${y}`; };
    const opts = sel => meses.map(m=> `<option value="${m}" ${m===sel?'selected':''}>${lbl(m)}</option>`).join('');
    // por defecto: de enero del año actual al último mes cargado (hasta el mes actual)
    const actual = hoyISO().slice(0,7), hasta = [...meses].reverse().find(m=> m <= actual) || meses[meses.length-1];
    document.getElementById('aumDesde').innerHTML = opts(meses.find(m=> m >= actual.slice(0,4)+'-01') || meses[0]);
    document.getElementById('aumHasta').innerHTML = opts(hasta);
    periodoSync('aumDesde','aumHasta');
  }
  renderAumentos();
}
['aumDesde','aumHasta'].forEach(id=> document.getElementById(id).addEventListener('change', ()=>{
  const d = document.getElementById('aumDesde'), h = document.getElementById('aumHasta');
  if(d.value > h.value){ if(id==='aumDesde') h.value = d.value; else d.value = h.value; }
  periodoSync('aumDesde','aumHasta');
  renderAumentos();
}));
function renderAumentos(){
  if(!aumData) return;
  const V = aumData.valores, IPC = aumData.ipc || {};
  const todos = Object.keys(V).sort();
  // cada aumento: % contra el valor anterior y la inflación acumulada (encadenada) desde el aumento anterior hasta el mes previo
  const hitos = {}; let ult = todos[0], f = 1;
  todos.forEach((k, j)=>{
    if(j && V[k] !== V[todos[j-1]]){ hitos[k] = {aum: (V[k]/V[todos[j-1]] - 1)*100, ipc: (f-1)*100, desde: ult}; ult = k; f = 1; }
    f *= 1 + (Number(IPC[k])||0)/100;
  });
  const d = document.getElementById('aumDesde').value, h = document.getElementById('aumHasta').value;
  const ks = todos.filter(k=> k>=d && k<=h);
  if(!ks.length) return;
  const pag = ks.map(k=> V[k]);
  // "Valor según IPC": el primer valor hora cargado ajustado mes a mes por IPC, siempre desde el comienzo
  // (aunque se mire un período más corto), para que se compare de verdad con lo pagado
  const ajTodos = {}; { let ind = V[todos[0]]; todos.forEach((k,j)=>{ ajTodos[k] = (j===0 || IPC[todos[j-1]]!=null) ? ind : null; ind *= 1 + (Number(IPC[k])||0)/100; }); }
  const aj = ks.map(k=> ajTodos[k]);
  const ajOk = aj.map((v,j)=> v!=null ? [j,v] : null).filter(Boolean);
  const chico = window.innerWidth < 700;
  const W = chico ? 560 : 1030, H = chico ? 380 : 310, z = chico ? 1.5 : 1, L = chico ? 72 : 56, R = 20, T = chico ? 60 : 34, B = chico ? 36 : 30;
  const vals = [...pag, ...ajOk.map(a=> a[1])];
  const paso = 1000, min = Math.floor(Math.min(...vals)*0.97/paso)*paso, max = Math.max(...vals)*1.06;
  const n = ks.length, x = j=> L + (n>1 ? j*(W-L-R)/(n-1) : (W-L-R)/2), y = v=> H-B-(v-min)/(max-min)*(H-B-T);
  const $ = v=> '$' + Math.round(v).toLocaleString('es-AR'), pct = v=> v.toFixed(1).replace('.',',') + '%';
  let g = '';
  for(let t = min; t <= max; t += paso) g += `<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" stroke="#efe7d3"/><text x="${L-8}" y="${y(t)+3}" text-anchor="end" fill="#9c9179" font-size="${10*z}">${$(t)}</text>`;
  const cada = n > (chico ? 12 : 26) ? 2 : 1;
  ks.forEach((k,j)=>{ if(j%cada===0 || j===n-1){ const [yy,mm] = k.split('-'); g += `<text x="${x(j)}" y="${H-10}" font-size="${chico?13:9.5}" text-anchor="middle" fill="#9c9179">${ASIS_MES[+mm-1]}${mm==='01' || j===0 ? ' ' + yy.slice(2) : ''}</text>`; } });
  if(ajOk.length > 1) g += `<polyline points="${ajOk.map(([j,v])=> `${x(j)},${y(v)}`).join(' ')}" fill="none" stroke="#4f7397" stroke-width="2" stroke-dasharray="6 4"/>`;
  let st = `M${x(0)},${y(pag[0])}`; pag.forEach((v,j)=>{ if(j) st += ` L${x(j)},${y(pag[j-1])} L${x(j)},${y(v)}`; });
  g += `<path d="${st}" fill="none" stroke="#c0705a" stroke-width="2.6"/>`;
  g += `<circle cx="${x(0)}" cy="${y(pag[0])}" r="4" fill="#c0705a"/><text x="${x(0)+6}" y="${y(pag[0])-12}" font-size="${11*z}" font-weight="700" fill="#2b2b2b" paint-order="stroke" stroke="#fffcf5" stroke-width="3.5">${$(pag[0])}</text>`;
  ks.forEach((k,j)=>{ const hi = hitos[k]; if(!j || !hi) return; const cx = x(j), cy = y(V[k]);
    const halo = 'paint-order="stroke" stroke="#fffcf5" stroke-width="3.5" stroke-linejoin="round"';   // borde claro: se lee aunque pase una línea por detrás
    g += `<circle cx="${cx}" cy="${cy}" r="4" fill="#c0705a"/>`
      + `<text x="${cx-8}" y="${cy-38*z}" font-size="${11*z}" font-weight="700" text-anchor="end" fill="#2b2b2b" ${halo}>${$(V[k])}</text>`
      + `<text x="${cx-8}" y="${cy-25*z}" font-size="${9.5*z}" font-weight="700" text-anchor="end" fill="#2f7a2f" ${halo}>↑ ${pct(hi.aum)}</text>`
      + `<text x="${cx-8}" y="${cy-13*z}" font-size="${9*z}" text-anchor="end" fill="#4f7397" ${halo}>IPC ${pct(hi.ipc)}</text>`; });
  document.getElementById('aumGraf').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
  const ultIpc = Object.keys(IPC).sort().pop();
  document.getElementById('aumNota').textContent = `En cada aumento: el % de aumento contra el valor anterior y la inflación del INDEC acumulada (mes a mes, encadenada) desde el aumento anterior hasta el mes previo. IPC cargado hasta ${ultIpc ? (()=>{ const [y,m] = ultIpc.split('-'); return MESES[+m-1].toLowerCase() + ' ' + y; })() : '—'}.`;
}

document.getElementById('asisFiltros').addEventListener('click', e=>{
  const b = e.target.closest('[data-slot]'); if(!b) return;
  const i = +b.dataset.slot; asisSel = asisSel && asisSel.slot===i ? null : {slot:i}; renderAsistencias();
});
document.getElementById('asisEstilos').addEventListener('click', e=>{
  const sl = e.target.closest('[data-slot]');
  if(sl){ const i = +sl.dataset.slot; asisSel = asisSel && asisSel.slot===i ? null : {slot:i}; renderAsistencias(); return; }
  const c = e.target.closest('[data-estilo]'); if(!c) return;
  const n = c.dataset.estilo; asisSel = asisSel && asisSel.estilo===n ? null : {estilo:n}; renderAsistencias();
});

/* ---- Notas cortadas en todo el sistema: si el texto no entra, aparece "… ver más" y se abre la nota completa ---- */
const VM_SEL = 'td.notas:not(.tabla-mov td), td.cortable, td > input.cp-notas, td > textarea.dv-motivo';
function vmTextoDe(td){
  const f = td.querySelector(':scope > input.cp-notas, :scope > textarea.dv-motivo');
  if(f) return f.value;
  if(td.dataset.full) return td.dataset.full;
  const c = td.cloneNode(true); c.querySelectorAll('.vm-btn').forEach(b=> b.remove());
  return c.textContent.trim();
}
function vmRevisar(){
  document.querySelectorAll(VM_SEL).forEach(el=>{
    const td = el.tagName==='TD' ? el : el.parentElement;
    if(!td.offsetParent || td.contains(document.activeElement)) return;   // oculto, o se está escribiendo
    let cortado;
    if(el.tagName==='TEXTAREA') cortado = el.scrollHeight > el.clientHeight + 1;
    else if(el.tagName==='INPUT') cortado = el.scrollWidth > el.clientWidth + 1;
    else cortado = td.scrollWidth > td.clientWidth + 1;
    let b = td.querySelector(':scope > .vm-btn');
    if(cortado && !b){
      b = document.createElement('button'); b.type = 'button'; b.className = 'vm-btn'; b.tabIndex = -1;
      b.innerHTML = '… <b>ver más</b>';
      td.appendChild(b); td.classList.add('vm-td'); td.classList.toggle('vm-ta', el.tagName==='TEXTAREA');
    } else if(!cortado && b){ b.remove(); td.classList.remove('vm-td', 'vm-ta'); }
  });
}
let vmPendiente = false;
const vmProgramar = ()=>{ if(vmPendiente) return; vmPendiente = true; requestAnimationFrame(()=>{ vmPendiente = false; vmRevisar(); }); };
new MutationObserver(vmProgramar).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
window.addEventListener('resize', vmProgramar);
document.addEventListener('focusout', ()=> setTimeout(vmProgramar, 60));
document.addEventListener('mousedown', e=>{ if(e.target.closest('.vm-btn')) e.preventDefault(); }, true);   // que no tome el foco
document.addEventListener('click', e=>{
  const b = e.target.closest('.vm-btn'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const td = b.closest('td'), tabla = td.closest('table');
  let tit = '';
  const filaTit = tabla && tabla.tHead ? tabla.tHead.rows[tabla.tHead.rows.length-1] : null;
  const th = filaTit ? filaTit.cells[td.cellIndex] : null;
  if(th) tit = (th.innerText || '').replace(/\s+/g,' ').trim() || ((th.querySelector('input')||{}).placeholder || '');
  document.getElementById('vmTitulo').textContent = tit ? tit.charAt(0).toUpperCase() + tit.slice(1).toLowerCase() : 'Nota';
  document.getElementById('vmTexto').textContent = vmTextoDe(td);
  document.getElementById('overlayVerMas').classList.add('show');
}, true);
const vmCerrar = ()=> document.getElementById('overlayVerMas').classList.remove('show');
document.getElementById('vmCerrar').onclick = vmCerrar;
document.getElementById('vmOk').onclick = vmCerrar;
document.getElementById('overlayVerMas').addEventListener('click', e=>{ if(e.target.id==='overlayVerMas') vmCerrar(); });

// Esc cierra la ventana/desplegable que esté abierto arriba de todo
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape' || e.defaultPrevented) return;
  const abiertas = [...document.querySelectorAll('.overlay.show')];
  if(!abiertas.length) return;
  const ov = abiertas.sort((a,b)=> (parseInt(getComputedStyle(a).zIndex)||0) - (parseInt(getComputedStyle(b).zIndex)||0)).pop();
  e.preventDefault();
  const cerrar = ov.querySelector('.close-x');
  if(cerrar) cerrar.click(); else ov.classList.remove('show');
});

// Arranque: recién acá (con todos los archivos cargados) se escucha el inicio de sesión
auth.onAuthStateChanged(alCambiarSesion);
