import './style.css';
import { Chart, registerables } from 'chart.js';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc } from "firebase/firestore";

Chart.register(...registerables);

// --- Firebase Mock & Initialization Logic ---
let db, auth;
const isMock = !import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY === "dummy-key";

if (isMock) {
    console.warn("Using Local Mock Database (localStorage)");
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
        doc: (db, ...path) => ({ id: path[path.length - 1] })
    };
} else {
    const firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
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
    if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
        await signInWithCustomToken(auth, window.__initial_auth_token);
    } else {
        await signInAnonymously(auth);
    }
};

onAuthStateChanged(auth, (user) => {
    window.appState.user = user;
    if (user) loadData();
});

const loadData = () => {
    if (isMock) {
        db.onSnapshot({}, (snapshot) => {
            window.appState.projects = snapshot.docs.map(doc => ({ ...doc.data() }));
            renderApp();
        });
        return;
    }
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    onSnapshot(q, (snapshot) => {
        window.appState.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderApp();
    }, (error) => console.error("Error loading data", error));
};

const saveProject = async (projectData) => {
    if (!window.appState.user) return;
    const payload = { ...projectData, status: 'Idea', createdAt: new Date().toISOString() };
    if (isMock) await db.addDoc({}, payload);
    else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), payload);
};

const updateProject = async (projectId, newData) => {
    if (!window.appState.user) return;
    if (isMock) await db.updateDoc({ id: projectId }, newData);
    else await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projectId), newData);
};

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
window.toggleFinalizado = (isExportado) => {
    const select = document.getElementById('statusSelect');
    const hint = document.getElementById('statusHint');
    if (!select) return;
    const finOption = Array.from(select.options).find(o => o.value === 'Finalizado');
    if (finOption) {
        finOption.disabled = !isExportado;
        if (!isExportado && select.value === 'Finalizado') select.value = 'Producción';
    }
    if (hint) hint.classList.toggle('hidden', isExportado);
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
            <div class="p-6 max-w-6xl mx-auto">
                <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 class="text-4xl font-bold text-[#581845]">AV Content Planner</h1>
                        <p class="text-gray-500">Pipeline de Producción</p>
                    </div>
                    <button id="btnNewIdea" class="bg-[#C70039] text-white px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform">
                        + Nueva Idea
                    </button>
                </header>

                <div class="mb-6 flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div class="relative flex-1 w-full">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Buscar por proyecto o encargado..." class="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-[#C70039]">
                    </div>
                    <div class="flex items-center gap-2 w-full md:w-auto">
                        <label class="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Ordenar:</label>
                        <select id="sortSelect" class="bg-gray-50 border-none rounded-xl text-sm py-2 px-4 focus:ring-2 focus:ring-[#C70039]">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''}>Recientes</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''}>Título</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''}>Estatus</option>
                        </select>
                    </div>
                </div>

                <div class="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="hidden md:grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-widest">
                        <div class="col-span-1 text-center">Status</div>
                        <div class="col-span-4">Proyecto / Encargados</div>
                        <div class="col-span-2">Progreso</div>
                        <div class="col-span-3">Fecha</div>
                        <div class="col-span-2 text-right">Acción</div>
                    </div>
                    <div class="divide-y divide-gray-50">
                        ${filteredProjects.map(p => `
                            <div data-id="${p.id}" class="project-row grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 cursor-pointer transition-colors">
                                <div class="col-span-2 md:col-span-1 text-2xl text-center">${getStatusIcon(p.status)}</div>
                                <div class="col-span-10 md:col-span-4">
                                    <h3 class="font-bold text-gray-800">${p.title}</h3>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-500">${p.category}</span>
                                        ${p.team ? `<span class="text-[10px] text-[#C70039] font-medium">👥 ${p.team}</span>` : ''}
                                    </div>
                                </div>
                                <div class="col-span-12 md:col-span-2">
                                    <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                        <div class="bg-[#C70039] h-full transition-all duration-1000" style="width: ${getStatusProgress(p.status)}%"></div>
                                    </div>
                                    <span class="text-[9px] font-bold text-gray-400 uppercase mt-1 block">${p.status}</span>
                                </div>
                                <div class="hidden md:block col-span-3 text-sm text-gray-400">${new Date(p.createdAt).toLocaleDateString()}</div>
                                <div class="col-span-12 md:col-span-2 text-right text-[#C70039] font-bold text-sm">Gestionar ➔</div>
                            </div>
                        `).join('')}
                    </div>
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
            <div class="p-6 max-w-2xl mx-auto">
                <button id="btnBackToDashboard" class="text-gray-500 mb-6 flex items-center hover:text-[#581845]"><span class="mr-2">←</span> Volver</button>
                <div class="bg-white p-8 rounded-3xl shadow-xl">
                    <h2 class="text-3xl font-bold mb-6 text-[#581845]">Capturar Nueva Idea</h2>
                    <form id="ideaForm" class="space-y-4">
                        <div><label class="block text-sm font-bold text-gray-700 mb-1">Título</label><input type="text" id="title" required class="w-full p-3 bg-gray-50 rounded-xl border-none"></div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                            <select id="category" class="w-full p-3 bg-gray-50 rounded-xl border-none">
                                <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                            </select>
                        </div>
                        <div><label class="block text-sm font-bold text-gray-700 mb-1">Descripción</label><textarea id="description" rows="3" required class="w-full p-3 bg-gray-50 rounded-xl border-none"></textarea></div>
                        <button type="submit" class="w-full bg-[#581845] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#900C3F]">Guardar</button>
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
            <div class="p-6 max-w-6xl mx-auto">
                <button id="btnBackToDashboardDetail" class="text-gray-500 mb-6 flex items-center hover:text-[#581845]"><span class="mr-2">←</span> Volver</button>
                <div class="mb-12">
                    <h1 class="text-4xl font-bold text-[#581845] mb-8">${p.title}</h1>
                    <div class="relative px-4">
                        <div class="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2"></div>
                        <div class="absolute top-1/2 left-0 h-1 bg-[#C70039] -translate-y-1/2 transition-all duration-500" style="width: ${(currentIndex / (stages.length - 1)) * 100}%"></div>
                        <div class="relative flex justify-between">
                            ${stages.map((stage, i) => `<div class="flex flex-col items-center">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center z-10 ${i <= currentIndex ? 'bg-[#C70039] text-white' : 'bg-white border-2 border-gray-200 text-gray-300'}">${i <= currentIndex ? '✓' : i + 1}</div>
                                <span class="mt-2 text-[10px] font-bold uppercase ${i === currentIndex ? 'text-[#C70039]' : 'text-gray-400'}">${stage}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="lg:col-span-2 space-y-6">
                        <!-- SCRIPTING (Siempre accesible) -->
                        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                            <h3 class="font-bold text-xl mb-6 text-[#581845] flex items-center"><span class="mr-2">📝</span> Scripting (Guion)</h3>
                            <div class="transition-all">
                                <label class="text-xs font-bold text-gray-400 uppercase tracking-widest">Guion Literario</label>
                                <div id="scriptContent" class="bg-gray-50 p-4 rounded-xl mt-2 text-sm text-gray-600 min-h-[200px] outline-none border border-transparent focus:border-[#C70039] focus:bg-white transition-all shadow-inner" contenteditable="true" oninput="window.saveScriptRealtime('${p.id}', this.innerText)">
                                    ${p.script || 'Escribe aquí el guion literario de tu video...'}
                                </div>
                            </div>
                        </div>

                        <!-- STORYBOARD -->
                        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 ${currentIndex < 2 ? 'opacity-20 grayscale pointer-events-none' : ''}">
                            <h3 class="font-bold text-xl mb-4 text-[#581845] flex items-center"><span class="mr-2">🎨</span> Storyboard</h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                ${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-square bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#C70039] relative group">
                                    <img src="${img}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><span class="text-white text-2xl">🔍</span></div>
                                </div>`).join('')}
                                <div onclick="document.getElementById('sbUpload').click()" class="aspect-square bg-gray-50 rounded-xl flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 hover:border-[#C70039] cursor-pointer">
                                    <span class="text-3xl">+</span><span class="text-[10px] font-bold uppercase mt-1">Imágenes</span>
                                </div>
                                <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')">
                            </div>
                        </div>

                        <!-- PRODUCCION -->
                        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 ${currentIndex < 3 ? 'opacity-20 grayscale pointer-events-none' : ''}">
                            <h3 class="font-bold text-xl mb-4 text-[#581845] flex items-center"><span class="mr-2">🎬</span> Producción</h3>
                            <div class="mb-4">
                                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Archivos RAW (Drive)</label>
                                <input type="url" id="prodRawLink" value="${prod.rawLink || ''}" class="w-full p-3 bg-gray-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-[#C70039]" placeholder="https://drive.google.com/...">
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-5 h-5 text-[#C70039] rounded focus:ring-[#C70039]"><span class="text-sm font-bold">Montaje</span>
                                </label>
                                <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-5 h-5 text-[#C70039] rounded focus:ring-[#C70039]"><span class="text-sm font-bold">Edición</span>
                                </label>
                                <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-5 h-5 text-[#C70039] rounded focus:ring-[#C70039]"><span class="text-sm font-bold">Subtitulado</span>
                                </label>
                                <label class="flex items-center gap-3 p-3 rounded-xl bg-red-50 cursor-pointer">
                                    <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-5 h-5 text-[#C70039] rounded focus:ring-[#C70039]"><span class="text-sm font-bold text-[#C70039]">Exportado</span>
                                </label>
                            </div>
                        </div>

                        <!-- FINALIZADO -->
                        <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-3xl border border-green-100 ${(currentIndex < 4 && !prod.exportado) ? 'opacity-20 grayscale pointer-events-none' : ''}">
                            <h3 class="font-bold text-xl mb-4 text-green-900 flex items-center"><span class="mr-2">🚀</span> Finalizado y Publicación</h3>
                            <div class="space-y-4">
                                <div><label class="block text-xs font-bold text-green-800 uppercase mb-1">Video Final (Drive)</label><input type="url" id="metaFinalLink" value="${meta.finalLink || ''}" class="w-full p-3 bg-white/60 rounded-xl border-green-200"></div>
                                <div class="grid md:grid-cols-2 gap-4">
                                    <div><label class="block text-xs font-bold text-green-800 uppercase mb-1">Título</label><input type="text" id="metaTitle" value="${meta.title || ''}" class="w-full p-3 bg-white/60 rounded-xl border-green-200"></div>
                                    <div><label class="block text-xs font-bold text-green-800 uppercase mb-1">Tags</label><input type="text" id="metaTags" value="${meta.tags || ''}" class="w-full p-3 bg-white/60 rounded-xl border-green-200"></div>
                                </div>
                                <div><label class="block text-xs font-bold text-green-800 uppercase mb-1">Descripción</label><textarea id="metaDesc" rows="3" class="w-full p-3 bg-white/60 rounded-xl border-green-200">${meta.description || ''}</textarea></div>
                                <div><label class="block text-xs font-bold text-green-800 uppercase mb-1">URL Publicado</label><input type="url" id="metaPublishedUrl" value="${meta.publishedUrl || ''}" class="w-full p-3 bg-white font-bold text-green-700 rounded-xl border-green-300 shadow-sm" placeholder="https://tiktok.com/..."></div>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-6">
                        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                            <h3 class="font-bold text-xl mb-6 text-[#581845]">Gestión</h3>
                            <div class="space-y-4">
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Encargados</label><input type="text" id="teamInput" value="${p.team || ''}" class="w-full p-3 bg-gray-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-[#C70039]"></div>
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Deadline</label><input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="w-full p-3 bg-gray-50 rounded-xl border-none text-sm"></div>
                                <div class="pt-4 border-t">
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Estado</label>
                                    <select id="statusSelect" class="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-bold text-[#581845] focus:border-[#C70039] outline-none">
                                        ${stages.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''} ${(s === 'Finalizado' && !prod.exportado && p.status !== 'Finalizado') ? 'disabled' : ''}>${s}</option>`).join('')}
                                    </select>
                                    <p id="statusHint" class="text-[10px] text-[#C70039] mt-2 font-bold ${prod.exportado || p.status === 'Finalizado' ? 'hidden' : 'block'}">⚠️ Marca 'Exportado' para Finalizar.</p>
                                </div>
                            </div>
                            <button id="btnSaveDetail" class="w-full mt-6 bg-[#581845] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#C70039] transition-all shadow-lg">Guardar Cambios</button>
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
