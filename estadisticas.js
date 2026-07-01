// =================================================================
// --- LÓGICA EXCLUSIVA DEL PANEL DE ESTADÍSTICAS ---
// =================================================================

const API_ESTADISTICAS_PEDIDOS = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-pedidos";
let datosEstadisticas = [];
let tasaEstadisticas = 1;
let graficoTorta = null;
let pedidosFiltradosActuales = []; 

// 🟢 NUEVAS VARIABLES PARA EL AUTO-REFRESH
let filtroActivo = 'hoy'; 
let timerEstadisticas = null;

async function iniciarPantallaEstadisticas() {
    if (!document.getElementById('graficoPagos')) return;

    tasaEstadisticas = parseFloat(localStorage.getItem('tasaBCV')) || 1;
    
    try {
        const res = await fetch(API_ESTADISTICAS_PEDIDOS + "?historico=true");
        const data = await res.json();
        datosEstadisticas = Array.isArray(data) ? data : [];
        
        aplicarFiltroEstadisticas('hoy');
        arrancarPollingEstadisticas(); // 🟢 Arrancamos el motor de recarga automática
    } catch(e) {
        console.error("Error descargando pedidos para estadísticas:", e);
    }
}

// 🟢 NUEVA FUNCIÓN: Motor de recarga silenciosa
function arrancarPollingEstadisticas() {
    if (timerEstadisticas) clearInterval(timerEstadisticas);
    
    timerEstadisticas = setInterval(async () => {
        try {
            const res = await fetch(API_ESTADISTICAS_PEDIDOS + "?historico=true");
            const data = await res.json();
            datosEstadisticas = Array.isArray(data) ? data : [];
            
            // Re-aplicamos el filtro actual para que actualice los números sin mover la pantalla
            aplicarFiltroEstadisticas(filtroActivo, true);
        } catch (error) {
            console.error("Error en auto-refresh de estadísticas:", error);
        }
    }, 15000); // Se actualiza cada 15 segundos
}

// 🟢 FUNCIÓN ACTUALIZADA: Ahora descarga datos frescos al hacer clic
async function aplicarFiltroEstadisticas(tipo, esSilencioso = false) {
    if (!document.getElementById('graficoPagos')) return;

    filtroActivo = tipo; // Guardamos en memoria en qué pestaña estamos

    // 1. SI ES UN CLIC MANUAL: Descargamos la data más fresca del servidor
    if (!esSilencioso) {
        try {
            const res = await fetch(API_ESTADISTICAS_PEDIDOS + "?historico=true");
            const data = await res.json();
            datosEstadisticas = Array.isArray(data) ? data : [];
        } catch(e) {
            console.error("Error al refrescar datos manualmente:", e);
        }

        // Cambiamos los colores de los botones
        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('bg-slate-800', 'text-slate-300');
        });
        
        if (tipo !== 'custom') {
            document.getElementById('fechaCustom').value = '';
            try {
                if (window.event && window.event.currentTarget) {
                    window.event.currentTarget.classList.remove('bg-slate-800', 'text-slate-300');
                    window.event.currentTarget.classList.add('bg-indigo-600', 'text-white');
                }
            } catch(e) {}
        }
    }

    // 2. PROCEDEMOS A FILTRAR LA DATA (Que ahora está 100% actualizada)
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    const pedidosFiltrados = datosEstadisticas.filter(p => {
        if (!p.timestamp) return false;
        const fechaPedido = new Date(p.timestamp);
        fechaPedido.setHours(0,0,0,0);

        if (tipo === 'hoy') return fechaPedido.getTime() === hoy.getTime();
        if (tipo === 'ayer') {
            const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
            return fechaPedido.getTime() === ayer.getTime();
        }
        if (tipo === 'semana') {
            const inicioSemana = new Date(hoy);
            inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
            return fechaPedido >= inicioSemana;
        }
        if (tipo === 'mes') {
            return fechaPedido.getMonth() === hoy.getMonth() && fechaPedido.getFullYear() === hoy.getFullYear();
        }
        if (tipo === 'custom') {
            const fechaSeleccionada = document.getElementById('fechaCustom').value;
            if (!fechaSeleccionada) return true;
            // Reparación de Zona Horaria para el calendario manual
            const partesFecha = fechaSeleccionada.split('-');
            const fCustom = new Date(partesFecha[0], partesFecha[1] - 1, partesFecha[2]);
            fCustom.setHours(0,0,0,0);
            return fechaPedido.getTime() === fCustom.getTime();
        }
        return true;
    });

    const finalizados = pedidosFiltrados.filter(p => (p.estado || '').toLowerCase() === 'finalizado');
    pedidosFiltradosActuales = finalizados; 
    
    procesarCalculosEstadisticos(finalizados);
    renderHistorialFinalizadosEnStats(pedidosFiltrados);
}

// ... EL RESTO DEL CÓDIGO (procesarCalculosEstadisticos, dibujarWidgetsEstadisticas, etc.) QUEDA EXACTAMENTE IGUAL ...

function procesarCalculosEstadisticos(pedidos) {
    let totalUSD = 0;
    const conteoClientes = {};
    const conteoProductos = {};
    const pagos = { 'Zelle': 0, 'Pago Movil': 0, 'Efectivo': 0 };
    const nominaRepartidores = {};

    pedidos.forEach(p => {
        const monto = parseFloat(p.total_orden || 0);
        totalUSD += monto;
        
        let metodo = (p.metodo_pago || 'Efectivo').toLowerCase();
        if (metodo.includes('zelle')) pagos['Zelle']++;
        else if (metodo.includes('pago') || metodo.includes('movil')) pagos['Pago Movil']++;
        else pagos['Efectivo']++;

        const cliente = p.cliente || 'Desconocido';
        if (!conteoClientes[cliente]) conteoClientes[cliente] = { gastado: 0, pedidos: 0 };
        conteoClientes[cliente].gastado += monto;
        conteoClientes[cliente].pedidos++;

        const detalle = p.pedido_detallado || '';
        const lineas = detalle.split('\n');
        lineas.forEach(linea => {
            const match = linea.trim().match(/^(\d+)[xX]\s+(.+?)(?:\s+\(\$.+\))?$/);
            if (match) {
                const cant = parseInt(match[1]);
                let nombreProd = match[2].trim();
                
                if (!nombreProd.toLowerCase().includes('servicio de delivery')) {
                    if (!conteoProductos[nombreProd]) conteoProductos[nombreProd] = 0;
                    conteoProductos[nombreProd] += cant;
                } else {
                    const repartidor = p.repartidor || p.Repartidor;
                    if (repartidor) {
                        if (!nominaRepartidores[repartidor]) nominaRepartidores[repartidor] = { viajes: 0, dineroAdeudado: 0 };
                        nominaRepartidores[repartidor].viajes++;
                        
                        const matchPrecio = linea.match(/\(\$([\d.]+)\)/);
                        if (matchPrecio && matchPrecio[1]) {
                            nominaRepartidores[repartidor].dineroAdeudado += parseFloat(matchPrecio[1]);
                        }
                    }
                }
            }
        });
    });

    dibujarWidgetsEstadisticas(pedidos.length, totalUSD, pagos, conteoClientes, conteoProductos, nominaRepartidores);
}

function dibujarWidgetsEstadisticas(cantPedidos, totalUSD, pagos, clientes, productos, repartidores) {
    document.getElementById('widgetTotalUSD').innerText = `$${totalUSD.toFixed(2)}`;
    document.getElementById('widgetTotalBS').innerText = `Bs. ${(totalUSD * tasaEstadisticas).toFixed(2)}`;
    document.getElementById('widgetCantPedidos').innerHTML = `<i class="fa-solid fa-receipt"></i> ${cantPedidos} pedidos finalizados`;

    if (graficoTorta) graficoTorta.destroy();
    const ctx = document.getElementById('graficoPagos').getContext('2d');
    graficoTorta = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Zelle', 'Pago Móvil', 'Efectivo'],
            datasets: [{
                data: [pagos['Zelle'], pagos['Pago Movil'], pagos['Efectivo']],
                backgroundColor: ['#6366f1', '#f59e0b', '#10b981'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: { plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } } }, maintainAspectRatio: false }
    });

    const arrayClientes = Object.keys(clientes).map(k => ({ nombre: k, ...clientes[k] })).sort((a, b) => b.gastado - a.gastado).slice(0, 5);
    document.getElementById('listaClientes').innerHTML = arrayClientes.length > 0 
        ? arrayClientes.map(c => `
            <div class="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                <span class="text-sm text-white font-medium">${c.nombre} <span class="text-[10px] text-slate-500 ml-1">(${c.pedidos} pedidos)</span></span>
                <span class="text-sm font-bold text-emerald-400">$${c.gastado.toFixed(2)}</span>
            </div>`).join('') 
        : '<p class="text-xs text-slate-500 italic">No hay datos en este rango</p>';

    const arrayProd = Object.keys(productos).map(k => ({ nombre: k, cant: productos[k] })).sort((a, b) => b.cant - a.cant).slice(0, 5);
    document.getElementById('listaProductos').innerHTML = arrayProd.length > 0 
        ? arrayProd.map(p => `
            <div class="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                <span class="text-sm text-white font-medium truncate pr-2">${p.nombre}</span>
                <span class="text-xs font-bold bg-slate-700 px-2 py-1 rounded text-orange-400">${p.cant} unid.</span>
            </div>`).join('')
        : '<p class="text-xs text-slate-500 italic">No hay datos en este rango</p>';

    const arrayRep = Object.keys(repartidores).map(k => ({ nombre: k, ...repartidores[k] })).sort((a, b) => b.viajes - a.viajes);
    document.getElementById('listaRepartidores').innerHTML = arrayRep.length > 0
        ? arrayRep.map(r => `
            <div onclick="abrirModalRepartidor('${r.nombre}', ${r.dineroAdeudado})" class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700 cursor-pointer hover:border-sky-500 hover:bg-slate-800 transition">
                <div>
                    <p class="text-sm text-white font-bold">${r.nombre}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5"><i class="fa-solid fa-route"></i> ${r.viajes} entregas realizadas</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] uppercase text-slate-500 font-bold block leading-none mb-1">Deuda a pagar</span>
                    <span class="text-lg font-bold text-sky-400 leading-none">$${r.dineroAdeudado.toFixed(2)}</span>
                </div>
            </div>`).join('')
        : '<p class="text-xs text-slate-500 italic">Nadie ha realizado entregas en este rango</p>';
}

function renderHistorialFinalizadosEnStats(pedidosList) {
    const contenedor = document.getElementById('historial-finalizados-container');
    if (!contenedor) return;

    const finalizados = pedidosList.filter(p => String(p.estado || '').toLowerCase().replace(/\s+/g, '') === 'finalizado');

    if (finalizados.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 text-sm italic">No hay pedidos finalizados en el periodo seleccionado.</p>';
        return;
    }

    finalizados.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    contenedor.innerHTML = '';
    
    finalizados.forEach(pedido => {
        const idVisual = pedido.id_pedido || pedido.ID || 'S/ID';
        const cliente = pedido.cliente || 'Desconocido';
        const monto = parseFloat(String(pedido.total_orden || pedido.monto || 0).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        const metodo = pedido.metodo_pago || 'N/A';
        
        let hora = '--:--';
        if (pedido.timestamp) {
            try {
                if (pedido.timestamp.includes('T')) hora = new Date(pedido.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
            } catch(e){}
        }

        let linkRecibo = '';
        if (pedido.imagen_pago && String(pedido.imagen_pago).trim() !== '' && String(pedido.imagen_pago) !== 'undefined') {
            linkRecibo = `<a href="${pedido.imagen_pago}" target="_blank" class="text-[11px] text-sky-400 font-semibold underline decoration-sky-600/50 underline-offset-2 hover:text-sky-300 transition mt-1 block"><i class="fa-regular fa-image"></i> Ver Recibo</a>`;
        }

        const esDelivery = String(pedido.tipo_entrega || '').toLowerCase().includes('delivery');
        const iconoMoto = esDelivery ? `<i class="fa-solid fa-motorcycle text-emerald-400 text-xs ml-2" title="Delivery"></i>` : '';

        contenedor.innerHTML += `
            <div class="bg-slate-900 border border-slate-700 rounded-lg p-3 flex justify-between items-center transition hover:border-emerald-400">
                <div class="flex items-center gap-3">
                    <span class="bg-emerald-400/10 text-emerald-400 px-2 py-1 rounded text-xs font-bold border border-emerald-400/20">#${idVisual}</span>
                    <div>
                        <p class="text-slate-100 m-0 text-sm font-bold">${cliente} ${iconoMoto}</p>
                        <p class="text-slate-400 m-0 text-[11px] mt-0.5"><i class="fa-regular fa-clock"></i> ${hora} • Pago: ${metodo}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-emerald-400 m-0 text-base font-bold">$${monto.toFixed(2)}</p>
                    ${linkRecibo}
                </div>
            </div>
        `;
    });
}

function abrirModalRepartidor(nombre, deudaTotal) {
    document.getElementById('modal-nombre-repartidor').innerText = nombre;
    document.getElementById('modal-total-repartidor').innerText = `$${deudaTotal.toFixed(2)}`;
    
    const listaContenedor = document.getElementById('modal-lista-pedidos');
    listaContenedor.innerHTML = '';

    const pedidosChofer = pedidosFiltradosActuales.filter(p => p.repartidor === nombre || p.Repartidor === nombre);

    if (pedidosChofer.length === 0) {
        listaContenedor.innerHTML = '<p class="text-center text-slate-500 my-8 italic">No se encontraron detalles de pedidos para este rango de fecha.</p>';
    } else {
        pedidosChofer.forEach(p => {
            const idVisual = p.id_pedido || p.ID || 'S/ID';
            const cliente = p.cliente || 'Desconocido';
            const detalleRaw = p.pedido_detallado || 'Sin detalles';
            
            const detalleHTML = detalleRaw
                .replace(/\n/g, '<br>')
                .replace(/Servicio de Delivery/g, '<span class="text-sky-400 font-bold">Servicio de Delivery</span>');

            let hora = '--:--';
            if (p.timestamp && p.timestamp.includes('T')) {
                hora = new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            }

            listaContenedor.innerHTML += `
                <div class="mb-3 bg-slate-950 p-4 rounded-lg border border-slate-700">
                    <div class="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                        <span class="text-xs font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">Orden #${idVisual}</span>
                        <span class="text-xs text-slate-400"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <p class="text-sm font-bold text-white mb-2 flex items-center gap-2">
                        <i class="fa-solid fa-user text-slate-500"></i> ${cliente}
                    </p>
                    <div class="text-xs text-slate-300 font-mono bg-slate-900 p-2 rounded">
                        ${detalleHTML}
                    </div>
                </div>
            `;
        });
    }

    const modal = document.getElementById('modal-repartidor');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('modal-repartidor-content').classList.remove('scale-95');
    }, 10);
}

function cerrarModalRepartidor() {
    const modal = document.getElementById('modal-repartidor');
    modal.classList.add('opacity-0');
    document.getElementById('modal-repartidor-content').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// -----------------------------------------------------------------
// EVENTOS AL CARGAR LA PÁGINA
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', iniciarPantallaEstadisticas);
// [ ... Todo el código de estadísticas que me pasaste arriba ... ]

// --- MEJOR PRÁCTICA: Inicialización limpia ---
document.addEventListener('DOMContentLoaded', () => {
    // Solo ejecutamos si los elementos de estadísticas existen en el HTML actual
    if (document.getElementById('graficoPagos')) {
        iniciarPantallaEstadisticas();
    }
});
