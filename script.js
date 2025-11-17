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
    toggleAuthUI(!!currentUser); // Actualiza header y píldora
    updateDock(currentUser);      // Actualiza el botón del dock
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
    if(mode==='login'){
      // --- MODO LOGIN ---
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
      
      currentUser = data.user || data.session?.user || null;
      if (!currentUser) throw new Error("Datos incorrectos o email no confirmado.");

      closeAuthModal();
      toggleAuthUI(true);
      showToast('¡Bienvenido de vuelta!');
      await ensureProfile(); 
      await renderMyPrograms(); 
      setTimeout(()=>document.getElementById('mis-programas').scrollIntoView({behavior:'smooth'}), 350);

    }else{
      // --- MODO SIGNUP (CREAR CUENTA) ---
      const { data, error } = await sb.auth.signUp({ email, password });
      if(error) throw error;
      
      if (data.user && !data.session) {
        // El usuario se creó, PERO necesita confirmar email
        showToast('¡Cuenta creada! Revisa tu email para confirmar tu cuenta.');
        closeAuthModal(); // Cierra el modal, pero NO lo loguea
        
      } else if (data.user && data.session) {
        // El usuario se creó Y la confirmación está desactivada (login inmediato)
        currentUser = data.user;
        closeAuthModal();
        toggleAuthUI(true);
        showToast('¡Cuenta creada! Iniciando sesión...');
        await ensureProfile(); 
        await renderMyPrograms();
        setTimeout(()=>document.getElementById('mis-programas').scrollIntoView({behavior:'smooth'}), 350);
        
      } else {
        throw new Error("No se pudo crear la cuenta.");
      }
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
    currentUser=null; 
    toggleAuthUI(false); 
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
  // Ya no llamamos a toggleAuthUI aquí, esperamos a que el DOM esté listo.
  if(currentUser){ await ensureProfile(); await renderMyPrograms(); }
})();

sb.auth.onAuthStateChange(async (_evt, session)=>{
  currentUser = session?.user || null;
  toggleAuthUI(!!currentUser); // Esto sí está bien para cambios *después* de la carga inicial
  if(currentUser){ await ensureProfile(); await renderMyPrograms(); }
  else { const grid=$('mis-programas-grid'); if(grid) grid.innerHTML=''; }
});

// ------- PERFIL -------
async function ensureProfile(){
  if(!currentUser) return;
  try{
    const { data:existing }=await sb.from(TABLES.profiles).select('id').eq('id',currentUser.id).maybeSingle();
    if(!existing){ await sb.from(TABLEAS.profiles).insert({ id: currentUser.id, email: currentUser.email }); }
  }catch{ /* noop */ }
}

// ------- MIS PROGRAMAS -------

// --- FUNCIÓN signedUrlFor() ELIMINADA ---
// Ya no es necesaria porque el bucket es público.

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
      
      // --- CORRECCIÓN 1: CONSULTA A BASE DE DATOS ---
      const { data, error } = await sb
        .from(TABLES.purchases)
        .select(`status, created_at, ${TABLES.plans} (id, name, description, storage_filename)`) // Corregido: Se quitó ":plan_id"
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // --- FIN CORRECCIÓN 1 ---

      items = data.map(row => {
        const p = row[TABLES.plans] || {}; // Lee desde la tabla 'plans' (el valor de TABLES.plans)
        const estado = (row.status || '').toLowerCase();
        const activo = estado.includes('paid') || estado.includes('pagado') || estado.includes('approved') || estado.includes('aprobado');
        return { activo, plan: p };
      }).filter(x => x.plan && x.activo && x.plan.storage_filename);
    }
    
    // Llama a la función que renderiza
    renderProgramCards(grid, items, isAdmin);

  } catch (error) {
    console.error(error);
    grid.innerHTML = '<p class="text-red-600">Error al cargar tus programas.</p>';
  }
}

// --- CORRECCIÓN 2: DISEÑO DE TARJETAS ---
function renderProgramCards(grid, items, isAdmin) {
  if (!items || !items.length) {
    grid.innerHTML = `<div class="text-center"><p class="text-gray-700">Aún no tienes programas activos.</p><a href="#programas" class="inline-block mt-3 px-4 py-2 rounded-lg bg-accent-vibrant text-black font-bold">Ver catálogo</a></div>`;
    return;
  }
  
  const badge = isAdmin 
    ? '<span class="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800 font-semibold">ADMIN</span>' 
    : '<span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800 font-semibold">ACTIVO</span>';

  grid.innerHTML = items.map(({ plan }) => {
    
    // 1. Añadimos 'flex flex-col' a la tarjeta para que sea un contenedor flexible vertical.
    // 2. Añadimos 'flex-grow' al párrafo de descripción para que "empuje" el botón hacia abajo.
    // 3. Añadimos '&nbsp;' como fallback si no hay descripción, para que el párrafo no colapse.
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

  // Asigna el manejador de clics al grid
  grid.removeEventListener('click', handlePlanClick); // Limpia por si acaso
  grid.addEventListener('click', handlePlanClick);
}
// --- FIN CORRECCIÓN 2 ---


// #############################################
// ### ¡¡¡ESTA FUNCIÓN ESTÁ ARREGLADA!!! ###
// #############################################
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
    // --- ESTA ES LA LÍNEA CORREGIDA ---
    // Construye la URL usando el origen de tu sitio (Netlify) y la ruta que
    // acabas de arreglar en la base de datos (Paso 1).
    const url = window.location.origin + '/' + path;
    
    console.log("Intentando abrir:", url); // Para depurar
    
    window.open(url, '_blank');
  } catch (err) {
    showToast('No se pudo abrir el programa: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Abrir programa";
  }
}
// #############################################


// ------- Utilitarios UI -------
function showToast(msg){ const t=$('toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.classList.add('hidden'),2500); }

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

// ------- NUEVA FUNCIÓN (MÁS COMPLETA): Generador de Rutina Rápida -------
// --- AHORA CON 18 VARIACIONES ---
function generateQuickRoutine() {
  const philosophies = [
    // --- Mark Rippetoe (2) ---
    {
      author: "Mark Rippetoe (Starting Strength)",
      philosophy: "Fuerza básica y progresión lineal simple (Ejemplo Workout A).",
      routine: [
        "Sentadilla: 3 series x 5 reps (pesado)",
        "Press de Banca: 3 series x 5 reps (pesado)",
        "Peso Muerto: 1 serie x 5 reps (pesado)",
        "Dominadas (Chinups): 3 series al fallo (como accesorio)"
      ]
    },
    {
      author: "Mark Rippetoe (Starting Strength)",
      philosophy: "Fuerza básica y progresión lineal simple (Ejemplo Workout B).",
      routine: [
        "Sentadilla: 3 series x 5 reps (pesado)",
        "Press Militar (OHP): 3 series x 5 reps (pesado)",
        "Power Clean: 5 series x 3 reps (técnica/velocidad)",
        "Fondos (Dips): 3 series al fallo (como accesorio)"
      ]
    },
    // --- Louie Simmons (2) ---
    {
      author: "Louie Simmons (Westside Barbell)",
      philosophy: "Método Conjugado (Ejemplo: Día de Esfuerzo Máximo - ME Upper).",
      routine: [
        "1. (ME Main) Press de Banca c/cadenas: Trabajar hasta 1RM.",
        "2. (Asistencia) Press Inclinado c/Mancuernas: 3-4 series x 6-10 reps.",
        "3. (Tríceps) Fondos c/lastre o Press Francés: 4 series x 8-10 reps.",
        "4. (Espalda) Remo con Barra (Pendlay): 4 series x 10 reps.",
        "5. (Accesorio) Elevaciones Laterales + Face Pulls: 3 series x 12-15 reps."
      ]
    },
    {
      author: "Louie Simmons (Westside Barbell)",
      philosophy: "Método Conjugado (Ejemplo: Día de Esfuerzo Dinámico - DE Lower).",
      routine: [
        "1. (DE Main) Box Squat (c/bandas): 10 series x 2 reps (al 50-60% 1RM, rápido).",
        "2. (Asistencia) Peso Muerto Rumano: 3-4 series x 8-10 reps.",
        "3. (Auxiliar) Sentadilla Búlgara: 3 series x 10-12 reps por pierna.",
        "4. (Core) Abdominales 'Pulldown' en polea: 4 series x 15 reps."
      ]
    },
    // --- Dante Trudel (2) ---
    {
      author: "Dante Trudel (DC Training)",
      philosophy: "Alta intensidad, bajo volumen (Ejemplo: Workout A - Pecho, Hombros, Tríceps).",
      routine: [
        "1. (Pecho) Press Inclinado c/m: 1 serie 'Rest-Pause' (total 11-15 reps).",
        "2. (Hombros) Press Militar c/barra: 1 serie 'Rest-Pause' (total 11-15 reps).",
        "3. (Tríceps) Press Francés: 1 serie 'Rest-Pause' (total 11-15 reps).",
        "4. (Pecho - Stretch) Aperturas c/m (Stretch estático en el fondo): 60-90 segundos.",
        "5. (Hombros - Stretch) Stretch lateral de deltoides: 60-90 segundos."
      ]
    },
    {
      author: "Dante Trudel (DC Training)",
      philosophy: "Alta intensidad, bajo volumen (Ejemplo: Workout B - Espalda, Bíceps, Piernas).",
      routine: [
        "1. (Espalda) Remo con Barra (Rest-Pause): 1 serie 'Rest-Pause' (total 11-15 reps).",
        "2. (Bíceps) Curl con Barra (Rest-Pause): 1 serie 'Rest-Pause' (total 11-15 reps).",
        "3. (Cuádriceps) Sentadilla Hack: 1 serie de 20 reps ('Widowmaker').",
        "4. (Femorales) Curl Femoral (Rest-Pause): 1 serie 'Rest-Pause' (total 15-20 reps).",
        "5. (Espalda - Stretch) Dominadas c/peso (colgando en stretch): 60-90 segundos."
      ]
    },
    // --- John Meadows (2) ---
    {
      author: "John Meadows (Mountain Dog)",
      philosophy: "Alto volumen y variedad (Ejemplo: Día de Pecho y Hombros).",
      routine: [
        "1. (Pre-activación Pecho) Pec Deck: 3 series x 20 reps (apretando).",
        "2. (Pre-activación Hombro) Elevaciones Laterales c/cable: 3 series x 15 reps.",
        "3. (Explosivo) Press Inclinado c/Mancuernas: 3 series x 8-10 reps (pesado).",
        "4. (Stretch/Carga) Press de Banca en máquina (con stretch): 3 series x 10-12 reps.",
        "5. (Intensidad/Pump) Aperturas en polea (Flys): 4 series x 12-15 reps.",
        "6. (Finalizador Hombro) Elevaciones Laterales (Drop-set): 2 series al fallo."
      ]
    },
    {
      author: "John Meadows (Mountain Dog)",
      philosophy: "Alto volumen y variedad (Ejemplo: Día de Piernas 'Aniquilación').",
      routine: [
        "1. (Pre-activación) Curl Femoral Tumbado: 4 series x 15-20 reps.",
        "2. (Compuesto) Prensa de Piernas (pies bajos): 3 series x 12-15 reps.",
        "3. (Aislamiento) Extensiones de Cuádriceps (oclusión/BFR): 3 series (30-15-15).",
        "4. (Cad. Posterior) Peso Muerto Rumano c/m: 3 series x 10-12 reps.",
        "5. (Compuesto 2) Sentadilla Hack (enfoque en VMO): 3 series x 10 reps.",
        "6. (Gemelos) Elevación de talones: 4 series x 15 reps."
      ]
    },
    // --- Hany Rambod (2) ---
    {
      author: "Hany Rambod (FST-7)",
      philosophy: "Stretch fascial con 7 series finales (Ejemplo: Día de Bíceps y Tríceps).",
      routine: [
        "1. (Bíceps - Masa) Curl con Barra: 3 series x 8-12 reps.",
        "2. (Tríceps - Masa) Press Francés: 3 series x 8-12 reps.",
        "3. (Bíceps - Aislamiento) Curl Scott: 3 series x 10-12 reps.",
        "4. (Tríceps - Aislamiento) Patada de tríceps c/cable: 3 series x 10-12 reps.",
        "5. (Bíceps - FST-7) Curl en polea baja: 7 series x 10-12 reps (30s descanso).",
        "6. (Tríceps - FST-7) Extensiones en polea alta: 7 series x 10-12 reps (30s descanso)."
      ]
    },
    {
      author: "Hany Rambod (FST-7)",
      philosophy: "Stretch fascial con 7 series finales (Ejemplo: Día de Pecho).",
      routine: [
        "1. (Compuesto) Press Inclinado c/Mancuernas: 3 series x 8-12 reps.",
        "2. (Compuesto 2) Press de Banca Plano c/Barra: 3 series x 8-12 reps.",
        "3. (Aislamiento) Aperturas Inclinadas c/Mancuernas: 3 series x 10-12 reps.",
        "4. (FST-7) Cruces de Polea (Cable Crossovers): 7 series x 10-12 reps (30s descanso)."
      ]
    },
    // --- Charles Glass (2) ---
    {
      author: "Charles Glass",
      philosophy: "Foco en ángulos únicos y contracción (Ejemplo: Día de Espalda).",
      routine: [
        "1. (Amplitud) Dominadas (agarre ancho, foco en apretar): 4 series x 8-12 reps.",
        "2. (Grosor/Ángulo 1) Remo en polea baja (sentado, girando torso levemente): 3x10-12.",
        "3. (Grosor/Ángulo 2) Remo unilateral c/m (con torso muy inclinado, 'serrucho'): 3x10.",
        "4. (Detalle/Lumbar) Extensiones de espalda (hipers): 3 series x 15 reps.",
        "5. (Aislamiento/Contracción) Pullover en polea alta (codos flexionados): 3x12-15."
      ]
    },
    {
      author: "Charles Glass",
      philosophy: "Foco en ángulos únicos y contracción (Ejemplo: Día de Piernas).",
      routine: [
        "1. (Cuádriceps) Sentadilla Sissy (con asistencia): 3 series x 15-20 reps.",
        "2. (Compuesto) Prensa de Piernas (pies altos/separados para glúteo): 4x10-12.",
        "3. (Femorales) Curl Femoral (con pausa de 1s en contracción): 4x10-12.",
        "4. (Aislamiento) Extensiones de Cuádriceps (parciales + completas): 3x10+10 reps.",
        "5. (Glúteo) Patada de Glúteo en máquina o polea (contracción máxima): 3x12-15."
      ]
    },
    // --- Boris Sheiko (2) ---
    {
      author: "Boris Sheiko",
      philosophy: "Alto volumen y frecuencia, cargas submáximas (Ejemplo: Día 1).",
      routine: [
        "1. Sentadilla: 5 series x 5 reps (al 70% 1RM).",
        "2. Press de Banca: 6 series x 4 reps (al 75% 1RM).",
        "3. Sentadilla: 4 series x 6 reps (al 65% 1RM).",
        "4. Press de Banca (Técnica): 5 series x 5 reps (al 70% 1RM, con pausa).",
        "5. (Asistencia) Extensiones de tríceps: 3 series x 10 reps."
      ]
    },
    {
      author: "Boris Sheiko",
      philosophy: "Alto volumen y frecuencia, cargas submáximas (Ejemplo: Día 2).",
      routine: [
        "1. Peso Muerto (hasta las rodillas): 5 series x 4 reps (al 70% 1RM).",
        "2. Press de Banca: 5 series x 5 reps (al 75% 1RM).",
        "3. Peso Muerto: 4 series x 4 reps (al 80% 1RM).",
        "4. Press de Banca: 6 series x 3 reps (al 80% 1RM).",
        "5. (Asistencia) Fondos (Dips): 4 series x 8 reps."
      ]
    },
    // --- Dave Tate (2) ---
    {
      author: "Dave Tate (EliteFTS)",
      philosophy: "Fuerza bruta con asistencia pesada (Ejemplo: ME Lower Body).",
      routine: [
        "1. (ME Main) Sentadilla c/barra de seguridad (Safety Bar Squat): Trabajar hasta 1-3RM.",
        "2. (Asistencia Principal) Sentadilla Búlgara c/m: 3 series x 10-12 reps.",
        "3. (Cadena Posterior) 'Good Mornings' con bandas: 4 series x 10 reps.",
        "4. (Core) 'Ab wheel' (Rueda Abdominal): 4 series al fallo.",
        "5. (Acondicionamiento) Empuje de trineo (Sled push): 3 series x 30 metros."
      ]
    },
    {
      author: "Dave Tate (EliteFTS)",
      philosophy: "Fuerza bruta con asistencia pesada (Ejemplo: Día de Hipertrofia/Asistencia).",
      routine: [
        "1. (Compuesto) Press Inclinado c/Mancuernas: 4 series x 12-15 reps.",
        "2. (Espalda) Remo c/Mancuerna (Kroc Rows): 3 series x 15-20 reps (pesado).",
        "3. (Hombros) Elevaciones Laterales (parciales pesadas): 4 series x 20 reps.",
        "4. (Bíceps/Tríceps) Superserie: Curl c/barra + Press Francés: 3x12 c/u.",
        "5. (Espalda Baja) Extensiones de espalda c/peso: 3x15."
      ]
    },
    // --- Chris Aceto (2) ---
    {
      author: "Chris Aceto",
      philosophy: "Volumen y variedad 'Old School' (Ejemplo: Día de Hombros).",
      routine: [
        "1. (Compuesto) Press Militar (sentado, c/mancuernas): 4 series x 8-12 reps.",
        "2. (Lateral) Elevaciones Laterales (pesado): 4 series x 10-12 reps.",
        "3. (Frontal) Elevaciones Frontales c/barra: 3 series x 10-12 reps.",
        "4. (Posterior) 'Pájaros' (Rear delts c/mancuernas): 3 series x 12-15 reps.",
        "5. (Trapecio) Encogimientos (Shrugs) c/mancuernas: 4 series x 12-15 reps."
      ]
    },
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

  // 1. Seleccionar un estilo al azar (ahora de 18 opciones)
  const style = philosophies[Math.floor(Math.random() * philosophies.length)];

  // 2. Obtener el div de resultados
  const resDiv = $('routine-res');
  if (!resDiv) return;

  // 3. Formatear el HTML (usando el mismo estilo que la calculadora 1RM)
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

  // 1. Obtener datos del formulario
  const name = ($('nombre')?.value || '').trim();
  const email = ($('email')?.value || '').trim();
  const interest = ($('interes')?.value || '').trim();
  const message = ($('mensaje')?.value || '').trim();
  
  // Validación simple
  if (!name || !email || !interest) {
     showToast('Completa al menos nombre, email e interés.');
     return;
  }

  // 2. Deshabilitar botón
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    // 3. Enviar a la tabla 'contact_messages' de Supabase
    // (Asegúrate de haber creado esta tabla en tu SQL Editor)
    const { error } = await sb
      .from('contact_messages') // Nombre de la tabla que creamos
      .insert({ 
        name: name, 
        email: email, 
        interest: interest, 
        message: message 
      });
    
    if (error) throw error; // Lanza el error si Supabase falla
    
    // 4. Éxito
    showToast(`¡Gracias, ${name}! He recibido tu mensaje.`);
    form.reset(); // Limpia el formulario

  } catch (err) {
    // 5. Error
    console.error("Error al enviar formulario:", err);
    showToast('Error al enviar. Intenta de nuevo más tarde.');
  } finally {
    // 6. Rehabilitar el botón (pase lo que pase)
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
  // Define los componentes y dónde cargarlos
  const components = [
    { id: 'header-placeholder', url: '_header.html' },
    { id: 'footer-placeholder', url: '_footer.html' },
    { id: 'modal-placeholder', url: '_auth-modal.html' },
    { id: 'dock-placeholder', url: '_dock.html' }
  ];

  // Función interna para cargar un solo archivo
  const fetchComponent = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Error al cargar ${url}: ${response.statusText}`);
        return ''; // Devuelve vacío si falla
      }
      return await response.text();
    } catch (error) {
      console.error(`Error de red al cargar ${url}:`, error);
      return '';
    }
  };

  // Carga todos los componentes en paralelo
  const loadedComponents = await Promise.all(
    components.map(async (c) => {
      const html = await fetchComponent(c.url);
      return { id: c.id, html };
    })
  );

  // Inserta el HTML en el DOM
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