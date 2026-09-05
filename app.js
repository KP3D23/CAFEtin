// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://rdoecgupwqhzrxfbrbrf.supabase.co';
const supabaseKey = 'sb_publishable_UNxJedkIOD45NhRU1C2ZNA_9ehyLc5C';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// 2. REFERENCIAS DEL HTML
// ==========================================
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const navAdmin = document.getElementById('nav-admin');
const userGreeting = document.getElementById('user-greeting');

// Agrupamos los paneles para encenderlos o apagarlos fácilmente
const panels = {
    pos: document.getElementById('panel-pos'),
    inventario: document.getElementById('panel-inventario'),
    deudores: document.getElementById('panel-deudores'),
    pastor: document.getElementById('panel-pastor')
};

let currentUser = null;
let currentRole = null;

// ==========================================
// 3. AUTENTICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        await cargarApp(session.user);
    } else {
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
        alert('Error al iniciar sesión: ' + error.message);
    }
};

document.getElementById('btn-logout').onclick = async () => {
    await db.auth.signOut();
    location.reload();
};

// ==========================================
// 4. LÓGICA DE ROLES Y SEGURIDAD
// ==========================================
async function cargarApp(user) {
    currentUser = user;
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    
    // Muestra el nombre antes del @
    userGreeting.innerText = `Hola, ${user.email.split('@')[0]}`;

    try {
        const { data: roleData, error } = await db.from('roles')
            .select('rol')
            .eq('user_id', user.id)
            .single();

        if (error || !roleData) {
            alert('Tu usuario no tiene permisos asignados.');
            return;
        }

        currentRole = roleData.rol;
        configurarVistasPorRol();

    } catch (error) {
        console.error('Error cargando rol:', error);
        alert('Error de conexión al verificar permisos.');
    }
}

function configurarVistasPorRol() {
    // Apagamos todo por defecto por seguridad
    Object.values(panels).forEach(p => p.style.display = 'none');
    navAdmin.style.display = 'none';

    if (currentRole === 'ADMIN') {
        navAdmin.style.display = 'flex'; 
        mostrarPanel('pos');             
        cargarInventario();
        cargarPOS();
    } 
    else if (currentRole === 'PASTOR') {
        mostrarPanel('pastor');          
    } 
    else if (currentRole === 'COBRADOR') {
        mostrarPanel('deudores');        
    }
}

window.mostrarPanel = function(panelId) {
    if (currentRole !== 'ADMIN') {
        if (currentRole === 'PASTOR' && panelId !== 'pastor') return;
        if (currentRole === 'COBRADOR' && panelId !== 'deudores') return;
    }

    Object.values(panels).forEach(p => p.style.display = 'none');
    if (panels[panelId]) {
        panels[panelId].style.display = 'block';
    }
};

// ==========================================
// 5. MÓDULO DE INVENTARIO
// ==========================================
let productoEditandoId = null; // Variable para saber qué producto estamos modificando

async function cargarInventario() {
    try {
        const { data, error } = await db.from('inventario').select('*').order('nombre');
        if (error) throw error;

        const lista = document.getElementById('lista-inventario');
        lista.innerHTML = '';
        let totalInvertido = 0;

        data.forEach(prod => {
            totalInvertido += (prod.costo_compra * prod.stock);
            
            const li = document.createElement('li');
            li.style.cssText = "background: #2c2c2c; margin-bottom: 10px; padding: 15px; border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: center;";
            
            li.innerHTML = `
                <div>
                    <strong style="color: #4db8ff; font-size: 1.1rem;">${prod.nombre}</strong> <span style="font-size: 0.9rem; color: #aaa;">(Stock: ${prod.stock})</span><br>
                    <small style="color: #fff;">Costo: $${prod.costo_compra.toFixed(2)} | Venta: $${prod.precio_venta.toFixed(2)}</small>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="editarProducto('${prod.id}', '${prod.nombre}', ${prod.costo_compra}, ${prod.precio_venta}, ${prod.stock})" style="background: #333; color: white; border: 1px solid #444; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">✏️</button>
                    <button onclick="eliminarProducto('${prod.id}')" style="background: #f87171; color: #121212; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">X</button>
                </div>
            `;
            lista.appendChild(li);
        });

        document.getElementById('total-costo-inventario').innerText = totalInvertido.toFixed(2);
    } catch (error) {
        console.error('Error cargando inventario:', error);
    }
}

document.getElementById('btn-guardar-inv').onclick = async () => {
    const nombre = document.getElementById('inv-nombre').value.trim();
    const costo = parseFloat(document.getElementById('inv-costo').value);
    const precio = parseFloat(document.getElementById('inv-precio').value);
    const stock = parseInt(document.getElementById('inv-stock').value);

    if (!nombre || isNaN(costo) || isNaN(precio) || isNaN(stock)) {
        return alert('Por favor, llena todos los campos numéricos.');
    }

    try {
        if (productoEditandoId) {
            await db.from('inventario').update({ nombre, costo_compra: costo, precio_venta: precio, stock }).eq('id', productoEditandoId);
            productoEditandoId = null; 
        } else {
            const { data: existente } = await db.from('inventario').select('id').ilike('nombre', nombre).single();
            if (existente) {
                await db.from('inventario').update({ costo_compra: costo, precio_venta: precio, stock }).eq('id', existente.id);
            } else {
                await db.from('inventario').insert([{ nombre, costo_compra: costo, precio_venta: precio, stock }]);
            }
        }
        
        document.getElementById('inv-nombre').value = '';
        document.getElementById('inv-costo').value = '';
        document.getElementById('inv-precio').value = '';
        document.getElementById('inv-stock').value = '';
        
        const btn = document.getElementById('btn-guardar-inv');
        btn.innerText = "Guardar Producto";
        btn.style.background = "#4db8ff";
        
        cargarInventario();
    } catch (error) {
        alert('Error al guardar producto: ' + error.message);
    }
};

window.editarProducto = function(id, nombre, costo, precio, stock) {
    productoEditandoId = id; 
    document.getElementById('inv-nombre').value = nombre;
    document.getElementById('inv-costo').value = costo;
    document.getElementById('inv-precio').value = precio;
    document.getElementById('inv-stock').value = stock;
    
    const btn = document.getElementById('btn-guardar-inv');
    btn.innerText = "Actualizar Producto";
    btn.style.background = "#facc15"; 
};

window.eliminarProducto = async function(id) {
    if(!confirm('¿Seguro que deseas eliminar este producto del inventario?')) return;
    await db.from('inventario').delete().eq('id', id);
    cargarInventario();
};

// ==========================================
// 6. MÓDULO DE PUNTO DE VENTA (POS)
// ==========================================
let productosPOS = [];

async function cargarPOS() {
    try {
        const { data, error } = await db.from('inventario').select('*').order('nombre');
        if (error) throw error;
        
        productosPOS = data;
        const selectProd = document.getElementById('venta-producto');
        selectProd.innerHTML = '<option value="">-- Selecciona un producto --</option>';
        
        data.forEach(prod => {
            if (prod.stock > 0) {
                selectProd.innerHTML += `<option value="${prod.id}">${prod.nombre} (Disp: ${prod.stock}) - $${prod.precio_venta.toFixed(2)}</option>`;
            }
        });
        actualizarTotalVenta();
    } catch (error) {
        console.error('Error cargando POS:', error);
    }
}

function actualizarTotalVenta() {
    const prodId = document.getElementById('venta-producto').value;
    const cant = parseInt(document.getElementById('venta-cantidad').value) || 0;
    
    if (!prodId) {
        document.getElementById('venta-total').innerText = "0.00";
        return;
    }
    
    const producto = productosPOS.find(p => p.id === prodId);
    if (producto) {
        const total = producto.precio_venta * cant;
        document.getElementById('venta-total').innerText = total.toFixed(2);
    }
}

document.getElementById('venta-producto').addEventListener('change', actualizarTotalVenta);
document.getElementById('venta-cantidad').addEventListener('input', actualizarTotalVenta);

document.getElementById('venta-metodo').addEventListener('change', (e) => {
    document.getElementById('caja-deudor').style.display = (e.target.value === 'CREDITO') ? 'block' : 'none';
});

document.getElementById('btn-procesar-venta').onclick = async () => {
    const prodId = document.getElementById('venta-producto').value;
    const cant = parseInt(document.getElementById('venta-cantidad').value);
    const metodo = document.getElementById('venta-metodo').value;
    const deudorNombre = document.getElementById('venta-deudor').value.trim();
    
    if (!prodId || cant <= 0) return alert('Selecciona un producto y cantidad válida.');
    if (metodo === 'CREDITO' && !deudorNombre) return alert('Ingresa el nombre del deudor.');
    
    const producto = productosPOS.find(p => p.id === prodId);
    if (cant > producto.stock) return alert('No hay suficiente stock disponible.');
    
    const totalVenta = producto.precio_venta * cant;
    const costoTotal = producto.costo_compra * cant;
    const gananciaNeta = totalVenta - costoTotal;
    const porcionPastor = gananciaNeta * 0.25;

    try {
        // 1. Descontar Stock
        await db.from('inventario').update({ stock: producto.stock - cant }).eq('id', prodId);
        
        // 2. Separar el 25% de la ganancia neta para el Pastor
        if (porcionPastor > 0) {
            const { data: fondo } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
            await db.from('cuenta_pastor').update({ saldo_acumulado: parseFloat(fondo.saldo_acumulado) + porcionPastor }).eq('id', 1);
        }

        // 3. Registrar Deuda si es a crédito
        if (metodo === 'CREDITO') {
            const { data: deudorExistente } = await db.from('deudores').select('id, deuda_acumulada').ilike('nombre', deudorNombre).single();
            if (deudorExistente) {
                await db.from('deudores').update({ deuda_acumulada: parseFloat(deudorExistente.deuda_acumulada) + totalVenta }).eq('id', deudorExistente.id);
            } else {
                await db.from('deudores').insert([{ nombre: deudorNombre, deuda_acumulada: totalVenta }]);
            }
        }
        
        alert('✅ Venta procesada con éxito!');
        
        // Resetear Formulario
        document.getElementById('venta-producto').value = '';
        document.getElementById('venta-cantidad').value = '1';
        document.getElementById('venta-deudor').value = '';
        document.getElementById('venta-total').innerText = '0.00';
        document.getElementById('caja-deudor').style.display = 'none';
        document.getElementById('venta-metodo').value = 'CONTADO';
        
        // Recargar las listas
        cargarPOS();
        cargarInventario(); 
        
    } catch (error) {
        alert('Error al procesar la venta: ' + error.message);
    }
};
// ==========================================
// 7. MÓDULO DE DEUDORES
// ==========================================
async function cargarDeudores() {
    try {
        const { data, error } = await db.from('deudores').select('*').order('nombre');
        if (error) throw error;

        const lista = document.getElementById('lista-deudores');
        lista.innerHTML = '';
        let totalCalle = 0;

        if (!data || data.length === 0) {
            lista.innerHTML = '<li style="text-align:center; color:#aaa; padding: 10px;">No hay deudores registrados.</li>';
            document.getElementById('total-deuda-calle').innerText = "0.00";
            return;
        }

        data.forEach(d => {
            const deudaNum = parseFloat(d.deuda_acumulada) || 0;
            totalCalle += deudaNum;

            const li = document.createElement('li');
            li.style.cssText = "background: #2c2c2c; margin-bottom: 10px; padding: 15px; border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: center;";
            
            li.innerHTML = `
                <div>
                    <strong style="color: #f87171; font-size: 1.1rem;">${d.nombre}</strong><br>
                    <span style="color: #fff; font-size: 1rem;">Deuda: <b>$${deudaNum.toFixed(2)}</b></span>
                </div>
                <div>
                    <button onclick="abonarDeuda('${d.id}', '${d.nombre}', ${deudaNum})" style="background: #4ade80; color: #121212; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">Abonar / Pagar</button>
                </div>
            `;
            lista.appendChild(li);
        });

        document.getElementById('total-deuda-calle').innerText = totalCalle.toFixed(2);
    } catch (error) {
        console.error('Error cargando deudores:', error);
    }
}

window.abonarDeuda = async function(id, nombre, deudaActual) {
    const montoStr = prompt(`¿Cuánto va a abonar o pagar ${nombre}?\n(Deuda actual: $${deudaActual.toFixed(2)})`);
    if (!montoStr) return;
    
    const abono = parseFloat(montoStr);
    if (isNaN(abono) || abono <= 0) return alert('Monto inválido.');
    if (abono > deudaActual) return alert('El abono no puede ser mayor que la deuda total.');

    const nuevaDeuda = deudaActual - abono;

    try {
        // Actualizamos la deuda restante
        if (nuevaDeuda <= 0) {
            // Si termina de pagar todo, podemos eliminar el registro o dejarlo en 0
            await db.from('deudores').delete().eq('id', id);
        } else {
            await db.from('deudores').update({ deuda_acumulada: nuevaDeuda }).eq('id', id);
        }

        // Como al vender a crédito el sistema ya apartó la ganancia global, 
        // aquí aseguramos que el flujo se mantenga limpio.
        alert('✅ Abono registrado correctamente.');
        cargarDeudores();
    } catch (error) {
        alert('Error al registrar abono: ' + error.message);
    }
};
// ==========================================
// 8. MÓDULO DE CUENTAS PASTOR
// ==========================================
async function cargarPastor() {
    try {
        const { data, error } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        if (error) throw error;

        const saldo = data ? parseFloat(data.saldo_acumulado) : 0;
        document.getElementById('saldo-pastor').innerText = saldo.toFixed(2);
    } catch (error) {
        console.error('Error cargando cuenta pastor:', error);
    }
}

document.getElementById('btn-abonar-pastor').onclick = async () => {
    try {
        const { data } = await db.from('cuenta_pastor').select('saldo_acumulado').eq('id', 1).single();
        const saldoActual = data ? parseFloat(data.saldo_acumulado) : 0;

        const montoStr = prompt(`¿Cuánto se le va a entregar o abonar al Pastor?\n(Saldo acumulado actual: $${saldoActual.toFixed(2)})`);
        if (!montoStr) return;

        const pago = parseFloat(montoStr);
        if (isNaN(pago) || pago <= 0) return alert('Monto inválido.');
        if (pago > saldoActual) return alert('No puedes pagar más de lo acumulado.');

        const nuevoSaldo = saldoActual - pago;

        await db.from('cuenta_pastor').update({ saldo_acumulado: nuevoSaldo }).eq('id', 1);

        alert('✅ Liquidación registrada con éxito.');
        cargarPastor();
    } catch (error) {
        alert('Error al procesar la liquidación: ' + error.message);
    }
};
