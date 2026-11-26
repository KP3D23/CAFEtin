// =========================================================
// MÓDULO EXCLUSIVO: SISTEMA DE BOLSAS (ROL 'BOLSAS')
// =========================================================

let bolsasInventario = [];
let bolsasCarrito = [];
let bolsasProveedores = [];
let bolsasFacturasPendientes = [];
let bAbonoClienteActual = '';
let bAbonoMaxActual = 0;

// =========================================================
// 1. INICIALIZACIÓN Y NAVEGACIÓN
// =========================================================
window.iniciarModuloBolsas = function () {
    mostrarPanelBolsas('b-dashboard');
    cargarTodoBolsas();
};

window.mostrarPanelBolsas = function (panelId) {
    document.querySelectorAll('.b-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(panelId);
    if (target) target.style.display = 'block';

    document.querySelectorAll('#nav-bolsas .btn-sec').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-nav-${panelId}`);
    if (activeBtn) activeBtn.classList.add('active');
};

window.cargarTodoBolsas = async function () {
    await Promise.all([
        cargarInventarioBolsas(),
        cargarProveedoresBolsas(),
        cargarDeudoresBolsas()
    ]);
    recalcularCapitalBolsas();
    await cargarDashboardBolsas();
    await cargarCortesInventario();
};

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

// =========================================================
// 2. DASHBOARD SEMANAL Y MOVIMIENTOS
// =========================================================
window.toggleDrawerBolsas = function () {
    const drawer = document.getElementById('b-dash-drawer');
    if (drawer) drawer.classList.toggle('open');
};

async function cargarDashboardBolsas() {
    try {
        // 1. Saldo en Caja
        const { data: caja } = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
        const saldoCaja = caja ? parseNum(caja.saldo) : 0;
        document.getElementById('b-dash-caja').innerText = saldoCaja.toFixed(2);

        // 2. Filtro últimos 7 días
        const hace7Dias = new Date();
        hace7Dias.setDate(hace7Dias.getDate() - 7);
        const isoSemana = hace7Dias.toISOString();

        // Ventas de la semana
        const { data: ventasSem } = await db
            .from('bolsas_facturas')
            .select('total_original')
            .gte('fecha', isoSemana);

        let totalVentasSem = 0;
        if (ventasSem) ventasSem.forEach(v => totalVentasSem += parseNum(v.total_original));
        document.getElementById('b-sem-ventas').innerText = totalVentasSem.toFixed(2);

        // Compras y Gastos de la semana
        const { data: movsSem } = await db
            .from('bolsas_movimientos')
            .select('*')
            .gte('fecha', isoSemana)
            .order('fecha', { ascending: false });

        let totalComprasSem = 0;
        let totalGastosSem = 0;

        if (movsSem) {
            movsSem.forEach(m => {
                const monto = parseNum(m.monto);
                if (m.tipo === 'COMPRA') totalComprasSem += monto;
                if (m.tipo === 'GASTO') totalGastosSem += monto;
            });
        }

        document.getElementById('b-sem-compras').innerText = totalComprasSem.toFixed(2);
        document.getElementById('b-sem-gastos').innerText = totalGastosSem.toFixed(2);

        // 3. Lista reciente de movimientos (últimos 25)
        const { data: ultMovs } = await db
            .from('bolsas_movimientos')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(25);

        const cont = document.getElementById('b-lista-movimientos');
        cont.innerHTML = '';

        if (!ultMovs || ultMovs.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; text-align:center;">Sin movimientos registrados aún.</p>';
            return;
        }

        ultMovs.forEach(m => {
            const fechaStr = new Date(m.fecha).toLocaleDateString('es-VE');
            let badgeColor = '#f87171';
            let etiqueta = 'GASTO';
            if (m.tipo === 'COMPRA') { badgeColor = '#facc15'; etiqueta = 'COMPRA'; }
            if (m.tipo === 'PAGO_PROVEEDOR') { badgeColor = '#38bdf8'; etiqueta = 'ABONO PROVEEDOR'; }

            cont.innerHTML += `
                <div class="historial-item" style="border-left-color: ${badgeColor}; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div>
                        <small style="color:${badgeColor}; font-weight:bold;">${etiqueta}</small> · <small style="color:#94a3b8;">${fechaStr}</small><br>
                        <strong style="color:#fff;">${escHtml(m.concepto)}</strong>
                    </div>
                    <b style="color:#f87171; font-size:1.1rem;">-$${parseNum(m.monto).toFixed(2)}</b>
                </div>
            `;
        });
    } catch (e) {
        console.error('Error cargando dashboard bolsas:', e);
    }
}

window.registrarMovimientoBolsas = async function () {
    const tipo = document.getElementById('b-mov-tipo').value;
    const concepto = document.getElementById('b-mov-concepto').value.trim();
    const monto = parseNum(document.getElementById('b-mov-monto').value);

    if (!concepto || monto <= 0) {
        return alert('Ingresa un concepto y un monto válido mayor a 0.');
    }

    try {
        const { data: caja } = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
        const saldoActual = caja ? parseNum(caja.saldo) : 0;

        if (monto > saldoActual) {
            if (!confirm(`El monto ($${monto.toFixed(2)}) es mayor al saldo en caja ($${saldoActual.toFixed(2)}). ¿Deseas registrarlo igual?`)) {
                return;
            }
        }

        const nuevoSaldo = round2(saldoActual - monto);
        await db.from('bolsas_caja').update({ saldo: nuevoSaldo }).eq('id', 1);

        await db.from('bolsas_movimientos').insert([{
            tipo,
            concepto,
            monto
        }]);

        // Si es abono a proveedor y coincide el nombre, descontar de su deuda automáticamente
        if (tipo === 'PAGO_PROVEEDOR') {
            const { data: prov } = await db
                .from('bolsas_proveedores')
                .select('*')
                .ilike('nombre', `%${concepto}%`)
                .limit(1)
                .maybeSingle();

            if (prov) {
                const nuevaDeudaProv = Math.max(0, round2(parseNum(prov.deuda) - monto));
                await db.from('bolsas_proveedores').update({ deuda: nuevaDeudaProv, updated_at: new Date().toISOString() }).eq('id', prov.id);
            }
        }

        document.getElementById('b-mov-concepto').value = '';
        document.getElementById('b-mov-monto').value = '';
        alert('✅ Movimiento guardado correctamente.');
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error al guardar movimiento: ' + e.message);
    }
};

// =========================================================
// 3. PUNTO DE VENTA BOLSAS (AMIGABLE)
// =========================================================
function renderCatalogoBolsas(lista) {
    const cont = document.getElementById('b-pos-catalogo');
    if (!cont) return;
    cont.innerHTML = '';

    const disponibles = (lista || []).filter(p => parseNum(p.cantidad) > 0);

    if (disponibles.length === 0) {
        cont.innerHTML = '<p style="color:#94a3b8; grid-column:1/-1; text-align:center; padding:20px;">No hay bolsas con existencia. Agrégalas en Inventario.</p>';
        return;
    }

    disponibles.forEach(p => {
        const tile = document.createElement('div');
        tile.className = 'prod-tile';
        tile.innerHTML = `
            <div class="p-name">${escHtml(p.nombre)}</div>
            <div>
                <div class="p-price">$${parseNum(p.precio_venta).toFixed(2)}</div>
                <div class="p-stock">Hay: ${parseNum(p.cantidad)}</div>
            </div>
        `;
        tile.onclick = () => agregarAlCarritoBolsas(p.id);
        cont.appendChild(tile);
    });
}

window.filtrarCatalogoBolsas = function () {
    const q = (document.getElementById('b-pos-buscar').value || '').toLowerCase();
    const filtrados = bolsasInventario.filter(p => p.nombre.toLowerCase().includes(q));
    renderCatalogoBolsas(filtrados);
};

function agregarAlCarritoBolsas(id) {
    const prod = bolsasInventario.find(p => p.id === id);
    if (!prod) return;

    const stockMax = parseNum(prod.cantidad);
    const existente = bolsasCarrito.find(item => item.id === id);

    if (existente) {
        if (existente.cantidad + 1 > stockMax) {
            return alert(`Solo quedan ${stockMax} de "${prod.nombre}".`);
        }
        existente.cantidad = round2(existente.cantidad + 1);
    } else {
        if (stockMax <= 0) return alert('Producto agotado.');
        bolsasCarrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: parseNum(prod.precio_venta),
            stock: stockMax,
            cantidad: stockMax >= 1 ? 1 : stockMax
        });
    }
    renderCarritoBolsas();
}

window.cambiarCantBolsas = function (index, delta) {
    const item = bolsasCarrito[index];
    if (!item) return;

    const nueva = round2(item.cantidad + delta);
    if (nueva <= 0) {
        bolsasCarrito.splice(index, 1);
    } else if (nueva > item.stock) {
        return alert(`Solo hay ${item.stock} disponibles.`);
    } else {
        item.cantidad = nueva;
    }
    renderCarritoBolsas();
};

window.editarCantManualBolsas = function (index, valor) {
    const item = bolsasCarrito[index];
    if (!item) return;

    const nueva = parseNum(valor);
    if (nueva <= 0) {
        bolsasCarrito.splice(index, 1);
    } else if (nueva > item.stock) {
        alert(`Solo hay ${item.stock} disponibles.`);
        item.cantidad = item.stock;
    } else {
        item.cantidad = nueva;
    }
    renderCarritoBolsas();
};

function renderCarritoBolsas() {
    const cont = document.getElementById('b-pos-carrito');
    const totalEl = document.getElementById('b-pos-total');

    if (bolsasCarrito.length === 0) {
        cont.innerHTML = '<p style="color: #64748b; text-align: center; padding: 15px;">Toca un producto para empezar</p>';
        totalEl.innerText = '0.00';
        return;
    }

    cont.innerHTML = '';
    let total = 0;

    bolsasCarrito.forEach((item, idx) => {
        const sub = round2(item.precio * item.cantidad);
        total = round2(total + sub);

        cont.innerHTML += `
            <div class="cart-row">
                <div style="flex:1;">
                    <strong style="color:#38bdf8; font-size:1.02rem;">${escHtml(item.nombre)}</strong><br>
                    <small style="color:#94a3b8;">$${item.precio.toFixed(2)} c/u → <b style="color:#4ade80;">$${sub.toFixed(2)}</b></small>
                </div>
                <div class="qty-ctrl">
                    <button class="qty-btn" onclick="cambiarCantBolsas(${idx}, -1)">−</button>
                    <input type="number" step="0.5" value="${item.cantidad}" onchange="editarCantManualBolsas(${idx}, this.value)" style="width:62px; text-align:center; margin-bottom:0; padding:6px; font-weight:bold;">
                    <button class="qty-btn" onclick="cambiarCantBolsas(${idx}, 1)">+</button>
                </div>
            </div>
        `;
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
        return alert('Para ventas a crédito debes escribir el nombre del cliente.');
    }
    if (!cliente) cliente = 'Cliente General';

    let totalVenta = 0;
    const resumenProductos = [];

    try {
        for (const item of bolsasCarrito) {
            const sub = round2(item.precio * item.cantidad);
            totalVenta = round2(totalVenta + sub);
            resumenProductos.push(`${item.cantidad}x ${item.nombre}`);

            // Descontar inventario
            const { data: prodActual } = await db
                .from('bolsas_inventario')
                .select('cantidad')
                .eq('id', item.id)
                .single();

            if (prodActual) {
                const nuevaCant = Math.max(0, round2(parseNum(prodActual.cantidad) - item.cantidad));
                await db
                    .from('bolsas_inventario')
                    .update({ cantidad: nuevaCant, updated_at: new Date().toISOString() })
                    .eq('id', item.id);
            }
        }

        const esCredito = (metodo === 'CREDITO');

        // Insertar factura
        await db.from('bolsas_facturas').insert([{
            cliente,
            productos: resumenProductos.join(', '),
            total_original: totalVenta,
            saldo_pendiente: esCredito ? totalVenta : 0,
            metodo_pago: metodo,
            monto_bs_ref: bsRef,
            nota_ref: notaRef || null,
            pagada: !esCredito
        }]);

        // Si fue de contado, sumar a la caja
        if (!esCredito) {
            const { data: caja } = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
            const saldoActual = caja ? parseNum(caja.saldo) : 0;
            await db.from('bolsas_caja').update({ saldo: round2(saldoActual + totalVenta) }).eq('id', 1);
        }

        alert(esCredito
            ? `✅ Factura a crédito cargada a ${cliente} por $${totalVenta.toFixed(2)}.`
            : `✅ Venta cobrada por $${totalVenta.toFixed(2)} y sumada a Caja.`
        );

        bolsasCarrito = [];
        renderCarritoBolsas();
        document.getElementById('b-pos-cliente').value = '';
        document.getElementById('b-pos-bs').value = '';
        document.getElementById('b-pos-nota').value = '';

        await cargarTodoBolsas();
    } catch (e) {
        alert('Error al guardar la venta: ' + e.message);
    }
};

// =========================================================
// 4. INVENTARIO EDITABLE + CAPITAL + CORTES HISTÓRICOS
// =========================================================
async function cargarInventarioBolsas() {
    try {
        const { data } = await db.from('bolsas_inventario').select('*').order('nombre');
        bolsasInventario = data || [];
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:16px;">No hay productos. Presiona "+ Nuevo Producto".</td></tr>';
        return;
    }

    bolsasInventario.forEach(p => {
        const costo = parseNum(p.costo);
        const venta = parseNum(p.precio_venta);
        const cant = parseNum(p.cantidad);
        const total = round2(costo * cant);

        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.innerHTML = `
            <td><input type="text" class="inv-edit-nombre" value="${escHtml(p.nombre)}"></td>
            <td><input type="number" step="0.01" class="inv-edit-costo" value="${costo}" oninput="recalcularFilaInventario(this)"></td>
            <td><input type="number" step="0.01" class="inv-edit-venta" value="${venta}"></td>
            <td><input type="number" step="0.5" class="inv-edit-cant" value="${cant}" oninput="recalcularFilaInventario(this)"></td>
            <td><strong class="inv-row-total" style="color:#38bdf8;">$${total.toFixed(2)}</strong></td>
            <td style="white-space:nowrap;">
                <button onclick="guardarFilaInventario('${p.id}', this)" style="background:#4ade80; color:#0f172a; padding:8px 10px; margin-right:4px;" title="Guardar cambios">💾</button>
                <button onclick="eliminarFilaInventario('${p.id}', '${escHtml(p.nombre)}')" style="background:#ef4444; color:#fff; padding:8px 10px;" title="Eliminar">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.recalcularFilaInventario = function (inputEl) {
    const tr = inputEl.closest('tr');
    if (!tr) return;
    const costo = parseNum(tr.querySelector('.inv-edit-costo').value);
    const cant = parseNum(tr.querySelector('.inv-edit-cant').value);
    const total = round2(costo * cant);
    tr.querySelector('.inv-row-total').innerText = `$${total.toFixed(2)}`;
    recalcularCapitalBolsas(true);
};

window.agregarFilaInventarioBolsas = async function () {
    const nombre = prompt('Nombre de la bolsa / producto:');
    if (!nombre || !nombre.trim()) return;

    const costo = parseNum(prompt('Costo de compra ($):', '0'));
    const venta = parseNum(prompt('Precio de venta ($):', '0'));
    const cantidad = parseNum(prompt('Cantidad en existencia:', '0'));

    try {
        await db.from('bolsas_inventario').insert([{
            nombre: nombre.trim(),
            costo,
            precio_venta: venta,
            cantidad
        }]);
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
    const cantidad = parseNum(tr.querySelector('.inv-edit-cant').value);

    if (!nombre) return alert('El nombre no puede quedar vacío.');

    try {
        await db.from('bolsas_inventario').update({
            nombre,
            costo,
            precio_venta,
            cantidad,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        btnEl.innerText = '✅';
        setTimeout(() => { btnEl.innerText = '💾'; }, 1200);
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error guardando fila: ' + e.message);
    }
};

window.eliminarFilaInventario = async function (id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}" del inventario?`)) return;
    try {
        await db.from('bolsas_inventario').delete().eq('id', id);
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error eliminando producto: ' + e.message);
    }
};

// Proveedores ("Debo")
async function cargarProveedoresBolsas() {
    try {
        const { data } = await db.from('bolsas_proveedores').select('*').order('nombre');
        bolsasProveedores = data || [];
        renderProveedoresBolsas();
    } catch (e) {
        console.error('Error cargando proveedores:', e);
    }
}

function renderProveedoresBolsas() {
    const cont = document.getElementById('b-lista-proveedores');
    if (!cont) return;
    cont.innerHTML = '';

    if (bolsasProveedores.length === 0) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">No tienes deudas registradas con proveedores.</p>';
        return;
    }

    bolsasProveedores.forEach(p => {
        const deuda = parseNum(p.deuda);
        cont.innerHTML += `
            <div class="historial-item" style="border-left-color:#f87171; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                    <strong style="color:#fff;">${escHtml(p.nombre)}</strong><br>
                    <small style="color:#f87171; font-size:0.95rem;">Debo: <b>$${deuda.toFixed(2)}</b></small>
                </div>
                <div style="display:flex; gap:6px;">
                    <button onclick="editarDeudaProveedor('${p.id}', '${escHtml(p.nombre)}', ${deuda})" style="background:#334155; color:#fff; padding:8px 12px;">✏️ Editar</button>
                    <button onclick="eliminarProveedorBolsas('${p.id}', '${escHtml(p.nombre)}')" style="background:#ef4444; color:#fff; padding:8px 10px;">🗑️</button>
                </div>
            </div>
        `;
    });
}

window.guardarProveedorBolsas = async function () {
    const nombre = document.getElementById('b-prov-nombre').value.trim();
    const monto = parseNum(document.getElementById('b-prov-monto').value);

    if (!nombre || monto < 0) return alert('Escribe el nombre del proveedor y el monto.');

    try {
        const { data: ext } = await db.from('bolsas_proveedores').select('*').ilike('nombre', nombre).maybeSingle();
        if (ext) {
            await db.from('bolsas_proveedores').update({
                deuda: round2(parseNum(ext.deuda) + monto),
                updated_at: new Date().toISOString()
            }).eq('id', ext.id);
        } else {
            await db.from('bolsas_proveedores').insert([{ nombre, deuda: monto }]);
        }

        document.getElementById('b-prov-nombre').value = '';
        document.getElementById('b-prov-monto').value = '';
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error guardando proveedor: ' + e.message);
    }
};

window.editarDeudaProveedor = async function (id, nombre, deudaActual) {
    const nuevoVal = prompt(`Actualizar deuda con ${nombre} ($):`, deudaActual.toFixed(2));
    if (nuevoVal === null) return;
    const nuevaDeuda = Math.max(0, parseNum(nuevoVal));

    try {
        await db.from('bolsas_proveedores').update({
            deuda: nuevaDeuda,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error actualizando proveedor: ' + e.message);
    }
};

window.eliminarProveedorBolsas = async function (id, nombre) {
    if (!confirm(`¿Eliminar al proveedor "${nombre}" de la lista?`)) return;
    try {
        await db.from('bolsas_proveedores').delete().eq('id', id);
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error eliminando proveedor: ' + e.message);
    }
};

// Fórmula: Inventario + Me Deben - Debo = Capital
function recalcularCapitalBolsas(desdeInputs = false) {
    let totalInv = 0;

    if (desdeInputs) {
        document.querySelectorAll('#b-tabla-inventario tr[data-id]').forEach(tr => {
            const c = parseNum(tr.querySelector('.inv-edit-costo').value);
            const q = parseNum(tr.querySelector('.inv-edit-cant').value);
            totalInv = round2(totalInv + (c * q));
        });
    } else {
        bolsasInventario.forEach(p => {
            totalInv = round2(totalInv + (parseNum(p.costo) * parseNum(p.cantidad)));
        });
    }

    let totalMeDeben = 0;
    bolsasFacturasPendientes.forEach(f => {
        totalMeDeben = round2(totalMeDeben + parseNum(f.saldo_pendiente));
    });

    let totalDebo = 0;
    bolsasProveedores.forEach(pr => {
        totalDebo = round2(totalDebo + parseNum(pr.deuda));
    });

    const capital = round2(totalInv + totalMeDeben - totalDebo);

    document.getElementById('b-cap-inv').innerText = totalInv.toFixed(2);
    document.getElementById('b-cap-medeben').innerText = totalMeDeben.toFixed(2);
    document.getElementById('b-cap-debo').innerText = totalDebo.toFixed(2);
    document.getElementById('b-cap-total').innerText = capital.toFixed(2);

    return { totalInv, totalMeDeben, totalDebo, capital };
}

// Guardar Corte de Inventario y mostrar historial debajo
window.guardarCorteInventario = async function () {
    if (!confirm('¿Guardar una copia histórica del inventario y balance de hoy?')) return;

    // Primero sincronizar cualquier cambio que esté escrito en la tabla
    const filas = document.querySelectorAll('#b-tabla-inventario tr[data-id]');
    const detalleSnapshot = [];

    try {
        for (const tr of filas) {
            const id = tr.dataset.id;
            const nombre = tr.querySelector('.inv-edit-nombre').value.trim();
            const costo = parseNum(tr.querySelector('.inv-edit-costo').value);
            const precio_venta = parseNum(tr.querySelector('.inv-edit-venta').value);
            const cantidad = parseNum(tr.querySelector('.inv-edit-cant').value);

            await db.from('bolsas_inventario').update({
                nombre, costo, precio_venta, cantidad, updated_at: new Date().toISOString()
            }).eq('id', id);

            detalleSnapshot.push({
                nombre,
                costo,
                precio_venta,
                cantidad,
                total: round2(costo * cantidad)
            });
        }

        await cargarInventarioBolsas();
        const { totalInv, totalMeDeben, totalDebo, capital } = recalcularCapitalBolsas(false);

        await db.from('bolsas_inventario_historial').insert([{
            total_inventario: totalInv,
            total_me_deben: totalMeDeben,
            total_debo: totalDebo,
            capital_total: capital,
            detalle_json: detalleSnapshot
        }]);

        alert('✅ Corte de inventario guardado en el historial.');
        await cargarCortesInventario();
    } catch (e) {
        alert('Error guardando corte: ' + e.message);
    }
};

async function cargarCortesInventario() {
    try {
        const { data } = await db
            .from('bolsas_inventario_historial')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(20);

        const cont = document.getElementById('b-lista-cortes');
        if (!cont) return;
        cont.innerHTML = '';

        if (!data || data.length === 0) {
            cont.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">Aún no has guardado cortes anteriores.</p>';
            return;
        }

        data.forEach((corte, idx) => {
            const fechaStr = new Date(corte.fecha).toLocaleString('es-VE');
            const items = Array.isArray(corte.detalle_json) ? corte.detalle_json : [];

            let filasHtml = items.map(it => `
                <div class="factura-row">
                    <span>${escHtml(it.nombre)} (${it.cantidad} × $${parseNum(it.costo).toFixed(2)})</span>
                    <b style="color:#38bdf8;">$${parseNum(it.total).toFixed(2)}</b>
                </div>
            `).join('');

            cont.innerHTML += `
                <div class="deudor-item">
                    <div class="deudor-header" onclick="document.getElementById('corte-body-${idx}').classList.toggle('open')">
                        <div>
                            <strong style="color:#38bdf8;">📅 ${fechaStr}</strong><br>
                            <small style="color:#94a3b8;">Inv: $${parseNum(corte.total_inventario).toFixed(2)} | Me deben: $${parseNum(corte.total_me_deben).toFixed(2)} | Debo: $${parseNum(corte.total_debo).toFixed(2)}</small>
                        </div>
                        <div style="text-align:right;">
                            <b style="color:#facc15; font-size:1.1rem;">Capital: $${parseNum(corte.capital_total).toFixed(2)}</b>
                            <span style="margin-left:8px; color:#94a3b8;">▼</span>
                        </div>
                    </div>
                    <div id="corte-body-${idx}" class="deudor-body">
                        ${filasHtml || '<p style="color:#94a3b8;">Sin detalle.</p>'}
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error('Error cargando cortes históricos:', e);
    }
}

// =========================================================
// 5. DEUDORES BOLSAS (ACORDEÓN + ABONO FIFO)
// =========================================================
async function cargarDeudoresBolsas() {
    try {
        const { data } = await db
            .from('bolsas_facturas')
            .select('*')
            .eq('pagada', false)
            .gt('saldo_pendiente', 0)
            .order('fecha', { ascending: true }); // Más viejas primero (FIFO)

        bolsasFacturasPendientes = data || [];
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
        cont.innerHTML = '<p style="color:#4ade80; text-align:center; padding:16px;">🎉 No hay clientes con facturas pendientes.</p>';
        return;
    }

    // Agrupar facturas por cliente (insensible a mayúsculas)
    const grupos = {};
    bolsasFacturasPendientes.forEach(f => {
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
        .sort((a, b) => b.totalDeuda - a.totalDeuda)
        .forEach((grupo, idx) => {
            const facturasHtml = grupo.facturas.map(f => {
                const fechaCorta = new Date(f.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
                const orig = parseNum(f.total_original);
                const pend = parseNum(f.saldo_pendiente);
                const montoTexto = (pend < orig)
                    ? `<b style="color:#facc15;">$${pend.toFixed(2)}</b> <small style="color:#94a3b8;">($${orig.toFixed(2)})</small>`
                    : `<b style="color:#f87171;">$${pend.toFixed(2)}</b>`;

                return `
                    <div class="factura-row">
                        <div>
                            <span style="color:#38bdf8; font-weight:bold;">${fechaCorta}</span> · 
                            <span style="color:#e2e8f0;">${escHtml(f.productos)}</span>
                        </div>
                        <div style="white-space:nowrap;">${montoTexto}</div>
                    </div>
                `;
            }).join('');

            const card = document.createElement('div');
            card.className = 'deudor-item';
            card.innerHTML = `
                <div class="deudor-header">
                    <div class="deudor-toggle-zone" style="flex:1; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.1rem; color:#38bdf8;">▼</span>
                        <div>
                            <strong style="font-size:1.1rem; color:#fff;">${escHtml(grupo.nombreMostrar)}</strong>
                            <small style="display:block; color:#94a3b8;">${grupo.facturas.length} factura(s) pendiente(s)</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <strong style="font-size:1.25rem; color:#f87171;">$${grupo.totalDeuda.toFixed(2)}</strong>
                        <button class="btn-abonar-b" style="background:#4ade80; color:#0f172a; padding:10px 16px;">Abonar</button>
                    </div>
                </div>
                <div id="deudor-b-body-${idx}" class="deudor-body">
                    ${facturasHtml}
                </div>
            `;

            card.querySelector('.deudor-toggle-zone').onclick = () => {
                document.getElementById(`deudor-b-body-${idx}`).classList.toggle('open');
            };

            card.querySelector('.btn-abonar-b').onclick = (e) => {
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

    if (abonoUsd <= 0) return alert('Ingresa un monto en dólares mayor a 0.');
    if (abonoUsd > round2(bAbonoMaxActual + 0.01)) {
        return alert(`No puedes abonar más de la deuda total ($${bAbonoMaxActual.toFixed(2)}).`);
    }

    try {
        // Obtener facturas pendientes del cliente ordenadas de la más vieja a la más nueva (FIFO)
        const facturasCliente = bolsasFacturasPendientes
            .filter(f => f.cliente.trim().toLowerCase() === bAbonoClienteActual.trim().toLowerCase())
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        let restanteAbono = abonoUsd;

        for (const fac of facturasCliente) {
            if (restanteAbono <= 0.009) break;

            const saldoFac = parseNum(fac.saldo_pendiente);
            if (restanteAbono >= saldoFac) {
                // Paga esta factura vieja por completo
                restanteAbono = round2(restanteAbono - saldoFac);
                await db.from('bolsas_facturas').update({
                    saldo_pendiente: 0,
                    pagada: true
                }).eq('id', fac.id);
            } else {
                // Abona parcialmente a esta factura y queda el resto pendiente
                const nuevoSaldoFac = round2(saldoFac - restanteAbono);
                restanteAbono = 0;
                await db.from('bolsas_facturas').update({
                    saldo_pendiente: nuevoSaldoFac,
                    pagada: false
                }).eq('id', fac.id);
            }
        }

        // Registrar historial del abono (con Bs referencial)
        await db.from('bolsas_abonos').insert([{
            cliente: bAbonoClienteActual,
            monto_usd: abonoUsd,
            monto_bs_ref: abonoBsRef,
            nota_ref: notaRef || null
        }]);

        // Sumar los dólares abonados a Caja
        const { data: caja } = await db.from('bolsas_caja').select('saldo').eq('id', 1).single();
        const saldoActual = caja ? parseNum(caja.saldo) : 0;
        await db.from('bolsas_caja').update({ saldo: round2(saldoActual + abonoUsd) }).eq('id', 1);

        alert(`✅ Abono de $${abonoUsd.toFixed(2)} aplicado a las facturas más antiguas de ${bAbonoClienteActual}.`);
        cerrarModal('modal-abono-bolsas');
        await cargarTodoBolsas();
    } catch (e) {
        alert('Error aplicando abono: ' + e.message);
    }
};
