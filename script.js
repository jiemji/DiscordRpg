// Sélection des éléments
const imageUpload = document.getElementById('imageUpload');
const pawnUpload = document.getElementById('pawnUpload');
const viewerImage = document.getElementById('viewerImage');
const mapWrapper = document.getElementById('mapWrapper');
const fogCanvas = document.getElementById('fogCanvas');
const container = document.getElementById('imageContainer');

// Boutons
const resetBtn = document.getElementById('resetBtn');
const toggleFogVisBtn = document.getElementById('toggleFogVisBtn'); // Visibilité
const toggleFogEditBtn = document.getElementById('toggleFogEditBtn'); // Édition
const fogRevealBtn = document.getElementById('fogRevealBtn');
const fogHideBtn = document.getElementById('fogHideBtn');
const fogResetBtn = document.getElementById('fogResetBtn');

const ctx = fogCanvas.getContext('2d');

// --- CONSTANTES ---
const PAWN_DIAMETER = 60; // Diamètre du pion en pixels

// État de l'application
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
    
    // Pions
    draggingPawn: null
};

// --- 1. GESTION DE LA VUE ---

function updateTransform() {
    mapWrapper.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

function resetView() {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
}

resetBtn.addEventListener('click', resetView);

container.addEventListener('wheel', function(e) {
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

container.addEventListener('mousedown', function(e) {
    if (state.fogEditing && e.button === 0) return; 
    if (state.draggingPawn) return;
    if (e.button !== 0 && e.button !== 1) return;

    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
    // A. Pan de la carte
    if (state.panning) {
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
        return;
    }

    // B. Déplacement Pion (+ Dissipation)
    if (state.draggingPawn) {
        e.preventDefault();
        const dx = e.movementX / state.scale;
        const dy = e.movementY / state.scale;

        const currentLeft = parseFloat(state.draggingPawn.style.left) || 0;
        const currentTop = parseFloat(state.draggingPawn.style.top) || 0;

        const newX = currentLeft + dx;
        const newY = currentTop + dy;

        state.draggingPawn.style.left = newX + 'px';
        state.draggingPawn.style.top = newY + 'px';
        
        // Dissipation automatique (Centre du pion, rayon = 2 * diamètre)
        revealFogAt(newX, newY, 2 * PAWN_DIAMETER);
        
        return;
    }
    
    // C. Dessin manuel Brouillard
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


// --- 2. CHARGEMENT CARTE & PIONS ---

imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            viewerImage.src = event.target.result;
            viewerImage.onload = function() {
                mapWrapper.style.display = 'block';
                fogCanvas.width = viewerImage.naturalWidth;
                fogCanvas.height = viewerImage.naturalHeight;
                fillFog();
                resetView();
            }
        };
        reader.readAsDataURL(file);
    }
});

pawnUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            createPawn(event.target.result);
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

function createPawn(imgSrc) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.className = 'pawn';
    
    // Taille via la constante
    img.style.width = PAWN_DIAMETER + 'px';
    img.style.height = PAWN_DIAMETER + 'px';
    
    // Position initiale : Centre
    const mapWidth = viewerImage.naturalWidth || 1000;
    const mapHeight = viewerImage.naturalHeight || 1000;
    const centerX = mapWidth / 2;
    const centerY = mapHeight / 2;
    
    img.style.left = centerX + 'px';
    img.style.top = centerY + 'px';
    
    // Événement Drag
    img.addEventListener('mousedown', function(e) {
        if(state.fogEditing) return;
        e.stopPropagation();
        e.preventDefault();
        state.draggingPawn = img;
        container.style.cursor = 'grabbing';
    });
    
    mapWrapper.insertBefore(img, fogCanvas);
    
    // Révéler le brouillard à la création
    revealFogAt(centerX, centerY, 2 * PAWN_DIAMETER);
}


// --- 3. BROUILLARD DE GUERRE ---

function fillFog() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
}

// Fonction générique pour révéler une zone
function revealFogAt(x, y, radius) {
    // x, y sont les coordonnées locales dans le canvas
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
}

// A. Visibilité du Brouillard
toggleFogVisBtn.addEventListener('click', () => {
    state.fogVisible = !state.fogVisible;
    if (state.fogVisible) {
        toggleFogVisBtn.classList.add('active');
        fogCanvas.style.display = 'block';
    } else {
        toggleFogVisBtn.classList.remove('active');
        fogCanvas.style.display = 'none';
    }
});

// B. Mode Édition (Dessin)
toggleFogEditBtn.addEventListener('click', () => {
    state.fogEditing = !state.fogEditing;
    
    if (state.fogEditing) {
        toggleFogEditBtn.classList.add('active');
        mapWrapper.classList.add('editing-fog');
        container.classList.add('drawing-mode');
        container.style.cursor = 'crosshair';
        fogRevealBtn.classList.remove('hidden');
        fogHideBtn.classList.remove('hidden');
        fogResetBtn.classList.remove('hidden');
        setFogTool('reveal');
    } else {
        toggleFogEditBtn.classList.remove('active');
        mapWrapper.classList.remove('editing-fog');
        container.classList.remove('drawing-mode');
        container.style.cursor = 'grab';
        fogRevealBtn.classList.add('hidden');
        fogHideBtn.classList.add('hidden');
        fogResetBtn.classList.add('hidden');
    }
});

function setFogTool(toolName) {
    state.tool = toolName;
    if (toolName === 'reveal') {
        fogRevealBtn.classList.add('active');
        fogHideBtn.classList.remove('active');
    } else {
        fogRevealBtn.classList.remove('active');
        fogHideBtn.classList.add('active');
    }
}

fogRevealBtn.addEventListener('click', () => setFogTool('reveal'));
fogHideBtn.addEventListener('click', () => setFogTool('hide'));
fogResetBtn.addEventListener('click', fillFog);

// Dessin Manuel
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