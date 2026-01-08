// --- SÉLECTION DES ÉLÉMENTS DOM ---

const imageUpload = document.getElementById('imageUpload');
const pawnUpload = document.getElementById('pawnUpload');
const sceneUpload = document.getElementById('sceneUpload');

const container = document.getElementById('imageContainer');
const mapWrapper = document.getElementById('mapWrapper');
const viewerImage = document.getElementById('viewerImage');
const fogCanvas = document.getElementById('fogCanvas');
const ctx = fogCanvas.getContext('2d');

// Sélection de la nouvelle couche d'effets
const effectsLayer = document.getElementById('effectsLayer');

// Boutons
const resetBtn = document.getElementById('resetBtn');
const toggleFogVisBtn = document.getElementById('toggleFogVisBtn');
const toggleFogEditBtn = document.getElementById('toggleFogEditBtn');
const fogRevealBtn = document.getElementById('fogRevealBtn');
const fogHideBtn = document.getElementById('fogHideBtn');
const fogResetBtn = document.getElementById('fogResetBtn');

const saveSceneBtn = document.getElementById('saveSceneBtn');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpModal = document.getElementById('closeHelpModal');


// --- CONSTANTES & ÉTAT ---
const DEFAULT_PAWN_SIZE = 60;
const PIXELS_PER_METER = 60; // Ratio pour la mesure (1m = 60px)

let state = {
    // Vue
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    
    // Brouillard
    fogVisible: true,
    fogEditing: false,
    isDrawing: false,
    tool: 'reveal',
    brushSize: 60,
    
    // Pions & Souris
    draggingPawn: null,
    dragLastX: 0,
    dragLastY: 0,
    
    // Copier/Coller
    mouseX: 0,
    mouseY: 0,
    hoveredWrapper: null,
    clipboard: null,

    // ÉTATS DES EFFETS TACTIQUES
    isMeasuring: false,
    measureStartX: 0,
    measureStartY: 0,
    currentMeasureGroup: null, // Groupe SVG (Ligne + Texte)

    isCastingSpell: false,
    spellStartX: 0,
    spellStartY: 0,
    currentSpellLine: null // Ligne SVG
};


// --- 1. GESTION DE LA VUE ---

function updateTransform() {
    mapWrapper.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

resetBtn.addEventListener('click', () => {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
});

container.addEventListener('wheel', function(e) {
    if (e.target.closest('.pawn-wrapper')) return;
    e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + (direction * zoomIntensity);
    const newScale = state.scale * factor;
    if (newScale < 0.1 || newScale > 20) return;

    state.pointX *= factor;
    state.pointY *= factor;
    state.scale = newScale;
    updateTransform();
}, { passive: false });

// Utilitaire pour convertir les coordonnées écran -> carte
function getMapCoordinates(clientX, clientY) {
    const rect = viewerImage.getBoundingClientRect();
    const scaleX = viewerImage.naturalWidth / rect.width;
    const scaleY = viewerImage.naturalHeight / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
}


// --- 2. GESTION SOURIS (Events Centralisés) ---

container.addEventListener('mousedown', function(e) {
    // Ignore clic droit/milieu
    if (e.button !== 0 && e.button !== 1) return;

    const coords = getMapCoordinates(e.clientX, e.clientY);

    // 1. EXPLOSION (Alt + Clic) - Prioritaire
    if (e.altKey && e.button === 0) {
        triggerExplosion(coords.x, coords.y);
        return;
    }

    // 2. MESURE (Shift + Clic)
    if (e.shiftKey && e.button === 0) {
        state.isMeasuring = true;
        state.measureStartX = coords.x;
        state.measureStartY = coords.y;
        createMeasureVisuals(coords.x, coords.y);
        e.preventDefault(); // Empêche la sélection de texte
        return;
    }

    // 3. SORT ENFLAMMÉ (Ctrl + Clic)
    if (e.ctrlKey && e.button === 0) {
        state.isCastingSpell = true;
        state.spellStartX = coords.x;
        state.spellStartY = coords.y;
        createSpellVisual(coords.x, coords.y);
        e.preventDefault();
        return;
    }

    // 4. Dessin Brouillard (Seulement si mode édition ACTIF et PAS de touches spéciales)
    if (state.fogEditing && e.button === 0) {
        state.isDrawing = true;
        drawOnCanvas(e.clientX, e.clientY);
        return;
    }

    // 5. Interaction Pions
    if (e.target.closest('.pawn-wrapper')) return;

    // 6. Panoramique (Défaut)
    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    const coords = getMapCoordinates(e.clientX, e.clientY);

    // A. Mesure en cours
    if (state.isMeasuring) {
        updateMeasureVisuals(coords.x, coords.y);
        return;
    }

    // B. Sort en cours
    if (state.isCastingSpell) {
        updateSpellVisual(coords.x, coords.y);
        return;
    }

    // C. Panoramique
    if (state.panning) {
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
        return;
    }

    // D. Drag Pion
    if (state.draggingPawn) {
        e.preventDefault();
        const deltaX = e.clientX - state.dragLastX;
        const deltaY = e.clientY - state.dragLastY;
        state.dragLastX = e.clientX;
        state.dragLastY = e.clientY;
        const dx = deltaX / state.scale;
        const dy = deltaY / state.scale;
        const currentLeft = parseFloat(state.draggingPawn.style.left) || 0;
        const currentTop = parseFloat(state.draggingPawn.style.top) || 0;
        const img = state.draggingPawn.querySelector('.pawn');
        const currentSize = parseFloat(img.style.width) || DEFAULT_PAWN_SIZE;
        const newX = currentLeft + dx;
        const newY = currentTop + dy;
        state.draggingPawn.style.left = newX + 'px';
        state.draggingPawn.style.top = newY + 'px';
        revealFogAt(newX, newY, currentSize * 1.5);
        return;
    }
    
    // E. Dessin Brouillard
    if (state.isDrawing && state.fogEditing) {
        drawOnCanvas(e.clientX, e.clientY);
    }
});

window.addEventListener('mouseup', function() {
    state.panning = false;
    state.draggingPawn = null;
    state.isDrawing = false;
    
    // Fin Mesure (Suppression immédiate)
    if (state.isMeasuring) {
        state.isMeasuring = false;
        if (state.currentMeasureGroup) {
            state.currentMeasureGroup.remove();
            state.currentMeasureGroup = null;
        }
    }

    // Fin Sort (Persistance 5s)
    if (state.isCastingSpell) {
        state.isCastingSpell = false;
        const lineToKeep = state.currentSpellLine;
        state.currentSpellLine = null;
        setTimeout(() => { if(lineToKeep) lineToKeep.remove(); }, 5000);
    }

    if(state.fogEditing) {
        container.style.cursor = 'crosshair';
    } else {
        container.style.cursor = 'grab';
    }
});


// --- 3. LOGIQUE VISUELLE (SVG & Canvas) ---

function triggerExplosion(x, y) {
    const explosion = document.createElement('div');
    explosion.className = 'explosion-effect';
    explosion.style.left = x + 'px';
    explosion.style.top = y + 'px';
    mapWrapper.appendChild(explosion);
    // Nettoyage après l'animation (3s)
    setTimeout(() => { explosion.remove(); }, 3000);
}

function createMeasureVisuals(startX, startY) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", startX); line.setAttribute("y1", startY);
    line.setAttribute("x2", startX); line.setAttribute("y2", startY);
    line.setAttribute("class", "measure-line");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "measure-text-bg");
    rect.setAttribute("rx", "4");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "measure-text");
    text.textContent = "0 m";

    group.appendChild(line); group.appendChild(rect); group.appendChild(text);
    effectsLayer.appendChild(group);
    state.currentMeasureGroup = group;
}

function updateMeasureVisuals(currentX, currentY) {
    if (!state.currentMeasureGroup) return;
    const group = state.currentMeasureGroup;
    const line = group.querySelector('line');
    const text = group.querySelector('text');
    const rect = group.querySelector('rect');

    line.setAttribute("x2", currentX); line.setAttribute("y2", currentY);

    const dx = currentX - state.measureStartX;
    const dy = currentY - state.measureStartY;
    const distPx = Math.sqrt(dx*dx + dy*dy);
    const distMeters = (distPx / PIXELS_PER_METER).toFixed(1);

    text.textContent = distMeters + " m";
    
    // Position du texte (Milieu du segment)
    const midX = state.measureStartX + dx / 2;
    const midY = state.measureStartY + dy / 2;
    text.setAttribute("x", midX); text.setAttribute("y", midY);

    // Fond du texte
    const textWidth = 40 + (distMeters.length * 8); 
    const textHeight = 24;
    rect.setAttribute("x", midX - textWidth / 2);
    rect.setAttribute("y", midY - textHeight / 2);
    rect.setAttribute("width", textWidth);
    rect.setAttribute("height", textHeight);
}

function createSpellVisual(startX, startY) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", startX); line.setAttribute("y1", startY);
    line.setAttribute("x2", startX); line.setAttribute("y2", startY);
    line.setAttribute("class", "fire-line");
    effectsLayer.appendChild(line);
    state.currentSpellLine = line;
}

function updateSpellVisual(currentX, currentY) {
    if (!state.currentSpellLine) return;
    state.currentSpellLine.setAttribute("x2", currentX);
    state.currentSpellLine.setAttribute("y2", currentY);
}


// --- 4. RESTE DU CODE (Pions, Clavier, Chargement...) ---

window.addEventListener('keydown', (e) => {
    // Supprimer
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = state.draggingPawn || state.hoveredWrapper;
        if (target) {
            target.remove();
            state.draggingPawn = null;
            state.hoveredWrapper = null;
            container.style.cursor = 'grab';
        }
    }
    // Copier
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (state.hoveredWrapper) {
            const img = state.hoveredWrapper.querySelector('.pawn');
            const nameTag = state.hoveredWrapper.querySelector('.pawn-name');
            state.clipboard = {
                src: img.src,
                width: parseFloat(img.style.width),
                borderColor: img.style.borderColor,
                name: nameTag.textContent
            };
            const originalBorder = img.style.border;
            img.style.border = "5px solid white";
            setTimeout(() => { if(img) img.style.border = originalBorder; }, 100);
        }
    }
    // Coller
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (state.clipboard && viewerImage.src) {
            const rect = viewerImage.getBoundingClientRect();
            const scaleX = viewerImage.naturalWidth / rect.width;
            const scaleY = viewerImage.naturalHeight / rect.height;
            const x = (state.mouseX - rect.left) * scaleX;
            const y = (state.mouseY - rect.top) * scaleY;
            createPawnElement(
                state.clipboard.src, x, y, 
                state.clipboard.width, 
                state.clipboard.borderColor,
                state.clipboard.name
            );
        }
    }
});

pawnUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const fileName = file.name.split('.').slice(0, -1).join('.');
        const reader = new FileReader();
        reader.onload = function(event) {
            const mapWidth = viewerImage.naturalWidth || 800;
            const mapHeight = viewerImage.naturalHeight || 600;
            createPawnElement(event.target.result, mapWidth/2, mapHeight/2, DEFAULT_PAWN_SIZE, '#2ecc71', fileName);
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

function createPawnElement(src, x, y, size, color = '#2ecc71', name = 'Pion') {
    const wrapper = document.createElement('div');
    wrapper.className = 'pawn-wrapper';
    wrapper.style.left = x + 'px';
    wrapper.style.top = y + 'px';

    const nameTag = document.createElement('div');
    nameTag.className = 'pawn-name';
    nameTag.textContent = name;
    nameTag.title = name;

    const img = document.createElement('img');
    img.src = src;
    img.className = 'pawn';
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.borderColor = color;

    wrapper.appendChild(nameTag);
    wrapper.appendChild(img);

    const colors = ['#2ecc71', '#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#ffffff'];
    let colorIndex = colors.indexOf(color);
    if (colorIndex === -1) colorIndex = 0;

    wrapper.addEventListener('mousedown', function(e) {
        if(state.fogEditing) return;
        
        // Empêcher le drag si on veut faire un effet (Ctrl/Shift/Alt) sur le pion
        if(e.shiftKey || e.ctrlKey || e.altKey) return;

        e.stopPropagation();
        e.preventDefault();
        state.draggingPawn = wrapper;
        state.dragLastX = e.clientX;
        state.dragLastY = e.clientY;
        container.style.cursor = 'grabbing';
    });

    wrapper.addEventListener('mouseenter', () => { state.hoveredWrapper = wrapper; });
    wrapper.addEventListener('mouseleave', () => { state.hoveredWrapper = null; });

    wrapper.addEventListener('wheel', function(e) {
        e.stopPropagation();
        e.preventDefault();
        const currentSize = parseFloat(img.style.width) || DEFAULT_PAWN_SIZE;
        const direction = e.deltaY < 0 ? 1 : -1;
        let newSize = currentSize + (direction * 5);
        if (newSize < 20) newSize = 20;
        if (newSize > 500) newSize = 500;
        img.style.width = newSize + 'px';
        img.style.height = newSize + 'px';
    }, { passive: false });

    img.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        e.preventDefault();
        colorIndex = (colorIndex + 1) % colors.length;
        img.style.borderColor = colors[colorIndex];
    });

    nameTag.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        e.preventDefault();
        const newName = prompt("Nouveau nom :", nameTag.textContent);
        if (newName && newName.trim() !== "") {
            nameTag.textContent = newName.trim();
        }
    });

    mapWrapper.insertBefore(wrapper, fogCanvas);
    revealFogAt(x, y, size * 1.5);
}

imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            loadMapImage(event.target.result, true);
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

function loadMapImage(src, resetAll = false) {
    viewerImage.src = src;
    viewerImage.onload = function() {
        mapWrapper.style.display = 'block';
        
        // Configuration SVG
        effectsLayer.setAttribute("viewBox", `0 0 ${viewerImage.naturalWidth} ${viewerImage.naturalHeight}`);
        
        fogCanvas.width = viewerImage.naturalWidth;
        fogCanvas.height = viewerImage.naturalHeight;

        if (resetAll) {
            document.querySelectorAll('.pawn-wrapper').forEach(p => p.remove());
            fillFog();
            state.scale = 1;
            state.pointX = 0;
            state.pointY = 0;
            updateTransform();
        }
    }
}

function fillFog() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
}

function restoreFogAroundPawns() {
    const wrappers = document.querySelectorAll('.pawn-wrapper');
    wrappers.forEach(wrapper => {
        const x = parseFloat(wrapper.style.left);
        const y = parseFloat(wrapper.style.top);
        const img = wrapper.querySelector('.pawn');
        const w = parseFloat(img.style.width);
        if(!isNaN(x) && !isNaN(y)) revealFogAt(x, y, w * 1.5);
    });
}

function revealFogAt(x, y, radius) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
}

toggleFogVisBtn.addEventListener('click', () => {
    state.fogVisible = !state.fogVisible;
    fogCanvas.style.display = state.fogVisible ? 'block' : 'none';
    toggleFogVisBtn.classList.toggle('active', state.fogVisible);
});

toggleFogEditBtn.addEventListener('click', () => {
    state.fogEditing = !state.fogEditing;
    toggleFogEditBtn.classList.toggle('active', state.fogEditing);
    if (state.fogEditing) {
        mapWrapper.classList.add('editing-fog');
        container.classList.add('drawing-mode');
        container.style.cursor = 'crosshair';
        fogRevealBtn.classList.remove('hidden');
        fogHideBtn.classList.remove('hidden');
        fogResetBtn.classList.remove('hidden');
        setFogTool('reveal');
    } else {
        mapWrapper.classList.remove('editing-fog');
        container.classList.remove('drawing-mode');
        container.style.cursor = 'grab';
        fogRevealBtn.classList.add('hidden');
        fogHideBtn.classList.add('hidden');
        fogResetBtn.classList.add('hidden');
    }
});

function setFogTool(tool) {
    state.tool = tool;
    fogRevealBtn.classList.toggle('active', tool === 'reveal');
    fogHideBtn.classList.toggle('active', tool === 'hide');
}
fogRevealBtn.addEventListener('click', () => setFogTool('reveal'));
fogHideBtn.addEventListener('click', () => setFogTool('hide'));
fogResetBtn.addEventListener('click', () => { fillFog(); restoreFogAroundPawns(); });

function drawOnCanvas(clientX, clientY) {
    const rect = fogCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (fogCanvas.width / rect.width);
    const y = (clientY - rect.top) * (fogCanvas.height / rect.height);
    ctx.beginPath();
    ctx.arc(x, y, state.brushSize, 0, Math.PI * 2);
    if (state.tool === 'reveal') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'black';
    }
    ctx.fill();
}
fogCanvas.addEventListener('mousedown', (e) => {
    if (!state.fogEditing || e.button !== 0) return;
    state.isDrawing = true;
    drawOnCanvas(e.clientX, e.clientY);
});

saveSceneBtn.addEventListener('click', () => {
    if (!viewerImage.src || viewerImage.src === window.location.href) { alert("Aucune carte."); return; }
    const sceneName = prompt("Nom sauvegarde :", "MaScene"); if (!sceneName) return;
    const pawnsData = [];
    document.querySelectorAll('.pawn-wrapper').forEach(wrapper => {
        const img = wrapper.querySelector('.pawn');
        const nameTag = wrapper.querySelector('.pawn-name');
        pawnsData.push({
            src: img.src,
            x: parseFloat(wrapper.style.left),
            y: parseFloat(wrapper.style.top),
            w: parseFloat(img.style.width),
            c: img.style.borderColor,
            name: nameTag.textContent
        });
    });
    const sceneData = {
        version: "1.1",
        mapSrc: viewerImage.src,
        fogData: fogCanvas.toDataURL(),
        pawns: pawnsData,
        view: { scale: state.scale, x: state.pointX, y: state.pointY }
    };
    const jsonString = JSON.stringify(sceneData);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${sceneName}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
});

sceneUpload.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try { restoreScene(JSON.parse(event.target.result)); } catch (err) { console.error(err); alert("Erreur fichier."); }
    };
    reader.readAsText(file); e.target.value = '';
});

function restoreScene(scene) {
    document.querySelectorAll('.pawn-wrapper').forEach(p => p.remove());
    viewerImage.src = scene.mapSrc;
    viewerImage.onload = function() {
        mapWrapper.style.display = 'block';
        effectsLayer.setAttribute("viewBox", `0 0 ${viewerImage.naturalWidth} ${viewerImage.naturalHeight}`);
        fogCanvas.width = viewerImage.naturalWidth;
        fogCanvas.height = viewerImage.naturalHeight;
        const fogImg = new Image();
        fogImg.onload = function() {
            ctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(fogImg, 0, 0);
        };
        fogImg.src = scene.fogData;
        if (scene.pawns) scene.pawns.forEach(p => createPawnElement(p.src, p.x, p.y, p.w, p.c, p.name || "Pion"));
        if (scene.view) { state.scale = scene.view.scale; state.pointX = scene.view.x; state.pointY = scene.view.y; updateTransform(); }
    }
}

function openModal(modal) { modal.style.display = 'block'; }
function closeModal(modal) { modal.style.display = 'none'; }
helpBtn.addEventListener('click', () => openModal(helpModal));
closeHelpModal.addEventListener('click', () => closeModal(helpModal));
window.addEventListener('click', (e) => { if (e.target === helpModal) closeModal(helpModal); });