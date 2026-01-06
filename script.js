// Sélection des éléments du DOM
const imageUpload = document.getElementById('imageUpload');
const viewerImage = document.getElementById('viewerImage');
const container = document.getElementById('imageContainer');

// État de l'application
let state = {
    scale: 1,
    panning: false,
    pointX: 0, // Décalage horizontal du centre de l'image par rapport au centre de l'écran
    pointY: 0, // Décalage vertical du centre de l'image par rapport au centre de l'écran
    startX: 0,
    startY: 0
};

// Fonction pour mettre à jour la transformation CSS
function updateTransform() {
    // On applique le centrage de base (-50%, -50%) PUIS nos modifications
    viewerImage.style.transform = `translate(-50%, -50%) translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
}

// 1. Gestion du chargement de l'image
imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            viewerImage.src = event.target.result;
            viewerImage.style.display = 'block';
            
            // Réinitialisation de l'état
            state.scale = 1;
            state.pointX = 0;
            state.pointY = 0;
            updateTransform();
        };
        reader.readAsDataURL(file);
    }
});

// 2. Gestion du Zoom (Molette)
container.addEventListener('wheel', function(e) {
    e.preventDefault(); // Empêche le scroll de la page

    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1; // Haut = Zoom in, Bas = Zoom out
    const factor = 1 + (direction * zoomIntensity);

    // Limites de zoom (optionnel, pour éviter de trop dézoomer/zoomer)
    const newScale = state.scale * factor;
    if (newScale < 0.1 || newScale > 20) return;

    // Logique : Zoomer vers le centre de l'écran.
    // Si l'image est décalée (pointX, pointY), ce décalage doit aussi être "zoomé"
    // pour que le point sous le centre de l'écran reste sous le centre.
    state.pointX *= factor;
    state.pointY *= factor;
    state.scale = newScale;

    updateTransform();
}, { passive: false });

// 3. Gestion du Déplacement (Drag)
container.addEventListener('mousedown', function(e) {
    e.preventDefault(); // Empêche le comportement de glisser-déposer natif du navigateur
    state.panning = true;
    state.startX = e.clientX - state.pointX;
    state.startY = e.clientY - state.pointY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
    if (!state.panning) return;
    
    e.preventDefault();
    // Calcul de la nouvelle position
    // La position actuelle est la position de la souris moins le point de départ relatif
    state.pointX = e.clientX - state.startX;
    state.pointY = e.clientY - state.startY;

    updateTransform();
});

window.addEventListener('mouseup', function() {
    state.panning = false;
    container.style.cursor = 'grab';
});