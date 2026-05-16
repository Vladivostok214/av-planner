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
                    { title: "Hack #1: El 'Frankenstein'", category: "Educativo", description: "Mejores puntajes de distintas rendiciones.", script: "¡El sistema toma tus mejores resultados!", status: "Idea", id: "local-seed-1", createdAt: new Date().toISOString(), team: "MKT", location: "Estudio A", dueDate: "2026-06-01" },
                    { title: "Foco Estratégico", category: "Social Media", description: "Prepararse para rendir al máximo.", script: "Asegura una o dos pruebas.", status: "Idea", id: "local-seed-2", createdAt: new Date().toISOString(), team: "MKT", location: "Remoto", dueDate: "2026-06-05" },
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
    userName: localStorage.getItem('av_planner_username') || '',
    projects: [],
    currentProject: null,
    view: 'dashboard',
    searchQuery: '',
    sortBy: 'date',
    lightbox: null,
    activeTab: 'guion'
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
    
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(q, (snapshot) => {
        window.appState.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // --- Auto-Seeding ---
        const originalIdeas = [
            { title: "Hack #1: El 'Frankenstein'", category: "Educativo", description: "Mejores puntajes de distintas rendiciones.", script: "¡El sistema toma tus mejores resultados!" },
            { title: "Foco Estratégico", category: "Social Media", description: "Prepararse para rendir al máximo.", script: "Asegura una o dos pruebas." }
        ];

        let hasNewSeed = false;
        originalIdeas.forEach(seed => {
            const exists = window.appState.projects.find(p => p.title === seed.title);
            if (!exists) {
                saveProject({ ...seed, team: "Equipo AV", dueDate: "2026-06-01", lastEditor: "Sistema" });
                hasNewSeed = true;
            }
        });

        if (hasNewSeed) return;
        
        if (window.appState.view === 'detail' && window.appState.currentProject) {
            const updatedProject = window.appState.projects.find(p => p.id === window.appState.currentProject.id);
            if (updatedProject) window.appState.currentProject = updatedProject;
        }
        
        renderApp();
    });
};

const saveProject = async (projectData) => {
    if (!window.appState.user) return;
    const payload = { ...projectData, status: 'Idea', createdAt: new Date().toISOString(), lastEditor: window.appState.userName || 'Anónimo' };
    if (isMock) await db.addDoc({}, payload);
    else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), payload);
};

const updateProject = async (projectId, newData) => {
    if (!window.appState.user) return;
    const payload = { ...newData, lastEditor: window.appState.userName || 'Anónimo' };
    if (isMock) await db.updateDoc({ id: projectId }, payload);
    else await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId), payload);
};

const deleteProject = async (projectId) => {
    if (!window.appState.user) return;
    if (!confirm("¿Estás seguro?")) return;
    if (isMock) await db.deleteDoc({ id: projectId });
    else await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId));
};

window.saveProject = saveProject;
window.updateProject = updateProject;
window.deleteProject = deleteProject;
window.renderApp = () => renderApp();
window.loadData = loadData;
window.saveScriptRealtime = async (projectId, text) => {
    await updateProject(projectId, { script: text });
};

window.handleImageUpload = async (event, projectId) => {
    const files = Array.from(event.target.files);
    const compressedImages = [];
    for (const file of files) {
        const compressed = await resizeImage(file);
        compressedImages.push(compressed);
    }
    const p = window.appState.projects.find(p => p.id === projectId);
    const existingImages = p.storyboardImages || [];
    await updateProject(projectId, { storyboardImages: [...existingImages, ...compressedImages] });
};

window.openLightbox = (index) => {
    const images = window.appState.currentProject.storyboardImages || [];
    const src = images[index];
    if (src) {
        window.appState.lightbox = src;
        renderApp();
    }
};

window.toggleFinalizado = (isExportado) => {
    const select = document.getElementById('statusSelect');
    if (!select) return;
    const finOption = Array.from(select.options).find(o => o.value === 'Finalizado');
    if (finOption) {
        finOption.disabled = !isExportado;
    }
};

const resizeImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxWidth = 800;
                const scale = maxWidth / img.width;
                canvas.width = scale < 1 ? maxWidth : img.width;
                canvas.height = img.height * (scale < 1 ? scale : 1);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

const getStatusBadge = (status) => {
    const config = {
        'Idea': { bg: 'bg-amber-100', text: 'text-amber-800', icon: '💡' },
        'Scripting': { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📝' },
        'Storyboard': { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🎨' },
        'Producción': { bg: 'bg-red-100', text: 'text-red-800', icon: '🎬' },
        'Finalizado': { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: '❓' };
    return `<span class="flex items-center gap-1 px-2 py-1 rounded-full ${c.bg} ${c.text} text-[8px] font-black uppercase tracking-widest whitespace-nowrap shadow-sm">
        <span>${c.icon}</span> ${status}
    </span>`;
};

// --- Core Rendering ---
const renderApp = () => {
    const root = document.getElementById('app');
    
    if (!window.appState.userName) {
        root.innerHTML = `
            <div class="flex items-center justify-center min-h-screen p-6 bg-[#006FB3]">
                <div class="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center animate-in fade-in zoom-in duration-500">
                    <div class="w-20 h-20 bg-[#006FB3] rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-xl">
                        <svg class="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h2 class="text-3xl font-black text-[#0A132D] mb-4 tracking-tight">Acceso Marketing</h2>
                    <p class="text-gray-500 mb-8 font-medium italic text-sm text-balance">Identifícate para registrar tu huella en el planificador.</p>
                    <form id="loginForm" class="space-y-4">
                        <input type="text" id="userNameInput" required placeholder="Tu firma..." class="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-[#006FB3] outline-none font-bold text-center text-[#0A132D]">
                        <button type="submit" class="w-full bg-[#006FB3] text-white py-5 rounded-2xl font-black text-lg hover:bg-[#0A132D] transition-all shadow-lg border-b-4 border-black/10 uppercase tracking-widest">Entrar</button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('loginForm').onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('userNameInput').value.trim();
            if (name) { window.appState.userName = name; localStorage.setItem('av_planner_username', name); renderApp(); }
        };
        return;
    }

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
            <div class="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen">
                <header class="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-6">
                    <div class="flex items-center gap-5">
                        <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-xl transform -rotate-3">
                            <svg class="w-8 h-8 text-[#006FB3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div>
                            <span class="text-[9px] font-black uppercase tracking-[0.3em] text-blue-200/70 mb-1 inline-block">Marketing Puntaje Nacional</span>
                            <h1 class="text-3xl font-black text-white tracking-tighter leading-none">Planificación Audiovisual</h1>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3 bg-black/10 backdrop-blur-xl p-2 rounded-2xl border border-white/5">
                        <div class="relative group">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">🔍</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Filtrar..." class="pl-8 pr-3 py-2 bg-transparent border-none text-sm focus:ring-0 placeholder:text-white/20 font-bold text-white w-32 md:w-48 transition-all focus:w-64">
                        </div>
                        <div class="h-6 w-px bg-white/10 hidden md:block"></div>
                        <select id="sortSelect" class="bg-transparent border-none rounded-xl text-[10px] font-black py-2 px-3 text-white/60 appearance-none cursor-pointer outline-none uppercase tracking-widest">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''} class="text-[#0A132D]">Recientes</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''} class="text-[#0A132D]">Título</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''} class="text-[#0A132D]">Estatus</option>
                        </select>
                        <button id="btnNewIdea" class="bg-[#FE6565] text-white px-5 py-2 rounded-xl font-black shadow-lg hover:bg-[#D93025] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            <span>+</span> Nueva Idea
                        </button>
                        <div class="h-6 w-px bg-white/10 hidden md:block ml-2"></div>
                        <div class="flex items-center gap-2 px-3 group cursor-pointer" onclick="localStorage.removeItem('av_planner_username'); location.reload();">
                            <span class="text-[9px] font-black text-white/40 uppercase tracking-tighter group-hover:text-white">👤 ${window.appState.userName}</span>
                            <span class="text-[8px] text-white/20 group-hover:text-red-400">✕</span>
                        </div>
                    </div>
                </header>

                <div class="bg-white/95 backdrop-blur-sm rounded-[2rem] shadow-2xl overflow-hidden border border-white/20">
                    <div class="hidden md:grid grid-cols-12 gap-4 p-5 bg-gray-50/50 border-b border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <div class="col-span-1 text-center">Status</div>
                        <div class="col-span-4">Proyecto</div>
                        <div class="col-span-2 text-center">Encargado</div>
                        <div class="col-span-2 text-center">Fecha</div>
                        <div class="col-span-2 text-center">Edición</div>
                        <div class="col-span-1 text-right">Acción</div>
                    </div>
                    <div class="divide-y divide-gray-50">
                        ${filteredProjects.map(p => `
                            <div data-id="${p.id}" class="project-row grid grid-cols-12 gap-4 p-5 items-center hover:bg-blue-50/30 cursor-pointer transition-colors group">
                                <div class="col-span-3 md:col-span-1 flex justify-center">${getStatusBadge(p.status)}</div>
                                <div class="col-span-9 md:col-span-4">
                                    <h3 class="text-sm font-black text-[#0A132D] group-hover:text-[#006FB3] transition-colors leading-tight">${p.title}</h3>
                                    <span class="text-[9px] font-bold text-gray-300 uppercase mt-0.5 block tracking-tighter">${p.category}</span>
                                </div>
                                <div class="hidden md:flex col-span-2 justify-center">
                                    <span class="text-[9px] font-black text-[#0A132D] opacity-60 bg-gray-100 px-3 py-1 rounded-full uppercase tracking-tighter">${p.team || '---'}</span>
                                </div>
                                <div class="hidden md:flex col-span-2 justify-center">
                                    <span class="text-[10px] font-bold text-gray-300 uppercase">${new Date(p.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div class="hidden md:flex col-span-2 justify-center">
                                    <span class="text-[8px] font-black text-[#006FB3] opacity-40 uppercase tracking-widest truncate max-w-full px-2">🖊️ ${p.lastEditor || 'Sist.'}</span>
                                </div>
                                <div class="hidden md:flex col-span-1 text-right items-center justify-end">
                                    <span class="text-[#006FB3] font-black text-xl transform group-hover:translate-x-1 transition-transform">→</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ${filteredProjects.length === 0 ? `
                        <div class="py-20 text-center">
                            <h3 class="text-xl font-black text-[#0A132D] opacity-20 italic uppercase tracking-[0.2em]">Sin registros estratégicos</h3>
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
        document.querySelectorAll('.project-row').forEach(row => row.onclick = () => window.viewDetail(row.dataset.id));
        
    } else if (window.appState.view === 'new') {
        root.innerHTML = `
            <div class="p-6 max-w-2xl mx-auto py-20">
                <button id="btnBackToDashboard" class="text-white mb-10 flex items-center hover:scale-105 transition-transform font-black uppercase text-xs tracking-[0.2em]"><span class="mr-3 text-xl">←</span> Dashboard</button>
                <div class="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-white relative overflow-hidden">
                    <h2 class="text-4xl font-black mb-8 text-[#0A132D] tracking-tight text-center">Nueva Idea<span class="text-[#006FB3]">.</span></h2>
                    <form id="ideaForm" class="space-y-6">
                        <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Título Conceptual</label><input type="text" id="title" required class="w-full p-5 bg-gray-50 rounded-2xl border-none outline-none font-bold text-lg text-[#0A132D]"></div>
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Categoría</label>
                            <select id="category" class="w-full p-5 bg-gray-50 rounded-2xl border-none outline-none font-black text-[#0A132D]">
                                <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                            </select>
                        </div>
                        <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Brief</label><textarea id="description" rows="4" required class="w-full p-5 bg-gray-50 rounded-2xl border-none outline-none font-medium leading-relaxed text-[#0A132D]"></textarea></div>
                        <button type="submit" class="w-full bg-[#006FB3] text-white py-6 rounded-3xl font-black text-lg hover:bg-[#0A132D] transition-all shadow-lg border-b-4 border-black/10 uppercase tracking-widest">Guardar</button>
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
        const prod = p.production || { rawLink: '', montage: false, edicion: false, subtitulado: false, exportado: false };
        const images = p.storyboardImages || [];
        const activeTab = window.appState.activeTab;

        root.innerHTML = `
            <div class="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen pb-20">
                <button id="btnBackToDashboardDetail" class="text-white mb-8 flex items-center hover:scale-105 transition-transform font-black uppercase text-xs tracking-[0.2em]"><span class="mr-3 text-xl">←</span> Dashboard</button>
                
                <div class="mb-10">
                    <div class="flex flex-wrap items-center gap-4 mb-6">
                        ${getStatusBadge(p.status)}
                        <span class="text-[10px] font-black text-blue-100 uppercase bg-white/10 px-4 py-2 rounded-full border border-white/20 tracking-widest">🖊️ Edición: ${p.lastEditor || 'Sist.'}</span>
                    </div>
                    <h1 class="text-4xl md:text-5xl font-black text-white mb-10 tracking-tighter leading-tight max-w-4xl">${p.title}</h1>
                    
                    <div class="flex gap-2 bg-black/10 backdrop-blur-xl p-2 rounded-3xl border border-white/10 overflow-x-auto no-scrollbar">
                        <button onclick="window.setTab('guion')" class="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'guion' ? 'bg-white text-[#006FB3] shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'} whitespace-nowrap">1. Guion</button>
                        <button onclick="window.setTab('storyboard')" class="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'storyboard' ? 'bg-white text-[#006FB3] shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'} whitespace-nowrap">2. Storyboard</button>
                        <button onclick="window.setTab('produccion')" class="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'produccion' ? 'bg-white text-[#006FB3] shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'} whitespace-nowrap">3. Producción</button>
                        <button onclick="window.setTab('gestion')" class="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'gestion' ? 'bg-white text-[#006FB3] shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'} whitespace-nowrap">4. Gestión</button>
                    </div>
                </div>

                <div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    ${activeTab === 'guion' ? `
                        <div class="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white max-w-4xl mx-auto">
                            <h3 class="font-black text-2xl mb-8 text-[#0A132D] flex items-center gap-4">📝 Guion Literario</h3>
                            <div id="scriptContent" class="bg-gray-50/50 p-8 rounded-3xl text-base text-gray-700 min-h-[400px] outline-none border-2 border-transparent focus:border-[#006FB3] focus:bg-white leading-relaxed font-medium shadow-inner" contenteditable="true">
                                ${p.script || 'Comienza a redactar el guion aquí...'}
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'storyboard' ? `
                        <div class="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white">
                            <h3 class="font-black text-2xl mb-8 text-[#0A132D] flex items-center gap-4">🎨 Storyboard Visual</h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-6">
                                ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-square bg-gray-100 rounded-3xl overflow-hidden cursor-pointer hover:ring-4 hover:ring-blue-500/20 relative group transition-all shadow-md">
                                    <img src="${img}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-[#006FB3]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]"><span class="text-white text-3xl font-black">🔍</span></div>
                                </div>`).join('')}
                                <div onclick="document.getElementById('sbUpload').click()" class="aspect-square bg-gray-50/80 rounded-3xl flex flex-col items-center justify-center text-gray-300 border-4 border-dashed border-gray-100 hover:border-[#006FB3] hover:text-[#006FB3] cursor-pointer transition-all">
                                    <span class="text-4xl font-black">+</span><span class="text-[10px] font-black uppercase tracking-widest mt-2">Frame</span>
                                </div>
                                <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'produccion' ? `
                        <div class="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white max-w-4xl mx-auto">
                            <h3 class="font-black text-2xl mb-10 text-[#0A132D] flex items-center gap-4">🎬 Control de Producción</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <label class="flex items-center gap-5 p-8 rounded-[2.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-xl">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-8 h-8 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 shadow-sm"><span class="text-lg font-black text-[#0A132D]">Montaje Base</span>
                                </label>
                                <label class="flex items-center gap-5 p-8 rounded-[2.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-xl">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-8 h-8 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 shadow-sm"><span class="text-lg font-black text-[#0A132D]">Color y Sonido</span>
                                </label>
                                <label class="flex items-center gap-5 p-8 rounded-[2.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-xl">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-8 h-8 text-[#006FB3] rounded-xl focus:ring-[#006FB3] border-gray-200 shadow-sm"><span class="text-lg font-black text-[#0A132D]">Subtítulos / GFX</span>
                                </label>
                                <label class="flex items-center gap-5 p-8 rounded-[2.5rem] bg-red-50/50 transition-all cursor-pointer border-2 border-transparent group hover:bg-red-50 hover:shadow-xl">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-8 h-8 text-[#D93025] rounded-xl focus:ring-[#D93025] border-red-200 shadow-sm"><span class="text-lg font-black text-[#D93025]">Exportado Final</span>
                                </label>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'gestion' ? `
                        <div class="bg-[#0A132D] p-8 md:p-12 rounded-[4rem] shadow-2xl text-white max-w-4xl mx-auto border border-white/5 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-64 h-64 bg-[#006FB3]/10 rounded-bl-[10rem]"></div>
                            <h3 class="font-black text-2xl mb-12 flex items-center gap-4 text-white relative">⚙️ Gestión Estratégica</h3>
                            <div class="space-y-10 relative">
                                <div><label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mb-4">Responsable de Proyecto</label><input type="text" id="teamInput" value="${p.team || ''}" class="w-full p-6 bg-white/5 rounded-3xl border-2 border-white/5 focus:border-[#006FB3] focus:bg-white/10 transition-all text-lg outline-none font-black text-white" placeholder="..."></div>
                                <div><label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mb-4">Fecha Límite</label><input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="w-full p-6 bg-white/5 rounded-3xl border-2 border-white/5 focus:border-[#006FB3] focus:bg-white/10 transition-all text-lg outline-none font-black text-white"></div>
                                <div class="pt-10 border-t border-white/10">
                                    <label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mb-5">Estado del Pipeline</label>
                                    <select id="statusSelect" class="w-full p-6 bg-white text-[#0A132D] rounded-[2rem] text-sm font-black outline-none shadow-2xl">
                                        ${stages.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''} ${(s === 'Finalizado' && !prod.exportado && p.status !== 'Finalizado') ? 'disabled' : ''}>${s.toUpperCase()}</option>`).join('')}
                                    </select>
                                </div>
                                <button id="btnSaveDetail" class="w-full bg-white text-[#006FB3] py-6 rounded-[2.5rem] font-black text-xl hover:scale-105 transition-all shadow-2xl uppercase tracking-[0.2em] border-b-4 border-black/10 active:scale-95 mt-4">Guardar Cambios</button>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${window.appState.lightbox ? `
                    <div class="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onclick="window.appState.lightbox = null; renderApp();">
                        <img src="${window.appState.lightbox}" class="max-w-full max-h-full rounded-2xl shadow-2xl animate-in zoom-in duration-300">
                        <button class="absolute top-8 right-8 text-white text-4xl font-black">&times;</button>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('btnBackToDashboardDetail').onclick = () => window.setView('dashboard');
        
        const saveBtn = document.getElementById('btnSaveDetail');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                await updateProject(p.id, {
                    status: document.getElementById('statusSelect').value,
                    team: document.getElementById('teamInput').value,
                    dueDate: document.getElementById('dueDateInput').value,
                    production: {
                        montaje: document.getElementById('chkMontaje') ? document.getElementById('chkMontaje').checked : prod.montaje,
                        edicion: document.getElementById('chkEdicion') ? document.getElementById('chkEdicion').checked : prod.edicion,
                        subtitulado: document.getElementById('chkSubtitulado') ? document.getElementById('chkSubtitulado').checked : prod.subtitulado,
                        exportado: document.getElementById('chkExportado') ? document.getElementById('chkExportado').checked : prod.exportado
                    }
                });
                window.setView('dashboard');
            };
        }

        const scriptEl = document.getElementById('scriptContent');
        if (scriptEl) {
            let debounceTimer;
            scriptEl.oninput = (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    window.saveScriptRealtime(p.id, e.target.innerText);
                }, 1000);
            };
        }
    }
};

window.setView = (view) => { 
    window.appState.view = view; 
    window.appState.activeTab = 'guion';
    history.pushState({ view }, '', `#${view}`);
    renderApp(); 
};

window.viewDetail = (id) => { 
    window.appState.currentProject = window.appState.projects.find(p => p.id === id); 
    window.appState.view = 'detail'; 
    window.appState.activeTab = 'guion';
    history.pushState({ view: 'detail', projectId: id }, '', `#detail-${id}`);
    renderApp(); 
};

window.setTab = (tab) => {
    window.appState.activeTab = tab;
    renderApp();
};

window.onpopstate = (event) => {
    if (event.state && event.state.view) {
        window.appState.view = event.state.view;
        if (event.state.projectId) {
            window.appState.currentProject = window.appState.projects.find(p => p.id === event.state.projectId);
        }
        renderApp();
    } else {
        window.appState.view = 'dashboard';
        renderApp();
    }
};

window.onload = async () => { 
    await initAuth(); 
    if (window.location.hash === '') {
        history.replaceState({ view: 'dashboard' }, '', '#dashboard');
    } else {
        const hash = window.location.hash;
        if (hash === '#new') window.appState.view = 'new';
        else if (hash.startsWith('#detail-')) {
            const id = hash.replace('#detail-', '');
            window.appState.view = 'detail';
        }
    }
    renderApp(); 
};
