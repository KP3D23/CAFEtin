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
        // 1. Preguntamos a Supabase qué rol tiene este ID
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

    // Encendemos solo lo que corresponde según la base de datos
    if (currentRole === 'ADMIN') {
        navAdmin.style.display = 'flex';
        mostrarPanel('pos');
        cargarInventario(); // <-- Agrega esta línea nueva
    } 
    else if (currentRole === 'PASTOR') {
        mostrarPanel('pastor');          // Lo encierra en la pantalla de Cuentas Pastor
    } 
    else if (currentRole === 'COBRADOR') {
        mostrarPanel('deudores');        // Lo encierra en la pantalla de Deudores
    }
}

// Función global conectada a los botones del menú HTML
window.mostrarPanel = function(panelId) {
    // Si alguien intenta hackear el HTML para ver otra pantalla, el código lo bloquea
    if (currentRole !== 'ADMIN') {
        if (currentRole === 'PASTOR' && panelId !== 'pastor') return;
        if (currentRole === 'COBRADOR' && panelId !== 'deudores') return;
    }

    // Apaga todos los paneles y enciende solo el solicitado
    Object.values(panels).forEach(p => p.style.display = 'none');
    if (panels[panelId]) {
        panels[panelId].style.display = 'block';
    }
};

// ==========================================
// 5. MÓDULO DE INVENTARIO
// ==========================================
async function cargarInventario() {
    try {
        const { data, error } = await db.from('inventario').select('*').order('nombre');
        if (error) throw error;

        const lista = document.getElementById('lista-inventario');
        lista.innerHTML = '';
        let totalInvertido = 0;

        data.forEach(prod => {
            // Multiplica costo por cantidad para saber cuánto dinero tienes invertido
            totalInvertido += (prod.costo_compra * prod.stock);
            
            const li = document.createElement('li');
            li.style.cssText = "background: #2c2c2c; margin-bottom: 10px; padding: 15px; border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: center;";
            li.innerHTML = `
                <div>
                    <strong style="color: #4db8ff; font-size: 1.1rem;">${prod.nombre}</strong> <span style="font-size: 0.9rem; color: #aaa;">(Stock: ${prod.stock})</span><br>
                    <small style="color: #fff;">Costo: $${prod.costo_compra.toFixed(2)} | Venta: $${prod.precio_venta.toFixed(2)}</small>
                </div>
                <button onclick="eliminarProducto('${prod.id}')" style="background: #f87171; color: #121212; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">X</button>
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
        return alert('Por favor, llena todos los campos con números válidos.');
    }

    try {
        // Busca si el producto ya existe para actualizarlo en vez de duplicarlo
        const { data: existente } = await db.from('inventario').select('id').ilike('nombre', nombre).single();
        
        if (existente) {
            await db.from('inventario').update({ costo_compra: costo, precio_venta: precio, stock: stock }).eq('id', existente.id);
        } else {
            await db.from('inventario').insert([{ nombre, costo_compra: costo, precio_venta: precio, stock }]);
        }
        
        // Limpia las casillas
        document.getElementById('inv-nombre').value = '';
        document.getElementById('inv-costo').value = '';
        document.getElementById('inv-precio').value = '';
        document.getElementById('inv-stock').value = '';
        
        cargarInventario();
    } catch (error) {
        alert('Error al guardar producto: ' + error.message);
    }
};

window.eliminarProducto = async function(id) {
    if(!confirm('¿Seguro que deseas eliminar este producto del inventario?')) return;
    await db.from('inventario').delete().eq('id', id);
    cargarInventario();
};
