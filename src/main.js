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
        'Idea': { bg: 'bg-brand-highlight/10', text: 'text-brand-highlight', icon: '💡', border: 'border-brand-highlight/20' },
        'Scripting': { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📝', border: 'border-blue-500/20' },
        'Storyboard': { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: '🎨', border: 'border-purple-500/20' },
        'Producción': { bg: 'bg-brand-accent/10', text: 'text-brand-accent', icon: '🎬', border: 'border-brand-accent/20' },
        'Finalizado': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '✅', border: 'border-emerald-500/20' }
    };
    const c = config[status] || { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: '❓', border: 'border-gray-500/20' };
    return `<span class="flex items-center gap-2 px-4 py-1.5 rounded-full ${c.bg} ${c.text} ${c.border} border text-[10px] font-black uppercase tracking-wider shadow-inner">
        <span>${c.icon}</span> ${status}
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
            <div class="flex items-center justify-center min-h-screen p-6 relative overflow-hidden">
                <div class="absolute top-[-10%] -left-[10%] w-[50%] h-[50%] bg-brand-primary/20 blur-[120px] rounded-full"></div>
                <div class="absolute bottom-[-10%] -right-[10%] w-[40%] h-[40%] bg-brand-accent/10 blur-[120px] rounded-full"></div>
                
                <div class="bg-white/95 backdrop-blur-2xl p-12 rounded-5xl shadow-glass max-w-md w-full text-center animate-in fade-in zoom-in duration-1000 border border-white/20 relative z-10">
                    <div class="w-24 h-24 bg-brand-dark rounded-3xl mx-auto mb-10 flex items-center justify-center shadow-2xl transform transition-transform hover:rotate-6 group">
                        <span class="text-4xl group-hover:scale-110 transition-transform">🎯</span>
                    </div>
                    <h2 class="text-4xl font-black text-brand-dark mb-4 tracking-tighter">Marketing Portal</h2>
                    <p class="text-gray-500 mb-10 font-medium italic text-sm text-balance">Identifícate para acceder a la planificación estratégica.</p>
                    <form id="loginForm" class="space-y-6">
                        <input type="text" id="userNameInput" required placeholder="Tu nombre..." class="input-field text-center">
                        <button type="submit" class="btn-primary w-full text-lg">Entrar al Sistema</button>
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
            <div class="p-6 md:p-12 max-w-[1600px] mx-auto min-h-screen relative">
                <header class="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-16 gap-10 relative z-10">
                    <div class="flex items-center gap-8">
                        <div class="w-20 h-20 bg-brand-accent rounded-3xl flex items-center justify-center shadow-glow transform -rotate-3 hover:rotate-0 transition-all duration-700">
                            <span class="text-4xl">📊</span>
                        </div>
                        <div>
                            <span class="text-[11px] font-black uppercase tracking-[0.5em] text-brand-accent mb-2 inline-block">Marketing Intelligence</span>
                            <h1 class="text-5xl font-black text-white tracking-tighter leading-tight drop-shadow-2xl">AV Planner Pro</h1>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-4 bento-card p-3">
                        <div class="relative group">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm group-focus-within:text-brand-accent transition-colors">🔍</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Buscar proyecto..." class="pl-12 pr-4 py-3 bg-transparent border-none text-sm focus:ring-0 placeholder:text-white/20 font-bold text-white w-40 md:w-64 transition-all focus:w-80">
                        </div>
                        <div class="h-8 w-px bg-white/10 hidden md:block"></div>
                        <select id="sortSelect" class="bg-transparent border-none rounded-xl text-[10px] font-black py-3 px-5 text-white/50 appearance-none cursor-pointer outline-none uppercase tracking-widest hover:text-white transition-colors">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''} class="text-brand-dark">📅 Recientes</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''} class="text-brand-dark">🔤 Título</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''} class="text-brand-dark">⚡ Estatus</option>
                        </select>
                        <button id="btnNewIdea" class="btn-primary">
                            + Crear Idea
                        </button>
                        <div class="h-8 w-px bg-white/10 hidden md:block ml-2"></div>
                        <div class="flex items-center gap-4 px-5 group cursor-pointer bg-white/5 rounded-2xl py-3 border border-white/5 hover:bg-white/10 transition-colors" onclick="localStorage.removeItem('av_planner_username'); location.reload();">
                            <div class="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center font-black text-[10px]">${window.appState.userName.charAt(0).toUpperCase()}</div>
                            <span class="text-[11px] font-black text-white/80 uppercase tracking-tighter">${window.appState.userName}</span>
                            <span class="text-xs text-white/20 group-hover:text-brand-accent transition-colors">✕</span>
                        </div>
                    </div>
                </header>

                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 relative z-10">
                    ${filteredProjects.map(p => {
                        const progress = getStatusProgress(p.status);
                        return `
                            <div data-id="${p.id}" class="project-row bento-card p-8 group cursor-pointer hover:bg-white/10 hover:shadow-brand-accent/5 hover:-translate-y-2">
                                <div class="flex justify-between items-start mb-8">
                                    <div class="flex flex-col gap-2">
                                        <div class="flex items-center gap-3">
                                            <span class="text-[9px] font-black text-brand-accent bg-brand-accent/10 px-3 py-1 rounded-full border border-brand-accent/20 uppercase tracking-[0.2em]">${p.category}</span>
                                            <span class="text-[9px] font-black text-white/30 uppercase tracking-widest">ID: ${p.id.substring(0,6)}</span>
                                        </div>
                                        <h3 class="text-2xl font-black text-white group-hover:text-brand-accent transition-colors tracking-tighter leading-tight">${p.title}</h3>
                                    </div>
                                    <div class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-xl group-hover:rotate-12 transition-transform border border-white/10 shadow-inner">
                                        ${p.status === 'Finalizado' ? '✅' : '🚀'}
                                    </div>
                                </div>
                                
                                <p class="text-gray-400 text-sm font-medium line-clamp-2 mb-8 italic opacity-60 leading-relaxed">${p.description || 'Sin descripción estratégica definida.'}</p>
                                
                                <div class="flex flex-wrap items-center gap-4 mb-8">
                                    <div class="flex items-center gap-2 bg-brand-dark/50 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                                        <span class="text-[10px] text-white/40 font-black uppercase tracking-widest">Team</span>
                                        <span class="text-[11px] font-black text-white tracking-tight">${p.team || 'Sin asignar'}</span>
                                    </div>
                                    <div class="flex items-center gap-2 bg-brand-dark/50 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                                        <span class="text-[10px] text-white/40 font-black uppercase tracking-widest">Editor</span>
                                        <span class="text-[11px] font-black text-white tracking-tight">${p.lastEditor || 'Sist.'}</span>
                                    </div>
                                </div>

                                <div class="space-y-3">
                                    <div class="flex justify-between items-end">
                                        <span class="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Pipeline Progress</span>
                                        <span class="text-xs font-black text-brand-accent">${Math.round(progress)}%</span>
                                    </div>
                                    <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <div class="h-full bg-gradient-to-r from-brand-primary to-brand-accent transition-all duration-1000 shadow-glow" style="width: ${progress}%"></div>
                                    </div>
                                    <div class="flex justify-between items-center pt-2">
                                        ${getStatusBadge(p.status)}
                                        <span class="text-[10px] font-bold text-white/20">${new Date(p.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${filteredProjects.length === 0 ? `
                        <div class="col-span-full py-40 text-center bento-card border-dashed">
                            <h3 class="text-4xl font-black text-white/10 italic uppercase tracking-[0.4em] mb-4">Sin Registros</h3>
                            <p class="text-white/5 font-bold text-lg">Inicia un nuevo flujo estratégico para visualizar datos.</p>
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
            <div class="p-6 max-w-2xl mx-auto py-20 relative min-h-screen">
                <button id="btnBackToDashboard" class="text-white/60 mb-12 flex items-center hover:text-white hover:translate-x-[-4px] transition-all font-black uppercase text-[10px] tracking-[0.4em] bg-white/5 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
                    <span class="mr-3 text-lg">←</span> Volver al Dashboard
                </button>
                
                <div class="bento-card-light p-12 relative overflow-hidden animate-in slide-in-from-bottom-12 duration-1000">
                    <div class="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-bl-[10rem] -z-0"></div>
                    <h2 class="text-5xl font-black mb-12 text-brand-dark tracking-tighter relative z-10">Nueva Iniciativa<span class="text-brand-accent">.</span></h2>
                    <form id="ideaForm" class="space-y-10 relative z-10">
                        <div class="group">
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 ml-2 group-focus-within:text-brand-accent transition-colors">Título del Proyecto</label>
                            <input type="text" id="title" required class="w-full p-6 bg-brand-light rounded-3xl border-2 border-transparent focus:border-brand-accent focus:bg-white focus:ring-8 focus:ring-brand-accent/5 outline-none font-black text-2xl text-brand-dark transition-all shadow-inner" placeholder="Ej: Campaña Invierno 2026">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div class="group">
                                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 ml-2 group-focus-within:text-brand-accent transition-colors">Categoría</label>
                                <select id="category" class="w-full p-6 bg-brand-light rounded-3xl border-2 border-transparent focus:border-brand-accent focus:bg-white focus:ring-8 focus:ring-brand-accent/5 outline-none font-black text-brand-dark appearance-none cursor-pointer shadow-inner">
                                    <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                                </select>
                            </div>
                            <div class="group">
                                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 ml-2 group-focus-within:text-brand-accent transition-colors">Lead Responsable</label>
                                <input type="text" id="team" class="w-full p-6 bg-brand-light rounded-3xl border-2 border-transparent focus:border-brand-accent focus:bg-white focus:ring-8 focus:ring-brand-accent/5 outline-none font-black text-brand-dark transition-all shadow-inner" placeholder="Nombre...">
                            </div>
                        </div>
                        <div class="group">
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 ml-2 group-focus-within:text-brand-accent transition-colors">Brief Conceptual</label>
                            <textarea id="description" rows="5" required class="w-full p-6 bg-brand-light rounded-3xl border-2 border-transparent focus:border-brand-accent focus:bg-white focus:ring-8 focus:ring-brand-accent/5 outline-none font-medium leading-relaxed text-brand-dark transition-all shadow-inner" placeholder="Describe los objetivos clave..."></textarea>
                        </div>
                        <button type="submit" class="btn-primary w-full py-8 rounded-4xl text-xl">Ejecutar Lanzamiento</button>
                    </form>
                </div>
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
        const stages = ['Idea', 'Scripting', 'Storyboard', 'Producción', 'Finalizado'];
        const prod = p.production || { montaje: false, edicion: false, subtitulado: false, exportado: false };
        const images = p.storyboardImages || [];
        const activeTab = window.appState.activeTab;

        root.innerHTML = `
            <div class="p-6 md:p-12 max-w-[1500px] mx-auto min-h-screen pb-32 relative">
                <button id="btnBackToDashboardDetail" class="text-white/60 mb-12 flex items-center hover:text-white hover:translate-x-[-4px] transition-all font-black uppercase text-[10px] tracking-[0.4em] bg-white/5 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl">
                    <span class="mr-3 text-lg">←</span> Volver al Dashboard
                </button>
                
                <div class="mb-16">
                    <div class="flex flex-wrap items-center gap-6 mb-10">
                        ${getStatusBadge(p.status)}
                        <div class="flex items-center gap-3 bg-brand-primary/20 backdrop-blur-xl px-6 py-2 rounded-full border border-white/10 shadow-glass">
                            <span class="text-[10px] font-black text-brand-accent uppercase tracking-[0.2em]">Última Firma:</span>
                            <span class="text-[11px] font-black text-white italic">${p.lastEditor || 'Sistema'}</span>
                        </div>
                        <span class="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] ml-auto">REF: ${p.id.substring(0,10)}</span>
                    </div>
                    <h1 class="text-5xl md:text-7xl font-black text-white mb-16 tracking-tighter leading-none max-w-6xl drop-shadow-2xl">${p.title}</h1>
                    
                    <div class="relative max-w-3xl">
                        <div class="flex gap-2 bg-brand-dark/40 backdrop-blur-3xl p-2 rounded-[2.5rem] border border-white/5 shadow-glass relative overflow-hidden">
                            <button onclick="window.setTab('guion')" class="relative flex-1 px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all z-10 ${activeTab === 'guion' ? 'text-brand-dark' : 'text-white/40 hover:text-white'}">
                                ${activeTab === 'guion' ? '<div class="absolute inset-0 bg-white rounded-[1.8rem] -z-10 shadow-glow animate-in fade-in duration-500"></div>' : ''}
                                📝 Guion
                            </button>
                            <button onclick="window.setTab('storyboard')" class="relative flex-1 px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all z-10 ${activeTab === 'storyboard' ? 'text-brand-dark' : 'text-white/40 hover:text-white'}">
                                ${activeTab === 'storyboard' ? '<div class="absolute inset-0 bg-white rounded-[1.8rem] -z-10 shadow-glow animate-in fade-in duration-500"></div>' : ''}
                                🎨 Visuals
                            </button>
                            <button onclick="window.setTab('produccion')" class="relative flex-1 px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all z-10 ${activeTab === 'produccion' ? 'text-brand-dark' : 'text-white/40 hover:text-white'}">
                                ${activeTab === 'produccion' ? '<div class="absolute inset-0 bg-white rounded-[1.8rem] -z-10 shadow-glow animate-in fade-in duration-500"></div>' : ''}
                                🎬 Prod.
                            </button>
                            <button onclick="window.setTab('gestion')" class="relative flex-1 px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all z-10 ${activeTab === 'gestion' ? 'text-brand-dark' : 'text-white/40 hover:text-white'}">
                                ${activeTab === 'gestion' ? '<div class="absolute inset-0 bg-white rounded-[1.8rem] -z-10 shadow-glow animate-in fade-in duration-500"></div>' : ''}
                                ⚙️ Admin
                            </button>
                        </div>
                    </div>
                </div>

                <div class="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                    ${activeTab === 'guion' ? `
                        <div class="bento-card-light p-12 md:p-20 max-w-6xl">
                            <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-16 gap-8">
                                <div>
                                    <h3 class="font-black text-4xl text-brand-dark tracking-tighter">Narrativa Estratégica<span class="text-brand-accent">.</span></h3>
                                    <p class="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mt-3 ml-1">Procesador de Guion v2.0</p>
                                </div>
                                <div class="flex flex-wrap items-center gap-3 bg-brand-light p-3 rounded-[2.5rem] border border-gray-200 shadow-inner">
                                    <button onclick="window.formatScriptBold()" class="w-12 h-12 rounded-2xl bg-white flex items-center justify-center font-black text-xl text-brand-dark hover:bg-brand-accent hover:text-white transition-all shadow-sm border border-gray-100">B</button>
                                    <button onclick="window.insertSceneCut()" class="px-6 h-12 rounded-2xl bg-white flex items-center justify-center font-black text-[11px] text-brand-dark uppercase tracking-widest hover:bg-brand-accent hover:text-white transition-all shadow-sm border border-gray-100 gap-3">🎬 CORTE</button>
                                    <div class="w-px h-8 bg-gray-200 mx-2"></div>
                                    <button onclick="window.copyScript()" class="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-xl hover:bg-brand-accent hover:text-white transition-all shadow-sm border border-gray-100">📋</button>
                                    <button onclick="window.shareScript()" class="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-xl hover:bg-brand-accent hover:text-white transition-all shadow-sm border border-gray-100">📤</button>
                                    <button onclick="window.printScript()" class="w-12 h-12 rounded-2xl bg-brand-dark flex items-center justify-center text-xl text-white hover:bg-brand-accent transition-all shadow-xl">🖨️</button>
                                </div>
                            </div>
                            <div id="scriptContent" class="bg-gray-50 p-16 md:p-24 rounded-[4rem] text-lg text-gray-800 min-h-[800px] outline-none border-2 border-transparent focus:border-brand-accent focus:bg-white focus:ring-[40px] focus:ring-brand-accent/5 leading-relaxed font-mono shadow-inner transition-all print:shadow-none print:p-0 print:bg-white print:text-black" contenteditable="true" style="tab-size: 4;">
                                ${p.script || 'ESCENA 1 - INTERIOR - DÍA\n\nIdentificación del espacio y tiempo...\n\nINICIO DEL RELATO...'}
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'storyboard' ? `
                        <div class="bento-card-light p-12 md:p-16">
                            <div class="flex items-center justify-between mb-16">
                                <h3 class="font-black text-4xl text-brand-dark tracking-tighter">Storyboard Visual<span class="text-brand-accent">.</span></h3>
                                <div class="w-16 h-16 rounded-3xl bg-purple-50 flex items-center justify-center text-3xl shadow-inner border border-purple-100">🎨</div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
                                ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-video bg-gray-100 rounded-[2.5rem] overflow-hidden cursor-pointer hover:ring-[12px] hover:ring-brand-accent/5 relative group transition-all shadow-2xl hover:-translate-y-3 border border-gray-100">
                                    <img src="${img}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-brand-dark/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[6px]"><span class="text-white text-5xl font-black">🔍</span></div>
                                </div>`).join('')}
                                <div onclick="document.getElementById('sbUpload').click()" class="aspect-video bg-gray-50/50 rounded-[2.5rem] flex flex-col items-center justify-center text-gray-300 border-4 border-dashed border-gray-200 hover:border-brand-accent hover:text-brand-accent hover:bg-white cursor-pointer transition-all shadow-inner group">
                                    <span class="text-6xl font-black group-hover:scale-125 transition-transform">+</span>
                                    <span class="text-[10px] font-black uppercase tracking-[0.4em] mt-6">Añadir Frame</span>
                                </div>
                                <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'produccion' ? `
                        <div class="bento-card-light p-12 md:p-20 max-w-5xl">
                            <div class="flex items-center justify-between mb-16">
                                <h3 class="font-black text-4xl text-brand-dark tracking-tighter">Control de Calidad Audiovisual<span class="text-brand-accent">.</span></h3>
                                <div class="w-16 h-16 rounded-3xl bg-red-50 flex items-center justify-center text-3xl shadow-inner border border-red-100">🎬</div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <label class="flex items-center gap-8 p-12 rounded-[3.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:border-brand-accent/10">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-12 h-12 text-brand-accent rounded-2xl focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform">
                                    <div class="flex flex-col">
                                        <span class="text-2xl font-black text-brand-dark">Montaje Estructural</span>
                                        <span class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Cortes y Ritmo</span>
                                    </div>
                                </label>
                                <label class="flex items-center gap-8 p-12 rounded-[3.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:border-brand-accent/10">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-12 h-12 text-brand-accent rounded-2xl focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform">
                                    <div class="flex flex-col">
                                        <span class="text-2xl font-black text-brand-dark">Color & Audio Mix</span>
                                        <span class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Acabado Profesional</span>
                                    </div>
                                </label>
                                <label class="flex items-center gap-8 p-12 rounded-[3.5rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:border-brand-accent/10">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-12 h-12 text-brand-accent rounded-2xl focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform">
                                    <div class="flex flex-col">
                                        <span class="text-2xl font-black text-brand-dark">GFX & Subtítulos</span>
                                        <span class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Accesibilidad Visual</span>
                                    </div>
                                </label>
                                <label class="flex items-center gap-8 p-12 rounded-[3.5rem] bg-brand-accent/5 transition-all cursor-pointer border-2 border-transparent group hover:bg-brand-accent/10 hover:shadow-2xl hover:border-brand-accent/20">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-12 h-12 text-brand-accent rounded-2xl focus:ring-0 border-brand-accent/20 shadow-inner group-hover:scale-110 transition-transform">
                                    <div class="flex flex-col">
                                        <span class="text-2xl font-black text-brand-accent">Máster Finalizado</span>
                                        <span class="text-xs text-brand-accent/60 font-bold uppercase tracking-widest mt-1">Listo para Distribución</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'gestion' ? `
                        <div class="bg-brand-dark p-16 md:p-24 rounded-[5rem] shadow-glass text-white max-w-5xl border border-white/5 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-96 h-96 bg-brand-primary/10 rounded-bl-[20rem] -z-0"></div>
                            <div class="flex items-center justify-between mb-20 relative z-10">
                                <h3 class="font-black text-4xl text-white tracking-tighter leading-none">Administración Estratégica<span class="text-brand-accent">.</span></h3>
                                <div class="w-20 h-20 rounded-[2.5rem] bg-white/5 flex items-center justify-center text-3xl shadow-glass border border-white/5">⚙️</div>
                            </div>
                            <div class="space-y-16 relative z-10">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div class="group">
                                        <label class="block text-[11px] font-black text-brand-accent uppercase tracking-[0.4em] mb-6 ml-4 group-focus-within:text-white transition-colors">Líder de Proyecto</label>
                                        <input type="text" id="teamInput" value="${p.team || ''}" class="w-full p-8 bg-white/5 rounded-[3rem] border-2 border-white/5 focus:border-brand-accent focus:bg-white/10 focus:ring-[20px] focus:ring-brand-accent/5 transition-all text-2xl outline-none font-black text-white shadow-2xl" placeholder="...">
                                    </div>
                                    <div class="group">
                                        <label class="block text-[11px] font-black text-brand-accent uppercase tracking-[0.4em] mb-6 ml-4 group-focus-within:text-white transition-colors">Fecha de Entrega</label>
                                        <input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="w-full p-8 bg-white/5 rounded-[3rem] border-2 border-white/5 focus:border-brand-accent focus:bg-white/10 transition-all text-xl outline-none font-black text-white shadow-2xl">
                                    </div>
                                </div>
                                <div class="pt-16 border-t border-white/10 group">
                                    <label class="block text-[11px] font-black text-brand-accent uppercase tracking-[0.4em] mb-8 ml-4">Estatus en el Pipeline</label>
                                    <select id="statusSelect" class="w-full p-8 bg-white text-brand-dark rounded-[3rem] text-2xl font-black outline-none shadow-glow border-8 border-transparent focus:border-brand-accent transition-all appearance-none cursor-pointer text-center">
                                        ${stages.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''} ${(s === 'Finalizado' && !prod.exportado && p.status !== 'Finalizado') ? 'disabled' : ''}>${s.toUpperCase()}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 pt-10">
                                    <button id="btnSaveDetail" class="md:col-span-2 bg-white text-brand-dark py-8 rounded-[3.5rem] font-black text-2xl hover:scale-[1.03] transition-all shadow-glow uppercase tracking-[0.3em] active:scale-95">Sincronizar Cambios</button>
                                    <button onclick="window.deleteProject('${p.id}')" class="bg-brand-accent/10 text-brand-accent py-8 rounded-[3.5rem] font-black text-xs hover:bg-brand-accent hover:text-white transition-all border border-brand-accent/20 uppercase tracking-[0.4em]">Eliminar</button>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${window.appState.lightbox ? `
                    <div class="fixed inset-0 bg-brand-dark/95 z-[100] flex items-center justify-center p-8 backdrop-blur-3xl animate-in fade-in duration-700" onclick="window.appState.lightbox = null; renderApp();">
                        <img src="${window.appState.lightbox}" class="max-w-full max-h-[85vh] rounded-[4rem] shadow-glass border border-white/10 animate-in zoom-in-95 duration-700">
                        <button class="absolute top-12 right-12 text-white/20 hover:text-white text-6xl font-black transition-colors">&times;</button>
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
                
                // Get production values safely (checking if elements exist in current tab)
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
                
                // Immediate navigation to dashboard
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
