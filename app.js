// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const supabaseUrl = 'https://rdoecgupwqhzrxfbrbrf.supabase.co';
const supabaseKey = 'sb_publishable_UNxJedkIOD45NhRU1C2ZNA_9ehyLc5C';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const navAdmin = document.getElementById('nav-admin');
const userGreeting = document.getElementById('user-greeting');

const panels = {
    dashboard: document.getElementById('panel-dashboard'),
    pos: document.getElementById('panel-pos'),
    inventario: document.getElementById('panel-inventario'),
    deudores: document.getElementById('panel-deudores'),
    pastor: document.getElementById('panel-pastor')
};

let currentUser = null;
let currentRole = null;
let deudorActualId = null;
let deudorActualNombre = null;
let deudorActualDeuda = null;

// ==========================================
// 2. AUTENTICACIÓN Y ROLES
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) await cargarApp(session.user);
    else { loginScreen.style.display = 'block'; appScreen.style.display = 'none'; }
});

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('Ingresa correo y contraseña');
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await cargarApp(data.user);
    } catch (error) { alert('Error: ' + error.message); }
};

document.getElementById('btn-logout').onclick = async () => {
    await db.auth.signOut();
    location.reload();
};

async function cargarApp(user) {
    currentUser = user;
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    userGreeting.innerText = `Hola, ${user.email.split('@')[0]}`;

    try {
        const { data, error } = await db.from('roles').select('rol').eq('user_id', user.id).single();
        if (error) throw error;
        currentRole = data.rol;
        configurarVistasPorRol();
    } catch (error) { alert('Error de permisos.'); }
}

function configurarVistasPorRol() {
    Object.values(panels).forEach(p => p.style.display = 'none');
    navAdmin.style.display = 'none';

    if (currentRole === 'ADMIN') {
        navAdmin.style.display = 'flex'; 
        mostrarPanel('dashboard');             
        cargarTodo();
    } 
    else if (currentRole === 'PASTOR') {
        mostrarPanel('dashboard'); // Pastor también ve Dashboard y su panel
        navAdmin.style.display = 'flex'; // Le mostramos menú simplificado
        navAdmin.innerHTML = `
            <button onclick="mostrarPanel('dashboard')" class="btn-sec">Dashboard</button>
            <button onclick="mostrarPanel('pastor')" class="btn-sec">Fondo Pastor</button>
        `;
        cargarTodo();
    } 
    else if (currentRole === 'COBRADOR') {
        mostrarPanel('deudores');        
        cargarDeudores(); 
    }
}

window.mostrarPanel = function(panelId) {
    Object.values(panels).forEach(p => p.style.display = 'none');
    if (panels[panelId]) panels[panelId].style.display = 'block';
};

function cargarTodo() {
    cargarDashboard();
    cargarInventario();
    cargarPOS();
    cargarDeudores();
    cargarPastor();
}

// ==========================================
// 3. UTILIDADES (MODALES)
// ==========================================
window.abrirModal = id => document.getElementById(id).style.display = 'flex';
window.cerrarModal = id => {
    document.getElementById(id).style.display = 'none';
    const inputs = document.getElementById(id).querySelectorAll('input');
    inputs.forEach(input => input.value = ''); // Limpiar campos
};

// ==========================================
// 4. DASHBOARD (CAJA, CAPITAL Y EGRESOS)
// ==========================================
async function cargarDashboard() {
    try {
        // Cargar Caja
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const banco = parseFloat(caja.banco) || 0;
        const usdt = parseFloat(caja.usdt) || 0;
        const efectivo = parseFloat(caja.efectivo) || 0;
        const totalCaja = banco + usdt + efectivo;

        document.getElementById('dash-banco').innerText = banco.toFixed(2);
        document.getElementById('dash-usdt').innerText = usdt.toFixed(2);
        document.getElementById('dash-efectivo').innerText = efectivo.toFixed(2);
        document.getElementById('dash-caja').innerText = totalCaja.toFixed(2);

        // Cargar Deudores
        const { data: deudores } = await db.from('deudores').select('deuda_acumulada');
        let totalCalle = 0;
        if(deudores) deudores.forEach(d => totalCalle += parseFloat(d.deuda_acumulada));
        document.getElementById('dash-calle').innerText = totalCalle.toFixed(2);

        // Capital Total
        document.getElementById('dash-capital').innerText = (totalCaja + totalCalle).toFixed(2);
    } catch (e) { console.error('Error cargando dashboard', e); }
}

window.abrirModalEgreso = () => abrirModal('modal-egreso');

window.procesarEgreso = async () => {
    const concepto = document.getElementById('egreso-concepto').value.trim();
    const monto = parseFloat(document.getElementById('egreso-monto').value);
    const bolsillo = document.getElementById('egreso-bolsillo').value; // BANCO, EFECTIVO, USDT

    if (!concepto || isNaN(monto) || monto <= 0) return alert('Datos inválidos');

    try {
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const saldoBolsillo = parseFloat(caja[bolsillo.toLowerCase()]);
        
        if (monto > saldoBolsillo) return alert(`No hay suficiente dinero en ${bolsillo}`);

        // Restar de la caja
        await db.from('caja_principal').update({ [bolsillo.toLowerCase()]: saldoBolsillo - monto }).eq('id', 1);
        
        // Registrar movimiento
        await db.from('movimientos_caja').insert([{
            tipo: 'EGRESO', monto, bolsillo, concepto, usuario: currentUser.email
        }]);

        alert('✅ Egreso registrado.');
        cerrarModal('modal-egreso');
        cargarDashboard();
    } catch (e) { alert('Error: ' + e.message); }
};

// ==========================================
// 5. INVENTARIO
// ==========================================
let productoEditandoId = null;

async function cargarInventario() {
    try {
        const { data } = await db.from('inventario').select('*').order('nombre');
        const lista = document.getElementById('lista-inventario');
        lista.innerHTML = '';
        let totalInv = 0;

        data.forEach(p => {
            totalInv += (p.costo_compra * p.stock);
            lista.innerHTML += `
                <li class="historial-item" style="display:flex; justify-content:space-between; align-items:center;">
                    <div><b style="color:#4db8ff;">${p.nombre}</b> (Stock: ${p.stock})<br><small>Costo: $${p.costo_compra} | Venta: $${p.precio_venta}</small></div>
                    <div>
                        <button onclick="editarProducto('${p.id}','${p.nombre}',${p.costo_compra},${p.precio_venta},${p.stock})" style="background:#333;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">✏️</button>
                    </div>
                </li>`;
        });
        document.getElementById('dash-inv').innerText = totalInv.toFixed(2);
        document.getElementById('total-costo-inventario').innerText = totalInv.toFixed(2);
    } catch (e) {}
}

document.getElementById('btn-guardar-inv').onclick = async () => {
    const nombre = document.getElementById('inv-nombre').value;
    const costo_compra = parseFloat(document.getElementById('inv-costo').value);
    const precio_venta = parseFloat(document.getElementById('inv-precio').value);
    const stock = parseInt(document.getElementById('inv-stock').value);

    if (!nombre || isNaN(costo_compra) || isNaN(precio_venta) || isNaN(stock)) return alert('Llena todo');

    try {
        if (productoEditandoId) {
            await db.from('inventario').update({ nombre, costo_compra, precio_venta, stock }).eq('id', productoEditandoId);
            productoEditandoId = null;
        } else {
            const { data: ext } = await db.from('inventario').select('id').ilike('nombre', nombre).single();
            if (ext) await db.from('inventario').update({ costo_compra, precio_venta, stock }).eq('id', ext.id);
            else await db.from('inventario').insert([{ nombre, costo_compra, precio_venta, stock }]);
        }
        document.querySelectorAll('#panel-inventario input').forEach(i => i.value = '');
        document.getElementById('btn-guardar-inv').innerText = "Guardar";
        cargarInventario(); cargarDashboard(); cargarPOS();
    } catch (e) { alert(e.message); }
};

window.editarProducto = (id, nombre, costo, precio, stock) => {
    productoEditandoId = id;
    document.getElementById('inv-nombre').value = nombre;
    document.getElementById('inv-costo').value = costo;
    document.getElementById('inv-precio').value = precio;
    document.getElementById('inv-stock').value = stock;
    document.getElementById('btn-guardar-inv').innerText = "Actualizar";
};

// ==========================================
// 6. POS (VENTAS CON BOLSILLO Y CIERRE)
// ==========================================
let productosPOS = [];
async function cargarPOS() {
    const { data } = await db.from('inventario').select('*').order('nombre');
    productosPOS = data;
    const sel = document.getElementById('venta-producto');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    data.forEach(p => { if (p.stock > 0) sel.innerHTML += `<option value="${p.id}">${p.nombre} (Disp: ${p.stock}) - $${p.precio_venta}</option>`; });
}

function actualizarTotalVenta() {
    const pId = document.getElementById('venta-producto').value;
    const cant = parseInt(document.getElementById('venta-cantidad').value) || 0;
    const prod = productosPOS.find(p => p.id === pId);
    document.getElementById('venta-total').innerText = prod ? (prod.precio_venta * cant).toFixed(2) : "0.00";
}
document.getElementById('venta-producto').addEventListener('change', actualizarTotalVenta);
document.getElementById('venta-cantidad').addEventListener('input', actualizarTotalVenta);

document.getElementById('btn-procesar-venta').onclick = async () => {
    const prodId = document.getElementById('venta-producto').value;
    const cant = parseInt(document.getElementById('venta-cantidad').value);
    const metodo = document.getElementById('venta-metodo').value;
    const bolsillo = document.getElementById('venta-bolsillo').value;
    const deudorNombre = document.getElementById('venta-deudor').value.trim();
    
    if (!prodId || cant <= 0) return alert('Selección inválida');
    const prod = productosPOS.find(p => p.id === prodId);
    if (cant > prod.stock) return alert('No hay stock');

    const total = prod.precio_venta * cant;
    const ganancia = total - (prod.costo_compra * cant);

    try {
        // Descontar stock
        await db.from('inventario').update({ stock: prod.stock - cant }).eq('id', prodId);
        
        // Guardar venta pendiente para el cierre
        await db.from('ventas_registro').insert([{ producto: prod.nombre, ganancia_neta: ganancia }]);

        if (metodo === 'CONTADO') {
            // Ingresa el dinero al bolsillo de la caja
            const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
            await db.from('caja_principal').update({ [bolsillo.toLowerCase()]: parseFloat(caja[bolsillo.toLowerCase()]) + total }).eq('id', 1);
        } else {
            // A crédito: suma deuda
            if(!deudorNombre) return alert('Nombre deudor obligatorio');
            const { data: dExistente } = await db.from('deudores').select('id, deuda_acumulada').ilike('nombre', deudorNombre).single();
            if (dExistente) await db.from('deudores').update({ deuda_acumulada: parseFloat(dExistente.deuda_acumulada) + total }).eq('id', dExistente.id);
            else await db.from('deudores').insert([{ nombre: deudorNombre, deuda_acumulada: total }]);
        }

        alert('✅ Venta procesada');
        document.getElementById('venta-cantidad').value = '1';
        document.getElementById('venta-deudor').value = '';
        cargarTodo();
    } catch (e) { alert(e.message); }
};

// ==========================================
// 7. DEUDORES (CON HISTORIAL)
// ==========================================
async function cargarDeudores() {
    try {
        const { data } = await db.from('deudores').select('*').order('nombre');
        const lista = document.getElementById('lista-deudores');
        lista.innerHTML = '';
        data.forEach(d => {
            const deuda = parseFloat(d.deuda_acumulada);
            lista.innerHTML += `
                <li class="historial-item" style="display:flex; justify-content:space-between; align-items:center;">
                    <div><strong style="color: #f87171;">${d.nombre}</strong><br>Deuda: <b>$${deuda.toFixed(2)}</b></div>
                    <div style="display:flex; gap:5px;">
                        <button onclick="prepararAbono('${d.id}', '${d.nombre}', ${deuda})" style="background:#4ade80; color:#121212; border:none; padding:8px; border-radius:5px; font-weight:bold; cursor:pointer;">Abonar</button>
                        <button onclick="verHistorialDeudor('${d.nombre}')" style="background:#444; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">Historial</button>
                    </div>
                </li>`;
        });
    } catch (e) {}
}

window.prepararAbono = (id, nombre, deuda) => {
    deudorActualId = id; deudorActualNombre = nombre; deudorActualDeuda = deuda;
    document.getElementById('abono-nombre-lbl').innerText = nombre;
    abrirModal('modal-abono');
};

window.procesarAbonoDeudor = async () => {
    const monto = parseFloat(document.getElementById('abono-monto').value);
    const metodo = document.getElementById('abono-metodo').value; // BANCO, EFECTIVO, USDT
    const ref = document.getElementById('abono-ref').value;
    const bs = document.getElementById('abono-bs').value;
    const receptor = document.getElementById('abono-receptor').value;

    if (isNaN(monto) || monto <= 0 || monto > deudorActualDeuda) return alert('Monto inválido o mayor a la deuda');

    try {
        // 1. Restar deuda
        const nuevaDeuda = deudorActualDeuda - monto;
        if (nuevaDeuda <= 0) await db.from('deudores').delete().eq('id', deudorActualId);
        else await db.from('deudores').update({ deuda_acumulada: nuevaDeuda }).eq('id', deudorActualId);

        // 2. Ingresar dinero a la Caja en el bolsillo correspondiente
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        await db.from('caja_principal').update({ [metodo.toLowerCase()]: parseFloat(caja[metodo.toLowerCase()]) + monto }).eq('id', 1);

        // 3. Registrar Movimiento Deudor
        await db.from('historial_deudores').insert([{
            deudor_nombre: deudorActualNombre, monto, metodo_pago: metodo, referencia: ref, monto_bs: parseFloat(bs)||0, receptor, usuario: currentUser.email
        }]);

        alert('✅ Abono registrado');
        cerrarModal('modal-abono');
        cargarTodo();
    } catch (e) { alert(e.message); }
};

window.verHistorialDeudor = async (nombre) => {
    document.getElementById('historial-nombre-lbl').innerText = nombre;
    const lista = document.getElementById('historial-deudor-lista');
    lista.innerHTML = 'Cargando...';
    abrirModal('modal-historial-deudor');

    try {
        const { data } = await db.from('historial_deudores').select('*').eq('deudor_nombre', nombre).order('fecha', {ascending: false});
        if (!data || data.length === 0) return lista.innerHTML = '<p>No hay abonos registrados.</p>';
        
        lista.innerHTML = '';
        data.forEach(h => {
            const f = new Date(h.fecha).toLocaleString();
            let detalles = `<b>Método:</b> ${h.metodo_pago}`;
            if(h.metodo_pago === 'BANCO') detalles += ` | <b>Ref:</b> ${h.referencia} | <b>Bs:</b> ${h.monto_bs}`;
            if(h.metodo_pago === 'EFECTIVO') detalles += ` | <b>Recibió:</b> ${h.receptor}`;

            lista.innerHTML += `
                <div class="historial-item">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="color:#aaa; font-size:0.8rem;">${f}</span>
                        <b style="color:#4ade80;">+$${h.monto}</b>
                    </div>
                    <div style="color:#ccc; font-size:0.85rem;">${detalles}<br><small>Por: ${h.usuario.split('@')[0]}</small></div>
                </div>`;
        });
    } catch (e) { lista.innerHTML = 'Error cargando historial.'; }
};

// ==========================================
// 8. PASTOR (CIERRES Y LIQUIDACIONES)
// ==========================================
async function cargarPastor() {
    try {
        const { data: c } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        document.getElementById('saldo-pastor').innerText = c ? parseFloat(c.saldo_acumulado).toFixed(2) : "0.00";

        // Cargar Historial Cierres
        const { data: cierres } = await db.from('cierres_semanales').select('*').order('fecha', {ascending: false});
        const lc = document.getElementById('lista-cierres-pastor');
        lc.innerHTML = '';
        if(cierres) cierres.forEach(c => {
            lc.innerHTML += `
                <li class="historial-item" style="border-left-color: #4db8ff;">
                    <b>${new Date(c.fecha).toLocaleDateString()}</b> - Ganancia Neta: <span style="color:#4ade80;">$${c.ganancia_total}</span> | <b>25% Pastor: <span style="color:#facc15;">$${c.porcion_pastor}</span></b>
                </li>`;
        });

        // Cargar Historial Liquidaciones
        const { data: hist } = await db.from('historial_pastor').select('*').order('fecha', {ascending: false});
        const lh = document.getElementById('lista-historial-pastor');
        lh.innerHTML = '';
        if(hist) hist.forEach(h => {
            lh.innerHTML += `
                <li class="historial-item" style="border-left-color: #f87171;">
                    <span style="color:#aaa; font-size:0.8rem;">${new Date(h.fecha).toLocaleString()}</span><br>
                    Retiro/Pago: <b style="color:#f87171;">-$${h.monto}</b> <br> <small>Registrado por: ${h.usuario}</small>
                </li>`;
        });
    } catch (e) {}
}

window.cerrarSemana = async () => {
    if(!confirm('¿Seguro que deseas calcular el 25% de todas las ventas pendientes desde el último cierre?')) return;
    try {
        // Buscar ventas no cerradas
        const { data: ventas } = await db.from('ventas_registro').select('ganancia_neta').eq('cerrado', false);
        if(!ventas || ventas.length === 0) return alert('No hay ventas nuevas registradas desde el último cierre.');

        let gananciaTotal = 0;
        ventas.forEach(v => gananciaTotal += parseFloat(v.ganancia_neta));
        const porcion = gananciaTotal * 0.25;

        // Sumar al saldo del pastor
        const { data: fondo } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        await db.from('cuenta_pastor').update({ saldo_acumulado: parseFloat(fondo.saldo_acumulado) + porcion }).eq('id', 1);

        // Marcar ventas como cerradas
        await db.from('ventas_registro').update({ cerrado: true }).eq('cerrado', false);

        // Guardar historial
        await db.from('cierres_semanales').insert([{ ganancia_total: gananciaTotal, porcion_pastor: porcion }]);

        alert(`✅ Semana cerrada exitosamente.\nGanancia Neta calculada: $${gananciaTotal.toFixed(2)}\n25% agregado al Pastor: $${porcion.toFixed(2)}`);
        cargarPastor();
    } catch (e) { alert(e.message); }
};

window.abrirModalLiquidacion = async () => {
    const { data: c } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
    const saldo = parseFloat(c.saldo_acumulado);
    
    const monto = prompt(`Saldo actual del Pastor: $${saldo.toFixed(2)}\n¿Cuánto dinero se le va a abonar/entregar al pastor?`);
    if(!monto || isNaN(monto) || monto <= 0) return;
    if(monto > saldo) return alert('No puedes retirar más de lo que tiene acumulado.');

    try {
        await db.from('cuenta_pastor').update({ saldo_acumulado: saldo - monto }).eq('id', 1);
        
        // Registrar en historial del pastor
        await db.from('historial_pastor').insert([{ monto: monto, concepto: 'Liquidación de porcentaje', usuario: currentUser.email }]);
        
        // OPCIONAL: Si quieres que el dinero del pastor SALGA de la caja de efectivo automáticamente, debes registrar el egreso manualmente en el dashboard o podemos vincularlo después.
        alert('✅ Pago al pastor registrado.');
        cargarPastor();
    } catch (e) { alert(e.message); }
};
