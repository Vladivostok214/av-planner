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
    sceneCut.className = 'my-8 border-t-2 border-dashed border-gray-200 pt-4 font-black text-[#006FB3] uppercase tracking-[0.3em] text-center text-sm';
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
        'Idea': { bg: 'bg-amber-100', text: 'text-amber-800', icon: '💡' },
        'Scripting': { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📝' },
        'Storyboard': { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🎨' },
        'Producción': { bg: 'bg-red-100', text: 'text-red-800', icon: '🎬' },
        'Finalizado': { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: '❓' };
    return `<span class="flex items-center gap-1.5 px-3 py-1 rounded-full ${c.bg} ${c.text} text-[9px] font-black uppercase tracking-wider shadow-sm">
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
            <div class="flex items-center justify-center min-h-screen p-6 bg-[#006FB3] relative overflow-hidden">
                <div class="absolute top-[-10%] -left-[10%] w-[50%] h-[50%] bg-blue-400/20 blur-[120px] rounded-full"></div>
                <div class="absolute bottom-[-10%] -right-[10%] w-[40%] h-[40%] bg-[#0A132D]/40 blur-[120px] rounded-full"></div>
                
                <div class="bg-white/95 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center animate-in fade-in zoom-in duration-700 border border-white/20 relative z-10">
                    <div class="w-20 h-20 bg-[#006FB3] rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl shadow-blue-200 transform transition-transform hover:rotate-6">
                        <svg class="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h2 class="text-3xl font-black text-[#0A132D] mb-4 tracking-tighter">Acceso Marketing</h2>
                    <p class="text-gray-500 mb-8 font-medium italic text-sm text-balance text-center">Firma tu entrada para registrar cada cambio estratégico.</p>
                    <form id="loginForm" class="space-y-4">
                        <input type="text" id="userNameInput" required placeholder="Tu firma..." class="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-[#006FB3] focus:ring-4 focus:ring-blue-500/10 outline-none font-bold text-center text-[#0A132D] transition-all">
                        <button type="submit" class="w-full bg-[#006FB3] text-white py-5 rounded-2xl font-black text-lg hover:bg-[#0A132D] transition-all shadow-xl hover:shadow-blue-900/20 border-t border-white/20 uppercase tracking-widest active:scale-[0.98]">Entrar al Portal</button>
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
            <div class="p-4 md:p-10 max-w-[1500px] mx-auto min-h-screen relative">
                <!-- Background Mesh -->
                <div class="fixed inset-0 pointer-events-none -z-10 bg-[#006FB3]">
                    <div class="absolute top-[-20%] -left-[10%] w-[60%] h-[60%] bg-blue-400/30 blur-[150px] rounded-full opacity-60"></div>
                    <div class="absolute bottom-[-20%] -right-[10%] w-[50%] h-[50%] bg-[#0A132D]/50 blur-[150px] rounded-full opacity-40"></div>
                </div>

                <header class="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 relative z-10">
                    <div class="flex items-center gap-6">
                        <div class="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-900/30 transform -rotate-2 hover:rotate-0 transition-all duration-500 border border-white/20">
                            <svg class="w-10 h-10 text-[#006FB3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div>
                            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-blue-100 bg-white/10 px-4 py-1.5 rounded-full mb-2 inline-block border border-white/10 backdrop-blur-md shadow-inner">Marketing Puntaje Nacional</span>
                            <h1 class="text-4xl font-black text-white tracking-tighter leading-tight drop-shadow-md">Planificación Audiovisual</h1>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-4 bg-white/5 backdrop-blur-3xl p-2.5 rounded-[2rem] border border-white/10 shadow-2xl shadow-blue-900/20">
                        <div class="relative group">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm group-focus-within:text-blue-200 transition-colors">🔍</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Filtrar ideas..." class="pl-10 pr-4 py-2.5 bg-transparent border-none text-sm focus:ring-0 placeholder:text-white/20 font-bold text-white w-32 md:w-56 transition-all focus:w-72">
                        </div>
                        <div class="h-8 w-px bg-white/10 hidden md:block"></div>
                        <select id="sortSelect" class="bg-transparent border-none rounded-xl text-[10px] font-black py-2.5 px-4 text-white/50 appearance-none cursor-pointer outline-none uppercase tracking-widest hover:text-white transition-colors">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''} class="text-[#0A132D]">📅 Recientes</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''} class="text-[#0A132D]">🔤 Título</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''} class="text-[#0A132D]">⚡ Estatus</option>
                        </select>
                        <button id="btnNewIdea" class="bg-[#FE6565] text-white px-8 py-3 rounded-2xl font-black shadow-xl shadow-red-900/20 hover:bg-[#D93025] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest text-[10px] border-t border-white/20">
                            <span class="text-lg">+</span> Nueva Idea
                        </button>
                        <div class="h-8 w-px bg-white/10 hidden md:block ml-2"></div>
                        <div class="flex items-center gap-3 px-4 group cursor-pointer bg-white/5 rounded-2xl py-2 border border-white/5 hover:bg-white/10 transition-colors" onclick="localStorage.removeItem('av_planner_username'); location.reload();">
                            <span class="text-[10px] font-black text-blue-100 uppercase tracking-tighter">👤 ${window.appState.userName}</span>
                            <span class="text-[10px] text-white/20 group-hover:text-red-400">✕</span>
                        </div>
                    </div>
                </header>

                <div class="flex flex-col gap-4 relative z-10">
                    ${filteredProjects.map(p => {
                        const progress = getStatusProgress(p.status);
                        return `
                            <div data-id="${p.id}" class="project-row bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-xl shadow-blue-900/10 hover:shadow-blue-900/30 hover:scale-[1.01] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden border border-white/20 group">
                                <!-- Progress Mini-Bar -->
                                <div class="absolute bottom-0 left-0 h-1 bg-[#006FB3]/5 w-full"></div>
                                <div class="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[#006FB3] to-blue-400 transition-all duration-1000 shadow-[0_0_8px_rgba(0,111,179,0.5)]" style="width: ${progress}%"></div>
                                
                                <div class="w-full md:w-32 flex shrink-0 md:justify-center">
                                    ${getStatusBadge(p.status)}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-3 mb-1">
                                        <h3 class="text-base font-black text-[#0A132D] truncate tracking-tight group-hover:text-[#006FB3] transition-colors">${p.title}</h3>
                                        <span class="text-[8px] font-black text-[#006FB3] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/50 uppercase tracking-widest shrink-0">${p.category}</span>
                                    </div>
                                    <p class="text-gray-400 text-[11px] font-medium line-clamp-1 opacity-70 italic">${p.description || 'Sin brief conceptual.'}</p>
                                </div>
                                <div class="flex items-center gap-8 shrink-0 w-full md:w-auto md:border-l border-gray-100 md:pl-8 mt-4 md:mt-0">
                                    <div class="flex flex-col items-center">
                                        <span class="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1.5">Encargado</span>
                                        <span class="text-[10px] font-black text-[#0A132D] bg-gray-50 px-4 py-1.5 rounded-xl border border-gray-100 shadow-inner tracking-tighter">${p.team || '---'}</span>
                                    </div>
                                    <div class="flex flex-col items-center">
                                        <span class="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1.5">Registro</span>
                                        <span class="text-[10px] font-bold text-gray-400 tracking-tighter">${new Date(p.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <div class="flex flex-col items-end">
                                        <span class="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1.5">Firma</span>
                                        <span class="text-[9px] font-black text-[#006FB3] opacity-60 truncate max-w-[100px] bg-blue-50/50 px-3 py-1 rounded-lg border border-blue-50 italic">🖊️ ${p.lastEditor || 'Sist.'}</span>
                                    </div>
                                    <div class="w-12 h-12 rounded-2xl bg-[#006FB3]/5 text-[#006FB3] flex items-center justify-center transform group-hover:rotate-12 group-hover:scale-110 transition-all border border-blue-100/50 shadow-inner">
                                        <span class="text-2xl font-black">→</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${filteredProjects.length === 0 ? `
                        <div class="py-32 text-center bg-white/5 backdrop-blur-md rounded-[4rem] border-2 border-dashed border-white/10">
                            <h3 class="text-3xl font-black text-white/20 italic uppercase tracking-[0.3em]">Sin registros estratégicos</h3>
                            <p class="text-white/10 mt-4 font-bold text-sm">Prueba con otros términos de búsqueda.</p>
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
                <div class="fixed inset-0 pointer-events-none -z-10 bg-[#006FB3]">
                    <div class="absolute top-[-20%] -left-[10%] w-[60%] h-[60%] bg-blue-400/30 blur-[150px] rounded-full opacity-60"></div>
                </div>
                
                <button id="btnBackToDashboard" class="text-white mb-10 flex items-center hover:scale-105 transition-transform font-black uppercase text-xs tracking-[0.3em] bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl"><span class="mr-3 text-xl">←</span> Dashboard</button>
                
                <div class="bg-white p-12 rounded-[4rem] shadow-2xl border border-white relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700">
                    <div class="absolute top-0 right-0 w-48 h-48 bg-[#006FB3]/5 rounded-bl-[8rem]"></div>
                    <h2 class="text-4xl font-black mb-10 text-[#0A132D] tracking-tighter text-center">Nueva Iniciativa<span class="text-[#006FB3]">.</span></h2>
                    <form id="ideaForm" class="space-y-8 relative z-10">
                        <div class="group">
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-[#006FB3] transition-colors">Título Conceptual</label>
                            <input type="text" id="title" required class="w-full p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white focus:ring-8 focus:ring-blue-500/5 outline-none font-black text-xl text-[#0A132D] transition-all shadow-inner" placeholder="Ej: Hacks DEMRE 2026">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="group">
                                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-[#006FB3] transition-colors">Categoría Estratégica</label>
                                <select id="category" class="w-full p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white focus:ring-8 focus:ring-blue-500/5 outline-none font-black text-[#0A132D] appearance-none cursor-pointer shadow-inner">
                                    <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                                </select>
                            </div>
                            <div class="group">
                                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-[#006FB3] transition-colors">Lead (Opcional)</label>
                                <input type="text" id="team" class="w-full p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white focus:ring-8 focus:ring-blue-500/5 outline-none font-black text-[#0A132D] transition-all shadow-inner" placeholder="Nombre...">
                            </div>
                        </div>
                        <div class="group">
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-2 group-focus-within:text-[#006FB3] transition-colors">Brief / Objetivo</label>
                            <textarea id="description" rows="4" required class="w-full p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-[#006FB3] focus:bg-white focus:ring-8 focus:ring-blue-500/5 outline-none font-medium leading-relaxed text-[#0A132D] transition-all shadow-inner" placeholder="¿Qué impacto buscamos con esta idea?"></textarea>
                        </div>
                        <button type="submit" class="w-full bg-[#006FB3] text-white py-8 rounded-[2.5rem] font-black text-xl hover:bg-[#0A132D] transition-all shadow-2xl hover:shadow-blue-900/30 border-t border-white/20 uppercase tracking-[0.2em] active:scale-[0.98]">Guardar Iniciativa</button>
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
        const currentIndex = stages.indexOf(p.status);
        const prod = p.production || { montaje: false, edicion: false, subtitulado: false, exportado: false };
        const images = p.storyboardImages || [];
        const activeTab = window.appState.activeTab;

        root.innerHTML = `
            <div class="p-4 md:p-10 max-w-[1400px] mx-auto min-h-screen pb-20 relative">
                <!-- Background Mesh -->
                <div class="fixed inset-0 pointer-events-none -z-10 bg-[#006FB3]">
                    <div class="absolute bottom-[-10%] -left-[10%] w-[60%] h-[60%] bg-blue-400/30 blur-[150px] rounded-full opacity-60"></div>
                </div>

                <button id="btnBackToDashboardDetail" class="text-white mb-10 flex items-center hover:scale-105 transition-transform font-black uppercase text-[10px] tracking-[0.3em] bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl"><span class="mr-3 text-xl">←</span> Dashboard</button>
                
                <div class="mb-12">
                    <div class="flex flex-wrap items-center gap-4 mb-8">
                        ${getStatusBadge(p.status)}
                        <div class="flex items-center gap-3 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-xl">
                            <span class="text-[10px] font-black text-blue-100 uppercase tracking-widest">🖊️ Última Firma:</span>
                            <span class="text-[10px] font-black text-white italic uppercase">${p.lastEditor || 'Sist.'}</span>
                        </div>
                        <span class="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] ml-auto">PROJECT_ID: ${p.id.substring(0,8)}</span>
                    </div>
                    <h1 class="text-4xl md:text-6xl font-black text-white mb-12 tracking-tighter leading-tight max-w-5xl drop-shadow-2xl">${p.title}</h1>
                    
                    <!-- MODERN TAB NAVIGATION -->
                    <div class="relative max-w-2xl">
                        <div class="flex gap-1 bg-black/20 backdrop-blur-3xl p-1.5 rounded-[2.2rem] border border-white/10 shadow-2xl relative overflow-hidden">
                            <button onclick="window.setTab('guion')" class="relative flex-1 px-4 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all z-10 ${activeTab === 'guion' ? 'text-[#006FB3]' : 'text-white/60 hover:text-white'}">
                                ${activeTab === 'guion' ? '<div class="absolute inset-0 bg-white rounded-[1.6rem] -z-10 shadow-2xl animate-in fade-in duration-300"></div>' : ''}
                                📝 Narrativo
                            </button>
                            <button onclick="window.setTab('storyboard')" class="relative flex-1 px-4 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all z-10 ${activeTab === 'storyboard' ? 'text-[#006FB3]' : 'text-white/60 hover:text-white'}">
                                ${activeTab === 'storyboard' ? '<div class="absolute inset-0 bg-white rounded-[1.6rem] -z-10 shadow-2xl animate-in fade-in duration-300"></div>' : ''}
                                🎨 Storyboard
                            </button>
                            <button onclick="window.setTab('produccion')" class="relative flex-1 px-4 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all z-10 ${activeTab === 'produccion' ? 'text-[#006FB3]' : 'text-white/60 hover:text-white'}">
                                ${activeTab === 'produccion' ? '<div class="absolute inset-0 bg-white rounded-[1.6rem] -z-10 shadow-2xl animate-in fade-in duration-300"></div>' : ''}
                                🎬 Prod.
                            </button>
                            <button onclick="window.setTab('gestion')" class="relative flex-1 px-4 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all z-10 ${activeTab === 'gestion' ? 'text-[#006FB3]' : 'text-white/60 hover:text-white'}">
                                ${activeTab === 'gestion' ? '<div class="absolute inset-0 bg-white rounded-[1.6rem] -z-10 shadow-2xl animate-in fade-in duration-300"></div>' : ''}
                                ⚙️ Gestión
                            </button>
                                </div>
                                </div>
                                </div>

                                <div class="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                ${activeTab === 'guion' ? `
                        <div class="bg-white p-10 md:p-16 rounded-[4rem] shadow-[0_30px_100px_rgba(0,0,0,0.2)] border border-white max-w-5xl">
                            <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6">
                                <div>
                                    <h3 class="font-black text-3xl text-[#0A132D] tracking-tighter">Guion Narrativo<span class="text-[#006FB3]">.</span></h3>
                                    <p class="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2 ml-1">Estilo Audiovisual Profesional</p>
                                </div>
                                <div class="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded-3xl border border-gray-200 shadow-inner">
                                    <button onclick="window.formatScriptBold()" class="w-10 h-10 rounded-xl bg-white flex items-center justify-center font-black text-lg text-[#0A132D] hover:bg-[#006FB3] hover:text-white transition-all shadow-sm border border-gray-200">B</button>
                                    <button onclick="window.insertSceneCut()" class="px-5 h-10 rounded-xl bg-white flex items-center justify-center font-black text-[11px] text-[#0A132D] uppercase tracking-wider hover:bg-[#006FB3] hover:text-white transition-all shadow-sm border border-gray-200 gap-2">🎬 ESCENA</button>
                                    <div class="w-px h-6 bg-gray-300 mx-2"></div>
                                    <button onclick="window.copyScript()" class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg hover:bg-[#006FB3] hover:text-white transition-all shadow-sm border border-gray-200">📋</button>
                                    <button onclick="window.shareScript()" class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg hover:bg-[#006FB3] hover:text-white transition-all shadow-sm border border-gray-200">📤</button>
                                    <button onclick="window.printScript()" class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg hover:bg-[#0A132D] hover:text-white transition-all shadow-sm border border-gray-200">🖨️</button>
                                </div>
                            </div>
                            <div id="scriptContent" class="bg-[#F8F9FA] p-12 md:p-20 rounded-[3rem] text-sm md:text-base text-gray-800 min-h-[700px] outline-none border-2 border-transparent focus:border-[#006FB3] focus:bg-white focus:ring-[20px] focus:ring-blue-500/5 leading-loose font-mono shadow-inner transition-all print:shadow-none print:p-0 print:bg-white print:text-black" contenteditable="true" style="font-family: 'Courier New', Courier, monospace; tab-size: 4;">
                                ${p.script || 'ESCENA 1 - INTERIOR - DÍA\n\nEscribe el flujo narrativo aquí...'}
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'storyboard' ? `
                        <div class="bg-white p-10 md:p-14 rounded-[4rem] shadow-[0_30px_100px_rgba(0,0,0,0.2)] border border-white">
                            <div class="flex items-center justify-between mb-12">
                                <h3 class="font-black text-3xl text-[#0A132D] tracking-tighter">Storyboard Visual<span class="text-[#006FB3]">.</span></h3>
                                <div class="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-xl shadow-inner border border-purple-100/50">🎨</div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-8">
                                ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-square bg-gray-100 rounded-[2rem] overflow-hidden cursor-pointer hover:ring-8 hover:ring-blue-500/10 relative group transition-all shadow-xl hover:-translate-y-2 border border-gray-100">
                                    <img src="${img}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-[#006FB3]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[4px]"><span class="text-white text-4xl font-black">🔍</span></div>
                                </div>`).join('')}
                                <div onclick="document.getElementById('sbUpload').click()" class="aspect-square bg-gray-50/80 rounded-[2rem] flex flex-col items-center justify-center text-gray-300 border-4 border-dashed border-gray-100 hover:border-[#006FB3] hover:text-[#006FB3] hover:bg-white cursor-pointer transition-all shadow-inner group">
                                    <span class="text-5xl font-black group-hover:scale-125 transition-transform">+</span><span class="text-[10px] font-black uppercase tracking-widest mt-4">Nuevo Frame</span>
                                </div>
                                <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'produccion' ? `
                        <div class="bg-white p-10 md:p-16 rounded-[4rem] shadow-[0_30px_100px_rgba(0,0,0,0.2)] border border-white max-w-4xl">
                            <div class="flex items-center justify-between mb-12">
                                <h3 class="font-black text-3xl text-[#0A132D] tracking-tighter">Control de Producción<span class="text-[#006FB3]">.</span></h3>
                                <div class="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-xl shadow-inner border border-red-100/50">🎬</div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <label class="flex items-center gap-6 p-10 rounded-[3rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:shadow-blue-900/10 hover:border-blue-100">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-10 h-10 text-[#006FB3] rounded-[1rem] focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform"><span class="text-xl font-black text-[#0A132D]">Montaje Base</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 rounded-[3rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:shadow-blue-900/10 hover:border-blue-100">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-10 h-10 text-[#006FB3] rounded-[1rem] focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform"><span class="text-xl font-black text-[#0A132D]">Color y Mezcla</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 rounded-[3rem] bg-gray-50 transition-all cursor-pointer border-2 border-transparent group hover:bg-white hover:shadow-2xl hover:shadow-blue-900/10 hover:border-blue-100">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-10 h-10 text-[#006FB3] rounded-[1rem] focus:ring-0 border-gray-200 shadow-inner group-hover:scale-110 transition-transform"><span class="text-xl font-black text-[#0A132D]">GFX y Subs</span>
                                </label>
                                <label class="flex items-center gap-6 p-10 rounded-[3rem] bg-red-50/50 transition-all cursor-pointer border-2 border-transparent group hover:bg-red-50 hover:shadow-2xl hover:shadow-red-900/10 hover:border-red-100">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-10 h-10 text-[#D93025] rounded-[1rem] focus:ring-0 border-red-200 shadow-inner group-hover:scale-110 transition-transform"><span class="text-xl font-black text-[#D93025]">Exportado Final</span>
                                </label>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'gestion' ? `
                        <div class="bg-[#0A132D] p-12 md:p-16 rounded-[5rem] shadow-[0_40px_120px_rgba(0,0,0,0.4)] text-white max-w-4xl border border-white/10 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-80 h-80 bg-[#006FB3]/10 rounded-bl-[15rem] -z-0"></div>
                            <div class="flex items-center justify-between mb-16 relative z-10">
                                <h3 class="font-black text-3xl text-white tracking-tighter">Gestión Estratégica<span class="text-[#006FB3]">.</span></h3>
                                <div class="w-14 h-14 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-2xl shadow-xl border border-white/5">⚙️</div>
                            </div>
                            <div class="space-y-12 relative z-10">
                                <div class="group">
                                    <label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.3em] mb-5 ml-4 group-focus-within:text-white transition-colors">Responsable del Proyecto</label>
                                    <input type="text" id="teamInput" value="${p.team || ''}" class="w-full p-7 bg-white/5 rounded-[2.5rem] border-2 border-white/5 focus:border-[#006FB3] focus:bg-white/10 focus:ring-[15px] focus:ring-blue-500/10 transition-all text-xl outline-none font-black text-white shadow-2xl" placeholder="...">
                                </div>
                                <div class="group">
                                    <label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.3em] mb-5 ml-4 group-focus-within:text-white transition-colors">Deadline Estratégico</label>
                                    <input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="w-full p-7 bg-white/5 rounded-[2.5rem] border-2 border-white/5 focus:border-[#006FB3] focus:bg-white/10 transition-all text-lg outline-none font-black text-white shadow-2xl">
                                </div>
                                <div class="pt-12 border-t border-white/10 group">
                                    <label class="block text-[10px] font-black text-blue-300 uppercase tracking-[0.3em] mb-6 ml-4">Estado del Pipeline</label>
                                    <select id="statusSelect" class="w-full p-7 bg-white text-[#0A132D] rounded-[2.5rem] text-lg font-black outline-none shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-4 border-transparent focus:border-[#006FB3]">
                                        ${stages.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''} ${(s === 'Finalizado' && !prod.exportado && p.status !== 'Finalizado') ? 'disabled' : ''}>${s.toUpperCase()}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                                    <button id="btnSaveDetail" class="w-full bg-white text-[#006FB3] py-7 rounded-[3rem] font-black text-xl hover:scale-[1.03] transition-all shadow-[0_20px_50px_rgba(0,0,0,0.3)] uppercase tracking-[0.2em] border-b-8 border-gray-200 active:scale-95 active:border-b-0">Guardar Cambios</button>
                                    <button onclick="window.deleteProject('${p.id}')" class="w-full bg-red-600/10 text-red-500 py-7 rounded-[3rem] font-black text-xs hover:bg-red-600 hover:text-white transition-all border border-red-500/20 uppercase tracking-[0.3em]">Eliminar Proyecto</button>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${window.appState.lightbox ? `
                    <div class="fixed inset-0 bg-[#0A132D]/95 z-[100] flex items-center justify-center p-6 backdrop-blur-xl animate-in fade-in duration-500" onclick="window.appState.lightbox = null; renderApp();">
                        <img src="${window.appState.lightbox}" class="max-w-full max-h-[90vh] rounded-[3rem] shadow-[0_50px_150px_rgba(0,0,0,0.6)] border border-white/10 animate-in zoom-in-95 duration-500">
                        <button class="absolute top-10 right-10 text-white/40 hover:text-white text-5xl font-black transition-colors">&times;</button>
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
