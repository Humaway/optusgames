import * as THREE from 'three';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, onDisconnect } from 'firebase/database';

// ==========================================
// 1. FIREBASE SETUP
// ==========================================
const firebaseConfig = {
    // IMPORTANT: Replace these with your actual Firebase project credentials
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. GAME STATE & IDENTIFIERS
// ==========================================
const localUserId = 'player_' + Math.floor(Math.random() * 10000);
const currentSessionId = 'lobby_alpha';
const remoteAvatars = {}; // Holds 3D meshes for other players

// Update UI
document.getElementById('status').innerText = `Connected as: ${localUserId}`;

// ==========================================
// 3. THREE.JS SCENE SETUP
// ==========================================
const canvas = document.getElementById('gameCanvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e0e0);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Lights & Grid
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(10, 20, 10);
scene.add(ambient, directional);

const grid = new THREE.GridHelper(50, 50, 0x00A3A6, 0xaaaaaa); // Optus Teal accent
scene.add(grid);

// ==========================================
// 4. AVATAR CREATION LOGIC
// ==========================================
function createOllieMesh() {
    const group = new THREE.Group();
    
    // Yellow Base
    const bodyGeo = new THREE.SphereGeometry(1, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    
    // White Visor
    const visorGeo = new THREE.CapsuleGeometry(0.6, 0.4, 4, 16);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.2, 0.8);
    visor.rotation.z = Math.PI / 2;

    group.add(body, visor);
    return group;
}

const localPlayerMesh = createOllieMesh();
scene.add(localPlayerMesh);

// ==========================================
// 5. NETWORK LOGIC (READING OTHERS)
// ==========================================
const playersRef = ref(db, `sessions/${currentSessionId}/players`);
const localPlayerRef = ref(db, `sessions/${currentSessionId}/players/${localUserId}`);

// Ensure we are removed from the database when closing the tab
onDisconnect(localPlayerRef).remove();

// Listen for updates from all players
onValue(playersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    for (const [uid, playerData] of Object.entries(data)) {
        if (uid === localUserId) continue; // Do not render ourselves as a remote player

        // If a new player joined, create their mesh
        if (!remoteAvatars[uid]) {
            const mesh = createOllieMesh();
            scene.add(mesh);
            remoteAvatars[uid] = mesh;
        }

        // Update remote player positions
        remoteAvatars[uid].position.set(playerData.x, playerData.y, playerData.z);
        remoteAvatars[uid].rotation.y = playerData.ry;
    }

    // Clean up players who have left (they exist in our game, but not in Firebase)
    for (const uid of Object.keys(remoteAvatars)) {
        if (!data[uid]) {
            scene.remove(remoteAvatars[uid]);
            delete remoteAvatars[uid];
        }
    }
});

// ==========================================
// 6. MAIN GAME LOOP & RESIZE HANDLING
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

let time = 0;

function animate() {
    requestAnimationFrame(animate);

    // Mock local movement for testing Phase 1
    time += 0.02;
    localPlayerMesh.position.x = Math.sin(time) * 4;
    localPlayerMesh.position.z = Math.cos(time) * 4;
    localPlayerMesh.rotation.y = time;

    // Send our position to Firebase at roughly 10 ticks per second
    if (Math.floor(time * 100) % 6 === 0) {
        set(localPlayerRef, {
            x: localPlayerMesh.position.x,
            y: localPlayerMesh.position.y,
            z: localPlayerMesh.position.z,
            ry: localPlayerMesh.rotation.y,
            timestamp: Date.now()
        });
    }

    renderer.render(scene, camera);
}

// Start the loop
animate();
