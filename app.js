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
        navAdmin.style.display = 'flex'; // Habilita la barra de navegación
        mostrarPanel('pos');             // Lo manda a la Venta del Día
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