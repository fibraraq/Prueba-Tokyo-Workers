// Tokio Sushi - Núcleo de Operaciones y Control del Sistema

// IMPORTANTE: Si subes esto a GitHub Pages, debes cambiar estos 'localhost' 
// por tu URL terminada en .loca.lt, de lo contrario GitHub bloqueará la conexión.
const API_OBTENER_PEDIDOS = "http://localhost:5678/webhook/obtener-pedidos";
const API_ACTUALIZAR_ESTADO = "http://localhost:5678/webhook/actualizar-estado";
const URL_NUEVO_PEDIDO = "http://localhost:5678/webhook/Prueba-tokyo";
const URL_OBTENER_MENU = "http://localhost:5678/webhook/obtener-menu";
const URL_OBTENER_USUARIOS = "http://localhost:5678/webhook/obtener-usuarios";

let USUARIOS_SISTEMA = [];
let CATALOGO_PRODUCTOS = [];
let usuarioActivo = null;
let pedidosEnMemoria = [];
let segundosFaltantes = 15;
let pollingTimer;

let carritoEdicion = []; 
let totalEdicionUSD = 0;
let resolveTiempoEstimado = null; 

// --- CARGAR CATÁLOGO DESDE LA BASE DE DATOS (ACTUALIZADO PARA MODULARIDAD) ---
async function cargarCatalogoDesdeDB() {
    try {
        const response = await fetch(URL_OBTENER_MENU);
        if (!response.ok) throw new Error('Error al conectar con el servidor de menú');
        
        const data = await response.json();

        // Extraemos los arrays que nos envía el nuevo flujo de n8n
        const productos = data.menu.productos || [];
        const combos = data.menu.combos || [];

        // Unificamos ambos en una sola lista plana para que el buscador del cajero funcione igual
        const catalogoUnificado = [...productos, ...combos];

        // Mapeamos los datos unificados al formato que usa el buscador del dashboard
        CATALOGO_PRODUCTOS = catalogoUnificado.map(item => ({
            id: item.id,
            name: item.nombre,
            price: parseFloat(item.precio)
        }));
        
        console.log("Catálogo interno cargado:", CATALOGO_PRODUCTOS.length, "ítems listos para edición.");
    } catch (error) {
        console.error("Error obteniendo el catálogo interno:", error);
    } 
}

// --- CARGAR USUARIOS DESDE LA BASE DE DATOS ---
async function cargarUsuariosDesdeDB() {
    try {
        const response = await fetch(URL_OBTENER_USUARIOS);
        if (!response.ok) throw new Error('Error al conectar con el servidor de usuarios');
        
        const data = await response.json();
        
        // Nos aseguramos de que siempre sea una lista (array) sin importar cómo lo envíe n8n
        USUARIOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        console.log("Usuarios cargados desde BD:", USUARIOS_SISTEMA);
    } catch (error) {
        console.error("Error obteniendo los usuarios:", error);
    }
}

// --- CONTROL DE TASA ---
async function actualizarTasaBCV() {
    const inputTasa = document.getElementById('tasaBCV');
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (!response.ok) throw new Error('Error API BCV');
        const data = await response.json();
        if (data.promedio) {
            inputTasa.value = parseFloat(data.promedio).toFixed(2);
            localStorage.setItem('tasaBCV', inputTasa.value);
            inputTasa.classList.add('text-emerald-400');
            setTimeout(() => inputTasa.classList.remove('text-emerald-400'), 2000);
        }
    } catch (error) {
        if (localStorage.getItem('tasaBCV')) inputTasa.value = localStorage.getItem('tasaBCV');
    }
}
document.getElementById('tasaBCV').addEventListener('input', (e) => {
    localStorage.setItem('tasaBCV', e.target.value);
    renderizarTablero(); 
});

// --- SESIONES (RBAC) ---
function verificarSesion() {
    const sesionGuardada = localStorage.getItem('usuarioActivo');
    if (sesionGuardada) {
        usuarioActivo = JSON.parse(sesionGuardada);
        aplicarRestriccionesRol();
        document.getElementById('vistaLogin').classList.add('hidden');
        document.getElementById('vistaDashboard').classList.remove('hidden');
        document.getElementById('vistaDashboard').classList.add('flex');
        cargarPedidos();
    } else {
        usuarioActivo = null;
        clearInterval(pollingTimer);
        document.getElementById('vistaLogin').classList.remove('hidden');
        document.getElementById('vistaDashboard').classList.add('hidden');
        document.getElementById('vistaDashboard').classList.remove('flex');
    }
}

function iniciarSesion(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const usernameInput = document.getElementById('loginUsername').value.trim();
    const pinInput = document.getElementById('loginPIN').value.trim();
    const errorMsg = document.getElementById('loginError');
    
    if (errorMsg) errorMsg.classList.add('hidden');

    if (!USUARIOS_SISTEMA || USUARIOS_SISTEMA.length === 0) {
        console.error("La lista de usuarios está vacía. Verifica la conexión con n8n.");
        if (errorMsg) {
            errorMsg.innerText = "Error de conexión con la base de datos.";
            errorMsg.classList.remove('hidden');
        }
        return; 
    }

    const usuarioEncontrado = USUARIOS_SISTEMA.find(u => 
        String(u.username).toLowerCase() === usernameInput.toLowerCase() && 
        String(u.pin) === String(pinInput)
    );

    if (usuarioEncontrado) {
        usuarioActivo = { username: usuarioEncontrado.username, nombre: usuarioEncontrado.nombre, rol: usuarioEncontrado.rol };
        localStorage.setItem('usuarioActivo', JSON.stringify(usuarioActivo));
        
        const formLogin = document.getElementById('formLogin');
        if (formLogin) formLogin.reset();
        
        verificarSesion();
    } else {
        if (errorMsg) {
            errorMsg.innerText = "Usuario o PIN de acceso incorrectos.";
            errorMsg.classList.remove('hidden');
        } else {
            alert("Usuario o PIN incorrectos.");
        }
    }
}

function cerrarSesion() {
    localStorage.removeItem('usuarioActivo');
    verificarSesion();
}

function aplicarRestriccionesRol() {
    const inputTasa = document.getElementById('tasaBCV');
    const badgeUsuario = document.getElementById('badgeUsuario');
    if (!usuarioActivo) return;

    let colorRol = 'bg-slate-600/20 text-slate-300 border-slate-600/30';
    if (usuarioActivo.rol === 'superadmin') colorRol = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (usuarioActivo.rol === 'admin') colorRol = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

    badgeUsuario.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden">
            <span class="text-[10px] text-slate-400 uppercase font-semibold shrink-0">Op:</span>
            <span class="text-xs font-bold text-white truncate max-w-[110px]" title="${usuarioActivo.nombre}">${usuarioActivo.nombre}</span>
        </div>
        <span class="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${colorRol} shrink-0">${usuarioActivo.rol}</span>
    `;

    if (usuarioActivo.rol === 'cajero') {
        inputTasa.disabled = true;
        inputTasa.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
        inputTasa.disabled = false;
        inputTasa.classList.remove('opacity-40', 'cursor-not-allowed');
    }
}

// --- NUEVO PEDIDO ---
function abrirModalNuevoPedido() { document.getElementById('modalNuevoPedido').classList.remove('hidden'); }
function cerrarModalNuevoPedido() { document.getElementById('modalNuevoPedido').classList.add('hidden'); }

function agregarFilaArticulo() {
    const div = document.createElement('div');
    div.className = "flex gap-2 articulo-fila";
    div.innerHTML = `
        <input type="number" value="1" min="1" class="w-16 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm text-center item-qty" placeholder="Cant">
        <input type="text" class="flex-1 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm item-name" placeholder="Nombre del plato">
        <input type="number" step="0.01" min="0" class="w-24 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm item-price" placeholder="Precio ($)">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 w-8 flex items-center justify-center cursor-pointer transition">
            <i class="fa-solid fa-trash"></i>
        </button>`;
    document.getElementById('contenedorArticulos').appendChild(div);
}

async function enviarNuevoPedido() {
    const btn = document.getElementById('btnEnviarNuevoPedido');
    const cliente = document.getElementById('inputCliente').value.trim();
    if(!cliente) { alert("Por favor ingresa el nombre del cliente."); return; }

    const articulos = Array.from(document.querySelectorAll('.articulo-fila')).map(f => ({
        qty: parseInt(f.querySelector('.item-qty').value) || 1,
        name: f.querySelector('.item-name').value.trim() || 'Artículo sin nombre',
        price: parseFloat(f.querySelector('.item-price').value) || 0
    }));
    
    const payload = {
        cliente: cliente, telefono: document.getElementById('inputTelefono').value.trim() || 'No registrado',
        tipo_entrega: document.getElementById('inputEntrega').value, metodo_pago: document.getElementById('inputPago').value,
        direccion: document.getElementById('inputDireccion').value.trim() || 'En el local', articulos: articulos,
        timestamp: new Date().toISOString()
    };

    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
    try {
        const res = await fetch(URL_NUEVO_PEDIDO, { method: 'POST', body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'} });
        if(res.ok) { 
            document.getElementById('formNuevoPedido').reset();
            document.getElementById('contenedorArticulos').innerHTML = `<div class="flex gap-2 articulo-fila"><input type="number" value="1" min="1" class="w-16 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm text-center item-qty" placeholder="Cant"><input type="text" class="flex-1 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm item-name" placeholder="Nombre del plato"><input type="number" step="0.01" min="0" class="w-24 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm item-price" placeholder="Precio ($)"><div class="w-8"></div></div>`;
            cerrarModalNuevoPedido(); cargarPedidos(); 
        } else alert("Error al guardar el pedido en el servidor.");
    } catch(e) { alert("Error de conexión al intentar enviar el pedido."); } 
    finally { btn.disabled = false; btn.innerHTML = 'Procesar Pedido <i class="fa-solid fa-paper-plane"></i>'; }
}

function abrirModalEditarPedido(idReal, idVisual) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    if (!pedido) return;
    document.getElementById('editIdReal').value = idReal;
    document.getElementById('txtEditIdVisual').innerText = `#${idVisual}`;
    document.getElementById('editCliente').value = pedido.cliente || pedido['Cliente'] || '';
    document.getElementById('buscadorMenu').value = '';
    document.getElementById('listaSugerencias').classList.add('hidden');
    
    carritoEdicion = [];
    const textoDetallado = pedido.pedido_detallado || pedido['Pedido Detallado'] || '';
    const lineas = textoDetallado.split('\n');
    lineas.forEach(linea => {
        const match = linea.trim().match(/^(\d+)[xX]\s+(.+)$/);
        if (match) {
            const cant = parseInt(match[1]); const nombreStr = match[2].trim();
            const itemCat = typeof CATALOGO_PRODUCTOS !== 'undefined' ? CATALOGO_PRODUCTOS.find(p => p.name.toLowerCase() === nombreStr.toLowerCase()) : null;
            const precio = itemCat ? itemCat.price : 0; 
            carritoEdicion.push({ id: itemCat ? itemCat.id : 'custom', name: nombreStr, price: precio, qty: cant });
        }
    });
    if (carritoEdicion.length === 0 && textoDetallado !== '') carritoEdicion.push({ id: 'custom', name: textoDetallado, price: parseFloat(pedido.total_orden) || 0, qty: 1 });
    renderizarCarritoEdicion();
    document.getElementById('modalEditarPedido').classList.remove('hidden');
}

function renderizarCarritoEdicion() {
    const contenedor = document.getElementById('listaEdicionArticulos');
    contenedor.innerHTML = ''; totalEdicionUSD = 0;
    const tasaActual = parseFloat(document.getElementById('tasaBCV').value) || 1;

    if (carritoEdicion.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-slate-500 italic text-center py-4">El carrito está vacío. Busca un producto arriba.</p>';
        document.getElementById('txtEditTotalVisual').innerHTML = '$0.00';
        return;
    }

    carritoEdicion.forEach((item, index) => {
        const subtotal = item.price * item.qty;
        totalEdicionUSD += subtotal;
        const precioUnidadBs = (item.price * tasaActual).toFixed(2);
        const subtotalBs = (subtotal * tasaActual).toFixed(2);

        contenedor.innerHTML += `
            <div class="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700">
                <div class="flex-1">
                    <p class="text-sm text-white font-semibold leading-tight">${item.name}</p>
                    <p class="text-xs text-slate-400 mt-0.5">$${item.price.toFixed(2)} c/u <span class="text-[10px] text-amber-400 ml-1">(Bs. ${precioUnidadBs})</span></p>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center bg-slate-900 border border-slate-700 rounded-md overflow-hidden">
                        <button onclick="modificarCantEdicion(${index}, -1)" class="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"><i class="fa-solid fa-minus text-[10px]"></i></button>
                        <span class="text-sm text-white w-6 text-center font-bold">${item.qty}</span>
                        <button onclick="modificarCantEdicion(${index}, 1)" class="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"><i class="fa-solid fa-plus text-[10px]"></i></button>
                    </div>
                    <div class="flex flex-col text-right w-16">
                        <span class="text-sm font-bold text-amber-400">$${subtotal.toFixed(2)}</span>
                        <span class="text-[10px] font-bold text-amber-400">Bs. ${subtotalBs}</span>
                    </div>
                    <button onclick="eliminarItemEdicion(${index})" class="text-red-500 hover:text-red-400 p-1 cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>`;
    });
    const totalEdicionBs = (totalEdicionUSD * tasaActual).toFixed(2);
    document.getElementById('txtEditTotalVisual').innerHTML = `<div class="flex flex-col text-right"><span class="text-emerald-400">$${totalEdicionUSD.toFixed(2)}</span><span class="text-xs text-amber-400 mt-0.5">Bs. ${totalEdicionBs}</span></div>`;
}

function modificarCantEdicion(index, cambio) { carritoEdicion[index].qty += cambio; if (carritoEdicion[index].qty <= 0) carritoEdicion.splice(index, 1); renderizarCarritoEdicion(); }
function eliminarItemEdicion(index) { carritoEdicion.splice(index, 1); renderizarCarritoEdicion(); }

function buscarProducto(texto) {
    const sugerenciasDiv = document.getElementById('listaSugerencias');
    if (!texto || texto.length < 2) { sugerenciasDiv.classList.add('hidden'); return; }
    const textoMinus = texto.toLowerCase();
    const resultados = typeof CATALOGO_PRODUCTOS !== 'undefined' ? CATALOGO_PRODUCTOS.filter(p => p.name.toLowerCase().includes(textoMinus)) : [];
    if (resultados.length > 0) {
        sugerenciasDiv.innerHTML = resultados.map(p => `<div onclick="agregarAlCarritoEdicion('${p.id}')" class="p-3 border-b border-slate-600 hover:bg-slate-600 cursor-pointer transition flex justify-between items-center"><span class="text-sm text-white">${p.name}</span><span class="text-xs font-bold text-emerald-400">$${p.price.toFixed(2)}</span></div>`).join('');
        sugerenciasDiv.classList.remove('hidden');
    } else { sugerenciasDiv.innerHTML = '<div class="p-3 text-sm text-slate-400 italic">No se encontraron productos</div>'; sugerenciasDiv.classList.remove('hidden'); }
}

function agregarAlCarritoEdicion(idProducto) {
    const producto = CATALOGO_PRODUCTOS.find(p => p.id === idProducto); if (!producto) return;
    const existeIndex = carritoEdicion.findIndex(item => item.name === producto.name);
    if (existeIndex >= 0) carritoEdicion[existeIndex].qty += 1; else carritoEdicion.push({ id: producto.id, name: producto.name, price: producto.price, qty: 1 });
    document.getElementById('buscadorMenu').value = ''; document.getElementById('listaSugerencias').classList.add('hidden'); renderizarCarritoEdicion();
}

function cerrarModalEditar() { document.getElementById('modalEditarPedido').classList.add('hidden'); }

function guardarEdicionPedido() {
    const idReal = document.getElementById('editIdReal').value; 
    const nuevoCliente = document.getElementById('editCliente').value.trim();
    const pedidoIndex = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    
    if(pedidoIndex === -1) return;
    
    const pedidoAnterior = pedidosEnMemoria[pedidoIndex]; 
    const nuevoDetalle = carritoEdicion.map(item => `${item.qty}x ${item.name}`).join('\n');

    pedidosEnMemoria[pedidoIndex].cliente = nuevoCliente; 
    pedidosEnMemoria[pedidoIndex].pedido_detallado = nuevoDetalle; 
    pedidosEnMemoria[pedidoIndex].total_orden = totalEdicionUSD;
    renderizarTablero(); 
    cerrarModalEditar();

    const payloadBD = {
        id: idReal, estado: pedidoAnterior.estado || 'Pago Pendiente', cliente: nuevoCliente, pedido_detallado: nuevoDetalle, total_orden: totalEdicionUSD,   
        telefono: pedidoAnterior.telefono || '', tipo_entrega: pedidoAnterior.tipo_entrega || '', procesado_por: usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado",
        referencia_pago: pedidoAnterior.referencia_pago || pedidoAnterior.Referencia_pago || "", imagen_pago: pedidoAnterior.imagen_pago || pedidoAnterior.Imagen_pago || ""
    };
    fetch(API_ACTUALIZAR_ESTADO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadBD) }).catch(e => console.error("Error BD:", e));

    const tasaActual = parseFloat(document.getElementById('tasaBCV').value) || 1;
    const metodoPago = String(pedidoAnterior.metodo_pago || pedidoAnterior['Método de pago'] || pedidoAnterior.Metodo_pago || '').toLowerCase();
    const esPagoMovil = metodoPago.includes('pago') || metodoPago.includes('movil') || metodoPago.includes('móvil');
    
    let textoAdicionalBs = "";
    if (esPagoMovil) {
        const totalBs = (totalEdicionUSD * tasaActual).toFixed(2);
        textoAdicionalBs = `\nEquivalente en Bolívares: *Bs. ${totalBs}*`;
    }

    const payloadNotificacion = {
        telefono: pedidoAnterior.telefono || '',
        cliente: nuevoCliente,
        pedido_detallado: nuevoDetalle,
        total_orden: totalEdicionUSD,
        texto_bolivares: textoAdicionalBs 
    };
    
    fetch("https://n8n-production-633e.up.railway.app/webhook/notificar-edicion", { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadNotificacion) 
    }).catch(e => console.error("Error enviando WhatsApp:", e));
}

// --- CANCELAR PEDIDO ---
function cancelarPedido(idPedido) {
    if (!confirm("¿Estás seguro de que deseas eliminar este pedido sin pagar? Desaparecerá del tablero.")) return;
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedido));
    if (index !== -1) { pedidosEnMemoria[index].estado = 'Cancelado'; renderizarTablero(); }
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    const payload = {
        id: idPedido, estado: 'Cancelado', telefono: pedido.telefono || '', cliente: pedido.cliente || '', tipo_entrega: pedido.tipo_entrega || '', 
        procesado_por: operadorFirma, referencia_pago: pedido.referencia_pago || "", imagen_pago: pedido.imagen_pago || "",
        pedido_detallado: pedido.pedido_detallado || "", total_orden: parseFloat(pedido.total_orden || pedido['Total Orden']) || 0, tiempo_estimado: ""
    };
    fetch(API_ACTUALIZAR_ESTADO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(e => console.error(e));
}

// --- COMPROBANTES Y TIEMPO ---
document.getElementById('inputImagenPago').addEventListener('change', function(event) {
    const file = event.target.files[0]; const preview = document.getElementById('previewComprobante');
    if (file) { const reader = new FileReader(); reader.onload = function(e) { preview.src = e.target.result; preview.classList.remove('hidden'); }; reader.readAsDataURL(file); } 
    else { preview.src = ""; preview.classList.add('hidden'); }
});

function pedirComprobantePago(metodoPago) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalComprobante'); const contenedorRef = document.getElementById('contenedorReferencia');
        const inputRef = document.getElementById('inputReferencia'); const inputImg = document.getElementById('inputImagenPago');
        const preview = document.getElementById('previewComprobante'); const txtMetodo = document.getElementById('txtMetodoPagoModal');

        inputRef.value = ''; inputImg.value = ''; preview.src = ''; preview.classList.add('hidden');
        const metodoLimpio = metodoPago || "Desconocido"; txtMetodo.innerText = `Método de pago del cliente: ${metodoLimpio}`;
        if (metodoLimpio.toLowerCase().includes('efectivo')) contenedorRef.classList.add('hidden'); else contenedorRef.classList.remove('hidden');
        modal.classList.remove('hidden');

        document.getElementById('btnAceptarComprobante').onclick = () => {
            if (!contenedorRef.classList.contains('hidden') && inputRef.value.trim() === '') { alert("Por favor, ingresa el número de referencia."); return; }
            modal.classList.add('hidden'); resolve({ referencia: inputRef.value, imagen: (inputImg.files.length > 0) ? preview.src : "" }); 
        };
        document.getElementById('btnCancelarComprobante').onclick = () => { modal.classList.add('hidden'); resolve(null); };
    });
}

function pedirTiempoEstimado() {
    return new Promise((resolve) => {
        resolveTiempoEstimado = resolve;
        document.getElementById('inputTiempoPersonalizado').value = '';
        document.getElementById('modalTiempoEstimado').classList.remove('hidden');
    });
}
function seleccionarTiempo(minutos) {
    if (!minutos || minutos.trim() === '') { alert('Por favor ingresa un tiempo válido.'); return; }
    document.getElementById('modalTiempoEstimado').classList.add('hidden');
    if (resolveTiempoEstimado) resolveTiempoEstimado(minutos);
}
function cancelarTiempoEstimado() {
    document.getElementById('modalTiempoEstimado').classList.add('hidden');
    if (resolveTiempoEstimado) resolveTiempoEstimado(null);
}

// --- FLUJO DE ESTADOS ---
async function procesarPasoCocina(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const metodoPago = pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '';
    const telefono = pedido.telefono || pedido['Teléfono'] || ''; const cliente = pedido.cliente || pedido['Cliente'] || '';
    const tipoEntrega = pedido.tipo_entrega || pedido['Tipo de entrega'] || pedido.Tipo_entrega || '';

    const datosPago = await pedirComprobantePago(metodoPago); if (!datosPago) return; 
    const tiempoEstimado = await pedirTiempoEstimado(); if (!tiempoEstimado) return; 

    ejecutarActualizacion(idPedido, 'En Cocina', telefono, cliente, tipoEntrega, datosPago, tiempoEstimado);
}

function procesarPasoFinalizado(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const telefono = pedido.telefono || pedido['Teléfono'] || ''; const cliente = pedido.cliente || pedido['Cliente'] || '';
    const tipoEntrega = pedido.tipo_entrega || pedido['Tipo de entrega'] || pedido.Tipo_entrega || '';
    ejecutarActualizacion(idPedido, 'Finalizado', telefono, cliente, tipoEntrega, null, "");
}

function ejecutarActual
