// Tokio Sushi - Núcleo de Operaciones y Control del Sistema

const API_OBTENER_PEDIDOS = "http://localhost:5678/webhook/obtener-pedidos";
const API_ACTUALIZAR_ESTADO = "http://localhost:5678/webhook/actualizar-estado";
const URL_NUEVO_PEDIDO = "http://localhost:5678/webhook/Prueba-tokyo";
const URL_OBTENER_MENU = "http://localhost:5678/webhook/obtener-menu";
const URL_OBTENER_USUARIOS = "http://localhost:5678/webhook/obtener-usuarios";

// NUEVAS URLs PARA EL PANEL DE ADMINISTRACIÓN
const URL_GUARDAR_PRODUCTO = "http://localhost:5678/webhook/guardar-producto";
const URL_GUARDAR_COMBO = "http://localhost:5678/webhook/guardar-combo";

let USUARIOS_SISTEMA = [];
let CATALOGO_PRODUCTOS = []; // Catálogo unificado para el buscador de pedidos
let inventarioProductosBase = []; // Solo productos individuales (para armar combos)
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
        let todosLosItems = [];

        // Si viene con la nueva estructura modular de n8n
        if (data.menu) {
            inventarioProductosBase = data.menu.productos || [];
            if (data.menu.productos) todosLosItems = todosLosItems.concat(data.menu.productos);
            if (data.menu.combos) todosLosItems = todosLosItems.concat(data.menu.combos);
        } 
        // Respaldo por si viene como array simple antiguo
        else if (Array.isArray(data)) {
            todosLosItems = data;
            inventarioProductosBase = data; 
        }

        // Mapeamos los datos unificados al formato que usa tu buscador de pedidos
        CATALOGO_PRODUCTOS = todosLosItems.map(item => ({
            id: item.id,
            name: item.nombre,
            price: parseFloat(item.precio)
        }));
        
        console.log("Catálogo interno cargado:", CATALOGO_PRODUCTOS.length, "ítems totales listos para edición.");
        
        // Si estamos en admin.html, actualizamos la primera fila del combo
        if (document.getElementById('lista-items-combo') && document.getElementById('lista-items-combo').innerHTML === '') {
            agregarFilaProducto();
        }
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
    if (!inputTasa) return;
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

if (document.getElementById('tasaBCV')) {
    document.getElementById('tasaBCV').addEventListener('input', (e) => {
        localStorage.setItem('tasaBCV', e.target.value);
        renderizarTablero(); 
    });
}

// --- SESIONES (RBAC) ---
function verificarSesion() {
    const sesionGuardada = localStorage.getItem('usuarioActivo');
    const vistaLogin = document.getElementById('vistaLogin');
    const vistaDashboard = document.getElementById('vistaDashboard');
    
    if (!vistaLogin || !vistaDashboard) return;

    if (sesionGuardada) {
        usuarioActivo = JSON.parse(sesionGuardada);
        aplicarRestriccionesRol();
        vistaLogin.classList.add('hidden');
        vistaDashboard.classList.remove('hidden');
        vistaDashboard.classList.add('flex');
        cargarPedidos();
    } else {
        usuarioActivo = null;
        clearInterval(pollingTimer);
        vistaLogin.classList.remove('hidden');
        vistaDashboard.classList.add('hidden');
        vistaDashboard.classList.remove('flex');
    }
}

// --- SESIONES (RBAC) ---
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
    if (!usuarioActivo || !badgeUsuario || !inputTasa) return;

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
    
    // Aquí puedes cambiar a tu nueva URL local si lo deseas
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
if (document.getElementById('inputImagenPago')) {
    document.getElementById('inputImagenPago').addEventListener('change', function(event) {
        const file = event.target.files[0]; const preview = document.getElementById('previewComprobante');
        if (file) { const reader = new FileReader(); reader.onload = function(e) { preview.src = e.target.result; preview.classList.remove('hidden'); }; reader.readAsDataURL(file); } 
        else { preview.src = ""; preview.classList.add('hidden'); }
    });
}

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

function ejecutarActualizacion(id, estado, telefono, cliente, tipoEntrega, datosPago, tiempoEstimado = "") {
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(id));
    if (index === -1) return; const pedidoViejo = pedidosEnMemoria[index];

    const refGuardada = pedidoViejo.referencia_pago || pedidoViejo['Referencia_pago'] || pedidoViejo.Referencia_pago || "";
    const imgGuardada = pedidoViejo.imagen_pago || pedidoViejo['Imagen_pago'] || pedidoViejo['Imagen Pago'] || "";
    const nuevaRef = datosPago ? datosPago.referencia : refGuardada; const nuevaImg = datosPago ? datosPago.imagen : imgGuardada;

    pedidosEnMemoria[index].estado = estado; pedidosEnMemoria[index].procesado_por = operadorFirma;
    pedidosEnMemoria[index].referencia_pago = nuevaRef; pedidosEnMemoria[index].imagen_pago = nuevaImg;
    renderizarTablero(); 

    const payload = {
        id: id, estado: estado, telefono: telefono, cliente: cliente, tipo_entrega: tipoEntrega, procesado_por: operadorFirma,
        referencia_pago: nuevaRef, imagen_pago: nuevaImg, pedido_detallado: pedidoViejo.pedido_detallado || pedidoViejo['Pedido Detallado'] || "",
        total_orden: parseFloat(pedidoViejo.total_orden || pedidoViejo['Total Orden']) || 0, tiempo_estimado: tiempoEstimado
    };
    fetch(API_ACTUALIZAR_ESTADO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(e => console.error(e));
}

// --- FECHAS Y RENDERIZADO ---
function esPedidoDeLaFecha(filaTexto) {
    if (!filaTexto) return false;
    
    let pedidoObj;
    try { pedidoObj = JSON.parse(filaTexto); } 
    catch(e) { return false; }

    const inputFecha = document.getElementById('calendarioFiltro') ? document.getElementById('calendarioFiltro').value : '';
    const fechaDeseada = inputFecha || new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'}); 

    const fechaRaw = pedidoObj.timestamp || pedidoObj['Timestamp'];
    if (!fechaRaw) return true;

    try {
        const d = new Date(fechaRaw);
        const fechaLocal = d.toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
        return fechaLocal === fechaDeseada;
    } catch(e) {
        return true;
    }
}

function normalizarEstado(estadoRaw) { return (!estadoRaw) ? '' : estadoRaw.replace(/[\s\uFEFF\xA0]+/g, '').toLowerCase(); }

function resetearYArrancarPolling() {
    if (!document.getElementById('contadorSegundos')) return;
    segundosFaltantes = 15; document.getElementById('contadorSegundos').innerText = segundosFaltantes;
    clearInterval(pollingTimer);
    pollingTimer = setInterval(() => {
        segundosFaltantes--; document.getElementById('contadorSegundos').innerText = segundosFaltantes;
        if (segundosFaltantes <= 0) { cargarPedidos(); segundosFaltantes = 15; }
    }, 1000);
}

async function cargarPedidos() {
    try {
        const fechaCalendario = document.getElementById('calendarioFiltro') ? document.getElementById('calendarioFiltro').value : '';
        let urlFetch = API_OBTENER_PEDIDOS + '?_t=' + new Date().getTime();
        if (fechaCalendario) urlFetch += '&fecha=' + fechaCalendario;
        const response = await fetch(urlFetch); if (!response.ok) throw new Error('Error API');
        const datos = await response.json(); pedidosEnMemoria = Array.isArray(datos) ? datos : [];
        renderizarTablero(); resetearYArrancarPolling();
    } catch (error) { console.error(error); }
}

// --- ALGORITMO RENDERIZADOR Y MAPEO DE TURNOS ---
function renderizarTablero() {
    const colPagoPendiente = document.getElementById('columnaPagoPendiente');
    const colEnCocina = document.getElementById('columnaEnCocina');
    const colFinalizado = document.getElementById('columnaFinalizado');

    if (!colPagoPendiente || !colEnCocina || !colFinalizado) return;

    colPagoPendiente.innerHTML = ''; colEnCocina.innerHTML = ''; colFinalizado.innerHTML = '';

    let conteoPago = 0, conteoCocina = 0, conteoFinalizado = 0;
    let totalVentasDia = 0; 
    const inputTasa = document.getElementById('tasaBCV');
    const tasaActual = inputTasa ? (parseFloat(inputTasa.value) || 1) : 1;

    const pedidosHoy = pedidosEnMemoria.filter(p => esPedidoDeLaFecha(JSON.stringify(p)));
    pedidosHoy.sort((a, b) => parseInt(String(a.id_pedido || a.ID || 0).replace(/\D/g,'')) - parseInt(String(b.id_pedido || b.ID || 0).replace(/\D/g,'')));
    const mapaIdsDiarios = {};
    pedidosHoy.forEach((p, index) => {
        const id = p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID';
        mapaIdsDiarios[id] = index + 1; 
    });

    pedidosEnMemoria.forEach(pedido => {
        if (!esPedidoDeLaFecha(JSON.stringify(pedido))) return;

        const idReal = pedido.id_pedido || pedido['ID_Pedido'] || pedido.ID || 'S/ID';
        const idVisual = mapaIdsDiarios[idReal] || idReal;

        const cliente = pedido.cliente || 'Desconocido';
        const telefonoRaw = pedido.telefono || '';
        const metodoPago = String(pedido.metodo_pago || '').replace(/'/g, "\\'");
        const esPagoMovil = metodoPago.toLowerCase().includes('pago') || metodoPago.toLowerCase().includes('movil');
        const monto = parseFloat(String(pedido.total_orden || pedido.monto || 0).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        
        let htmlMonto = `<span class="text-xs font-bold text-slate-300">$${monto.toFixed(2)}</span>`;
        if (esPagoMovil) htmlMonto = `<div class="flex flex-col"><span class="text-xs font-bold text-slate-300">$${monto.toFixed(2)}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${(monto * tasaActual).toFixed(2)}</span></div>`;
        
        let hora = '--:--';
        if (pedido.timestamp) {
            try {
                if (pedido.timestamp.includes('T')) hora = new Date(pedido.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
                else { const m = pedido.timestamp.match(/(\d{1,2}):(\d{2})/); if(m) { let h = parseInt(m[1],10); const ampm = h >= 12 ? 'PM':'AM'; h = h % 12 || 12; hora = `${h}:${m[2]} ${ampm}`; } }
            } catch(e){}
        }
        
        const art = pedido.pedido_detallado || 'Detalle no disponible'; 
        const estadoLimpio = normalizarEstado(String(pedido.estado || ''));

        let btnWhatsApp = '';
        const telLimpio = String(telefonoRaw).replace(/\D/g, ''); 
        if (telLimpio.length >= 10) {
            let telWA = telLimpio;
            if (telWA.startsWith('0')) telWA = '58' + telWA.substring(1);
            else if (!telWA.startsWith('58')) telWA = '58' + telWA;
            const esMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const urlWA = esMovil ? `https://wa.me/${telWA}` : `https://web.whatsapp.com/send?phone=${telWA}`;
            btnWhatsApp = `<a href="${urlWA}" target="_blank" onclick="event.stopPropagation()" class="text-slate-400 hover:text-emerald-400 transition cursor-pointer ml-1" title="Abrir chat en WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`;
        }

        if (estadoLimpio === 'pagopendiente') {
            conteoPago++;
            colPagoPendiente.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">#${idVisual}</span>
                            <button onclick="abrirModalDetalle('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer"><i class="fa-solid fa-file-lines"></i></button>
                            <button onclick="abrirModalEditarPedido('${idReal}', '${idVisual}')" class="text-slate-400 hover:text-amber-400 transition cursor-pointer"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="cancelarPedido('${idReal}')" class="text-slate-400 hover:text-red-500 transition cursor-pointer"><i class="fa-solid fa-trash"></i></button>
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${cliente}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${art}</p></div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPasoCocina('${idReal}')" class="bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Aceptar <i class="fa-solid fa-arrow-right"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'encocina') {
            conteoCocina++;
            colEnCocina.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-sky-500/10 hover:border-sky-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded border border-sky-400/20">#${idVisual}</span>
                            <button onclick="abrirModalDetalle('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer"><i class="fa-solid fa-file-lines"></i></button>
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${cliente}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${art}</p></div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPasoFinalizado('${idReal}')" class="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Despachar <i class="fa-solid fa-check"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'finalizado') {
            conteoFinalizado++; totalVentasDia += monto; 
            let htmlMontoFinalizado = `<span class="text-sm font-bold text-emerald-400">$${monto.toFixed(2)}</span>`;
            if (esPagoMovil) htmlMontoFinalizado = `<div class="flex flex-col text-right"><span class="text-sm font-bold text-emerald-400">$${monto.toFixed(2)}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${(monto * tasaActual).toFixed(2)}</span></div>`;
            colFinalizado.innerHTML += `
                <div onclick="abrirModalDetalle('${idReal}')" class="bg-slate-700/20 hover:bg-slate-700/50 p-3 rounded-lg border border-emerald-500/10 hover:border-emerald-500/30 transition flex justify-between items-center cursor-pointer">
                    <div class="flex items-center gap-2"><span class="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded border border-emerald-400/20">#${idVisual}</span><span class="text-xs text-slate-400">Ver Recibo</span>${btnWhatsApp}</div>
                    ${htmlMontoFinalizado}
                </div>`;
        }
    });

    document.getElementById('cantPagoPendiente').innerText = conteoPago; document.getElementById('cantEnCocina').innerText = conteoCocina; document.getElementById('cantFinalizado').innerText = conteoFinalizado;
    if (document.getElementById('totalDiaBottom')) document.getElementById('totalDiaBottom').innerHTML = `<div class="flex flex-col text-right leading-tight"><span class="text-lg font-bold text-emerald-400">$${totalVentasDia.toFixed(2)}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${(totalVentasDia * tasaActual).toFixed(2)}</span></div>`;
}

// --- VER RECIBOS ---
function verComprobanteDeMemoria(idReal) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal)); if (!pedido) return;
    const imgData = pedido.imagen_pago || pedido.Imagen_pago || '';
    if (imgData.startsWith('http')) window.open(imgData, '_blank');
    else if (imgData.length > 50) {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Comprobante #${idReal}</title></head><body style="margin:0; background:#0f172a; display:flex; justify-content:center; align-items:center; min-height:100vh;"><img src="${imgData}" style="max-width:100%; max-height:100vh; border-radius:8px;"/></body></html>`);
        w.document.close();
    }
}

function abrirModalDetalle(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const idReal = pedido.id_pedido || pedido['ID_Pedido'] || 'S/ID'; const idVisual = String(idReal).split('-').pop();
    const cliente = pedido.cliente || 'Registrado'; const tel = pedido.telefono || 'No registrado';
    const entrega = pedido.tipo_entrega || 'No definido'; const dir = pedido.direccion || 'No especificada';
    const pago = pedido.metodo_pago || 'No especificado'; const arts = pedido.pedido_detallado || '';
    const img = pedido.imagen_pago || ''; const ref = pedido.referencia_pago || '';
    const monto = parseFloat(String(pedido.total_orden || 0).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    const operador = pedido.procesado_por || 'Sin registro';

    document.getElementById('modalID').innerText = `ID Base de datos: #${idVisual}`;
    let seccionVES = '';
    if (pago.toLowerCase().includes('pago') || pago.toLowerCase().includes('movil')) {
        const inputTasa = document.getElementById('tasaBCV');
        const t = inputTasa ? (parseFloat(inputTasa.value) || 1.0) : 1.0;
        seccionVES = `<div class="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mt-2 text-amber-300 text-xs text-center font-bold">Total en Bolívares: Bs. ${(monto * t).toFixed(2)} (Tasa: ${t.toFixed(2)} Bs/$)</div>`;
    }
    let refHtml = ref ? `<p class="text-xs text-amber-400 mt-1 font-mono bg-slate-900 border border-slate-700 px-2 py-1 rounded inline-block">Ref: ${ref}</p>` : '';
    let btnImg = (img && img !== 'Sin comprobante' && (img.startsWith('http') || img.length > 50)) ? `<div class="border-t border-slate-700/50 pt-3 flex justify-center"><button onclick="verComprobanteDeMemoria('${idReal}')" class="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer w-full justify-center"><i class="fa-solid fa-image"></i> Ver Comprobante</button></div>` : '';

    document.getElementById('modalCuerpo').innerHTML = `<div class="space-y-3.5"><div class="flex justify-between"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cliente</span><p class="font-bold text-white text-base">${cliente}</p><p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-phone"></i> ${tel}</p></div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Despachado por</span><p class="text-xs text-white bg-slate-900 border border-slate-700 px-2 py-1 rounded mt-1 font-semibold">${operador}</p></div></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Método de Distribución</span><p class="text-white text-xs mt-0.5 font-medium">${entrega}</p><p class="text-xs text-slate-400 mt-1 bg-slate-900/40 p-2 rounded border border-slate-700/30 italic">${dir}</p></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Productos</span><div class="text-xs bg-slate-900/40 p-2.5 rounded border border-slate-700/30 whitespace-pre-line max-h-32 overflow-y-auto text-slate-300 font-mono">${arts}</div></div><div class="border-t border-slate-700/50 pt-2.5 flex justify-between items-center"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Forma de Pago</span><p class="text-white text-xs font-semibold">${pago}</p>${refHtml}</div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total</span><p class="text-emerald-400 font-bold text-lg">$${monto.toFixed(2)}</p></div></div>${seccionVES}${btnImg}</div>`;
    document.getElementById('modalDetalle').classList.remove('hidden');
}
function cerrarModal() { document.getElementById('modalDetalle').classList.add('hidden'); }


// =====================================================================
// --- LÓGICA EXCLUSIVA DEL PANEL DE ADMINISTRACIÓN (admin.html) ---
// =====================================================================

function agregarFilaProducto() {
    const contenedor = document.getElementById('lista-items-combo');
    if (!contenedor) return; 

    const fila = document.createElement('div');
    fila.className = 'fila-item-combo'; 
    fila.style.display = 'flex';
    fila.style.gap = '10px';
    fila.style.marginBottom = '10px';

    // Construimos el desplegable utilizando SOLO los productos base
    let opcionesHTML = '<option value="">-- Selecciona un producto --</option>';
    inventarioProductosBase.forEach(prod => {
        opcionesHTML += `<option value="${prod.id}">${prod.nombre} ($${prod.precio})</option>`;
    });

    fila.innerHTML = `
        <select class="item-select" required style="flex: 2; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px;">
            ${opcionesHTML}
        </select>
        <input type="number" class="item-cantidad" min="1" value="1" required style="flex: 1; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px;" placeholder="Cant.">
        <button type="button" onclick="this.parentElement.remove()" style="background: #e11d48; color: white; border: none; border-radius: 4px; padding: 0 15px; cursor: pointer; font-weight: bold;">X</button>
    `;
    contenedor.appendChild(fila);
}

// --- ARRANQUE Y MANEJADORES DE EVENTOS ---
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicialización del Dashboard Principal
    const cal = document.getElementById('calendarioFiltro');
    if (cal) {
        cal.value = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
        cal.addEventListener('change', () => { 
            document.getElementById('columnaFinalizado').innerHTML = '<p class="text-slate-400 text-center text-xs mt-4">Buscando en el historial...</p>'; 
            cargarPedidos(); 
        });
    }
    
    await actualizarTasaBCV(); 
    await cargarCatalogoDesdeDB(); 
    await cargarUsuariosDesdeDB();
    verificarSesion();

    // 2. Inicialización del Panel de Administración (Si detecta los elementos)
    const btnAdd = document.getElementById('btn-add-item');
    if (btnAdd) {
        btnAdd.addEventListener('click', agregarFilaProducto);
    }

    const formProducto = document.getElementById('form-producto');
    if (formProducto) {
        formProducto.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                nombre: document.getElementById('prod-nombre').value,
                categoria: document.getElementById('prod-categoria').value,
                precio: parseFloat(document.getElementById('prod-precio').value),
                descripcion: document.getElementById('prod-descripcion').value,
                disponible: true
            };
            try {
                await fetch(URL_GUARDAR_PRODUCTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                alert('🍣 ¡Producto guardado con éxito!');
                formProducto.reset();
                await cargarCatalogoDesdeDB(); // Recargamos para que el armador se actualice
                document.getElementById('lista-items-combo').innerHTML = ''; 
                agregarFilaProducto();
            } catch (error) { alert('Error al guardar el producto.'); }
        });
    }

    const formCombo = document.getElementById('form-combo');
    if (formCombo) {
        formCombo.addEventListener('submit', async (e) => {
            e.preventDefault();
            const itemsSeleccionados = [];
            
            document.querySelectorAll('.fila-item-combo').forEach(fila => {
                const select = fila.querySelector('.item-select');
                const cantidad = fila.querySelector('.item-cantidad');
                if (select.value) { 
                    itemsSeleccionados.push({ producto_id: parseInt(select.value), cantidad: parseInt(cantidad.value) });
                }
            });

            if (itemsSeleccionados.length === 0) { alert('Debes agregar al menos un producto al combo.'); return; }

            const payload = {
                nombre: document.getElementById('combo-nombre').value,
                precio: parseFloat(document.getElementById('combo-precio').value),
                imagen: document.getElementById('combo-imagen').value,
                descripcion: document.getElementById('combo-descripcion').value,
                items: itemsSeleccionados,
                disponible: true
            };

            try {
                await fetch(URL_GUARDAR_COMBO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                alert('🍱 ¡Combo creado y guardado con éxito!');
                formCombo.reset();
                document.getElementById('lista-items-combo').innerHTML = ''; 
                agregarFilaProducto(); 
            } catch (error) { alert('Error al guardar el combo.'); }
        });
    }
});
