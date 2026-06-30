// Tokio Sushi - Núcleo de Operaciones y Control del Sistema
const ADMIN_URL_GUARDAR_USUARIO = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-usuario";
const ADMIN_URL_ELIMINAR_USUARIO = "https://n8n-production-0c91c.up.railway.app/webhook/eliminar-usuario";

const URL_OBTENER_MOTORIZADOS = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-motorizados";
const ADMIN_URL_GUARDAR_MOT = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-motorizado";
const ADMIN_URL_ELIMINAR_MOT = "https://n8n-production-0c91c.up.railway.app/webhook/eliminar-motorizado";

let MOTORIZADOS_SISTEMA = []; // Memoria para los choferes

const API_OBTENER_PEDIDOS = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-pedidos";
const API_ACTUALIZAR_ESTADO = "https://n8n-production-0c91c.up.railway.app/webhook/actualizar-estado";
const URL_NUEVO_PEDIDO = "https://n8n-production-0c91c.up.railway.app/webhook/Prueba-tokyo";
const URL_OBTENER_MENU = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-menu";
const URL_OBTENER_USUARIOS = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-usuarios";

// NUEVAS URLs PARA EL PANEL DE ADMINISTRACIÓN
const URL_GUARDAR_PRODUCTO = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-producto";
const URL_GUARDAR_COMBO = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-combo";

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

// --- CARGAR CATÁLOGO DESDE LA BASE DE DATOS (ANTI-CACHÉ Y DESEMPAQUETADO) ---
async function cargarCatalogoDesdeDB() {
    try {
        // Le agregamos un número aleatorio a la URL para que Chrome no use datos viejos
        const urlFresca = URL_OBTENER_MENU + "?t=" + new Date().getTime();
        const response = await fetch(urlFresca);
        if (!response.ok) throw new Error('Error al conectar con el servidor de menú');
        
        const rawData = await response.json();
        
        // Desempaquetamos el Array si viene de n8n
        const data = (Array.isArray(rawData) && rawData[0].menu) ? rawData[0] : rawData;
        
        let todosLosItems = [];

        // Si viene con la nueva estructura modular de n8n
        if (data && data.menu) {
            inventarioProductosBase = data.menu.productos || [];
            if (data.menu.productos) todosLosItems = todosLosItems.concat(data.menu.productos);
            if (data.menu.combos) todosLosItems = todosLosItems.concat(data.menu.combos);
        } 
        // Respaldo por si viene como array simple antiguo
        else if (Array.isArray(data)) {
            todosLosItems = data;
            inventarioProductosBase = data; 
        }

        // Mapeamos los datos unificados al formato que usa el buscador
        CATALOGO_PRODUCTOS = todosLosItems.map(item => ({
            id: item.id,
            name: item.nombre,
            price: parseFloat(item.precio)
        }));
        
        console.log("🔥 Catálogo listo para sugerencias:", CATALOGO_PRODUCTOS.length, "ítems cargados.");
        
        // Si estamos en admin.html, actualizamos la primera fila del combo
        if (document.getElementById('lista-items-combo') && document.getElementById('lista-items-combo').innerHTML === '') {
            if (typeof agregarFilaProductoCombo === 'function') agregarFilaProductoCombo(); 
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

async function cargarMotorizadosDesdeDB() {
    try {
        const response = await fetch(URL_OBTENER_MOTORIZADOS + "?t=" + new Date().getTime());
        if (!response.ok) throw new Error('Error al conectar con servidor de motorizados');
        const data = await response.json();
        MOTORIZADOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        
        // Si estamos en el admin, dibujamos la lista
        if (document.getElementById('lista-motorizados-container')) {
            renderListaMotorizados();
        }
    } catch (error) { console.error("Error obteniendo motorizados:", error); }
}

// --- CONTROL DE TASA (VERSIÓN DEFINITIVA Y BLINDADA) ---
async function actualizarTasaBCV() {
    const inputTasa = document.getElementById('tasaBCV');
    if (!inputTasa) return;

    const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
    const tasaGuardada = localStorage.getItem('tasaBCV');
    const fechaTasa = localStorage.getItem('fechaTasa');

    // 1. EL CANDADO MANUAL: Tu salvavidas. Si fijaste la tasa a mano hoy, se bloquea la API.
    if (fechaTasa === hoy && tasaGuardada) {
        inputTasa.value = tasaGuardada;
        return; // Corta la ejecución aquí, tu número a mano está a salvo.
    }

    // 2. Consulta a la API más estable (DolarApi)
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (!response.ok) throw new Error('Error API BCV');
        
        const data = await response.json();
        
        if (data && data.promedio) {
            inputTasa.value = parseFloat(data.promedio).toFixed(2);
            
            // Guardamos la tasa automática y le ponemos la fecha de hoy
            localStorage.setItem('tasaBCV', inputTasa.value);
            localStorage.setItem('fechaTasa', hoy);
            
            inputTasa.classList.add('text-emerald-400');
            setTimeout(() => inputTasa.classList.remove('text-emerald-400'), 2000);
        }
    } catch (error) {
        console.error("Falló la conexión con DolarApi:", error);
        // Si la API falla o se cae el internet, carga la última que guardaste
        if (tasaGuardada) inputTasa.value = tasaGuardada;
    }
}

if (document.getElementById('tasaBCV')) {
    document.getElementById('tasaBCV').addEventListener('input', (e) => {
        const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
        localStorage.setItem('tasaBCV', e.target.value);
        localStorage.setItem('fechaTasa', hoy); // Activa el candado manual para el día de hoy
        renderizarTablero(); 
    });
}

// --- ESCUCHADOR DEL CALENDARIO ---
if (document.getElementById('calendarioFiltro')) {
    document.getElementById('calendarioFiltro').addEventListener('change', () => {
        // Al cambiar de día, limpiamos la pantalla, ponemos a cargar y pedimos los datos nuevos
        console.log("Cambiando fecha a:", document.getElementById('calendarioFiltro').value);
        pedidosEnMemoria = [];
        cargarPedidos();
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

// --- ABRIR MODAL (VERSIÓN BLINDADA) ---
async function abrirModalNuevoPedido() { 
    const contenedor = document.getElementById('contenedorArticulos');
    
    // ¡EL BLINDAJE!: Si la memoria está vacía, forzamos a descargar el menú en este instante
    if (CATALOGO_PRODUCTOS.length === 0) {
        console.log("Memoria vacía. Descargando menú fresco para las sugerencias...");
        await cargarCatalogoDesdeDB();
    }

    // Si la fila actual no tiene el buscador inteligente, la destruimos y creamos una nueva
    if (!contenedor.innerHTML.includes('sugerencias-')) {
        contenedor.innerHTML = '';
        agregarFilaArticulo();
    }
    
    document.getElementById('modalNuevoPedido').classList.remove('hidden'); 
}
function cerrarModalNuevoPedido() { document.getElementById('modalNuevoPedido').classList.add('hidden'); }

// 1. Dibuja la fila con un menú desplegable flotante oculto
function agregarFilaArticulo() {
    const puedeEditarPrecio = usuarioActivo && (usuarioActivo.rol === 'superadmin' || usuarioActivo.rol === 'admin');
    const atributoReadonly = puedeEditarPrecio ? '' : 'readonly';
    const claseFondoPrecio = puedeEditarPrecio 
        ? 'bg-slate-900 text-white' 
        : 'bg-slate-800 text-emerald-400 cursor-not-allowed border-slate-600 font-bold';

    const div = document.createElement('div');
    div.className = "flex gap-2 articulo-fila relative"; // El relative es vital aquí
    
    // Generamos un ID único para la cajita de sugerencias de esta fila
    const idSugerencia = 'sugerencias-' + Math.random().toString(36).substr(2, 9);

    div.innerHTML = `
        <input type="number" value="1" min="1" class="w-16 bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm text-center item-qty" placeholder="Cant">
        
        <div class="flex-1 relative">
            <input type="text" oninput="mostrarSugerenciasPedido(this, '${idSugerencia}')" class="w-full bg-slate-900 p-2 rounded-lg border border-slate-700 text-white text-sm item-name" placeholder="Escribe para buscar plato o combo..." autocomplete="off">
            <div id="${idSugerencia}" class="hidden absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto"></div>
        </div>
        
        <input type="number" step="0.01" min="0" class="w-24 p-2 rounded-lg border border-slate-700 text-sm text-center item-price ${claseFondoPrecio}" placeholder="Precio ($)" ${atributoReadonly}>
        
        <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 w-8 flex items-center justify-center cursor-pointer transition">
            <i class="fa-solid fa-trash"></i>
        </button>`;
        
    document.getElementById('contenedorArticulos').appendChild(div);
}

// 2. Filtra el catálogo en tiempo real mientras el usuario escribe
function mostrarSugerenciasPedido(inputElement, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    const texto = inputElement.value.toLowerCase().trim();
    
    // Si borró el texto, escondemos la caja
    if (texto.length < 1) {
        contenedor.classList.add('hidden');
        return;
    }

    // Buscamos coincidencias en el catálogo general
    const resultados = CATALOGO_PRODUCTOS.filter(p => p.name.toLowerCase().includes(texto));

    if (resultados.length > 0) {
        // Dibujamos las opciones
        contenedor.innerHTML = resultados.map(p => `
            <div onclick="seleccionarSugerenciaPedido(this, '${p.name.replace(/'/g, "\\'")}', ${p.price})" class="p-2 border-b border-slate-700 hover:bg-slate-600 cursor-pointer text-sm text-white flex justify-between items-center transition">
                <span class="truncate">${p.name}</span>
                <span class="text-emerald-400 font-bold ml-2">$${p.price.toFixed(2)}</span>
            </div>
        `).join('');
        contenedor.classList.remove('hidden');
    } else {
        // Si escribe algo que no existe
        contenedor.innerHTML = `<div class="p-2 text-sm text-slate-400 italic">No hay coincidencias...</div>`;
        contenedor.classList.remove('hidden');
    }
}

// 3. Rellena los datos automáticamente al hacer clic en la sugerencia
function seleccionarSugerenciaPedido(elementoOpcion, nombre, precio) {
    const fila = elementoOpcion.closest('.articulo-fila');
    
    const inputNombre = fila.querySelector('.item-name');
    const inputPrecio = fila.querySelector('.item-price');
    
    // Rellenamos nombre y precio
    inputNombre.value = nombre;
    inputPrecio.value = precio;
    
    // Escondemos la caja flotante
    elementoOpcion.parentElement.classList.add('hidden');
}

// 4. La magia: Autocompletar el precio al seleccionar el producto
function autoCompletarPrecio(inputNombre) {
    const nombreIngresado = inputNombre.value.trim().toLowerCase();
    const productoEncontrado = CATALOGO_PRODUCTOS.find(p => p.name.toLowerCase() === nombreIngresado);
    
    if (productoEncontrado) {
        // El input de precio es el cuadro que está inmediatamente a la derecha
        const inputPrecio = inputNombre.nextElementSibling;
        inputPrecio.value = productoEncontrado.price;
    }
}

async function enviarNuevoPedido() {
    const btn = document.getElementById('btnEnviarNuevoPedido');
    const cliente = document.getElementById('inputCliente').value.trim();
    if(!cliente) { alert("Por favor ingresa el nombre del cliente."); return; }

    // AQUÍ ESTÁ EL TRUCO: Le pegamos el precio directamente al nombre
    const articulos = Array.from(document.querySelectorAll('.articulo-fila')).map(f => {
        const cant = parseInt(f.querySelector('.item-qty').value) || 1;
        const nombreBase = f.querySelector('.item-name').value.trim() || 'Artículo sin nombre';
        const precioUni = parseFloat(f.querySelector('.item-price').value) || 0;
        
        return {
            qty: cant,
            name: `${nombreBase} ($${(precioUni * cant).toFixed(2)})`, // El nombre ahora viaja con el precio blindado
            price: precioUni
        };
    });
    
    // (Opcional) Si tu n8n lee la variable pedido_detallado, se la enviamos también por si acaso
    const textoDetalladoConPrecios = articulos.map(item => `${item.qty}x ${item.name}`).join('\n');

    const payload = {
        cliente: cliente, telefono: document.getElementById('inputTelefono').value.trim() || 'No registrado',
        tipo_entrega: document.getElementById('inputEntrega').value, metodo_pago: document.getElementById('inputPago').value,
        direccion: document.getElementById('inputDireccion').value.trim() || 'En el local', 
        articulos: articulos,
        pedido_detallado: textoDetalladoConPrecios, 
        timestamp: new Date().toISOString(), tasa_bcv: parseFloat(document.getElementById('tasaBCV').value) || 1
    };

    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
    try {
        const res = await fetch(URL_NUEVO_PEDIDO, { method: 'POST', body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'} });
        if(res.ok) { 
            document.getElementById('formNuevoPedido').reset();
            document.getElementById('contenedorArticulos').innerHTML = '';
            agregarFilaArticulo();
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
            const cant = parseInt(match[1]); 
            let nombreLimpio = match[2].trim();
            let precioExtraido = 0;

            // 1. Extraemos el precio del texto si existe ej: "Alaska Roll ($4.00)" o "Delivery ($3)"
            const matchPrecio = nombreLimpio.match(/\(\$(\d+(?:\.\d+)?)\)$/);
            if (matchPrecio) {
                precioExtraido = parseFloat(matchPrecio[1]) / cant; // Calculamos el precio unitario
                nombreLimpio = nombreLimpio.replace(/\s*\(\$[\d.]+\)$/, '').trim(); // Le quitamos el precio al nombre
            }

            // 2. Buscamos en el catálogo con el nombre limpio
            const itemCat = typeof CATALOGO_PRODUCTOS !== 'undefined' ? CATALOGO_PRODUCTOS.find(p => p.name.toLowerCase() === nombreLimpio.toLowerCase()) : null;
            
            // 3. Si está en el catálogo usamos su precio. Si no, usamos el que extrajimos.
            const precioFinal = itemCat ? itemCat.price : (precioExtraido || 0);

            carritoEdicion.push({ id: itemCat ? itemCat.id : 'custom', name: nombreLimpio, price: precioFinal, qty: cant });
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
    // Usamos String() para evitar que choque un número con un texto
    const producto = CATALOGO_PRODUCTOS.find(p => String(p.id) === String(idProducto)); 
    if (!producto) return;
    
    const existeIndex = carritoEdicion.findIndex(item => item.name === producto.name);
    if (existeIndex >= 0) {
        carritoEdicion[existeIndex].qty += 1; 
    } else {
        carritoEdicion.push({ id: producto.id, name: producto.name, price: producto.price, qty: 1 });
    }
    
    document.getElementById('buscadorMenu').value = ''; 
    document.getElementById('listaSugerencias').classList.add('hidden'); 
    renderizarCarritoEdicion();
}

function cerrarModalEditar() { document.getElementById('modalEditarPedido').classList.add('hidden'); }

function guardarEdicionPedido() {
    const idReal = document.getElementById('editIdReal').value; 
    const nuevoCliente = document.getElementById('editCliente').value.trim();
    const pedidoIndex = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    
    if(pedidoIndex === -1) return;
    
    const pedidoAnterior = pedidosEnMemoria[pedidoIndex]; 
    const nuevoDetalle = carritoEdicion.map(item => `${item.qty}x ${item.name} ($${(item.price * item.qty).toFixed(2)})`).join('\n');

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
    fetch("https://n8n-production-0c91c.up.railway.app/webhook/notificar-edicion", { 
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
        
        const response = await fetch(urlFetch); 
        if (!response.ok) throw new Error('Error API');
        
        const datos = await response.json(); 
        pedidosEnMemoria = Array.isArray(datos) ? datos : [];
        
        // --- NUEVA LÓGICA DE TASA HISTÓRICA ---
        const inputTasa = document.getElementById('tasaBCV');
        const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});

        if (fechaCalendario && fechaCalendario !== hoy) {
            // Buscamos si algún pedido de esa fecha tiene la tasa guardada
            const pedidoConTasa = pedidosEnMemoria.find(p => p.tasa_bcv && parseFloat(p.tasa_bcv) > 0);
            if (pedidoConTasa) {
                inputTasa.value = parseFloat(pedidoConTasa.tasa_bcv).toFixed(2);
                inputTasa.classList.add('text-amber-400'); // La pintamos de amarillo
            } else {
                // Para los pedidos viejos de ayer o antes que no tenían esta función
                inputTasa.value = "";
                inputTasa.classList.add('text-amber-400');
            }
        } else {
            // Si es la fecha de hoy, volvemos a la normalidad y buscamos la actual
            actualizarTasaBCV();
            inputTasa.classList.remove('text-amber-400');
        }
        // ----------------------------------------

        renderizarTablero(); 
        resetearYArrancarPolling();
    } catch (error) { 
        console.error(error); 
    }
}

// --- HELPER PARA FORMATO DE MONEDA (PUNTOS Y COMAS) ---
function formatearMoneda(valor) {
    // Formato 'es-VE' (Venezuela): usa . para miles y , para decimales
    return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

// --- ALGORITMO RENDERIZADOR Y MAPEO DE TURNOS ---
function renderizarTablero() {
    const colCalculando = document.getElementById('columnaCalculandoDelivery');
    const colPagoPendiente = document.getElementById('columnaPagoPendiente');
    const colEnCocina = document.getElementById('columnaEnCocina');
    const colFinalizado = document.getElementById('columnaFinalizado');

    if (!colPagoPendiente || !colEnCocina || !colFinalizado) return;
    
    if (colCalculando) colCalculando.innerHTML = '';
    colPagoPendiente.innerHTML = ''; colEnCocina.innerHTML = ''; colFinalizado.innerHTML = '';

    let conteoCalculando = 0, conteoPago = 0, conteoCocina = 0, conteoFinalizado = 0;
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
        
        // APLICAMOS EL FORMATO AQUÍ
        const montoFormateado = formatearMoneda(monto);
        const montoBsFormateado = formatearMoneda(monto * tasaActual);

        let htmlMonto = `<span class="text-xs font-bold text-slate-300">$${montoFormateado}</span>`;
        if (esPagoMovil) htmlMonto = `<div class="flex flex-col"><span class="text-xs font-bold text-slate-300">$${montoFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${montoBsFormateado}</span></div>`;
        
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
        
        if (estadoLimpio === 'calculandodelivery') {
            conteoCalculando++;
            colCalculando.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-purple-500/10 hover:border-purple-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">#${idVisual}</span>
                            <button onclick="('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer"><i class="fa-solid fa-file-lines"></i></button>
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${cliente}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${art}</p></div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPrecioDelivery('${idReal}')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Poner precio delivery <i class="fa-solid fa-motorcycle"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'pagopendiente') {
            conteoPago++;
            colPagoPendiente.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">#${idVisual}</span>
                            <button onclick="('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer"><i class="fa-solid fa-file-lines"></i></button>
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
            
            const esDelivery = String(pedido.tipo_entrega || '').toLowerCase().includes('delivery');
            const repartidorAsignado = pedido.repartidor || pedido.Repartidor || '';
            let btnMoto = '';
            
            if (esDelivery) {
                const colorMoto = repartidorAsignado !== '' ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400';
                const tituloMoto = repartidorAsignado !== '' ? `Pagado a: ${repartidorAsignado}` : 'Marcar pago de delivery';
                btnMoto = `<button onclick="abrirModalRepartidor('${idReal}', event)" class="${colorMoto} transition cursor-pointer ml-2" title="${tituloMoto}"><i class="fa-solid fa-motorcycle"></i></button>`;
            }

            let htmlMontoFinalizado = `<span class="text-sm font-bold text-emerald-400">$${montoFormateado}</span>`;
            if (esPagoMovil) htmlMontoFinalizado = `<div class="flex flex-col text-right"><span class="text-sm font-bold text-emerald-400">$${montoFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${montoBsFormateado}</span></div>`;
            
            let htmlReferencia = '';
            if (esPagoMovil) {
                const ref = pedido.referencia_pago || pedido.Referencia_pago || pedido['Referencia_pago'] || '';
                if (ref && ref !== 'Sin comprobante') {
                    htmlReferencia = `<div class="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-400 flex items-center justify-between"><span class="font-semibold text-amber-400">Ref: ${ref}</span><span class="text-emerald-400/70"><i class="fa-solid fa-check-double"></i></span></div>`;
                } else {
                    htmlReferencia = `<div class="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-500 italic flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> Sin referencia</div>`;
                }
            }

            colFinalizado.innerHTML += `
                <div onclick="abrirModalDetalle('${idReal}')" class="bg-slate-700/20 hover:bg-slate-700/50 p-3 rounded-lg border border-emerald-500/10 hover:border-emerald-500/30 transition cursor-pointer mb-2 flex flex-col">
                    <div class="flex justify-between items-start w-full">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded border border-emerald-400/20">#${idVisual}</span>
                            ${btnWhatsApp}
                            ${btnMoto}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div class="flex justify-between items-end mt-2 w-full">
                        <span class="text-[11px] text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-white transition">Ver Recibo</span>
                        ${htmlMontoFinalizado}
                    </div>
                    ${htmlReferencia}
                </div>`;
        }
    });

    if (document.getElementById('cantCalculandoDelivery')) {
        document.getElementById('cantCalculandoDelivery').innerText = conteoCalculando;
    }
    document.getElementById('cantPagoPendiente').innerText = conteoPago; 
    document.getElementById('cantEnCocina').innerText = conteoCocina; 
    document.getElementById('cantFinalizado').innerText = conteoFinalizado;

    // APLICAMOS EL FORMATO A LOS TOTALES DEL FONDO TAMBIÉN
    const totalVentasFormateado = formatearMoneda(totalVentasDia);
    const totalVentasBsFormateado = formatearMoneda(totalVentasDia * tasaActual);
    if (document.getElementById('totalDiaBottom')) document.getElementById('totalDiaBottom').innerHTML = `<div class="flex flex-col text-right leading-tight"><span class="text-lg font-bold text-emerald-400">$${totalVentasFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${totalVentasBsFormateado}</span></div>`;
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
    // --- LÓGICA PARA INYECTAR LA IMAGEN EN EL MODAL ---
    let btnImg = '';
    if (pedido.imagen_pago && String(pedido.imagen_pago).trim() !== '' && String(pedido.imagen_pago) !== 'undefined') {
        btnImg = `
            <div class="mt-4 pt-4 border-t border-slate-700/50 flex flex-col items-center justify-center w-full">
                <span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Comprobante Adjunto</span>
                <a href="${pedido.imagen_pago}" target="_blank" class="block border border-slate-600 rounded-lg overflow-hidden hover:border-emerald-500 transition shadow-lg max-w-[220px] w-full">
                    <img src="${pedido.imagen_pago}" class="w-full h-auto object-contain rounded-lg bg-slate-900" alt="Comprobante de Pago">
                </a>
                <span class="text-[10px] text-slate-500 mt-1 italic"><i class="fa-solid fa-magnifying-glass-plus"></i> Clic en la imagen para ampliar</span>
            </div>
        `;
    }

    document.getElementById('modalCuerpo').innerHTML = `<div class="space-y-3.5"><div class="flex justify-between"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cliente</span><p class="font-bold text-white text-base">${cliente}</p><p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-phone"></i> ${tel}</p></div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Comandado por</span><p class="text-xs text-white bg-slate-900 border border-slate-700 px-2 py-1 rounded mt-1 font-semibold">${operador}</p></div></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Método de Distribución</span><p class="text-white text-xs mt-0.5 font-medium">${entrega}</p><p class="text-xs text-slate-400 mt-1 bg-slate-900/40 p-2 rounded border border-slate-700/30 italic">${dir}</p></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Productos</span><div class="text-xs bg-slate-900/40 p-2.5 rounded border border-slate-700/30 whitespace-pre-line max-h-32 overflow-y-auto text-slate-300 font-mono">${arts}</div></div><div class="border-t border-slate-700/50 pt-2.5 flex justify-between items-center"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Forma de Pago</span><p class="text-white text-xs font-semibold">${pago}</p>${refHtml}</div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total</span><p class="text-emerald-400 font-bold text-lg">$${monto.toFixed(2)}</p></div></div>${seccionVES}${btnImg}</div>`;
    document.getElementById('modalDetalle').classList.remove('hidden');
}
function cerrarModal() { document.getElementById('modalDetalle').classList.add('hidden'); }


// =====================================================================
// --- LÓGICA EXCLUSIVA DEL PANEL DE ADMINISTRACIÓN (admin.html) ---
// =====================================================================

const ADMIN_URL_MENU = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-menu";
const ADMIN_URL_GUARDAR_CAT = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-categoria";
const ADMIN_URL_GUARDAR_PROD = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-producto";
const ADMIN_URL_GUARDAR_COMBO = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-combo";
const ADMIN_URL_ELIMINAR = "https://n8n-production-0c91c.up.railway.app/webhook/eliminar-item";

let adminCategorias = [];
let adminProductos = [];
let adminCombos = [];

// CORREGIDO: Disparar la función de forma segura dependiendo de cómo cargue el HTML
if (document.getElementById('form-categoria')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cargarDatosAdmin);
    } else {
        cargarDatosAdmin();
    }
}

async function cargarDatosAdmin() {
    try {
        const res = await fetch(ADMIN_URL_MENU);
        const rawData = await res.json();
        
        // EL TRUCO: Si n8n lo envía envuelto en un Array [], sacamos el primer elemento [0]
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        
        adminCategorias = data.menu ? (data.menu.categorias || []) : [];
        adminProductos = data.menu ? (data.menu.productos || []) : [];
        adminCombos = data.menu ? (data.menu.combos || []) : [];

        renderListaCategorias();
        renderListaProductos();
        renderListaCombos();
        actualizarSelectCategorias();
        
        // ¡LA MAGIA AQUÍ! Actualizamos los selects de los combos automáticamente
        actualizarSelectsCombos();

        await cargarMotorizadosDesdeDB();
        await cargarMensajesWP();
        await cargarUsuariosDesdeDB();
        if (document.getElementById('lista-usuarios-container')) {
            renderListaUsuarios();
        }
        
        // Si el contenedor de items de combo está vacío, añadimos una fila por defecto
        const listaItems = document.getElementById('lista-items-combo');
        if (listaItems && listaItems.innerHTML === '') {
            agregarFilaProductoCombo();
        }
    } catch (error) {
        console.error("Error cargando datos del admin:", error);
    }
}

// --- RENDERIZADO DE CATEGORÍAS ---
function renderListaCategorias(lista = adminCategorias) {
    const cont = document.getElementById('lista-categorias-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (lista.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron categorías.</p>';
        return;
    }

    lista.forEach(cat => {
        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info">
                    <p class="item-title">${cat.nombre}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="editarCategoria(${cat.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${cat.id}, 'categoria')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

// Le agregamos "lista = adminProductos" para que por defecto muestre todos, 
// pero si el buscador le manda una lista filtrada, dibuje esa.
function renderListaProductos(lista = adminProductos) {
    const cont = document.getElementById('lista-productos-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (lista.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron productos.</p>';
        return;
    }

    lista.forEach(p => {
        const opacityClass = p.disponible ? '' : 'deshabilitado';
        cont.innerHTML += `
            <div class="list-item ${opacityClass}">
                <div class="item-info">
                    <p class="item-title">${p.nombre} <span style="color:#10b981">$${p.precio}</span></p>
                    <p class="item-meta">Cat: ${p.categoria} | Disp: ${p.disponible ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="editarProducto(${p.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${p.id}, 'producto')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

// --- NUEVO: BUSCADOR EN TIEMPO REAL ---
function filtrarProductosAdmin() {
    const textoBuscado = document.getElementById('buscador-productos-admin').value.toLowerCase();
    
    // Filtramos la memoria viva
    const resultados = adminProductos.filter(p => 
        p.nombre.toLowerCase().includes(textoBuscado)
    );
    
    // Mandamos a pintar solo los resultados
    renderListaProductos(resultados);
}

// --- RENDERIZADO DE COMBOS ---
function renderListaCombos(lista = adminCombos) {
    const cont = document.getElementById('lista-combos-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (lista.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron combos.</p>';
        return;
    }

    lista.forEach(c => {
        const opacityClass = c.disponible ? '' : 'deshabilitado';
        cont.innerHTML += `
            <div class="list-item ${opacityClass}">
                <div class="item-info">
                    <p class="item-title">${c.nombre} <span style="color:#10b981">$${c.precio}</span></p>
                    <p class="item-meta">Disp: ${c.disponible ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="editarCombo(${c.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${c.id}, 'combo')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

// Buscador para Categorías
function filtrarCategoriasAdmin() {
    const textoBuscado = document.getElementById('buscador-categorias-admin').value.toLowerCase();
    const resultados = adminCategorias.filter(c => c.nombre.toLowerCase().includes(textoBuscado));
    renderListaCategorias(resultados);
}

// Buscador para Combos
function filtrarCombosAdmin() {
    const textoBuscado = document.getElementById('buscador-combos-admin').value.toLowerCase();
    const resultados = adminCombos.filter(c => c.nombre.toLowerCase().includes(textoBuscado));
    renderListaCombos(resultados);
}

function actualizarSelectCategorias() {
    const select = document.getElementById('prod-categoria');
    if(!select) return;
    select.innerHTML = '<option value="">-- Selecciona Categoría --</option>';
    adminCategorias.forEach(cat => {
        select.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`;
    });
}

// --- ELIMINAR ---
async function eliminarItem(id, tipo) {
    if (!confirm(`¿Seguro que deseas eliminar este ${tipo}? Esta acción no se puede deshacer.`)) return;
    
    try {
        await fetch(ADMIN_URL_ELIMINAR, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, tipo: tipo })
        });
        cargarDatosAdmin();
    } catch(e) {
        alert('Error al intentar eliminar el elemento.');
    }
}

// --- NUEVA VERSIÓN: MOTOR DE AUTOCOMPLETADO PARA COMBOS ---
function actualizarSelectsCombos() {
    let datalist = document.getElementById('lista-productos-combo');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'lista-productos-combo';
        document.body.appendChild(datalist);
    }
    
    // Llenamos la lista invisible con el catálogo actual
    datalist.innerHTML = adminProductos.map(p => 
        `<option value="${p.nombre} ($${p.precio})"></option>`
    ).join('');
}

// --- FORMULARIOS: CATEGORÍA ---
if (document.getElementById('form-categoria')) {
    document.getElementById('form-categoria').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('cat-id').value;
        const payload = {
            id: id ? parseInt(id) : null,
            nombre: document.getElementById('cat-nombre').value.trim(),
            imagen: document.getElementById('cat-imagen').value.trim()
        };
        try {
            await fetch(ADMIN_URL_GUARDAR_CAT, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            resetFormCat();
            cargarDatosAdmin();
        } catch (error) { alert('Error al guardar la categoría.'); }
    });
}

function editarCategoria(id) {
    const cat = adminCategorias.find(c => c.id === id);
    if(!cat) return;
    document.getElementById('cat-id').value = cat.id;
    document.getElementById('cat-nombre').value = cat.nombre;
    document.getElementById('cat-imagen').value = cat.imagen || '';
    
    document.getElementById('titulo-form-cat').innerText = "Editar Categoría";
    document.getElementById('btn-save-cat').innerText = "💾 Actualizar Categoría";
    document.getElementById('btn-cancel-cat').style.display = "block";
}

function resetFormCat() {
    document.getElementById('form-categoria').reset();
    document.getElementById('cat-id').value = "";
    if (document.getElementById('cat-imagen')) document.getElementById('cat-imagen').value = "";
    document.getElementById('titulo-form-cat').innerText = "Crear Categoría";
    document.getElementById('btn-save-cat').innerText = "💾 Guardar Categoría";
    document.getElementById('btn-cancel-cat').style.display = "none";
    if(document.getElementById('buscador-categorias-admin')) document.getElementById('buscador-categorias-admin').value = '';
}

// --- FORMULARIOS: PRODUCTO ---
if (document.getElementById('form-producto')) {
    document.getElementById('form-producto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        let imgFinalProd = document.getElementById('prod-imagen').value.trim();
        if (imgFinalProd === '') {
            imgFinalProd = obtenerEmojiPlato();
        }
        const payload = {
            id: id ? parseInt(id) : null,
            nombre: document.getElementById('prod-nombre').value.trim(),
            categoria: document.getElementById('prod-categoria').value,
            precio: parseFloat(document.getElementById('prod-precio').value),
            imagen: imgFinalProd,
            descripcion: document.getElementById('prod-descripcion').value.trim(),
            disponible: document.getElementById('prod-disponible').checked
        };
        try {
            await fetch(ADMIN_URL_GUARDAR_PROD, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            resetFormProd();
            cargarDatosAdmin();
        } catch (error) { alert('Error al guardar el producto.'); }
    });
}

function editarProducto(id) {
    const p = adminProductos.find(x => x.id === id);
    if(!p) return;
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-nombre').value = p.nombre;
    document.getElementById('prod-categoria').value = p.categoria;
    document.getElementById('prod-precio').value = p.precio;
    document.getElementById('prod-imagen').value = p.imagen || '';
    document.getElementById('prod-descripcion').value = p.descripcion;
    document.getElementById('prod-disponible').checked = p.disponible;
    
    document.getElementById('titulo-form-prod').innerText = "Editar Producto";
    document.getElementById('btn-save-prod').innerText = "💾 Actualizar Producto";
    document.getElementById('btn-cancel-prod').style.display = "block";
}

function resetFormProd() {
    document.getElementById('form-producto').reset();
    document.getElementById('prod-id').value = "";
    if (document.getElementById('prod-imagen')) document.getElementById('prod-imagen').value = "";
    document.getElementById('titulo-form-prod').innerText = "Crear Producto";
    document.getElementById('btn-save-prod').innerText = "💾 Guardar Producto";
    document.getElementById('btn-cancel-prod').style.display = "none";
}

// --- 1. DIBUJANTE DE FILA (CON BUSCADOR INTELIGENTE) ---
function agregarFilaProductoCombo(valorSeleccionado = "", qty = 1) {
    const contenedor = document.getElementById('lista-items-combo');
    const fila = document.createElement('div');
    fila.className = 'fila-item-combo'; 
    fila.style.display = 'flex';
    fila.style.gap = '10px';
    fila.style.marginBottom = '10px';

    // Pre-llenar si estamos editando un combo guardado
    let nombreLegible = "";
    if (valorSeleccionado.startsWith('CAT_')) {
        nombreLegible = "📁 Categoría: " + valorSeleccionado.replace('CAT_', '');
    } else if (valorSeleccionado.startsWith('PROD_')) {
        const pId = parseInt(valorSeleccionado.replace('PROD_', ''));
        const p = adminProductos.find(x => x.id === pId);
        if (p) nombreLegible = "🍣 Producto: " + p.nombre;
    }

    // ID único para la cajita flotante de esta fila específica
    const idCaja = 'sug-combo-' + Math.random().toString(36).substr(2, 9);

    fila.innerHTML = `
        <div style="flex: 2; position: relative;">
            <input type="text" 
                onfocus="buscarItemCombo(this, '${idCaja}')" 
                oninput="buscarItemCombo(this, '${idCaja}')" 
                value="${nombreLegible}" 
                placeholder="🔍 Buscar categoría o producto..." 
                autocomplete="off" 
                class="item-visible"
                style="width: 100%; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; outline: none;">
            
            <input type="hidden" class="item-referencia" value="${valorSeleccionado}">
            
            <div id="${idCaja}" class="caja-sugerencias hidden" style="display: none; position: absolute; z-index: 50; width: 100%; margin-top: 4px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; max-height: 250px; overflow-y: auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);"></div>
        </div>

        <input type="number" class="item-cantidad" min="1" value="${qty}" required style="flex: 1; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px;" placeholder="Cant.">
        <button type="button" onclick="this.parentElement.remove()" style="background: #e11d48; color: white; border: none; border-radius: 4px; padding: 0 15px; cursor: pointer; font-weight: bold;">X</button>
    `;
    contenedor.appendChild(fila);
}

// --- 2. MOTOR DEL BUSCADOR FLOTANTE ---
function buscarItemCombo(inputElement, idCaja) {
    const contenedor = document.getElementById(idCaja);
    const hiddenInput = inputElement.nextElementSibling;
    const texto = inputElement.value.toLowerCase().trim();

    // Si el usuario borra para buscar otra cosa, vaciamos el input oculto
    hiddenInput.value = "";

    // Filtramos
    const catFiltradas = adminCategorias.filter(c => c.nombre.toLowerCase().includes(texto) || texto === '');
    const prodFiltrados = adminProductos.filter(p => p.nombre.toLowerCase().includes(texto) || texto === '');

    let html = '';

    if (catFiltradas.length > 0) {
        html += '<div style="padding: 8px 10px; font-size: 11px; color: #94a3b8; font-weight: bold; background: #0f172a; text-transform: uppercase;">👉 Que el cliente elija (Categorías)</div>';
        catFiltradas.forEach(c => {
            html += `<div onclick="seleccionarSugerenciaCombo(this, '${idCaja}', 'CAT_${c.nombre}', '📁 Categoría: ${c.nombre}')" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155; transition: background 0.2s;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">📁 ${c.nombre}</div>`;
        });
    }

    if (prodFiltrados.length > 0) {
        html += '<div style="padding: 8px 10px; font-size: 11px; color: #94a3b8; font-weight: bold; background: #0f172a; text-transform: uppercase;">👉 Incluido Fijo (Productos)</div>';
        prodFiltrados.forEach(p => {
            // CAMBIO AQUÍ: display: flex y padding derecho de 20px para la barra de scroll
            html += `<div onclick="seleccionarSugerenciaCombo(this, '${idCaja}', 'PROD_${p.id}', '🍣 Producto: ${p.nombre}')" style="padding: 10px 20px 10px 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">🍣 ${p.nombre}</span> 
                <span style="color:#10b981; font-weight: bold; flex-shrink: 0;">$${p.precio.toFixed(2)}</span>
            </div>`;
        });
    }

    if (html === '') {
        html = '<div style="padding: 10px; font-size: 13px; color: #94a3b8; font-style: italic;">No hay coincidencias...</div>';
    }

    // Escondemos las demás cajas que puedan estar abiertas y mostramos esta
    document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
    contenedor.innerHTML = html;
    contenedor.style.display = 'block';
}
// --- 3. AL HACER CLIC EN UNA SUGERENCIA ---
function seleccionarSugerenciaCombo(elemento, idCaja, valorReal, textoLegible) {
    const contenedor = document.getElementById(idCaja);
    const hiddenInput = contenedor.previousElementSibling;
    const visibleInput = hiddenInput.previousElementSibling;

    hiddenInput.value = valorReal;
    visibleInput.value = textoLegible;

    contenedor.style.display = 'none';
}

// --- 4. CERRAR LAS CAJAS AL HACER CLIC AFUERA ---
document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('item-visible')) {
        document.querySelectorAll('.caja-sugerencias').forEach(caja => {
            caja.style.display = 'none';
        });
    }
});

// --- EVENTOS DEL COMBO (CORREGIDOS Y BLINDADOS) ---
const btnAddCombo = document.getElementById('btn-add-item');
if (btnAddCombo) {
    // Usamos .onclick directo para que el botón jamás pierda su función
    btnAddCombo.onclick = function() {
        agregarFilaProductoCombo();
    };
}

const formCombo = document.getElementById('form-combo');
if (formCombo) {
    // Usamos .onsubmit directo en lugar de clonar el formulario (así no rompemos el botón)
    formCombo.onsubmit = async function(e) {
        e.preventDefault();
        const id = document.getElementById('combo-id').value;
        
        const itemsSeleccionados = [];
        let faltaHacerClic = false;

        // Revisamos fila por fila
        document.querySelectorAll('.fila-item-combo').forEach(fila => {
            const ref = fila.querySelector('.item-referencia').value;
            const qty = parseInt(fila.querySelector('.item-cantidad').value);
            const visibleText = fila.querySelector('.item-visible').value.trim();
            
            // Si hay texto escrito pero la referencia está vacía, es que no seleccionó de la lista
            if (visibleText !== "" && ref === "") {
                faltaHacerClic = true;
            } else if (ref && qty > 0) {
                if (ref.startsWith('CAT_')) {
                    itemsSeleccionados.push({ tipo: 'categoria', valor: ref.replace('CAT_', ''), cantidad: qty });
                } else if (ref.startsWith('PROD_')) {
                    itemsSeleccionados.push({ tipo: 'producto', valor: parseInt(ref.replace('PROD_', '')), cantidad: qty });
                }
            }
        });

        // NUEVA VALIDACIÓN: Te avisa si escribiste algo pero olvidaste hacer clic en la sugerencia
        if (faltaHacerClic) {
            alert('⚠️ Importante: Debes HACER CLIC en una de las opciones de la caja oscura flotante para seleccionarla. No basta solo con escribir el nombre.');
            return;
        }

        if (itemsSeleccionados.length === 0) { 
            alert('Añade al menos 1 elemento válido al combo.'); 
            return; 
        }

        let imgFinalCombo = document.getElementById('combo-imagen').value.trim();
        if (imgFinalCombo === '') {
            imgFinalCombo = obtenerEmojiPlato();
        }

        const payload = {
            id: id ? parseInt(id) : null,
            nombre: document.getElementById('combo-nombre').value.trim(),
            precio: parseFloat(document.getElementById('combo-precio').value),
            imagen: imgFinalCombo,
            descripcion: document.getElementById('combo-descripcion').value.trim(),
            items: itemsSeleccionados,
            disponible: document.getElementById('combo-disponible').checked
        };
        
        try {
            await fetch(ADMIN_URL_GUARDAR_COMBO, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            resetFormCombo();
            cargarDatosAdmin();
        } catch (error) { alert('Error al guardar el combo.'); }
    };
}

function editarCombo(id) {
    const c = adminCombos.find(x => x.id === id);
    if(!c) return;
    document.getElementById('combo-id').value = c.id;
    document.getElementById('combo-nombre').value = c.nombre;
    document.getElementById('combo-precio').value = c.precio;
    document.getElementById('combo-imagen').value = c.imagen || '';
    document.getElementById('combo-descripcion').value = c.descripcion || '';
    document.getElementById('combo-disponible').checked = c.disponible;
    
    document.getElementById('lista-items-combo').innerHTML = '';
    let parsedItems = [];
    try { parsedItems = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : c.items_json; } catch(e){}
    
    // Traducimos el JSON a las cajas desplegables
    if (parsedItems && parsedItems.length > 0) {
        parsedItems.forEach(item => {
            if (item.tipo) {
                const valorSelect = item.tipo === 'categoria' ? 'CAT_' + item.valor : 'PROD_' + item.valor;
                agregarFilaProductoCombo(valorSelect, item.cantidad);
            }
        });
    } else {
        agregarFilaProductoCombo(); 
    }

    document.getElementById('titulo-form-combo').innerText = "Editar Combo";
    document.getElementById('btn-save-combo').innerText = "🍱 Actualizar Combo";
    document.getElementById('btn-cancel-combo').style.display = "block";
}

function resetFormCombo() {
    document.getElementById('form-combo').reset();
    document.getElementById('combo-id').value = "";
    document.getElementById('lista-items-combo').innerHTML = '';
    agregarFilaProductoCombo();
    
    document.getElementById('titulo-form-combo').innerText = "Crear Combo";
    document.getElementById('btn-save-combo').innerText = "🍱 Guardar Combo";
    document.getElementById('btn-cancel-combo').style.display = "none";
    if(document.getElementById('buscador-combos-admin')) document.getElementById('buscador-combos-admin').value = '';
}
// ==========================================
// ARRANQUE PRINCIPAL (PANTALLA DE OPERACIONES)
// ==========================================
async function inicializarTablero() {
    // 1. Inyectar la fecha de hoy en el calendario
    const calendario = document.getElementById('calendarioFiltro');
    if (calendario && !calendario.value) {
        calendario.value = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
    }
    
    // 2. Cargar datos base
    await cargarMotorizadosDesdeDB();
    await cargarUsuariosDesdeDB();
    await cargarCatalogoDesdeDB(); // <-- Corregido el error de mayúsculas aquí
    verificarSesion();
    cargarDatosAdmin();
    actualizarTasaBCV();
}

if (document.getElementById('vistaLogin')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarTablero);
    } else {
        inicializarTablero();
    }
}

// --- GENERADOR DE EMOJIS ALEATORIOS PARA PLATOS ---
function obtenerEmojiPlato() {
    const emojis = ['🍱', '🍙', '🍣', '🥤', '🍰', '🥟', '🍤', '🔥', '🍜', '🥢'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// --- NUEVO: MODAL ESTÉTICO DE DELIVERY ---
function pedirPrecioDelivery(cliente) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalPrecioDelivery');
        const inputPrecio = document.getElementById('inputPrecioDelivery');
        const txtCliente = document.getElementById('txtClienteDelivery');
        
        txtCliente.innerText = `Cliente: ${cliente}`;
        inputPrecio.value = '';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex'); 
        inputPrecio.focus();
        
        document.getElementById('btnAceptarDelivery').onclick = () => {
            const valor = inputPrecio.value.trim();
            if (valor === '') { alert("Por favor ingresa un monto."); return; }
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(valor);
        };
        
        document.getElementById('btnCancelarDelivery').onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(null);
        };
    });
}

async function procesarPrecioDelivery(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido));
    if (!pedido) return;

    // Lanzamos el nuevo modal hermoso
    const precioDel = await pedirPrecioDelivery(pedido.cliente);
    if (precioDel === null) return; 
    
    const costoDelivery = parseFloat(precioDel.replace(',', '.'));
    if (isNaN(costoDelivery)) {
        alert("Monto inválido.");
        return;
    }

    const nuevoTotal = parseFloat(pedido.total_orden) + costoDelivery;
    const nuevoDetalle = pedido.pedido_detallado + `\n1x Servicio de Delivery ($${costoDelivery})`;
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";

    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedido));
    pedidosEnMemoria[index].estado = 'Pago Pendiente';
    pedidosEnMemoria[index].total_orden = nuevoTotal;
    pedidosEnMemoria[index].pedido_detallado = nuevoDetalle;
    renderizarTablero();

    const payload = {
        id: idPedido, 
        estado: 'Pago Pendiente', 
        cliente: pedido.cliente, 
        pedido_detallado: nuevoDetalle, 
        total_orden: nuevoTotal,   
        telefono: pedido.telefono || '', 
        tipo_entrega: pedido.tipo_entrega || '', 
        metodo_pago: pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '',
        procesado_por: operadorFirma,
        referencia_pago: pedido.referencia_pago || "", 
        imagen_pago: "Sin comprobante",
        es_cotizacion_delivery: true
    };
    
    fetch(API_ACTUALIZAR_ESTADO, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    }).catch(e => console.error("Error BD:", e));
}

// --- FUNCIONES DEL REPARTIDOR ---
let idPedidoRepartidorActual = null;

function abrirModalRepartidor(idReal, evento) {
    evento.stopPropagation(); 
    idPedidoRepartidorActual = idReal;
    
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    if (!pedido) return;

    document.getElementById('txtPedidoRepartidor').innerText = `Pedido para: ${pedido.cliente}`;
    const select = document.getElementById('selectRepartidor');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    // AQUÍ ESTÁ EL CAMBIO: Ahora inyectamos la lista de MOTORIZADOS puros
    MOTORIZADOS_SISTEMA.forEach(m => {
        select.innerHTML += `<option value="${m.nombre}">${m.nombre}</option>`;
    });
    
    if (pedido.repartidor) select.value = pedido.repartidor;

    const modal = document.getElementById('modalAsignarRepartidor');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalRepartidor() {
    const modal = document.getElementById('modalAsignarRepartidor');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    idPedidoRepartidorActual = null;
}

function guardarRepartidor() {
    const select = document.getElementById('selectRepartidor');
    const nombreRepartidor = select.value;
    
    if (nombreRepartidor === "") {
        alert("Por favor selecciona un repartidor válido de la lista.");
        return;
    }

    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedidoRepartidorActual));
    if (index === -1) return;
    const pedido = pedidosEnMemoria[index];
    
    // ¡LA CLAVE! Rescatamos el ID antes de que el modal lo borre
    const idSeguro = idPedidoRepartidorActual;
    
    // 1. Cambiamos la moto a verde visualmente
    pedidosEnMemoria[index].repartidor = nombreRepartidor;
    renderizarTablero();

    // 2. Enviamos la actualización a la base de datos (n8n)
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    const payload = {
        id_pedido: idSeguro,
        id: idSeguro,
        estado: pedido.estado, 
        cliente: pedido.cliente,
        pedido_detallado: pedido.pedido_detallado,
        total_orden: pedido.total_orden,
        telefono: pedido.telefono || '',
        tipo_entrega: pedido.tipo_entrega || '',
        metodo_pago: pedido.metodo_pago || '',
        procesado_por: operadorFirma,
        referencia_pago: pedido.referencia_pago || "",
        imagen_pago: pedido.imagen_pago || "",
        repartidor: nombreRepartidor,
        actualizacion_silenciosa: true // <--- SEÑAL SECRETA AGREGADA
    };

    fetch(API_ACTUALIZAR_ESTADO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(e => console.error("Error BD:", e));
    
    // 3. AHORA SÍ, cerramos el modal al final de todo el proceso
    cerrarModalRepartidor();
}
// --- FUNCIONES ADMIN PARA MOTORIZADOS ---
function renderListaMotorizados() {
    const cont = document.getElementById('lista-motorizados-container');
    if(!cont) return;
    cont.innerHTML = '';
    if (MOTORIZADOS_SISTEMA.length === 0) {
        cont.innerHTML = '<p class="text-sm text-slate-500 italic">No hay motorizados registrados.</p>'; return;
    }
    MOTORIZADOS_SISTEMA.forEach(m => {
        cont.innerHTML += `
            <div class="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-700">
                <div class="text-white font-semibold text-sm">🏍️ ${m.nombre}</div>
                <div class="flex gap-2">
                    <button class="text-amber-400 hover:text-amber-300 px-2" onclick="editarMotorizado(${m.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="text-red-500 hover:text-red-400 px-2" onclick="eliminarMotorizado(${m.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
    });
}

if (document.getElementById('form-motorizado')) {
    document.getElementById('form-motorizado').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('mot-id').value;
        const payload = { id: id ? parseInt(id) : null, nombre: document.getElementById('mot-nombre').value.trim() };
        try {
            await fetch(ADMIN_URL_GUARDAR_MOT, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            resetFormMot(); await cargarMotorizadosDesdeDB();
        } catch (error) { alert('Error al guardar.'); }
    });
}

function editarMotorizado(id) {
    const m = MOTORIZADOS_SISTEMA.find(x => x.id === id); if(!m) return;
    document.getElementById('mot-id').value = m.id; document.getElementById('mot-nombre').value = m.nombre;
    document.getElementById('titulo-form-mot').innerText = "Editar Motorizado";
    document.getElementById('btn-save-mot').innerText = "💾 Actualizar";
    document.getElementById('btn-cancel-mot').classList.remove('hidden');
}

function resetFormMot() {
    document.getElementById('form-motorizado').reset(); document.getElementById('mot-id').value = "";
    document.getElementById('titulo-form-mot').innerText = "Registrar Motorizado";
    document.getElementById('btn-save-mot').innerText = "💾 Guardar Chofer";
    document.getElementById('btn-cancel-mot').classList.add('hidden');
}

async function eliminarMotorizado(id) {
    if (!confirm(`¿Seguro que deseas eliminar este motorizado?`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR_MOT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
        await cargarMotorizadosDesdeDB();
    } catch(e) { alert('Error al eliminar.'); }
}

// --- FUNCIONES ADMIN PARA USUARIOS DE SISTEMA ---
function renderListaUsuarios() {
    const cont = document.getElementById('lista-usuarios-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (!USUARIOS_SISTEMA || USUARIOS_SISTEMA.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No hay usuarios registrados.</p>'; return;
    }
    
    USUARIOS_SISTEMA.forEach(u => {
        // EL ESCUDO: Si es admin o superadmin, bloqueamos los botones
        const esAdmin = (String(u.rol).toLowerCase() === 'admin' || String(u.rol).toLowerCase() === 'superadmin');
        
        let botones = '';
        if (esAdmin) {
            botones = `<span style="font-size: 10px; background: rgba(239,68,68,0.2); color: #f87171; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3); text-transform: uppercase; font-weight: bold;">Protegido 🛡️</span>`;
        } else {
            botones = `
                <button type="button" class="action-btn btn-edit" onclick="editarUsuario(${u.id})" title="Editar">✏️</button>
                <button type="button" class="action-btn btn-delete" onclick="eliminarUsuario(${u.id})" title="Eliminar">🗑️</button>
            `;
        }

        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info">
                    <p class="item-title">👤 ${u.nombre}</p>
                    <p class="item-meta">User: <span style="color:#38bdf8; font-weight:bold;">${u.username}</span> | Rol: ${u.rol} | Clave: ${esAdmin ? '••••' : u.pin}</p>
                </div>
                <div class="item-actions">
                    ${botones}
                </div>
            </div>`;
    });
}

if (document.getElementById('form-usuario')) {
    document.getElementById('form-usuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('usr-id').value;
        const payload = { 
            id: id ? parseInt(id) : null, 
            nombre: document.getElementById('usr-nombre').value.trim(),
            username: document.getElementById('usr-username').value.trim(),
            pin: document.getElementById('usr-pin').value.trim(),
            rol: document.getElementById('usr-rol').value
        };
        try {
            await fetch(ADMIN_URL_GUARDAR_USUARIO, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            resetFormUsr(); 
            await cargarUsuariosDesdeDB();
            renderListaUsuarios();
        } catch (error) { alert('Error al guardar el usuario.'); }
    });
}

function editarUsuario(id) {
    const u = USUARIOS_SISTEMA.find(x => x.id === id); if(!u) return;
    document.getElementById('usr-id').value = u.id; 
    document.getElementById('usr-nombre').value = u.nombre;
    document.getElementById('usr-username').value = u.username;
    document.getElementById('usr-pin').value = u.pin;
    document.getElementById('usr-rol').value = u.rol;
    
    document.getElementById('titulo-form-usr').innerText = "Editar Usuario";
    document.getElementById('btn-save-usr').innerText = "💾 Actualizar Usuario";
    document.getElementById('btn-cancel-usr').style.display = "block";
}

function resetFormUsr() {
    document.getElementById('form-usuario').reset(); 
    document.getElementById('usr-id').value = "";
    document.getElementById('titulo-form-usr').innerText = "Crear Usuario";
    document.getElementById('btn-save-usr').innerText = "💾 Guardar Usuario";
    document.getElementById('btn-cancel-usr').style.display = "none";
}

async function eliminarUsuario(id) {
    if (!confirm(`¿Seguro que deseas ELIMINAR este usuario del sistema?`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR_USUARIO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
        await cargarUsuariosDesdeDB();
        renderListaUsuarios();
    } catch(e) { alert('Error al eliminar.'); }
}

// =================================================================
// --- LÓGICA EXCLUSIVA DEL PANEL DE ESTADÍSTICAS ---
// =================================================================

const API_ESTADISTICAS_PEDIDOS = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-pedidos";
let datosEstadisticas = [];
let tasaEstadisticas = 1;
let graficoTorta = null;

async function iniciarPantallaEstadisticas() {
    // Escudo: Si no existe el canvas del gráfico, significa que no estamos en estadisticas.html
    if (!document.getElementById('graficoPagos')) return;

    tasaEstadisticas = parseFloat(localStorage.getItem('tasaBCV')) || 1;
    
    try {
        const res = await fetch(API_ESTADISTICAS_PEDIDOS + "?historico=true");
        const data = await res.json();
        datosEstadisticas = Array.isArray(data) ? data : [];
        aplicarFiltroEstadisticas('hoy');
    } catch(e) {
        console.error("Error descargando pedidos para estadísticas:", e);
    }
}

function aplicarFiltroEstadisticas(tipo) {
    if (!document.getElementById('graficoPagos')) return;

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
    });
    
    if (tipo !== 'custom') {
        document.getElementById('fechaCustom').value = '';
        try {
            if (window.event && window.event.target && window.event.target.classList.contains('filtro-btn')) {
                window.event.target.classList.remove('bg-slate-800', 'text-slate-300');
                window.event.target.classList.add('bg-indigo-600', 'text-white');
            } else if (tipo === 'hoy') {
                document.querySelectorAll('.filtro-btn')[0].classList.remove('bg-slate-800', 'text-slate-300');
                document.querySelectorAll('.filtro-btn')[0].classList.add('bg-indigo-600', 'text-white');
            }
        } catch(e) {}
    }

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
            const fCustom = new Date(fechaSeleccionada + 'T00:00:00');
            return fechaPedido.getTime() === fCustom.getTime();
        }
        return true;
    });

    const finalizados = pedidosFiltrados.filter(p => (p.estado || '').toLowerCase() === 'finalizado');
    procesarCalculosEstadisticos(finalizados);
    renderHistorialFinalizadosEnStats(pedidosFiltrados);
}

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
            <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700">
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

// Disparador de seguridad:
document.addEventListener('DOMContentLoaded', iniciarPantallaEstadisticas);

// =================================================================
// --- LÓGICA PARA PLANTILLAS DE WHATSAPP (PANEL ADMIN) ---
// =================================================================
const URL_OBTENER_MSJ = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-mensajes";
const URL_GUARDAR_MSJ = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-mensajes";

async function cargarMensajesWP() {
    // Si no existe este cuadro, significa que no estamos en admin.html, así que no hacemos nada
    if(!document.getElementById('msg-recepcion')) return;

    try {
        // Feedback visual mientras carga
        document.getElementById('msg-recepcion').value = "Cargando plantillas desde la base de datos...";

        const res = await fetch(URL_OBTENER_MSJ);
        const data = await res.json();
        
        // Adaptación por si n8n devuelve un array directo o un objeto con "data"
        const mensajes = Array.isArray(data) ? data : (data.data || []);
        
        mensajes.forEach(m => {
            if(m.id === 'recepcion') document.getElementById('msg-recepcion').value = m.texto;
            if(m.id === 'cobro_pago_movil') document.getElementById('msg-cobro-pago-movil').value = m.texto;
            if(m.id === 'cobro_zelle') document.getElementById('msg-cobro-zelle').value = m.texto;
            if(m.id === 'cobro_efectivo') document.getElementById('msg-cobro-efectivo').value = m.texto;
            if(m.id === 'aprobado') document.getElementById('msg-aprobado').value = m.texto;
            if(m.id === 'final_delivery') document.getElementById('msg-final-delivery').value = m.texto;
            if(m.id === 'final_pickup') document.getElementById('msg-final-pickup').value = m.texto;
            if(m.id === 'modificado') document.getElementById('msg-modificado').value = m.texto;
        });
    } catch (e) { 
        console.error("Error cargando mensajes:", e); 
        document.getElementById('msg-recepcion').value = "Error de conexión. Verifica que el webhook 'obtener-mensajes' en n8n esté activo.";
    }
}

// -----------------------------------------------------------------
// EVENTO CLAVE: DISPARAR LA CARGA AL ABRIR LA PÁGINA
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    cargarMensajesWP();
});
// -----------------------------------------------------------------

// Lógica para guardar (se mantiene igual)
if(document.getElementById('form-mensajes')) {
    document.getElementById('form-mensajes').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            recepcion: document.getElementById('msg-recepcion').value,
            cobro_pago_movil: document.getElementById('msg-cobro-pago-movil').value,
            cobro_zelle: document.getElementById('msg-cobro-zelle').value,
            cobro_efectivo: document.getElementById('msg-cobro-efectivo').value,
            aprobado: document.getElementById('msg-aprobado').value,
            final_delivery: document.getElementById('msg-final-delivery').value,
            final_pickup: document.getElementById('msg-final-pickup').value,
            modificado: document.getElementById('msg-modificado').value
        };
        try {
            await fetch(URL_GUARDAR_MSJ, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            alert("¡Mensajes actualizados con éxito!");
        } catch (error) { alert("Error al guardar en la base de datos."); }
    });
}
