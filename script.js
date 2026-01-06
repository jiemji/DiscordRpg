// Sélection des éléments du DOM
const imageUpload = document.getElementById('imageUpload');
const viewerImage = document.getElementById('viewerImage');
const container = document.getElementById('imageContainer');
const resetBtn = document.getElementById('resetBtn'); // Nouveau bouton

// État de l'application
let state = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0
};

// Fonction pour mettre à jour la transformation CSS
function updateTransform() {
    viewerImage.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

// Fonction de réinitialisation (Reset)
function resetView() {
    state.scale = 1;
    state.pointX = 0;
    state.pointY = 0;
    updateTransform();
}

// Écouteur pour le bouton Reset
resetBtn.addEventListener('click', resetView);

// 1. Gestion du chargement de l'image
imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            viewerImage.src = event.target.result;
            viewerImage.style.display = 'block';
            
            // On réinitialise la vue quand une nouvelle image est chargée
            resetView();
        };
        reader.readAsDataURL(file);
    }
});

// 2. Gestion du Zoom (Molette)
container.addEventListener('wheel', function(e) {
    e.preventDefault();

    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + (direction * zoomIntensity);

    const newScale = state.scale * factor;
    // Limites de zoom
    if (newScale < 0.1 || newScale > 20) return;

    state.pointX *= factor;
    state.pointY *= factor;
    state.scale = newScale;

    updateTransform();
}, { passive: false });

// 3. Gestion du Déplacement (Drag)
container.addEventListener('mousedown', function(e) {
    // Si on clique sur l'image (ou le conteneur vide), on commence le drag
    if (e.button !== 0) return; // Seulement clic gauche

    e.preventDefault();
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
    if (!state.panning) return;
    
    e.preventDefault();
    state.pointX = e.clientX - state.startX;
    state.pointY = e.clientY - state.startY;

    updateTransform();
});

window.addEventListener('mouseup', function() {
    state.panning = false;
    container.style.cursor = 'grab';
});