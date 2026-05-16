import './style.css';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc } from "firebase/firestore";

// --- Firebase Mock & Initialization Logic ---
let db, auth;
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isMock = !firebaseConfig.apiKey || firebaseConfig.apiKey === "tu_api_key_aqui" || firebaseConfig.apiKey === "dummy-key";

if (isMock) {
    console.warn("🏠 Modo LOCAL (localStorage): No se detectaron credenciales de Firebase.");
    auth = {
        currentUser: { uid: 'mock-user-123' },
        onAuthStateChanged: (cb) => {
            setTimeout(() => cb({ uid: 'mock-user-123', isAnonymous: true }), 500);
            return () => {};
        },
        signInAnonymously: () => Promise.resolve({ user: { uid: 'mock-user-123' } })
    };
    
    db = {
        collection: (path) => ({ path }),
        onSnapshot: (query, cb) => {
            const load = () => {
                let data = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
                const seedData = [
                    { title: "Hack #1: El 'Frankenstein'", category: "Educativo", description: "Explicar que el DEMRE combina tus mejores puntajes de distintas rendiciones (no se promedian).", script: "¡El sistema toma tu 800 de Invierno y tu 900 de Verano! Nadie promedia nada. Es un buffet.", status: "Idea", id: "local-seed-1", createdAt: new Date().toISOString(), team: "Vlado", location: "Estudio A", dueDate: "2026-06-01" },
                    { title: "Foco Estratégico", category: "Social Media", description: "Recomendación de prepararse para rendir al máximo en solo 1 o 2 materias específicas en esta ocasión.", script: "Por eso, la estrategia de Invierno es ir a asegurar UNA O DOS pruebas específicas. No te estreses por todas.", status: "Idea", id: "local-seed-2", createdAt: new Date().toISOString(), team: "Ana", location: "Remoto", dueDate: "2026-06-05" },
                ];
                let needsSync = false;
                seedData.forEach(seed => {
                    if (!data.find(p => p.title === seed.title)) {
                        data.push(seed);
                        needsSync = true;
                    }
                });
                if (needsSync) localStorage.setItem('av_planner_projects', JSON.stringify(data));
                cb({ docs: data.map(d => ({ id: d.id, data: () => d })) });
            };
            load();
            window.addEventListener('storage', load);
            return () => window.removeEventListener('storage', load);
        },
        addDoc: async (col, data) => {
            const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
            const newDoc = { ...data, id: 'local-' + Date.now() };
            current.push(newDoc);
            localStorage.setItem('av_planner_projects', JSON.stringify(current));
            window.dispatchEvent(new Event('storage'));
            return { id: newDoc.id };
        },
        updateDoc: async (docRef, data) => {
            const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
            const index = current.findIndex(p => p.id === docRef.id);
            if (index !== -1) {
                current[index] = { ...current[index], ...data };
                localStorage.setItem('av_planner_projects', JSON.stringify(current));
                window.dispatchEvent(new Event('storage'));
            }
        },
        deleteDoc: async (docRef) => {
            const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
            const filtered = current.filter(p => p.id !== docRef.id);
            localStorage.setItem('av_planner_projects', JSON.stringify(filtered));
            window.dispatchEvent(new Event('storage'));
        },
        doc: (db, ...path) => ({ id: path[path.length - 1] })
    };
} else {
    console.log("🚀 Conectado a la NUBE de Firebase:", firebaseConfig.projectId);
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}

const appId = import.meta.env.VITE_APP_ID || 'av-planner-default';

window.appState = {
    user: null,
    projects: [],
    currentProject: null,
    view: 'dashboard',
    searchQuery: '',
    sortBy: 'date',
    lightbox: null
};

const initAuth = async () => {
    if (isMock) return;
    try {
        if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
            await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("❌ Error en Autenticación Firebase:", error.code, error.message);
    }
};

onAuthStateChanged(auth, (user) => {
    window.appState.user = user;
    if (user) {
        console.log("👤 Usuario Autenticado:", user.uid, user.isAnonymous ? "(Anónimo)" : "");
        loadData();
    }
});

let unsubscribe = null;
const loadData = () => {
    if (isMock) {
        if (unsubscribe) unsubscribe();
        unsubscribe = db.onSnapshot({}, (snapshot) => {
            window.appState.projects = snapshot.docs.map(doc => ({ ...doc.data() }));
            renderApp();
        });
        return;
    }
    
    console.log("🛰️ Iniciando escucha en tiempo real:", `artifacts/${appId}/public/data/projects`);
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("📥 [Firestore Sync] Recibidos:", snapshot.size, "documentos");
        window.appState.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // --- Auto-Seeding Inteligente (Añadir si faltan o actualizar textos cortos) ---
        const originalIdeas = [
            { title: "Hack #1: El 'Frankenstein'", category: "Educativo", description: "Explicar que el DEMRE combina tus mejores puntajes de distintas rendiciones (no se promedian).", script: "¡El sistema toma tu 800 de Invierno y tu 900 de Verano! Nadie promedia nada. Es un buffet." },
            { title: "Foco Estratégico", category: "Social Media", description: "Recomendación de prepararse para rendir al máximo en solo 1 o 2 materias específicas en esta ocasión.", script: "Por eso, la estrategia de Invierno es ir a asegurar UNA O DOS pruebas específicas. No te estreses por todas." },
            { title: "Hack #2: Distractores", category: "Educativo", description: "Entender que las alternativas falsas no son al azar, sino trampas diseñadas a partir de errores comunes.", script: "Se llaman 'Distractores'. Si en mate te olvidas de cambiar un signo negativo, el resultado va a estar en la B esperándote..." },
            { title: "Entrenamiento Inteligente", category: "Publicidad", description: "La importancia de armar ensayos personalizados en puntajenacional.cl para aprender a esquivar estas trampas.", script: "Entra a puntajenacional.cl y arma ensayos personalizados. No solo te dice que la 'C' está mala, te explica la trampa..." },
            { title: "Logística del Día D", category: "Institucional", description: "Qué llevar (carnet, tarjeta, lápiz, goma), prohibiciones (celulares) y el consejo de vestirse en capas.", script: "Hará frío. Las salas son heladas. Lleva ropa en capas... Solo necesitas tu carnet, tarjeta impresa, lápiz y goma." },
            { title: "Planificación Post-Prueba", category: "Social Media", description: "Cómo usar los puntajes obtenidos como un colchón de seguridad para enfocar el resto del año.", script: "Esos puntajes quedan congelados... Son tu colchón de seguridad. Si aseguraste Ciencias ahora, dedícate a Matemáticas." },
            { title: "Manejo de Ansiedad", category: "Social Media", description: "Técnicas rápidas de respiración y mentalidad para el momento de entrar a la sala.", script: "Si te bloqueas, respira en 4 tiempos. Es solo una prueba, no define tu valor como persona. ¡Tú puedes!" }
        ];

        let hasNewSeed = false;
        originalIdeas.forEach(seed => {
            const exists = window.appState.projects.find(p => p.title === seed.title);
            if (!exists) {
                console.log(`🌱 Sembrando idea faltante: ${seed.title}`);
                saveProject({ ...seed, team: "Equipo AV", dueDate: "2026-06-01" });
                hasNewSeed = true;
            } else if (exists.description && exists.description.length < 40) {
                // Actualizar textos si son las versiones resumidas de las pruebas anteriores
                console.log(`🔄 Restaurando textos originales completos para: ${seed.title}`);
                updateProject(exists.id, { description: seed.description, script: seed.script });
            }
        });

        if (hasNewSeed) return; // Esperar a que el siguiente snapshot traiga los nuevos datos
        
        // Actualizar referencia al proyecto actual si estamos en la vista de detalle
        if (window.appState.view === 'detail' && window.appState.currentProject) {
            const updatedProject = window.appState.projects.find(p => p.id === window.appState.currentProject.id);
            if (updatedProject) {
                console.log("🔄 Actualizando vista de detalle con nuevos datos de la nube");
                window.appState.currentProject = updatedProject;
            }
        }
        
        renderApp();
    }, (error) => {
        console.error("❌ Error al cargar datos de Firestore:", error.code, error.message);
        if (error.code === 'permission-denied') {
            alert("Error: No tienes permisos para leer la base de datos. Revisa las reglas en la consola de Firebase.");
        }
    });
};

const saveProject = async (projectData) => {
    if (!window.appState.user) {
        alert("No estás autenticado. Espera a que la app conecte.");
        return;
    }
    const payload = { ...projectData, status: 'Idea', createdAt: new Date().toISOString() };
    try {
        if (isMock) await db.addDoc({}, payload);
        else {
            console.log("📤 Guardando nuevo proyecto en la nube...");
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), payload);
        }
    } catch (error) {
        console.error("❌ Error al guardar en Firestore:", error.code, error.message);
        alert("Error al guardar: " + error.message);
    }
};

const updateProject = async (projectId, newData) => {
    if (!window.appState.user) return;
    try {
        if (isMock) await db.updateDoc({ id: projectId }, newData);
        else await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId), newData);
    } catch (error) {
        console.error("❌ Error al actualizar en Firestore:", error.code, error.message);
    }
};

const deleteProject = async (projectId) => {
    if (!window.appState.user) return;
    if (!confirm("¿Estás seguro de que quieres eliminar este proyecto?")) return;
    try {
        if (isMock) await db.deleteDoc({ id: projectId });
        else await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId));
        console.log("🗑️ Proyecto eliminado:", projectId);
    } catch (error) {
        console.error("❌ Error al eliminar en Firestore:", error.code, error.message);
    }
};

window.saveProject = saveProject;
window.updateProject = updateProject;
window.deleteProject = deleteProject;
window.renderApp = renderApp;
window.loadData = loadData;
window.saveScriptRealtime = async (projectId, text) => {
    await updateProject(projectId, { script: text });
};

const getStatusIcon = (status) => {
    const icons = { 'Idea': '💡', 'Scripting': '📝', 'Storyboard': '🎨', 'Producción': '🎬', 'Finalizado': '✅' };
    return icons[status] || '❓';
};

const getStatusProgress = (status) => {
    const stages = ['Idea', 'Scripting', 'Storyboard', 'Producción', 'Finalizado'];
    return ((stages.indexOf(status) + 1) / stages.length) * 100;
};

// --- Storyboard Image Compression & Upload ---
window.resizeImage = (file, maxWidth = 800) => {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                canvas.width = scale < 1 ? maxWidth : img.width;
                canvas.height = img.height * (scale < 1 ? scale : 1);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.handleImageUpload = async (event, projectId) => {
    const files = event.target.files;
    if (!files.length) return;
    const p = window.appState.projects.find(x => x.id === projectId);
    const newImages = p.storyboardImages ? [...p.storyboardImages] : [];
    
    for (let i = 0; i < files.length; i++) {
        const compressedBase64 = await window.resizeImage(files[i]);
        newImages.push(compressedBase64);
    }
    
    await updateProject(projectId, { storyboardImages: newImages });
};

// --- Lightbox Functions ---
window.openLightbox = (index) => {
    const p = window.appState.currentProject;
    if (!p || !p.storyboardImages) return;
    window.appState.lightbox = { index, images: p.storyboardImages };
    renderLightbox();
};

window.closeLightbox = () => {
    window.appState.lightbox = null;
    renderLightbox();
};

window.navLightbox = (dir) => {
    const lb = window.appState.lightbox;
    lb.index += dir;
    if (lb.index < 0) lb.index = lb.images.length - 1;
    if (lb.index >= lb.images.length) lb.index = 0;
    renderLightbox();
};

const renderLightbox = () => {
    let el = document.getElementById('lightbox-overlay');
    if (!window.appState.lightbox) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('div');
        el.id = 'lightbox-overlay';
        el.className = 'fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm';
        document.body.appendChild(el);
    }
    const img = window.appState.lightbox.images[window.appState.lightbox.index];
    el.innerHTML = `
        <button onclick="window.closeLightbox()" class="absolute top-6 right-6 text-white/70 hover:text-white text-4xl font-bold transition-colors">&times;</button>
        <button onclick="window.navLightbox(-1)" class="absolute left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-6xl hover:scale-110 transition-all">&lsaquo;</button>
        <img src="${img}" class="max-h-[85vh] max-w-[85vw] object-contain rounded-lg shadow-2xl">
        <button onclick="window.navLightbox(1)" class="absolute right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-6xl hover:scale-110 transition-all">&rsaquo;</button>
        <div class="absolute bottom-6 text-white text-sm bg-black/50 px-4 py-2 rounded-full tracking-widest font-bold">
            ${window.appState.lightbox.index + 1} / ${window.appState.lightbox.images.length}
        </div>
    `;
};

// --- Production Logic ---
const getStatusBadge = (status) => {
    const config = {
        'Idea': { bg: 'bg-amber-100', text: 'text-amber-800', icon: '💡' },
        'Scripting': { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📝' },
        'Storyboard': { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🎨' },
        'Producción': { bg: 'bg-red-100', text: 'text-red-800', icon: '🎬' },
        'Finalizado': { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-800', icon: '❓' };
    return `<span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full ${c.bg} ${c.text} text-[10px] font-black uppercase tracking-wider shadow-sm">
        <span class="text-sm">${c.icon}</span> ${status}
    </span>`;
};

const renderApp = () => {
    const root = document.getElementById('app');
    if (window.appState.view === 'dashboard') {
        let filteredProjects = window.appState.projects.filter(p => {
            const query = window.appState.searchQuery.toLowerCase();
            return p.title.toLowerCase().includes(query) || (p.team && p.team.toLowerCase().includes(query));
        });

        filteredProjects.sort((a, b) => {
            if (window.appState.sortBy === 'title') return a.title.localeCompare(b.title);
            if (window.appState.sortBy === 'status') {
                const stages = ['Idea', 'Scripting', 'Storyboard', 'Producción', 'Finalizado'];
                return stages.indexOf(b.status) - stages.indexOf(a.status);
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        root.innerHTML = `
            <div class="p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen">
                <header class="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
                    <div class="flex items-center gap-5">
                        <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-xl shadow-blue-900/20 transform -rotate-3 transition-transform hover:rotate-0">
                            <svg class="w-7 h-7 text-[#006FB3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                        <div>
                            <span class="text-[9px] font-black uppercase tracking-[0.3em] text-blue-200/70 mb-1 inline-block">Marketing Puntaje Nacional</span>
                            <h1 class="text-3xl font-black text-white tracking-tighter leading-none">Planificación Audiovisual</h1>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3 bg-black/10 backdrop-blur-xl p-2 rounded-2xl border border-white/5">
                        <div class="relative group">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-xs transition-colors group-focus-within:text-white">🔍</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Filtrar..." class="pl-8 pr-3 py-2 bg-transparent border-none text-sm focus:ring-0 placeholder:text-white/20 font-bold text-white w-32 md:w-48 transition-all focus:w-64">
                        </div>
                        <div class="h-6 w-px bg-white/10 hidden md:block"></div>
                        <select id="sortSelect" class="bg-transparent border-none rounded-xl text-[10px] font-black py-2 px-3 text-white/60 appearance-none cursor-pointer hover:text-white transition-colors uppercase tracking-widest outline-none">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''} class="text-[#0A132D]">Recientes</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''} class="text-[#0A132D]">Título</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''} class="text-[#0A132D]">Estatus</option>
                        </select>
                        <button id="btnNewIdea" class="bg-[#FE6565] text-white px-5 py-2 rounded-xl font-black shadow-lg hover:bg-[#D93025] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            <span>+</span> Nueva Idea
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                    ${filteredProjects.map(p => `
                        <div data-id="${p.id}" class="project-card group bg-white/95 backdrop-blur-sm p-5 rounded-3xl shadow-xl shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full border border-white/20 relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-1.5 h-full bg-[#006FB3] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            <div class="flex justify-between items-center mb-4">
                                <span class="text-[8px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">${new Date(p.createdAt).toLocaleDateString()}</span>
                                ${getStatusBadge(p.status)}
                            </div>
                            
                            <div class="flex-1">
                                <h3 class="text-lg font-black text-[#0A132D] leading-tight group-hover:text-[#006FB3] transition-colors mb-2">${p.title}</h3>
                                <p class="text-gray-400 text-[11px] line-clamp-2 font-medium leading-relaxed">${p.description || 'Sin descripción adicional.'}</p>
                            </div>

                            <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="w-5 h-5 rounded-lg bg-[#D93025] flex items-center justify-center text-[9px] text-white font-black shadow-sm">${(p.team || '?')[0]}</div>
                                    <span class="text-[10px] font-black text-[#0A132D] opacity-60">${p.team || 'Sin asignar'}</span>
                                </div>
                                <div class="w-8 h-8 rounded-xl bg-[#006FB3]/5 text-[#006FB3] flex items-center justify-center group-hover:bg-[#006FB3] group-hover:text-white transition-all transform group-hover:scale-110">
                                    <span class="text-lg font-black">→</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    
                    ${filteredProjects.length === 0 ? `
                        <div class="col-span-full py-20 flex flex-col items-center justify-center text-center bg-black/10 backdrop-blur-md rounded-[2.5rem] border-2 border-dashed border-white/10">
                            <div class="text-6xl mb-4 grayscale opacity-20 text-white">🏜️</div>
                            <h3 class="text-xl font-black text-white/40 italic">Sin coincidencias estratégicas</h3>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        document.getElementById('btnNewIdea').onclick = () => window.setView('new');
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.oninput = (e) => {
                window.appState.searchQuery = e.target.value;
                renderApp();
                const input = document.getElementById('searchInput');
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            };
        }
        document.getElementById('sortSelect').onchange = (e) => { window.appState.sortBy = e.target.value; renderApp(); };
        document.querySelectorAll('.project-card').forEach(card => card.onclick = () => window.viewDetail(card.dataset.id));
        
    } else if (window.appState.view === 'new') {
        root.innerHTML = `
            <div class="p-6 max-w-2xl mx-auto py-20">
                <button id="btnBackToDashboard" class="text-white mb-10 flex items-center hover:scale-105 transition-transform font-black uppercase text-xs tracking-[0.2em]"><span class="mr-3 text-xl">←</span> Dashboard</button>
                <div class="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-[#006FB3]/5 rounded-bl-[5rem]"></div>
                    <h2 class="text-4xl font-black mb-8 text-[#0A132D] tracking-tight">Nueva Iniciativa<span class="text-[#006FB3]">.</span></h2>
                    <form id="ideaForm" class="space-y-6">
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Título Conceptual</label>
                            <input type="text" id="title" required class="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white transition-all outline-none font-bold text-lg text-[#0A132D]" placeholder="Ej: Serie 'Hacks DEMRE 2026'">
                        </div>
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Categoría Estratégica</label>
                            <select id="category" class="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white transition-all outline-none font-black appearance-none cursor-pointer text-[#0A132D]">
                                <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Brief / Objetivo</label>
                            <textarea id="description" rows="4" required class="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white transition-all outline-none font-medium leading-relaxed text-[#0A132D]" placeholder="Describe brevemente el impacto esperado..."></textarea>
                        </div>
                        <button type="submit" class="w-full bg-[#006FB3] text-white py-6 rounded-3xl font-black text-lg hover:bg-[#0A132D] hover:shadow-2xl transition-all mt-6 uppercase tracking-[0.2em] shadow-lg border-b-4 border-black/10">Guardar Iniciativa</button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('btnBackToDashboard').onclick = () => window.setView('dashboard');
        document.getElementById('ideaForm').onsubmit = async (e) => {
            e.preventDefault();
            await saveProject({ title: document.getElementById('title').value, category: document.getElementById('category').value, description: document.getElementById('description').value });
            window.setView('dashboard');
        };
    } else if (window.appState.view === 'detail') {
        const p = window.appState.currentProject;
        const stages = ['Idea', 'Scripting', 'Storyboard', 'Producción', 'Finalizado'];
        const currentIndex = stages.indexOf(p.status);
        const prod = p.production || { rawLink: '', montaje: false, edicion: false, subtitulado: false, exportado: false };
        const meta = p.finalMetadata || { finalLink: '', title: '', description: '', tags: '', publishedUrl: '' };
        const images = p.storyboardImages || [];

        root.innerHTML = `
            <div class="p-6 max-w-7xl mx-auto min-h-screen pb-20">
                <button id="btnBackToDashboardDetail" class="text-white mb-12 flex items-center hover:scale-105 transition-transform font-black uppercase text-xs tracking-[0.2em]"><span class="mr-3 text-xl">←</span> Dashboard</button>
                
                <div class="mb-16">
                    <div class="flex flex-wrap items-center gap-4 mb-6">
                        ${getStatusBadge(p.status)}
                        <span class="text-[10px] font-black text-blue-100 uppercase tracking-widest bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">ID: ${p.id.substring(0,12)}</span>
                    </div>
                    <h1 class="text-5xl font-black text-white mb-10 tracking-tighter leading-tight max-w-4xl">${p.title}</h1>
                    
                    <div class="relative px-2">
                        <div class="absolute top-1/2 left-0 w-full h-2 bg-white/10 -translate-y-1/2 rounded-full shadow-inner"></div>
                        <div class="absolute top-1/2 left-0 h-2 bg-white -translate-y-1/2 transition-all duration-1000 rounded-full shadow-2xl shadow-white/50" style="width: ${(currentIndex / (stages.length - 1)) * 100}%"></div>
                        <div class="relative flex justify-between">
                            ${stages.map((stage, i) => `<div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-2xl flex items-center justify-center z-10 transition-all duration-700 transform ${i <= currentIndex ? 'bg-white text-[#006FB3] shadow-2xl shadow-white/20 scale-110' : 'bg-white/10 border border-white/20 text-white/30 backdrop-blur-md'}">
                                    ${i <= currentIndex ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>' : '<span class="font-black text-sm">'+(i+1)+'</span>'}
                                </div>
                                <span class="mt-4 text-[10px] font-black uppercase tracking-widest ${i === currentIndex ? 'text-white' : 'text-white/30'}">${stage}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    <div class="lg:col-span-8 space-y-8">
                        <div class="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white">
                            <h3 class="font-black text-2xl mb-8 text-[#0A132D] flex items-center gap-4">
                                <span class="w-10 h-10 rounded-2xl bg-blue-50 text-[#006FB3] flex items-center justify-center text-lg shadow-inner">📝</span> 
                                Guion Literario
                            </h3>
                            <div class="transition-all">
                                <div id="scriptContent" class="bg-gray-50/50 p-8 rounded-3xl mt-2 text-base text-gray-700 min-h-[300px] outline-none border-2 border-transparent focus:border-[#006FB3] focus:bg-white transition-all leading-relaxed shadow-inner font-medium" contenteditable="true" oninput="window.saveScriptRealtime('${p.id}', this.innerText)">
                                    ${p.script || 'Comienza a redactar el guion aquí...'}
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white ${currentIndex < 2 ? 'opacity-40 grayscale pointer-events-none' : ''}">
                            <h3 class="font-black text-2xl mb-8 text-[#0A132D] flex items-center gap-4">
                                <span class="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg shadow-inner">🎨</span> 
                                Storyboard Visual
                            </h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mt-3">
                                ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-square bg-gray-100 rounded-3xl overflow-hidden cursor-pointer hover:ring-4 hover:ring-blue-500/20 relative group transition-all shadow-md">
                                    <img src="${img}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-[#006FB3]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]"><span class="text-white text-3xl font-black">🔍</span></div>
                                </div>`).join('')}
                                <div onclick="document.getElementById('sbUpload').click()" class="aspect-square bg-gray-50/80 rounded-3xl flex flex-col items-center justify-center text-gray-300 border-4 border-dashed border-gray-100 hover:border-[#006FB3] hover:text-[#006FB3] hover:bg-white cursor-pointer transition-all">
                                    <span class="text-4xl font-black">+</span><span class="text-[10px] font-black uppercase tracking-widest mt-2">Añadir Frame</span>
                                </div>
                                <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                            </div>
                        </div>

                        <div class="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white ${currentIndex < 3 ? 'opacity-40 grayscale pointer-events-none' : ''}">
                            <h3 class="font-black text-2xl mb-8 text-[#0A132D] flex items-center gap-4">
                                <span class="w-10 h-10 rounded-2xl bg-red-50 text-[#D93025] flex items-center justify-center text-lg shadow-inner">🎬</span> 
                                Control de Producción
                            </h3>
                            <div class="mb-10">
                                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Repositorio de Archivos RAW</label>
                                <div class="flex items-center bg-gray-50 rounded-2xl border-2 border-transparent focus-within:border-[#006FB3] focus-within:bg-white transition-all shadow-inner">
                                    <span class="pl-5 text-[#006FB3]">🔗</span>
                                    <input type="url" id="prodRawLink" value="${prod.rawLink || ''}" class="w-full p-5 bg-transparent border-none text-sm outline-none font-bold text-[#0A132D]" placeholder="Link a Google Drive o One Drive...">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <label class="flex items-center gap-5 p-6 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50 transition-all cursor-pointer border-2 border-transparent hover:border-blue-100 group">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-7 h-7 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 transition-all group-hover:scale-110 shadow-sm"><span class="text-base font-black text-[#0A132D]">Montaje Inicial</span>
                                </label>
                                <label class="flex items-center gap-5 p-6 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50 transition-all cursor-pointer border-2 border-transparent hover:border-blue-100 group">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-7 h-7 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 transition-all group-hover:scale-110 shadow-sm"><span class="text-base font-black text-[#0A132D]">Color y Sonido</span>
                                </label>
                                <label class="flex items-center gap-5 p-6 rounded-3xl bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-blue-100/50 transition-all cursor-pointer border-2 border-transparent hover:border-blue-100 group">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-7 h-7 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 transition-all group-hover:scale-110 shadow-sm"><span class="text-base font-black text-[#0A132D]">Subtítulos / Motion</span>
                                </label>
                                <label class="flex items-center gap-5 p-6 rounded-3xl bg-rose-50/50 hover:bg-rose-50 hover:shadow-xl hover:shadow-red-100/50 transition-all cursor-pointer border-2 border-transparent hover:border-red-200 group">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-7 h-7 text-[#D93025] rounded-xl focus:ring-[#D93025] border-red-200 transition-all group-hover:scale-110 shadow-sm"><span class="text-base font-black text-[#D93025]">Exportado Final</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-4 space-y-8">
                        <div class="bg-white/10 backdrop-blur-3xl p-10 rounded-[4rem] shadow-2xl text-white sticky top-10 border border-white/20">
                            <h3 class="font-black text-2xl mb-10 flex items-center gap-4 text-white">
                                <span class="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-lg">⚙️</span> 
                                Gestión Operativa
                            </h3>
                            <div class="space-y-8">
                                <div>
                                    <label class="block text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-4">Responsable de Proyecto</label>
                                    <input type="text" id="teamInput" value="${p.team || ''}" class="w-full p-5 bg-white/10 rounded-2xl border-2 border-white/10 focus:border-white focus:bg-white/20 transition-all text-sm outline-none font-black text-white" placeholder="Nombre del encargado...">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-4">Deadline Estratégico</label>
                                    <input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="w-full p-5 bg-white/10 rounded-2xl border-2 border-white/10 focus:border-white focus:bg-white/20 transition-all text-sm outline-none font-black text-white">
                                </div>
                                <div class="pt-10 border-t border-white/10">
                                    <label class="block text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-4">Estado del Ciclo</label>
                                    <div class="relative group">
                                        <select id="statusSelect" class="w-full p-6 bg-white text-[#0A132D] rounded-3xl text-sm font-black outline-none focus:ring-8 focus:ring-white/20 appearance-none cursor-pointer">
                                            ${stages.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''} ${(s === 'Finalizado' && !prod.exportado && p.status !== 'Finalizado') ? 'disabled' : ''}>${s.toUpperCase()}</option>`).join('')}
                                        </select>
                                        <div class="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-[#006FB3] font-black text-xl italic">↓</div>
                                    </div>
                                    <p id="statusHint" class="text-[10px] text-white mt-4 font-black bg-red-500/40 p-4 rounded-2xl border border-white/20 text-center animate-pulse ${prod.exportado || p.status === 'Finalizado' ? 'hidden' : 'block'}">
                                        ⚠️ REQUIERE EXPORTACIÓN PARA FINALIZAR
                                    </p>
                                </div>
                            </div>
                            <button id="btnSaveDetail" class="w-full mt-10 bg-white text-[#006FB3] py-6 rounded-[2.5rem] font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-blue-900/50 uppercase tracking-[0.2em] border-b-4 border-black/10">
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('btnBackToDashboardDetail').onclick = () => window.setView('dashboard');
        document.getElementById('btnSaveDetail').onclick = async () => {
            await updateProject(p.id, {
                status: document.getElementById('statusSelect').value, team: document.getElementById('teamInput').value, dueDate: document.getElementById('dueDateInput').value,
                production: {
                    rawLink: document.getElementById('prodRawLink') ? document.getElementById('prodRawLink').value : '',
                    montaje: document.getElementById('chkMontaje') ? document.getElementById('chkMontaje').checked : false,
                    edicion: document.getElementById('chkEdicion') ? document.getElementById('chkEdicion').checked : false,
                    subtitulado: document.getElementById('chkSubtitulado') ? document.getElementById('chkSubtitulado').checked : false,
                    exportado: document.getElementById('chkExportado') ? document.getElementById('chkExportado').checked : false
                },
                finalMetadata: {
                    finalLink: document.getElementById('metaFinalLink') ? document.getElementById('metaFinalLink').value : '',
                    title: document.getElementById('metaTitle') ? document.getElementById('metaTitle').value : '',
                    description: document.getElementById('metaDesc') ? document.getElementById('metaDesc').value : '',
                    tags: document.getElementById('metaTags') ? document.getElementById('metaTags').value : '',
                    publishedUrl: document.getElementById('metaPublishedUrl') ? document.getElementById('metaPublishedUrl').value : ''
                }
            });
            window.setView('dashboard');
        };
    }
};

window.setView = (view) => { window.appState.view = view; renderApp(); };
window.viewDetail = (id) => { window.appState.currentProject = window.appState.projects.find(p => p.id === id); window.appState.view = 'detail'; renderApp(); };
window.onload = async () => { await initAuth(); renderApp(); };
