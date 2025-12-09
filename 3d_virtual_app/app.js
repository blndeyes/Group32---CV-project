let scene, camera, renderer, controls;
let pointCloud;
let cameraMarkers = [];
let cameraConnections = [];
let cameraData = [];
let currentCameraIndex = 0;
let isTransitioning = false;

const config = {
    transitionDuration: 1.2,
    pointSize: 0.01,
    cameraMarkerSize: 0.005,
    maxConnectionDistance: 1.5,
    backgroundColor: 0x1a1a2e,
    cameraMarkerColor: 0x00ff00,
    currentCameraColor: 0xff0000,
    connectedCameraColor: 0xff6b00,
    connectionColor: 0x444444
};

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);
    
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.01,
        1000
    );

    const canvas = document.getElementById('canvas3d');
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight1.position.set(5, 10, 5);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI;
    controls.rotateSpeed = 0.5;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}


async function loadCameraData() {
    updateLoadingStatus('Loading camera data...');
    
    try {
        const response = await fetch('cameras.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        cameraData = data.cameras;
        return true;
    } catch (error) {
        console.error('Error loading camera data:', error);
        return false;
    }
}


async function loadPointCloud() {
    updateLoadingStatus('Loading point cloud...');
    
    return new Promise((resolve, reject) => {
        const loader = new THREE.PLYLoader();
        
        loader.load(
            'agisoft_pointcloud.ply',
            (geometry) => {
                geometry.computeBoundingBox();
                const box = geometry.boundingBox;
                const size = new THREE.Vector3();
                box.getSize(size);
                const sceneSize = size.length();
                
                config.pointSize = Math.max(0.005, Math.min(0.05, sceneSize / 300));
                config.cameraMarkerSize = Math.max(0.005, Math.min(0.03, sceneSize / 200));
                
                const material = new THREE.PointsMaterial({
                    size: config.pointSize,
                    vertexColors: geometry.attributes.color ? true : false,
                    sizeAttenuation: true
                });
                
                if (!geometry.attributes.color) {
                    material.color = new THREE.Color(0xcccccc);
                }
                
                pointCloud = new THREE.Points(geometry, material);
                scene.add(pointCloud);
                resolve(geometry);
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    updateLoadingProgress(percentComplete * 0.7);
                }
            },
            (error) => {
                console.error('Error loading point cloud:', error);
                reject(error);
            }
        );
    });
}


function createCameraMarkers() {
    updateLoadingStatus('Creating camera markers...');
    
    cameraData.forEach((cam, index) => {
        const geometry = new THREE.SphereGeometry(config.cameraMarkerSize, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: config.cameraMarkerColor,
            emissive: config.cameraMarkerColor,
            emissiveIntensity: 0.5,
            metalness: 0.3,
            roughness: 0.7
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(cam.center[0], cam.center[1], cam.center[2]);
        marker.userData = { cameraIndex: index, cameraData: cam };
        
        scene.add(marker);
        cameraMarkers.push(marker);
    });
}


function buildViewGraph() {
    updateLoadingStatus('Building view graph...');
    
    cameraConnections.forEach(line => scene.remove(line));
    cameraConnections = [];
    
    for (let i = 0; i < cameraData.length; i++) {
        const pos1 = new THREE.Vector3(...cameraData[i].center);
        
        for (let j = i + 1; j < cameraData.length; j++) {
            const pos2 = new THREE.Vector3(...cameraData[j].center);
            const distance = pos1.distanceTo(pos2);
            
            if (distance < config.maxConnectionDistance) {
                const geometry = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
                const material = new THREE.LineBasicMaterial({
                    color: config.connectionColor,
                    transparent: true,
                    opacity: 0.3
                });
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                cameraConnections.push(line);
            }
        }
    }
}


function initializeCamera() {
    if (cameraData.length === 0) return;
    setCameraFromData(0, false);
    currentCameraIndex = 0;
    updateCameraMarkerColors();
    updateUI();
}

/**
 * Set camera position and orientation from camera data
 * This is the KEY function - positions viewer at camera location
 */
function setCameraFromData(index, animate = false) {
    if (index < 0 || index >= cameraData.length) return;
    
    const camData = cameraData[index];
    
    if (!animate) {
        camera.position.set(camData.center[0], camData.center[1], camData.center[2]);
        
        const R = camData.rotation;
        const rotationMatrix = new THREE.Matrix4();
        
        rotationMatrix.set(
            R[0][0], R[0][1], -R[0][2], 0,
            R[1][0], R[1][1], -R[1][2], 0,
            R[2][0], R[2][1], -R[2][2], 0,
            0, 0, 0, 1
        );
        
        camera.quaternion.setFromRotationMatrix(rotationMatrix);
        
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        
        controls.target.copy(camera.position).add(forward.multiplyScalar(2.0));
        controls.update();
    } else {
        navigateToCamera(index);
    }
}


function navigateToCamera(targetIndex) {
    if (isTransitioning || targetIndex === currentCameraIndex) return;
    if (targetIndex < 0 || targetIndex >= cameraData.length) return;
    
    isTransitioning = true;
    
    const startPos = camera.position.clone();
    const startQuat = camera.quaternion.clone();
    const startTarget = controls.target.clone();
    
    const endCam = cameraData[targetIndex];
    const endPos = new THREE.Vector3(...endCam.center);
    
    const R = endCam.rotation;
    const endRotMatrix = new THREE.Matrix4();
    endRotMatrix.set(
        R[0][0], R[0][1], -R[0][2], 0,
        R[1][0], R[1][1], -R[1][2], 0,
        R[2][0], R[2][1], -R[2][2], 0,
        0, 0, 0, 1
    );
    
    const endQuat = new THREE.Quaternion();
    endQuat.setFromRotationMatrix(endRotMatrix);
    
    const endForward = new THREE.Vector3(0, 0, -1);
    endForward.applyQuaternion(endQuat);
    const endTarget = endPos.clone().add(endForward.multiplyScalar(2.0));
    
    const startTime = performance.now();
    const duration = config.transitionDuration * 1000;
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const t = Math.min(elapsed / duration, 1.0);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        
        camera.position.lerpVectors(startPos, endPos, eased);
        camera.quaternion.slerpQuaternions(startQuat, endQuat, eased);
        controls.target.lerpVectors(startTarget, endTarget, eased);
        controls.update();
        
        if (t < 1.0) {
            requestAnimationFrame(animate);
        } else {
            isTransitioning = false;
            currentCameraIndex = targetIndex;
            updateCameraMarkerColors();
            updateUI();
        }
    }
    
    requestAnimationFrame(animate);
}


function updateCameraMarkerColors() {
    cameraMarkers.forEach((marker, index) => {
        if (index === currentCameraIndex) {
            marker.material.color.setHex(config.currentCameraColor);
            marker.material.emissive.setHex(config.currentCameraColor);
            marker.material.emissiveIntensity = 1.0;
        } else {
            const isConnected = isConnectedToCurrentCamera(index);
            if (isConnected) {
                marker.material.color.setHex(config.connectedCameraColor);
                marker.material.emissive.setHex(config.connectedCameraColor);
                marker.material.emissiveIntensity = 0.7;
            } else {
                marker.material.color.setHex(0x004400);
                marker.material.emissive.setHex(0x002200);
                marker.material.emissiveIntensity = 0.2;
            }
        }
    });
}


function isConnectedToCurrentCamera(targetIndex) {
    const currentPos = new THREE.Vector3(...cameraData[currentCameraIndex].center);
    const targetPos = new THREE.Vector3(...cameraData[targetIndex].center);
    const distance = currentPos.distanceTo(targetPos);
    return distance < config.maxConnectionDistance;
}

function updateUI() {
    document.getElementById('camera-info').textContent = 
        `Camera ${currentCameraIndex + 1} / ${cameraData.length}`;
}

function setupEventListeners() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    renderer.domElement.addEventListener('click', (event) => {
        if (isTransitioning) return;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(cameraMarkers);
        
        if (intersects.length > 0) {
            const marker = intersects[0].object;
            const targetIndex = marker.userData.cameraIndex;
            
            if (targetIndex !== currentCameraIndex) {
                navigateToCamera(targetIndex);
            }
        }
    });
    
    renderer.domElement.addEventListener('mousemove', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(cameraMarkers);
        
        renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    });
    
    document.addEventListener('keydown', (e) => {
        if (isTransitioning) return;
        
        switch(e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                const prevIndex = (currentCameraIndex - 1 + cameraData.length) % cameraData.length;
                navigateToCamera(prevIndex);
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                const nextIndex = (currentCameraIndex + 1) % cameraData.length;
                navigateToCamera(nextIndex);
                break;
            case 'Home':
                navigateToCamera(0);
                break;
            case 'End':
                navigateToCamera(cameraData.length - 1);
                break;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            if (pointCloud) {
                pointCloud.visible = !pointCloud.visible;
            }
        }
    });
}


function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


function updateLoadingStatus(message) {
    const statusEl = document.getElementById('loading-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function updateLoadingProgress(percent) {
    const progressEl = document.getElementById('progress-fill');
    if (progressEl) {
        progressEl.style.width = percent + '%';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
}


async function init() {
    try {
        updateLoadingProgress(10);
        
        initScene();
        updateLoadingProgress(20);
        
        const camerasLoaded = await loadCameraData();
        if (!camerasLoaded) return;
        updateLoadingProgress(40);
        
        try {
            await loadPointCloud();
        } catch (error) {
            console.warn('Point cloud not loaded');
        }
        updateLoadingProgress(80);
        
        createCameraMarkers();
        updateLoadingProgress(90);
        
        initializeCamera();
        setupEventListeners();
        updateLoadingProgress(100);
        
        hideLoadingScreen();
        animate();
        
    } catch (error) {
        console.error('Error initializing:', error);
    }
}

window.addEventListener('DOMContentLoaded', init);