// Sélection des éléments
const imageUpload = document.getElementById('imageUpload');
const viewerImage = document.getElementById('viewerImage');
const mapLayer = document.getElementById('mapLayer'); // NOUVELLE CIBLE
const container = document.getElementById('imageContainer');
const resetBtn = document.getElementById('resetBtn');
const addPawnBtn = document.getElementById('addPawnBtn');

// État de l'application (Vue)
let state = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0
};

// État pour le déplacement des pions
let pawnDrag = {
    active: false,
    element: null,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
};

// Application des transformations CSS sur le CALQUE
function updateTransform() {
    mapLayer.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

function resetView() {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
}

resetBtn.addEventListener('click', resetView);

// --- GESTION DU CHARGEMENT IMAGE ---
imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            viewerImage.src = event.target.result;
            // On supprime les anciens pions lors d'un nouveau chargement
            const oldPawns = document.querySelectorAll('.pawn');
            oldPawns.forEach(p => p.remove());
            
            resetView();
        };
        reader.readAsDataURL(file);
    }
});

// --- GESTION DES PIONS ---

// Générateur de couleur aléatoire
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

addPawnBtn.addEventListener('click', function() {
    if (!viewerImage.src) return; // Pas de pion si pas d'image

    const pawn = document.createElement('div');
    pawn.classList.add('pawn');
    pawn.style.backgroundColor = getRandomColor();

    // CALCUL DE LA POSITION : CENTRE DE L'ÉCRAN
    // Le centre de la carte est à (50%, 50%).
    // Le décalage actuel de la carte par rapport au centre de l'écran est (state.pointX, state.pointY).
    // Pour que le pion apparaisse au centre de l'écran, il faut compenser ce décalage.
    // Comme la carte est scalée, on divise par le scale.
    
    // On récupère les dimensions réelles de l'image pour positionner en pixels relatifs
    const imgWidth = viewerImage.offsetWidth;
    const imgHeight = viewerImage.offsetHeight;
    
    // Si l'image n'est pas chargée, on met 0,0
    let centerX = imgWidth / 2;
    let centerY = imgHeight / 2;

    // Ajustement pour faire apparaitre sous le centre de l'écran (et non le centre de la carte)
    // Formule : Position = CentreCarte + (InverseDuDéplacement / Scale)
    let spawnX = centerX - (state.pointX / state.scale);
    let spawnY = centerY - (state.pointY / state.scale);

    pawn.style.left = `${spawnX}px`;
    pawn.style.top = `${spawnY}px`;

    // Événement pour démarrer le drag du pion
    pawn.addEventListener('mousedown', startPawnDrag);

    mapLayer.appendChild(pawn);
});

function startPawnDrag(e) {
    e.stopPropagation(); // Empêche le drag de la carte en dessous
    e.preventDefault(); // Empêche la sélection

    pawnDrag.active = true;
    pawnDrag.element = e.target;
    pawnDrag.startX = e.clientX;
    pawnDrag.startY = e.clientY;
    
    // On mémorise la position actuelle (left/top) du pion en nombre
    pawnDrag.initialLeft = parseFloat(e.target.style.left) || 0;
    pawnDrag.initialTop = parseFloat(e.target.style.top) || 0;
    
    pawnDrag.element.style.cursor = 'grabbing';
}


// --- GESTION DES INPUTS GLOBAUX (ZOOM, DRAG CARTE, DRAG PION) ---

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
    if (e.button !== 0) return;
    // Si on clique sur un pion, pawnDrag est déjà activé via stopPropagation, donc ceci ne s'exécute pas pour le pion
    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
    e.preventDefault();

    // CAS 1 : Déplacement d'un PION
    if (pawnDrag.active && pawnDrag.element) {
        const deltaX = e.clientX - pawnDrag.startX;
        const deltaY = e.clientY - pawnDrag.startY;

        // Important : On doit diviser par l'échelle pour que le mouvement de la souris
        // corresponde au mouvement visuel sur une carte zoomée/dézoomée.
        const moveX = deltaX / state.scale;
        const moveY = deltaY / state.scale;

        pawnDrag.element.style.left = `${pawnDrag.initialLeft + moveX}px`;
        pawnDrag.element.style.top = `${pawnDrag.initialTop + moveY}px`;
        return;
    }

    // CAS 2 : Déplacement de la CARTE
    if (state.panning) {
        state.pointX = e.clientX - state.startX;
        state.pointY = e.clientY - state.startY;
        updateTransform();
    }
});

window.addEventListener('mouseup', function() {
    // Fin Drag Carte
    if (state.panning) {
        state.panning = false;
        container.style.cursor = 'grab';
    }
    // Fin Drag Pion
    if (pawnDrag.active) {
        if(pawnDrag.element) pawnDrag.element.style.cursor = 'grab';
        pawnDrag.active = false;
        pawnDrag.element = null;
    }
});