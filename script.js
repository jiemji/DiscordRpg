// --- SÉLECTION DES ÉLÉMENTS DOM ---

// Inputs fichiers
const imageUpload = document.getElementById('imageUpload');
const pawnUpload = document.getElementById('pawnUpload');
const sceneUpload = document.getElementById('sceneUpload'); // NOUVEAU

// Conteneurs de la carte
const container = document.getElementById('imageContainer');
const mapWrapper = document.getElementById('mapWrapper');
const viewerImage = document.getElementById('viewerImage');
const fogCanvas = document.getElementById('fogCanvas');
const ctx = fogCanvas.getContext('2d');

// Boutons de la barre d'outils
const resetBtn = document.getElementById('resetBtn');
const toggleFogVisBtn = document.getElementById('toggleFogVisBtn');
const toggleFogEditBtn = document.getElementById('toggleFogEditBtn');
const fogRevealBtn = document.getElementById('fogRevealBtn');
const fogHideBtn = document.getElementById('fogHideBtn');
const fogResetBtn = document.getElementById('fogResetBtn');

const saveSceneBtn = document.getElementById('saveSceneBtn');
const helpBtn = document.getElementById('helpBtn');

// Modale Aide
const helpModal = document.getElementById('helpModal');
const closeHelpModal = document.getElementById('closeHelpModal');


// --- CONSTANTES & ÉTAT ---
const DEFAULT_PAWN_SIZE = 60;
let state = {
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
    
    // Pions
    draggingPawn: null,
    dragLastX: 0,
    dragLastY: 0
};


// --- 1. GESTION DE LA VUE (ZOOM & PAN) ---

function updateTransform() {
    mapWrapper.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

resetBtn.addEventListener('click', () => {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
});

// Zoom global
container.addEventListener('wheel', function(e) {
    if (e.target.classList.contains('pawn')) return;
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

// Panoramique
container.addEventListener('mousedown', function(e) {
    if (state.fogEditing && e.button === 0) return; 
    if (e.target.classList.contains('pawn')) return;
    if (e.button !== 0 && e.button !== 1) return;

    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

// --- 2. GESTION SOURIS GLOBALE ---

window.addEventListener('mousemove', function(e) {
    // A. Pan de la Carte
    if (state.panning) {
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
        return;
    }

    // B. Déplacement Pion
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
        const currentSize = parseFloat(state.draggingPawn.style.width) || DEFAULT_PAWN_SIZE;

        const newX = currentLeft + dx;
        const newY = currentTop + dy;

        state.draggingPawn.style.left = newX + 'px';
        state.draggingPawn.style.top = newY + 'px';
        
        revealFogAt(newX, newY, currentSize * 1.5);
        
        return;
    }
    
    // C. Dessin Brouillard
    if (state.isDrawing && state.fogEditing) {
        drawOnCanvas(e.clientX, e.clientY);
    }
});

window.addEventListener('mouseup', function() {
    state.panning = false;
    state.draggingPawn = null;
    state.isDrawing = false;
    
    if(state.fogEditing) {
        container.style.cursor = 'crosshair';
    } else {
        container.style.cursor = 'grab';
    }
});

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.draggingPawn) {
        state.draggingPawn.remove();
        state.draggingPawn = null;
        container.style.cursor = 'grab';
    }
});


// --- 3. LOGIQUE DES PIONS ---

pawnUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const mapWidth = viewerImage.naturalWidth || 800;
            const mapHeight = viewerImage.naturalHeight || 600;
            let x = mapWidth / 2; 
            let y = mapHeight / 2;
            createPawnElement(event.target.result, x, y, DEFAULT_PAWN_SIZE);
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

function createPawnElement(src, x, y, size, color = '#2ecc71') {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'pawn';
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.left = x + 'px';
    img.style.top = y + 'px';
    img.style.borderColor = color;
    
    // Palette de couleurs (Cycle)
    const colors = ['#2ecc71', '#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#ffffff'];
    
    // On essaie de deviner l'index actuel pour ne pas "sauter" au premier clic
    // (Note : simple vérification, si la couleur est en RGB suite à une sauvegarde, on partira de 0)
    let colorIndex = colors.indexOf(color);
    if (colorIndex === -1) colorIndex = 0;

    // 1. Drag Start
    img.addEventListener('mousedown', function(e) {
        if(state.fogEditing) return;
        e.stopPropagation();
        e.preventDefault();
        state.draggingPawn = img;
        state.dragLastX = e.clientX;
        state.dragLastY = e.clientY;
        container.style.cursor = 'grabbing';
    });

    // 2. Redimensionnement (Molette)
    img.addEventListener('wheel', function(e) {
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

    // 3. Changement de couleur (Double clic - CYCLE)
    img.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        e.preventDefault(); // Empêche les effets de bord (zoom/sélection)
        
        // On passe à la couleur suivante
        colorIndex = (colorIndex + 1) % colors.length;
        img.style.borderColor = colors[colorIndex];
    });

    mapWrapper.insertBefore(img, fogCanvas);
    revealFogAt(x, y, size * 1.5);
}


// --- 4. CARTE & BROUILLARD ---

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
        fogCanvas.width = viewerImage.naturalWidth;
        fogCanvas.height = viewerImage.naturalHeight;

        if (resetAll) {
            document.querySelectorAll('.pawn').forEach(p => p.remove());
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
    const pawns = document.querySelectorAll('.pawn');
    pawns.forEach(pawn => {
        const x = parseFloat(pawn.style.left);
        const y = parseFloat(pawn.style.top);
        const w = parseFloat(pawn.style.width);
        if(!isNaN(x) && !isNaN(y)) {
             revealFogAt(x, y, w * 1.5);
        }
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

// Contrôles Brouillard
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
fogResetBtn.addEventListener('click', () => {
    fillFog();
    restoreFogAroundPawns();
});

// Dessin manuel
function drawOnCanvas(clientX, clientY) {
    const rect = fogCanvas.getBoundingClientRect();
    const scaleX = fogCanvas.width / rect.width;
    const scaleY = fogCanvas.height / rect.height;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

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


// --- 5. SYSTÈME DE SCÈNES (IMPORT / EXPORT FICHIERS JSON) ---

// A. SAUVEGARDER (Télécharger)
saveSceneBtn.addEventListener('click', () => {
    if (!viewerImage.src || viewerImage.src === window.location.href) {
        alert("Aucune carte chargée à sauvegarder.");
        return;
    }
    
    const sceneName = prompt("Nom du fichier de sauvegarde :", "MaScene");
    if (!sceneName) return;

    // 1. Récupérer les pions
    const pawnsData = [];
    document.querySelectorAll('.pawn').forEach(p => {
        pawnsData.push({
            src: p.src,
            x: parseFloat(p.style.left),
            y: parseFloat(p.style.top),
            w: parseFloat(p.style.width),
            c: p.style.borderColor
        });
    });

    // 2. Créer l'objet Scène
    const sceneData = {
        version: "1.0",
        mapSrc: viewerImage.src,
        fogData: fogCanvas.toDataURL(),
        pawns: pawnsData,
        view: { scale: state.scale, x: state.pointX, y: state.pointY }
    };

    // 3. Télécharger
    const jsonString = JSON.stringify(sceneData);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sceneName}.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// B. CHARGER (Lire Fichier)
sceneUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const sceneData = JSON.parse(event.target.result);
            restoreScene(sceneData);
        } catch (err) {
            console.error(err);
            alert("Erreur : Fichier de scène invalide.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

function restoreScene(scene) {
    // 1. Nettoyer
    document.querySelectorAll('.pawn').forEach(p => p.remove());

    // 2. Charger Carte
    viewerImage.src = scene.mapSrc;
    viewerImage.onload = function() {
        mapWrapper.style.display = 'block';
        fogCanvas.width = viewerImage.naturalWidth;
        fogCanvas.height = viewerImage.naturalHeight;

        // 3. Restaurer le brouillard
        const fogImg = new Image();
        fogImg.onload = function() {
            ctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            ctx.globalCompositeOperation = 'source-over'; 
            ctx.drawImage(fogImg, 0, 0);
        };
        fogImg.src = scene.fogData;

        // 4. Restaurer les pions
        if (scene.pawns) {
            scene.pawns.forEach(pData => {
                createPawnElement(pData.src, pData.x, pData.y, pData.w, pData.c);
            });
        }

        // 5. Restaurer la vue
        if (scene.view) {
            state.scale = scene.view.scale;
            state.pointX = scene.view.x;
            state.pointY = scene.view.y;
            updateTransform();
        }
    }
}


// --- 6. MODALE D'AIDE ---

function openModal(modal) { modal.style.display = 'block'; }
function closeModal(modal) { modal.style.display = 'none'; }

helpBtn.addEventListener('click', () => openModal(helpModal));
closeHelpModal.addEventListener('click', () => closeModal(helpModal));

window.addEventListener('click', (e) => {
    if (e.target === helpModal) closeModal(helpModal);
});