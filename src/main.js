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
            status: p.status || p.estado
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
    if (!confirm("¿Estás seguro de que deseas eliminar este proyecto?")) return;
    
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
    const stages = ['Idea', 'Guionizado', 'Storyboard', 'Producción', 'Finalizado'];
    const idx = stages.indexOf(status);
    return idx === -1 ? 20 : ((idx + 1) / stages.length) * 100;
};

const getStatusBadge = (status) => {
    const config = {
        'Idea': { bg: 'bg-white', text: 'text-brand-dark', icon: '💡' },
        'Guionizado': { bg: 'bg-white', text: 'text-brand-dark', icon: '📝' },
        'Storyboard': { bg: 'bg-white', text: 'text-brand-dark', icon: '🎨' },
        'Producción': { bg: 'bg-brand-primary', text: 'text-white', icon: '🎬' },
        'Finalizado': { bg: 'bg-brand-accent', text: 'text-brand-dark', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-white', text: 'text-brand-dark', icon: '❓' };
    return `<span class="swiss-badge ${c.bg} ${c.text} border border-brand-hairline shadow-sm">
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
        root.innerHTML = \`
            <div class="flex items-center justify-center min-h-screen p-10 bg-brand-paper text-brand-dark">
                <div class="max-w-md w-full border-2 border-brand-hairline bg-white p-12 rounded-2xl shadow-soft">
                    <div class="mb-12">
                        <div class="w-12 h-1.5 bg-brand-primary mb-6"></div>
                        <h1 class="text-4xl font-bold tracking-tight leading-tight">Puntaje<br>Nacional</h1>
                        <p class="text-[12px] font-semibold uppercase tracking-[0.2em] mt-3 text-brand-gray">Terminal de Producción AV</p>
                    </div>
                    
                    <form id="loginForm" class="space-y-8">
                        <div>
                            <label class="block text-[11px] font-bold uppercase tracking-widest text-brand-dark mb-3">ID de Operador</label>
                            <input type="text" id="userNameInput" required placeholder="Tu nombre..." class="swiss-input border-brand-hairline focus:border-brand-primary">
                        </div>
                        <button type="submit" class="btn-swiss-primary w-full flex items-center justify-between group py-5 px-8">
                            <span class="font-bold">Acceder al Sistema</span>
                            <span class="group-hover:translate-x-1 transition-transform opacity-70">→</span>
                        </button>
                    </form>
                    
                    <div class="mt-16 pt-6 border-t border-brand-hairline text-center">
                        <p class="text-[10px] font-bold uppercase tracking-widest text-brand-gray/60 italic">Herramienta Interna v3.5 SOBERANA</p>
                    </div>
                </div>
            </div>
        \`;
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
                const stages = ['Idea', 'Guionizado', 'Storyboard', 'Producción', 'Finalizado'];
                return stages.indexOf(b.status) - stages.indexOf(a.status);
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        root.innerHTML = \`
            <div class="p-8 md:p-12 max-w-[1400px] mx-auto min-h-screen">
                <header class="mb-16 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b-2 border-brand-hairline pb-12">
                    <div class="flex-1">
                        <h1 class="text-3xl font-bold text-brand-dark tracking-tight mb-2 uppercase">Panel de Producción</h1>
                        <div class="flex items-center gap-3">
                            <span class="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></span>
                            <p class="text-[12px] font-bold text-brand-gray tracking-wide">Operador: <span class="text-brand-dark underline">\${window.appState.userName}</span></p>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex items-center gap-2 border-2 border-brand-hairline bg-white px-5 py-2.5 rounded-lg focus-within:border-brand-primary focus-within:ring-4 focus-within:ring-brand-primary/5 transition-all shadow-sm">
                            <span class="text-sm">🔍</span>
                            <input type="text" id="searchInput" value="\${window.appState.searchQuery}" placeholder="Filtrar proyectos..." class="bg-transparent outline-none font-semibold text-brand-dark text-sm w-48">
                        </div>
                        <select id="sortSelect" class="bg-white border-2 border-brand-hairline text-[12px] font-bold px-5 py-3 rounded-lg outline-none cursor-pointer hover:border-brand-primary transition-colors text-brand-dark shadow-sm">
                            <option value="date" \${window.appState.sortBy === 'date' ? 'selected' : ''}>MÁS RECIENTE</option>
                            <option value="title" \${window.appState.sortBy === 'title' ? 'selected' : ''}>ALFABÉTICO</option>
                            <option value="status" \${window.appState.sortBy === 'status' ? 'selected' : ''}>ETAPA PIPELINE</option>
                        </select>
                        <button id="btnNewIdea" class="btn-swiss-primary shadow-lg">+ NUEVO PROYECTO</button>
                        <button onclick="location.reload()" class="btn-swiss-outline border-2 font-bold px-6">SALIR</button>
                    </div>
                </header>

                <div class="space-y-4">
                    <div class="list-header hidden md:flex px-6 mb-2">
                        <div class="flex-1 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray">PROYECTO Y REFERENCIA</div>
                        <div class="w-32 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray">ESTRATEGIA</div>
                        <div class="w-40 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray text-center">ESTADO</div>
                        <div class="w-40 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray">RESPONSABLE</div>
                        <div class="w-48 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray">AVANCE</div>
                    </div>

                    \${filteredProjects.map(p => {
                        const progress = getStatusProgress(p.status);
                        return \`
                            <div data-id="\${p.id}" class="project-row list-row group border-2 hover:border-brand-primary shadow-sm hover:shadow-md bg-white">
                                <div class="list-row-active-accent w-2"></div>
                                <div class="flex-1 flex flex-col gap-0.5">
                                    <span class="text-[10px] font-bold text-brand-primary uppercase tracking-wider">\${p.id.startsWith('id-') ? 'NUEVO' : 'REF-' + p.id.substring(0,6)}</span>
                                    <h3 class="text-lg font-bold text-brand-dark group-hover:text-brand-primary transition-colors">\${p.title}</h3>
                                </div>
                                
                                <div class="w-32 shrink-0">
                                    <span class="swiss-badge bg-brand-light text-brand-dark border-brand-hairline font-bold text-[10px]">\${p.category}</span>
                                </div>

                                <div class="w-40 shrink-0 text-center">
                                    \${getStatusBadge(p.status)}
                                </div>

                                <div class="w-40 shrink-0 flex flex-col justify-center">
                                    <span class="text-xs font-bold text-brand-dark truncate">\${p.team || '---'}</span>
                                    <span class="text-[10px] font-medium text-brand-gray mt-0.5">\${new Date(p.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div class="w-48 shrink-0 flex items-center gap-4">
                                    <div class="flex-1 h-2 bg-brand-hairline overflow-hidden rounded-full border border-brand-hairline">
                                        <div class="h-full bg-brand-primary transition-all duration-1000 shadow-inner" style="width: \${progress}%"></div>
                                    </div>
                                    <span class="text-[11px] font-bold text-brand-dark w-10 text-right">\${Math.round(progress)}%</span>
                                </div>
                                
                                <div class="w-8 h-8 flex items-center justify-center text-brand-primary opacity-30 group-hover:opacity-100 transition-all text-2xl font-bold">
                                    →
                                </div>
                            </div>
                        \`;
                    }).join('')}
                    
                    \${filteredProjects.length === 0 ? \`
                        <div class="py-32 text-center border-2 border-dashed border-brand-hairline bg-white rounded-2xl">
                            <p class="text-brand-gray font-bold text-lg italic uppercase tracking-widest">No se encontraron proyectos activos</p>
                        </div>
                    \` : ''}
                </div>
            </div>
        \`;
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
        root.innerHTML = \`
            <div class="p-10 md:p-20 max-w-4xl mx-auto min-h-screen bg-brand-paper text-brand-dark">
                <button id="btnBackToDashboard" class="btn-swiss-outline border-2 font-bold text-xs mb-16 shadow-sm">← VOLVER AL PANEL</button>
                
                <div class="mb-16">
                    <div class="w-20 h-4 bg-brand-accent mb-6 shadow-sm"></div>
                    <h2 class="text-7xl font-bold tracking-tighter leading-none mb-4 uppercase">NUEVA<br>INICIATIVA</h2>
                    <p class="text-sm font-bold uppercase tracking-[0.5em] text-brand-gray underline underline-offset-8">Registro de Producción</p>
                </div>

                <form id="ideaForm" class="space-y-16 bg-white p-12 rounded-3xl border-2 border-brand-hairline shadow-soft">
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-[0.3em] text-brand-primary mb-4">Título del Concepto</label>
                        <input type="text" id="title" required class="swiss-input uppercase text-2xl border-b-4 focus:border-brand-primary" placeholder="EJ: CAMPAÑA INVIERNO">
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div>
                            <label class="block text-[11px] font-bold uppercase tracking-[0.3em] text-brand-primary mb-4">Estrategia / Categoría</label>
                            <select id="category" class="swiss-input uppercase cursor-pointer border-b-4">
                                <option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold uppercase tracking-[0.3em] text-brand-primary mb-4">Lead de Producción</label>
                            <input type="text" id="team" class="swiss-input uppercase border-b-4" placeholder="NOMBRE DEL LÍDER...">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-[0.3em] text-brand-primary mb-4">Brief Estratégico</label>
                        <textarea id="description" rows="4" required class="swiss-input font-medium text-xl leading-relaxed border-2 rounded-xl p-6" placeholder="DESCRIBA LOS OBJETIVOS Y EL CORE DEL CONTENIDO..."></textarea>
                    </div>
                    
                    <button type="submit" class="btn-swiss-primary w-full py-10 text-2xl font-bold uppercase tracking-widest shadow-xl transform hover:-translate-y-1 active:scale-95 transition-all">Lanzar Iniciativa 🚀</button>
                </form>
            </div>
        \`;
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

        root.innerHTML = \`
            <div class="p-8 md:p-12 max-w-[1600px] mx-auto min-h-screen bg-brand-paper text-brand-dark">
                <div class="flex justify-between items-center mb-12">
                    <button id="btnBackToDashboardDetail" class="btn-swiss-outline border-2 font-bold text-xs shadow-sm">← PANEL GENERAL</button>
                    <div class="flex items-center gap-4">
                         <span class="text-[11px] font-bold uppercase tracking-widest text-brand-gray">Última Edición:</span>
                         <span class="text-[11px] font-bold bg-brand-dark text-white px-3 py-1 rounded uppercase">\${p.lastEditor || 'Sistema'}</span>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 xl:grid-cols-5 gap-12 items-start">
                    <!-- Sidebar Informativo -->
                    <div class="xl:col-span-2 space-y-8 sticky top-12">
                        <div class="bg-white p-10 rounded-3xl border-2 border-brand-hairline shadow-soft space-y-8">
                            <div class="flex items-center gap-4">
                                \${getStatusBadge(p.status)}
                                <span class="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gray">REF: \${p.id.substring(0,8)}</span>
                            </div>
                            
                            <h1 class="text-5xl md:text-7xl font-bold tracking-tighter leading-[0.95] uppercase break-words">\${p.title}</h1>
                            
                            <p class="text-lg font-medium text-brand-gray leading-relaxed">\${p.description}</p>
                            
                            <div class="grid grid-cols-2 gap-4 border-t-2 border-brand-hairline pt-8">
                                <div>
                                    <p class="text-[9px] font-bold text-brand-gray uppercase tracking-widest mb-1">Categoría</p>
                                    <p class="font-bold text-sm uppercase">\${p.category}</p>
                                </div>
                                <div>
                                    <p class="text-[9px] font-bold text-brand-gray uppercase tracking-widest mb-1">Líder</p>
                                    <p class="font-bold text-sm uppercase">\${p.team || 'Sin asignar'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Navegación de Pestañas Mejorada -->
                        <div class="flex flex-col gap-3">
                            <button onclick="window.setTab('guion')" class="detail-nav-btn \${activeTab === 'guion' ? 'active' : ''}">
                                <span class="num">01</span>
                                <span class="label">GUION NARRATIVO</span>
                                <span class="icon">📝</span>
                            </button>
                            <button onclick="window.setTab('storyboard')" class="detail-nav-btn \${activeTab === 'storyboard' ? 'active' : ''}">
                                <span class="num">02</span>
                                <span class="label">REGISTRO VISUAL</span>
                                <span class="icon">🎨</span>
                            </button>
                            <button onclick="window.setTab('produccion')" class="detail-nav-btn \${activeTab === 'produccion' ? 'active' : ''}">
                                <span class="num">03</span>
                                <span class="label">POST-PRODUCCIÓN</span>
                                <span class="icon">🎬</span>
                            </button>
                            <button onclick="window.setTab('gestion')" class="detail-nav-btn \${activeTab === 'gestion' ? 'active' : ''}">
                                <span class="num">04</span>
                                <span class="label">AJUSTES Y CIERRE</span>
                                <span class="icon">⚙️</span>
                            </button>
                        </div>
                    </div>

                    <!-- Área de Trabajo -->
                    <div class="xl:col-span-3 min-h-[800px]">
                        <div class="bg-white rounded-3xl border-2 border-brand-hairline shadow-focus overflow-hidden">
                            \${activeTab === 'guion' ? \`
                                <div class="p-8 border-b-2 border-brand-hairline bg-brand-light flex justify-between items-center">
                                    <h3 class="text-xl font-bold uppercase tracking-widest">Editor de Texto Técnico</h3>
                                    <div class="flex gap-2">
                                        <button onclick="window.formatScriptBold()" class="btn-swiss-outline py-2 px-4 text-[10px] font-bold bg-white">NEGRITA</button>
                                        <button onclick="window.insertSceneCut()" class="btn-swiss-outline py-2 px-4 text-[10px] font-bold bg-white underline">CORTE</button>
                                        <button onclick="window.printScript()" class="btn-swiss-primary py-2 px-6 text-[10px] font-bold">IMPRIMIR</button>
                                    </div>
                                </div>
                                <div id="scriptContent" class="p-12 text-xl text-brand-dark min-h-[900px] outline-none font-mono leading-relaxed bg-brand-paper/50" contenteditable="true">
                                    \${p.script || 'ESCENA 01 - ...'}
                                </div>
                            \` : ''}

                            \${activeTab === 'storyboard' ? \`
                                <div class="p-12">
                                    <h3 class="text-3xl font-bold uppercase tracking-tighter mb-8">Storyboard / Referencias</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        \${images.map((img, idx) => \`<div onclick="window.openLightbox(\{idx})" class="aspect-video bg-brand-light border-2 border-brand-dark group relative cursor-pointer overflow-hidden rounded-xl shadow-sm">
                                            <img src="\${img}" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 scale-105 group-hover:scale-100">
                                            <div class="absolute bottom-0 left-0 bg-brand-dark text-white text-[9px] font-bold px-4 py-2 uppercase tracking-widest">Frame \${idx+1}</div>
                                        </div>\`).join('')}
                                        <div onclick="document.getElementById('sbUpload').click()" class="aspect-video border-4 border-dashed border-brand-hairline flex flex-col items-center justify-center cursor-pointer hover:bg-brand-primary hover:text-white transition-all group rounded-xl">
                                            <span class="text-6xl font-bold mb-4 group-hover:rotate-90 transition-transform">+</span>
                                            <span class="text-xs font-bold uppercase tracking-[0.3em]">Añadir Frame</span>
                                        </div>
                                        <input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '\${p.id}')">
                                    </div>
                                </div>
                            \` : ''}

                            \${activeTab === 'produccion' ? \`
                                <div class="p-12 space-y-12">
                                    <h3 class="text-4xl font-bold tracking-tighter uppercase">Calidad y Entrega</h3>
                                    <div class="grid grid-cols-1 gap-6">
                                        <label class="flex items-center gap-8 p-12 border-2 border-brand-hairline rounded-2xl cursor-pointer hover:bg-brand-light transition-all shadow-sm">
                                            <input type="checkbox" id="chkMontaje" \${prod.montaje ? 'checked' : ''} class="w-10 h-10 accent-brand-primary">
                                            <div class="flex flex-col">
                                                <span class="text-2xl font-bold uppercase tracking-tighter">Montaje Base</span>
                                                <span class="text-xs font-medium text-brand-gray uppercase">Sincronización inicial y estructura narrativa</span>
                                            </div>
                                        </label>
                                        <label class="flex items-center gap-8 p-12 border-2 border-brand-hairline rounded-2xl cursor-pointer hover:bg-brand-light transition-all shadow-sm">
                                            <input type="checkbox" id="chkEdicion" \${prod.edicion ? 'checked' : ''} class="w-10 h-10 accent-brand-primary">
                                            <div class="flex flex-col">
                                                <span class="text-2xl font-bold uppercase tracking-tighter">Color & Mix</span>
                                                <span class="text-xs font-medium text-brand-gray uppercase">Corrección cromática y post de audio</span>
                                            </div>
                                        </label>
                                        <label class="flex items-center gap-8 p-12 border-2 border-brand-hairline rounded-2xl cursor-pointer hover:bg-brand-light transition-all shadow-sm">
                                            <input type="checkbox" id="chkSubtitulado" \${prod.subtitulado ? 'checked' : ''} class="w-10 h-10 accent-brand-primary">
                                            <div class="flex flex-col">
                                                <span class="text-2xl font-bold uppercase tracking-tighter">Gráficas & Subs</span>
                                                <span class="text-xs font-medium text-brand-gray uppercase">Motion graphics, títulos y subtítulos</span>
                                            </div>
                                        </label>
                                        <label class="flex items-center gap-8 p-12 border-4 border-brand-accent rounded-2xl cursor-pointer hover:bg-brand-accent/5 transition-all shadow-md bg-brand-accent/5">
                                            <input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" \${prod.exportado ? 'checked' : ''} class="w-10 h-10 accent-brand-primary">
                                            <div class="flex flex-col">
                                                <span class="text-2xl font-bold uppercase tracking-tighter text-brand-primary">Exportación Final</span>
                                                <span class="text-xs font-bold text-brand-accent uppercase italic">Habilita el estado "Finalizado" para entrega</span>
                                            </div>
                                        </label>
                                    </div>
                                    <div class="pt-8 text-center">
                                        <button id="btnSyncProd" class="btn-swiss-primary px-12 py-5 text-lg font-bold">GUARDAR PROGRESO</button>
                                    </div>
                                </div>
                            \` : ''}

                            \${activeTab === 'gestion' ? \`
                                <div class="p-12 space-y-16">
                                    <h3 class="text-4xl font-bold tracking-tighter uppercase">Administración de Pipeline</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        <div>
                                            <label class="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray mb-4">Asignar Líder</label>
                                            <input type="text" id="teamInput" value="\${p.team || ''}" class="swiss-input uppercase border-b-2 font-bold">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray mb-4">Fecha Límite</label>
                                            <input type="date" id="dueDateInput" value="\${p.dueDate || ''}" class="swiss-input border-b-2 font-bold">
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray mb-4">Estado del Proceso</label>
                                        <select id="statusSelect" class="swiss-input uppercase border-b-2 font-bold text-xl">
                                            <option value="Idea" \${p.status === 'Idea' ? 'selected' : ''}>Idea</option>
                                            <option value="Guionizado" \${p.status === 'Guionizado' ? 'selected' : ''}>Guionizado</option>
                                            <option value="Storyboard" \${p.status === 'Storyboard' ? 'selected' : ''}>Storyboard</option>
                                            <option value="Producción" \${p.status === 'Producción' ? 'selected' : ''}>Producción</option>
                                            <option value="Finalizado" \${p.status === 'Finalizado' ? 'selected' : ''} \${!prod.exportado && p.status !== 'Finalizado' ? 'disabled' : ''}>✅ Finalizado</option>
                                        </select>
                                    </div>
                                    <div class="flex flex-col md:flex-row gap-6 pt-12">
                                        <button id="btnSaveDetail" class="btn-swiss-primary flex-1 py-10 text-2xl font-bold uppercase tracking-widest shadow-xl">Sincronizar Datos ⚡</button>
                                        <button onclick="window.deleteProject('\${p.id}')" class="btn-swiss-outline px-12 py-10 text-brand-accent border-brand-accent border-2 font-bold hover:bg-brand-accent hover:text-white transition-all uppercase tracking-widest">Eliminar</button>
                                    </div>
                                </div>
                            \` : ''}
                        </div>
                    </div>
                </div>

                \${window.appState.lightbox ? \`
                    <div class="fixed inset-0 bg-brand-dark/95 z-[100] flex items-center justify-center p-20 backdrop-blur-md" onclick="window.appState.lightbox = null; renderApp();">
                        <img src="\${window.appState.lightbox}" class="max-w-full max-h-full border-8 border-white shadow-2xl rounded-lg">
                        <button class="absolute top-10 right-10 text-white text-6xl font-bold hover:scale-110 transition-transform">&times;</button>
                    </div>
                \` : ''}
            </div>
        \`;

        document.getElementById('btnBackToDashboardDetail').onclick = () => window.setView('dashboard');
        
        const syncAction = async () => {
            const newStatus = document.getElementById('statusSelect') ? document.getElementById('statusSelect').value : p.status;
            const newTeam = document.getElementById('teamInput') ? document.getElementById('teamInput').value : p.team;
            const newDueDate = document.getElementById('dueDateInput') ? document.getElementById('dueDateInput').value : p.dueDate;
            
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
            
            if (activeTab === 'gestion') window.setView('dashboard');
            else renderApp();
        };

        if (document.getElementById('btnSaveDetail')) document.getElementById('btnSaveDetail').onclick = syncAction;
        if (document.getElementById('btnSyncProd')) document.getElementById('btnSyncProd').onclick = syncAction;

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
    history.pushState({ view }, '', \`#\${view}\`);
    renderApp(); 
};

window.viewDetail = (id) => { 
    window.appState.currentProject = window.appState.projects.find(p => p.id === id); 
    window.appState.view = 'detail'; 
    window.appState.activeTab = 'guion';
    history.pushState({ view: 'detail', projectId: id }, '', \`#detail-\${id}\`);
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
