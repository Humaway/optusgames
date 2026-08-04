import * as THREE from 'three';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, ref, set, onValue, onDisconnect } from 'firebase/database';

// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyD8d-ztI7TgTFyo2mFGDWzh-RVZilD5FhE",
  authDomain: "optusblox.firebaseapp.com",
  databaseURL: "https://optusblox-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "optusblox",
  storageBucket: "optusblox.firebasestorage.app",
  messagingSenderId: "118348415817",
  appId: "1:118348415817:web:405c84cf07168343a0d098",
  measurementId: "G-JVF4BLYHFQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null; 
let currentMode = 'MOVE'; 

// UI Elements
const authUI = document.getElementById('auth-ui');
const lobbyUI = document.getElementById('lobby-ui');
const hudUI = document.getElementById('hud-ui');
const authError = document.getElementById('auth-error');

// ==========================================
// 2. AUTHENTICATION LOGIC
// ==========================================
document.getElementById('register-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    createUserWithEmailAndPassword(auth, email, password)
        .catch(error => authError.innerText = error.message);
});

document.getElementById('login-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    signInWithEmailAndPassword(auth, email, password)
        .catch(error => authError.innerText = error.message);
});

document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth);
});

// Monitor authentication state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in
        currentUser = user;
        authUI.style.display = 'none';
        lobbyUI.style.display = 'block';
        hudUI.style.display = 'none';
        
        document.getElementById('user-display-name').innerText = `Logged in as: ${user.email}`;
    } else {
        // User is logged out
        currentUser = null;
        authUI.style.display = 'block';
        lobbyUI.style.display = 'none';
        hudUI.style.display = 'none';
        
        // If they log out mid-game, reload the page to cleanly reset Three.js state
        if (networkManager.sessionId) {
            window.location.reload();
        }
    }
});

// ==========================================
// 3. NETWORK MANAGER
// ==========================================
class NetworkManager {
    constructor() {
        this.sessionId = null;
        this.localPlayerRef = null;
        this.remoteAvatars = {};
    }

    joinSession(sessionId, sceneManager) {
        this.sessionId = sessionId;
        const playersRef = ref(db, `sessions/${this.sessionId}/players`);
        // Use the authenticated user's unique Firebase UID
        this.localPlayerRef = ref(db, `sessions/${this.sessionId}/players/${currentUser.uid}`);

        onDisconnect(this.localPlayerRef).remove();

        onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            for (const [uid, playerData] of Object.entries(data)) {
                if (uid === currentUser.uid) continue;

                if (!this.remoteAvatars[uid]) {
                    this.remoteAvatars[uid] = sceneManager.createOllieAvatar();
                    sceneManager.scene.add(this.remoteAvatars[uid]);
                }
                
                this.remoteAvatars[uid].position.set(playerData.x, playerData.y, playerData.z);
                this.remoteAvatars[uid].rotation.y = playerData.ry;
            }

            for (const uid of Object.keys(this.remoteAvatars)) {
                if (!data[uid]) {
                    sceneManager.scene.remove(this.remoteAvatars[uid]);
                    delete this.remoteAvatars[uid];
                }
            }
        });
    }

    broadcastPosition(position, rotation) {
        if (!this.localPlayerRef) return;
        set(this.localPlayerRef, {
            x: position.x,
            y: position.y,
            z: position.z,
            ry: rotation.y,
            timestamp: Date.now()
        });
    }
}

// ==========================================
// 4. SCENE & AVATAR MANAGER
// ==========================================
class SceneManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xF4F4F4);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.setupEnvironment();
        this.bindResize();
    }

    setupEnvironment() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(10, 20, 10);
        this.scene.add(ambient, directional);

        const grid = new THREE.GridHelper(100, 100, 0x00A3A6, 0xcccccc);
        this.scene.add(grid);

        const planeGeo = new THREE.PlaneGeometry(100, 100);
        planeGeo.rotateX(-Math.PI / 2);
        this.groundPlane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ visible: false }));
        this.scene.add(this.groundPlane);
    }

    createOllieAvatar() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), bodyMat);
        body.position.y = 1;
        
        const visorMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.4, 4, 16), visorMat);
        visor.position.set(0, 1.2, 0.8);
        visor.rotation.z = Math.PI / 2;

        group.add(body, visor);
        return group;
    }

    bindResize() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
}

// ==========================================
// 5. MAIN APPLICATION CONTROLLER
// ==========================================
const sceneManager = new SceneManager('gameCanvas');
const networkManager = new NetworkManager();

let localPlayerMesh = null; // Instantiated only after joining a room

// Handle Joining a Room
document.getElementById('join-btn').addEventListener('click', () => {
    if (!currentUser) return; // Failsafe

    const sessionId = document.getElementById('session-id').value || 'Vision_Hub';
    
    lobbyUI.style.display = 'none';
    hudUI.style.display = 'block';
    document.getElementById('room-name').innerText = sessionId;
    
    // Use a shortened version of the user's UID for HUD display
    document.getElementById('player-id').innerText = currentUser.uid.substring(0, 8);

    // Initialize local player avatar
    localPlayerMesh = sceneManager.createOllieAvatar();
    sceneManager.scene.add(localPlayerMesh);

    // Connect to RTDB session
    networkManager.joinSession(sessionId, sceneManager);
});

// Toolbar Interactions
document.getElementById('tool-move').addEventListener('click', (e) => {
    currentMode = 'MOVE';
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
});

document.getElementById('tool-build').addEventListener('click', (e) => {
    currentMode = 'BUILD';
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
});

// Game Loop
let time = 0;
function animate() {
    requestAnimationFrame(animate);

    // Only broadcast movement if the HUD is active (meaning they have joined a room)
    if (localPlayerMesh && currentMode === 'MOVE' && hudUI.style.display === 'block') {
        time += 0.03;
        localPlayerMesh.position.x = Math.sin(time) * 4;
        localPlayerMesh.position.z = Math.cos(time) * 4;
        localPlayerMesh.rotation.y = time;

        if (Math.floor(time * 100) % 6 === 0) {
            networkManager.broadcastPosition(localPlayerMesh.position, localPlayerMesh.rotation);
        }
    }

    sceneManager.renderer.render(sceneManager.scene, sceneManager.camera);
}

animate();
