import './style.css';

// --- Configuración de Backend (Google Sheets) ---
const sheetsUrl = import.meta.env.VITE_SHEETS_API_URL;
const isSheets = !!sheetsUrl;

// Variable global para pausar el refresco mientras el usuario edita
window.isEditing = false;

const loadData = async () => {
    // Si el usuario está editando, no sobreescribimos la memoria local
    if (window.isEditing) return;

    if (!isSheets) {
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
            status: p.status || p.estado || 'Idea',
            // Fix: Asegurar que la fecha sea válida o usar la actual como fallback
            createdAt: p.createdat || p.createdAt || new Date().toISOString()
        }));
        
        window.appState.projects = projects;
        
        if (window.appState.view === 'detail' && window.appState.currentProject) {
            const updated = projects.find(p => p.id === window.appState.currentProject.id);
            if (updated) window.appState.currentProject = updated;
        }
        renderApp();
    } catch (e) { 
        console.error("Error al cargar Sheets:", e); 
    }
};

// La carga de datos ahora es manual/inicial para evitar sobreescritura accidental
if (isSheets) {
    console.log("📊 Modo SOBERANO Activo (Carga inicial completada)");
}

const saveProject = async (projectData) => {
    const payload = { ...projectData, status: 'Idea', createdAt: new Date().toISOString(), lastEditor: window.appState.userName || 'Anónimo' };
    
    if (isSheets) {
        const fullPayload = { action: 'save', ...payload, id: 'id-' + Date.now() };
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(fullPayload) });
        setTimeout(loadData, 1500);
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
    
    // Actualización optimista inmediata
    const index = window.appState.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        window.appState.projects[index] = { ...window.appState.projects[index], ...payload };
        if (window.appState.currentProject && window.appState.currentProject.id === projectId) {
            window.appState.currentProject = window.appState.projects[index];
        }
    }

    if (isSheets) {
        const fullPayload = { action: 'update', id: projectId, ...payload };
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(fullPayload) });
        // Pausar edición manual para confirmar éxito visualmente
        window.isEditing = false;
        setTimeout(loadData, 1000);
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const idx = current.findIndex(p => p.id === projectId);
        if (idx !== -1) {
            current[idx] = { ...current[idx], ...payload };
            localStorage.setItem('av_planner_projects', JSON.stringify(current));
        }
        window.isEditing = false;
        loadData();
    }
};

const deleteProject = async (projectId) => {
    if (!confirm("¿Seguro que deseas eliminar este proyecto?")) return;
    
    if (isSheets) {
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: projectId }) });
        setTimeout(loadData, 1500);
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
    sceneCut.className = 'my-8 border-t-2 border-dashed border-brand-accent/30 pt-4 font-bold text-brand-accent uppercase tracking-[0.3em] text-center text-[9px]';
    sceneCut.innerHTML = '--- CORTE DE ESCENA ---';
    range.insertNode(sceneCut);
    range.collapse(false);
};

window.copyScript = () => {
    const content = document.getElementById('scriptContent').innerText;
    navigator.clipboard.writeText(content).then(() => alert('¡Copiado! 📋'));
};

window.printScript = () => window.print();

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
    renderApp();
};

window.openLightbox = (index) => {
    const images = window.appState.currentProject.storyboardImages || [];
    const src = images[index];
    if (src) { window.appState.lightbox = src; renderApp(); }
};

window.toggleFinalizado = (isExportado) => {
    const select = document.getElementById('statusSelect');
    if (!select) return;
    const finOption = Array.from(select.options).find(o => o.value === 'Finalizado');
    if (finOption) finOption.disabled = !isExportado;
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
    return `<span class="swiss-badge ${c.bg} ${c.text} border-2 border-brand-hairline shadow-sm px-3 py-1 text-[9px] font-bold">
        <span class="mr-1">${c.icon}</span> ${status}
    </span>`;
};

const renderApp = () => {
    const root = document.getElementById('app');
    
    if (!document.getElementById('print-styles')) {
        const style = document.createElement('style');
        style.id = 'print-styles';
        style.innerHTML = '@media print { body * { visibility: hidden; } #scriptContent, #scriptContent * { visibility: visible; } #scriptContent { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; font-size: 12pt !important; } }';
        document.head.appendChild(style);
    }
    
    if (!window.appState.userName) {
        root.innerHTML = '<div class="flex items-center justify-center min-h-screen p-10 bg-brand-paper text-brand-dark"><div class="max-w-md w-full border-2 border-brand-hairline bg-white p-10 rounded-2xl shadow-soft"><div class="mb-10 text-center"><div class="w-12 h-1.5 bg-brand-primary mx-auto mb-6"></div><h1 class="text-3xl font-bold tracking-tight">Puntaje<br>Nacional</h1><p class="text-[10px] font-bold uppercase tracking-widest mt-2 text-brand-gray">Terminal de Producción AV</p></div><form id="loginForm" class="space-y-8"><div><label class="block text-[10px] font-bold uppercase tracking-widest text-brand-dark mb-2">ID de Operador</label><input type="text" id="userNameInput" required placeholder="Ingresa tu nombre..." class="swiss-input border-2"></div><button type="submit" class="btn-swiss-primary w-full py-4 text-sm font-bold shadow-lg">ACCEDER AL SISTEMA →</button></form></div></div>';
        document.getElementById('loginForm').onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('userNameInput').value.trim();
            if (name) { window.appState.userName = name; renderApp(); }
        };
        return;
    }

    if (window.appState.view === 'dashboard') {
        let filtered = window.appState.projects.filter(p => {
            const q = window.appState.searchQuery.toLowerCase();
            return p.title.toLowerCase().includes(q) || (p.team && p.team.toLowerCase().includes(q));
        });

        filtered.sort((a, b) => {
            if (window.appState.sortBy === 'title') return a.title.localeCompare(b.title);
            if (window.appState.sortBy === 'status') {
                const stages = ['Idea', 'Guionizado', 'Storyboard', 'Producción', 'Finalizado'];
                return stages.indexOf(b.status) - stages.indexOf(a.status);
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        root.innerHTML = `<div class="p-6 md:p-10 max-w-[1300px] mx-auto min-h-screen"><header class="mb-10 flex flex-col md:flex-row justify-between items-end gap-6 border-b-2 border-brand-hairline pb-8"><div><h1 class="text-2xl font-bold text-brand-dark mb-1">PANEL DE PRODUCCIÓN</h1><p class="text-[10px] font-bold text-brand-gray tracking-widest uppercase">Operador: <span class="text-brand-dark underline">${window.appState.userName}</span></p></div><div class="flex flex-wrap items-center gap-3"><div class="flex items-center gap-2 border-2 border-brand-hairline bg-white px-4 py-2 rounded-lg shadow-sm focus-within:border-brand-primary"><input type="text" id="searchInput" value="${window.appState.searchQuery}" placeholder="Buscar..." class="bg-transparent outline-none font-bold text-xs w-32"></div><select id="sortSelect" class="bg-white border-2 border-brand-hairline text-[10px] font-bold px-4 py-2 rounded-lg outline-none"><option value="date" ${window.appState.sortBy === 'date' ? 'selected' : ''}>RECIENTE</option><option value="title" ${window.appState.sortBy === 'title' ? 'selected' : ''}>A-Z</option></select><button id="btnNewIdea" class="btn-swiss-primary shadow-md">+ NUEVO</button><button onclick="location.reload()" class="btn-swiss-outline py-2 px-4 text-[10px] border-2">SALIR</button></div></header><div class="space-y-3">${filtered.map(p => { const progress = getStatusProgress(p.status); let dateStr = '---'; try { const d = new Date(p.createdAt); if(!isNaN(d)) dateStr = d.toLocaleDateString(); } catch(e) {} return `<div data-id="${p.id}" class="project-row list-row group border-2 bg-white hover:border-brand-primary shadow-sm"><div class="flex-1"><span class="text-[8px] font-bold text-brand-primary uppercase tracking-widest">${p.id.startsWith('id-') ? 'NUEVO' : 'REF-' + p.id.substring(0,6)}</span><h3 class="text-base font-bold text-brand-dark group-hover:text-brand-primary">${p.title}</h3></div><div class="w-32 text-center shrink-0">${getStatusBadge(p.status)}</div><div class="w-32 flex flex-col justify-center shrink-0"><span class="text-[10px] font-bold text-brand-dark truncate">${p.team || '---'}</span><span class="text-[8px] font-bold text-brand-gray uppercase">${dateStr}</span></div><div class="w-40 flex items-center gap-3 shrink-0"><div class="flex-1 h-1.5 bg-brand-hairline rounded-full overflow-hidden border border-brand-hairline"><div class="h-full bg-brand-primary" style="width: ${progress}%"></div></div><span class="text-[9px] font-bold text-brand-dark w-6">${Math.round(progress)}%</span></div><div class="w-6 text-right font-bold text-brand-primary opacity-30 group-hover:opacity-100 transition-opacity">→</div></div>`; }).join('')}</div></div>`;
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
        root.innerHTML = `<div class="p-6 md:p-10 max-w-2xl mx-auto min-h-screen"><button id="btnBack" class="btn-swiss-outline text-[10px] mb-8 border-2">← VOLVER AL PANEL</button><div class="mb-10 text-center"><div class="w-12 h-1 bg-brand-accent mx-auto mb-4"></div><h2 class="text-3xl font-bold tracking-tight uppercase">NUEVA INICIATIVA</h2></div><form id="ideaForm" class="space-y-6 bg-white p-8 rounded-2xl border-2 border-brand-hairline shadow-soft"><div><label class="block text-[9px] font-bold uppercase tracking-widest mb-2 text-brand-gray">Título del Proyecto</label><input type="text" id="title" required class="swiss-input uppercase text-lg border-b-4 focus:border-brand-primary"></div><div class="grid grid-cols-2 gap-6"><div><label class="block text-[9px] font-bold uppercase tracking-widest mb-2 text-brand-gray">Categoría</label><select id="category" class="swiss-input uppercase border-b-4"><option>Social Media</option><option>Educativo</option><option>Institucional</option><option>Publicidad</option></select></div><div><label class="block text-[9px] font-bold uppercase tracking-widest mb-2 text-brand-gray">Lead de Prod.</label><input type="text" id="team" class="swiss-input uppercase border-b-4"></div></div><div><label class="block text-[9px] font-bold uppercase tracking-widest mb-2 text-brand-gray">Brief / Objetivo</label><textarea id="description" rows="3" required class="swiss-input text-base border-2 rounded-xl p-4"></textarea></div><button type="submit" class="btn-swiss-primary w-full py-5 text-base font-bold shadow-xl">LANZAR PROYECTO 🚀</button></form></div>`;
        document.getElementById('btnBack').onclick = () => window.setView('dashboard');
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

        root.innerHTML = `<div class="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen bg-brand-paper text-brand-dark"><div class="flex justify-between items-center mb-6"><button id="btnBackDetail" class="btn-swiss-outline text-[10px] border-2">← DASHBOARD</button><div class="flex items-center gap-3"><span class="text-[9px] font-bold text-brand-gray uppercase tracking-widest">Último Editor:</span><span class="text-[9px] font-bold bg-brand-dark text-white px-2 py-0.5 rounded uppercase tracking-wider">${p.lastEditor || 'Sistema'}</span></div></div><div class="grid grid-cols-1 lg:grid-cols-12 gap-8"><div class="lg:col-span-4 space-y-6"><div class="bg-white p-6 rounded-2xl border-2 border-brand-hairline shadow-soft space-y-4"><div class="flex items-center gap-3">${getStatusBadge(p.status)}<span class="text-[8px] font-bold text-brand-gray tracking-widest uppercase">ID: ${p.id.substring(0,8)}</span></div><h1 class="text-2xl font-bold tracking-tight uppercase leading-tight">${p.title}</h1><p class="text-xs font-medium text-brand-gray leading-relaxed italic">${p.description}</p></div><div class="flex flex-col gap-2"><button onclick="window.setTab('guion')" class="detail-nav-btn ${activeTab === 'guion' ? 'active' : ''}"><span class="num text-[8px]">01</span><span class="label text-[10px]">GUION NARRATIVO</span><span class="icon text-lg">📝</span></button><button onclick="window.setTab('storyboard')" class="detail-nav-btn ${activeTab === 'storyboard' ? 'active' : ''}"><span class="num text-[8px]">02</span><span class="label text-[10px]">REGISTRO VISUAL</span><span class="icon text-lg">🎨</span></button><button onclick="window.setTab('produccion')" class="detail-nav-btn ${activeTab === 'produccion' ? 'active' : ''}"><span class="num text-[8px]">03</span><span class="label text-[10px]">POST-PRODUCCIÓN</span><span class="icon text-lg">🎬</span></button><button onclick="window.setTab('gestion')" class="detail-nav-btn ${activeTab === 'gestion' ? 'active' : ''}"><span class="num text-[8px]">04</span><span class="label text-[10px]">AJUSTES DE PROYECTO</span><span class="icon text-lg">⚙️</span></button></div></div><div class="lg:col-span-8 min-h-[600px]"><div class="bg-white rounded-2xl border-2 border-brand-hairline shadow-focus flex flex-col h-full overflow-hidden">${activeTab === 'guion' ? `<div class="p-4 border-b-2 border-brand-hairline bg-brand-light flex justify-between items-center shrink-0"><span class="text-[10px] font-bold uppercase tracking-widest text-brand-gray">Editor de Texto</span><div class="flex gap-2"><button onclick="window.formatScriptBold()" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-white border-2">NEGRITA</button><button onclick="window.insertSceneCut()" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-white border-2">ESCENA</button><button id="btnSaveScript" class="btn-swiss-primary py-1 px-5 text-[9px] font-bold shadow-md">GUARDAR GUION 💾</button></div></div><div id="scriptContent" class="p-8 text-base text-brand-dark min-h-[600px] outline-none font-mono leading-relaxed bg-brand-paper/20 overflow-y-auto" contenteditable="true">${p.script || 'ESCENA 01 - ...'}</div>` : ''}${activeTab === 'storyboard' ? `<div class="p-8 space-y-6"><div class="flex justify-between items-center border-b-2 border-brand-hairline pb-4"><h3 class="text-lg font-bold uppercase tracking-tight">Storyboard</h3><button id="btnSaveSB" class="btn-swiss-primary py-1.5 px-4 text-[9px] font-bold shadow-md">CONFIRMAR REGISTRO 💾</button></div><div class="grid grid-cols-2 gap-4">${images.map((img, idx) => `<div onclick="window.openLightbox(${idx})" class="aspect-video border-2 border-brand-dark relative cursor-pointer overflow-hidden rounded-lg shadow-sm group"><img src="${img}" class="w-full h-full object-cover transition-transform group-hover:scale-105"></div>`).join('')}<div onclick="document.getElementById('sbUpload').click()" class="aspect-video border-2 border-dashed border-brand-hairline flex flex-col items-center justify-center cursor-pointer hover:bg-brand-primary/5 rounded-lg group transition-colors"><span class="text-4xl font-bold text-brand-hairline group-hover:text-brand-primary transition-transform group-hover:scale-110">+</span></div><input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, '${p.id}')"></div></div>` : ''}${activeTab === 'produccion' ? `<div class="p-8 space-y-8"><div class="flex justify-between items-center border-b-2 border-brand-hairline pb-4"><h3 class="text-lg font-bold uppercase">Checklist de Calidad</h3><button id="btnSyncProd" class="btn-swiss-primary py-1.5 px-6 text-[9px] font-bold shadow-md uppercase">Guardar Checklist 💾</button></div><div class="space-y-4"><label class="flex items-center gap-4 p-5 border-2 border-brand-hairline rounded-xl cursor-pointer hover:bg-brand-paper transition-colors"><input type="checkbox" id="chkMontaje" ${prod.montaje ? 'checked' : ''} class="w-6 h-6 accent-brand-primary"><div class="flex flex-col"><span class="font-bold uppercase text-xs">Montaje Base</span><span class="text-[8px] text-brand-gray uppercase tracking-widest">Sincronización y estructura</span></div></label><label class="flex items-center gap-4 p-5 border-2 border-brand-hairline rounded-xl cursor-pointer hover:bg-brand-paper transition-colors"><input type="checkbox" id="chkEdicion" ${prod.edicion ? 'checked' : ''} class="w-6 h-6 accent-brand-primary"><div class="flex flex-col"><span class="font-bold uppercase text-xs">Color & Mix</span><span class="text-[8px] text-brand-gray uppercase tracking-widest">Audio y corrección visual</span></div></label><label class="flex items-center gap-4 p-5 border-2 border-brand-hairline rounded-xl cursor-pointer hover:bg-brand-paper transition-colors"><input type="checkbox" id="chkSubtitulado" ${prod.subtitulado ? 'checked' : ''} class="w-6 h-6 accent-brand-primary"><div class="flex flex-col"><span class="font-bold uppercase text-xs">GFX & Subs</span><span class="text-[8px] text-brand-gray uppercase tracking-widest">Gráficas y textos técnicos</span></div></label><label class="flex items-center gap-4 p-6 border-4 border-brand-accent rounded-xl cursor-pointer bg-brand-accent/5 hover:bg-brand-accent/10 transition-colors shadow-md"><input type="checkbox" id="chkExportado" onchange="window.toggleFinalizado(this.checked)" ${prod.exportado ? 'checked' : ''} class="w-6 h-6 accent-brand-primary"><div class="flex flex-col"><span class="font-bold uppercase text-sm text-brand-primary">Master Final</span><span class="text-[9px] text-brand-accent font-bold uppercase">Habilitar entrega final</span></div></label></div></div>` : ''}${activeTab === 'gestion' ? `<div class="p-8 space-y-8 flex-1 flex flex-col h-full"><div class="border-b-2 border-brand-hairline pb-4 shrink-0"><h3 class="text-lg font-bold uppercase">Administración de Pipeline</h3></div><div class="grid grid-cols-2 gap-6 shrink-0"><div><label class="block text-[9px] font-bold uppercase mb-2 text-brand-gray">Responsable</label><input type="text" id="teamInput" value="${p.team || ''}" class="swiss-input font-bold border-2"></div><div><label class="block text-[9px] font-bold uppercase mb-2 text-brand-gray">Fecha Límite</label><input type="date" id="dueDateInput" value="${p.dueDate || ''}" class="swiss-input font-bold border-2"></div></div><div class="shrink-0"><label class="block text-[9px] font-bold uppercase mb-2 text-brand-gray">Estado de Avance</label><select id="statusSelect" class="swiss-input font-bold uppercase border-2 text-sm"><option value="Idea" ${p.status === 'Idea' ? 'selected' : ''}>💡 Idea</option><option value="Guionizado" ${p.status === 'Guionizado' ? 'selected' : ''}>📝 Guionizado</option><option value="Storyboard" ${p.status === 'Storyboard' ? 'selected' : ''}>🎨 Storyboard</option><option value="Producción" ${p.status === 'Producción' ? 'selected' : ''}>🎬 Producción</option><option value="Finalizado" ${p.status === 'Finalizado' ? 'selected' : ''} ${!prod.exportado && p.status !== 'Finalizado' ? 'disabled' : ''}>✅ Finalizado</option></select></div><div class="flex-1"></div><div class="flex gap-4 pt-6 shrink-0"><button id="btnSaveDetail" class="btn-swiss-primary flex-1 py-6 font-bold uppercase text-lg shadow-2xl">Sincronizar con Excel ⚡</button><button onclick="window.deleteProject('${p.id}')" class="btn-swiss-outline py-6 px-10 border-brand-accent text-brand-accent border-2 font-bold hover:bg-brand-accent hover:text-white transition-all uppercase text-xs tracking-widest">Borrar</button></div></div>` : ''}</div></div></div>${window.appState.lightbox ? `<div class="fixed inset-0 bg-brand-dark/95 z-[100] flex items-center justify-center p-8 backdrop-blur-md" onclick="window.appState.lightbox = null; renderApp();"><img src="${window.appState.lightbox}" class="max-w-full max-h-full border-4 border-white shadow-2xl rounded-lg"></div>` : ''}</div>`;

        document.getElementById('btnBackDetail').onclick = () => { window.isEditing = false; window.setView('dashboard'); };
        
        const syncAction = async () => {
            const newStatus = document.getElementById('statusSelect') ? document.getElementById('statusSelect').value : p.status;
            const newTeam = document.getElementById('teamInput') ? document.getElementById('teamInput').value : p.team;
            const newDueDate = document.getElementById('dueDateInput') ? document.getElementById('dueDateInput').value : p.dueDate;
            const scriptHtml = document.getElementById('scriptContent') ? document.getElementById('scriptContent').innerHTML : p.script;

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
                production: newProd,
                script: scriptHtml
            });
            
            if (activeTab === 'gestion') window.setView('dashboard');
            else renderApp();
        };

        if (document.getElementById('btnSaveDetail')) document.getElementById('btnSaveDetail').onclick = syncAction;
        if (document.getElementById('btnSyncProd')) document.getElementById('btnSyncProd').onclick = syncAction;
        if (document.getElementById('btnSaveScript')) document.getElementById('btnSaveScript').onclick = syncAction;
        if (document.getElementById('btnSaveSB')) document.getElementById('btnSaveSB').onclick = syncAction;

        const scriptEl = document.getElementById('scriptContent');
        if (scriptEl) {
            scriptEl.oninput = (e) => {
                window.isEditing = true; // Pausar sync automático
                p.script = e.target.innerHTML; // Guardado en memoria local solamente
            };
        }
    }
};

window.setView = (v) => { 
    window.isEditing = false;
    window.appState.view = v; 
    window.appState.activeTab = 'guion';
    history.pushState({ view: v }, '', '#' + v);
    renderApp(); 
};

window.viewDetail = (id) => { 
    window.isEditing = false;
    window.appState.currentProject = window.appState.projects.find(p => p.id === id); 
    window.appState.view = 'detail'; 
    window.appState.activeTab = 'guion';
    history.pushState({ view: 'detail', projectId: id }, '', '#detail-' + id);
    renderApp(); 
};

window.setTab = (t) => { window.appState.activeTab = t; renderApp(); };

window.onpopstate = (e) => {
    window.isEditing = false;
    if (e.state && e.state.view) {
        window.appState.view = e.state.view;
        if (e.state.projectId) window.appState.currentProject = window.appState.projects.find(p => p.id === e.state.projectId);
        renderApp();
    } else {
        window.appState.view = 'dashboard';
        renderApp();
    }
};

window.onload = async () => { 
    if (window.location.hash === '') history.replaceState({ view: 'dashboard' }, '', '#dashboard');
    else {
        const h = window.location.hash;
        if (h === '#new') window.appState.view = 'new';
        else if (h.startsWith('#detail-')) {
            const id = h.replace('#detail-', '');
            window.appState.view = 'detail';
        }
    }
    await loadData();
};
