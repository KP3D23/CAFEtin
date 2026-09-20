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
    pastor: document.getElementById('panel-pastor'),
    historial: document.getElementById('panel-historial')
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
        mostrarPanel('dashboard'); 
        navAdmin.style.display = 'flex'; 
        navAdmin.innerHTML = `
            <button onclick="mostrarPanel('dashboard')" class="btn-sec">Dashboard</button>
            <button onclick="mostrarPanel('pastor')" class="btn-sec">Fondo Pastor</button>
            <button onclick="mostrarPanel('historial')" class="btn-sec">Historial</button>
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
    cargarHistorialGeneral();
}

// ==========================================
// 3. UTILIDADES (MODALES)
// ==========================================
window.abrirModal = id => document.getElementById(id).style.display = 'flex';
window.cerrarModal = id => {
    document.getElementById(id).style.display = 'none';
    const inputs = document.getElementById(id).querySelectorAll('input');
    inputs.forEach(input => input.value = '');
};

// ==========================================
// 4. DASHBOARD (CAJA Y EGRESOS)
// ==========================================
async function cargarDashboard() {
    try {
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const banco = parseFloat(caja.banco) || 0;
        const usdt = parseFloat(caja.usdt) || 0;
        const efectivo = parseFloat(caja.efectivo) || 0;
        const totalCaja = banco + usdt + efectivo;

        document.getElementById('dash-banco').innerText = banco.toFixed(2);
        document.getElementById('dash-usdt').innerText = usdt.toFixed(2);
        document.getElementById('dash-efectivo').innerText = efectivo.toFixed(2);
        document.getElementById('dash-caja').innerText = totalCaja.toFixed(2);

        const { data: deudores } = await db.from('deudores').select('deuda_acumulada');
        let totalCalle = 0;
        if(deudores) deudores.forEach(d => totalCalle += parseFloat(d.deuda_acumulada));
        document.getElementById('dash-calle').innerText = totalCalle.toFixed(2);

        document.getElementById('dash-capital').innerText = (totalCaja + totalCalle).toFixed(2);
    } catch (e) {}
}

window.abrirModalEgreso = () => abrirModal('modal-egreso');

window.procesarEgreso = async () => {
    const concepto = document.getElementById('egreso-concepto').value.trim();
    const monto = parseFloat(document.getElementById('egreso-monto').value);
    const bolsillo = document.getElementById('egreso-bolsillo').value;

    if (!concepto || isNaN(monto) || monto <= 0) return alert('Datos inválidos');

    try {
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const saldoBolsillo = parseFloat(caja[bolsillo.toLowerCase()]);
        
        if (monto > saldoBolsillo) return alert(`No hay suficiente dinero en ${bolsillo}`);

        await db.from('caja_principal').update({ [bolsillo.toLowerCase()]: saldoBolsillo - monto }).eq('id', 1);
        
        await db.from('movimientos_caja').insert([{
            tipo: 'EGRESO', monto, bolsillo, concepto, usuario: currentUser.email
        }]);

        alert('✅ Egreso registrado.');
        cerrarModal('modal-egreso');
        cargarDashboard();
        cargarHistorialGeneral();
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
        cargarTodo();
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
// 6. POS (CARRITO DE COMPRAS)
// ==========================================
let productosPOS = [];
let carrito = [];

async function cargarPOS() {
    const { data } = await db.from('inventario').select('*').order('nombre');
    productosPOS = data;
    const sel = document.getElementById('venta-producto');
    sel.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    data.forEach(p => { if (p.stock > 0) sel.innerHTML += `<option value="${p.id}">${p.nombre} (Disp: ${p.stock}) - $${p.precio_venta}</option>`; });
}

window.agregarAlCarrito = () => {
    const pId = document.getElementById('venta-producto').value;
    const cant = parseInt(document.getElementById('venta-cantidad').value) || 0;
    
    if (!pId || cant <= 0) return alert('Selecciona un producto y cantidad válida.');
    
    const prod = productosPOS.find(p => p.id === pId);
    const enCarrito = carrito.find(item => item.id === pId);
    const cantEnCarrito = enCarrito ? enCarrito.cantidad : 0;
    
    if (cant + cantEnCarrito > prod.stock) return alert(`Stock insuficiente. Solo tienes ${prod.stock} en total.`);

    if (enCarrito) {
        enCarrito.cantidad += cant;
    } else {
        carrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: prod.precio_venta,
            costo: prod.costo_compra,
            stock: prod.stock,
            cantidad: cant
        });
    }
    
    document.getElementById('venta-producto').value = '';
    document.getElementById('venta-cantidad').value = '1';
    actualizarCarrito();
};

window.eliminarDelCarrito = (index) => {
    carrito.splice(index, 1);
    actualizarCarrito();
};

function actualizarCarrito() {
    const lista = document.getElementById('lista-carrito');
    const totalEl = document.getElementById('venta-total');
    
    if (carrito.length === 0) {
        lista.innerHTML = '<li style="color: #666; text-align: center;">El carrito está vacío</li>';
        totalEl.innerText = '0.00';
        return;
    }

    lista.innerHTML = '';
    let total = 0;
    
    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        lista.innerHTML += `
            <li style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #2c2c2c; padding-bottom: 5px;">
                <div><span style="color:#4db8ff;">${item.nombre}</span> x${item.cantidad}</div>
                <div style="display:flex; gap:10px;">
                    <span>$${subtotal.toFixed(2)}</span>
                    <button onclick="eliminarDelCarrito(${index})" style="background:none; border:none; color:#f87171; cursor:pointer; font-weight:bold;">X</button>
                </div>
            </li>
        `;
    });
    
    totalEl.innerText = total.toFixed(2);
}

document.getElementById('btn-procesar-venta').onclick = async () => {
    if (carrito.length === 0) return alert('El carrito está vacío.');

    const metodo = document.getElementById('venta-metodo').value;
    const bolsillo = document.getElementById('venta-bolsillo').value;
    const deudorNombre = document.getElementById('venta-deudor').value.trim();
    
    if (metodo === 'CREDITO' && !deudorNombre) return alert('Ingresa el nombre del deudor.');

    let ventaTotal = 0;
    let ventasData = [];

    try {
        for (let item of carrito) {
            const subtotal = item.precio * item.cantidad;
            const costoTotalItem = item.costo * item.cantidad;
            const gananciaItem = subtotal - costoTotalItem;
            
            ventaTotal += subtotal;
            
            // Extraer stock actual por si fue modificado en otra pantalla simultáneamente
            const { data: stockActual } = await db.from('inventario').select('stock').eq('id', item.id).single();
            if(stockActual) {
                 await db.from('inventario').update({ stock: stockActual.stock - item.cantidad }).eq('id', item.id);
            }
            
            ventasData.push({ producto: `${item.cantidad}x ${item.nombre}`, ganancia_neta: gananciaItem });
        }

        // Insertar registro masivo para el cierre de semana del pastor
        await db.from('ventas_registro').insert(ventasData);

        if (metodo === 'CONTADO') {
            const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
            await db.from('caja_principal').update({ [bolsillo.toLowerCase()]: parseFloat(caja[bolsillo.toLowerCase()]) + ventaTotal }).eq('id', 1);
        } else {
            const { data: dExistente } = await db.from('deudores').select('id, deuda_acumulada').ilike('nombre', deudorNombre).single();
            if (dExistente) {
                await db.from('deudores').update({ deuda_acumulada: parseFloat(dExistente.deuda_acumulada) + ventaTotal }).eq('id', dExistente.id);
            } else {
                await db.from('deudores').insert([{ nombre: deudorNombre, deuda_acumulada: ventaTotal }]);
            }
        }

        alert('✅ Venta procesada con éxito');
        
        carrito = [];
        actualizarCarrito();
        document.getElementById('venta-deudor').value = '';
        cargarTodo();
    } catch (e) { 
        alert('Error al procesar la venta: ' + e.message); 
    }
};

// ==========================================
// 7. DEUDORES Y ABONOS
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
                    <button onclick="prepararAbono('${d.id}', '${d.nombre}', ${deuda})" style="background:#4ade80; color:#121212; border:none; padding:8px 15px; border-radius:5px; font-weight:bold; cursor:pointer;">Abonar</button>
                </li>`;
        });
    } catch (e) { console.error(e); }
}

// ==========================================
// 8. PASTOR (CIERRES Y LIQUIDACIONES)
// ==========================================
async function cargarPastor() {
    try {
        const { data: c } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        document.getElementById('saldo-pastor').innerText = c ? parseFloat(c.saldo_acumulado).toFixed(2) : "0.00";

        const { data: cierres } = await db.from('cierres_semanales').select('*').order('fecha', {ascending: false});
        const lc = document.getElementById('lista-cierres-pastor');
        lc.innerHTML = '';
        if(cierres) cierres.forEach(c => {
            lc.innerHTML += `
                <li class="historial-item" style="border-left-color: #4db8ff;">
                    <b>${new Date(c.fecha).toLocaleDateString()}</b> - Ganancia Neta: <span style="color:#4ade80;">$${c.ganancia_total}</span> | <b>25% Pastor: <span style="color:#facc15;">$${c.porcion_pastor}</span></b>
                </li>`;
        });

        const { data: hist } = await db.from('historial_pastor').select('*').order('fecha', {ascending: false});
        const lh = document.getElementById('lista-historial-pastor');
        lh.innerHTML = '';
        if(hist) hist.forEach(h => {
            lh.innerHTML += `
                <li class="historial-item" style="border-left-color: #f87171;">
                    <span style="color:#aaa; font-size:0.8rem;">${new Date(h.fecha).toLocaleString()}</span><br>
                    Retiro/Pago: <b style="color:#f87171;">-$${h.monto}</b> <br> <small>Registrado por: ${h.usuario.split('@')[0]}</small>
                </li>`;
        });
    } catch (e) {}
}

window.cerrarSemana = async () => {
    if(!confirm('¿Seguro que deseas calcular el 25% de todas las ventas pendientes desde el último cierre?')) return;
    try {
        const { data: ventas } = await db.from('ventas_registro').select('ganancia_neta').eq('cerrado', false);
        if(!ventas || ventas.length === 0) return alert('No hay ventas nuevas registradas desde el último cierre.');

        let gananciaTotal = 0;
        ventas.forEach(v => gananciaTotal += parseFloat(v.ganancia_neta));
        const porcion = gananciaTotal * 0.25;

        const { data: fondo } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        await db.from('cuenta_pastor').update({ saldo_acumulado: parseFloat(fondo.saldo_acumulado) + porcion }).eq('id', 1);

        await db.from('ventas_registro').update({ cerrado: true }).eq('cerrado', false);
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
        await db.from('historial_pastor').insert([{ monto: monto, concepto: 'Liquidación de porcentaje', usuario: currentUser.email }]);
        alert('✅ Pago al pastor registrado.');
        cargarPastor();
    } catch (e) { alert(e.message); }
};

// ==========================================
// 9. LIBRO MAYOR (HISTORIAL GENERAL)
// ==========================================
async function cargarHistorialGeneral() {
    try {
        const { data: abonos } = await db.from('historial_deudores').select('*');
        const { data: egresos } = await db.from('movimientos_caja').select('*');
        
        let movimientos = [];
        
        if (abonos) {
            abonos.forEach(a => {
                movimientos.push({
                    fecha: new Date(a.fecha),
                    monto: a.monto,
                    tipo: 'INGRESO',
                    descripcion: `Abono de Deuda - ${a.deudor_nombre}`,
                    detalles: a.metodo_pago === 'BANCO' ? `Pago Móvil | Ref: ${a.referencia} | Bs: ${a.monto_bs}` : `Efectivo | Entregado a: ${a.receptor || 'No especificado'}`,
                    usuario: a.usuario
                });
            });
        }
        
        if (egresos) {
            egresos.forEach(e => {
                movimientos.push({
                    fecha: new Date(e.fecha),
                    monto: e.monto,
                    tipo: 'EGRESO',
                    descripcion: `Egreso de Caja (${e.bolsillo}) - ${e.concepto}`,
                    detalles: `Salida de dinero registrada`,
                    usuario: e.usuario
                });
            });
        }

        movimientos.sort((a, b) => b.fecha - a.fecha);

        const lista = document.getElementById('lista-historial-general');
        lista.innerHTML = '';

        if (movimientos.length === 0) {
            lista.innerHTML = '<li class="historial-item" style="color:#aaa; text-align:center;">No hay movimientos registrados.</li>';
            return;
        }

        movimientos.forEach(m => {
            const esIngreso = m.tipo === 'INGRESO';
            const color = esIngreso ? '#4ade80' : '#f87171';
            const signo = esIngreso ? '+' : '-';
            
            lista.innerHTML += `
                <li class="historial-item" style="border-left-color: ${color};">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="color:#aaa; font-size:0.8rem;">${m.fecha.toLocaleString()}</span>
                        <b style="color:${color};">${signo}$${m.monto.toFixed(2)}</b>
                    </div>
                    <div style="color:#fff; font-size:1rem; margin-bottom: 5px;">${m.descripcion}</div>
                    <div style="color:#ccc; font-size:0.85rem;">${m.detalles}<br><small style="color:#888;">Operado por: ${m.usuario.split('@')[0]}</small></div>
                </li>`;
        });
    } catch (e) { console.error('Error cargando historial', e); }
}
