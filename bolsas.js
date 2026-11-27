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
                        '<small style="color:#94a3b8;">Vendido: $' + s.ventas.toFixed(2) + ' | Gan. Ventas: $' + s.ganBruta.toFixed(2) + ' | Gastos: -$' + s.gastos.toFixed(2) + '</small>' +
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
                        '<small style="color:#94a3b8;">Vendido: $' + m.ventas.toFixed(2) + ' | Gan. Ventas: $' + m.ganBruta.toFixed(2) + ' | Gastos: -$' + m.gastos.toFixed(2) + '</small>' +
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
        const resUpd = await db.from('bolsas_caja').update({ saldo: nuevoSaldo }).eq('id', 1);
        if (resUpd.error) throw resUpd.error;

        const resMov = await db.from('bolsas_movimientos').insert([{ tipo: tipo, concepto: concepto, monto: monto }]);
        if (resMov.error) throw resMov.error;

        if (tipo === 'PAGO_PROVEEDOR') {
            const resProv = await db
                .from('bolsas_proveedores')
                .select('*')
                .ilike('nombre', '%' + concepto + '%')
                .limit(1)
                .maybeSingle();

            if (resProv.data) {
                const nuevaDeudaProv = Math.max(0, round2(parseNum(resProv.data.deuda) - monto));
                await db.from('bolsas_proveedores').update({ deuda: nuevaDeudaProv, updated_at: new Date().toISOString() }).eq('id', resProv.data.id);
            }
        }

        document.getElementById('b-mov-concepto').value = '';
        document.getElementById('b-mov-monto').value = '';
        alert('Movimiento guardado correctamente.');
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error al guardar movimiento: ' + e.message);
    }
};

/* =========================================================
   3. PUNTO DE VENTA (NORMAL / ESPECIAL / DIVISA +5%)
   ========================================================= */
function obtenerPrecioProductoSegunTarifa(prod) {
    if (tarifaActivaBolsas === 'DIVISA') {
        const costoUsdt = parseNum(prod.costo);
        if (costoUsdt > 0) return round2(costoUsdt * 1.05);
        return parseNum(prod.precio_especial) || parseNum(prod.precio_venta);
    }
    if (tarifaActivaBolsas === 'ESPECIAL') {
        const esp = parseNum(prod.precio_especial);
        return esp > 0 ? esp : parseNum(prod.precio_venta);
    }
    return parseNum(prod.precio_venta);
}

window.cambiarTarifaBolsas = function (tarifa) {
    tarifaActivaBolsas = tarifa;

    const btnNorm = document.getElementById('btn-tarifa-normal');
    const btnEsp = document.getElementById('btn-tarifa-especial');
    const btnDiv = document.getElementById('btn-tarifa-divisa');
    const lblTot = document.getElementById('b-pos-total-lbl');

    if (btnNorm && btnEsp && btnDiv) {
        btnNorm.style.background = (tarifa === 'NORMAL') ? '#38bdf8' : '#334155';
        btnNorm.style.color = (tarifa === 'NORMAL') ? '#0f172a' : '#f8fafc';

        btnEsp.style.background = (tarifa === 'ESPECIAL') ? '#facc15' : '#334155';
        btnEsp.style.color = (tarifa === 'ESPECIAL') ? '#0f172a' : '#f8fafc';

        btnDiv.style.background = (tarifa === 'DIVISA') ? '#4ade80' : '#334155';
        btnDiv.style.color = (tarifa === 'DIVISA') ? '#0f172a' : '#f8fafc';
    }

    if (lblTot) {
        lblTot.innerText = (tarifa === 'DIVISA') ? 'TOTAL (DIVISA +5%):' : 'TOTAL (BCV):';
    }

    bolsasCarrito.forEach(function (item) {
        const prod = bolsasInventario.find(function (p) { return p.id === item.id; });
        if (prod) {
            item.precio = obtenerPrecioProductoSegunTarifa(prod);
        }
    });

    filtrarCatalogoBolsas();
    renderCarritoBolsas();
};

window.verificarClienteEspecialAuto = function (nombreEscrito) {
    const limpio = (nombreEscrito || '').trim().toLowerCase();
    if (!limpio) return;

    if (limpio === 'carlos alberto') {
        if (tarifaActivaBolsas !== 'DIVISA') cambiarTarifaBolsas('DIVISA');
        return;
    }

    const esEspecial = bolsasClientesEspeciales.some(function (c) {
        return c.nombre.trim().toLowerCase() === limpio;
    });
    if (esEspecial && tarifaActivaBolsas === 'NORMAL') {
        cambiarTarifaBolsas('ESPECIAL');
    }
};

function renderCatalogoBolsas(lista) {
    const cont = document.getElementById('b-pos-catalogo');
    if (!cont) return;
    cont.innerHTML = '';

    const disponibles = (lista || []).filter(function (p) {
        return parseNum(p.cantidad) > 0;
    });

    if (disponibles.length === 0) {
        cont.innerHTML = '<p style="color:#94a3b8; grid-column:1/-1; text-align:center; padding:20px;">No hay bolsas con existencia. Agr&eacute;galas en Inventario.</p>';
        return;
    }

    let colorPrecio = '#4ade80';
    if (tarifaActivaBolsas === 'ESPECIAL') colorPrecio = '#facc15';
    if (tarifaActivaBolsas === 'DIVISA') colorPrecio = '#38bdf8';

    let categoriaActual = '';

    disponibles.forEach(function (p) {
        const cat = p.categoria || 'GENERAL';
        if (cat !== categoriaActual) {
            categoriaActual = cat;
            const divCat = document.createElement('div');
            divCat.className = 'pos-cat-divider';
            divCat.innerText = cat;
            cont.appendChild(divCat);
        }

        const precioMostrar = obtenerPrecioProductoSegunTarifa(p);
        const tile = document.createElement('div');
        tile.className = 'prod-tile';
        tile.innerHTML =
            '<div class="p-name">' + escHtml(p.nombre) + '</div>' +
            '<div>' +
                '<div class="p-price" style="color:' + colorPrecio + ';">$' + precioMostrar.toFixed(2) + '</div>' +
                '<div class="p-stock">Hay: ' + parseNum(p.cantidad) + ' M</div>' +
            '</div>';
        tile.onclick = function () {
            agregarAlCarritoBolsas(p.id);
        };
        cont.appendChild(tile);
    });
}

window.filtrarCatalogoBolsas = function () {
    const inputBuscar = document.getElementById('b-pos-buscar');
    const q = (inputBuscar ? inputBuscar.value : '').toLowerCase();
    const filtrados = bolsasInventario.filter(function (p) {
        return p.nombre.toLowerCase().includes(q);
    });
    renderCatalogoBolsas(filtrados);
};

function agregarAlCarritoBolsas(id) {
    const prod = bolsasInventario.find(function (p) { return p.id === id; });
    if (!prod) return;

    const stockMax = parseNum(prod.cantidad);
    const existente = bolsasCarrito.find(function (item) { return item.id === id; });
    const precioActual = obtenerPrecioProductoSegunTarifa(prod);

    if (existente) {
        const paso = (existente.cantidad + 1 <= stockMax) ? 1 : 0.1;
        if (round2(existente.cantidad + paso) > stockMax) {
            return alert('Solo quedan ' + stockMax + ' millares de "' + prod.nombre + '".');
        }
        existente.cantidad = round2(existente.cantidad + paso);
        existente.precio = precioActual;
    } else {
        if (stockMax <= 0) return alert('Producto agotado.');
        const inicial = stockMax >= 1 ? 1 : (stockMax >= 0.5 ? 0.5 : stockMax);
        bolsasCarrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: precioActual,
            costo: parseNum(prod.costo),
            stock: stockMax,
            cantidad: inicial
        });
    }
    renderCarritoBolsas();
}

window.sumarUnidadBolsas = function (index, delta) {
    const item = bolsasCarrito[index];
    if (!item) return;

    const nueva = round2(item.cantidad + delta);
    if (nueva <= 0) {
        bolsasCarrito.splice(index, 1);
    } else if (nueva > item.stock) {
        return alert('Solo hay ' + item.stock + ' millares disponibles de ' + item.nombre + '.');
    } else {
        item.cantidad = nueva;
    }
    renderCarritoBolsas();
};

window.editarCantManualBolsas = function (index, valor) {
    const item = bolsasCarrito[index];
    if (!item) return;

    const nueva = round2(parseNum(valor));
    if (nueva <= 0) {
        bolsasCarrito.splice(index, 1);
    } else if (nueva > item.stock) {
        alert('Solo hay ' + item.stock + ' millares disponibles.');
        item.cantidad = item.stock;
    } else {
        item.cantidad = nueva;
    }
    renderCarritoBolsas();
};

function renderCarritoBolsas() {
    const cont = document.getElementById('b-pos-carrito');
    const totalEl = document.getElementById('b-pos-total');
    if (!cont || !totalEl) return;

    if (bolsasCarrito.length === 0) {
        cont.innerHTML = '<p style="color: #64748b; text-align: center; padding: 15px;">Toca un producto para empezar</p>';
        totalEl.innerText = '0.00';
        return;
    }

    cont.innerHTML = '';
    let total = 0;

    bolsasCarrito.forEach(function (item, idx) {
        const sub = round2(item.precio * item.cantidad);
        total = round2(total + sub);
        const equivTexto = formatearMillaresYPaquetes(item.cantidad);

        cont.innerHTML +=
            '<div class="cart-row">' +
                '<div class="cart-row-top">' +
                    '<div>' +
                        '<strong style="color:#38bdf8; font-size:1rem;">' + escHtml(item.nombre) + '</strong>' +
                        '<small style="display:block; color:#94a3b8;">' + equivTexto + ' &times; $' + item.precio.toFixed(2) + '</small>' +
                    '</div>' +
                    '<strong style="color:#4ade80; font-size:1.15rem;">$' + sub.toFixed(2) + '</strong>' +
                '</div>' +
                '<div class="cart-row-controls">' +
                    '<div class="qty-pill-group">' +
                        '<button class="qty-pill qty-pill-minus" onclick="sumarUnidadBolsas(' + idx + ', -0.1)">-Paq</button>' +
                        '<button class="qty-pill" onclick="sumarUnidadBolsas(' + idx + ', 0.1)">+1 Paq</button>' +
                        '<button class="qty-pill" onclick="sumarUnidadBolsas(' + idx + ', 0.5)">+1/2 M</button>' +
                        '<button class="qty-pill" onclick="sumarUnidadBolsas(' + idx + ', 1)">+1 M</button>' +
                    '</div>' +
                    '<input type="number" step="0.1" value="' + item.cantidad + '" onchange="editarCantManualBolsas(' + idx + ', this.value)" style="width:64px; text-align:center; margin-bottom:0; padding:6px; font-weight:bold; font-size:0.95rem;">' +
                '</div>' +
            '</div>';
    });

    totalEl.innerText = total.toFixed(2);
}

window.toggleRefPosBolsas = function () {
    const metodo = document.getElementById('b-pos-metodo').value;
    const box = document.getElementById('b-pos-ref-box');
    if (box) {
        box.style.display = (metodo === 'CONTADO') ? 'block' : 'none';
    }
};

window.procesarVentaBolsas = async function () {
    if (bolsasCarrito.length === 0) {
        return alert('Agrega al menos un producto al pedido.');
    }

    const metodo = document.getElementById('b-pos-metodo').value;
    let cliente = document.getElementById('b-pos-cliente').value.trim();
    const bsRef = parseNum(document.getElementById('b-pos-bs').value);
    const notaRef = document.getElementById('b-pos-nota').value.trim();

    if (metodo === 'CREDITO' && !cliente) {
        return alert('Para ventas a cr\u00e9dito debes escribir el nombre del cliente.');
    }
    if (!cliente) cliente = 'Cliente General';

    let totalVenta = 0;
    let totalGananciaUsdt = 0;
    const resumenProductos = [];
    const ratioBcvAUsdt = (tasaUsdtActual > 0) ? (tasaBcvActual / tasaUsdtActual) : 1;

    try {
        for (let i = 0; i < bolsasCarrito.length; i++) {
            const item = bolsasCarrito[i];
            const sub = round2(item.precio * item.cantidad);
            const costoSubUsdt = item.costo * item.cantidad;
            const ventaEquivUsdt = (tarifaActivaBolsas === 'DIVISA') ? sub : (sub * ratioBcvAUsdt);

            totalVenta = round2(totalVenta + sub);
            totalGananciaUsdt = round2(totalGananciaUsdt + (ventaEquivUsdt - costoSubUsdt));

            const paq = Math.round(item.cantidad * 10);
            resumenProductos.push(item.cantidad + 'M (' + paq + 'p) ' + item.nombre);

            const resProd = await db
                .from('bolsas_inventario')
                .select('cantidad')
                .eq('id', item.id)
                .single();

            if (resProd.data) {
                const nuevaCant = Math.max(0, round2(parseNum(resProd.data.cantidad) - item.cantidad));
                await db
                    .from('bolsas_inventario')
                    .update({ cantidad: nuevaCant, updated_at: new Date().toISOString() })
                    .eq('id', item.id);
            }
        }

        const esCredito = (metodo === 'CREDITO');
        let etiquetaTarifa = '';
        if (tarifaActivaBolsas === 'ESPECIAL') etiquetaTarifa = ' [Esp.]';
        if (tarifaActivaBolsas === 'DIVISA') etiquetaTarifa = ' [Divisa +5%]';

        const resFac = await db.from('bolsas_facturas').insert([{
            cliente: cliente,
            productos: resumenProductos.join(', ') + etiquetaTarifa,
            total_original: totalVenta,
            saldo_pendiente: esCredito ? totalVenta : 0,
            ganancia: totalGananciaUsdt,
            metodo_pago: metodo,
            monto_bs_ref: bsRef,
            nota_ref: notaRef || null,
            pagada: !esCredito
        }]);
        if (resFac.error) throw resFac.error;

        if (!esCredito) {
            const resCaja = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
            const saldoActual = resCaja.data ? parseNum(resCaja.data.saldo) : 0;
            await db.from('bolsas_caja').update({ saldo: round2(saldoActual + totalVenta) }).eq('id', 1);
        }

        alert(esCredito
            ? ('Factura a cr\u00e9dito cargada a ' + cliente + ' por $' + totalVenta.toFixed(2) + '.')
            : ('Venta cobrada por $' + totalVenta.toFixed(2) + ' y sumada a Caja.')
        );

        bolsasCarrito = [];
        cambiarTarifaBolsas('NORMAL');
        document.getElementById('b-pos-cliente').value = '';
        document.getElementById('b-pos-bs').value = '';
        document.getElementById('b-pos-nota').value = '';

        await cargarTodoBolsas();
    } catch (e) {
        alert('Error al guardar la venta: ' + e.message);
    }
};

/* =========================================================
   4. INVENTARIO (ORDEN EXCEL) + POR COBRAR + POR PAGAR
   ========================================================= */
window.actualizarTasasYPrecios = async function () {
    const nuevaUsdt = parseNum(document.getElementById('b-tasa-usdt').value);
    const nuevaBcv = parseNum(document.getElementById('b-tasa-bcv').value);

    if (nuevaUsdt <= 0 || nuevaBcv <= 0) {
        return alert('Ingresa tasas v\u00e1lidas mayores a 0.');
    }

    if (!confirm('Actualizar tasas a USDT=' + nuevaUsdt + ' / BCV=' + nuevaBcv + ' y recalcular todos los precios de venta?')) {
        return;
    }

    try {
        const resCaja = await db.from('bolsas_caja').update({
            tasa_usdt: nuevaUsdt,
            tasa_bcv: nuevaBcv
        }).eq('id', 1);
        if (resCaja.error) throw resCaja.error;

        const ratio = nuevaUsdt / nuevaBcv;

        for (let i = 0; i < bolsasInventario.length; i++) {
            const p = bolsasInventario[i];
            const costoUsdt = parseNum(p.costo);
            if (costoUsdt <= 0) continue;
            const costoBcv = costoUsdt * ratio;
            const nuevoNormal = round2(costoBcv * 2);
            const nuevoEspecial = round2(costoBcv * 1.65);

            await db.from('bolsas_inventario').update({
                precio_venta: nuevoNormal,
                precio_especial: nuevoEspecial,
                updated_at: new Date().toISOString()
            }).eq('id', p.id);
        }

        alert('Tasas y precios actualizados correctamente.');
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error actualizando tasas: ' + e.message);
    }
};

async function cargarInventarioBolsas() {
    try {
        const res = await db
            .from('bolsas_inventario')
            .select('*')
            .order('orden', { ascending: true })
            .order('nombre', { ascending: true });

        bolsasInventario = res.data || [];
        renderTablaInventarioBolsas();
        renderCatalogoBolsas(bolsasInventario);
    } catch (e) {
        console.error('Error cargando inventario bolsas:', e);
    }
}

function renderTablaInventarioBolsas() {
    const tbody = document.getElementById('b-tabla-inventario');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (bolsasInventario.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:16px;">No hay productos. Presiona "+ Producto".</td></tr>';
        return;
    }

    let catActual = '';

    bolsasInventario.forEach(function (p) {
        const cat = p.categoria || 'GENERAL';
        if (cat !== catActual) {
            catActual = cat;
            const trCat = document.createElement('tr');
            trCat.className = 'inv-cat-row';
            trCat.innerHTML = '<td colspan="7">' + escHtml(cat) + '</td>';
            tbody.appendChild(trCat);
        }

        const costo = parseNum(p.costo);
        const venta = parseNum(p.precio_venta);
        const especial = parseNum(p.precio_especial);
        const cant = parseNum(p.cantidad);
        const total = round2(costo * cant);

        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.innerHTML =
            '<td><input type="text" class="inv-edit-nombre" value="' + escHtml(p.nombre) + '"></td>' +
            '<td><input type="number" step="0.01" class="inv-edit-costo" value="' + costo + '" oninput="recalcularFilaInventario(this)"></td>' +
            '<td><input type="number" step="0.01" class="inv-edit-venta" value="' + venta + '"></td>' +
            '<td><input type="number" step="0.01" class="inv-edit-especial" value="' + especial + '"></td>' +
            '<td><input type="number" step="0.1" class="inv-edit-cant" value="' + cant + '" oninput="recalcularFilaInventario(this)"></td>' +
            '<td><strong class="inv-row-total" style="color:#38bdf8;">$' + total.toFixed(2) + '</strong></td>' +
            '<td style="white-space:nowrap;">' +
                '<button class="btn-save-row" style="background:#4ade80; color:#0f172a; padding:7px 9px; margin-right:3px;" title="Guardar">OK</button>' +
                '<button class="btn-del-row" style="background:#ef4444; color:#fff; padding:7px 9px;" title="Eliminar">X</button>' +
            '</td>';

        tr.querySelector('.btn-save-row').onclick = function () {
            guardarFilaInventario(p.id, this);
        };
        tr.querySelector('.btn-del-row').onclick = function () {
            eliminarFilaInventario(p.id, p.nombre);
        };

        tbody.appendChild(tr);
    });
}

window.recalcularFilaInventario = function (inputEl) {
    const tr = inputEl.closest('tr');
    if (!tr) return;
    const costo = parseNum(tr.querySelector('.inv-edit-costo').value);
    const cant = parseNum(tr.querySelector('.inv-edit-cant').value);
    const total = round2(costo * cant);
    tr.querySelector('.inv-row-total').innerText = '$' + total.toFixed(2);
    recalcularCapitalBolsas(true);
};

window.agregarFilaInventarioBolsas = async function () {
    const nombre = prompt('Nombre de la bolsa / producto:');
    if (!nombre || !nombre.trim()) return;

    const costo = parseNum(prompt('Costo por millar en USDT ($):', '0'));
    const ratio = (tasaBcvActual > 0) ? (tasaUsdtActual / tasaBcvActual) : 1;
    const ventaSugerida = round2(costo * ratio * 2);
    const espSugerida = round2(costo * ratio * 1.65);

    const venta = parseNum(prompt('Precio Normal por millar BCV ($):', ventaSugerida.toFixed(2)));
    const especial = parseNum(prompt('Precio Especial por millar BCV ($):', espSugerida.toFixed(2)));
    const cantidad = parseNum(prompt('Existencia en millares (ej. 10.5):', '0'));
    const maxOrden = bolsasInventario.reduce(function (m, p) {
        return Math.max(m, parseInt(p.orden) || 0);
    }, 0);

    try {
        const res = await db.from('bolsas_inventario').insert([{
            orden: maxOrden + 1,
            categoria: 'ASEO, PAPEL Y VARIOS',
            nombre: nombre.trim(),
            costo: costo,
            precio_venta: venta,
            precio_especial: especial,
            cantidad: cantidad
        }]);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error agregando producto: ' + e.message);
    }
};

window.guardarFilaInventario = async function (id, btnEl) {
    const tr = btnEl.closest('tr');
    const nombre = tr.querySelector('.inv-edit-nombre').value.trim();
    const costo = parseNum(tr.querySelector('.inv-edit-costo').value);
    const precio_venta = parseNum(tr.querySelector('.inv-edit-venta').value);
    const precio_especial = parseNum(tr.querySelector('.inv-edit-especial').value);
    const cantidad = parseNum(tr.querySelector('.inv-edit-cant').value);

    if (!nombre) return alert('El nombre no puede quedar vac\u00edo.');

    try {
        const res = await db.from('bolsas_inventario').update({
            nombre: nombre,
            costo: costo,
            precio_venta: precio_venta,
            precio_especial: precio_especial,
            cantidad: cantidad,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        if (res.error) throw res.error;

        btnEl.innerText = 'Listo';
        setTimeout(function () { btnEl.innerText = 'OK'; }, 1200);
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error guardando fila: ' + e.message);
    }
};

window.eliminarFilaInventario = async function (id, nombre) {
    if (!confirm('Eliminar "' + nombre + '" del inventario?')) return;
    try {
        const res = await db.from('bolsas_inventario').delete().eq('id', id);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error eliminando producto: ' + e.message);
    }
};

/* Cuadro POR COBRAR externo */
async function cargarPorCobrarExterno() {
    try {
        const res = await db.from('bolsas_por_cobrar').select('*').order('concepto');
        if (res.error) throw res.error;
        bolsasPorCobrarExterno = res.data || [];
        renderPorCobrarExterno();
    } catch (e) {
        console.error('Error cargando por cobrar externo:', e.message);
        bolsasPorCobrarExterno = [];
        renderPorCobrarExterno();
    }
}

function renderPorCobrarExterno() {
    const cont = document.getElementById('b-lista-por-cobrar');
    if (!cont) return;
    cont.innerHTML = '';

    bolsasPorCobrarExterno.forEach(function (item) {
        const monto = parseNum(item.monto);
        const row = document.createElement('div');
        row.className = 'side-ledger-row';
        row.innerHTML =
            '<div><strong style="color:#fff;">' + escHtml(item.concepto) + '</strong></div>' +
            '<div style="display:flex; align-items:center; gap:6px;">' +
                '<b style="color:#4ade80;">$' + monto.toFixed(2) + '</b>' +
                '<button class="btn-edit-pc" style="background:#334155; color:#fff; padding:5px 8px; font-size:0.82rem;">Edit</button>' +
                '<button class="btn-del-pc" style="background:#ef4444; color:#fff; padding:5px 8px; font-size:0.82rem;">X</button>' +
            '</div>';

        row.querySelector('.btn-edit-pc').onclick = function () {
            editarPorCobrarExterno(item.id, item.concepto, monto);
        };
        row.querySelector('.btn-del-pc').onclick = function () {
            eliminarPorCobrarExterno(item.id);
        };
        cont.appendChild(row);
    });
}

window.agregarPorCobrarExterno = async function () {
    const concepto = document.getElementById('b-pc-concepto').value.trim();
    const montoRaw = document.getElementById('b-pc-monto').value;
    const monto = parseNum(montoRaw);

    if (!concepto || montoRaw === '' || monto < 0) {
        return alert('Escribe el concepto y un monto v\u00e1lido.');
    }

    try {
        const res = await db.from('bolsas_por_cobrar').insert([{ concepto: concepto, monto: monto }]);
        if (res.error) throw res.error;

        document.getElementById('b-pc-concepto').value = '';
        document.getElementById('b-pc-monto').value = '';
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error agregando cuenta por cobrar: ' + e.message);
    }
};

window.editarPorCobrarExterno = async function (id, concepto, montoActual) {
    const nuevoVal = prompt('Actualizar monto por cobrar (' + concepto + '):', montoActual.toFixed(2));
    if (nuevoVal === null) return;
    const nuevoMonto = Math.max(0, parseNum(nuevoVal));

    try {
        const res = await db.from('bolsas_por_cobrar').update({
            monto: nuevoMonto,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error actualizando monto: ' + e.message);
    }
};

window.eliminarPorCobrarExterno = async function (id) {
    if (!confirm('Eliminar esta cuenta por cobrar externa?')) return;
    try {
        const res = await db.from('bolsas_por_cobrar').delete().eq('id', id);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error eliminando cuenta: ' + e.message);
    }
};

/* Cuadro POR PAGAR (Proveedores) */
async function cargarProveedoresBolsas() {
    try {
        const res = await db.from('bolsas_proveedores').select('*').order('nombre');
        if (res.error) throw res.error;
        bolsasProveedores = res.data || [];
        renderProveedoresBolsas();
    } catch (e) {
        console.error('Error cargando proveedores:', e.message);
    }
}

function renderProveedoresBolsas() {
    const cont = document.getElementById('b-lista-proveedores');
    if (!cont) return;
    cont.innerHTML = '';

    if (bolsasProveedores.length === 0) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:0.88rem;">Sin cuentas por pagar.</p>';
        return;
    }

    bolsasProveedores.forEach(function (p) {
        const deuda = parseNum(p.deuda);
        const row = document.createElement('div');
        row.className = 'side-ledger-row';
        row.innerHTML =
            '<div><strong style="color:#fff;">' + escHtml(p.nombre) + '</strong></div>' +
            '<div style="display:flex; align-items:center; gap:6px;">' +
                '<b style="color:#f87171;">$' + deuda.toFixed(2) + '</b>' +
                '<button class="btn-edit-prov" style="background:#334155; color:#fff; padding:5px 8px; font-size:0.82rem;">Edit</button>' +
                '<button class="btn-del-prov" style="background:#ef4444; color:#fff; padding:5px 8px; font-size:0.82rem;">X</button>' +
            '</div>';

        row.querySelector('.btn-edit-prov').onclick = function () {
            editarDeudaProveedor(p.id, p.nombre, deuda);
        };
        row.querySelector('.btn-del-prov').onclick = function () {
            eliminarProveedorBolsas(p.id, p.nombre);
        };
        cont.appendChild(row);
    });
}

window.guardarProveedorBolsas = async function () {
    const nombre = document.getElementById('b-prov-nombre').value.trim();
    const montoRaw = document.getElementById('b-prov-monto').value;
    const monto = parseNum(montoRaw);

    if (!nombre || montoRaw === '' || monto < 0) return alert('Escribe el nombre del proveedor y el monto.');

    try {
        const resExt = await db.from('bolsas_proveedores').select('*').ilike('nombre', nombre).maybeSingle();
        if (resExt.data) {
            const res = await db.from('bolsas_proveedores').update({
                deuda: round2(parseNum(resExt.data.deuda) + monto),
                updated_at: new Date().toISOString()
            }).eq('id', resExt.data.id);
            if (res.error) throw res.error;
        } else {
            const res = await db.from('bolsas_proveedores').insert([{ nombre: nombre, deuda: monto }]);
            if (res.error) throw res.error;
        }

        document.getElementById('b-prov-nombre').value = '';
        document.getElementById('b-prov-monto').value = '';
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error guardando proveedor: ' + e.message);
    }
};

window.editarDeudaProveedor = async function (id, nombre, deudaActual) {
    const nuevoVal = prompt('Actualizar deuda con ' + nombre + ' ($):', deudaActual.toFixed(2));
    if (nuevoVal === null) return;
    const nuevaDeuda = Math.max(0, parseNum(nuevoVal));

    try {
        const res = await db.from('bolsas_proveedores').update({
            deuda: nuevaDeuda,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error actualizando proveedor: ' + e.message);
    }
};

window.eliminarProveedorBolsas = async function (id, nombre) {
    if (!confirm('Eliminar al proveedor "' + nombre + '"?')) return;
    try {
        const res = await db.from('bolsas_proveedores').delete().eq('id', id);
        if (res.error) throw res.error;
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error eliminando proveedor: ' + e.message);
    }
};

/* Clientes Especiales */
async function cargarClientesEspeciales() {
    try {
        const res = await db.from('bolsas_clientes_especiales').select('*').order('nombre');
        bolsasClientesEspeciales = res.data || [];

        const dl = document.getElementById('lista-clientes-especiales-dl');
        const cont = document.getElementById('b-lista-clientes-especiales');
        if (dl) dl.innerHTML = '';
        if (cont) cont.innerHTML = '';

        bolsasClientesEspeciales.forEach(function (c) {
            if (dl) {
                const opt = document.createElement('option');
                opt.value = c.nombre;
                dl.appendChild(opt);
            }
            if (cont) {
                const badge = document.createElement('span');
                badge.style.cssText = 'background:#0f172a; border:1px solid #facc15; color:#facc15; padding:5px 10px; border-radius:20px; display:inline-flex; align-items:center; gap:6px; font-size:0.85rem;';
                badge.innerHTML = escHtml(c.nombre) + ' <button style="background:none; color:#f87171; padding:0; font-size:0.9rem;">X</button>';
                badge.querySelector('button').onclick = function () {
                    eliminarClienteEspecial(c.id);
                };
                cont.appendChild(badge);
            }
        });
    } catch (e) {
        console.error('Error cargando clientes especiales:', e);
    }
}

window.agregarClienteEspecial = async function () {
    const nombre = document.getElementById('b-esp-cliente-nombre').value.trim();
    if (!nombre) return alert('Escribe el nombre del cliente.');

    try {
        const res = await db.from('bolsas_clientes_especiales').insert([{ nombre: nombre }]);
        if (res.error) throw res.error;
        document.getElementById('b-esp-cliente-nombre').value = '';
        await cargarClientesEspeciales();
    } catch (e) {
        alert('Error agregando cliente especial: ' + e.message);
    }
};

window.eliminarClienteEspecial = async function (id) {
    try {
        const res = await db.from('bolsas_clientes_especiales').delete().eq('id', id);
        if (res.error) throw res.error;
        await cargarClientesEspeciales();
    } catch (e) {
        alert('Error eliminando cliente especial: ' + e.message);
    }
};

/* Calculo de Capital Total (Inventario + Caja + Por Cobrar - Por Pagar) */
function recalcularCapitalBolsas(desdeInputs) {
    let totalInv = 0;

    if (desdeInputs) {
        document.querySelectorAll('#b-tabla-inventario tr[data-id]').forEach(function (tr) {
            const c = parseNum(tr.querySelector('.inv-edit-costo').value);
            const q = parseNum(tr.querySelector('.inv-edit-cant').value);
            totalInv = round2(totalInv + (c * q));
        });
    } else {
        bolsasInventario.forEach(function (p) {
            totalInv = round2(totalInv + (parseNum(p.costo) * parseNum(p.cantidad)));
        });
    }

    let totalFacturasClientes = 0;
    bolsasFacturasPendientes.forEach(function (f) {
        totalFacturasClientes = round2(totalFacturasClientes + parseNum(f.saldo_pendiente));
    });

    let totalExternos = 0;
    bolsasPorCobrarExterno.forEach(function (pc) {
        totalExternos = round2(totalExternos + parseNum(pc.monto));
    });

    const totalPorCobrar = round2(totalFacturasClientes + totalExternos);

    let totalPorPagar = 0;
    bolsasProveedores.forEach(function (pr) {
        totalPorPagar = round2(totalPorPagar + parseNum(pr.deuda));
    });

    const capital = round2(totalInv + saldoCajaActualBolsas + totalPorCobrar - totalPorPagar);

    const elInv = document.getElementById('b-cap-inv');
    const elCaja = document.getElementById('b-cap-caja');
    const elMeDeben = document.getElementById('b-cap-medeben');
    const elDebo = document.getElementById('b-cap-debo');
    const elTotal = document.getElementById('b-cap-total');

    if (elInv) elInv.innerText = totalInv.toFixed(2);
    if (elCaja) elCaja.innerText = saldoCajaActualBolsas.toFixed(2);
    if (elMeDeben) elMeDeben.innerText = totalPorCobrar.toFixed(2);
    if (elDebo) elDebo.innerText = totalPorPagar.toFixed(2);
    if (elTotal) elTotal.innerText = capital.toFixed(2);

    const elFacClientes = document.getElementById('b-facturas-clientes-total');
    const elBoxPcTotal = document.getElementById('b-box-porcobrar-total');
    const elBoxPpTotal = document.getElementById('b-box-porpagar-total');

    if (elFacClientes) elFacClientes.innerText = totalFacturasClientes.toFixed(2);
    if (elBoxPcTotal) elBoxPcTotal.innerText = totalPorCobrar.toFixed(2);
    if (elBoxPpTotal) elBoxPpTotal.innerText = totalPorPagar.toFixed(2);

    return { totalInv: totalInv, totalMeDeben: totalPorCobrar, totalDebo: totalPorPagar, capital: capital };
}

window.guardarCorteInventario = async function () {
    if (!confirm('Guardar una copia hist\u00f3rica del inventario y calcular la ganancia de este cierre?')) return;

    const filas = document.querySelectorAll('#b-tabla-inventario tr[data-id]');
    const detalleSnapshot = [];

    try {
        for (let i = 0; i < filas.length; i++) {
            const tr = filas[i];
            const id = tr.dataset.id;
            const nombre = tr.querySelector('.inv-edit-nombre').value.trim();
            const costo = parseNum(tr.querySelector('.inv-edit-costo').value);
            const precio_venta = parseNum(tr.querySelector('.inv-edit-venta').value);
            const precio_especial = parseNum(tr.querySelector('.inv-edit-especial').value);
            const cantidad = parseNum(tr.querySelector('.inv-edit-cant').value);

            await db.from('bolsas_inventario').update({
                nombre: nombre,
                costo: costo,
                precio_venta: precio_venta,
                precio_especial: precio_especial,
                cantidad: cantidad,
                updated_at: new Date().toISOString()
            }).eq('id', id);

            detalleSnapshot.push({
                nombre: nombre,
                costo: costo,
                precio_venta: precio_venta,
                precio_especial: precio_especial,
                cantidad: cantidad,
                total: round2(costo * cantidad)
            });
        }

        await cargarInventarioBolsas();
        const capInfo = recalcularCapitalBolsas(false);

        const resUlt = await db
            .from('bolsas_inventario_historial')
            .select('fecha, capital_total')
            .order('fecha', { ascending: false })
            .limit(1)
            .maybeSingle();

        const ultimoCorte = resUlt.data;
        let queryFacturas = db.from('bolsas_facturas').select('ganancia');
        let queryGastos = db.from('bolsas_movimientos').select('monto').eq('tipo', 'GASTO');

        if (ultimoCorte) {
            queryFacturas = queryFacturas.gt('fecha', ultimoCorte.fecha);
            queryGastos = queryGastos.gt('fecha', ultimoCorte.fecha);
        }

        const resPeriodo = await Promise.all([queryFacturas, queryGastos]);
        const facsPeriodo = resPeriodo[0].data || [];
        const gastosPeriodo = resPeriodo[1].data || [];

        let ganVentas = 0;
        facsPeriodo.forEach(function (f) { ganVentas = round2(ganVentas + parseNum(f.ganancia)); });

        let gastosTotal = 0;
        gastosPeriodo.forEach(function (g) { gastosTotal = round2(gastosTotal + parseNum(g.monto)); });

        const gananciaOperativa = round2(ganVentas - gastosTotal);
        const variacionCapital = ultimoCorte ? round2(capInfo.capital - parseNum(ultimoCorte.capital_total)) : 0;

        const resCorte = await db.from('bolsas_inventario_historial').insert([{
            total_inventario: capInfo.totalInv,
            total_me_deben: capInfo.totalMeDeben,
            total_debo: capInfo.totalDebo,
            capital_total: capInfo.capital,
            ganancia_operativa: gananciaOperativa,
            variacion_capital: variacionCapital,
            detalle_json: detalleSnapshot
        }]);
        if (resCorte.error) throw resCorte.error;

        alert('Corte guardado.\nGanancia neta del per\u00edodo: $' + gananciaOperativa.toFixed(2));
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error guardando corte: ' + e.message);
    }
};

async function cargarCortesInventario() {
    try {
        const res = await db
            .from('bolsas_inventario_historial')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(20);

        bolsasCortesHistorial = res.data || [];
        const cont = document.getElementById('b-lista-cortes');
        if (!cont) return;
        cont.innerHTML = '';

        if (bolsasCortesHistorial.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">A&uacute;n no has guardado cortes anteriores.</p>';
            return;
        }

        bolsasCortesHistorial.forEach(function (corte, idx) {
            const fechaStr = new Date(corte.fecha).toLocaleString('es-VE');
            const items = Array.isArray(corte.detalle_json) ? corte.detalle_json : [];
            const ganOp = parseNum(corte.ganancia_operativa);
            const colorGan = ganOp >= 0 ? '#4ade80' : '#f87171';

            let filasHtml = items.map(function (it) {
                return '<div class="factura-row">' +
                    '<span>' + escHtml(it.nombre) + ' (' + it.cantidad + 'M &times; $' + parseNum(it.costo).toFixed(2) + ')</span>' +
                    '<b style="color:#38bdf8;">$' + parseNum(it.total).toFixed(2) + '</b>' +
                '</div>';
            }).join('');

            cont.innerHTML +=
                '<div class="deudor-item">' +
                    '<div class="deudor-header" onclick="document.getElementById(\'corte-body-' + idx + '\').classList.toggle(\'open\')">' +
                        '<div>' +
                            '<strong style="color:#38bdf8;">' + fechaStr + '</strong><br>' +
                            '<small style="color:#94a3b8;">Inv: $' + parseNum(corte.total_inventario).toFixed(2) + ' | Por cobrar: $' + parseNum(corte.total_me_deben).toFixed(2) + ' | Por pagar: $' + parseNum(corte.total_debo).toFixed(2) + '</small>' +
                        '</div>' +
                        '<div style="text-align:right;">' +
                            '<b style="color:#facc15; font-size:1.05rem; display:block;">Capital: $' + parseNum(corte.capital_total).toFixed(2) + '</b>' +
                            '<small style="color:' + colorGan + '; font-weight:bold;">Ganancia cierre: $' + ganOp.toFixed(2) + ' &#9660;</small>' +
                        '</div>' +
                    '</div>' +
                    '<div id="corte-body-' + idx + '" class="deudor-body">' +
                        (filasHtml || '<p style="color:#94a3b8;">Sin detalle.</p>') +
                    '</div>' +
                '</div>';
        });
    } catch (e) {
        console.error('Error cargando cortes hist\u00f3ricos:', e);
    }
}

/* =========================================================
   5. DEUDORES BOLSAS (SOLO FACTURAS A CLIENTES - FIFO)
   ========================================================= */
async function cargarDeudoresBolsas() {
    try {
        const res = await db
            .from('bolsas_facturas')
            .select('*')
            .eq('pagada', false)
            .gt('saldo_pendiente', 0)
            .order('fecha', { ascending: true });

        bolsasFacturasPendientes = res.data || [];
        renderDeudoresBolsas();
    } catch (e) {
        console.error('Error cargando deudores bolsas:', e);
    }
}

function renderDeudoresBolsas() {
    const cont = document.getElementById('b-lista-deudores');
    if (!cont) return;
    cont.innerHTML = '';

    if (bolsasFacturasPendientes.length === 0) {
        cont.innerHTML = '<p style="color:#4ade80; text-align:center; padding:16px;">No hay clientes con facturas pendientes.</p>';
        return;
    }

    const grupos = {};
    bolsasFacturasPendientes.forEach(function (f) {
        const clave = f.cliente.trim().toLowerCase();
        if (!grupos[clave]) {
            grupos[clave] = {
                nombreMostrar: f.cliente.trim(),
                totalDeuda: 0,
                facturas: []
            };
        }
        grupos[clave].totalDeuda = round2(grupos[clave].totalDeuda + parseNum(f.saldo_pendiente));
        grupos[clave].facturas.push(f);
    });

    Object.values(grupos)
        .sort(function (a, b) { return b.totalDeuda - a.totalDeuda; })
        .forEach(function (grupo, idx) {
            const facturasHtml = grupo.facturas.map(function (f) {
                const fechaCorta = new Date(f.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
                const orig = parseNum(f.total_original);
                const pend = parseNum(f.saldo_pendiente);
                const montoTexto = (pend < orig)
                    ? ('<b style="color:#facc15;">Resta: $' + pend.toFixed(2) + '</b> <small style="color:#94a3b8; display:block;">Total: $' + orig.toFixed(2) + '</small>')
                    : ('<b style="color:#f87171;">Total: $' + pend.toFixed(2) + '</b>');

                return '<div class="factura-row">' +
                    '<div>' +
                        '<span style="color:#38bdf8; font-weight:bold;">' + fechaCorta + '</span> &middot; ' +
                        '<span style="color:#e2e8f0;">' + escHtml(f.productos) + '</span>' +
                    '</div>' +
                    '<div style="white-space:nowrap; text-align:right;">' + montoTexto + '</div>' +
                '</div>';
            }).join('');

            const card = document.createElement('div');
            card.className = 'deudor-item';
            card.innerHTML =
                '<div class="deudor-header">' +
                    '<div class="deudor-toggle-zone" style="flex:1; display:flex; align-items:center; gap:10px;">' +
                        '<span style="font-size:1.1rem; color:#38bdf8;">&#9660;</span>' +
                        '<div>' +
                            '<strong style="font-size:1.1rem; color:#fff;">' + escHtml(grupo.nombreMostrar) + '</strong>' +
                            '<small style="display:block; color:#94a3b8;">' + grupo.facturas.length + ' factura(s) pendiente(s)</small>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex; align-items:center; gap:12px;">' +
                        '<strong style="font-size:1.25rem; color:#f87171;">$' + grupo.totalDeuda.toFixed(2) + '</strong>' +
                        '<button class="btn-abonar-b" style="background:#4ade80; color:#0f172a; padding:10px 16px;">Abonar</button>' +
                    '</div>' +
                '</div>' +
                '<div id="deudor-b-body-' + idx + '" class="deudor-body">' +
                    facturasHtml +
                '</div>';

            card.querySelector('.deudor-toggle-zone').onclick = function () {
                document.getElementById('deudor-b-body-' + idx).classList.toggle('open');
            };

            card.querySelector('.btn-abonar-b').onclick = function (e) {
                e.stopPropagation();
                abrirModalAbonoBolsas(grupo.nombreMostrar, grupo.totalDeuda);
            };

            cont.appendChild(card);
        });
}

function abrirModalAbonoBolsas(cliente, totalDeuda) {
    bAbonoClienteActual = cliente;
    bAbonoMaxActual = totalDeuda;
    document.getElementById('b-abono-cliente').innerText = cliente;
    document.getElementById('b-abono-max').innerText = totalDeuda.toFixed(2);
    abrirModal('modal-abono-bolsas');
}

window.confirmarAbonoBolsas = async function () {
    const abonoUsd = parseNum(document.getElementById('b-abono-usd').value);
    const abonoBsRef = parseNum(document.getElementById('b-abono-bs').value);
    const notaRef = document.getElementById('b-abono-nota').value.trim();

    if (abonoUsd <= 0) return alert('Ingresa un monto en d\u00f3lares mayor a 0.');
    if (abonoUsd > round2(bAbonoMaxActual + 0.01)) {
        return alert('No puedes abonar m\u00e1s de la deuda total ($' + bAbonoMaxActual.toFixed(2) + ').');
    }

    try {
        const facturasCliente = bolsasFacturasPendientes
            .filter(function (f) {
                return f.cliente.trim().toLowerCase() === bAbonoClienteActual.trim().toLowerCase();
            })
            .sort(function (a, b) {
                return new Date(a.fecha) - new Date(b.fecha);
            });

        let restanteAbono = abonoUsd;

        for (let i = 0; i < facturasCliente.length; i++) {
            const fac = facturasCliente[i];
            if (restanteAbono <= 0.009) break;

            const saldoFac = parseNum(fac.saldo_pendiente);
            if (restanteAbono >= saldoFac) {
                restanteAbono = round2(restanteAbono - saldoFac);
                await db.from('bolsas_facturas').update({
                    saldo_pendiente: 0,
                    pagada: true
                }).eq('id', fac.id);
            } else {
                const nuevoSaldoFac = round2(saldoFac - restanteAbono);
                restanteAbono = 0;
                await db.from('bolsas_facturas').update({
                    saldo_pendiente: nuevoSaldoFac,
                    pagada: false
                }).eq('id', fac.id);
            }
        }

        const resAb = await db.from('bolsas_abonos').insert([{
            cliente: bAbonoClienteActual,
            monto_usd: abonoUsd,
            monto_bs_ref: abonoBsRef,
            nota_ref: notaRef || null
        }]);
        if (resAb.error) throw resAb.error;

        const resCaja = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
        const saldoActual = resCaja.data ? parseNum(resCaja.data.saldo) : 0;
        await db.from('bolsas_caja').update({ saldo: round2(saldoActual + abonoUsd) }).eq('id', 1);

        alert('Abono de $' + abonoUsd.toFixed(2) + ' aplicado a las facturas m\u00e1s antiguas de ' + bAbonoClienteActual + '.');
        cerrarModal('modal-abono-bolsas');
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error aplicando abono: ' + e.message);
    }
};
