// URLs de n8n actualizadas
const URL_OBTENER_MENU = "https://n8n-production-633e.up.railway.app/webhook/obtener-menu";
const URL_VERIFICAR_CLIENTE = "https://n8n-production-633e.up.railway.app/webhook/verificar-cliente";
const URL_REGISTRAR_CLIENTE = "https://n8n-production-633e.up.railway.app/webhook/registrar-cliente";

let menuData = { combos: [], cocina: [], sushi: [], extras: [] };
let cart = {};
let datosClienteLogueado = null; // Guardará el objeto completo del cliente

// Manejo del arranque adaptado al Login de clientes
window.onload = async function() {
    history.replaceState({ step: 'auth' }, "Autenticación");
    
    // Verificamos si ya hay un cliente recordado en el navegador
    const sesionCliente = localStorage.getItem('sesionCliente');
    if (sesionCliente) {
        datosClienteLogueado = JSON.parse(sesionCliente);
        document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
        await cargarMenuDesdeDB();
        goToStep(1);
    } else {
        goToStep('auth');
    }
};

window.onpopstate = function(event) {
    if (event.state && event.state.step) {
        goToStep(event.state.step, false);
    } else {
        goToStep('auth', false);
    }
};

// --- CONTROL DE FLUJO DE CLIENTES (AUTENTICACIÓN Y REGISTRO) ---

async function procesarVerificacionTelefono(event) {
    event.preventDefault();
    const txtTelefono = document.getElementById('auth-phone').value.trim();
    if (!txtTelefono) return;

    const btn = document.getElementById('btn-auth-submit');
    btn.disabled = true; btn.innerText = "Verificando...";

    try {
        const response = await fetch(`${URL_VERIFICAR_CLIENTE}?telefono=${txtTelefono}`);
        if (!response.ok) throw new Error('Error de red');
        
        const resultado = await response.json();
        const listaClientes = Array.isArray(resultado) ? resultado : (resultado.data || []);

        if (listaClientes.length > 0) {
            // El cliente ya existe
            datosClienteLogueado = listaClientes[0];
            localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
            document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
            await cargarMenuDesdeDB();
            goToStep(1);
        } else {
            // Cliente nuevo, lo mandamos al paso de registro
            document.getElementById('reg-name').value = '';
            document.getElementById('reg-cedula').value = '';
            document.getElementById('reg-address').value = '';
            goToStep('registro');
        }
    } catch (e) {
        console.error(e);
        alert("Ocurrió un error de conexión al verificar el teléfono.");
    } finally {
        btn.disabled = false; btn.innerText = "Ingresar ➔";
    }
}

async function procesarRegistroCliente(event) {
    event.preventDefault();
    const txtTelefono = document.getElementById('auth-phone').value.trim();
    const payload = {
        telefono: txtTelefono,
        nombre: document.getElementById('reg-name').value.trim(),
        cedula: document.getElementById('reg-cedula').value.trim(),
        direccion_principal: document.getElementById('reg-address').value.trim()
    };

    const btn = document.getElementById('btn-reg-submit');
    btn.disabled = true; btn.innerText = "Registrando...";

    try {
        const response = await fetch(URL_REGISTRAR_CLIENTE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Error al registrar');
        
        const resData = await response.json();
        const registrado = Array.isArray(resData) ? resData[0] : resData;

        datosClienteLogueado = registrado || payload;
        // Inicializamos las direcciones extra vacías
        if (!datosClienteLogueado.direcciones_extra) datosClienteLogueado.direcciones_extra = '[]';

        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
        
        await cargarMenuDesdeDB();
        goToStep(1);
    } catch(e) {
        console.error(e);
        alert("No se pudo completar el registro.");
    } finally {
        btn.disabled = false; btn.innerText = "Crear Cuenta y Ver Menú 🎉";
    }
}

function cerrarSesionCliente() {
    localStorage.removeItem('sesionCliente');
    datosClienteLogueado = null;
    document.getElementById('auth-phone').value = '';
    goToStep('auth');
}

// Modificación a la función goToStep para soportar strings 'auth' y 'registro'
function goToStep(stepNumber, pushState = true) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    window.scrollTo(0, 0);
    
    const backBtn = document.getElementById('header-back-btn');
    if (stepNumber !== 'auth' && stepNumber !== 'registro' && stepNumber > 1 && stepNumber < 4) {
        backBtn.classList.remove('invisible');
    } else {
        backBtn.classList.add('invisible');
    }

    updateStickyBarVisibility(stepNumber);

    if (pushState) {
        history.pushState({ step: stepNumber }, `Paso ${stepNumber}`);
    }
}

function toggleFormularioDatosEnvio() {
    const isChecked = document.getElementById('chk-usar-mis-datos').checked;
    const wrapper = document.getElementById('wrapper-datos-destinatario');
    const inputNombre = document.getElementById('client-name');
    const inputTelefono = document.getElementById('client-phone');

    if (isChecked) {
        wrapper.classList.add('hidden');
        inputNombre.removeAttribute('required');
        inputTelefono.removeAttribute('required');
    } else {
        wrapper.classList.remove('hidden');
        inputNombre.setAttribute('required', 'required');
        inputTelefono.setAttribute('required', 'required');
        inputNombre.value = datosClienteLogueado ? datosClienteLogueado.nombre : '';
        inputTelefono.value = datosClienteLogueado ? datosClienteLogueado.telefono : '';
    }
}

function cargarSelectorDirecciones() {
    const select = document.getElementById('sel-direccion-entrega');
    if (!select || !datosClienteLogueado) return;

    select.innerHTML = '';

    // Opción 1: Dirección principal
    const optPrincipal = document.createElement('option');
    optPrincipal.value = datosClienteLogueado.direccion_principal;
    optPrincipal.innerText = `🏠 Principal: ${datosClienteLogueado.direccion_principal.substring(0, 35)}...`;
    select.appendChild(optPrincipal);

    // Opciones extras mapeando el JSON string
    let extras = [];
    try {
        extras = typeof datosClienteLogueado.direcciones_extra === 'string' 
            ? JSON.parse(datosClienteLogueado.direcciones_extra || '[]') 
            : (datosClienteLogueado.direcciones_extra || []);
    } catch(e) { extras = []; }

    extras.forEach((dir, i) => {
        const opt = document.createElement('option');
        opt.value = dir;
        opt.innerText = `📍 Frecuente ${i+1}: ${dir.substring(0, 35)}...`;
        select.appendChild(opt);
    });

    // Opción final: Dirección momentánea / manual
    const optManual = document.createElement('option');
    optManual.value = "__MANUAL__";
    optManual.innerText = "🗺️ Usar otra dirección (Playa, trabajo, etc)...";
    select.appendChild(optManual);

    manejarSeleccionDireccion();
}

function manejarSeleccionDireccion() {
    const select = document.getElementById('sel-direccion-entrega');
    const wrapperManual = document.getElementById('wrapper-direccion-manual');
    const inputAddress = document.getElementById('client-address');

    if (select.value === "__MANUAL__") {
        wrapperManual.classList.remove('hidden');
        inputAddress.setAttribute('required', 'required');
        inputAddress.value = '';
    } else {
        wrapperManual.classList.add('hidden');
        inputAddress.removeAttribute('required');
        inputAddress.value = select.value;
    }
}

// Sobrescribimos el prepareCheckout original para enganchar el cargador de direcciones
const prepareCheckoutOriginal = prepareCheckout;
prepareCheckout = function() {
    prepareCheckoutOriginal();
    document.getElementById('chk-usar-mis-datos').checked = true;
    toggleFormularioDatosEnvio();
    cargarSelectorDirecciones();
    toggleAddress();
};

function toggleAddress() {
    const type = document.getElementById('delivery-type').value;
    const container = document.getElementById('address-container');
    const input = document.getElementById('client-address');
    const select = document.getElementById('sel-direccion-entrega');

    if (type === 'Pickup') {
        container.style.display = 'none';
        input.removeAttribute('required');
        select.removeAttribute('required');
    } else {
        container.style.display = 'block';
        select.setAttribute('required', 'required');
        manejarSeleccionDireccion();
    }
}

// Modificamos sendOrder para enviar los datos finales exactos organizados
async function sendOrder(event) {
    event.preventDefault();
    
    const itemsInCart = Object.values(cart);
    if (itemsInCart.length === 0) {
        alert("⚠️ Tu carrito está vacío.");
        goToStep(1);
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = "Enviando Orden...";
    submitBtn.disabled = true;

    // Evaluamos el origen de los datos del destinatario
    const esParaMi = document.getElementById('chk-usar-mis-datos').checked;
    const nombreFinal = esParaMi ? datosClienteLogueado.nombre : document.getElementById('client-name').value.trim();
    const telefonoFinal = esParaMi ? datosClienteLogueado.telefono : document.getElementById('client-phone').value.trim();

    // Evaluamos la dirección final
    const tipoEntrega = document.getElementById('delivery-type').value;
    let direccionFinal = "Retiro por local";
    
    if (tipoEntrega === 'Delivery') {
        const select = document.getElementById('sel-direccion-entrega');
        if (select.value === "__MANUAL__") {
            direccionFinal = document.getElementById('client-address').value.trim();
            
            // Si el checkbox de guardar como frecuente está activo, lo gestionamos localmente
            if (document.getElementById('chk-guardar-frecuente').checked) {
                let extras = [];
                try { extras = JSON.parse(datosClienteLogueado.direcciones_extra || '[]'); } catch(e){}
                if (!extras.includes(direccionFinal)) {
                    extras.push(direccionFinal);
                    datosClienteLogueado.direcciones_extra = JSON.stringify(extras);
                    localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
                    
                    // Opcional: Enviar actualización de direcciones_extra a n8n por debajo de la mesa
                    fetch("https://n8n-production-633e.up.railway.app/webhook/actualizar-direcciones-cliente", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ telefono: datosClienteLogueado.telefono, direcciones_extra: datosClienteLogueado.direcciones_extra })
                    }).catch(err => console.error(err));
                }
            }
        } else {
            direccionFinal = select.value;
        }
    }

    const orderPayload = {
        timestamp: new Date().toISOString(),
        cliente: nombreFinal,
        telefono: telefonoFinal,
        tipo_entrega: tipoEntrega,
        direccion: direccionFinal,
        metodo_pago: document.getElementById('payment-method').value,
        articulos: itemsInCart,
        metadata_titular: datosClienteLogueado ? `Pedido por: ${datosClienteLogueado.nombre} (CI: ${datosClienteLogueado.cedula})` : "No registrado"
    };

    const n8nWebhookUrl = "https://n8n-production-633e.up.railway.app/webhook/Prueba-tokyo"; 

    try {
        const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });

        if (response.ok || response.status === 200) {
            goToStep(4);
        } else {
            goToStep(4); 
        }
    } catch (error) {
        console.error("Error:", error);
        goToStep(4); 
    } finally {
        submitBtn.innerText = "🚀 Confirmar y Enviar Pedido";
        submitBtn.disabled = false;
    }
}
