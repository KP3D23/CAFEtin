// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const supabaseUrl = 'https://rdoecgupwqhzrxfbrbrf.supabase.co';
const supabaseKey = 'sb_publishable_UNxJedkIOD45NhRU1C2ZNA_9ehyLc5C';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const navAdmin = document.getElementById('nav-admin');
const bolsasWrapper = document.getElementById('bolsas-wrapper');
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
    else {
        loginScreen.style.display = 'block';
        appScreen.style.display = 'none';
    }
});

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('Ingresa correo y contraseña');
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await cargarApp(data.user);
    } catch (error) {
        alert('Error: ' + error.message);
    }
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
    } catch (error) {
        alert('Error de permisos: verifica que el usuario tenga un rol asignado en la tabla roles.');
    }
}

function configurarVistasPorRol() {
    Object.values(panels).forEach(p => p.style.display = 'none');
    navAdmin.style.display = 'none';
    if (bolsasWrapper) bolsasWrapper.style.display = 'none';

    const btnSqlAdmin = document.getElementById('btn-sql-admin');
    if (btnSqlAdmin) btnSqlAdmin.style.display = 'none';

    if (currentRole === 'ADMIN') {
        navAdmin.style.display = 'flex';
        if (btnSqlAdmin) btnSqlAdmin.style.display = 'inline-flex';
        mostrarPanel('dashboard');
        cargarTodo();
    } else if (currentRole === 'BOLSAS') {
        if (bolsasWrapper) bolsasWrapper.style.display = 'block';
        if (typeof iniciarModuloBolsas === 'function') {
            iniciarModuloBolsas();
        }
    } else if (currentRole === 'PASTOR') {
        mostrarPanel('dashboard');
        navAdmin.style.display = 'flex';
        navAdmin.innerHTML = `
            <button onclick="mostrarPanel('dashboard')" class="btn-sec" id="btn-nav-dashboard">📊 Dashboard</button>
            <button onclick="mostrarPanel('pastor')" class="btn-sec" id="btn-nav-pastor">🙏 Fondo Pastor</button>
            <button onclick="mostrarPanel('historial')" class="btn-sec" id="btn-nav-historial">📒 Libro Mayor</button>
        `;
        cargarTodo();
    } else if (currentRole === 'COBRADOR') {
        mostrarPanel('deudores');
        cargarDeudores();
    }
}

window.mostrarPanel = function (panelId) {
    Object.values(panels).forEach(p => p.style.display = 'none');
    if (panels[panelId]) panels[panelId].style.display = 'block';

    document.querySelectorAll('#nav-admin .btn-sec').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-nav-${panelId}`);
    if (activeBtn) activeBtn.classList.add('active');
};

function cargarTodo() {
    cargarDashboard();
    cargarInventario();
    cargarPOS();
    cargarHistorialPOS();
    cargarDeudores();
    cargarPastor();
    cargarHistorialGeneral();
}

// ==========================================
// 3. UTILIDADES (MODALES Y CONSOLA SQL)
// ==========================================
window.abrirModal = id => {
    document.getElementById(id).style.display = 'flex';
    if (id === 'modal-sql') {
        document.getElementById('sql-console-status').innerHTML = '';
    }
};

window.cerrarModal = id => {
    document.getElementById(id).style.display = 'none';
    const inputs = document.getElementById(id).querySelectorAll('input');
    inputs.forEach(input => input.value = '');
};

window.ejecutarSQLConsola = async () => {
    const query = document.getElementById('sql-console-input').value.trim();
    const statusEl = document.getElementById('sql-console-status');

    if (!query) {
        statusEl.innerHTML = '<span style="color:#f87171;">⚠️ Escribe o pega un código SQL primero.</span>';
        return;
    }

    if (!confirm('¿Seguro que deseas ejecutar este código SQL directamente en la base de datos?')) return;

    statusEl.innerHTML = '<span style="color:#38bdf8;">⏳ Ejecutando...</span>';

    try {
        const { data, error } = await db.rpc('ejecutar_sql_admin', { sql_query: query });
        if (error) throw error;

        statusEl.innerHTML = `<span style="color:#4ade80;">✅ ${data || 'SQL ejecutado correctamente.'}</span>`;
        document.getElementById('sql-console-input').value = '';

        if (currentRole === 'BOLSAS' && typeof cargarTodoBolsas === 'function') {
            cargarTodoBolsas();
        } else {
            cargarTodo();
        }
    } catch (e) {
        statusEl.innerHTML = `<span style="color:#f87171;">❌ Error: ${e.message}</span>`;
    }
};

// ==========================================
// 4. DASHBOARD CAFETÍN (CAJA Y EGRESOS)
// ==========================================
async function cargarDashboard() {
    try {
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const banco = caja ? parseFloat(caja.banco) || 0 : 0;
        const usdt = caja ? parseFloat(caja.usdt) || 0 : 0;
        const efectivo = caja ? parseFloat(caja.efectivo) || 0 : 0;
        const totalCaja = banco + usdt + efectivo;

        document.getElementById('dash-banco').innerText = banco.toFixed(2);
        document.getElementById('dash-usdt').innerText = usdt.toFixed(2);
        document.getElementById('dash-efectivo').innerText = efectivo.toFixed(2);
        document.getElementById('dash-caja').innerText = totalCaja.toFixed(2);

        const { data: deudores } = await db.from('deudores').select('deuda_acumulada');
        let totalCalle = 0;
        if (deudores) deudores.forEach(d => totalCalle += parseFloat(d.deuda_acumulada) || 0);
        document.getElementById('dash-calle').innerText = totalCalle.toFixed(2);

        document.getElementById('dash-capital').innerText = (totalCaja + totalCalle).toFixed(2);
    } catch (e) {
        console.error('Error en dashboard:', e);
    }
}

window.abrirModalEgreso = () => abrirModal('modal-egreso');

window.procesarEgreso = async () => {
    const concepto = document.getElementById('egreso-concepto').value.trim();
    let montoVal = document.getElementById('egreso-monto').value.replace(',', '.');
    const monto = parseFloat(montoVal);
    const bolsillo = document.getElementById('egreso-bolsillo').value;

    if (!concepto || isNaN(monto) || monto <= 0) return alert('Datos inválidos o monto incorrecto');

    try {
        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        const saldoBolsillo = parseFloat(caja[bolsillo.toLowerCase()]) || 0;

        if (monto > saldoBolsillo) return alert(`No hay suficiente dinero en ${bolsillo}`);

        await db.from('caja_principal').update({ [bolsillo.toLowerCase()]: saldoBolsillo - monto }).eq('id', 1);

        await db.from('movimientos_caja').insert([{
            tipo: 'EGRESO', monto, bolsillo, concepto, usuario: currentUser.email
        }]);

        alert('✅ Egreso registrado.');
        cerrarModal('modal-egreso');
        cargarDashboard();
        cargarHistorialGeneral();
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

// ==========================================
// 5. INVENTARIO CAFETÍN
// ==========================================
let productoEditandoId = null;

async function cargarInventario() {
    try {
        const { data } = await db.from('inventario').select('*').order('nombre');
        const lista = document.getElementById('lista-inventario');
        lista.innerHTML = '';
        let totalInv = 0;

        if (data) {
            data.forEach(p => {
                totalInv += (p.costo_compra * p.stock);
                const li = document.createElement('li');
                li.className = 'historial-item';
                li.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
                li.innerHTML = `
                    <div>
                        <b style="color:#38bdf8;">${p.nombre}</b> (Stock: ${p.stock})<br>
                        <small style="color:#94a3b8;">Costo: $${p.costo_compra} | Venta: $${p.precio_venta}</small>
                    </div>
                    <button style="background:#334155;color:white;padding:8px 12px;border-radius:6px;">✏️</button>
                `;
                li.querySelector('button').onclick = () => editarProducto(p.id, p.nombre, p.costo_compra, p.precio_venta, p.stock);
                lista.appendChild(li);
            });
        }
        document.getElementById('dash-inv').innerText = totalInv.toFixed(2);
    } catch (e) {
        console.error('Error inventario:', e);
    }
}

document.getElementById('btn-guardar-inv').onclick = async () => {
    const nombre = document.getElementById('inv-nombre').value.trim();
    const costo_compra = parseFloat(document.getElementById('inv-costo').value.replace(',', '.'));
    const precio_venta = parseFloat(document.getElementById('inv-precio').value.replace(',', '.'));
    const stock = parseInt(document.getElementById('inv-stock').value);

    if (!nombre || isNaN(costo_compra) || isNaN(precio_venta) || isNaN(stock)) return alert('Llena todos los campos correctamente.');

    try {
        if (productoEditandoId) {
            await db.from('inventario').update({ nombre, costo_compra, precio_venta, stock }).eq('id', productoEditandoId);
            productoEditandoId = null;
        } else {
            const { data: ext } = await db.from('inventario').select('id').ilike('nombre', nombre).maybeSingle();
            if (ext) await db.from('inventario').update({ costo_compra, precio_venta, stock }).eq('id', ext.id);
            else await db.from('inventario').insert([{ nombre, costo_compra, precio_venta, stock }]);
        }
        document.querySelectorAll('#panel-inventario input').forEach(i => i.value = '');
        document.getElementById('btn-guardar-inv').innerText = 'Guardar Producto';
        cargarTodo();
    } catch (e) {
        alert(e.message);
    }
};

window.editarProducto = (id, nombre, costo, precio, stock) => {
    productoEditandoId = id;
    document.getElementById('inv-nombre').value = nombre;
    document.getElementById('inv-costo').value = costo;
    document.getElementById('inv-precio').value = precio;
    document.getElementById('inv-stock').value = stock;
    document.getElementById('btn-guardar-inv').innerText = 'Actualizar Producto';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// 6. POS CAFETÍN (RENOVADO CON CATÁLOGO TÁCTIL)
// ==========================================
let productosPOS = [];
let carrito = [];

async function cargarPOS() {
    try {
        const { data } = await db.from('inventario').select('*').order('nombre');
        productosPOS = (data || []).filter(p => p.stock > 0);
        renderCatalogoCafetin(productosPOS);
    } catch (e) {
        console.error(e);
    }
}

window.filtrarCatalogoCafetin = () => {
    const q = (document.getElementById('cafetin-pos-buscar').value || '').toLowerCase();
    const filtrados = productosPOS.filter(p => p.nombre.toLowerCase().includes(q));
    renderCatalogoCafetin(filtrados);
};

function renderCatalogoCafetin(lista) {
    const cont = document.getElementById('cafetin-pos-catalogo');
    if (!cont) return;
    cont.innerHTML = '';

    if (lista.length === 0) {
        cont.innerHTML = '<p style="color:#64748b; grid-column:1/-1; text-align:center;">Sin productos con stock.</p>';
        return;
    }

    lista.forEach(p => {
        const tile = document.createElement('div');
        tile.className = 'prod-tile';
        tile.innerHTML = `
            <div class="p-name">${p.nombre}</div>
            <div>
                <div class="p-price">$${parseFloat(p.precio_venta).toFixed(2)}</div>
                <div class="p-stock">Disp: ${p.stock}</div>
            </div>
        `;
        tile.onclick = () => agregarProductoCafetin(p.id);
        cont.appendChild(tile);
    });
}

function agregarProductoCafetin(pId) {
    const prod = productosPOS.find(p => p.id === pId);
    if (!prod) return;

    const enCarrito = carrito.find(item => item.id === pId);
    const cantEnCarrito = enCarrito ? enCarrito.cantidad : 0;

    if (cantEnCarrito + 1 > prod.stock) {
        return alert(`Stock insuficiente. Solo tienes ${prod.stock} disponibles.`);
    }

    if (enCarrito) {
        enCarrito.cantidad += 1;
    } else {
        carrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: parseFloat(prod.precio_venta),
            costo: parseFloat(prod.costo_compra),
            stock: prod.stock,
            cantidad: 1
        });
    }
    actualizarCarrito();
}

window.cambiarCantidadCafetin = (index, delta) => {
    const item = carrito[index];
    if (!item) return;

    const nuevaCant = item.cantidad + delta;
    if (nuevaCant <= 0) {
        carrito.splice(index, 1);
    } else if (nuevaCant > item.stock) {
        return alert(`Solo hay ${item.stock} disponibles de ${item.nombre}.`);
    } else {
        item.cantidad = nuevaCant;
    }
    actualizarCarrito();
};

function actualizarCarrito() {
    const lista = document.getElementById('lista-carrito');
    const totalEl = document.getElementById('venta-total');

    if (carrito.length === 0) {
        lista.innerHTML = '<p style="color: #64748b; text-align: center; padding: 14px;">El carrito está vacío</p>';
        totalEl.innerText = '0.00';
        return;
    }

    lista.innerHTML = '';
    let total = 0;

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        lista.innerHTML += `
            <div class="cart-row">
                <div>
                    <strong style="color:#38bdf8;">${item.nombre}</strong><br>
                    <small style="color:#94a3b8;">$${item.precio.toFixed(2)} c/u → <b style="color:#4ade80;">$${subtotal.toFixed(2)}</b></small>
                </div>
                <div class="qty-ctrl">
                    <button class="qty-btn" onclick="cambiarCantidadCafetin(${index}, -1)">−</button>
                    <span style="min-width:24px; text-align:center; font-weight:bold;">${item.cantidad}</span>
                    <button class="qty-btn" onclick="cambiarCantidadCafetin(${index}, 1)">+</button>
                </div>
            </div>`;
    });
    totalEl.innerText = total.toFixed(2);
}

document.getElementById('btn-procesar-venta').onclick = async () => {
    if (carrito.length === 0) return alert('El carrito está vacío.');

    const cliente = document.getElementById('venta-cliente').value.trim();
    const metodo = document.getElementById('venta-metodo').value;
    const ref = document.getElementById('venta-ref').value.trim();
    const bsVal = document.getElementById('venta-bs').value.replace(',', '.');
    const bs = parseFloat(bsVal) || 0;

    if (!cliente) return alert('Por favor, ingresa el nombre del cliente o deudor.');

    let ventaTotal = 0;
    let gananciaTotal = 0;
    let descripciones = [];

    try {
        for (let item of carrito) {
            const subtotal = item.precio * item.cantidad;
            const costoTotalItem = item.costo * item.cantidad;

            ventaTotal += subtotal;
            gananciaTotal += (subtotal - costoTotalItem);
            descripciones.push(`${item.cantidad}x ${item.nombre}`);

            const { data: stockActual } = await db.from('inventario').select('stock').eq('id', item.id).single();
            if (stockActual) {
                await db.from('inventario').update({ stock: stockActual.stock - item.cantidad }).eq('id', item.id);
            }
        }

        const descripcionFinal = descripciones.join(', ');

        await db.from('ventas_registro').insert([{
            producto: descripcionFinal,
            ganancia_neta: gananciaTotal,
            cliente: cliente,
            total: ventaTotal,
            metodo_pago: metodo,
            referencia: ref || null,
            monto_bs: bs
        }]);

        if (metodo !== 'CREDITO') {
            const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
            await db.from('caja_principal').update({ [metodo.toLowerCase()]: parseFloat(caja[metodo.toLowerCase()]) + ventaTotal }).eq('id', 1);
        } else {
            const { data: dExistente } = await db.from('deudores').select('id, deuda_acumulada').ilike('nombre', cliente).maybeSingle();
            if (dExistente) {
                await db.from('deudores').update({ deuda_acumulada: parseFloat(dExistente.deuda_acumulada) + ventaTotal }).eq('id', dExistente.id);
            } else {
                await db.from('deudores').insert([{ nombre: cliente, deuda_acumulada: ventaTotal }]);
            }
        }

        alert('✅ Venta procesada con éxito');

        carrito = [];
        actualizarCarrito();
        document.getElementById('venta-cliente').value = '';
        document.getElementById('venta-ref').value = '';
        document.getElementById('venta-bs').value = '';
        cargarTodo();
    } catch (e) {
        alert('Error al procesar la venta: ' + e.message);
    }
};

async function cargarHistorialPOS() {
    try {
        const { data } = await db.from('ventas_registro').select('*').order('fecha', { ascending: false }).limit(100);
        const contenedor = document.getElementById('lista-ventas-pos');
        contenedor.innerHTML = '';

        if (!data || data.length === 0) {
            contenedor.innerHTML = '<p style="color:#94a3b8;">No hay ventas registradas.</p>';
            return;
        }

        let html = '';
        let fechaActual = '';

        data.forEach(v => {
            const fechaStr = new Date(v.fecha).toLocaleDateString();
            if (fechaStr !== fechaActual) {
                html += `<h4 style="color:#facc15; border-bottom:1px solid #334155; padding-bottom:5px; margin-top:15px; margin-bottom:10px;">📅 ${fechaStr}</h4>`;
                fechaActual = fechaStr;
            }

            const colorMetodo = v.metodo_pago === 'CREDITO' ? '#f87171' : '#4ade80';
            let detallesStr = '';
            if (v.metodo_pago === 'BANCO') detallesStr = ` | Ref/Nota: ${v.referencia || '-'} | Bs: ${v.monto_bs || 0}`;

            html += `
                <div class="historial-item" style="border-left-color: ${colorMetodo};">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <strong style="color: #fff;">${v.cliente || 'Cliente General'}</strong>
                        <b style="color:${colorMetodo};">$${(parseFloat(v.total) || 0).toFixed(2)}</b>
                    </div>
                    <div style="color:#cbd5e1; font-size:0.88rem;">
                        Venta: ${v.producto} <br>
                        <small style="color:#94a3b8;">Pago: ${v.metodo_pago} ${detallesStr}</small>
                    </div>
                </div>
            `;
        });

        contenedor.innerHTML = html;
    } catch (e) {
        console.error('Error cargando historial pos', e);
    }
}

// ==========================================
// 7. DEUDORES Y ABONOS CAFETÍN
// ==========================================
async function cargarDeudores() {
    try {
        const { data } = await db.from('deudores').select('*').order('nombre');
        const lista = document.getElementById('lista-deudores');
        lista.innerHTML = '';
        if (data) {
            data.forEach(d => {
                const deuda = parseFloat(d.deuda_acumulada);
                lista.innerHTML += `
                    <li class="historial-item" style="display:flex; justify-content:space-between; align-items:center;">
                        <div><strong style="color: #f87171;">${d.nombre}</strong><br>Deuda: <b>$${deuda.toFixed(2)}</b></div>
                        <button data-id="${d.id}" data-nombre="${d.nombre}" data-deuda="${deuda}" onclick="prepararAbono(this.dataset.id, this.dataset.nombre, parseFloat(this.dataset.deuda))" style="background:#4ade80; color:#0f172a; padding:10px 16px;">Abonar</button>
                    </li>`;
            });
        }
    } catch (e) {
        console.error('Error cargando deudores:', e);
    }
}

window.prepararAbono = (id, nombre, deuda) => {
    deudorActualId = id;
    deudorActualNombre = nombre;
    deudorActualDeuda = deuda;
    document.getElementById('abono-nombre-lbl').innerText = nombre;
    abrirModal('modal-abono');
};

window.procesarAbonoDeudor = async () => {
    let montoVal = document.getElementById('abono-monto').value.replace(',', '.');
    const monto = parseFloat(montoVal);
    const metodo = document.getElementById('abono-metodo').value;
    const ref = document.getElementById('abono-ref').value || '-';
    const bsVal = document.getElementById('abono-bs').value.replace(',', '.');
    const bs = parseFloat(bsVal) || 0;

    if (isNaN(monto) || monto <= 0) return alert('Monto inválido.');
    if (monto > deudorActualDeuda) return alert(`No puedes abonar más de lo que debe ($${deudorActualDeuda.toFixed(2)}).`);

    try {
        const nuevaDeuda = deudorActualDeuda - monto;

        if (nuevaDeuda <= 0) await db.from('deudores').delete().eq('id', deudorActualId);
        else await db.from('deudores').update({ deuda_acumulada: nuevaDeuda }).eq('id', deudorActualId);

        const { data: caja } = await db.from('caja_principal').select('*').eq('id', 1).single();
        if (caja) {
            await db.from('caja_principal').update({ [metodo.toLowerCase()]: parseFloat(caja[metodo.toLowerCase()]) + monto }).eq('id', 1);
        }

        const userEmail = currentUser && currentUser.email ? currentUser.email : 'Usuario';
        await db.from('historial_deudores').insert([{
            deudor_nombre: deudorActualNombre,
            monto: monto,
            metodo_pago: metodo,
            referencia: ref,
            monto_bs: bs,
            usuario: userEmail
        }]);

        alert('✅ Abono registrado correctamente');
        cerrarModal('modal-abono');
        cargarTodo();
    } catch (e) {
        alert('Error guardando abono: ' + e.message);
    }
};

// ==========================================
// 8. PASTOR (CIERRES Y LIQUIDACIONES)
// ==========================================
async function cargarPastor() {
    try {
        const { data: c } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        document.getElementById('saldo-pastor').innerText = c ? parseFloat(c.saldo_acumulado).toFixed(2) : '0.00';

        const { data: cierres } = await db.from('cierres_semanales').select('*').order('fecha', { ascending: false });
        const lc = document.getElementById('lista-cierres-pastor');
        lc.innerHTML = '';
        if (cierres) cierres.forEach(c => {
            lc.innerHTML += `
                <li class="historial-item" style="border-left-color: #38bdf8;">
                    <b>${new Date(c.fecha).toLocaleDateString()}</b> - Ganancia Neta: <span style="color:#4ade80;">$${c.ganancia_total}</span> | <b>25% Pastor: <span style="color:#facc15;">$${c.porcion_pastor}</span></b>
                </li>`;
        });

        const { data: hist } = await db.from('historial_pastor').select('*').order('fecha', { ascending: false });
        const lh = document.getElementById('lista-historial-pastor');
        lh.innerHTML = '';
        if (hist) hist.forEach(h => {
            const usuarioStr = h.usuario ? h.usuario.split('@')[0] : 'Desconocido';
            lh.innerHTML += `
                <li class="historial-item" style="border-left-color: #f87171;">
                    <span style="color:#94a3b8; font-size:0.8rem;">${new Date(h.fecha).toLocaleString()}</span><br>
                    Retiro/Pago: <b style="color:#f87171;">-$${h.monto}</b> <br> <small>Registrado por: ${usuarioStr}</small>
                </li>`;
        });
    } catch (e) {
        console.error('Error cargando pastor', e);
    }
}

window.cerrarSemana = async () => {
    if (!confirm('¿Seguro que deseas calcular el 25% de todas las ventas pendientes desde el último cierre?')) return;
    try {
        const { data: ventas } = await db.from('ventas_registro').select('ganancia_neta').eq('cerrado', false);
        if (!ventas || ventas.length === 0) return alert('No hay ventas nuevas registradas desde el último cierre.');

        let gananciaTotal = 0;
        ventas.forEach(v => gananciaTotal += parseFloat(v.ganancia_neta));
        const porcion = gananciaTotal * 0.25;

        const { data: fondo } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        await db.from('cuenta_pastor').update({ saldo_acumulado: parseFloat(fondo.saldo_acumulado) + porcion }).eq('id', 1);

        await db.from('ventas_registro').update({ cerrado: true }).eq('cerrado', false);
        await db.from('cierres_semanales').insert([{ ganancia_total: gananciaTotal, porcion_pastor: porcion }]);

        alert(`✅ Semana cerrada exitosamente.\nGanancia Neta calculada: $${gananciaTotal.toFixed(2)}\n25% agregado al Pastor: $${porcion.toFixed(2)}`);
        cargarPastor();
    } catch (e) {
        alert(e.message);
    }
};

window.abrirModalLiquidacion = async () => {
    const { data: c } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
    const saldo = parseFloat(c.saldo_acumulado);

    let montoVal = prompt(`Saldo actual del Pastor: $${saldo.toFixed(2)}\n¿Cuánto dinero se le va a abonar/entregar al pastor?`);
    if (!montoVal) return;
    montoVal = montoVal.replace(',', '.');
    const monto = parseFloat(montoVal);

    if (isNaN(monto) || monto <= 0) return alert('Monto inválido.');
    if (monto > saldo) return alert('No puedes retirar más de lo que tiene acumulado.');

    try {
        const userEmail = currentUser && currentUser.email ? currentUser.email : 'Usuario';
        await db.from('cuenta_pastor').update({ saldo_acumulado: saldo - monto }).eq('id', 1);
        await db.from('historial_pastor').insert([{ monto: monto, concepto: 'Liquidación de porcentaje', usuario: userEmail }]);
        alert('✅ Pago al pastor registrado.');
        cargarPastor();
    } catch (e) {
        alert(e.message);
    }
};

// ==========================================
// 9. LIBRO MAYOR CAFETÍN
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
                    monto: parseFloat(a.monto),
                    tipo: 'INGRESO',
                    descripcion: `Abono de Deuda - ${a.deudor_nombre}`,
                    detalles: a.metodo_pago === 'BANCO' ? `Pago Móvil / Efvo Bs | Ref: ${a.referencia} | Bs: ${a.monto_bs}` : `Efectivo ($)`,
                    usuario: a.usuario
                });
            });
        }

        if (egresos) {
            egresos.forEach(e => {
                movimientos.push({
                    fecha: new Date(e.fecha),
                    monto: parseFloat(e.monto),
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
            lista.innerHTML = '<li class="historial-item" style="color:#94a3b8; text-align:center;">No hay movimientos registrados.</li>';
            return;
        }

        movimientos.forEach(m => {
            const esIngreso = m.tipo === 'INGRESO';
            const color = esIngreso ? '#4ade80' : '#f87171';
            const signo = esIngreso ? '+' : '-';
            const usuarioStr = m.usuario ? m.usuario.split('@')[0] : 'Desconocido';

            lista.innerHTML += `
                <li class="historial-item" style="border-left-color: ${color};">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="color:#94a3b8; font-size:0.8rem;">${m.fecha.toLocaleString()}</span>
                        <b style="color:${color};">${signo}$${m.monto.toFixed(2)}</b>
                    </div>
                    <div style="color:#fff; font-size:1rem; margin-bottom: 5px;">${m.descripcion}</div>
                    <div style="color:#cbd5e1; font-size:0.85rem;">${m.detalles}<br><small style="color:#64748b;">Operado por: ${usuarioStr}</small></div>
                </li>`;
        });
    } catch (e) {
        console.error('Error cargando historial general', e);
    }
}
