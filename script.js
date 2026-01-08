// --- SÉLECTION DES ÉLÉMENTS DOM ---

// Inputs fichiers
const imageUpload = document.getElementById('imageUpload');
const pawnUpload = document.getElementById('pawnUpload');
const sceneUpload = document.getElementById('sceneUpload');

// Conteneurs de la carte
const container = document.getElementById('imageContainer');
const mapWrapper = document.getElementById('mapWrapper');
const viewerImage = document.getElementById('viewerImage');
const fogCanvas = document.getElementById('fogCanvas');
const ctx = fogCanvas.getContext('2d');

// Boutons
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
    draggingPawn: null, // Ce sera désormais le Wrapper
    dragLastX: 0,
    dragLastY: 0,
    
    // Suivi pour Copier/Coller
    mouseX: 0,
    mouseY: 0,
    hoveredWrapper: null, // Remplace hoveredPawn
    clipboard: null
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

container.addEventListener('wheel', function(e) {
    // On ignore le zoom map si on redimensionne un pion
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

container.addEventListener('mousedown', function(e) {
    if (state.fogEditing && e.button === 0) return; 
    if (e.target.closest('.pawn-wrapper')) return;
    if (e.button !== 0 && e.button !== 1) return;

    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});


// --- 2. GESTION SOURIS GLOBALE ---

window.addEventListener('mousemove', function(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;

    // A. Pan de la Carte
    if (state.panning) {
        e.preventDefault();
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
        return;
    }

    // B. Déplacement Pion (Déplace le Wrapper)
    if (state.draggingPawn) {
        e.preventDefault();
        
        const deltaX = e.clientX - state.dragLastX;
        const deltaY = e.clientY - state.dragLastY;
        
        state.dragLastX = e.clientX;
        state.dragLastY = e.clientY;

        const dx = deltaX / state.scale;
        const dy = deltaY / state.scale;

        // On récupère les coords du wrapper
        const currentLeft = parseFloat(state.draggingPawn.style.left) || 0;
        const currentTop = parseFloat(state.draggingPawn.style.top) || 0;
        
        // Pour la dissipation, on a besoin de la taille de l'image interne
        const img = state.draggingPawn.querySelector('.pawn');
        const currentSize = parseFloat(img.style.width) || DEFAULT_PAWN_SIZE;

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


// --- GESTION CLAVIER (Suppr, Copier, Coller) ---

window.addEventListener('keydown', (e) => {
    // 1. SUPPRIMER
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = state.draggingPawn || state.hoveredWrapper;
        if (target) {
            target.remove();
            state.draggingPawn = null;
            state.hoveredWrapper = null;
            container.style.cursor = 'grab';
        }
    }

    // 2. COPIER
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
            
            // Feedback visuel
            const originalBorder = img.style.border;
            img.style.border = "5px solid white";
            setTimeout(() => {
                if(img) img.style.border = originalBorder;
            }, 100);
        }
    }

    // 3. COLLER
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (state.clipboard && viewerImage.src) {
            const rect = viewerImage.getBoundingClientRect();
            const x = (state.mouseX - rect.left) * (viewerImage.naturalWidth / rect.width);
            const y = (state.mouseY - rect.top) * (viewerImage.naturalHeight / rect.height);
            
            createPawnElement(
                state.clipboard.src, 
                x, 
                y, 
                state.clipboard.width, 
                state.clipboard.borderColor,
                state.clipboard.name
            );
        }
    }
});


// --- 3. LOGIQUE DES PIONS ---

pawnUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        // Extraction du nom de fichier sans extension
        // Ex: "Gobelin.png" -> "Gobelin"
        const fileName = file.name.split('.').slice(0, -1).join('.');

        const reader = new FileReader();
        reader.onload = function(event) {
            const mapWidth = viewerImage.naturalWidth || 800;
            const mapHeight = viewerImage.naturalHeight || 600;
            let x = mapWidth / 2; 
            let y = mapHeight / 2;
            
            createPawnElement(
                event.target.result, 
                x, 
                y, 
                DEFAULT_PAWN_SIZE, 
                '#2ecc71', // Couleur par défaut
                fileName   // Nom du fichier
            );
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
});

// Fonction mise à jour pour inclure le nom et le wrapper
function createPawnElement(src, x, y, size, color = '#2ecc71', name = 'Pion') {
    // 1. Création du Wrapper (Conteneur principal)
    const wrapper = document.createElement('div');
    wrapper.className = 'pawn-wrapper';
    wrapper.style.left = x + 'px';
    wrapper.style.top = y + 'px';

    // 2. Création de la Cartouche de Nom
    const nameTag = document.createElement('div');
    nameTag.className = 'pawn-name';
    nameTag.textContent = name;
    nameTag.title = name; // Tooltip au survol si le texte est coupé

    // 3. Création de l'Image
    const img = document.createElement('img');
    img.src = src;
    img.className = 'pawn';
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.borderColor = color;

    // Assemblage
    wrapper.appendChild(nameTag);
    wrapper.appendChild(img);

    // --- EVENEMENTS ---
    
    // Palette de couleurs (Cycle)
    const colors = ['#2ecc71', '#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#ffffff'];
    let colorIndex = colors.indexOf(color);
    if (colorIndex === -1) colorIndex = 0;

    // A. Drag Start (Sur le wrapper ou l'image)
    wrapper.addEventListener('mousedown', function(e) {
        if(state.fogEditing) return;
        // Si on clique spécifiquement sur le nom pour éditer, on ne drag pas tout de suite si c'est un double clic
        // Mais mousedown se déclenche avant dblclick. On gère le drag ici.
        e.stopPropagation();
        e.preventDefault();
        
        state.draggingPawn = wrapper;
        state.dragLastX = e.clientX;
        state.dragLastY = e.clientY;
        container.style.cursor = 'grabbing';
    });

    // B. Détection Survol (Pour Copier/Supprimer)
    wrapper.addEventListener('mouseenter', () => { state.hoveredWrapper = wrapper; });
    wrapper.addEventListener('mouseleave', () => { state.hoveredWrapper = null; });

    // C. Resize (Molette sur l'image UNIQUEMENT ou le wrapper ?)
    // Le wrapper capture, mais on redimensionne l'IMG seulement.
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

    // D. Changement Couleur (Double Clic sur l'IMAGE)
    img.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        e.preventDefault();
        colorIndex = (colorIndex + 1) % colors.length;
        img.style.borderColor = colors[colorIndex];
    });

    // E. Changement de Nom (Double Clic sur le NOM)
    nameTag.addEventListener('dblclick', function(e) {
        e.stopPropagation(); // Empêche la propagation
        e.preventDefault();
        
        // Petit prompt natif pour modifier le nom
        const newName = prompt("Nouveau nom du pion :", nameTag.textContent);
        if (newName !== null && newName.trim() !== "") {
            nameTag.textContent = newName.trim();
            nameTag.title = newName.trim();
        }
    });

    // Insertion dans le DOM
    mapWrapper.insertBefore(wrapper, fogCanvas);
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
    // Note: on sélectionne maintenant les wrappers pour trouver la position
    const wrappers = document.querySelectorAll('.pawn-wrapper');
    wrappers.forEach(wrapper => {
        const x = parseFloat(wrapper.style.left);
        const y = parseFloat(wrapper.style.top);
        
        const img = wrapper.querySelector('.pawn');
        const w = parseFloat(img.style.width);
        
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


// --- 5. SYSTÈME DE SCÈNES (JSON) ---

saveSceneBtn.addEventListener('click', () => {
    if (!viewerImage.src || viewerImage.src === window.location.href) {
        alert("Aucune carte chargée à sauvegarder.");
        return;
    }
    
    const sceneName = prompt("Nom du fichier de sauvegarde :", "MaScene");
    if (!sceneName) return;

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
            name: nameTag.textContent // On sauvegarde le nom
        });
    });

    const sceneData = {
        version: "1.1", // Petite incrémentation de version
        mapSrc: viewerImage.src,
        fogData: fogCanvas.toDataURL(),
        pawns: pawnsData,
        view: { scale: state.scale, x: state.pointX, y: state.pointY }
    };

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
    document.querySelectorAll('.pawn-wrapper').forEach(p => p.remove());

    viewerImage.src = scene.mapSrc;
    viewerImage.onload = function() {
        mapWrapper.style.display = 'block';
        fogCanvas.width = viewerImage.naturalWidth;
        fogCanvas.height = viewerImage.naturalHeight;

        const fogImg = new Image();
        fogImg.onload = function() {
            ctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            ctx.globalCompositeOperation = 'source-over'; 
            ctx.drawImage(fogImg, 0, 0);
        };
        fogImg.src = scene.fogData;

        if (scene.pawns) {
            scene.pawns.forEach(pData => {
                // On passe le nom sauvegardé, ou une valeur par défaut si c'est une vieille sauvegarde
                createPawnElement(pData.src, pData.x, pData.y, pData.w, pData.c, pData.name || "Pion");
            });
        }

        if (scene.view) {
            state.scale = scene.view.scale;
            state.pointX = scene.view.x;
            state.pointY = scene.view.y;
            updateTransform();
        }
    }
}


// --- 6. MODALES ---

function openModal(modal) { modal.style.display = 'block'; }
function closeModal(modal) { modal.style.display = 'none'; }

helpBtn.addEventListener('click', () => openModal(helpModal));
closeHelpModal.addEventListener('click', () => closeModal(helpModal));

window.addEventListener('click', (e) => {
    if (e.target === helpModal) closeModal(helpModal);
});