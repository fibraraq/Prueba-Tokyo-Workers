// =================================================================
// --- LÓGICA EXCLUSIVA DEL PANEL DE ADMINISTRACIÓN ---
// =================================================================
const URL_OBTENER_MSJ = "https://n8n-production-0c91c.up.railway.app/webhook/obtener-mensajes";
const URL_GUARDAR_MSJ = "https://n8n-production-0c91c.up.railway.app/webhook/guardar-mensajes";

async function cargarMensajesWP() {
    const txtRecepcion = document.getElementById('msg-recepcion');
    if(!txtRecepcion) return; // Escudo de seguridad extra

    try {
        txtRecepcion.value = "Cargando plantillas desde la base de datos...";

        const res = await fetch(URL_OBTENER_MSJ);
        const data = await res.json();
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
        if(txtRecepcion) txtRecepcion.value = "Error de conexión. Verifica n8n.";
    }
}

// Cargar mensajes automáticamente al abrir la página
document.addEventListener('DOMContentLoaded', cargarMensajesWP);

// Guardar los mensajes al enviar el formulario
const formMensajes = document.getElementById('form-mensajes');
if(formMensajes) {
    formMensajes.addEventListener('submit', async (e) => {
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
