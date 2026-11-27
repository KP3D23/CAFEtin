/* =========================================================
   MODULO EXCLUSIVO: SISTEMA DE BOLSAS (ROL 'BOLSAS')
   ========================================================= */

let bolsasInventario = [];
let bolsasCarrito = [];
let bolsasProveedores = [];
let bolsasPorCobrarExterno = [];
let bolsasFacturasPendientes = [];
let bolsasTodasFacturas = [];
let bolsasTodosMovimientos = [];
let bolsasCortesHistorial = [];
let bolsasClientesEspeciales = [];

let saldoCajaActualBolsas = 0;
let tasaUsdtActual = 1090;
let tasaBcvActual = 922;
let tarifaActivaBolsas = 'NORMAL';
let vistaGananciasActual = 'cierre';
let bAbonoClienteActual = '';
let bAbonoMaxActual = 0;

/* =========================================================
   1. INICIALIZACION Y NAVEGACION
   ========================================================= */
window.iniciarModuloBolsas = function () {
    mostrarPanelBolsas('b-dashboard');
    cargarTodoBolsas();
};

window.mostrarPanelBolsas = function (panelId) {
    document.querySelectorAll('.b-panel').forEach(function (p) {
        p.style.display = 'none';
    });
    const target = document.getElementById(panelId);
    if (target) {
        target.style.display = 'block';
    }

    document.querySelectorAll('#nav-bolsas .btn-sec').forEach(function (btn) {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('btn-nav-' + panelId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
};

window.cargarTodoBolsas = async function () {
    await cargarConfigCajaBolsas();
    await Promise.all([
        cargarInventarioBolsas(),
        cargarPorCobrarExterno(),
        cargarProveedoresBolsas(),
        cargarDeudoresBolsas(),
        cargarClientesEspeciales()
    ]);
    recalcularCapitalBolsas();
    await cargarCortesInventario();
    await cargarDashboardBolsas();
};

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseNum(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatearMillaresYPaquetes(cantMillares) {
    const m = round2(cantMillares);
    const paq = Math.round(m * 10);
    if (m === 1) return '1 millar (10 paq.)';
    if (m === 0.5) return '1/2 millar (5 paq.)';
    if (m < 1) return m + ' millar (' + paq + ' paq.)';
    return m + ' millares (' + paq + ' paq.)';
}

async function cargarConfigCajaBolsas() {
    try {
        const res = await db.from('bolsas_caja').select('*').eq('id', 1).maybeSingle();
        const caja = res.data;
        if (caja) {
            saldoCajaActualBolsas = parseNum(caja.saldo);
            tasaUsdtActual = parseNum(caja.tasa_usdt) || 1090;
            tasaBcvActual = parseNum(caja.tasa_bcv) || 922;
            const elUsdt = document.getElementById('b-tasa-usdt');
            const elBcv = document.getElementById('b-tasa-bcv');
            if (elUsdt) elUsdt.value = tasaUsdtActual;
            if (elBcv) elBcv.value = tasaBcvActual;
        }
    } catch (e) {
        console.error('Error cargando tasas:', e);
    }
}

/* =========================================================
   2. DASHBOARD SEMANAL, MOVIMIENTOS Y GANANCIAS
   ========================================================= */
window.toggleDrawerBolsas = function () {
    const drawer = document.getElementById('b-dash-drawer');
    if (drawer) drawer.classList.toggle('open');
};

window.cambiarVistaGanancias = function (vista) {
    vistaGananciasActual = vista;
    ['cierre', 'semanal', 'mensual'].forEach(function (v) {
        const btn = document.getElementById('btn-gan-' + v);
        if (btn) {
            btn.style.background = (v === vista) ? '#38bdf8' : '#334155';
            btn.style.color = (v === vista) ? '#0f172a' : '#f8fafc';
        }
    });
    renderGananciasDashboard();
};

async function cargarDashboardBolsas() {
    try {
        const elCaja = document.getElementById('b-dash-caja');
        if (elCaja) elCaja.innerText = saldoCajaActualBolsas.toFixed(2);

        const resultados = await Promise.all([
            db.from('bolsas_facturas').select('*').order('fecha', { ascending: false }),
            db.from('bolsas_movimientos').select('*').order('fecha', { ascending: false })
        ]);

        bolsasTodasFacturas = resultados[0].data || [];
        bolsasTodosMovimientos = resultados[1].data || [];

        const hace7Dias = new Date();
        hace7Dias.setDate(hace7Dias.getDate() - 7);

        let totalVentasSem = 0;
        bolsasTodasFacturas.forEach(function (v) {
            if (new Date(v.fecha) >= hace7Dias) {
                totalVentasSem = round2(totalVentasSem + parseNum(v.total_original));
            }
        });
        const elSemVentas = document.getElementById('b-sem-ventas');
        if (elSemVentas) elSemVentas.innerText = totalVentasSem.toFixed(2);

        let totalComprasSem = 0;
        let totalGastosSem = 0;
        bolsasTodosMovimientos.forEach(function (m) {
            if (new Date(m.fecha) >= hace7Dias) {
                const monto = parseNum(m.monto);
                if (m.tipo === 'COMPRA') totalComprasSem = round2(totalComprasSem + monto);
                if (m.tipo === 'GASTO') totalGastosSem = round2(totalGastosSem + monto);
            }
        });

        const elSemCompras = document.getElementById('b-sem-compras');
        const elSemGastos = document.getElementById('b-sem-gastos');
        if (elSemCompras) elSemCompras.innerText = totalComprasSem.toFixed(2);
        if (elSemGastos) elSemGastos.innerText = totalGastosSem.toFixed(2);

        renderGananciasDashboard();

        const cont = document.getElementById('b-lista-movimientos');
        if (!cont) return;
        cont.innerHTML = '';
        const ultMovs = bolsasTodosMovimientos.slice(0, 25);

        if (ultMovs.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; text-align:center;">Sin movimientos registrados a&uacute;n.</p>';
            return;
        }

        ultMovs.forEach(function (m) {
            const fechaStr = new Date(m.fecha).toLocaleDateString('es-VE');
            let badgeColor = '#f87171';
            let etiqueta = 'GASTO';
            if (m.tipo === 'COMPRA') { badgeColor = '#facc15'; etiqueta = 'COMPRA'; }
            if (m.tipo === 'PAGO_PROVEEDOR') { badgeColor = '#38bdf8'; etiqueta = 'ABONO PROVEEDOR'; }

            cont.innerHTML +=
                '<div class="historial-item" style="border-left-color: ' + badgeColor + '; display:flex; justify-content:space-between; align-items:center; gap:10px;">' +
                    '<div>' +
                        '<small style="color:' + badgeColor + '; font-weight:bold;">' + etiqueta + '</small> &middot; <small style="color:#94a3b8;">' + fechaStr + '</small><br>' +
                        '<strong style="color:#fff;">' + escHtml(m.concepto) + '</strong>' +
                    '</div>' +
                    '<b style="color:#f87171; font-size:1.1rem;">-$' + parseNum(m.monto).toFixed(2) + '</b>' +
                '</div>';
        });
    } catch (e) {
        console.error('Error cargando dashboard bolsas:', e);
    }
}

function renderGananciasDashboard() {
    const ultimoCorte = bolsasCortesHistorial.length > 0 ? bolsasCortesHistorial[0] : null;
    const fechaCorte = ultimoCorte ? new Date(ultimoCorte.fecha) : new Date(0);

    let ganEnCurso = 0;
    let gastosEnCurso = 0;

    bolsasTodasFacturas.forEach(function (f) {
        if (new Date(f.fecha) > fechaCorte) {
            ganEnCurso = round2(ganEnCurso + parseNum(f.ganancia));
        }
    });
    bolsasTodosMovimientos.forEach(function (m) {
        if (m.tipo === 'GASTO' && new Date(m.fecha) > fechaCorte) {
            gastosEnCurso = round2(gastosEnCurso + parseNum(m.monto));
        }
    });

    const netaEnCurso = round2(ganEnCurso - gastosEnCurso);
    const elEnCurso = document.getElementById('b-ganancia-en-curso');
    if (elEnCurso) {
        elEnCurso.innerText = netaEnCurso.toFixed(2);
        elEnCurso.style.color = netaEnCurso >= 0 ? '#4ade80' : '#f87171';
    }

    const cont = document.getElementById('b-lista-ganancias');
    if (!cont) return;
    cont.innerHTML = '';

    if (vistaGananciasActual === 'cierre') {
        if (bolsasCortesHistorial.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">A&uacute;n no has guardado cortes de inventario. Usa "Guardar Corte de Hoy" en Inventario para cerrar per&iacute;odo.</p>';
            return;
        }

        bolsasCortesHistorial.forEach(function (c, idx) {
            const fechaStr = new Date(c.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const ganOp = parseNum(c.ganancia_operativa);
            const varCap = parseNum(c.variacion_capital);
            const esUltimo = (idx === bolsasCortesHistorial.length - 1);
            const colorGan = ganOp >= 0 ? '#4ade80' : '#f87171';
            const signoCap = varCap >= 0 ? '+' : '';
            const detalleCap = esUltimo ? '(Corte inicial)' : ('| Var. Capital: ' + signoCap + '$' + varCap.toFixed(2));

            cont.innerHTML +=
                '<div class="historial-item" style="border-left-color: ' + colorGan + '; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
                    '<div>' +
                        '<strong style="color:#38bdf8;">Cierre ' + fechaStr + '</strong><br>' +
                        '<small style="color:#94a3b8;">Capital al cierre: $' + parseNum(c.capital_total).toFixed(2) + ' ' + detalleCap + '</small>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<small style="color:#94a3b8; display:block;">Ganancia Neta</small>' +
                        '<strong style="font-size:1.15rem; color:' + colorGan + ';">$' + ganOp.toFixed(2) + '</strong>' +
                    '</div>' +
                '</div>';
        });
        return;
    }

    if (vistaGananciasActual === 'semanal') {
        const semanas = {};
        const getClaveSemana = function (fechaIso) {
            const d = new Date(fechaIso);
            const day = d.getDay();
            const diffLunes = d.getDate() - day + (day === 0 ? -6 : 1);
            const lunes = new Date(d.getFullYear(), d.getMonth(), diffLunes);
            const domingo = new Date(lunes);
            domingo.setDate(lunes.getDate() + 6);

            const key = lunes.getFullYear() + '-' + String(lunes.getMonth() + 1).padStart(2, '0') + '-' + String(lunes.getDate()).padStart(2, '0');
            const label = 'Del ' + lunes.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' al ' + domingo.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
            return { key: key, label: label };
        };

        bolsasTodasFacturas.forEach(function (f) {
            const info = getClaveSemana(f.fecha);
            if (!semanas[info.key]) semanas[info.key] = { key: info.key, label: info.label, ventas: 0, ganBruta: 0, gastos: 0 };
            semanas[info.key].ventas = round2(semanas[info.key].ventas + parseNum(f.total_original));
            semanas[info.key].ganBruta = round2(semanas[info.key].ganBruta + parseNum(f.ganancia));
        });

        bolsasTodosMovimientos.forEach(function (m) {
            if (m.tipo === 'GASTO') {
                const info = getClaveSemana(m.fecha);
                if (!semanas[info.key]) semanas[info.key] = { key: info.key, label: info.label, ventas: 0, ganBruta: 0, gastos: 0 };
                semanas[info.key].gastos = round2(semanas[info.key].gastos + parseNum(m.monto));
            }
        });

        const listaSem = Object.values(semanas).sort(function (a, b) { return b.key.localeCompare(a.key); }).slice(0, 12);
        if (listaSem.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">No hay registros semanales a&uacute;n.</p>';
            return;
        }

        listaSem.forEach(function (s) {
            const neta = round2(s.ganBruta - s.gastos);
            const colorNeta = neta >= 0 ? '#4ade80' : '#f87171';
            cont.innerHTML +=
                '<div class="historial-item" style="border-left-color: ' + colorNeta + '; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
                    '<div>' +
                        '<strong style="color:#fff;">Semana ' + s.label + '</strong><br>' +
                        '<small style="color:#94a3b8;">Vendido: $' + s.ventas.toFixed(2) + ' | Gan. Ventas: $' + s.ganBruta.toFixed(2) + ' \vert{} Gastos: -$' + s.gastos.toFixed(2) + '</small>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<small style="color:#94a3b8; display:block;">Ganancia Neta</small>' +
                        '<strong style="font-size:1.15rem; color:' + colorNeta + ';">$' + neta.toFixed(2) + '</strong>' +
                    '</div>' +
                '</div>';
        });
        return;
    }

    if (vistaGananciasActual === 'mensual') {
        const meses = {};
        const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        const getClaveMes = function (fechaIso) {
            const d = new Date(fechaIso);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            const label = nombresMes[d.getMonth()] + ' ' + d.getFullYear();
            return { key: key, label: label };
        };

        bolsasTodasFacturas.forEach(function (f) {
            const info = getClaveMes(f.fecha);
            if (!meses[info.key]) meses[info.key] = { key: info.key, label: info.label, ventas: 0, ganBruta: 0, gastos: 0 };
            meses[info.key].ventas = round2(meses[info.key].ventas + parseNum(f.total_original));
            meses[info.key].ganBruta = round2(meses[info.key].ganBruta + parseNum(f.ganancia));
        });

        bolsasTodosMovimientos.forEach(function (m) {
            if (m.tipo === 'GASTO') {
                const info = getClaveMes(m.fecha);
                if (!meses[info.key]) meses[info.key] = { key: info.key, label: info.label, ventas: 0, ganBruta: 0, gastos: 0 };
                meses[info.key].gastos = round2(meses[info.key].gastos + parseNum(m.monto));
            }
        });

        const listaMes = Object.values(meses).sort(function (a, b) { return b.key.localeCompare(a.key); }).slice(0, 12);
        if (listaMes.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">No hay registros mensuales a&uacute;n.</p>';
            return;
        }

        listaMes.forEach(function (m) {
            const neta = round2(m.ganBruta - m.gastos);
            const colorNeta = neta >= 0 ? '#4ade80' : '#f87171';
            cont.innerHTML +=
                '<div class="historial-item" style="border-left-color: ' + colorNeta + '; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
                    '<div>' +
                        '<strong style="color:#facc15;">' + m.label + '</strong><br>' +
                        '<small style="color:#94a3b8;">Vendido: $' + m.ventas.toFixed(2) + ' | Gan. Ventas: $' + m.ganBruta.toFixed(2) + ' \vert{} Gastos: -$' + m.gastos.toFixed(2) + '</small>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<small style="color:#94a3b8; display:block;">Ganancia Neta</small>' +
                        '<strong style="font-size:1.15rem; color:' + colorNeta + ';">$' + neta.toFixed(2) + '</strong>' +
                    '</div>' +
                '</div>';
        });
    }
}

window.registrarMovimientoBolsas = async function () {
    const tipo = document.getElementById('b-mov-tipo').value;
    const concepto = document.getElementById('b-mov-concepto').value.trim();
    const monto = parseNum(document.getElementById('b-mov-monto').value);

    if (!concepto || monto <= 0) {
        return alert('Ingresa un concepto y un monto v\u00e1lido mayor a 0.');
    }

    try {
        const resCaja = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
        if (resCaja.error) throw resCaja.error;
        const saldoActual = resCaja.data ? parseNum(resCaja.data.saldo) : 0;

        if (monto > saldoActual) {
            if (!confirm('El monto ($' + monto.toFixed(2) + ') es mayor al saldo en caja ($' + saldoActual.toFixed(2) + '). Deseas registrarlo igual?')) {
                return;
            }
        }

        const nuevoSaldo = round2(saldoActual - monto);
        const resUpd
