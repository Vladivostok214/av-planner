import './style.css';

const sheetsUrl = import.meta.env.VITE_SHEETS_API_URL;
const isSheets = !!sheetsUrl;
window.isEditing = false;

const showLoading = () => document.getElementById('loadingOverlay')?.classList.add('active');
const hideLoading = () => document.getElementById('loadingOverlay')?.classList.remove('active');

const loadData = async () => {
    if (window.isEditing) return;
    if (!isSheets) {
        window.appState.projects = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        renderApp(); return;
    }
    try {
        showLoading();
        const resp = await fetch(sheetsUrl);
        const data = await resp.json();
        window.appState.projects = data.map(p => ({
            ...p,
            status: p.status || p.estado || 'Idea',
            dueDate: p.duedate || p.dueDate || '',
            createdAt: p.createdat || p.createdAt || new Date().toISOString(),
            updatedAt: p.updatedat || p.updatedAt || p.createdat || p.createdAt || new Date().toISOString()
        }));
        if (window.appState.view === 'detail' && window.appState.currentProject) {
            const updated = window.appState.projects.find(p => p.id === window.appState.currentProject.id);
            if (updated) window.appState.currentProject = updated;
        }
        renderApp();
    } catch (e) { console.error(e); } finally { hideLoading(); }
};

const updateProject = async (projectId, newData) => {
    const payload = { ...newData, lastEditor: window.appState.userName || 'Anonimo', updatedAt: new Date().toISOString() };
    const index = window.appState.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        window.appState.projects[index] = { ...window.appState.projects[index], ...payload };
        if (window.appState.currentProject && window.appState.currentProject.id === projectId) {
            window.appState.currentProject = window.appState.projects[index];
        }
    }
    if (isSheets) {
        fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'update', id: projectId, ...payload }) });
        window.isEditing = false;
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const idx = current.findIndex(p => p.id === projectId);
        if (idx !== -1) { current[idx] = { ...current[idx], ...payload }; localStorage.setItem('av_planner_projects', JSON.stringify(current)); }
        window.isEditing = false;
    }
};

window.deleteProject = async (projectId) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    showLoading();
    window.appState.projects = window.appState.projects.filter(p => p.id !== projectId);
    
    if (isSheets) {
        await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: projectId }) });
        setTimeout(loadData, 1000);
    } else {
        const current = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
        const updated = current.filter(p => p.id !== projectId);
        localStorage.setItem('av_planner_projects', JSON.stringify(updated));
        loadData();
    }
    if (window.appState.view === 'detail') window.setView('dashboard');
    else renderApp();
    hideLoading();
};

window.appState = { user: { uid: 'sov' }, userName: '', projects: [], currentProject: null, view: 'dashboard', searchQuery: '', sortBy: 'date', lightbox: null, activeTab: 'guion', showSettingsModal: false };

window.formatScript = (cmd) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    if (cmd === 'scene') {
        const node = document.createElement('div');
        node.className = 'script-scene';
        node.style.cssText = 'margin: 2em 0; border-top: 2px dashed rgba(247,148,30,0.3); padding-top: 1em; font-weight: bold; color: #f7941e; text-align: center; font-size: 10px; letter-spacing: 0.3em;';
        node.innerHTML = '--- CORTE DE ESCENA ---';
        range.insertNode(node);
        range.collapse(false);
    } else if (cmd === 'highlight') {
        const span = document.createElement('span');
        span.style.backgroundColor = 'black';
        span.style.color = 'white';
        span.style.padding = '0.1em 0.3em';
        span.style.borderRadius = '2px';
        range.surroundContents(span);
    } else {
        document.execCommand(cmd, false, null);
    }
};

window.downloadHTML = (event) => {
    const el = document.getElementById('scriptContent');
    const p = window.appState.currentProject;
    if (!el) return;

    try {
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>GUION: ${p.title}</title>
    <style>
        body { 
            font-family: Courier, monospace; 
            font-size: 14px; 
            line-height: 1.6; 
            color: black; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px; 
            background: white; 
        }
        .header { 
            border-bottom: 4px solid #003a7a; 
            margin-bottom: 40px; 
            padding-bottom: 10px; 
        }
        .header h1 { 
            margin: 0; 
            font-family: sans-serif; 
            font-size: 28px; 
            color: #003a7a; 
            font-weight: 900; 
            text-transform: uppercase; 
        }
        .header p { 
            margin: 5px 0 0 0; 
            font-family: sans-serif; 
            font-size: 11px; 
            color: #666; 
            font-weight: 700; 
            letter-spacing: 3px; 
        }
        .script-scene { 
            font-weight: bold; 
            text-transform: uppercase; 
            margin: 2em 0; 
            border-top: 2px dashed rgba(247,148,30,0.3); 
            padding-top: 1em; 
            color: #f7941e; 
            text-align: center; 
            font-size: 10px; 
            letter-spacing: 0.3em; 
        }
        .content {
            white-space: pre-wrap; 
            word-wrap: break-word;
        }
        @media print {
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${p.title}</h1>
        <p>GUION TECNICO / AV CONTENT PLANNER</p>
    </div>
    <div class="content">
        ${el.innerHTML}
    </div>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "GUION_" + p.title.replace(/\s+/g, '_') + ".html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export Fail", e);
        alert("Error al generar archivo");
    }
};

window.shareScript = async () => {
    const p = window.appState.currentProject; const content = document.getElementById('scriptContent').innerText;
    if (navigator.share) { try { await navigator.share({ title: "GUION: " + p.title, text: content, url: window.location.href }); } catch (e) {} }
    else { navigator.clipboard.writeText(content); alert("Copiado! 📋"); }
};

const getStatusBadge = (status) => {
    const config = {
        'Idea': { bg: 'bg-brand-light', text: 'text-brand-dark', icon: '💡' },
        'Guionizado': { bg: 'bg-brand-light', text: 'text-brand-dark', icon: '📝' },
        'Storyboard': { bg: 'bg-brand-light', text: 'text-brand-dark', icon: '🎨' },
        'Produccion': { bg: 'bg-brand-primary', text: 'text-white', icon: '🎬' },
        'Finalizado': { bg: 'bg-brand-accent', text: 'text-brand-dark', icon: '✅' }
    };
    const c = config[status] || { bg: 'bg-brand-light', text: 'text-brand-dark', icon: '❓' };
    return '<span class="swiss-badge ' + c.bg + ' ' + c.text + ' border-2 border-brand-hairline px-3 py-1 text-[9px] font-bold"><span>' + c.icon + '</span> ' + status + '</span>';
};

window.addStoryboardLink = async (projectId) => {
    const input = document.getElementById('sbLinkInput');
    const url = input.value.trim();
    if (!url) return;

    let finalUrl = url;
    // Auto-convert Google Drive links to direct viewing links
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
        if (match && match[1]) {
            finalUrl = `https://lh3.googleusercontent.com/u/0/d/${match[1]}`;
        }
    }

    const p = window.appState.currentProject;
    if (!p.storyboardImages) p.storyboardImages = [];
    
    // Add to local state
    if (Array.isArray(p.storyboardImages)) p.storyboardImages.push(finalUrl);
    else {
        const existing = p.storyboardImages ? p.storyboardImages.split(',').filter(x => x) : [];
        existing.push(finalUrl);
        p.storyboardImages = existing;
    }
    
    input.value = '';
    renderApp();
    
    // Optimistic save
    const imgString = Array.isArray(p.storyboardImages) ? p.storyboardImages.join(',') : p.storyboardImages;
    await updateProject(projectId, { storyboardImages: imgString });
};

const renderApp = () => {
    const root = document.getElementById('app');
    if (!document.getElementById('loadingOverlay')) {
        const lo = document.createElement('div'); lo.id = 'loadingOverlay'; lo.className = 'loading-overlay'; lo.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(lo);
    }
    if (!document.getElementById('script-styles')) {
        const style = document.createElement('style'); style.id = 'script-styles';
        style.innerHTML = '.script-scene { font-weight: bold; text-transform: uppercase; margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 4px; }';
        document.head.appendChild(style);
    }
    if (!window.appState.userName) {
        root.innerHTML = '<div class="flex items-center justify-center min-h-screen p-10 bg-brand-paper"><div class="max-w-md w-full border-2 border-brand-hairline bg-brand-light p-10 rounded-2xl shadow-soft text-center"><div class="mb-10 text-center"><div class="w-12 h-1.5 bg-brand-primary mx-auto mb-6"></div><h1 class="text-3xl font-bold tracking-tight text-brand-dark">Puntaje Nacional</h1><p class="text-[10px] font-bold uppercase tracking-widest mt-2 text-brand-gray">Terminal de Produccion AV</p></div><form id="loginForm" class="space-y-8"><div><label class="block text-[10px] font-bold uppercase tracking-widest text-brand-dark mb-2 text-left">ID de Operador</label><input type="text" id="userNameInput" required placeholder="Ingresa tu nombre..." class="swiss-input border-2"></div><button type="submit" class="btn-swiss-primary w-full py-4 text-sm font-bold shadow-lg">ACCEDER AL SISTEMA</button></form></div></div>';
        document.getElementById('loginForm').onsubmit = (e) => { e.preventDefault(); const name = document.getElementById('userNameInput').value.trim(); if (name) { window.appState.userName = name; renderApp(); } };
        return;
    }
    if (window.appState.view === 'dashboard') {
        let filtered = window.appState.projects.filter(p => { const q = window.appState.searchQuery.toLowerCase(); return p.title.toLowerCase().includes(q) || (p.team && p.team.toLowerCase().includes(q)); });
        filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        
        let dashboardContent = '<div class="p-6 md:p-10 max-w-[1300px] mx-auto min-h-screen"><header class="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-brand-hairline pb-8"><div><h1 class="text-2xl font-bold text-brand-dark mb-1">PANEL DE PRODUCCION</h1><p class="text-[10px] font-bold text-brand-gray tracking-widest uppercase">Operador: <span class="text-brand-dark underline font-bold">' + window.appState.userName + '</span></p></div><div class="flex flex-wrap items-center gap-3 w-full md:w-auto"><div class="flex-1 md:flex-none flex items-center gap-2 border-2 border-brand-hairline bg-brand-light px-4 py-2 rounded-lg shadow-sm"><input type="text" id="searchInput" value="' + window.appState.searchQuery + '" placeholder="Buscar..." class="bg-transparent outline-none font-bold text-xs w-full md:w-32"></div><button id="btnNewIdea" class="btn-swiss-primary shadow-md flex-1 md:flex-none">+ NUEVO</button><button onclick="window.toggleDarkMode()" class="p-2 bg-brand-light border-2 border-brand-hairline rounded-lg hover:border-brand-primary transition-colors text-sm shadow-sm" title="Alternar Tema">🌙</button><button onclick="location.reload()" class="btn-swiss-outline py-2 px-4 text-[10px] border-2">SALIR</button></div></header>';
        
        if (filtered.length === 0) {
            dashboardContent += '<div class="flex flex-col items-center justify-center py-32 text-center space-y-6"><div class="text-6xl opacity-20">🎬</div><h3 class="text-xl font-bold text-brand-dark opacity-50 uppercase tracking-widest">No hay proyectos en el radar</h3><p class="text-xs text-brand-gray max-w-xs mx-auto">Empieza creando una nueva idea para el equipo de producción audiovisual.</p><button onclick="window.setView(\'new\')" class="btn-swiss-primary">+ CREAR PRIMER PROYECTO</button></div>';
        } else {
            dashboardContent += '<div class="space-y-4">' + filtered.map(p => { 
                const pr = ((['Idea','Guionizado','Storyboard','Produccion','Finalizado'].indexOf(p.status)+1)/5)*100; 
                let dS = 'SIN FECHA'; 
                if (p.dueDate) {
                    try { 
                        const parts = p.dueDate.split('-');
                        if (parts.length === 3) dS = `${parts[2]}/${parts[1]}/${parts[0]}`;
                        else {
                            const d = new Date(p.dueDate); 
                            if(!isNaN(d)) dS = d.toLocaleDateString();
                        }
                    } catch(e) {} 
                }
                
                let bgClass = 'bg-gradient-to-r from-brand-light to-brand-paper/50 hover:to-brand-primary/5'; // Default Idea
                if (['Guionizado', 'Storyboard', 'Produccion'].includes(p.status)) {
                    bgClass = 'bg-gradient-to-r from-brand-light to-yellow-500/20 border-yellow-500/30 hover:to-yellow-500/30';
                } else if (p.status === 'Finalizado') {
                    bgClass = 'bg-gradient-to-r from-brand-light to-green-500/30 border-green-500/40 hover:to-green-500/40';
                }

                return '<div class="project-row list-row group flex flex-col md:flex-row items-center gap-6 ' + bgClass + '"><div data-id="' + p.id + '" class="flex-1 flex flex-col md:flex-row items-center gap-6 w-full cursor-pointer"><div class="w-full md:flex-1 text-center md:text-left"><h3 class="text-lg font-bold text-brand-dark group-hover:text-brand-primary transition-colors">' + p.title + '</h3></div><div class="w-full md:w-32 flex justify-center md:justify-start shrink-0">' + getStatusBadge(p.status) + '</div><div class="w-full md:w-32 flex flex-row md:flex-col justify-center gap-4 md:gap-0 shrink-0"><span class="text-[10px] font-bold text-brand-dark truncate">' + (p.team || '---') + '</span><span class="text-[8px] font-bold text-brand-gray uppercase">' + dS + '</span></div><div class="w-full md:w-40 flex items-center justify-center gap-3 shrink-0"><div class="flex-1 h-2 bg-brand-hairline rounded-full overflow-hidden border"><div class="h-full bg-brand-primary" style="width: ' + pr + '%"></div></div><span class="text-[9px] font-bold text-brand-dark w-8 text-left">' + Math.round(pr) + '%</span></div></div><button onclick="window.deleteProject(\'' + p.id + '\')" class="w-full md:w-auto mt-2 md:mt-0 btn-swiss-outline btn-delete-contrast py-2 px-4 border-red-500 text-red-500 hover:bg-red-500 hover:text-white text-[10px] opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center gap-2 shadow-sm shrink-0"><span>BORRAR</span></button></div>'; 
            }).join('') + '</div>';
        }
        root.innerHTML = dashboardContent + '</div>';
        document.getElementById('btnNewIdea').onclick = () => window.setView('new');
        const si = document.getElementById('searchInput'); if (si) si.oninput = (e) => { window.appState.searchQuery = e.target.value; renderApp(); document.getElementById('searchInput').focus(); };
        document.querySelectorAll('.project-row > div:first-child').forEach(row => row.onclick = () => window.viewDetail(row.dataset.id));
    } else if (window.appState.view === 'new') {
        root.innerHTML = '<div class="p-6 md:p-10 max-w-2xl mx-auto min-h-screen"><button id="btnBack" class="btn-swiss-outline text-[10px] mb-8 border-2"><- VOLVER</button><h2 class="text-3xl font-bold tracking-tight uppercase mb-10">NUEVA INICIATIVA</h2><form id="ideaForm" class="space-y-6 bg-brand-light p-8 rounded-2xl border-2 border-brand-hairline shadow-soft"><div><label class="block text-[9px] font-bold uppercase mb-2">Titulo</label><input type="text" id="title" required class="swiss-input uppercase text-lg border-b-4"></div><div><label class="block text-[9px] font-bold uppercase mb-2">Brief</label><textarea id="description" rows="3" required class="swiss-input border-2 rounded-xl p-4"></textarea></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label class="block text-[9px] font-bold uppercase mb-2">Talento / Cast en cámara</label><input type="text" id="cast" placeholder="Ej: Profe Matias" class="swiss-input text-sm border-2"></div><div><label class="block text-[9px] font-bold uppercase mb-2">Plataformas</label><div class="flex flex-col gap-2 mt-2"><label class="flex items-center gap-3 text-xs font-bold cursor-pointer"><input type="checkbox" name="platforms" value="YT Shorts" class="w-4 h-4 accent-brand-primary"> YT Shorts</label><label class="flex items-center gap-3 text-xs font-bold cursor-pointer"><input type="checkbox" name="platforms" value="IG Reels" class="w-4 h-4 accent-brand-primary"> IG Reels</label><label class="flex items-center gap-3 text-xs font-bold cursor-pointer"><input type="checkbox" name="platforms" value="TikTok" class="w-4 h-4 accent-brand-primary"> TikTok</label><label class="flex items-center gap-3 text-xs font-bold cursor-pointer"><input type="checkbox" name="platforms" value="YT Horizontal" class="w-4 h-4 accent-brand-primary"> YT Horizontal</label></div></div></div><button type="submit" class="btn-swiss-primary w-full py-5 text-base font-bold shadow-xl mt-4">LANZAR PROYECTO</button></form></div>';
        document.getElementById('btnBack').onclick = () => window.setView('dashboard');
        document.getElementById('ideaForm').onsubmit = async (e) => { e.preventDefault(); 
            const checkedPlatforms = Array.from(document.querySelectorAll('input[name="platforms"]:checked')).map(cb => cb.value).join(', ');
            const pData = { 
                title: document.getElementById('title').value, 
                description: document.getElementById('description').value,
                cast: document.getElementById('cast').value,
                platform: checkedPlatforms
            }; 
            const payload = { ...pData, status: 'Idea', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastEditor: window.appState.userName || 'Anonimo', id: 'id-' + Date.now() };
            window.appState.projects.unshift(payload);
            showLoading();
            if (isSheets) { 
                await fetch(sheetsUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'save', ...payload }) }); 
                setTimeout(loadData, 1500);
            } else { 
                const c = JSON.parse(localStorage.getItem('av_planner_projects') || '[]'); 
                c.push(payload); 
                localStorage.setItem('av_planner_projects', JSON.stringify(c)); 
                loadData();
            }
            window.setView('dashboard');
            hideLoading();
        };
    } else if (window.appState.view === 'detail') {
        const p = window.appState.currentProject; const images = p.storyboardImages || []; const activeTab = window.appState.activeTab;
        
        const platformStr = p.platform || '';
        const isYTShorts = platformStr.includes('YT Shorts') ? 'checked' : '';
        const isIGReels = platformStr.includes('IG Reels') ? 'checked' : '';
        const isTikTok = platformStr.includes('TikTok') ? 'checked' : '';
        const isYTHorizontal = platformStr.includes('YT Horizontal') ? 'checked' : '';

        root.innerHTML = '<div class="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen bg-brand-paper text-brand-dark"><div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6"><button id="btnBackDetail" class="btn-swiss-outline w-full md:w-auto text-[10px] border-2"><- DASHBOARD</button><div class="flex flex-wrap items-center justify-between md:justify-end gap-3 w-full md:w-auto"><span class="text-[9px] font-bold text-brand-gray uppercase">Ultimo Editor:</span><span class="text-[9px] font-bold bg-brand-dark text-white px-2 py-0.5 rounded uppercase tracking-wider">' + (p.lastEditor || 'Sistema') + '</span><button onclick="window.toggleDarkMode()" class="p-2 bg-brand-light border-2 border-brand-hairline rounded-lg hover:border-brand-primary transition-colors text-sm shadow-sm" title="Alternar Tema">🌙</button><button onclick="document.getElementById(\'settingsModal\').classList.remove(\'hidden\');" class="p-2 bg-brand-light border-2 border-brand-hairline rounded-lg hover:border-brand-primary transition-colors text-lg shadow-sm" title="Ajustes de Proyecto">⚙️</button></div></div><div class="grid grid-cols-1 lg:grid-cols-12 gap-8"><div class="lg:col-span-4 lg-sidebar space-y-6"><div class="bg-brand-light p-6 rounded-2xl border-2 border-brand-hairline shadow-soft space-y-4"><h1 class="text-2xl font-bold tracking-tight uppercase leading-tight">' + p.title + '</h1><p class="text-xs font-medium text-brand-gray leading-relaxed italic">' + p.description + '</p><div class="flex flex-wrap gap-2 pt-2"><span class="text-[9px] font-bold text-brand-primary uppercase tracking-widest border border-brand-primary/20 px-2 py-1 rounded bg-brand-primary/5">' + (p.cast || 'Sin Talento') + '</span>' + (platformStr ? platformStr.split(',').map(pl => '<span class="text-[9px] font-bold text-brand-gray uppercase tracking-widest border border-brand-hairline px-2 py-1 rounded bg-brand-light">' + pl.trim() + '</span>').join('') : '') + '</div></div><div class="flex flex-col gap-2 detail-nav"><button onclick="window.setTab(\'guion\')" class="detail-nav-btn ' + (activeTab === 'guion' ? 'active' : '') + '"><span class="num">01</span><span class="label">GUION NARRATIVO</span><span class="icon">📝</span></button><button onclick="window.setTab(\'storyboard\')" class="detail-nav-btn ' + (activeTab === 'storyboard' ? 'active' : '') + '"><span class="num">02</span><span class="label">REGISTRO VISUAL</span><span class="icon">🎨</span></button></div></div><div class="lg:col-span-8 min-h-[600px]"><div class="bg-brand-light rounded-2xl border-2 border-brand-hairline shadow-focus flex flex-col h-full overflow-hidden">' + (activeTab === 'guion' ? '<div class="p-3 border-b-2 border-brand-hairline bg-brand-light flex flex-col xl:flex-row justify-between items-center gap-4 work-header"><div class="flex flex-wrap justify-center gap-2"><button onclick="window.formatScript(\'scene\')" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-brand-light border-2">ESCENA</button><button onclick="window.formatScript(\'bold\')" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-brand-light border-2">B</button><button onclick="window.formatScript(\'strikethrough\')" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-brand-light border-2 line-through">S</button><button onclick="window.formatScript(\'highlight\')" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-black text-white border-2">H</button><button onclick="document.execCommand(\'undo\')" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-brand-light border-2">UNDO</button></div><div class="flex flex-wrap justify-center gap-2 w-full xl:w-auto"><button onclick="window.shareScript()" class="p-2 hover:bg-brand-light rounded text-lg text-brand-dark underline font-bold">SHARE</button><button onclick="window.downloadHTML(event)" class="btn-swiss-outline py-1 px-3 text-[9px] font-bold bg-brand-light border-2">HTML</button><button id="btnSaveScript" class="btn-swiss-primary py-1 px-5 text-[9px] font-bold shadow-md flex-1 xl:flex-none">GUARDAR</button></div></div><div id="scriptContent" class="p-8 md:p-12 text-base text-brand-dark min-h-[600px] outline-none bg-brand-paper/20 overflow-y-auto" contenteditable="true" style="font-family: Courier, monospace;">' + (p.script || 'ESCENA 01 - ...') + '</div>' : '') + (activeTab === 'storyboard' ? '<div class="p-8 space-y-6 flex flex-col h-full"><div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-2 border-brand-hairline pb-4 shrink-0"><h3 class="text-lg font-bold uppercase">Storyboard</h3><button id="btnSaveSB" class="btn-swiss-primary py-1.5 px-4 text-[9px] font-bold w-full md:w-auto">GUARDAR</button></div><div class="bg-brand-light/50 p-4 rounded-2xl border-2 border-dashed border-brand-hairline space-y-4 shrink-0"><label class="block text-[9px] font-bold uppercase text-brand-gray">Añadir Imagen por Link de Drive</label><div class="flex gap-2"><input type="text" id="sbLinkInput" placeholder="Pega el link de compartir de Drive aquí..." class="swiss-input flex-1 py-2 text-xs border-2"><button onclick="window.addStoryboardLink(\'' + p.id + '\')" class="btn-swiss-primary py-2 px-6 text-[10px] whitespace-nowrap">AÑADIR</button></div></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2">' + (Array.isArray(p.storyboardImages) ? p.storyboardImages : (p.storyboardImages ? p.storyboardImages.split(',').filter(x => x) : [])).map((img, idx) => '<div onclick="window.openLightbox(' + idx + ')" class="aspect-video border-2 border-brand-dark relative cursor-pointer overflow-hidden rounded-[20px] bg-black shadow-lg group"><img src="' + img + '" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"><div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-3xl">🔍</div></div>').join('') + '<div onclick="document.getElementById(\'sbUpload\').click()" class="aspect-video border-2 border-dashed border-brand-hairline flex flex-col items-center justify-center cursor-pointer hover:bg-brand-primary/5 rounded-[20px] group transition-all"><span class="text-4xl font-bold text-brand-gray group-hover:scale-125 transition-transform">+</span><p class="text-[8px] font-bold uppercase mt-2 text-brand-gray">Subir Archivo</p></div><input type="file" id="sbUpload" class="hidden" accept="image/jpeg, image/png" multiple onchange="window.handleImageUpload(event, \'' + p.id + '\')"></div></div>' : '') + '</div></div></div>' + (window.appState.lightbox ? '<div class="fixed inset-0 bg-brand-dark/95 z-[100] flex items-center justify-center p-8 backdrop-blur-md" onclick="window.appState.lightbox = null; renderApp();"><img src="' + window.appState.lightbox + '" class="max-w-full max-h-full border-4 border-white shadow-2xl rounded-lg"></div>' : '') + '<div id="settingsModal" class="hidden fixed inset-0 bg-brand-dark/80 z-[100] flex items-center justify-center p-4 md:p-8 backdrop-blur-sm"><div class="bg-brand-paper w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border-4 border-brand-hairline shadow-2xl flex flex-col"><div class="p-6 md:p-8 border-b-2 border-brand-hairline flex justify-between items-center bg-brand-light"><h2 class="text-2xl font-bold uppercase">Ajustes de Producción</h2><button onclick="document.getElementById(\'settingsModal\').classList.add(\'hidden\');" class="text-3xl text-brand-gray hover:text-brand-primary font-bold transition-colors">&times;</button></div><div class="p-6 md:p-8 space-y-8 flex-1 bg-brand-light"><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label class="block text-[9px] font-bold uppercase mb-2">Responsable</label><input type="text" id="teamInput" value="' + (p.team || '') + '" class="swiss-input font-bold border-2"></div><div><label class="block text-[9px] font-bold uppercase mb-2">Fecha Límite</label><input type="date" id="dueDateInput" value="' + (p.dueDate || '') + '" class="swiss-input font-bold border-2"></div><div><label class="block text-[9px] font-bold uppercase mb-2">Talento / Cast en cámara</label><input type="text" id="castInput" value="' + (p.cast || '') + '" class="swiss-input font-bold border-2"></div><div><label class="block text-[9px] font-bold uppercase mb-2">Estado</label><select id="statusSelect" class="swiss-input font-bold border-2"><option value="Idea" ' + (p.status === 'Idea' ? 'selected' : '') + '>Idea</option><option value="Guionizado" ' + (p.status === 'Guionizado' ? 'selected' : '') + '>Guionizado</option><option value="Storyboard" ' + (p.status === 'Storyboard' ? 'selected' : '') + '>Storyboard</option><option value="Produccion" ' + (p.status === 'Produccion' ? 'selected' : '') + '>Produccion</option><option value="Finalizado" ' + (p.status === 'Finalizado' ? 'selected' : '') + '>Finalizado</option></select></div><div class="md:col-span-2"><label class="block text-[9px] font-bold uppercase mb-2">Plataformas Destino</label><div class="flex flex-wrap gap-4 border-2 border-brand-hairline p-4 rounded-xl"><label class="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" name="editPlatforms" value="YT Shorts" ' + isYTShorts + ' class="w-4 h-4 accent-brand-primary"> YT Shorts</label><label class="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" name="editPlatforms" value="IG Reels" ' + isIGReels + ' class="w-4 h-4 accent-brand-primary"> IG Reels</label><label class="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" name="editPlatforms" value="TikTok" ' + isTikTok + ' class="w-4 h-4 accent-brand-primary"> TikTok</label><label class="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" name="editPlatforms" value="YT Horizontal" ' + isYTHorizontal + ' class="w-4 h-4 accent-brand-primary"> YT Horizontal</label></div></div><div class="md:col-span-2"><label class="block text-[9px] font-bold uppercase mb-2">Carpeta Drive (Brutos)</label><input type="url" id="driveInput" value="' + (p.driveFolderLink || '') + '" placeholder="https://drive.google.com/..." class="swiss-input font-bold border-2 text-sm"></div><div class="md:col-span-2"><label class="block text-[9px] font-bold uppercase mb-2">URL Publicación</label><input type="url" id="publishedInput" value="' + (p.publishedUrl || '') + '" placeholder="https://youtube.com/..." class="swiss-input font-bold border-2 text-sm"></div></div></div><div class="p-6 md:p-8 bg-brand-light border-t-2 border-brand-hairline flex flex-col md:flex-row gap-4 shrink-0"><button id="btnSaveDetail" class="btn-swiss-primary flex-1 py-4 font-bold uppercase text-base shadow-lg">GUARDAR AJUSTES</button></div></div></div></div>';

        document.getElementById('btnBackDetail').onclick = () => { window.isEditing = false; window.setView('dashboard'); };
        
        const syncAction = async (e) => {
            const btn = e.target;
            const ogText = btn.innerText;
            btn.innerText = "GUARDANDO...";
            
            const sH = document.getElementById('scriptContent') ? document.getElementById('scriptContent').innerHTML : p.script;
            let payload = { script: sH };
            
            const statusSel = document.getElementById('statusSelect');
            if (statusSel) {
                payload.status = statusSel.value;
                payload.team = document.getElementById('teamInput').value;
                payload.dueDate = document.getElementById('dueDateInput').value;
                payload.cast = document.getElementById('castInput').value;
                payload.driveFolderLink = document.getElementById('driveInput').value;
                payload.publishedUrl = document.getElementById('publishedInput').value;
                payload.platform = Array.from(document.querySelectorAll('input[name="editPlatforms"]:checked')).map(cb => cb.value).join(', ');
            }
            
            await updateProject(p.id, payload);
            btn.innerText = ogText;
            document.getElementById('settingsModal').classList.add('hidden');
            renderApp();
        };
        if (document.getElementById('btnSaveDetail')) document.getElementById('btnSaveDetail').onclick = syncAction;
        if (document.getElementById('btnSaveScript')) document.getElementById('btnSaveScript').onclick = syncAction;
        if (document.getElementById('btnSaveSB')) document.getElementById('btnSaveSB').onclick = syncAction;
        const sc = document.getElementById('scriptContent'); if (sc) sc.oninput = (e) => { window.isEditing = true; p.script = e.target.innerHTML; };
    }
};

window.setView = (v) => { window.isEditing = false; window.appState.view = v; window.appState.activeTab = 'guion'; history.pushState({ view: v }, '', '#' + v); renderApp(); };
window.viewDetail = (id) => { window.isEditing = false; window.appState.currentProject = window.appState.projects.find(p => p.id === id); window.appState.view = 'detail'; window.appState.activeTab = 'guion'; history.pushState({ view: 'detail', projectId: id }, '', '#detail-' + id); renderApp(); };
window.setTab = (t) => { window.appState.activeTab = t; renderApp(); };
window.onpopstate = (e) => { window.isEditing = false; if (e.state && e.state.view) { window.appState.view = e.state.view; if (e.state.projectId) window.appState.currentProject = window.appState.projects.find(p => p.id === e.state.projectId); renderApp(); } else { window.appState.view = 'dashboard'; renderApp(); } };
window.toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
};

window.onload = async () => { 
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    if (window.location.hash === '') history.replaceState({ view: 'dashboard' }, '', '#dashboard');
    else { const h = window.location.hash; if (h === '#new') window.appState.view = 'new'; else if (h.startsWith('#detail-')) { window.appState.view = 'detail'; window.appState.currentProject = window.appState.projects.find(p => p.id === h.replace('#detail-','')); } }
    await loadData();
};
