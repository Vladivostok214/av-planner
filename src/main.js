import './style.css';

// --- Backend Configuration (Google Sheets) ---
const sheetsUrl = import.meta.env.VITE_SHEETS_API_URL;
const isSheets = !!sheetsUrl;

const loadData = async () => {
    if (!isSheets) {
        console.warn("🏠 Modo LOCAL (localStorage): No se detectó URL de Google Sheets.");
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
        window.appState.projects = data;
        renderApp();
        return;
    }

    try {
        const resp = await fetch(sheetsUrl);
        const data = await resp.json();
                    const projects = data.map(p => ({
                        ...p,
                        status: p.status || p.estado // Maps 'estado' from Sheets to 'status' for UI
                    }));
        
        window.appState.projects = projects;
        
        if (window.appState.view === 'detail' && window.appState.currentProject) {
            const updated = projects.find(p => p.id === window.appState.currentProject.id);
            if (updated) window.appState.currentProject = updated;
        }
        renderApp();
    } catch (e) { 
        console.error("Sheets Load Error:", e); 
    }
};

// Automatic refresh for Sheets
if (isSheets) {
    console.log("📊 Modo SOBERANO (Google Sheets) activo.");
    setInterval(loadData, 30000);
}

const saveProject = async (projectData) => {
    const payload = { ...projectData, status: 'Idea', createdAt: new Date().toISOString(), lastEditor: window.appState.userName || 'Anónimo' };
    
    if (isSheets) {
        const fullPayload = { action: 'save', ...payload, id: 'id-' + Date.now() };
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(fullPayload) });
        setTimeout(loadData, 1000);
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const newDoc = { ...payload, id: 'local-' + Date.now() };
        current.push(newDoc);
        localStorage.setItem('av_planner_projects', JSON.stringify(current));
        loadData();
    }
};

const updateProject = async (projectId, newData) => {
    const payload = { ...newData, lastEditor: window.appState.userName || 'Anónimo' };
    
    if (isSheets) {
        const fullPayload = { action: 'update', id: projectId, ...payload };
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(fullPayload) });
        setTimeout(loadData, 1000);
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const index = current.findIndex(p => p.id === projectId);
        if (index !== -1) {
            current[index] = { ...current[index], ...payload };
            localStorage.setItem('av_planner_projects', JSON.stringify(current));
            loadData();
        }
    }
};

const deleteProject = async (projectId) => {
    if (!confirm("¿Estás seguro?")) return;
    
    if (isSheets) {
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: projectId }) });
        setTimeout(loadData, 1000);
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const filtered = current.filter(p => p.id !== projectId);
        localStorage.setItem('av_planner_projects', JSON.stringify(filtered));
        loadData();
    }
    window.setView('dashboard');
};

window.appState = {
    user: { uid: 'sovereign-user' },
    userName: '', 
    projects: [],
    currentProject: null,
    view: 'dashboard',
    searchQuery: '',
    sortBy: 'date',
    lightbox: null,
    activeTab: 'guion'
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

const renderApp = () => {
    const root = document.getElementById('app');
    
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
            <div class="flex items-center justify-center min-h-screen p-10 bg-brand-paper">
                <div class="max-w-md w-full border border-brand-hairline bg-white p-12 rounded-xl shadow-soft">
                    <div class="mb-12">
                        <div class="w-8 h-1 bg-brand-primary mb-6"></div>
                        <h1 class="text-3xl font-semibold text-brand-dark tracking-tight leading-tight">Puntaje<br>Nacional</h1>
                        <p class="text-[11px] font-medium uppercase tracking-[0.2em] mt-3 text-brand-gray">AV Content Pipeline / Terminal</p>
                    </div>
                    
                    <form id="loginForm" class="space-y-8">
                        <div>
                            <label class="block text-[10px] font-semibold uppercase tracking-widest text-brand-gray mb-3">Operator ID</label>
                            <input type="text" id="userNameInput" required placeholder="Your name" class="swiss-input">
                        </div>
                        <button type="submit" class="btn-swiss-primary w-full flex items-center justify-between group">
                            <span>Access System</span>
                            <span class="group-hover:translate-x-1 transition-transform opacity-40">→</span>
                        </button>
                    </form>
                    
                    <div class="mt-16 pt-6 border-t border-brand-hairline">
                        <p class="text-[9px] font-medium uppercase tracking-widest text-brand-gray/60 italic">Internal Production Tool v3.0</p>
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
            <div class="p-8 md:p-12 max-w-[1400px] mx-auto min-h-screen">
                <header class="mb-16 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-brand-hairline pb-12">
                    <div class="flex-1">
                        <h1 class="text-2xl font-semibold text-brand-dark tracking-tight mb-2">Content Pipeline</h1>
                        <div class="flex items-center gap-3">
                            <span class="w-1.5 h-1.5 bg-brand-primary rounded-full"></span>
                            <p class="text-[11px] font-medium text-brand-gray tracking-wide">Operator: <span class="text-brand-dark">${window.appState.userName}</span></p>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="flex items-center gap-2 border border-brand-hairline bg-white px-4 py-2 rounded-md focus-within:border-brand-primary focus-within:ring-4 focus-within:ring-brand-primary/5 transition-all">
                            <span class="text-[10px] text-brand-gray">🔍</span>
                            <input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Filter projects..." class="bg-transparent outline-none font-medium text-brand-dark text-xs w-40">
                        </div>
                        <select id="sortSelect" class="bg-white border border-brand-hairline text-[11px] font-semibold px-4 py-2.5 rounded-md outline-none cursor-pointer hover:border-brand-gray transition-colors text-brand-gray">
                            <option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''}>Recent</option>
                            <option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''}>Alphabetical</option>
                            <option value="status" ${window.appState.sortBy === 'status' ? 'selected' : ''}>Pipeline Stage</option>
                        </select>
                        <button id="btnNewIdea" class="btn-swiss-primary">+ New Project</button>
                        <button onclick="location.reload()" class="btn-swiss-outline">Log Out</button>
                    </div>
                </header>

                <div class="space-y-3">
                    <div class="list-header hidden md:flex">
                        <div class="flex-1 text-[10px] font-semibold uppercase tracking-widest text-brand-gray/60">Project & Reference</div>
                        <div class="w-32 text-[10px] font-semibold uppercase tracking-widest text-brand-gray/60">Strategy</div>
                        <div class="w-32 text-[10px] font-semibold uppercase tracking-widest text-brand-gray/60 text-center">Status</div>
                        <div class="w-40 text-[10px] font-semibold uppercase tracking-widest text-brand-gray/60">Lead</div>
                        <div class="w-48 text-[10px] font-semibold uppercase tracking-widest text-brand-gray/60">Completion</div>
                    </div>

                    ${filteredProjects.map(p => {
                        const progress = getStatusProgress(p.status);
                        return `
                            <div data-id="${p.id}" class="project-row list-row group">
                                <div class="list-row-active-accent"></div>
                                <div class="flex-1 flex flex-col gap-0.5">
                                    <span class="text-[9px] font-semibold text-brand-primary uppercase tracking-wider">REF-${p.id.substring(0,6)}</span>
                                    <h3 class="text-base font-semibold text-brand-dark group-hover:text-brand-primary transition-colors">${p.title}</h3>
                                </div>
                                
                                <div class="w-32 shrink-0">
                                    <span class="swiss-badge">${p.category}</span>
                                </div>

                                <div class="w-32 shrink-0 text-center">
                                    ${getStatusBadge(p.status)}
                                </div>

                                <div class="w-40 shrink-0 flex flex-col">
                                    <span class="text-xs font-medium text-brand-dark truncate">${p.team || '---'}</span>
                                    <span class="text-[10px] text-brand-gray/60 mt-0.5">${new Date(p.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div class="w-48 shrink-0 flex items-center gap-4">
                                    <div class="flex-1 h-1.5 bg-brand-hairline overflow-hidden rounded-full">
                                        <div class="h-full bg-brand-primary transition-all duration-1000" style="width: ${progress}%"></div>
                                    </div>
                                    <span class="text-[10px] font-semibold text-brand-gray w-8 text-right">${Math.round(progress)}%</span>
                                </div>
                                
                                <div class="w-8 h-8 flex items-center justify-center text-brand-gray opacity-0 group-hover:opacity-100 group-hover:text-brand-primary transition-all text-xl font-bold">
                                    →
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${filteredProjects.length === 0 ? `
                        <div class="py-24 text-center border border-dashed border-brand-hairline bg-white rounded-lg">
                            <p class="text-brand-gray font-medium text-sm italic">No active projects found matching your search.</p>
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
    await loadData();
};
