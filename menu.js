const menuData = {
    combos: [
        { id: "c1", name: "Combo Económico Arroz Tres Carnes", price: 6.19, desc: "450g de arroz, carne variada + 2 lumpias", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80" },
        { id: "c2", name: "Combo Económico Arroz Oriental", price: 6.19, desc: "450g de arroz, camarón, vegetales + 2 lumpias", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80" },
        { id: "c3", name: "Promoción Ebby Roll (20 piezas)", price: 9.19, desc: "Roles fríos con camarón empanizado y salsa fuji", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80" },
        { id: "c4", name: "Combo Fusión Familiar", price: 17.69, desc: "1 Roll Frío + 1 Roll Tempura + 1 Plato + raciones", image: "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=400&q=80" }
    ],
    cocina: [
        { id: "p1", name: "Arroz Especial (Pollo y Camarón)", price: 8.20, desc: "Bandeja individual de la casa", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80" },
        { id: "p2", name: "Arroz 3 Carnes (Pollo, Carne, Cerdo)", price: 8.20, desc: "Bandeja individual", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80" },
        { id: "p3", name: "Tallarines de Carne y Camarón", price: 8.20, desc: "Bandeja individual", image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&q=80" },
        { id: "p4", name: "Pollo Agridulce con Papas", price: 8.20, desc: "Acompañado de papas fritas", image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&q=80" }
    ],
    sushi: [
        { id: "s1", name: "Nozomi Roll Tempura (12 pzs)", price: 6.69, desc: "Camarón tempura, cangrejo, queso crema y salsa anguila", image: "https://images.unsplash.com/photo-1617196034183-421b4917c92d?w=400&q=80" },
        { id: "s2", name: "Okinawa Roll Tempura (12 pzs)", price: 6.69, desc: "Topping de camarón tempura y salsa fuji", image: "https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=400&q=80" },
        { id: "s3", name: "Hiroshima Roll Tempura (12 pzs)", price: 6.69, desc: "Pescado blanco tempura, aguacate y salsa anguila", image: "https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=400&q=80" }
    ],
    extras: [
        { id: "e1", name: "Wakame (100g)", price: 4.50, desc: "Ensalada de algas marinas", image: "https://images.unsplash.com/photo-1633504535090-b33a8af79fa2?w=400&q=80" },
        { id: "e2", name: "Papas Cheddar", price: 4.00, desc: "Ración con queso fundido", image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80" },
        { id: "e3", name: "Pepsi Grande (1.3 Litros)", price: 2.00, desc: "Refresco ideal para compartir", image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&q=80" },
        { id: "e4", name: "Pepsi Mediana (1 Litro)", price: 1.50, desc: "Refresco individual", image: "https://images.unsplash.com/photo-1543257580-7269da773bf5?w=400&q=80" },
        { id: "e5", name: "Salsa de Anguila Extra", price: 0.50, desc: "Porción adicional de salsa dulce", image: "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=400&q=80" },
        { id: "e6", name: "Salsa Fuji Extra", price: 0.50, desc: "Porción adicional de salsa de la casa", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80" }
    ]
};

let cart = {};

window.onload = function() {
    history.replaceState({ step: 1 }, "Paso 1");
};

window.onpopstate = function(event) {
    if (event.state && event.state.step) {
        goToStep(event.state.step, false);
    } else {
        goToStep(1, false);
    }
};

function goToStep(stepNumber, pushState = true) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    window.scrollTo(0, 0);
    
    const backBtn = document.getElementById('header-back-btn');
    if (stepNumber > 1 && stepNumber < 4) {
        backBtn.classList.remove('invisible');
    } else {
        backBtn.classList.add('invisible');
    }

    updateStickyBarVisibility(stepNumber);

    if (pushState) {
        history.pushState({ step: stepNumber }, `Paso ${stepNumber}`);
    }
}

function selectCategory(category) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    
    const titles = { combos: "Promos y Combos", cocina: "Platos de Cocina", sushi: "Roles Especiales", extras: "Bebidas y Extras" };
    document.getElementById('category-title').innerText = titles[category];

    menuData[category].forEach(item => {
        const currentQty = cart[item.id] ? cart[item.id].qty : 0;
        const currentNote = cart[item.id] ? (cart[item.id].note || "") : "";
        const hasNote = currentNote.length > 0;
        
        const itemHtml = `
            <div class="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div class="flex items-center justify-between gap-3">
                    <img src="${item.image}" alt="${item.name}" class="w-20 h-20 object-cover rounded-xl flex-shrink-0 bg-gray-100 border border-gray-100">
                    
                    <div class="flex-grow min-w-0 pr-1">
                        <h4 class="text-sm font-bold text-gray-800 leading-snug">${item.name}</h4>
                        <p class="text-xs text-gray-400 my-0.5 line-clamp-2">${item.desc}</p>
                        <span class="text-red-600 font-bold text-sm block mt-0.5">$${item.price.toFixed(2)}</span>
                    </div>

                    <div class="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl flex-shrink-0 border border-gray-200">
                        <button type="button" onclick="updateQty('${item.id}', '${item.name}', ${item.price}, -1)" class="w-8 h-8 bg-white rounded-lg font-bold text-lg text-gray-700 shadow-sm select-none cursor-pointer">-</button>
                        <input type="number" id="qty-${item.id}" value="${currentQty}" min="0" onchange="setExactQty('${item.id}', '${item.name}', ${item.price}, this.value)" class="w-9 text-center font-black bg-transparent focus:outline-none text-sm text-gray-800">
                        <button type="button" onclick="updateQty('${item.id}', '${item.name}', ${item.price}, 1)" class="w-8 h-8 bg-white rounded-lg font-bold text-lg text-gray-700 shadow-sm select-none cursor-pointer">+</button>
                    </div>
                </div>
                
                <div class="border-t border-gray-100 pt-1">
                    <button type="button" onclick="toggleNoteField('${item.id}')" id="note-btn-${item.id}" class="text-[11px] font-medium text-gray-500 hover:text-red-600 flex items-center gap-1 cursor-pointer select-none">
                        ${hasNote ? '❌ Quitar nota' : '📝 Añadir nota especial (ej. sin papas)'}
                    </button>
                    <input type="text" id="note-input-${item.id}" value="${currentNote}" oninput="updateItemNote('${item.id}', '${item.name}', ${item.price}, this.value)" class="${hasNote ? '' : 'hidden'} w-full mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-red-500 placeholder-gray-400" placeholder="Escribe aquí tu especificación para este plato...">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });

    goToStep(2);
}

function toggleNoteField(id) {
    const input = document.getElementById(`note-input-${id}`);
    const btn = document.getElementById(`note-btn-${id}`);
    
    if (input.classList.contains('hidden')) {
        input.classList.remove('hidden');
        input.focus();
        btn.innerHTML = '❌ Quitar nota';
    } else {
        input.classList.add('hidden');
        input.value = '';
        if (cart[id]) {
            cart[id].note = '';
        }
        btn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
        if (document.getElementById('step-3').classList.contains('active')) {
            prepareCheckout();
        }
    }
}

function updateItemNote(id, name, price, value) {
    if (!cart[id]) {
        cart[id] = { name: name, price: price, qty: 1, note: value };
        const qtyInput = document.getElementById(`qty-${id}`);
        if (qtyInput) qtyInput.value = 1;
        calculateTotals();
    } else {
        cart[id].note = value;
    }

    if (document.getElementById('step-3').classList.contains('active')) {
        prepareCheckout();
    }
}

function removeNoteFromCheckout(id) {
    if (cart[id]) {
        cart[id].note = '';
        
        const noteInput = document.getElementById(`note-input-${id}`);
        const noteBtn = document.getElementById(`note-btn-${id}`);
        if (noteInput) {
            noteInput.classList.add('hidden');
            noteInput.value = '';
        }
        if (noteBtn) {
            noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
        }
        
        prepareCheckout();
    }
}

function updateQty(id, name, price, change) {
    if (!cart[id]) {
        cart[id] = { name: name, price: price, qty: 0, note: "" };
    }
    
    cart[id].qty += change;
    
    if (cart[id].qty <= 0) {
        delete cart[id];
        const element = document.getElementById(`qty-${id}`);
        if (element) element.value = 0;
        const noteInput = document.getElementById(`note-input-${id}`);
        const noteBtn = document.getElementById(`note-btn-${id}`);
        if (noteInput) {
            noteInput.classList.add('hidden');
            noteInput.value = '';
        }
        if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
    } else {
        const element = document.getElementById(`qty-${id}`);
        if (element) element.value = cart[id].qty;
    }
    
    calculateTotals();

    if (document.getElementById('step-3').classList.contains('active')) {
        prepareCheckout();
    }
}

function setExactQty(id, name, price, value) {
    let parsedQty = parseInt(value, 10);
    
    if (isNaN(parsedQty) || parsedQty <= 0) {
        delete cart[id];
        const element = document.getElementById(`qty-${id}`);
        if (element) element.value = 0;
        const noteInput = document.getElementById(`note-input-${id}`);
        const noteBtn = document.getElementById(`note-btn-${id}`);
        if (noteInput) {
            noteInput.classList.add('hidden');
            noteInput.value = '';
        }
        if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
    } else {
        if (!cart[id]) {
            cart[id] = { name: name, price: price, qty: 0, note: "" };
        }
        cart[id].qty = parsedQty;
        const element = document.getElementById(`qty-${id}`);
        if (element) element.value = parsedQty;
    }

    calculateTotals();

    if (document.getElementById('step-3').classList.contains('active')) {
        prepareCheckout();
    }
}

function removeCartItem(id) {
    delete cart[id];
    const element = document.getElementById(`qty-${id}`);
    if (element) element.value = 0;
    const noteInput = document.getElementById(`note-input-${id}`);
    const noteBtn = document.getElementById(`note-btn-${id}`);
    if (noteInput) {
        noteInput.classList.add('hidden');
        noteInput.value = '';
    }
    if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
    
    calculateTotals();

    if (document.getElementById('step-3').classList.contains('active')) {
        prepareCheckout();
    }
}

function calculateTotals() {
    let total = 0;
    let count = 0;
    
    Object.values(cart).forEach(item => {
        total += item.price * item.qty;
        count += item.qty;
    });

    document.getElementById('sticky-cart-total').innerText = `$${total.toFixed(2)}`;
    
    const activeStep = document.querySelector('.step.active') ? document.querySelector('.step.active').id : 'step-1';
    if (count > 0 && activeStep !== 'step-3' && activeStep !== 'step-4') {
        document.getElementById('sticky-cart-bar').classList.remove('hidden');
    } else {
        document.getElementById('sticky-cart-bar').classList.add('hidden');
    }
}

function updateStickyBarVisibility(currentStep) {
    let count = 0;
    Object.values(cart).forEach(item => { count += item.qty; });

    if (count > 0 && currentStep !== 3 && currentStep !== 4) {
        document.getElementById('sticky-cart-bar').classList.remove('hidden');
    } else {
        document.getElementById('sticky-cart-bar').classList.add('hidden');
    }
}

function prepareCheckout() {
    const summaryContainer = document.getElementById('checkout-cart-summary');
    summaryContainer.innerHTML = '';
    
    const cartItems = Object.keys(cart);
    
    if (cartItems.length === 0) {
        document.getElementById('checkout-total-price').innerText = "$0.00";
        goToStep(1);
        return;
    }
    
    let total = 0;
    cartItems.forEach(id => {
        const item = cart[id];
        const subtotal = item.price * item.qty;
        total += subtotal;
        
        const noteHtml = item.note ? `
            <div class="flex items-center justify-between text-xs text-amber-900 bg-amber-100/70 px-2 py-1.5 rounded-xl mt-1 font-medium border border-amber-200 gap-2 shadow-xs">
                <span class="truncate pr-1">📌 Nota: "${item.note}"</span>
                <button type="button" onclick="removeNoteFromCheckout('${id}')" class="text-red-500 hover:text-red-700 font-bold p-1 cursor-pointer select-none text-[11px] flex-shrink-0 transition" title="Eliminar nota">
                    ❌
                </button>
            </div>
        ` : '';
        
        const summaryRowHtml = `
            <div class="py-2 border-b border-amber-200">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex-grow">
                        <p class="font-bold text-gray-800 text-sm leading-tight">${item.name}</p>
                        <p class="text-xs text-amber-900 font-medium mt-0.5">$${item.price.toFixed(2)} c/u • Subtotal: <span class="font-bold">$${subtotal.toFixed(2)}</span></p>
                    </div>
                    <div class="flex items-center space-x-1.5 bg-white border border-amber-300 p-1 rounded-xl flex-shrink-0">
                        <button type="button" onclick="updateQty('${id}', '${item.name}', ${item.price}, -1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer select-none shadow-sm">-</button>
                        <input type="number" value="${item.qty}" min="0" onchange="setExactQty('${id}', '${item.name}', ${item.price}, this.value)" class="w-10 text-center font-black text-sm text-gray-800 bg-transparent focus:outline-none">
                        <button type="button" onclick="updateQty('${id}', '${item.name}', ${item.price}, 1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer select-none shadow-sm">+</button>
                    </div>
                    <button type="button" onclick="removeCartItem('${id}')" class="text-red-500 hover:text-red-700 text-md p-1 cursor-pointer select-none flex-shrink-0" title="Eliminar artículo">
                        ❌
                    </button>
                </div>
                ${noteHtml}
            </div>
        `;
        summaryContainer.insertAdjacentHTML('beforeend', summaryRowHtml);
    });
    
    document.getElementById('checkout-total-price').innerText = `$${total.toFixed(2)}`;

    if (!document.getElementById('step-3').classList.contains('active')) {
        goToStep(3);
    }
}

function toggleAddress() {
    const type = document.getElementById('delivery-type').value;
    const container = document.getElementById('address-container');
    const input = document.getElementById('client-address');
    if (type === 'Pickup') {
        container.style.display = 'none';
        input.removeAttribute('required');
    } else {
        container.style.display = 'block';
        input.setAttribute('required', 'required');
    }
}

function resetForm() {
    cart = {};
    document.getElementById('order-form').reset();
    calculateTotals();
    toggleAddress();
    goToStep(1); 
}

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

    const orderPayload = {
        timestamp: new Date().toISOString(),
        cliente: document.getElementById('client-name').value,
        telefono: document.getElementById('client-phone').value,
        tipo_entrega: document.getElementById('delivery-type').value,
        direccion: document.getElementById('client-address').value || "Retiro por local",
        metodo_pago: document.getElementById('payment-method').value,
        articulos: itemsInCart
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
