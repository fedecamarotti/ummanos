/* =====================================================================
   INFORMES (admin) — rango de fechas + filtro por profesional
   ===================================================================== */
const overlayInformes = document.getElementById('overlayInformes');
const informeProfesional = document.getElementById('informeProfesional');
attachAutocomplete(informeProfesional, ()=> ["Todos", ...todosLosNombresDeProfesionales()]);

document.getElementById('btnInformes').onclick = ()=>{
  const hoy = hoyISO();
  document.getElementById('informeFechaDesde').value = hoy;
  document.getElementById('informeFechaHasta').value = hoy;
  informeProfesional.value = "";
  document.getElementById('kpiRow').innerHTML = "";
  overlayInformes.classList.add('show');
};
document.getElementById('closeInformes').onclick = ()=> overlayInformes.classList.remove('show');
document.getElementById('cerrarInformes').onclick = ()=> overlayInformes.classList.remove('show');

document.getElementById('btnGenerarInforme').onclick = async ()=>{
  const desde = document.getElementById('informeFechaDesde').value;
  const hasta = document.getElementById('informeFechaHasta').value;
  if(!desde || !hasta){ alert("Elegí fecha desde y hasta."); return; }
  if(desde > hasta){ alert("La fecha 'desde' no puede ser posterior a 'hasta'."); return; }
  const profElegido = informeProfesional.value.trim();
  const filtrarProf = profElegido && profElegido.toLowerCase() !== "todos";

  const btn = document.getElementById('btnGenerarInforme');
  btn.disabled = true; btn.textContent = "Calculando…";
  document.getElementById('kpiRow').innerHTML = '<div class="empty-state">Calculando…</div>';

  try{
    let query = db.collection('movimientos').where('fechaISO','>=', desde).where('fechaISO','<=', hasta);
    if(filtrarProf) query = query.where('prof','==', profElegido);
    const snap = await query.get();
    const filas = snap.docs.map(d=> d.data());

    let ingresosPesos=0, egresosPesos=0, ingresosUsd=0, egresosUsd=0;
    filas.forEach(m=>{
      const out = esGastoMov(m);
      if(out){
        if(m.moneda==="USD") egresosUsd+=m.valor; else egresosPesos+=m.valor;
      } else {
        pagosDe(m).forEach(p=>{
          if(p.cobradoPor === "profesional") return; // esa plata no la manejó Ummana
          if(m.moneda==="USD") ingresosUsd+=p.valor; else ingresosPesos+=p.valor;
        });
      }
    });

    document.getElementById('kpiRow').innerHTML = `
      <div class="kpi"><div class="lbl">Ingresos</div><div class="val">$${ingresosPesos.toLocaleString('es-AR')}</div>${ingresosUsd?`<div class="lbl" style="margin-top:4px;">US$ ${ingresosUsd.toLocaleString('es-AR')}</div>`:""}</div>
      <div class="kpi"><div class="lbl">Egresos</div><div class="val">$${egresosPesos.toLocaleString('es-AR')}</div>${egresosUsd?`<div class="lbl" style="margin-top:4px;">US$ ${egresosUsd.toLocaleString('es-AR')}</div>`:""}</div>
      <div class="kpi"><div class="lbl">Saldo neto</div><div class="val">$${(ingresosPesos-egresosPesos).toLocaleString('es-AR')}</div>${(ingresosUsd||egresosUsd)?`<div class="lbl" style="margin-top:4px;">US$ ${(ingresosUsd-egresosUsd).toLocaleString('es-AR')}</div>`:""}</div>
    `;
  }catch(e){
    document.getElementById('kpiRow').innerHTML = `<div class="empty-state">Error al calcular: ${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = "Generar";
};

/* =====================================================================
   IMPORTAR CATÁLOGO (admin) — pacientes y profesionales/conceptos vía CSV
   ===================================================================== */
const overlayImportar = document.getElementById('overlayImportar');
document.getElementById('btnImportar').onclick = ()=>{
  if(!esFede()) return;
  document.getElementById('impPacientesInfo').textContent = "";
  document.getElementById('impPacientesFile').value = "";
  document.getElementById('impPacientesBtn').disabled = true;
  impPacientesRows = [];
  document.getElementById('impConceptosInfo').textContent = "";
  document.getElementById('impConceptosFile').value = "";
  document.getElementById('impConceptosBtn').disabled = true;
  impConceptosRows = [];
  overlayImportar.classList.add('show');
};
document.getElementById('btnMigrarMayus').onclick = async ()=>{
  if(!esFede()) return;
  if(!await ummConfirm("Se van a pasar a mayúsculas y sin tildes todos los datos ya cargados (movimientos, pacientes, profesionales, conceptos y proveedores). ¿Continuar?")) return;
  const btn = document.getElementById('btnMigrarMayus');
  const info = document.getElementById('mayusInfo');
  btn.disabled = true;
  const resumen = [];
  try{
    for(const col of Object.keys(CAMPOS_MAYUS)){
      info.textContent = `Revisando ${col}…`;
      const snap = await db.collection(col).get();
      const cambios = [];
      snap.docs.forEach(d=>{
        const dato = d.data(), upd = {};
        CAMPOS_MAYUS[col].forEach(k=>{
          if(typeof dato[k]==='string' && dato[k] !== mayus(dato[k])) upd[k] = mayus(dato[k]);
        });
        if(Object.keys(upd).length) cambios.push([d.ref, upd]);
      });
      for(let i=0; i<cambios.length; i+=400){
        const lote = db.batch();
        cambios.slice(i, i+400).forEach(([ref, upd])=> lote.update(ref, col==='pacientes' ? {...upd, ...marcaPac()} : upd));
        await lote.commit();
        info.textContent = `Actualizando ${col}… ${Math.min(i+400, cambios.length)}/${cambios.length}`;
      }
      resumen.push(`${col}: ${cambios.length}`);
    }
    info.textContent = `¡Listo! Registros actualizados → ${resumen.join(' · ')}.`;
  }catch(e){
    info.textContent = `Se cortó con un error: ${e.message}. Podés volver a tocar el botón: sigue desde donde quedó.`;
  }
  btn.disabled = false;
};

document.getElementById('closeImportar').onclick = ()=> overlayImportar.classList.remove('show');
document.getElementById('cerrarImportar').onclick = ()=> overlayImportar.classList.remove('show');

async function importarEnLotes(coleccion, filas){
  filas = filas.map(f=> mayusDoc(coleccion, f));
  const CHUNK = 400;
  for(let i=0; i<filas.length; i+=CHUNK){
    const lote = db.batch();
    filas.slice(i, i+CHUNK).forEach(dato=>{
      const ref = db.collection(coleccion).doc();
      lote.set(ref, coleccion==='pacientes' ? {...dato, ...marcaPac()} : dato);
    });
    await lote.commit();
  }
  if(coleccion==='pacientes'){ try{ localStorage.removeItem(PAC_CACHE_KEY); }catch(_){} }   // la próxima apertura vuelve a leer la lista completa
}

async function vaciarColeccion(coleccion){
  const CHUNK = 400;
  let snap = await db.collection(coleccion).limit(CHUNK).get();
  let total = 0;
  while(!snap.empty){
    const lote = db.batch();
    snap.docs.forEach(d=> lote.delete(d.ref));
    await lote.commit();
    total += snap.size;
    snap = await db.collection(coleccion).limit(CHUNK).get();
  }
  return total;
}

document.getElementById('btnCorregirFechas').onclick = async ()=>{
  if(!await ummConfirm("Esto revisa todos los pacientes y convierte las fechas de nacimiento que hayan quedado guardadas como número de Excel a una fecha real. ¿Continuamos?")) return;
  document.getElementById('btnCorregirFechas').disabled = true;
  document.getElementById('impPacientesInfo').textContent = "Revisando pacientes…";

  const snap = await db.collection('pacientes').get();
  const CHUNK = 400;
  let corregidos = 0;
  let pendientes = [];
  snap.docs.forEach(d=>{
    const fnac = d.data().fnac;
    if(fnac && /^\d+$/.test(String(fnac).trim())){
      const nueva = excelSerialToISODate(fnac);
      if(nueva !== fnac){ pendientes.push({ref: d.ref, fnac: nueva}); }
    }
  });
  for(let i=0; i<pendientes.length; i+=CHUNK){
    const lote = db.batch();
    pendientes.slice(i, i+CHUNK).forEach(p=> lote.update(p.ref, {fnac: p.fnac, ...marcaPac()}));
    await lote.commit();
    corregidos += Math.min(CHUNK, pendientes.length - i);
  }

  document.getElementById('impPacientesInfo').textContent = corregidos
    ? `Se corrigieron ${corregidos} fechas de nacimiento.`
    : "No encontré fechas guardadas como número — ya está todo bien.";
  document.getElementById('btnCorregirFechas').disabled = false;
};

document.getElementById('btnMigrarPagos').onclick = async ()=>{
  if(!await ummConfirm("Esto revisa todos los movimientos y les agrega el nuevo campo de pagos si todavía no lo tienen. No cambia montos ni medios. ¿Continuamos?")) return;
  document.getElementById('btnMigrarPagos').disabled = true;
  document.getElementById('migrarPagosInfo').textContent = "Revisando movimientos…";
  try{
    const snap = await db.collection('movimientos').get();
    const CHUNK = 400;
    const pendientes = [];
    snap.docs.forEach(d=>{
      const m = d.data();
      if(!m.pagos){
        const pagos = pagosDe(m);
        pendientes.push({ref: d.ref, pagos, tieneDeudaPendiente: tieneDeudaPendiente(pagos)});
      }
    });
    for(let i=0; i<pendientes.length; i+=CHUNK){
      const lote = db.batch();
      pendientes.slice(i, i+CHUNK).forEach(p=> lote.update(p.ref, {pagos: p.pagos, tieneDeudaPendiente: p.tieneDeudaPendiente}));
      await lote.commit();
    }
    document.getElementById('migrarPagosInfo').textContent = pendientes.length
      ? `Se migraron ${pendientes.length} movimientos.`
      : "No había movimientos para migrar — ya está todo al día.";
  }catch(e){
    document.getElementById('migrarPagosInfo').textContent = "Error: " + e.message;
  }
  document.getElementById('btnMigrarPagos').disabled = false;
};

document.getElementById('btnVaciarPacientes').onclick = async ()=>{
  if(!await ummConfirm("Esto borra TODOS los pacientes de la base, sin excepción. No se puede deshacer. ¿Confirmás que querés vaciarla?")) return;
  if(!await ummConfirm("Confirmá una vez más: se van a eliminar todos los pacientes para volver a importarlos. ¿Seguimos?")) return;
  document.getElementById('btnVaciarPacientes').disabled = true;
  document.getElementById('impPacientesInfo').textContent = "Borrando pacientes…";
  const total = await vaciarColeccion('pacientes');
  document.getElementById('impPacientesInfo').textContent = `Se borraron ${total} pacientes. Ya podés importar el CSV de nuevo.`;
  document.getElementById('btnVaciarPacientes').disabled = false;
};

let impPacientesRows = [];
document.getElementById('impPacientesFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  Papa.parse(file, {
    header:true, skipEmptyLines:true,
    complete: (res)=>{
      impPacientesRows = res.data.map(r=>({
        apellido: (r.Apellido||r.apellido||"").trim(),
        nombre: (r.Nombre||r.nombre||"").trim(),
        telefono: (r.Telefono||r["Teléfono"]||r.telefono||"").trim(),
        email: (r.Email||r.email||"").trim(),
        fnac: excelSerialToISODate((r.FechaNacimiento||r.fechaNacimiento||"").trim()),
        dni: (r.DNI||r.dni||"").trim(),
        medioLlegada: (r.MedioLlegada||r.medioLlegada||"").trim(),
      })).filter(r=>r.apellido && r.nombre);
      const invalidos = res.data.length - impPacientesRows.length;
      document.getElementById('impPacientesInfo').textContent =
        `${impPacientesRows.length} pacientes listos para importar` + (invalidos>0 ? ` (se ignoran ${invalidos} filas sin apellido/nombre)` : "");
      document.getElementById('impPacientesBtn').disabled = impPacientesRows.length===0;
    }
  });
});
document.getElementById('impPacientesBtn').onclick = async ()=>{
  if(!impPacientesRows.length) return;
  if(!await ummConfirm(`¿Importar ${impPacientesRows.length} pacientes? Esta acción no se puede deshacer.`)) return;
  document.getElementById('impPacientesBtn').disabled = true;
  try{
    await importarEnLotes('pacientes', impPacientesRows.map(r=>({
      apellido: r.apellido.toUpperCase(), nombre: r.nombre,
      nombreCompleto: `${r.apellido.toUpperCase()}, ${r.nombre}`,
      telefono: r.telefono, email: r.email, fnac: r.fnac, dni: r.dni, medioLlegada: r.medioLlegada,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    })));
    document.getElementById('impPacientesInfo').textContent = "¡Listo! Pacientes importados.";
  }catch(e){
    document.getElementById('impPacientesInfo').textContent = "Error al importar: " + e.message;
    document.getElementById('impPacientesBtn').disabled = false;
  }
};

let impConceptosRows = [];
document.getElementById('impConceptosFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  Papa.parse(file, {
    header:true, skipEmptyLines:true,
    complete: (res)=>{
      impConceptosRows = res.data.map(r=>({
        profesional: (r.Profesional||r.profesional||"").trim(),
        concepto: (r.Concepto||r.concepto||"").trim(),
        codigo: (r.Codigo||r["Código"]||r.codigo||"").trim(),
      })).filter(r=>r.profesional && r.concepto);
      const invalidos = res.data.length - impConceptosRows.length;
      document.getElementById('impConceptosInfo').textContent =
        `${impConceptosRows.length} conceptos listos para importar` + (invalidos>0 ? ` (se ignoran ${invalidos} filas sin profesional/concepto)` : "");
      document.getElementById('impConceptosBtn').disabled = impConceptosRows.length===0;
    }
  });
});
document.getElementById('impConceptosBtn').onclick = async ()=>{
  if(!impConceptosRows.length) return;
  if(!await ummConfirm(`¿Importar ${impConceptosRows.length} conceptos? Esta acción no se puede deshacer.`)) return;
  document.getElementById('impConceptosBtn').disabled = true;
  try{
    await importarEnLotes('conceptos', impConceptosRows);
    document.getElementById('impConceptosInfo').textContent = "¡Listo! Catálogo importado.";
  }catch(e){
    document.getElementById('impConceptosInfo').textContent = "Error al importar: " + e.message;
    document.getElementById('impConceptosBtn').disabled = false;
  }
};

/* =====================================================================
   PANEL "CAJAS" (admin) — historial de apertura/cierre por mes
   ===================================================================== */
const overlayCajas = document.getElementById('overlayCajas');
let mesCajas = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };

function mesCajasInicioISO(){ return `${mesCajas.year}-${String(mesCajas.month).padStart(2,'0')}-01`; }
function mesCajasFinISO(){
  let y = mesCajas.year, m = mesCajas.month + 1;
  if(m>12){ m=1; y++; }
  return `${y}-${String(m).padStart(2,'0')}-01`;
}
function actualizarMesCajasLabel(){
  document.getElementById('mesCajasLabel').textContent = `${MESES[mesCajas.month-1]} ${mesCajas.year}`;
  const esMesActualReal = mesCajas.year===hoyRef.getFullYear() && mesCajas.month===(hoyRef.getMonth()+1);
  document.getElementById('mesCajasNext').disabled = esMesActualReal;
}

document.getElementById('btnCajas').onclick = ()=>{
  mesCajas = { year: hoyRef.getFullYear(), month: hoyRef.getMonth()+1 };
  actualizarMesCajasLabel();
  cargarCajas();
  overlayCajas.classList.add('show');
};
document.getElementById('closeCajas').onclick = ()=> overlayCajas.classList.remove('show');
document.getElementById('cerrarCajas').onclick = ()=> overlayCajas.classList.remove('show');
document.getElementById('mesCajasPrev').onclick = ()=>{
  mesCajas.month--; if(mesCajas.month<1){ mesCajas.month=12; mesCajas.year--; }
  actualizarMesCajasLabel(); cargarCajas();
};
document.getElementById('mesCajasNext').onclick = ()=>{
  mesCajas.month++; if(mesCajas.month>12){ mesCajas.month=1; mesCajas.year++; }
  actualizarMesCajasLabel(); cargarCajas();
};

async function cargarCajas(){
  const cont = document.getElementById('cajasLista');
  cont.innerHTML = '<div class="empty-state">Cargando…</div>';
  try{
    const inicio = mesCajasInicioISO(), fin = mesCajasFinISO();
    const [snap, snapPrev] = await Promise.all([
      db.collection('cajaSesiones')
        .where('fechaISO','>=', inicio)
        .where('fechaISO','<', fin)
        .orderBy('fechaISO','asc')
        .orderBy('abiertaEn','asc')
        .get(),
      // Cajas anteriores al mes, para comparar la primera apertura con el último cierre previo
      db.collection('cajaSesiones')
        .where('fechaISO','<', inicio)
        .orderBy('fechaISO','desc')
        .limit(10)
        .get(),
    ]);
    if(snap.empty){ cont.innerHTML = '<div class="empty-state">No hay aperturas registradas este mes.</div>'; return; }

    // Movimientos cargados durante las cajas del mes, asignados a cada caja
    const sesiones = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(c=>c.abiertaEn);
    const movsSes = await movimientosParaSesiones(sesiones);
    const netoPorCaja = netoPorSesion(movsSes, sesiones);
    const netoPorCajaUsd = netoPorSesion(movsSes, sesiones, 'USD');

    // Último cierre anterior al mes (ordenado por fecha y hora de apertura)
    const previas = snapPrev.docs.map(d=>d.data())
      .filter(c=>c.cerradaEn && c.montoContado!=null)
      .sort((a,b)=> a.fechaISO===b.fechaISO ? (tsMs(b.abiertaEn)||0)-(tsMs(a.abiertaEn)||0) : (a.fechaISO<b.fechaISO?1:-1));
    let cierreAnterior = previas.length ? Number(previas[0].montoContado) : null;

    const fmtDif = v => `${v>0?'+':'-'}$${Math.abs(v).toLocaleString('es-AR')}`;
    const rojo = 'color:#a13a3a;font-weight:700;';

    cajasCache = {};
    const filas = snap.docs.map(d=>{
      const c = d.data();
      const apertura = Number(c.aperturaMonto)||0;
      const cerrada = !!c.cerradaEn && c.montoContado!=null;

      // Diferencia de apertura: vs. el cierre de la caja anterior
      const difApertura = cierreAnterior!==null ? apertura - cierreAnterior : 0;

      // Diferencia de cierre: contado vs. (apertura + neto en efectivo de ESTA caja)
      const esperado = apertura + (netoPorCaja[d.id]||0);
      const difCierre = cerrada ? Number(c.montoContado) - esperado : 0;
      const conUsd = c.aperturaMontoUsd != null;   // cajas abiertas desde que se cuentan dólares
      const esperadoUsd = (Number(c.aperturaMontoUsd)||0) + (netoPorCajaUsd[d.id]||0);
      const difCierreUsd = conUsd && cerrada && c.montoContadoUsd != null ? Number(c.montoContadoUsd) - esperadoUsd : 0;

      cajasCache[d.id] = {...c, _cierreAnterior: cierreAnterior};
      if(cerrada) cierreAnterior = Number(c.montoContado);

      const horaApertura = c.abiertaEn ? c.abiertaEn.toDate().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : "—";
      const horaCierre = c.cerradaEn ? c.cerradaEn.toDate().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : "";

      let difHTML;
      if(!difApertura && !difCierre){
        difHTML = `<span style="color:var(--muted);">${cerrada ? '$0' : '—'}</span>`;
      } else {
        difHTML = '';
        if(difApertura) difHTML += `<div style="${rojo}">${fmtDif(difApertura)}</div><div style="font-size:9px;color:#a13a3a;">en la apertura</div>`;
        if(difCierre)   difHTML += `<div style="${rojo}">${fmtDif(difCierre)}</div><div style="font-size:9px;color:#a13a3a;">en el cierre</div>`;
      }
      if(difCierreUsd) difHTML = (difHTML.includes('—') || difHTML.includes('$0') ? '' : difHTML) + `<div style="${rojo}">${difCierreUsd>0?'+':'-'}US$ ${Math.abs(difCierreUsd).toLocaleString('es-AR')}</div><div style="font-size:9px;color:#a13a3a;">en el cierre (USD)</div>`;
      if(c.explicacionDiferencia) difHTML += `<div class="caja-explic" title="${escAttr(c.explicacionDiferencia)}">“${escHtml(c.explicacionDiferencia)}”</div>`;

      return `
        <tr>
          <td class="left">${c.recepcionista||''}</td>
          <td>
            <div>${isoToDisplay(c.fechaISO)}</div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:400;">${horaApertura}${horaCierre ? ' - '+horaCierre : ''}</div>
          </td>
          <td>$${apertura.toLocaleString('es-AR')}${conUsd ? `<div style="font-size:10px;color:var(--muted)">US$ ${Number(c.aperturaMontoUsd).toLocaleString('es-AR')}</div>` : ''}</td>
          <td>${cerrada ? '$'+Number(c.montoContado).toLocaleString('es-AR') : '—'}${cerrada && c.montoContadoUsd != null ? `<div style="font-size:10px;color:var(--muted)">US$ ${Number(c.montoContadoUsd).toLocaleString('es-AR')}</div>` : ''}</td>
          <td>${difHTML}</td>
          <td class="editcol">${c.notaAdmin
            ? `<button class="editbtn cn-ojo" title="Ver / editar nota" onclick="abrirNotaCaja('${d.id}')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button>`
            : `<button class="editbtn" title="Agregar nota" onclick="abrirNotaCaja('${d.id}')">&#9998;</button>`}</td>
          <td class="editcol"><button class="editbtn" title="Editar" onclick="abrirEdicionCaja('${d.id}')">&#9998;</button></td>
        </tr>
      `;
    }).join('');
    cont.innerHTML = `
      <div class="sheet-wrap" style="margin:0;">
        <table style="width:100%;">
          <thead>
            <tr><th class="left">Nombre</th><th>Fecha</th><th>Apertura</th><th>Cierre</th><th>Diferencia</th><th>Nota</th><th></th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    `;
  }catch(e){
    cont.innerHTML = `<div class="empty-state">Error al cargar: ${e.message}</div>`;
  }
}

let cajasCache = {};
// Notas internas por caja (Fede y Pedro): se guardan en la misma sesión de caja
const overlayNotaCaja = document.getElementById('overlayNotaCaja');
let notaCajaId = null;
function abrirNotaCaja(id){
  const c = cajasCache[id]; if(!c) return;
  notaCajaId = id;
  document.getElementById('ncSub').textContent = `${c.recepcionista||''} · ${isoToDisplay(c.fechaISO)}`;
  document.getElementById('ncTexto').value = c.notaAdmin || '';
  if(c.notaAdmin) document.getElementById('ncSub').textContent += ` — nota de ${c.notaPor||''}${c.notaEn && c.notaEn.toDate ? ' el ' + c.notaEn.toDate().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : ''}`;
  overlayNotaCaja.classList.add('show');
  setTimeout(()=> document.getElementById('ncTexto').focus(), 50);
}
window.abrirNotaCaja = abrirNotaCaja;
['closeNotaCaja','cancelNotaCaja'].forEach(id=> document.getElementById(id).onclick = ()=> overlayNotaCaja.classList.remove('show'));
document.getElementById('guardarNotaCaja').onclick = async ()=>{
  if(!notaCajaId) return;
  const txt = mayus(document.getElementById('ncTexto').value.trim());
  const btn = document.getElementById('guardarNotaCaja'); btn.disabled = true;
  try{
    await db.collection('cajaSesiones').doc(notaCajaId).update(txt
      ? {notaAdmin: txt, notaPor: currentUser.nombre, notaEn: firebase.firestore.FieldValue.serverTimestamp()}
      : {notaAdmin: firebase.firestore.FieldValue.delete(), notaPor: firebase.firestore.FieldValue.delete(), notaEn: firebase.firestore.FieldValue.delete()});
    overlayNotaCaja.classList.remove('show');
    cargarCajas();
  }catch(e){ alert('No se pudo guardar la nota: ' + e.message); }
  btn.disabled = false;
};
const overlayEditarCaja = document.getElementById('overlayEditarCaja');
let editandoCajaId = null;

function abrirEdicionCaja(id){
  const c = cajasCache[id];
  if(!c) return;
  editandoCajaId = id;
  document.getElementById('ecNombre').value = c.recepcionista || '';
  document.getElementById('ecFecha').value = c.fechaISO || '';
  document.getElementById('ecApertura').value = c.aperturaMonto!=null ? Number(c.aperturaMonto).toLocaleString('es-AR') : '';
  document.getElementById('ecCierre').value = c.montoContado!=null ? Number(c.montoContado).toLocaleString('es-AR') : '';
  overlayEditarCaja.classList.add('show');
}
window.abrirEdicionCaja = abrirEdicionCaja;
document.getElementById('closeEditarCaja').onclick = ()=> overlayEditarCaja.classList.remove('show');
document.getElementById('cancelEditarCaja').onclick = ()=> overlayEditarCaja.classList.remove('show');

document.getElementById('guardarEditarCaja').onclick = async ()=>{
  if(!editandoCajaId) return;
  const c = cajasCache[editandoCajaId];
  const nombre = document.getElementById('ecNombre').value.trim();
  const fechaISO = document.getElementById('ecFecha').value;
  const aperturaTxt = document.getElementById('ecApertura').value.replace(/\D/g,"");
  const cierreTxt = document.getElementById('ecCierre').value.replace(/\D/g,"");
  if(!nombre){ alert("Ingresá el nombre."); return; }
  if(!fechaISO){ alert("Elegí una fecha."); return; }
  if(!aperturaTxt){ alert("Ingresá el monto de apertura."); return; }
  if(!await ummConfirm("¿Guardar los cambios de esta caja?")) return;

  const cambios = {
    recepcionista: nombre, cerradaPor: nombre, fechaISO,
    aperturaMonto: Number(aperturaTxt),
  };

  const btn = document.getElementById('guardarEditarCaja');
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    // Se recalcula con los valores editados para que lo guardado quede consistente
    cambios.diferenciaApertura = c._cierreAnterior!=null ? cambios.aperturaMonto - c._cierreAnterior : 0;
    if(cierreTxt){
      cambios.montoContado = Number(cierreTxt);
      cambios.esperadoCierre = cambios.aperturaMonto + await netoEfectivoDeSesion(editandoCajaId, c);
      cambios.diferencia = cambios.montoContado - cambios.esperadoCierre;
    }
    await db.collection('cajaSesiones').doc(editandoCajaId).update(cambios);
    overlayEditarCaja.classList.remove('show');
    cargarCajas();
  }catch(e){
    alert("No se pudo guardar: " + e.message);
  }
  btn.disabled = false; btn.textContent = "Guardar";
};

document.getElementById('eliminarEditarCaja').onclick = async ()=>{
  if(!editandoCajaId) return;
  if(!await ummConfirm("¿Eliminar este registro de apertura/cierre de caja? Esta acción no se puede deshacer.")) return;
  const btn = document.getElementById('eliminarEditarCaja');
  btn.disabled = true;
  try{
    await db.collection('cajaSesiones').doc(editandoCajaId).delete();
    overlayEditarCaja.classList.remove('show');
    cargarCajas();
  }catch(e){
    alert("No se pudo eliminar: " + e.message);
    btn.disabled = false;
  }
};

/* =====================================================================
   PANEL "PACIENTES" (buscar y editar, para ambos roles)
   ===================================================================== */
let pacientesFullList = [];
let mostrarNuevoPaciente = false;
const overlayPacientes = document.getElementById('overlayPacientes');
const buscarPacienteInput = document.getElementById('buscarPacienteInput');

document.getElementById('btnPacientes').onclick = ()=>{
  buscarPacienteInput.value = "";
  mostrarNuevoPaciente = false;
  pacVistaPanel('lista');
  renderPacientesBusqueda();
  overlayPacientes.classList.add('show');
  buscarPacienteInput.focus();
};
document.getElementById('closePacientes').onclick = ()=> overlayPacientes.classList.remove('show');
document.getElementById('cerrarPacientes').onclick = ()=> overlayPacientes.classList.remove('show');
document.getElementById('btnNuevoPaciente').onclick = ()=> abrirFichaPaciente(null);
buscarPacienteInput.addEventListener('input', renderPacientesBusqueda);

// Medio de llegada: opciones fijas (se guardan en mayúsculas, como el resto de los datos)
const MEDIOS_LLEGADA = [['GOOGLE','Google'],['PACIENTE ANTERIOR','Paciente anterior'],['INSTAGRAM','Instagram'],['REFERIDO','Referido']];
function medioLlegadaNormal(v){
  const k = normBusqueda(v||'').trim();
  if(!k) return '';
  const o = MEDIOS_LLEGADA.find(([val, lbl])=> normBusqueda(lbl)===k);
  if(o) return o[0];
  if(k.startsWith('recomend') || k.startsWith('referid')) return 'REFERIDO';
  return mayus(v);   // valor viejo que no está en la lista: se conserva
}
const escHtml = t => String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function pacVistaPanel(v){
  document.getElementById('pacVistaLista').classList.toggle('col-hidden', v!=='lista');
  document.getElementById('pacVistaFicha').classList.toggle('col-hidden', v!=='ficha');
  overlayPacientes.scrollTop = 0;
}
function renderPacientesBusqueda(){
  if(!document.getElementById('pacVistaFicha').classList.contains('col-hidden')) return;   // con la ficha abierta no se toca nada
  const q = normBusqueda(buscarPacienteInput.value.trim());
  const cont = document.getElementById('pacientesScroll');
  const filtrados = (q
    ? pacientesFullList.filter(p=> normBusqueda(p.nombreCompleto || `${p.apellido||''}, ${p.nombre||''}`).includes(q))
    : pacientesFullList).slice().sort((a,b)=> (a.nombreCompleto||'').localeCompare(b.nombreCompleto||'','es'));
  if(!filtrados.length){ cont.innerHTML = '<div class="empty-state">No encontré pacientes con ese nombre. Para crearlo, tocá el +.</div>'; return; }
  cont.innerHTML = filtrados.slice(0, 300).map(p=> `<button type="button" class="pf-item" data-id="${p.id}"><span>${escHtml(p.nombreCompleto || `${p.apellido||''}, ${p.nombre||''}`)}</span><span class="flecha">›</span></button>`).join('')
    + (filtrados.length > 300 ? `<div class="empty-state">Hay ${filtrados.length} pacientes: escribí para filtrar.</div>` : '');
}
document.getElementById('pacientesScroll').addEventListener('click', e=>{
  const b = e.target.closest('.pf-item'); if(b) abrirFichaPaciente(b.dataset.id);
});

/* ---- Ficha del paciente ---- */
let pfPaciente = null;   // null = paciente nuevo
function pfSetMedio(valor){
  const sel = document.getElementById('pfMedio');
  const v = medioLlegadaNormal(valor);
  const ops = [['','Seleccionar…'], ...MEDIOS_LLEGADA];
  if(v && !MEDIOS_LLEGADA.some(o=> o[0]===v)) ops.push([v, v]);
  sel.innerHTML = ops.map(([val, lbl])=> `<option value="${escHtml(val)}">${escHtml(lbl)}</option>`).join('');
  sel.value = v;
  document.getElementById('pfRefWrap').classList.toggle('col-hidden', v!=='REFERIDO');
}
document.getElementById('pfMedio').addEventListener('change', e=> document.getElementById('pfRefWrap').classList.toggle('col-hidden', e.target.value!=='REFERIDO'));
document.getElementById('pfFnac').addEventListener('input', e=>{ const ed = edadDesde(e.target.value); document.getElementById('pfEdad').textContent = ed==='—' ? '' : `(${ed})`; });
// Campos sin completar en la ficha: fondo rosado (se va solo al completarlos)
const PF_CAMPOS = ['pfTelefono','pfEmail','pfFnac','pfDni','pfMedio','pfReferido'];
function pfMarcarVacios(){ PF_CAMPOS.forEach(id=>{ const el = document.getElementById(id); el.classList.toggle('pf-vacio', !String(el.value||'').trim()); }); }
PF_CAMPOS.forEach(id=>{ const el = document.getElementById(id); el.addEventListener('input', pfMarcarVacios); el.addEventListener('change', pfMarcarVacios); });
document.getElementById('pfEditarNombre').onclick = ()=> document.getElementById('pfNombreCampos').classList.toggle('col-hidden');

function abrirFichaPaciente(id){
  const p = id ? pacientesFullList.find(x=> x.id===id) : null;
  if(id && !p) return;
  pfPaciente = p || null;
  const nuevo = !p;
  if(typeof pfMostrarHist==='function') pfMostrarHist(false);
  document.getElementById('pfBtnHist').classList.toggle('col-hidden', nuevo);
  document.getElementById('pfGoogleWrap').classList.toggle('col-hidden', nuevo);
  document.getElementById('pfGoogle').checked = !!(p && p.avisadoGoogle);
  document.getElementById('pfPres').classList.toggle('col-hidden', nuevo);
  document.getElementById('pfNombre').textContent = nuevo ? 'Nuevo paciente' : (p.nombreCompleto || `${p.apellido}, ${p.nombre}`);
  document.getElementById('pfEditarNombre').classList.toggle('col-hidden', nuevo);
  document.getElementById('pfNombreCampos').classList.toggle('col-hidden', !nuevo);
  document.getElementById('pfApellido').value = p ? (p.apellido||'') : '';
  document.getElementById('pfNombreIn').value = p ? (p.nombre||'') : '';
  document.getElementById('pfTelefono').value = p ? (p.telefono||'') : '';
  document.getElementById('pfEmail').value = p ? (p.email||'') : '';
  const fn = p ? fnacISO(p.fnac) : '';
  document.getElementById('pfFnac').value = fn;
  const ed = edadDesde(fn); document.getElementById('pfEdad').textContent = fn && ed!=='—' ? `(${ed})` : '';
  document.getElementById('pfDni').value = p ? (p.dni||'') : '';
  pfSetMedio(p ? p.medioLlegada : '');
  document.getElementById('pfReferido').value = p ? (p.referidoPor||'') : '';
  document.getElementById('pfEliminar').classList.toggle('col-hidden', nuevo);
  document.getElementById('pfUnificar').classList.toggle('col-hidden', nuevo || !esFede());
  document.getElementById('pfUnifBox').classList.add('col-hidden'); document.getElementById('pfUnifDup').value = '';
  document.getElementById('pfGuardar').textContent = nuevo ? 'Crear paciente' : 'Guardar';
  pfMarcarVacios();
  pacVistaPanel('ficha');
  overlayPacientes.classList.add('show');
  renderAreasPaciente(p);
  if(nuevo) document.getElementById('pfApellido').focus();
}
window.abrirFichaPaciente = abrirFichaPaciente;
function abrirFichaPacientePorNombre(nombre){
  const p = pacientesFullList.find(x=> mayus(x.nombreCompleto||'')===mayus(nombre||''));
  if(p) abrirFichaPaciente(p.id);
}
window.abrirFichaPacientePorNombre = abrirFichaPacientePorNombre;

// Áreas de Ummana: cuántas veces aparece en Movimientos (ingresos) con cada profesional/área
async function renderAreasPaciente(p){
  const cont = document.getElementById('pfAreas');
  if(!p){ cont.innerHTML = '<div class="pf-total">Todavía no tiene movimientos.</div>'; return; }
  cont.innerHTML = '<div class="pf-total">Buscando…</div>';
  const nombre = p.nombreCompleto;
  try{
    // también en mayúsculas: los movimientos migrados de la planilla vienen así
    const variantes = [...new Set([nombre, mayus(nombre)])];
    const snaps = await Promise.all(variantes.map(v=> db.collection('movimientos').where('pac','==', v).get()));
    if(!pfPaciente || pfPaciente.id!==p.id) return;   // se cambió de ficha mientras buscaba
    const cuenta = {};
    const docs = {}; snaps.forEach(sn=> sn.docs.forEach(d=> docs[d.id] = d));
    Object.values(docs).forEach(d=>{
      const m = d.data();
      if(esGastoMov(m) || /^salda deuda/i.test(m.concepto||'') || NO_ES_AREA.test(m.prof||'')) return;
      cuenta[m.prof] = (cuenta[m.prof]||0) + 1;
    });
    const lista = Object.entries(cuenta).sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0],'es'));
    if(!lista.length){ cont.innerHTML = '<div class="pf-total">Todavía no tiene movimientos.</div>'; return; }
    const max = lista[0][1], total = lista.reduce((a,x)=> a + x[1], 0);
    const lindo = n => n.toLowerCase().replace(/(^|[\s,(])([a-záéíóúñ])/g, (m0, a, b)=> a + b.toUpperCase());
    cont.innerHTML = lista.map(([prof, n])=> `<div class="pf-area"><div class="fila"><span>${escHtml(lindo(prof))}</span><b>${n}</b></div><div class="barra"><i style="width:${Math.max(4, n/max*100)}%"></i></div></div>`).join('')
      + `<div class="pf-total">Total: <b>${total} ${total===1 ? 'ingreso' : 'ingresos'}</b></div>`;
  }catch(e){ cont.innerHTML = `<div class="pf-total" style="color:#a13a3a;">No se pudieron leer los movimientos: ${escHtml(e.message)}</div>`; }
}

document.getElementById('pfVolver').onclick = ()=>{ pacVistaPanel('lista'); renderPacientesBusqueda(); };

/* ---- Historial del paciente (en la misma ventana de la ficha) ---- */
const HIST_COLORES = ['#c0705a','#5e8f62','#4f7397','#b48ab8','#c9a24a','#6e9aa0','#8a6f3c','#d0824c','#7a7ab8','#a0b45a'];
let pfHistMovs = [], pfHistFiltro = null;
function pfMostrarHist(si){
  document.getElementById('pacVistaFicha').classList.toggle('ver-hist', si);
  document.getElementById('pfHist').classList.toggle('col-hidden', !si);
  document.getElementById('pfPresVista').classList.add('col-hidden');
  document.getElementById('pfVolverFicha').classList.toggle('col-hidden', !si);
  overlayPacientes.scrollTop = 0;
}
document.getElementById('pfVolverFicha').onclick = ()=> pfMostrarHist(false);
// Presupuestos enviados: se abren en la misma ventana, con "volver" a la ficha
document.getElementById('pfPres').onclick = ()=>{
  if(!pfPaciente) return;
  pfMostrarHist(true);
  document.getElementById('pfHist').classList.add('col-hidden');
  document.getElementById('pfPresVista').classList.remove('col-hidden');
  cargarPresupuestosFicha(pfPaciente.nombreCompleto);
};
document.getElementById('pfBtnHist').onclick = async ()=>{
  if(!pfPaciente) return;
  pfHistFiltro = null; pfHistMovs = [];
  pfMostrarHist(true);
  document.getElementById('pfHistChips').innerHTML = ''; document.getElementById('pfHistRes').textContent = '';
  document.getElementById('pfHistLista').innerHTML = '<div class="pf-total">Buscando…</div>';
  const p = pfPaciente, nombre = p.nombreCompleto;
  try{
    const variantes = [...new Set([nombre, mayus(nombre)])];
    const snaps = await Promise.all(variantes.map(v=> db.collection('movimientos').where('pac','==', v).get()));
    if(!pfPaciente || pfPaciente.id!==p.id) return;
    const docs = {}; snaps.forEach(sn=> sn.docs.forEach(d=> docs[d.id] = {id:d.id, ...d.data()}));
    const ms = ts => ts && ts.toMillis ? ts.toMillis() : 0;
    pfHistMovs = Object.values(docs)
      .filter(m=> !esGastoMov(m) && !/^salda deuda/i.test(m.concepto||'') && !m.saldaDeuda && !(m.saldaDeudas||[]).length)
      .sort((a,b)=> a.fechaISO===b.fechaISO ? ms(b.creadoEn)-ms(a.creadoEn) : (a.fechaISO<b.fechaISO ? 1 : -1));
  }catch(e){ document.getElementById('pfHistLista').innerHTML = `<div class="pf-total">No se pudo leer el historial: ${escHtml(e.message)}</div>`; return; }
  renderPfHist();
};
function renderPfHist(){
  const cuenta = {}; pfHistMovs.forEach(m=> cuenta[m.prof] = (cuenta[m.prof]||0) + 1);
  const areas = Object.keys(cuenta).sort((a,b)=> cuenta[b]-cuenta[a] || a.localeCompare(b,'es'));
  const color = {}; areas.forEach((a,i)=> color[a] = HIST_COLORES[i % HIST_COLORES.length]);
  document.getElementById('pfHistChips').innerHTML = areas.length > 1
    ? `<button type="button" data-area="" class="${pfHistFiltro ? '' : 'on'}">Todas</button>` + areas.map(a=> `<button type="button" data-area="${escHtml(a)}" class="${pfHistFiltro===a ? 'on' : ''}"><i style="background:${color[a]}"></i>${escHtml(a)}</button>`).join('')
    : '';
  const lista = pfHistMovs.filter(m=> !pfHistFiltro || m.prof===pfHistFiltro);
  if(!lista.length){ document.getElementById('pfHistRes').textContent = ''; document.getElementById('pfHistLista').innerHTML = '<div class="pf-total">Todavía no tiene movimientos.</div>'; return; }
  let pesos = 0, usd = 0;
  lista.forEach(m=>{ if(m.moneda==='USD') usd += Number(m.valor)||0; else pesos += Number(m.valor)||0; usd += Number(m.valorUsd)||0; });
  document.getElementById('pfHistRes').innerHTML = `<b>${lista.length}</b> ${lista.length===1 ? 'ingreso' : 'ingresos'} · total <b>${fmtMonto(pesos,'$')}</b>${usd ? ` + <b>${fmtMonto(usd,'USD')}</b>` : ''}`;
  const fecha = iso=> { const [y,m,d] = (iso||'').split('-'); return d ? `${+d}/${+m}/${y.slice(2)}` : ''; };
  document.getElementById('pfHistLista').innerHTML = lista.map(m=>{
    const debe = pagosDe(m).filter(x=> x.medio==='debe' && !x.saldada).reduce((a,x)=> a + (Number(x.valor)||0), 0);
    return `<div class="pf-hist-fila"><span class="bar" style="background:${color[m.prof]}"></span>
      <div class="txt"><div class="meta">${fecha(m.fechaISO)} · ${escHtml(m.prof||'')}</div><div class="con">${escHtml(m.concepto||'')}</div></div>
      <div class="tot">${fmtTotal(m)}${debe ? `<small>debe ${fmtMonto(debe, m.moneda)}</small>` : ''}</div></div>`;
  }).join('');
}
document.getElementById('pfHistChips').addEventListener('click', e=>{
  const b = e.target.closest('[data-area]'); if(!b) return;
  pfHistFiltro = b.dataset.area || null; renderPfHist();
});
document.getElementById('pfCerrar').onclick = ()=> overlayPacientes.classList.remove('show');
document.getElementById('pfGuardar').onclick = async ()=>{
  const nuevo = !pfPaciente;
  const apellido = mayus(document.getElementById('pfApellido').value.trim());
  const nombre = mayus(document.getElementById('pfNombreIn').value.trim());
  if(!apellido || !nombre){ alert("Apellido y nombre son obligatorios."); document.getElementById('pfNombreCampos').classList.remove('col-hidden'); return; }
  const medio = document.getElementById('pfMedio').value;
  const datos = {
    apellido, nombre, nombreCompleto: `${apellido}, ${nombre}`,
    telefono: document.getElementById('pfTelefono').value.trim(),
    email: document.getElementById('pfEmail').value.trim(),
    fnac: document.getElementById('pfFnac').value,
    dni: document.getElementById('pfDni').value.trim(),
    medioLlegada: medio,
    referidoPor: medio==='REFERIDO' ? mayus(document.getElementById('pfReferido').value.trim()) : '',
  };
  if(nuevo){
    if(pacientesFullList.some(x=> mayus(x.nombreCompleto||'')===datos.nombreCompleto)){ alert("Ya existe un paciente con ese apellido y nombre."); return; }
    if(!await confirmarDatosFaltantes({tel: datos.telefono, dni: datos.dni, fnac: datos.fnac, medio})) return;
  }
  const btn = document.getElementById('pfGuardar'); const txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Guardando…';
  try{
    if(nuevo){
      const ref = await db.collection('pacientes').add({...datos, creadoEn: firebase.firestore.FieldValue.serverTimestamp(), ...marcaPac()});
      if(!pacientesFullList.some(x=> x.id===ref.id)) pacientesFullList.push({id: ref.id, ...datos});
      pacienteRegistry = pacientesFullList.map(x=> x.nombreCompleto);
      pfPaciente = pacientesFullList.find(x=> x.id===ref.id);
      abrirFichaPaciente(ref.id);
    } else {
      await db.collection('pacientes').doc(pfPaciente.id).update({...datos, ...marcaPac()});
      Object.assign(pfPaciente, datos);
      document.getElementById('pfNombre').textContent = datos.nombreCompleto;
      document.getElementById('pfNombreCampos').classList.add('col-hidden');
    }
    btn.textContent = '¡Guardado!';
    setTimeout(()=>{ btn.textContent = nuevo ? 'Guardar' : txt; btn.disabled = false; }, 1100);
  }catch(e){
    alert("No se pudo guardar: " + e.message);
    btn.disabled = false; btn.textContent = txt;
  }
};
document.getElementById('pfEliminar').onclick = async ()=>{
  if(!pfPaciente || !await ummConfirm("¿Eliminar este paciente? Esta acción no se puede deshacer. No borra los movimientos ya cargados con su nombre.")) return;
  try{
    await borrarPaciente(pfPaciente.id);
    pfPaciente = null;
    pacVistaPanel('lista'); renderPacientesBusqueda();
  }catch(e){ alert("No se pudo eliminar: " + e.message); }
};
/* ---- Unificar paciente duplicado (solo Fede): todo lo cargado con el nombre del duplicado pasa a este paciente.
   El duplicado no se borra: queda con fusionadoCon y deja de aparecer. ---- */
document.getElementById('pfUnificar').onclick = ()=>{
  const box = document.getElementById('pfUnifBox'); box.classList.toggle('col-hidden');
  if(!box.classList.contains('col-hidden')) document.getElementById('pfUnifDup').focus();
};
attachAutocomplete(document.getElementById('pfUnifDup'), ()=> pacienteRegistry.filter(n=> !pfPaciente || n!==pfPaciente.nombreCompleto));
async function unificarPacientes(destino, dup){
  const viejo = dup.nombreCompleto, nuevo = destino.nombreCompleto;
  const refs = [   // [colección, campo con el nombre del paciente]
    ['movimientos','pac'], ['sueros','tercero'], ['clasesPrueba','alumno'], ['derivaciones','paciente'], ['alertas','paciente'],
  ];
  const snaps = await Promise.all(refs.map(([c,f])=> db.collection(c).where(f,'==',viejo).get()));
  const cuenta = refs.map(([c],i)=> [c, snaps[i].size]).filter(([,n])=> n);
  const det = cuenta.length ? cuenta.map(([c,n])=> `· ${n} en ${c}`).join('\n') : '· No tiene registros cargados';
  if(!await ummConfirm(`Unificar "${viejo}" en "${nuevo}":\n\n${det}\n\nTodo pasa a ${nuevo} y "${viejo}" queda oculto (no se borra). ¿Seguimos?`)) return false;
  let batch = db.batch(), n = 0;
  const flush = async ()=>{ if(n){ await batch.commit(); batch = db.batch(); n = 0; } };
  for(let i=0; i<refs.length; i++){
    for(const d of snaps[i].docs){
      batch.update(d.ref, {[refs[i][1]]: nuevo, unificadoDe: viejo}); n++;
      if(n >= 400) await flush();
    }
  }
  await flush();
  // Datos del paciente: lo que falte en el que queda se completa con lo del duplicado
  const completar = {};
  ['telefono','email','fnac','dni','medioLlegada','referidoPor'].forEach(k=>{ if(!destino[k] && dup[k]) completar[k] = dup[k]; });
  if(Object.keys(completar).length){ await db.collection('pacientes').doc(destino.id).update({...completar, ...marcaPac()}); Object.assign(destino, completar); }
  // Ficha de sueros: si el duplicado tenía y el que queda no, se copia (la del duplicado no se borra)
  try{
    const [hDup, hDes] = await Promise.all([db.collection('historiasSueros').doc(dup.id).get(), db.collection('historiasSueros').doc(destino.id).get()]);
    if(hDup.exists){
      const a = hDup.data(), b = hDes.exists ? hDes.data() : {};
      const merge = {};
      Object.keys(a).forEach(k=>{ if(k==='notas') return; if(b[k]==null || b[k]==='') merge[k] = a[k]; });
      if(Array.isArray(a.notas) && a.notas.length) merge.notas = firebase.firestore.FieldValue.arrayUnion(...a.notas);
      if(Object.keys(merge).length) await db.collection('historiasSueros').doc(destino.id).set(merge, {merge:true});
    }
  }catch(e){ console.warn('Ficha de sueros no unificada', e); }
  await db.collection('pacientes').doc(dup.id).update({fusionadoCon: destino.id, fusionadoEn: firebase.firestore.FieldValue.serverTimestamp(), fusionadoPor: currentUser ? currentUser.nombre : '', ...marcaPac()});
  pacientesFullList = pacientesFullList.filter(x=> x.id!==dup.id);
  pacienteRegistry = pacientesFullList.map(x=> x.nombreCompleto);
  return true;
}
document.getElementById('pfUnifOk').onclick = async ()=>{
  if(!pfPaciente || !esFede()) return;
  const nom = mayus(document.getElementById('pfUnifDup').value.trim());
  const dup = pacientesFullList.find(x=> mayus(x.nombreCompleto||'')===nom);
  if(!dup){ alert('Elegí el paciente duplicado de la lista.'); return; }
  if(dup.id===pfPaciente.id){ alert('Es el mismo paciente.'); return; }
  const btn = document.getElementById('pfUnifOk'); btn.disabled = true; btn.textContent = 'Unificando…';
  try{
    if(await unificarPacientes(pfPaciente, dup)){
      alert(`Listo: "${dup.nombreCompleto}" quedó unificado en "${pfPaciente.nombreCompleto}".`);
      abrirFichaPaciente(pfPaciente.id);
    }
  }catch(e){ alert('No se pudo unificar: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Unificar';
};
// "Avisado Google": casilla interna, se guarda apenas se toca
document.getElementById('pfGoogle').addEventListener('change', async e=>{
  if(!pfPaciente) return;
  const v = e.target.checked;
  try{ await db.collection('pacientes').doc(pfPaciente.id).update({avisadoGoogle: v, ...marcaPac()}); pfPaciente.avisadoGoogle = v; }
  catch(err){ e.target.checked = !v; alert('No se pudo guardar: ' + err.message); }
});
// Nombres de pacientes en Movimientos: se pueden tocar para abrir la ficha
document.getElementById('tbody').addEventListener('click', e=>{
  const el = e.target.closest('.pac-link'); if(el) abrirFichaPacientePorNombre(el.dataset.pac);
});

/* =====================================================================
   PANEL "PROVEEDORES / DESTINATARIOS" (admin)
   ===================================================================== */
const overlayProveedores = document.getElementById('overlayProveedores');
const buscarProveedorInput = document.getElementById('buscarProveedorInput');
let mostrarNuevoProveedorPanel = false;

document.getElementById('btnProveedoresPanel').onclick = ()=>{
  buscarProveedorInput.value = "";
  mostrarNuevoProveedorPanel = false;
  renderProveedoresBusqueda();
  overlayProveedores.classList.add('show');
};
document.getElementById('closeProveedores').onclick = ()=> overlayProveedores.classList.remove('show');
document.getElementById('cerrarProveedores').onclick = ()=> overlayProveedores.classList.remove('show');
document.getElementById('btnNuevoProveedor').onclick = ()=>{
  mostrarNuevoProveedorPanel = !mostrarNuevoProveedorPanel;
  renderProveedoresBusqueda();
};
buscarProveedorInput.addEventListener('input', renderProveedoresBusqueda);

function filaProveedorHTML(p, esNueva){
  return `
    <div class="fila-editable" data-id="${p.id||''}">
      <input type="text" class="col pv-nombre" value="${p.nombre||''}" placeholder="Ej: Librería, Agua Ivess…">
      <button class="btn-guardar-fila" onclick="${esNueva ? 'crearProveedorFila(this)' : `guardarProveedorFila('${p.id}', this)`}">${esNueva ? "Crear" : "Guardar"}</button>
      ${esNueva ? "" : `<button class="btn-eliminar-fila" onclick="eliminarProveedorFila('${p.id}', this)" title="Eliminar">✕</button>`}
    </div>
  `;
}

function renderProveedoresBusqueda(){
  const q = normBusqueda(buscarProveedorInput.value.trim());
  const cont = document.getElementById('proveedoresScroll');
  const filtrados = q ? proveedoresFullList.filter(p=> normBusqueda(p.nombre||"").includes(q)) : proveedoresFullList;
  const nuevaFila = mostrarNuevoProveedorPanel ? filaProveedorHTML({}, true) : "";
  if(!filtrados.length && !nuevaFila){ cont.innerHTML = '<div class="empty-state">No encontré proveedores con ese nombre.</div>'; return; }
  cont.innerHTML = nuevaFila + filtrados.map(p=> filaProveedorHTML(p, false)).join('');
}

async function crearProveedorFila(btn){
  const fila = btn.closest('.fila-editable');
  const nombre = fila.querySelector('.pv-nombre').value.trim();
  if(!nombre){ alert("El nombre no puede quedar vacío."); return; }
  btn.disabled = true; btn.textContent = "Creando…";
  try{
    await db.collection('proveedores').add({nombre});
    mostrarNuevoProveedorPanel = false;
  }catch(e){
    alert("No se pudo crear: " + e.message);
    btn.disabled = false; btn.textContent = "Crear";
  }
}
window.crearProveedorFila = crearProveedorFila;

async function guardarProveedorFila(id, btn){
  const fila = btn.closest('.fila-editable');
  const nombre = fila.querySelector('.pv-nombre').value.trim();
  if(!nombre){ alert("El nombre no puede quedar vacío."); return; }
  const txtOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    await db.collection('proveedores').doc(id).update({nombre});
    btn.textContent = "¡Guardado!";
    setTimeout(()=>{ btn.textContent = txtOriginal; btn.disabled = false; }, 1200);
  }catch(e){
    alert("No se pudo guardar: " + e.message);
    btn.disabled = false; btn.textContent = txtOriginal;
  }
}
window.guardarProveedorFila = conPausaRender(guardarProveedorFila);

async function eliminarProveedorFila(id, btn){
  if(!await ummConfirm("¿Eliminar este proveedor/destinatario? Esta acción no se puede deshacer.")) return;
  btn.disabled = true;
  try{
    await db.collection('proveedores').doc(id).delete();
  }catch(e){
    alert("No se pudo eliminar: " + e.message);
    btn.disabled = false;
  }
}
window.eliminarProveedorFila = eliminarProveedorFila;

document.getElementById('btnExportarProveedores').onclick = ()=>{
  const filas = proveedoresFullList.map(p=> ({"Proveedor/Destinatario": p.nombre}));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
  XLSX.writeFile(wb, "proveedores.xlsx");
};

document.getElementById('inpImportarProveedores').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const info = document.getElementById('importarProveedoresInfo');
  info.textContent = "Leyendo archivo…";
  try{
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const existentes = new Set(proveedoresFullList.map(p=>p.nombre));
    let creados = 0, ignorados = 0;
    for(const fila of filas){
      const nombre = mayus((fila["Proveedor/Destinatario"] || fila["Proveedor"] || fila["Nombre"] || "").toString().trim());
      if(!nombre || existentes.has(nombre)){ ignorados++; continue; }
      await db.collection('proveedores').add({nombre});
      existentes.add(nombre);
      creados++;
    }
    info.textContent = `Listo: ${creados} nuevos` + (ignorados ? ` (se ignoraron ${ignorados} filas vacías o repetidas)` : "") + ".";
  }catch(err){
    info.textContent = "Error al importar: " + err.message;
  }
  e.target.value = "";
});

/* =====================================================================
   PANEL "PROFESIONALES / ÁREA" (admin) — ingreso/egreso
   ===================================================================== */
const overlayProfesionalesPanel = document.getElementById('overlayProfesionalesPanel');
const buscarProfesionalInput = document.getElementById('buscarProfesionalInput');
let mostrarNuevoProfesional = false;

document.getElementById('btnProfesionalesPanel').onclick = ()=>{
  buscarProfesionalInput.value = "";
  mostrarNuevoProfesional = false;
  renderProfesionalesBusqueda();
  overlayProfesionalesPanel.classList.add('show');
};
document.getElementById('closeProfesionalesPanel').onclick = ()=> overlayProfesionalesPanel.classList.remove('show');
document.getElementById('cerrarProfesionalesPanel').onclick = ()=> overlayProfesionalesPanel.classList.remove('show');
document.getElementById('btnNuevoProfesional').onclick = ()=>{
  mostrarNuevoProfesional = !mostrarNuevoProfesional;
  renderProfesionalesBusqueda();
};
buscarProfesionalInput.addEventListener('input', renderProfesionalesBusqueda);

// Combina lo que ya está guardado en la colección "profesionales" con cualquier
// nombre que exista en el catálogo de conceptos pero todavía no tenga tipo asignado
// (por ejemplo, recién importado desde el CSV de conceptos).
function listaProfesionalesCombinada(){
  const porNombre = {};
  profesionalesFullList.forEach(p=> porNombre[p.nombre] = {id:p.id, nombre:p.nombre, telefono:p.telefono||''});
  Object.keys(CONCEPTOS).forEach(nombre=>{
    if(!porNombre[nombre]) porNombre[nombre] = {id:null, nombre};
  });
  return Object.values(porNombre).sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'));
}

function filaProfesionalHTML(p, esNueva){
  return `
    <div class="fila-editable" data-nombre="${p.nombre||''}" data-id="${p.id||''}">
      <input type="text" class="col pf-nombre" value="${p.nombre||''}" placeholder="Nombre del profesional/área">
      <input type="tel" class="col-chico pf-telefono" style="flex:0 0 150px;" value="${p.telefono||''}" placeholder="WhatsApp (ej. 11 2345 6789)">
      <button class="btn-guardar-fila" onclick="${esNueva ? 'crearProfesionalFila(this)' : 'guardarProfesionalFila(this)'}">${esNueva ? "Crear" : "Guardar"}</button>
      ${esNueva ? "" : `<button class="btn-eliminar-fila" onclick="eliminarProfesionalFila('${p.id||''}', '${p.nombre}', this)" title="Eliminar">✕</button>`}
    </div>
  `;
}

function renderProfesionalesBusqueda(){
  const q = normBusqueda(buscarProfesionalInput.value.trim());
  const cont = document.getElementById('profesionalesScroll');
  const lista = listaProfesionalesCombinada().filter(p=> !q || normBusqueda(p.nombre).includes(q));
  const nuevaFila = mostrarNuevoProfesional ? filaProfesionalHTML({}, true) : "";
  if(!lista.length && !nuevaFila){ cont.innerHTML = '<div class="empty-state">No encontré profesionales/área con ese nombre.</div>'; return; }
  cont.innerHTML = nuevaFila + lista.map(p=> filaProfesionalHTML(p, false)).join('');
}

async function crearProfesionalFila(btn){
  const fila = btn.closest('.fila-editable');
  const nombre = fila.querySelector('.pf-nombre').value.trim();
  const telefono = fila.querySelector('.pf-telefono').value.trim();
  if(!nombre){ alert("El nombre no puede quedar vacío."); return; }
  btn.disabled = true; btn.textContent = "Creando…";
  try{
    await db.collection('profesionales').add({nombre, telefono});
    mostrarNuevoProfesional = false;
  }catch(e){
    alert("No se pudo crear: " + e.message);
    btn.disabled = false; btn.textContent = "Crear";
  }
}
window.crearProfesionalFila = crearProfesionalFila;

async function guardarProfesionalFila(btn){
  const fila = btn.closest('.fila-editable');
  const id = fila.dataset.id;
  const nombre = fila.querySelector('.pf-nombre').value.trim();
  const telefono = fila.querySelector('.pf-telefono').value.trim();
  if(!nombre){ alert("El nombre no puede quedar vacío."); return; }
  const txtOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    if(id){
      await db.collection('profesionales').doc(id).update({nombre, telefono});
    } else {
      const ref = await db.collection('profesionales').add({nombre, telefono});
      fila.dataset.id = ref.id;
    }
    btn.textContent = "¡Guardado!";
    setTimeout(()=>{ btn.textContent = txtOriginal; btn.disabled = false; }, 1200);
  }catch(e){
    alert("No se pudo guardar: " + e.message);
    btn.disabled = false; btn.textContent = txtOriginal;
  }
}
window.guardarProfesionalFila = conPausaRender(guardarProfesionalFila);

async function eliminarProfesionalFila(id, nombre, btn){
  const cantidadConceptos = (CONCEPTOS[nombre]||[]).length;
  const mensaje = cantidadConceptos
    ? `Este profesional/área tiene ${cantidadConceptos} concepto(s) asignados. Al eliminarlo se van a borrar también esos conceptos. ¿Confirmás?`
    : "¿Eliminar este profesional/área? Esta acción no se puede deshacer.";
  if(!await ummConfirm(mensaje)) return;
  btn.disabled = true;
  try{
    if(id){
      await db.collection('profesionales').doc(id).delete();
    }
    if(cantidadConceptos){
      const snap = await db.collection('conceptos').where('profesional','==', nombre).get();
      const lote = db.batch();
      snap.docs.forEach(d=> lote.delete(d.ref));
      await lote.commit();
    }
  }catch(e){
    alert("No se pudo eliminar: " + e.message);
    btn.disabled = false;
  }
}
window.eliminarProfesionalFila = eliminarProfesionalFila;

document.getElementById('btnExportarProfesionales').onclick = ()=>{
  const filas = listaProfesionalesCombinada().map(p=> ({ "Profesional/Área": p.nombre }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Profesionales");
  XLSX.writeFile(wb, "profesionales-area.xlsx");
};

document.getElementById('inpImportarProfesionales').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const info = document.getElementById('importarProfesionalesInfo');
  info.textContent = "Leyendo archivo…";
  try{
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const existentesPorNombre = {};
    profesionalesFullList.forEach(p=> existentesPorNombre[p.nombre] = p.id);
    let creados = 0, actualizados = 0;
    for(const fila of filas){
      const nombre = mayus((fila["Profesional/Área"] || fila["Profesional/Area"] || fila["Nombre"] || "").toString().trim());
      if(!nombre) continue;
      if(existentesPorNombre[nombre]){
        await db.collection('profesionales').doc(existentesPorNombre[nombre]).update({nombre});
        actualizados++;
      } else {
        await db.collection('profesionales').add({nombre});
        creados++;
      }
    }
    info.textContent = `Listo: ${creados} nuevos, ${actualizados} actualizados.`;
  }catch(err){
    info.textContent = "Error al importar: " + err.message;
  }
  e.target.value = "";
});

/* =====================================================================
   PANEL "CONCEPTOS" (admin) — área, código y concepto (en ese orden)
   ===================================================================== */
const overlayDescuentos = document.getElementById('overlayDescuentos');
function dsFila(d){
  const f = document.createElement('div'); f.className = 'ds-fila';
  f.innerHTML = `<input type="text" class="ds-n" value="${escAttr(d.n||'')}" placeholder="Ej: EFECTIVO"><input type="text" class="ds-p" inputmode="numeric" value="${d.p||''}" placeholder="10"><button type="button" class="btn-quitar" title="Quitar">✕</button>`;
  f.querySelector('.ds-p').addEventListener('input', e=> e.target.value = e.target.value.replace(/\D/g,'').slice(0,2));
  f.querySelector('.btn-quitar').onclick = ()=> f.remove();
  document.getElementById('dsLista').appendChild(f);
}
document.getElementById('btnDescuentosPanel').onclick = ()=>{
  document.getElementById('dsLista').innerHTML = '';
  descuentosLista.forEach(dsFila);
  overlayDescuentos.classList.add('show');
};
document.getElementById('dsAgregar').onclick = ()=>{ dsFila({}); const l = document.querySelectorAll('#dsLista .ds-n'); l[l.length-1].focus(); };
['closeDescuentos','cancelDescuentos'].forEach(id=> document.getElementById(id).onclick = ()=> overlayDescuentos.classList.remove('show'));
document.getElementById('guardarDescuentos').onclick = async ()=>{
  const lista = [...document.querySelectorAll('#dsLista .ds-fila')].map(f=> ({n: mayus(f.querySelector('.ds-n').value.trim()), p: Number(f.querySelector('.ds-p').value)||0}))
    .filter(d=> d.n || d.p);
  if(lista.some(d=> !d.n || !d.p || d.p>=100)){ alert('Cada descuento necesita nombre y un porcentaje entre 1 y 99.'); return; }
  const btn = document.getElementById('guardarDescuentos'); btn.disabled = true;
  try{
    await db.collection('presupuestos').doc('_descuentos').set({lista, actualizadoPor: currentUser.nombre, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()});
    overlayDescuentos.classList.remove('show');
  }catch(e){ alert('No se pudieron guardar los descuentos: ' + e.message); }
  btn.disabled = false;
};
const overlayConceptos = document.getElementById('overlayConceptos');
const buscarConceptoInput = document.getElementById('buscarConceptoInput');
let mostrarNuevoConcepto = false;

document.getElementById('btnConceptosPanel').onclick = ()=>{
  buscarConceptoInput.value = "";
  mostrarNuevoConcepto = false;
  renderConceptosBusqueda();
  overlayConceptos.classList.add('show');
};
document.getElementById('closeConceptos').onclick = ()=> overlayConceptos.classList.remove('show');
document.getElementById('cerrarConceptos').onclick = ()=> overlayConceptos.classList.remove('show');
document.getElementById('btnNuevoConcepto').onclick = ()=>{
  mostrarNuevoConcepto = !mostrarNuevoConcepto;
  renderConceptosBusqueda();
};
buscarConceptoInput.addEventListener('input', renderConceptosBusqueda);

function todosLosConceptos(){
  const lista = [];
  Object.keys(CONCEPTOS).forEach(prof=>{
    CONCEPTOS[prof].forEach(c=> lista.push({id: c.id, profesional: prof, concepto: c.concepto, codigo: c.codigo, tipo: c.tipo||"ingreso", detObligatorio: !!c.detObligatorio, valor: c.valor, valorMoneda: c.valorMoneda||'$'}));
  });
  return lista.sort((a,b)=> a.profesional.localeCompare(b.profesional,'es') || a.concepto.localeCompare(b.concepto,'es',{numeric:true, sensitivity:'base'}));
}

function filaConceptoHTML(c, esNueva){
  const opcionesProf = todosLosNombresDeProfesionales();
  return `
    <div class="fila-editable" data-profesional-original="${c.profesional||''}" data-concepto-original="${c.concepto||''}" data-codigo="${escAttr(c.codigo||'')}">
      <select class="col-chico cc-profesional">
        ${opcionesProf.map(p=>`<option value="${p}" ${p===c.profesional?'selected':''}>${p}</option>`).join('')}
      </select>
      <input type="text" class="col cc-concepto" value="${c.concepto||""}" placeholder="Concepto">
      <select class="col-chico cc-tipo">
        <option value="ingreso" ${c.tipo!=='egreso'?'selected':''}>Ingreso</option>
        <option value="egreso" ${c.tipo==='egreso'?'selected':''}>Egreso</option>
      </select>
      <label class="cc-det-lbl" title="Si está marcado, no se puede guardar un movimiento de este concepto sin detalle"><input type="checkbox" class="cc-det" ${c.detObligatorio?'checked':''}> Det.</label>
      <select class="cc-mon" title="Moneda del valor sugerido"><option value="$" ${c.valorMoneda!=='USD'?'selected':''}>$</option><option value="USD" ${c.valorMoneda==='USD'?'selected':''}>USD</option></select>
      <input type="text" class="cc-valor" inputmode="numeric" value="${c.valor ? Number(c.valor).toLocaleString('es-AR') : ''}" placeholder="Valor" title="Valor sugerido para los movimientos" oninput="formatearInputMonto(this)">
      <button class="btn-guardar-fila" onclick="${esNueva ? 'crearConceptoFila(this)' : 'guardarConceptoFila(this)'}">${esNueva ? "Crear" : "Guardar"}</button>
      ${esNueva ? "" : `<button class="btn-eliminar-fila" onclick="eliminarConceptoFila(this)" title="Eliminar">✕</button>`}
    </div>
  `;
}

function renderConceptosBusqueda(){
  const q = normBusqueda(buscarConceptoInput.value.trim());
  const cont = document.getElementById('conceptosScroll');
  const lista = todosLosConceptos().filter(c=> !q ||
    normBusqueda(c.profesional).includes(q) || normBusqueda(c.concepto).includes(q) || normBusqueda(c.codigo||"").includes(q)
  );
  const nuevaFila = mostrarNuevoConcepto ? filaConceptoHTML({profesional: todosLosNombresDeProfesionales()[0]||""}, true) : "";
  if(!lista.length && !nuevaFila){ cont.innerHTML = '<div class="empty-state">No encontré conceptos con esa búsqueda.</div>'; return; }
  cont.innerHTML = nuevaFila + lista.map(c=> filaConceptoHTML(c, false)).join('');
}

function valorConceptoFila(fila){
  const v = Number(fila.querySelector('.cc-valor').value.replace(/\D/g,'')) || 0;
  return {valor: v || null, valorMoneda: fila.querySelector('.cc-mon').value === 'USD' ? 'USD' : '$'};
}
async function crearConceptoFila(btn){
  const fila = btn.closest('.fila-editable');
  const profesional = fila.querySelector('.cc-profesional').value;
  const concepto = fila.querySelector('.cc-concepto').value.trim();
  const codigo = fila.dataset.codigo || '';   // el código ya no se muestra: se conserva el que tenía
  const tipo = fila.querySelector('.cc-tipo').value;
  const detObligatorio = fila.querySelector('.cc-det').checked;
  if(!profesional){ alert("Elegí un profesional/área (creá uno primero en Profesionales/Áreas si no existe)."); return; }
  if(!concepto){ alert("El concepto no puede quedar vacío."); return; }
  btn.disabled = true; btn.textContent = "Creando…";
  try{
    const vv = valorConceptoFila(fila);
    await db.collection('conceptos').add({profesional, concepto, codigo, tipo, detObligatorio, ...(vv.valor ? vv : {})});
    mostrarNuevoConcepto = false;
  }catch(e){
    alert("No se pudo crear: " + e.message);
    btn.disabled = false; btn.textContent = "Crear";
  }
}
window.crearConceptoFila = crearConceptoFila;

async function guardarConceptoFila(btn){
  const fila = btn.closest('.fila-editable');
  const profOriginal = fila.dataset.profesionalOriginal;
  const conceptoOriginal = fila.dataset.conceptoOriginal;
  const profesional = fila.querySelector('.cc-profesional').value;
  const concepto = fila.querySelector('.cc-concepto').value.trim();
  const codigo = fila.dataset.codigo || '';   // el código ya no se muestra: se conserva el que tenía
  const tipo = fila.querySelector('.cc-tipo').value;
  const detObligatorio = fila.querySelector('.cc-det').checked;
  if(!concepto){ alert("El concepto no puede quedar vacío."); return; }
  const txtOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando…";
  try{
    const snap = await db.collection('conceptos')
      .where('profesional','==', profOriginal)
      .where('concepto','==', conceptoOriginal)
      .limit(1).get();
    if(snap.empty){ throw new Error("No encontré el concepto original en la base."); }
    const vv = valorConceptoFila(fila);
    await snap.docs[0].ref.update({profesional, concepto, codigo, tipo, detObligatorio,
      valor: vv.valor || firebase.firestore.FieldValue.delete(), valorMoneda: vv.valor ? vv.valorMoneda : firebase.firestore.FieldValue.delete()});
    fila.dataset.profesionalOriginal = profesional;
    fila.dataset.conceptoOriginal = concepto;
    btn.textContent = "¡Guardado!";
    setTimeout(()=>{ btn.textContent = txtOriginal; btn.disabled = false; }, 1200);
  }catch(e){
    alert("No se pudo guardar: " + e.message);
    btn.disabled = false; btn.textContent = txtOriginal;
  }
}
window.guardarConceptoFila = conPausaRender(guardarConceptoFila);

async function eliminarConceptoFila(btn){
  const fila = btn.closest('.fila-editable');
  const profOriginal = fila.dataset.profesionalOriginal;
  const conceptoOriginal = fila.dataset.conceptoOriginal;
  if(!await ummConfirm(`¿Eliminar el concepto "${conceptoOriginal}"? Esta acción no se puede deshacer.`)) return;
  btn.disabled = true;
  try{
    const snap = await db.collection('conceptos')
      .where('profesional','==', profOriginal)
      .where('concepto','==', conceptoOriginal)
      .limit(1).get();
    if(snap.empty){ throw new Error("No encontré el concepto en la base."); }
    await snap.docs[0].ref.delete();
  }catch(e){
    alert("No se pudo eliminar: " + e.message);
    btn.disabled = false;
  }
}
window.eliminarConceptoFila = eliminarConceptoFila;

document.getElementById('btnExportarConceptos').onclick = ()=>{
  const filas = todosLosConceptos().map(c=> ({
    "Área": c.profesional,
    "Concepto": c.concepto,
    "Tipo": c.tipo==="egreso" ? "Egreso" : "Ingreso",
    "Valor": c.valor || "",
    "Moneda": c.valor ? (c.valorMoneda || "$") : "",
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conceptos");
  XLSX.writeFile(wb, "conceptos.xlsx");
};

document.getElementById('inpImportarConceptos').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const info = document.getElementById('importarConceptosInfo');
  info.textContent = "Leyendo archivo…";
  try{
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let creados = 0, ignorados = 0, actualizados = 0;
    const existentes = {};
    todosLosConceptos().forEach(c=> existentes[c.profesional + '||' + c.concepto] = c);
    for(const fila of filas){
      const profesional = mayus((fila["Área"] || fila["Area"] || fila["Profesional"] || "").toString().trim());
      const codigo = mayus((fila["Código"] || fila["Codigo"] || "").toString().trim());
      const concepto = mayus((fila["Concepto"] || "").toString().trim());
      const tipoTxt = (fila["Tipo"] || "").toString().trim().toLowerCase();
      const tipo = tipoTxt.startsWith("egr") ? "egreso" : "ingreso";
      if(!profesional || !concepto){ ignorados++; continue; }
      const valor = Number(String(fila["Valor"] ?? "").replace(/[^\d]/g,'')) || 0;
      const valorMoneda = /usd|u\$s|dol/i.test(String(fila["Moneda"] || "")) ? 'USD' : '$';
      const ya = existentes[profesional + '||' + concepto];
      if(ya){
        // ya existe: solo se actualiza su valor (no se duplica ni se tocan los demás datos)
        if(ya.id && valor && (valor !== ya.valor || valorMoneda !== (ya.valorMoneda||'$'))){
          await db.collection('conceptos').doc(ya.id).update({valor, valorMoneda}); actualizados++;
        }
        continue;
      }
      await db.collection('conceptos').add({profesional, concepto, codigo, tipo, ...(valor ? {valor, valorMoneda} : {})});
      existentes[profesional + '||' + concepto] = {profesional, concepto};
      creados++;
    }
    info.textContent = `Listo: ${creados} conceptos agregados, ${actualizados} valores actualizados` + (ignorados ? ` (se ignoraron ${ignorados} filas sin área o concepto)` : "") + `.`;
  }catch(err){
    info.textContent = "Error al importar: " + err.message;
  }
  e.target.value = "";
});

/* ---- Recuperación por compra (desde el 1/10/2026) ----
   Cada unidad de una compra recupera: (Total − Sabrina − Gabriela) de la aplicación donde se usó,
   repartido entre los insumos de esa aplicación según el costo de cada uno. */
function calcularCompras(){
  const sim = simularLotes('9999-12-31');
  const apps = {};
  sueros.forEach(m=>{ if(m.tipo==='ingreso') apps[m.id] = m; });
  const netoApp = id=>{
    const m = apps[id];
    if(!m || m.pagoPendiente || m.total==null) return null;
    const r = calcularRepartoSuero(m);
    return (Number(m.total)||0) - (Number(r.sabrina)||0) - (Number(r.gabriela)||0);
  };
  const compras = {};
  Object.entries(sim.inv).forEach(([k, s])=> s.todos.filter(l=> l.esCompra && l.fechaISO >= STOCK_DESDE).forEach(l=>{
    let rec = 0, fechaRec = null, usadas = 0, pend = 0;
    const aportes = [];
    l.consumos.forEach(c=>{
      usadas += c.cant;
      const n = netoApp(c.appId);
      if(n==null){ pend += c.cant; return; }
      const co = sim.costos[c.appId] || {total:0, unidades:0};
      const peso = co.total > 0 ? (c.costoUnit*c.cant)/co.total : (co.unidades ? c.cant/co.unidades : 0);
      rec += n * peso;
      aportes.push({fecha: apps[c.appId].fechaISO, monto: n*peso});
      if(fechaRec==null && l.inversion > 0 && rec >= l.inversion - 0.5) fechaRec = apps[c.appId].fechaISO;
    });
    const c = compras[l.compraId] = compras[l.compraId] || {id:l.compraId, fechaISO:l.fechaISO, proveedor:l.proveedor, items:[]};
    const ya = c.items.find(i=> i.insumo===k);
    if(ya){
      ya.cant += l.cantOriginal; ya.sinCargo += l.sinCargo||0; ya.inversion += l.inversion; ya.usadas += usadas; ya.rec += rec; ya.pend += pend;
      ya.aportes = ya.aportes.concat(aportes);
      ya.fechaRec = null; let acc = 0;
      ya.aportes.slice().sort((a,b)=> a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0)).some(a=>{ acc += a.monto; if(ya.inversion > 0 && acc >= ya.inversion - 0.5){ ya.fechaRec = a.fecha; return true; } return false; });
    }
    else c.items.push({insumo:k, cant:l.cantOriginal, sinCargo:l.sinCargo||0, inversion:l.inversion, usadas, rec, pend, fechaRec, aportes});
  }));
  return Object.values(compras).map(c=>{
    c.items.sort((a,b)=> a.insumo.localeCompare(b.insumo,'es'));
    c.inversion = c.items.reduce((a,i)=> a+i.inversion, 0);
    c.rec = c.items.reduce((a,i)=> a+i.rec, 0);
    c.cant = c.items.reduce((a,i)=> a+i.cant, 0);
    c.usadas = c.items.reduce((a,i)=> a+i.usadas, 0);
    c.pend = c.items.reduce((a,i)=> a+i.pend, 0);
    // fecha en que la compra completa llegó al 100% (sumando lo que aportó cada insumo, en orden de fecha)
    c.fechaRec = null;
    let acum = 0;
    c.items.flatMap(i=> i.aportes||[]).sort((a,b)=> a.fecha < b.fecha ? -1 : (a.fecha > b.fecha ? 1 : 0)).some(a=>{
      acum += a.monto;
      if(c.inversion > 0 && acum >= c.inversion - 0.5){ c.fechaRec = a.fecha; return true; }
      return false;
    });
    c.etiqueta = `${fechaLarga(c.fechaISO)} · ${c.proveedor || 'SIN PROVEEDOR'} · ${fmtPesos(c.inversion)}`;
    return c;
  }).sort((a,b)=> a.fechaISO < b.fechaISO ? 1 : -1);
}
function etiquetasCompras(){
  const vistas = {};
  return calcularCompras().map(c=>{
    vistas[c.etiqueta] = (vistas[c.etiqueta]||0) + 1;
    if(vistas[c.etiqueta] > 1) c.etiqueta += ` (${vistas[c.etiqueta]})`;
    return c;
  });
}
// Escala fija para todas las barras (vista general y detalle): la línea del 100% siempre en el medio, barra llena = 200% o más
const REC_ESCALA = 200;
function barraRec(pct, escala){
  const p = Math.max(0, pct);
  const cel = Math.min(p, 100) / escala * 100;
  const ver = p > 100 ? Math.min(p - 100, escala - 100) / escala * 100 : 0;   // pasado el tope, la barra queda llena (el % se lee en el número)
  const meta = 100 / escala * 100;
  return `<div class="rec-barra"><div class="cel" style="width:${cel}%"></div>${ver ? `<div class="ver" style="left:${meta}%;width:${ver}%"></div>` : ''}<div class="meta" style="left:${meta}%"></div><span class="txt">${Math.round(p)}%</span></div>`;
}
function htmlRecupero(selEtiqueta, desde, hasta, rangoTxt){
  const todas = etiquetasCompras();
  const guion = '<span class="pend">—</span>';
  const explica = `<div class="sub">Recuperado = lo que deja cada aplicación (total − Sabrina − Gabriela), repartido entre sus insumos según el costo de cada uno. Primero se usa el stock inicial del 1/10 y después cada compra, en orden de fecha. Las aplicaciones con FALTA cuentan como usadas pero suman cuando se carga el pago.</div>`;
  const leyenda = `<div class="rec-leyenda"><span><i style="background:var(--rec-celeste)"></i>Recuperando la inversión (hasta 100%)</span><span><i style="background:var(--rec-verde)"></i>Ganancia (más del 100%)</span><span>La línea marca el 100%</span></div>`;
  const c = selEtiqueta ? todas.find(x=> mayus(x.etiqueta)===mayus(selEtiqueta)) : null;
  if(c){
    const pctTot = c.inversion ? c.rec/c.inversion*100 : 0;
    const escala = REC_ESCALA;
    return `<h3>Compra del ${fechaLarga(c.fechaISO)} · ${c.proveedor||''}</h3>${c.ejemplo ? '<div class="rec-aviso-ej">Compra de ejemplo: no está cargada, no descuenta stock ni aparece en movimientos. Toma todas las aplicaciones desde el 24/8 y descuenta directamente de esta compra.</div>' : ''}${explica}
      <div class="s-kpis rec-kpis">
        <div class="s-kpi principal"><div class="lbl">Inversión</div><div class="val">${fmtPesos(c.inversion)}</div></div>
        <div class="s-kpi"><div class="lbl">Recuperado</div><div class="val">${fmtPesos(c.rec)}</div></div>
        <div class="s-kpi"><div class="lbl">Usadas</div><div class="val">${c.usadas.toLocaleString('es-AR')} / ${c.cant.toLocaleString('es-AR')}</div></div>
        <div class="s-kpi"><div class="lbl">${c.rec >= c.inversion ? 'Ganancia' : 'Falta recuperar'}</div><div class="val" style="color:${c.rec >= c.inversion ? '#2f7a2f' : '#a13a3a'}">${fmtPesos(Math.abs(c.rec - c.inversion))}</div></div>
      </div>
      <div class="rec-general"><div class="lbl"><span>Recuperación de la compra</span><span>${c.pend ? `${c.pend} u. con FALTA` : ''}</span></div>${barraRec(pctTot, escala)}</div>
      <div class="inf-wrap"><table class="inf-tabla">
        <colgroup><col><col style="width:84px"><col style="width:96px"><col style="width:104px"><col style="width:104px"><col style="width:220px"><col style="width:100px"></colgroup>
        <thead><tr><th class="left">Insumo</th><th>Compradas</th><th>Usadas</th><th>Inversión</th><th>Recuperado</th><th>Recuperación</th><th>Recuperado el</th></tr></thead>
        <tbody>${c.items.map(i=> `<tr>
          <td class="left">${i.insumo}${i.original && claveInsumo(i.original)!==claveInsumo(i.insumo) ? ` <span class="pend">(factura: ${i.original})</span>` : ''}${i.noEncontrado ? ' <span class="venc-chip vencido">no está en el sistema</span>' : ''}</td><td>${i.cant.toLocaleString('es-AR')}${i.sinCargo ? ` <span class="pend" title="Incluye unidades sin cargo">(${i.sinCargo} s/c)</span>` : ''}</td>
          <td>${i.usadas.toLocaleString('es-AR')}${i.pend ? ` <span class="pend">(${i.pend} FALTA)</span>` : ''}</td>
          <td class="monto">${fmtPesos(i.inversion)}</td><td class="monto">${fmtPesos(i.rec)}</td>
          <td>${barraRec(i.inversion ? i.rec/i.inversion*100 : 0, escala)}</td>
          <td>${i.fechaRec ? fechaLarga(i.fechaRec) : guion}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="left">TOTALES</td><td>${c.cant.toLocaleString('es-AR')}</td><td>${c.usadas.toLocaleString('es-AR')}</td><td class="monto">${fmtPesos(c.inversion)}</td><td class="monto">${fmtPesos(c.rec)}</td><td>${barraRec(pctTot, escala)}</td><td>${c.fechaRec ? fechaLarga(c.fechaRec) : ''}</td></tr></tfoot>
      </table></div>${leyenda}`;
  }
  const lista = todas.filter(x=> x.fechaISO>=desde && x.fechaISO<=hasta);
  const escala = REC_ESCALA;
  return `<h3>Recuperación de compras</h3>
    <div class="sub">Compras ${rangoTxt} (se analizan desde el 1/10/2026). Tocá una compra para ver el detalle por insumo.</div>
    <div class="inf-wrap"><table class="inf-tabla">
      <colgroup><col style="width:96px"><col><col style="width:110px"><col style="width:96px"><col style="width:110px"><col style="width:220px"><col style="width:100px"></colgroup>
      <thead><tr><th>Compra</th><th class="left">Proveedor</th><th>Inversión</th><th>Usadas</th><th>Recuperado</th><th>Recuperación</th><th>Recuperado el</th></tr></thead>
      <tbody>${lista.length ? lista.map(x=> `<tr class="rec-fila ${x.ejemplo ? 'rec-ejemplo' : ''}" data-etq="${escAttr(x.etiqueta)}">
        <td>${fechaLarga(x.fechaISO)}</td><td class="left">${x.proveedor||''}</td><td class="monto">${fmtPesos(x.inversion)}</td>
        <td>${x.usadas.toLocaleString('es-AR')} / ${x.cant.toLocaleString('es-AR')}</td><td class="monto">${fmtPesos(x.rec)}</td>
        <td>${barraRec(x.inversion ? x.rec/x.inversion*100 : 0, escala)}</td><td>${x.fechaRec ? fechaLarga(x.fechaRec) : guion}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty-state">No hay compras desde el 1/10/2026 en estas fechas.</td></tr>'}</tbody>
    </table></div>${lista.length ? leyenda : ''}`;
}
document.getElementById('sResumen').addEventListener('click', e=>{
  const tr = e.target.closest('.rec-fila');
  if(!tr || sInfTipo!=='recupero') return;
  infSel.value = tr.dataset.etq;
  renderResumenSueros();
});

/* ---- Stock inicial al 1/10/2026 (reemplaza toda la historia anterior) ---- */
const overlaySIni = document.getElementById('overlaySIni');
document.getElementById('sBtnStockIni').onclick = ()=>{
  if(!esAdminSueros()) return;
  const guardado = (suerosStockInicial && suerosStockInicial.items) || null;
  // Sugerencia: lo que calculaba el sistema al 30/9 (sin stock inicial) y el último precio
  const base = {};
  const prev = suerosStockInicial; suerosStockInicial = null; cacheSim = {ref:null, len:-1, map:new Map()};
  calcularStock(STOCK_DESDE).forEach(i=> base[i.insumo] = i);
  const nombres = insumosStock().map(i=> i.insumo);
  suerosStockInicial = prev; cacheSim = {ref:null, len:-1, map:new Map()};
  const fijos = {};
  componentesVias().forEach(c=>{
    const k = claveInsumo(c);
    if(k.startsWith('solfisiolog') || k.startsWith('solucionfisiolog')) fijos[c] = 4000;
    if(k.startsWith('otros')) fijos[c] = 800;
  });
  const filas = nombres.filter(n=> !esVias(n)).map(n=>{
    const g = guardado && guardado[n];
    const b = base[n] || {cant:0, ultimo:0};
    const cant = g ? g.cant : Math.max(0, Math.round(b.cant||0));
    const vu = g ? g.valorUnit : (fijos[n] || b.ultimo || b.valorUnit || 0);
    return `<div class="sini-fila" data-texto="${escAttr(n)}">
      <span class="nom">${n}</span>
      <input type="text" inputmode="numeric" class="sini-cant" data-k="${escAttr(n)}" value="${cant ? Number(cant).toLocaleString('es-AR') : (g ? '0' : '')}" placeholder="0">
      <input type="text" inputmode="numeric" class="sini-vu" data-k="${escAttr(n)}" value="${vu ? Number(vu).toLocaleString('es-AR') : ''}" placeholder="$0">
    </div>`;
  }).join('');
  document.getElementById('siniLista').innerHTML = filas || '<div class="empty-state">No hay insumos.</div>';
  document.getElementById('siniLista').querySelectorAll('input').forEach(inp=> inp.addEventListener('input', ()=> formatearInputMonto(inp)));
  document.getElementById('siniBuscar').value = '';
  document.getElementById('siniEstado').textContent = guardado
    ? `Guardado${suerosStockInicial.actualizadoPor ? ' por ' + suerosStockInicial.actualizadoPor : ''}. Podés corregirlo cuando quieras.`
    : 'Viene precargado con lo que calculaba el sistema al 30/9. Corregí lo que no coincida con el conteo real.';
  overlaySIni.classList.add('show');
};
document.getElementById('siniBuscar').addEventListener('input', e=>{
  const q = e.target.value;
  document.querySelectorAll('#siniLista .sini-fila').forEach(f=> f.style.display = !q || contiene(f.dataset.texto, q) ? '' : 'none');
});
const cerrarSIni = ()=> overlaySIni.classList.remove('show');
document.getElementById('closeSIni').onclick = cerrarSIni;
document.getElementById('siniCancelar').onclick = cerrarSIni;
document.getElementById('siniGuardar').onclick = async ()=>{
  if(!esAdminSueros()) return;
  const items = {};
  document.querySelectorAll('#siniLista .sini-fila').forEach(f=>{
    const k = f.querySelector('.sini-cant').dataset.k;
    const cant = parseMonto(f.querySelector('.sini-cant').value);
    const valorUnit = parseMonto(f.querySelector('.sini-vu').value);
    items[k] = {cant, valorUnit};
  });
  const btn = document.getElementById('siniGuardar'); btn.disabled = true;
  try{
    const datos = {fecha: STOCK_DESDE, items, actualizadoPor: currentUser.nombre, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()};
    await db.collection('sueros').doc('_stockInicial').set(datos);
    suerosStockInicial = {...datos};
    cacheSim = {ref:null, len:-1, map:new Map()};
    cerrarSIni();
    renderSueros();
  }catch(e){ alert("No se pudo guardar: " + e.message); }
  btn.disabled = false;
};

/* ---- Vista previa en PDF (informes y fichas) ---- */
let html2pdfCargando = null;
function cargarHtml2pdf(){
  if(window.html2pdf) return Promise.resolve();
  if(!html2pdfCargando) html2pdfCargando = new Promise((ok, mal)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = ok;
    s.onerror = ()=>{ html2pdfCargando = null; mal(new Error('No se pudo cargar el generador de PDF.')); };
    document.head.appendChild(s);
  });
  return html2pdfCargando;
}
const overlayPDF = document.getElementById('overlayPDF');
// En el celular la hoja (760px) se achica para verse entera; al descargar se genera siempre en tamaño real
function escalarHojaPDF(){
  const hoja = document.getElementById('pdfHoja'), env = document.getElementById('pdfEscala'), fondo = env.parentElement;
  hoja.style.transform = ''; env.style.width = ''; env.style.height = '';
  const disp = fondo.clientWidth - 24;
  const k = Math.min(1, disp / 760);
  if(k < 1){
    hoja.style.transformOrigin = 'top left'; hoja.style.transform = `scale(${k})`;
    env.style.width = (760*k) + 'px'; env.style.height = (hoja.offsetHeight*k) + 'px';
  }
}
window.addEventListener('resize', ()=>{ if(overlayPDF.classList.contains('show')) escalarHojaPDF(); });
let pdfArchivo = 'informe';
function abrirVistaPDF(titulo, html, archivo, opts){
  opts = opts || {};
  pdfArchivo = (archivo || titulo || 'informe').replace(/[\\/:*?"<>|]+/g,'-').trim();
  const hoy = new Date();
  document.getElementById('pdfHoja').className = 'pdf-hoja' + (opts.clase ? ' ' + opts.clase : '');
  document.getElementById('pdfHoja').innerHTML = `
    <div class="pdf-head">
      <img src="images/logo.png" alt="Ummana">
      <div class="pdf-head-txt"><div class="pdf-titulo">${titulo}</div>${opts.sinFecha ? '' : `<div class="pdf-fecha">Generado el ${hoy.toLocaleDateString('es-AR')} ${hoy.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</div>`}</div>
      ${opts.derecha ? `<div class="pdf-head-der">${opts.derecha}</div>` : ''}
    </div>
    <div class="pdf-cuerpo">${html}</div>`;
  overlayPDF.classList.add('show');
  overlayPDF.scrollTop = 0;
  escalarHojaPDF();
  cargarHtml2pdf().catch(()=>{});   // se va cargando mientras mira la vista previa
}
document.getElementById('pdfCerrar').onclick = ()=> overlayPDF.classList.remove('show');
document.getElementById('closePDF').onclick = ()=> overlayPDF.classList.remove('show');
document.getElementById('pdfDescargar').onclick = async ()=>{
  const btn = document.getElementById('pdfDescargar');
  btn.disabled = true; btn.textContent = 'Generando…';
  try{
    await cargarHtml2pdf();
    const hojaPdf = document.getElementById('pdfHoja'); const escPrev = hojaPdf.style.transform; hojaPdf.style.transform = '';
    await window.html2pdf().set({
      margin: [8, 8, 10, 8],
      filename: pdfArchivo + '.pdf',
      image: {type:'jpeg', quality:0.97},
      html2canvas: {scale:2, backgroundColor:'#ffffff', useCORS:true},
      jsPDF: {unit:'mm', format:'a4', orientation:'portrait'},
      pagebreak: {mode:['css','legacy'], avoid:['tr','.hc-ev','.s-kpi','.pdf-campo','.bal-cierre']},
    }).from(document.getElementById('pdfHoja')).save();
    escalarHojaPDF();
  }catch(e){ alert(e.message || 'No se pudo generar el PDF.'); }
  btn.disabled = false; btn.innerHTML = ico('descargar') + ' Descargar PDF';
};
// Informes de sueros: copia de lo que se ve
document.getElementById('infPDF').onclick = ()=>{
  const cont = document.getElementById('sResumen');
  const h3 = cont.querySelector('h3');
  if(!h3){ alert('Elegí primero qué informe querés ver.'); return; }
  const titulo = 'Sueroterapia · ' + h3.textContent;
  abrirVistaPDF(titulo, `<div class="s-resumen pdf-resumen">${cont.innerHTML}</div>`, titulo);
};
// Informes de la caja
document.getElementById('btnPDFInforme').onclick = ()=>{
  const kpis = document.getElementById('kpiRow');
  if(!kpis.querySelector('.kpi')){ alert('Generá primero el informe.'); return; }
  const d = document.getElementById('informeFechaDesde').value, h = document.getElementById('informeFechaHasta').value;
  const prof = informeProfesional.value.trim() || 'Todos';
  const rango = d===h ? `del ${fechaLarga(d)}` : `del ${fechaLarga(d)} al ${fechaLarga(h)}`;
  abrirVistaPDF(`Caja diaria · Informe ${rango}`, `<div class="pdf-sub">Profesional / Área: ${prof}</div><div class="kpi-row">${kpis.innerHTML}</div>`, `Informe caja ${d} a ${h}`);
};
// Ficha de sueros (historia clínica) con el historial
document.getElementById('hcPDF').onclick = ()=>{
  if(!hcPaciente) return;
  const val = sel => { const el = document.querySelector(sel); return el ? (el.value||'').trim() : ''; };
  const txt = v => v ? String(v).replace(/</g,'&lt;') : '<span class="pend">—</span>';
  const campo = (lbl, v, cls='') => `<div class="pdf-campo ${cls}"><label>${lbl}</label><div class="pdf-txt">${txt(v)}</div></div>`;
  const fnac = val('#hcFnac');
  const plan = [val('[data-hc="planTipo"]'), val('[data-hc="sesiones"]') ? `${val('[data-hc="sesiones"]')} sesiones recomendadas` : ''].filter(Boolean).join(' · ');
  const hist = document.getElementById('hcHistorial').cloneNode(true);
  hist.querySelectorAll('.quitar').forEach(b=> b.remove());
  const html = `
    <div class="hc-ficha pdf-ficha">
      <div class="hc-banda">RESUMEN DE HISTORIA CLÍNICA + ORDEN DE SUEROTERAPIA<small>(completa profesional derivante)</small></div>
      <div class="hc-cuerpo">
        <div class="pdf-fila4">
          ${campo('Paciente', hcPaciente.nombreCompleto, 'ancho2')}
          ${campo('Fecha de nacimiento', fnac ? fechaLarga(fnac) : '')}
          ${campo('Edad', document.getElementById('hcEdad').textContent.replace('—',''))}
          ${campo('Inicio historia clínica', val('#hcInicio') ? fechaLarga(val('#hcInicio')) : '')}
        </div>
        <div class="pdf-fila2">
          ${campo('Antecedentes personales relevantes', val('[data-hc="antPersonales"]'))}
          ${campo('Antecedentes familiares (si aportan)', val('[data-hc="antFamiliares"]'))}
          ${campo('Medicaciones actuales', val('[data-hc="medicaciones"]'))}
          ${campo('Suplementos actuales', val('[data-hc="suplementos"]'))}
          ${campo('Motivo de derivación / objetivo terapéutico', val('[data-hc="motivo"]'))}
          ${campo('Plan propuesto por derivante', val('[data-hc="plan"]'))}
          ${campo('Profesional derivante', val('#hcDerivante'))}
          ${campo('Plan', plan)}
        </div>
      </div>
    </div>
    <div class="hc-hist-titulo">Historial</div>
    ${hist.innerHTML}`;
  abrirVistaPDF(`Ficha de sueroterapia · ${hcPaciente.nombreCompleto}`, html, `Ficha ${hcPaciente.nombreCompleto}`);
};

/* ---- Nuevo paciente (Gabriela con "sueros-informes", Sabrina y Fede) ---- */
function puedeCrearPacientes(){ return suerosLimitado() || esFede() || primerNombre()==='SABRINA'; }
// Fede: fichas de pacientes desde la vista de sueros
document.getElementById('sBtnPacientes').onclick = ()=>{
  if(!esAdminSueros()) return;
  if(!unsubFichasSueros){
    unsubFichasSueros = db.collection('historiasSueros').onSnapshot(snap=>{
      fichasSuerosIds = new Set(snap.docs.map(d=> d.id));
    }, ()=>{});
  }
  document.getElementById('pBtnNuevoPac').classList.toggle('col-hidden', !puedeCrearPacientes());
  document.getElementById('pNuevoPacCard').classList.add('col-hidden');
  document.getElementById('pBuscarPac').value = '';
  pacVista('lista');
  overlayPPac.classList.add('show');
  document.getElementById('pBuscarPac').focus();
};
const npApellido = document.getElementById('pNpApellido');
attachAutocomplete(npApellido, ()=> pacientesFullList.map(p=> p.nombreCompleto).filter(Boolean).sort((a,b)=> a.localeCompare(b,'es')), (valor)=>{
  const p = pacientesFullList.find(x=> x.nombreCompleto===valor);
  if(!p) return;
  document.getElementById('pNuevoPacCard').classList.add('col-hidden');
  abrirFichaHC(p.id);
});
document.getElementById('pBtnNuevoPac').onclick = ()=>{
  if(!puedeCrearPacientes()) return;
  const card = document.getElementById('pNuevoPacCard');
  card.classList.toggle('col-hidden');
  ['pNpApellido','pNpNombre','pNpFnac'].forEach(id=> document.getElementById(id).value = '');
  if(!card.classList.contains('col-hidden')) npApellido.focus();
};
document.getElementById('pNpCancelar').onclick = ()=> document.getElementById('pNuevoPacCard').classList.add('col-hidden');
document.getElementById('pNpGuardar').onclick = async ()=>{
  if(!puedeCrearPacientes()) return;
  const ape = mayus(npApellido.value.trim().replace(/,.*$/,''));
  const nom = mayus(document.getElementById('pNpNombre').value.trim());
  const fnac = document.getElementById('pNpFnac').value || '';
  if(!ape || !nom){ alert("Completá apellido y nombre."); return; }
  const nombreCompleto = `${ape}, ${nom}`;
  const existente = pacientesFullList.find(p=> mayus(p.nombreCompleto||'')===nombreCompleto);
  if(existente){ alert("Ese paciente ya existe. Se abre su ficha."); document.getElementById('pNuevoPacCard').classList.add('col-hidden'); abrirFichaHC(existente.id); return; }
  const btn = document.getElementById('pNpGuardar'); btn.disabled = true;
  try{
    const datos = { apellido: ape, nombre: nom, nombreCompleto, creadoEn: firebase.firestore.FieldValue.serverTimestamp(), ...marcaPac() };
    if(fnac) datos.fnac = fnac;
    const ref = await db.collection('pacientes').add(datos);
    document.getElementById('pNuevoPacCard').classList.add('col-hidden');
    if(!pacientesFullList.some(p=> p.id===ref.id)) pacientesFullList.push({id: ref.id, apellido: ape, nombre: nom, nombreCompleto, fnac});
    pacienteRegistry = pacientesFullList.map(p=> p.nombreCompleto);
    abrirFichaHC(ref.id);
  }catch(e){ alert("No se pudo crear el paciente: " + e.message); }
  btn.disabled = false;
};


/* ---- Movimientos de un insumo desde el 1/10 (para controlar el stock) ---- */
const overlayKardex = document.getElementById('overlayKardex');
function abrirKardex(insumo){
  const ini = suerosStockInicial && suerosStockInicial.items && Object.keys(suerosStockInicial.items).length ? suerosStockInicial : null;
  const desde = ini ? (ini.fecha || STOCK_DESDE) : STOCK_DESDE;
  const filas = [];
  let saldo;
  if(ini){
    saldo = Number((ini.items[insumo]||{}).cant)||0;
    filas.push({fecha:desde, tipo:'Stock inicial', det:'Conteo cargado', entra:saldo, sale:0, saldo});
  } else {
    const prev = calcularStock(desde).find(x=> x.insumo===insumo);
    saldo = prev ? prev.cant : 0;
    filas.push({fecha:desde, tipo:'Saldo anterior', det:'Calculado (no hay stock inicial cargado)', entra:0, sale:0, saldo});
  }
  sueros.filter(m=> m.fechaISO >= desde).forEach(m=>{
    if(m.tipo==='egreso' || m.tipo==='ajuste'){
      (m.items||[]).forEach(it=>{
        if(it.insumo!==insumo) return;
        const sc = m.tipo==='egreso' ? (Number(it.sinCargo)||0) : 0;
        const n = (Number(it.cant)||0) + sc;
        if(ini && ajusteSuperado(m)){
          filas.push({fecha:m.fechaISO, tipo:'Ajuste anterior al stock inicial', det:'No se cuenta: el conteo del 1/10 ya lo reemplaza', entra:0, sale:0, saldo, viejo:true, n});
          return;
        }
        saldo += n;
        filas.push({fecha:m.fechaISO, tipo: m.tipo==='egreso' ? 'Compra' : 'Ajuste (editar insumo)', det: m.tipo==='egreso' ? (m.tercero||'') + (sc ? ` (incluye ${sc} sin cargo)` : '') : (m.detalle||''), entra: n>0?n:0, sale: n<0?-n:0, saldo, id:m.id});
      });
    } else if(m.tipo==='ingreso'){
      let cant = 0, viaKit = 0;
      (m.items||[]).forEach(it=>{
        expandirKit([it], m.fechaISO).forEach(c=>{ if(c.insumo===insumo){ cant += c.cant; if(esVias(it.insumo) && !esVias(insumo)) viaKit += c.cant; } });
      });
      if(!cant) return;
      saldo -= cant;
      filas.push({fecha:m.fechaISO, tipo:'Aplicación', det:(m.tercero||'') + (viaKit ? ` (${viaKit} por VIAS Y OTROS INSUMOS)` : ''), entra:0, sale:cant, saldo});
    }
  });
  const fila = calcularStock('9999-12-31').find(x=> x.insumo===insumo);
  const tE = filas.slice(1).reduce((a,f)=> a+f.entra, 0), tS = filas.reduce((a,f)=> a+f.sale, 0);
  document.getElementById('kardexTitulo').textContent = insumo;
  document.getElementById('kardexBody').innerHTML = filas.map(f=> `<tr class="${f.viejo ? 'k-viejo' : (f.tipo.startsWith('Ajuste') ? 'k-ajuste' : '')}">
    <td>${fechaLarga(f.fecha)}</td><td class="left">${f.tipo}</td><td class="left">${f.det}</td>
    <td>${f.viejo ? (f.n>0 ? `<s>+${f.n}</s>` : '') : (f.entra ? '+' + f.entra.toLocaleString('es-AR') : '')}</td><td>${f.viejo ? (f.n<0 ? `<s>−${-f.n}</s>` : '') : (f.sale ? '−' + f.sale.toLocaleString('es-AR') : '')}</td>
    <td><b>${f.saldo.toLocaleString('es-AR')}</b></td></tr>`).join('');
  document.getElementById('kardexFoot').innerHTML = `<tr><td colspan="3" class="left">Stock actual</td><td>${tE ? '+' + tE.toLocaleString('es-AR') : ''}</td><td>${tS ? '−' + tS.toLocaleString('es-AR') : ''}</td><td><b>${(fila ? fila.cant : saldo).toLocaleString('es-AR')}</b></td></tr>`;
  const hayAjustes = filas.some(f=> f.tipo==='Ajuste (editar insumo)');
  document.getElementById('kardexAviso').classList.toggle('col-hidden', !hayAjustes);
  overlayKardex.classList.add('show');
}
document.getElementById('closeKardex').onclick = ()=> overlayKardex.classList.remove('show');
document.getElementById('kardexCerrar').onclick = ()=> overlayKardex.classList.remove('show');
document.getElementById('sStockBody').addEventListener('click', e=>{
  const td = e.target.closest('.k-link');
  if(td) abrirKardex(td.dataset.k);
});


document.getElementById('infVolver').onclick = ()=>{ infSel.value = ''; renderResumenSueros(); };

['sDescValor','sDescTipo'].forEach(id=> document.getElementById(id).addEventListener(id==='sDescTipo' ? 'change' : 'input', ()=> sRecalcular()));


