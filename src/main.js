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
    userName: '', // Always empty on init to force name entry
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
            
            if (window.appState.view === 'detail' && window.appState.currentProject) {
                const updatedProject = window.appState.projects.find(p => p.id === window.appState.currentProject.id);
                if (updatedProject) window.appState.currentProject = updatedProject;
            }
            
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
    
    // Optimistic local update
    const index = window.appState.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        window.appState.projects[index] = { ...window.appState.projects[index], ...payload };
        if (window.appState.currentProject && window.appState.currentProject.id === projectId) {
            window.appState.currentProject = window.appState.projects[index];
        }
    }

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
window.formatScriptBold = () => {
    document.execCommand('bold', false, null);
};

window.insertSceneCut = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const sceneCut = document.createElement('div');
    sceneCut.className = 'my-12 border-t-2 border-dashed border-brand-accent/20 pt-6 font-black text-brand-accent uppercase tracking-[0.5em] text-center text-[10px]';
    sceneCut.innerHTML = '--- CORTE DE ESCENA ---';
    range.insertNode(sceneCut);
    range.collapse(false);
};

window.copyScript = () => {
    const content = document.getElementById('scriptContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        alert('Guion copiado al portapapeles 📋');
    });
};

window.shareScript = async () => {
    const content = document.getElementById('scriptContent').innerText;
    const title = window.appState.currentProject.title;
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Guion: ${title}`,
                text: content,
                url: window.location.href
            });
        } catch (err) {
            console.log('Error al compartir:', err);
        }
    } else {
        window.copyScript();
    }
};

window.printScript = () => {
    window.print();
};

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

const getStatusProgress = (status) => {
    const stages = ['Idea', 'Scripting', 'Storyboard', 'Producción', 'Finalizado'];
    return ((stages.indexOf(status) + 1) / stages.length) * 100;
};

const getStatusBadge = (status) => {
    const config = {
        'Idea': { bg: 'bg-white', text: 'text-brand-dark', icon: '💡' },
        'Scripting': { bg: 'bg-white', text: 'text-brand-dark', icon: '📝' },
        'Storyboard': { bg: 'bg-white', text: 'text-brand-dark', icon: '🎨' },
        'Producción': { bg: 'bg-brand-primary', text: 'text-white', icon: '🎬' },
        'Finalizado': { bg: 'bg-brand-accent', text: 'text-brand-dark', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-white', text: 'text-brand-dark', icon: '❓' };
    return `<span class="swiss-badge ${c.bg} ${c.text}">
        ${c.icon} ${status}
    </span>`;
};

// --- Core Rendering ---
const renderApp = () => {
    const root = document.getElementById('app');
    
    // Add print styles dynamically
    if (!document.getElementById('print-styles')) {
        const style = document.createElement('style');
        style.id = 'print-styles';
        style.innerHTML = `
            @media print {
                body * { visibility: hidden; }
                #scriptContent, #scriptContent * { visibility: visible; }
                #scriptContent {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0 !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                    font-size: 12pt !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    if (!window.appState.userName) {
        root.innerHTML = `
            <div class="flex items-center justify-center min-h-screen p-10 bg-brand-primary">
                <div class="max-w-xl w-full border-t-8 border-brand-accent pt-20">
                    <div class="mb-20">
                        <h1 class="text-7xl font-black text-white leading-none tracking-tighter uppercase">Puntaje<br><span class="text-brand-accent italic">Nacional</span></h1>
                        <p class="text-sm font-black uppercase tracking-[0.4em] mt-8 text-white/40">AV Pipeline / Terminal Access</p>
                    </div>
                    
                    <form id="loginForm" class="space-y-16">
                        <div>
                            <label class="block text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-6">Operador ID</label>
                            <input type="text" id="userNameInput" required placeholder="NOMBRE DE USUARIO" class="swiss-input uppercase text-4xl">
                        </div>
                        <button type="submit" class="btn-swiss-primary w-full py-10 text-lg flex items-center justify-between group">
                            <span>Ingresar al Sistema</span>
                            <span class="group-hover:translate-x-2 transition-transform">→</span>
                        </button>
                    </form>
                    
                    <div class="mt-32 opacity-20 border-t border-white pt-8">
                        <p class="text-[9px] font-black uppercase tracking-widest text-white italic tracking-[0.5em]">MKT DEPARTAMENTO AUDIOVISUAL 2026</p>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('loginForm').onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('userNameInput').value.trim();
            if (name) { window.appState.userName = name; renderApp(); }
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
            <div class="p-10 md:p-20 max-w-[1600px] mx-auto min-h-screen">
                <header class="mb-24 flex flex-col md:flex-row justify-between items-end gap-10">
                    <div class="flex-1">
                        <div class="w-20 h-3 bg-brand-accent mb-6 shadow-[0_0_15px_rgba(247,148,30,0.5)]"></div>
                        <h1 class="text-7xl font-black text-white tracking-tighter leading-none mb-4 drop-shadow-xl">Content<br>Pipeline</h1>
                        <p class="text-[11px] font-black uppercase tracking-[0.5em] text-white/60 bg-white/5 inline-block px-4 py-2 border border-white/10">Operador: ${window.appState.userName}</p>
                    </div>
                    
                    <div class="flex flex-col gap-6 w-full md:w-auto">
                        <div class="flex items-center gap-4 border-b-2 border-white/30 pb-4 group focus-within:border-brand-accent transition-colors">
                            <span class="text-[10px] font-black uppercase tracking-widest text-white/80">🔍 Buscar:</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="..." class="bg-transparent outline-none font-black text-white uppercase text-sm placeholder:text-white/20 w-48 focus:w-64 transition-all">
                        </div>
                        <div class="flex flex-wrap items-center gap-4">
                            <select id="sortSelect" class="bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:text-brand-accent text-white/80 focus:text-white transition-colors">
                                <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''} class="bg-brand-primary">Ordenar por Fecha</option>
                                <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''} class="bg-brand-primary">Ordenar por Título</option>
                                <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''} class="bg-brand-primary">Ordenar por Estado</option>
                            </select>
                            <button id="btnNewIdea" class="btn-swiss-primary text-[10px] shadow-lg shadow-brand-accent/20">+ Nueva Iniciativa</button>
                            <button onclick="location.reload()" class="btn-swiss-outline text-[10px] border-white/40 text-white/90 hover:border-white hover:text-white backdrop-blur-sm">Cerrar Sesión</button>
                        </div>
                    </div>
                </header>

                <div class="space-y-4">
                    <div class="list-header hidden md:flex">
                        <div class="flex-1 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Identificación / Proyecto</div>
                        <div class="w-40 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Categoría</div>
                        <div class="w-40 text-[10px] font-black uppercase tracking-[0.3em] text-white/30 text-center">Estado</div>
                        <div class="w-48 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Lead / Responsable</div>
                        <div class="w-64 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Pipeline Progress</div>
                    </div>

                    ${filteredProjects.map(p => {
                        const progress = getStatusProgress(p.status);
                        return `
                            <div data-id="${p.id}" class="project-row list-row group">
                                <div class="flex-1 flex flex-col gap-2">
                                    <span class="text-[8px] font-black text-brand-accent uppercase tracking-widest">REF: ${p.id.substring(0,8)}</span>
                                    <h3 class="text-2xl font-black text-white group-hover:text-brand-accent transition-colors">${p.title}</h3>
                                </div>
                                
                                <div class="w-40 shrink-0">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-white/40">${p.category}</span>
                                </div>

                                <div class="w-40 shrink-0 text-center">
                                    ${getStatusBadge(p.status)}
                                </div>

                                <div class="w-48 shrink-0 flex flex-col">
                                    <span class="text-[10px] font-black text-white italic uppercase truncate">${p.team || '---'}</span>
                                    <span class="text-[8px] font-medium text-white/20 uppercase tracking-widest mt-1">Sincronizado: ${new Date(p.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div class="w-64 shrink-0 flex items-center gap-6">
                                    <div class="flex-1 h-1 bg-white/10 overflow-hidden">
                                        <div class="h-full bg-brand-accent transition-all duration-1000 shadow-[0_0_10px_rgba(247,148,30,0.4)]" style="width: ${progress}%"></div>
                                    </div>
                                    <span class="text-[10px] font-black text-white/60 w-10 text-right">${Math.round(progress)}%</span>
                                </div>
                                
                                <div class="w-12 h-12 flex items-center justify-center text-white/20 group-hover:text-white transition-colors text-2xl font-black">
                                    →
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${filteredProjects.length === 0 ? `
                        <div class="py-40 text-center border-2 border-dashed border-white/10">
                            <h3 class="text-4xl font-black text-white/5 uppercase tracking-[0.4em]">Sin Registros Activos</h3>
                            <p class="text-white/20 font-bold mt-4">No se encontraron iniciativas que coincidan con los parámetros.</p>
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
            <div class="p-10 md:p-20 max-w-4xl mx-auto min-h-screen">
                <button id="btnBackToDashboard" class="btn-swiss-outline text-[10px] mb-20">← Dashboard</button>
                
                <div class="mb-20">
                    <div class="w-16 h-3 bg-brand-accent mb-6"></div>
                    <h2 class="text-6xl font-black text-brand-dark tracking-tighter leading-none mb-4">Nueva<br>Iniciativa</h2>
                    <p class="text-xs font-black uppercase tracking-[0.4em] text-brand-gray">Pipeline / Entry Form</p>
                </div>

                <form id="ideaForm" class="space-y-20">
                    <div>
                        <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Título del Concepto</label>
                        <input type="text" id="title" required class="swiss-input uppercase" placeholder="EJ: CAMP. INVIERNO">
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-20">
                        <div>
                            <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Estrategia / Categoría</label>
                            <select id="category" class="swiss-input uppercase cursor-pointer">
                                <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Lead de Producción</label>
                            <input type="text" id="team" class="swiss-input uppercase" placeholder="NOMBRE...">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Brief Estratégico</label>
                        <textarea id="description" rows="3" required class="swiss-input font-medium text-lg leading-relaxed" placeholder="DESCRIBA LOS OBJETIVOS..."></textarea>
                    </div>
                    
                    <button type="submit" class="btn-swiss-primary w-full py-10 text-lg">Ejecutar Lanzamiento ⚡</button>
                </form>
            </div>
        `;
        document.getElementById('btnBackToDashboard').onclick = () => window.setView('dashboard');
        document.getElementById('ideaForm').onsubmit = async (e) => {
            e.preventDefault();
            await saveProject({ title: document.getElementById('title').value, category: document.getElementById('category').value, description: document.getElementById('description').value, team: document.getElementById('team').value });
            window.setView('dashboard');
        };
    } else if (window.appState.view === 'detail') {
        const p = window.appState.currentProject;
        const prod = p.production || { montaje: false, edicion: false, subtitulado: false, exportado: false };
        const images = p.storyboardImages || [];
        const activeTab = window.appState.activeTab;

        root.innerHTML = `
            <div class="p-10 md:p-20 max-w-[1600px] mx-auto min-h-screen">
                <button id="btnBackToDashboardDetail" class="btn-swiss-outline text-[10px] mb-20">← Volver</button>
                
                <div class="mb-24 flex flex-col md:flex-row justify-between items-start gap-12">
                    <div class="flex-1">
                        <div class="flex items-center gap-4 mb-8">
                            ${getStatusBadge(p.status)}
                            <span class="text-[9px] font-black uppercase tracking-[0.4em] text-brand-gray">REF: ${p.id.substring(0,8)}</span>
                        </div>
                        <h1 class="text-6xl md:text-8xl font-black text-brand-dark tracking-tighter leading-none mb-10 uppercase">${p.title}</h1>
                        <div class="flex items-center gap-4 border-t-2 border-brand-dark pt-8">
                            <span class="text-[10px] font-black uppercase tracking-widest text-brand-gray">Última Edición:</span>
                            <span class="text-[10px] font-black text-brand-dark uppercase italic">${p.lastEditor || 'Sistema'}</span>
                        </div>
                    </div>
                    
                    <div class="w-full md:w-auto flex flex-col gap-2">
                        <button onclick="window.setTab('guion')" class="w-full text-left px-8 py-4 font-black uppercase tracking-widest text-xs border-l-8 ${activeTab === 'guion' ? 'border-brand-primary bg-brand-light text-brand-primary' : 'border-brand-light text-brand-gray hover:bg-brand-light transition-all'}">01. Guion Narrativo</button>
                        <button onclick="window.setTab('storyboard')" class="w-full text-left px-8 py-4 font-black uppercase tracking-widest text-xs border-l-8 ${activeTab === 'storyboard' ? 'border-brand-primary bg-brand-light text-brand-primary' : 'border-brand-light text-brand-gray hover:bg-brand-light transition-all'}">02. Registro Visual</button>
                        <button onclick="window.setTab('produccion')" class="w-full text-left px-8 py-4 font-black uppercase tracking-widest text-xs border-l-8 ${activeTab === 'produccion' ? 'border-brand-primary bg-brand-light text-brand-primary' : 'border-brand-light text-brand-gray hover:bg-brand-light transition-all'}">03. Post-Producción</button>
                        <button onclick="window.setTab('gestion')" class="w-full text-left px-8 py-4 font-black uppercase tracking-widest text-xs border-l-8 ${activeTab === 'gestion' ? 'border-brand-primary bg-brand-light text-brand-primary' : 'border-brand-light text-brand-gray hover:bg-brand-light transition-all'}">04. Administración</button>
                    </div>
                </div>

                <div class="swiss-container">
                    ${activeTab === 'guion' ? `
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-20">
                            <div class="lg:col-span-1">
                                <h3 class="text-xl mb-6">Editor v2</h3>
                                <p class="text-[10px] font-medium text-brand-gray leading-relaxed uppercase tracking-widest italic">Utilice el panel para formatear el texto técnico. El autoguardado está activo.</p>
                                <div class="flex flex-col gap-4 mt-12">
                                    <button onclick="window.formatScriptBold()" class="btn-swiss-outline text-left">Resaltar (B)</button>
                                    <button onclick="window.insertSceneCut()" class="btn-swiss-outline text-left">Corte Escena</button>
                                    <button onclick="window.printScript()" class="btn-swiss-primary text-left">Imprimir</button>
                                </div>
                            </div>
                            <div class="lg:col-span-3">
                                <div id="scriptContent" class="bg-brand-light p-16 text-lg text-brand-dark min-h-[800px] outline-none border-l-4 border-brand-dark font-mono leading-relaxed print:bg-white print:p-0" contenteditable="true">
                                    ${p.script || 'ESCENA 01 - ...'}
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'storyboard' ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-video bg-brand-light border border-brand-dark group relative cursor-pointer overflow-hidden">
                                <img src="${img}" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all">
                                <div class="absolute bottom-0 left-0 bg-brand-dark text-white text-[8px] font-black px-4 py-2 uppercase tracking-widest">Frame ${idx+1}</div>
                            </div>`).join('')}
                            <div onclick="document.getElementById('sbUpload').click()" class="aspect-video border-2 border-dashed border-brand-dark flex flex-col items-center justify-center cursor-pointer hover:bg-brand-accent transition-all group">
                                <span class="text-4xl font-black mb-4 group-hover:scale-125 transition-transform">+</span>
                                <span class="text-[10px] font-black uppercase tracking-widest">Añadir Frame</span>
                            </div>
                            <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                        </div>
                    ` : ''}

                    ${activeTab === 'produccion' ? `
                        <div class="max-w-4xl space-y-12">
                            <h3 class="text-4xl">Checklist de Calidad</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label class="flex items-center gap-6 p-10 border border-brand-dark cursor-pointer hover:bg-brand-light transition-all">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-8 h-8 accent-brand-primary">
                                    <span class="text-xl font-black uppercase tracking-tighter">Montaje Base</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 border border-brand-dark cursor-pointer hover:bg-brand-light transition-all">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-8 h-8 accent-brand-primary">
                                    <span class="text-xl font-black uppercase tracking-tighter">Color & Mix</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 border border-brand-dark cursor-pointer hover:bg-brand-light transition-all">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-8 h-8 accent-brand-primary">
                                    <span class="text-xl font-black uppercase tracking-tighter">GFX & Subs</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 border-4 border-brand-accent cursor-pointer hover:bg-brand-accent/10 transition-all">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-8 h-8 accent-brand-primary">
                                    <span class="text-xl font-black uppercase tracking-tighter text-brand-primary">Master Final</span>
                                </label>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'gestion' ? `
                        <div class="max-w-3xl space-y-20">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-20">
                                <div>
                                    <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Líder del Proyecto</label>
                                    <input type="text" id="teamInput" value="${p.team || ''}" class="swiss-input uppercase">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Fecha Límite</label>
                                    <input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="swiss-input">
                                </div>
                            </div>
                            <div>
                                <label class="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-4">Estado del Proceso</label>
                                <select id="statusSelect" class="swiss-input uppercase">
                                    <option value="Idea" ${p.status === 'Idea' ? 'selected' : ''}>Idea</option>
                                    <option value="Scripting" ${p.status === 'Scripting' ? 'selected' : ''}>Scripting</option>
                                    <option value="Storyboard" ${p.status === 'Storyboard' ? 'selected' : ''}>Storyboard</option>
                                    <option value="Producción" ${p.status === 'Producción' ? 'selected' : ''}>Producción</option>
                                    <option value="Finalizado" ${p.status === 'Finalizado' ? 'selected' : ''} ${!prod.exportado && p.status !== 'Finalizado' ? 'disabled' : ''}>Finalizado</option>
                                </select>
                            </div>
                            <div class="flex gap-4">
                                <button id="btnSaveDetail" class="btn-swiss-primary flex-1 py-8 text-lg">Sincronizar Datos</button>
                                <button onclick="window.deleteProject('${p.id}')" class="btn-swiss-outline px-12 py-8 text-brand-accent border-brand-accent">Eliminar</button>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${window.appState.lightbox ? `
                    <div class="fixed inset-0 bg-brand-dark z-[100] flex items-center justify-center p-20" onclick="window.appState.lightbox = null; renderApp();">
                        <img src="${window.appState.lightbox}" class="max-w-full max-h-full border-4 border-white shadow-2xl">
                        <button class="absolute top-10 right-10 text-white text-4xl font-black">&times;</button>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('btnBackToDashboardDetail').onclick = () => window.setView('dashboard');
        
        const saveBtn = document.getElementById('btnSaveDetail');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const newStatus = document.getElementById('statusSelect').value;
                const newTeam = document.getElementById('teamInput').value;
                const newDueDate = document.getElementById('dueDateInput').value;
                
                const newProd = {
                    montaje: document.getElementById('chkMontaje') ? document.getElementById('chkMontaje').checked : prod.montaje,
                    edicion: document.getElementById('chkEdicion') ? document.getElementById('chkEdicion').checked : prod.edicion,
                    subtitulado: document.getElementById('chkSubtitulado') ? document.getElementById('chkSubtitulado').checked : prod.subtitulado,
                    exportado: document.getElementById('chkExportado') ? document.getElementById('chkExportado').checked : prod.exportado
                };

                await updateProject(p.id, {
                    status: newStatus,
                    team: newTeam,
                    dueDate: newDueDate,
                    production: newProd
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
                    window.saveScriptRealtime(p.id, e.target.innerHTML);
                }, 1500);
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
