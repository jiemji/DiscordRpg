// Sélection des éléments
const imageUpload = document.getElementById('imageUpload');
const pawnUpload = document.getElementById('pawnUpload');
const viewerImage = document.getElementById('viewerImage');
const mapWrapper = document.getElementById('mapWrapper');
const fogCanvas = document.getElementById('fogCanvas');
const container = document.getElementById('imageContainer');

// Boutons
const resetBtn = document.getElementById('resetBtn');
const toggleFogVisBtn = document.getElementById('toggleFogVisBtn');
const toggleFogEditBtn = document.getElementById('toggleFogEditBtn');
const fogRevealBtn = document.getElementById('fogRevealBtn');
const fogHideBtn = document.getElementById('fogHideBtn');
const fogResetBtn = document.getElementById('fogResetBtn');

// AIDE
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeModal = document.querySelector('.close-modal');

const ctx = fogCanvas.getContext('2d');

// --- CONSTANTES ---
const DEFAULT_PAWN_SIZE = 60; // Correction : Retour à 60px
const DB_NAME = 'DiscordRpgDB';
const DB_VERSION = 1;

// Cycle de couleurs : Vert, Rouge, Bleu, Jaune, Blanc, Noir
const BORDER_COLORS = ['#2ecc71', '#e74c3c', '#3498db', '#f1c40f', '#ffffff', '#000000'];

// État de l'application
let state = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    
    fogVisible: true,
    fogEditing: false,
    isDrawing: false,
    tool: 'reveal',
    brushSize: 60,
    
    draggingPawn: null
};

// --- GESTION DE L'AIDE (MODAL) ---
helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// Fermer si on clique en dehors du contenu
window.addEventListener('click', (e) => {
    if (e.target == helpModal) {
        helpModal.style.display = 'none';
    }
});


// --- 1. GESTION DE LA VUE & INTERACTION ---

function updateTransform() {
    mapWrapper.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

function resetView() {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
    saveData();
}

resetBtn.addEventListener('click', resetView);

// GESTION MOLETTE : Zoom Carte OU Redimensionnement Pion
container.addEventListener('wheel', function(e) {
    e.preventDefault();

    // CAS 1 : REDIMENSIONNEMENT DU PION (Clic gauche maintenu)
    if (state.draggingPawn) {
        let currentSize = parseFloat(state.draggingPawn.style.width) || DEFAULT_PAWN_SIZE;
        const delta = e.deltaY < 0 ? 5 : -5; 
        let newSize = currentSize + delta;

        if (newSize < 20) newSize = 20;
        if (newSize > 600) newSize = 600;

        state.draggingPawn.style.width = newSize + 'px';
        state.draggingPawn.style.height = newSize + 'px';
        
        clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(saveData, 500);
        return; 
    }

    // CAS 2 : ZOOM CARTE
    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + (direction * zoomIntensity);
    const newScale = state.scale * factor;
    if (newScale < 0.1 || newScale > 20) return;

    state.pointX *= factor;
    state.pointY *= factor;
    state.scale = newScale;
    updateTransform();
    
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(saveData, 500); 
}, { passive: false });

// GESTION CLAVIER : Suppression
window.addEventListener('keydown', (e) => {
    // Supprimer pion si tenu + Suppr
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.draggingPawn) {
        state.draggingPawn.remove();
        state.draggingPawn = null;
        container.style.cursor = 'grab';
        saveData(); 
    }
});

// Souris Enfoncée
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

// Souris Bouge
window.addEventListener('mousemove', function(e) {
    // Pan Carte
    if (state.panning) {
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
        return;
    }

    // Drag Pion
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
        
        // Dissipation dynamique
        const currentSize = parseFloat(state.draggingPawn.style.width) || DEFAULT_PAWN_SIZE;
        revealFogAt(newX, newY, currentSize);
        return;
    }
    
    // Dessin
    if (state.isDrawing && state.fogEditing) {
        drawOnCanvas(e.clientX, e.clientY);
    }
});

// Souris Relâchée
window.addEventListener('mouseup', function() {
    const wasMoving = state.panning || state.draggingPawn;
    const wasDrawing = state.isDrawing;

    state.panning = false;
    state.draggingPawn = null;
    state.isDrawing = false;
    
    container.style.cursor = state.fogEditing ? 'crosshair' : 'grab';

    if (wasMoving) saveData(); 
    if (wasDrawing) saveFog(); 
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
                saveMap(event.target.result);
                saveFog();
                saveData();
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
            createPawn({ src: event.target.result });
            saveData();
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

function createPawn(options) {
    const img = document.createElement('img');
    img.src = options.src;
    img.className = 'pawn';
    
    // Taille
    const size = options.width || DEFAULT_PAWN_SIZE;
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    
    // Position
    let startX, startY;
    if (options.left && options.top) {
        startX = options.left;
        startY = options.top;
    } else {
        const mapWidth = viewerImage.naturalWidth || 1000;
        const mapHeight = viewerImage.naturalHeight || 1000;
        startX = (mapWidth / 2) + 'px';
        startY = (mapHeight / 2) + 'px';
    }
    img.style.left = startX;
    img.style.top = startY;

    // Couleur
    let cIndex = options.colorIndex !== undefined ? options.colorIndex : 0;
    img.dataset.colorIndex = cIndex;
    img.style.borderColor = BORDER_COLORS[cIndex];

    // Interactions
    img.addEventListener('mousedown', function(e) {
        if(state.fogEditing) return;
        e.stopPropagation();
        e.preventDefault();
        state.draggingPawn = img;
        container.style.cursor = 'grabbing';
    });

    img.addEventListener('dblclick', function(e) {
        if(state.fogEditing) return;
        e.stopPropagation();
        
        let idx = parseInt(img.dataset.colorIndex) || 0;
        idx = (idx + 1) % BORDER_COLORS.length;
        
        img.dataset.colorIndex = idx;
        img.style.borderColor = BORDER_COLORS[idx];
        
        saveData();
    });
    
    mapWrapper.insertBefore(img, fogCanvas);
    
    // Révélation auto si nouveau pion
    if (!options.left) {
        const cx = parseFloat(startX);
        const cy = parseFloat(startY);
        revealFogAt(cx, cy, size);
        saveFog();
    }
}


// --- 3. BROUILLARD DE GUERRE ---

function fillFog() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
}

function revealFogAt(x, y, radius) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
}

toggleFogVisBtn.addEventListener('click', () => {
    state.fogVisible = !state.fogVisible;
    fogCanvas.style.display = state.fogVisible ? 'block' : 'none';
    if(state.fogVisible) toggleFogVisBtn.classList.add('active');
    else toggleFogVisBtn.classList.remove('active');
    saveData();
});

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
fogResetBtn.addEventListener('click', () => { fillFog(); saveFog(); });

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


// --- 4. GESTION DE LA BASE DE DONNÉES (INDEXED DB) ---

let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
            db = event.target.result;
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
        };
        request.onsuccess = function(event) {
            db = event.target.result;
            resolve(db);
        };
        request.onerror = function(event) {
            console.error("Erreur DB:", event.target.errorCode);
            reject("Erreur init DB");
        };
    });
}

function dbPut(storeName, data) {
    if (!db) return;
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    store.put(data);
}

function dbGet(storeName, id) {
    return new Promise((resolve) => {
        if (!db) { resolve(null); return; }
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ? request.result.val : null);
        request.onerror = () => resolve(null);
    });
}

// --- FONCTIONS DE SAUVEGARDE ---

function saveData() {
    const pawnsData = [];
    document.querySelectorAll('.pawn').forEach(p => {
        pawnsData.push({
            src: p.src, 
            left: p.style.left,
            top: p.style.top,
            width: parseFloat(p.style.width) || DEFAULT_PAWN_SIZE,
            colorIndex: parseInt(p.dataset.colorIndex) || 0
        });
    });

    const dataObj = { state: state, pawns: pawnsData };
    dbPut('settings', { id: 'app_data', val: dataObj });
}

function saveMap(src = null) {
    const imageSrc = src || viewerImage.src;
    if(imageSrc && imageSrc.length > 50) {
        dbPut('settings', { id: 'map_image', val: imageSrc });
    }
}

function saveFog() {
    const fogData = fogCanvas.toDataURL();
    dbPut('settings', { id: 'fog_image', val: fogData });
}

// --- CHARGEMENT AU DÉMARRAGE ---

async function loadSystem() {
    try {
        await initDB(); 
        
        const mapSrc = await dbGet('settings', 'map_image');
        const fogData = await dbGet('settings', 'fog_image');
        const appData = await dbGet('settings', 'app_data');

        if (mapSrc) {
            viewerImage.src = mapSrc;
            viewerImage.onload = function() {
                mapWrapper.style.display = 'block';
                fogCanvas.width = viewerImage.naturalWidth;
                fogCanvas.height = viewerImage.naturalHeight;

                if (fogData) {
                    const fogImg = new Image();
                    fogImg.onload = function() {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.drawImage(fogImg, 0, 0);
                    };
                    fogImg.src = fogData;
                } else {
                    fillFog();
                }

                if (appData) {
                    state = { ...state, ...appData.state };
                    updateTransform();

                    if (!state.fogVisible) {
                        fogCanvas.style.display = 'none';
                        toggleFogVisBtn.classList.remove('active');
                    } else {
                        fogCanvas.style.display = 'block';
                        toggleFogVisBtn.classList.add('active');
                    }

                    document.querySelectorAll('.pawn').forEach(p => p.remove());
                    if (appData.pawns && appData.pawns.length > 0) {
                        appData.pawns.forEach(pData => {
                            createPawn({
                                src: pData.src, 
                                left: pData.left, 
                                top: pData.top,
                                width: pData.width,
                                colorIndex: pData.colorIndex
                            });
                        });
                    }
                } else {
                    resetView();
                }
            };
        }
    } catch (e) {
        console.error("Erreur lors du chargement :", e);
    }
}

loadSystem();