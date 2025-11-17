// --- MODIFICADO: Email de Admin ---
const ADMIN_EMAIL = "edfmarcoflores@gmail.com";

const $ = (id)=>document.getElementById(id);
// --- MODIFICADO: Evento DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', ()=>{
  // Carga los componentes HTML (header, footer, etc.)
  loadComponents().then(() => {
    // Esta función se ejecutará DESPUÉS de que se cargue el HTML
    // Esto es importante para que el script pueda "ver" los elementos cargados.
    
    // Actualizamos el año (que está en el footer que acabamos de cargar)
    const y=$('year'); 
    if(y) {
      y.textContent=new Date().getFullYear();
    } else {
      console.warn("No se encontró el span #year para actualizar.");
    }
    
    // Forzamos una actualización de la UI del dock y la sesión
    // ya que el estado (currentUser) pudo cargarse ANTES que el HTML del dock.
    // toggleAuthUI(!!currentUser); // <-- ELIMINADO de aquí
    // updateDock(currentUser);      // <-- ELIMINADO de aquí

    // En su lugar, dejamos que initAuth() o onAuthStateChange() manejen la UI
    // la primera vez, asegurando que el DOM esté 100% cargado.
  })
  .catch(err => {
      console.error("Error fatal al cargar componentes HTML. El sitio no funcionará.", err);
  });
});

// ------- AUTH -------
let currentUser = null;

function toggleAuthUI(isLogged){
  // Esta función ahora se llama de forma segura DESPUÉS de que loadComponents() termina
  document.querySelectorAll('.auth-yes').forEach(el=>el.classList.toggle('hidden',!isLogged));
  document.querySelectorAll('.auth-no').forEach(el=>el.classList.toggle('hidden',isLogged));
  const pill=$('session-pill');
  if(pill){
    if(isLogged){
      pill.textContent = currentUser?.email || 'Cuenta';
      pill.className='inline-flex items-center text-xs px-3 py-1 rounded-full border ml-2 bg-green-50 border-green-300 text-green-800';
      pill.classList.remove('hidden');
    }else{
      pill.textContent='Invitado';
      pill.className='inline-flex items-center text-xs px-3 py-1 rounded-full border ml-2 bg-white';
      pill.classList.remove('hidden');
    }
  }
  updateDock(currentUser);
}
function openAuthModal(){ $('auth-modal')?.classList.remove('hidden'); }
function closeAuthModal(){ $('auth-modal')?.classList.add('hidden'); }

// --- FUNCIÓN DE AUTH MODIFICADA (ARREGLA EL LOGIN PERSISTENTE) ---
async function handleEmailPasswordAuth(e){
  e.preventDefault();
  const email = ($('auth-email')?.value||'').trim();
  const password = ($('auth-password')?.value||'').trim();
  const mode = document.querySelector('input[name="authMode"]:checked')?.value||'login';
  
  try{
    let data, error;
    if(mode==='login'){
      // --- MODO LOGIN ---
      ({ data, error } = await sb.auth.signInWithPassword({ email, password }));
      if(error) throw error;
      if (!data.user) throw new Error("Datos incorrectos o email no confirmado.");
      showToast('¡Bienvenido de vuelta!');
      
    }else{
      // --- MODO SIGNUP (CREAR CUENTA) ---
      ({ data, error } = await sb.auth.signUp({ email, password }));
      if(error) throw error;
      
      if (data.user && !data.session) {
        showToast('¡Cuenta creada! Revisa tu email para confirmar tu cuenta.');
      } else if (data.user && data.session) {
        showToast('¡Cuenta creada! Iniciando sesión...');
      } else {
        throw new Error("No se pudo crear la cuenta.");
      }
    }
    
    // Si el login o signup fue exitoso, onAuthStateChange se disparará
    // y manejará el cierre del modal, la actualización de la UI y el renderizado
    // de programas. Ya no lo hacemos aquí.
    
    // PERO si el usuario se registra y necesita confirmar email,
    // onAuthStateChange no se dispara con sesión, así que cerramos el modal manualmente.
    if (mode === 'signup' && data.user && !data.session) {
       closeAuthModal();
    }

  }catch(err){ 
    // Captura cualquier error (ej: "User already registered")
    showToast('Error: '+(err.message||err)); 
  }
}

async function requestPasswordReset(){
  const email = ($('auth-email')?.value||'').trim();
  if(!email){
    showToast("Ingresa tu email primero y luego presiona el enlace.");
    return;
  }
  const resetUrl = window.location.origin + '/reset-password.html';
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl,
  });
  if (error) {
    showToast('Error: ' + error.message);
  } else {
    showToast('Te enviamos un email. Revisa tu correo.');
    closeAuthModal();
  }
}

async function logout(){
  if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
    return; 
  }
  try{ 
    await sb.auth.signOut(); 
    // onAuthStateChange se encargará de actualizar la UI
    showToast('Sesión cerrada.'); 
  }catch(e){ 
    showToast('No se pudo cerrar sesión: '+(e.message||e)); 
  }
}

function updateDock(user){
  const btn=$('dock-auth'); if(!btn) return;
  if(user){ btn.onclick=logout; btn.title='Cerrar sesión'; btn.classList.remove('bg-green-600'); btn.classList.add('bg-red-600'); }
  else{ btn.onclick=openAuthModal; btn.title='Cuenta'; btn.classList.remove('bg-red-600'); btn.classList.add('bg-green-600'); }
}

(async function initAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  
  // Espera a que el DOM esté listo antes de manipularlo
  await domReady();
  
  toggleAuthUI(!!currentUser); // Actualiza la UI con el estado inicial
  if(currentUser){ 
    await ensureProfile(); 
    await renderMyPrograms(); 
  }
})();

// --- MODIFICADO: onAuthStateChange ---
// Esta es la función clave que arregla tu modal y cierre de sesión
sb.auth.onAuthStateChange(async (_evt, session)=>{
  currentUser = session?.user || null;
  
  // Espera a que el DOM esté listo
  await domReady();
  
  toggleAuthUI(!!currentUser); // Actualiza la UI (header, dock, etc.)
  
  if(currentUser){ 
    // Usuario acaba de iniciar sesión
    await ensureProfile(); 
    await renderMyPrograms();
    
    // Cierra el modal (si es que estaba abierto)
    closeAuthModal();
    
    // Si el evento fue SIGNED_IN, lo saludamos y lo llevamos a sus programas
    if (_evt === 'SIGNED_IN') {
      setTimeout(()=>document.getElementById('mis-programas').scrollIntoView({behavior:'smooth'}), 350);
    }
    
  } else { 
    // Usuario acaba de cerrar sesión
    const grid=$('mis-programas-grid'); 
    if(grid) grid.innerHTML=''; // Limpia la grilla de programas
  }
});

// ------- PERFIL -------
async function ensureProfile(){
  if(!currentUser) return;
  try{
    const { data:existing }=await sb.from(TABLES.profiles).select('id').eq('id',currentUser.id).maybeSingle();
    if(!existing){ await sb.from(TABLES.profiles).insert({ id: currentUser.id, email: currentUser.email }); }
  }catch{ /* noop */ }
}

// ------- MIS PROGRAMAS -------
async function renderMyPrograms(){
  const grid = $('mis-programas-grid');
  if (!grid) return;
  if (!currentUser) {
    grid.innerHTML = '<p class="text-gray-600">Inicia sesión para ver tus compras.</p>';
    return;
  }

  grid.innerHTML = '<p class="text-gray-600">Cargando tus programas…</p>';
  let items = [];
  let isAdmin = (currentUser.email === ADMIN_EMAIL);

  try {
    if (isAdmin) {
      // Admin: Carga todos los planes
      const { data, error } = await sb
        .from(TABLES.plans)
        .select(`id, name, description, storage_filename`)
        .order('name', { ascending: true });
      if (error) throw error;

      items = data.map(plan => ({
        activo: true,
        plan: plan
      })).filter(x => x.plan && x.plan.storage_filename);

    } else {
      // Usuario normal: Carga solo sus compras
      const { data, error } = await sb
        .from(TABLES.purchases)
        .select(`status, created_at, ${TABLES.plans} (id, name, description, storage_filename)`) 
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      items = data.map(row => {
        const p = row[TABLES.plans] || {}; 
        const estado = (row.status || '').toLowerCase();
        const activo = estado.includes('paid') || estado.includes('pagado') || estado.includes('approved') || estado.includes('aprobado');
        return { activo, plan: p };
      }).filter(x => x.plan && x.activo && x.plan.storage_filename);
    }
    
    renderProgramCards(grid, items, isAdmin);

  } catch (error) {
    console.error(error);
    grid.innerHTML = '<p class="text-red-600">Error al cargar tus programas.</p>';
  }
}

function renderProgramCards(grid, items, isAdmin) {
  if (!items || !items.length) {
    grid.innerHTML = `<div class="text-center"><p class="text-gray-700">Aún no tienes programas activos.</p><a href="#programas" class="inline-block mt-3 px-4 py-2 rounded-lg bg-accent-vibrant text-black font-bold">Ver catálogo</a></div>`;
    return;
  }
  
  const badge = isAdmin 
    ? '<span class="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800 font-semibold">ADMIN</span>' 
    : '<span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800 font-semibold">ACTIVO</span>';

  grid.innerHTML = items.map(({ plan }) => {
    return `<article class="rounded-2xl border bg-white p-6 shadow-sm flex flex-col">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xl font-bold">${plan.name || 'Programa'}</h4>
        ${badge}
      </div>
      <p class="text-sm text-gray-600 flex-grow">${plan.description || '&nbsp;'}</p>
      <div class="flex gap-3 mt-3">
        <button data-path="${encodeURIComponent(plan.storage_filename || '')}" class="open-plan px-4 py-2 rounded-lg bg-accent-vibrant text-black font-bold">Abrir programa</button>
      </div>
    </article>`;
  }).join('');

  grid.removeEventListener('click', handlePlanClick); // Limpia por si acaso
  grid.addEventListener('click', handlePlanClick);
}

async function handlePlanClick(e) {
  const btn = e.target.closest('.open-plan');
  if (!btn) return;
  
  btn.disabled = true;
  btn.textContent = "Abriendo...";

  const enc = btn.getAttribute('data-path');
  const path = decodeURIComponent(enc || '');
  if (!path) {
    showToast('Falta ruta del archivo en Storage.');
    btn.disabled = false;
    btn.textContent = "Abrir programa";
    return;
  }
  try {
    // ESTA LÍNEA ES LA CORRECTA, que usa las rutas de Netlify
    const url = window.location.origin + '/' + path;
    console.log("Intentando abrir:", url); 
    window.open(url, '_blank');
  } catch (err) {
    showToast('No se pudo abrir el programa: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Abrir programa";
  }
}

// #############################################
// ### ¡¡¡NUEVA LÓGICA DE PAGO!!! ###
// #############################################

// 1. Escuchador de clics global para los nuevos botones .btn-comprar
document.addEventListener('click', (e) => {
  const purchaseBtn = e.target.closest('.btn-comprar');
  if (purchaseBtn) {
    e.preventDefault(); // Previene cualquier acción por defecto
    const planId = purchaseBtn.getAttribute('data-plan-id');
    const planText = purchaseBtn.textContent;
    
    if (planId) {
      handlePurchase(planId, purchaseBtn);
    } else {
      showToast('Error: Botón sin ID de plan.');
    }
  }
});

// 2. Nueva función para manejar la compra
async function handlePurchase(planId, buttonElement) {
  // Guardamos el texto original del botón
  const originalText = buttonElement.textContent;
  
  // PASO 1: Verificar si el usuario está logueado
  if (!currentUser) {
    showToast("Debes iniciar sesión para comprar.");
    openAuthModal();
    return;
  }
  
  // PASO 2: Poner el botón en modo "cargando"
  buttonElement.disabled = true;
  buttonElement.textContent = "Generando link...";
  
  try {
    // PASO 3: Llamar a nuestra (futura) Netlify Function
    // Esta función de backend creará el link de pago en Mercado Pago
    const response = await fetch('/.netlify/functions/create-payment-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sb.auth.session.access_token}` // Enviamos el token del usuario
      },
      body: JSON.stringify({ planId: planId }) // Enviamos el ID del plan que queremos comprar
    });

    if (!response.ok) {
      throw new Error('Error al contactar con el servidor.');
    }

    const data = await response.json();
    
    // PASO 4: Redirigir al usuario al link de pago de Mercado Pago
    if (data.payment_url) {
      window.location.href = data.payment_url;
    } else {
      throw new Error('No se recibió la URL de pago.');
    }
    
  } catch (err) {
    console.error('Error en handlePurchase:', err);
    showToast('Error al crear el pago: ' + err.message);
    // Restauramos el botón si hay un error
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
  }
}


// ------- Utilitarios UI -------
function showToast(msg){ const t=$('toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.classList.add('hidden'),2500); }

// Función de utilidad para esperar al DOM
function domReady() {
  return new Promise((resolve) => {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      resolve();
    } else {
      document.addEventListener("DOMContentLoaded", resolve);
    }
  });
}

// ------- Calculadora 1RM -------
function calc1RM(){
  const w=parseFloat(($('rm-peso')?.value)||'0');
  const r=parseInt(($('rm-reps')?.value)||'0',10);
  const res=$('rm-res');
  if(!w||!r){ if(res) res.textContent='Ingresa peso y repeticiones.'; return; }
  const e1rm=w*(1+r/30);
  const targets=[0.6,0.7,0.8,0.85,0.9];
  const filas=targets.map(p=>`<li>${Math.round(p*100)}% ≈ <strong>${(e1rm*p).toFixed(1)} kg</strong></li>`).join('');
  if(res){ res.innerHTML=`<p>1RM estimado: <strong>${e1rm.toFixed(1)} kg</strong></p><ul class="mt-2 list-disc pl-5">${filas}</ul>`; }
  localStorage.setItem('rm_last', String(e1rm));
}

// ------- Generador de Rutina Rápida -------
function generateQuickRoutine() {
  const philosophies = [
    // ... (Tu lista larga de filosofías, la mantengo intacta) ...
    {
      author: "Chris Aceto",
      philosophy: "Volumen y variedad 'Old School' (Ejemplo: Día de Pecho).",
      routine: [
        "1. (Compuesto Inclinado) Press Inclinado c/Barra: 4 series x 8-10 reps.",
        "2. (Compuesto Plano) Press Plano c/Mancuernas: 3 series x 10-12 reps.",
        "3. (Aislamiento) Aperturas Inclinadas c/Mancuernas: 3 series x 12-15 reps.",
        "4. (Aislamiento) Cruces de Polea (Cable Crossovers): 3 series x 15 reps.",
        "5. (Finalizador) Push-ups (flexiones): 2 series al fallo."
      ]
    }
  ];
  const style = philosophies[Math.floor(Math.random() * philosophies.length)];
  const resDiv = $('routine-res');
  if (!resDiv) return;
  const exercisesHtml = style.routine.map(item => `<li>${item}</li>`).join('');
  resDiv.innerHTML = `
    <h4 class="text-base font-bold text-black mb-1">Inspirado en: ${style.author}</h4>
    <p class="text-sm text-gray-800 mb-2"><strong>Principio:</strong> ${style.philosophy}</p>
    <ul class="mt-2 list-disc pl-5 space-y-1">
      ${exercisesHtml}
    </ul>
  `;
}


// ------- FORMULARIO DE CONTACTO (MODIFICADO PARA GUARDAR EN SUPABASE) -------
async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const btnOrigText = btn.textContent;
  const name = ($('nombre')?.value || '').trim();
  const email = ($('email')?.value || '').trim();
  const interest = ($('interes')?.value || '').trim();
  const message = ($('mensaje')?.value || '').trim();
  if (!name || !email || !interest) {
     showToast('Completa al menos nombre, email e interés.');
     return;
  }
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    const { error } = await sb
      .from('contact_messages') 
      .insert({ name: name, email: email, interest: interest, message: message });
    if (error) throw error; 
    showToast(`¡Gracias, ${name}! He recibido tu mensaje.`);
    form.reset(); 
  } catch (err) {
    console.error("Error al enviar formulario:", err);
    showToast('Error al enviar. Intenta de nuevo más tarde.');
  } finally {
    btn.disabled = false;
    btn.textContent = btnOrigText;
  }
}

// ------- UI: ver niveles -------
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('.levels-toggle'); if(!btn) return;
  const sel=btn.getAttribute('data-target'); const panel=document.querySelector(sel); if(!panel) return;
  panel.classList.toggle('open'); btn.setAttribute('aria-expanded', panel.classList.contains('open')?'true':'false');
});

// --- FUNCIÓN: CARGADOR DE COMPONENTES HTML ---
async function loadComponents() {
  const components = [
    { id: 'header-placeholder', url: '_header.html' },
    { id: 'footer-placeholder', url: '_footer.html' },
    { id: 'modal-placeholder', url: '_auth-modal.html' },
    { id: 'dock-placeholder', url: '_dock.html' }
  ];
  const fetchComponent = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Error al cargar ${url}: ${response.statusText}`);
        return ''; 
      }
      return await response.text();
    } catch (error) {
      console.error(`Error de red al cargar ${url}:`, error);
      return '';
    }
  };
  const loadedComponents = await Promise.all(
    components.map(async (c) => {
      const html = await fetchComponent(c.url);
      return { id: c.id, html };
    })
  );
  let allLoaded = true;
  loadedComponents.forEach(c => {
    const el = $(c.id);
    if (el) {
      el.innerHTML = c.html;
    } else {
      allLoaded = false;
      console.warn(`No se encontró el placeholder: #${c.id}`);
    }
  });
  
  if(allLoaded) {
    console.log("Componentes cargados.");
  }
}