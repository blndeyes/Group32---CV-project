/**
 * Virtual Tour Application - Optimized Version
 * Open3D-style point cloud viewer with camera navigation
 */

// Global variables
let scene, camera, renderer, controls;
let pointCloud;
let cameraMarkers = [];
let cameraConnections = [];
let cameraData = [];
let currentCameraIndex = 0;
let isTransitioning = false;

// Configuration
const config = {
    transitionDuration: 1.5, // seconds - faster transitions
    pointSize: 0.01, // smaller default, will auto-adjust
    cameraMarkerSize: 0.05,
    maxConnectionDistance: 1.5, // meters
    backgroundColor: 0x1a1a2e,
    cameraMarkerColor: 0x00ff00,
    currentCameraColor: 0xff0000,
    connectedCameraColor: 0xff6b00,
    connectionColor: 0x444444
};

/**
 * Initialize the Three.js scene
 */
function initScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);
    
    // Create camera with better near plane
    camera = new THREE.PerspectiveCamera(
        60, // FOV - slightly narrower for better depth
        window.innerWidth / window.innerHeight,
        1, // Very close near plane
        1000  // Far plane
    );

    // Create renderer with optimizations
    const canvas = document.getElementById('canvas3d');
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight1.position.set(5, 10, 5);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    // Initialize orbit controls (ENABLED by default - like Open3D)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

/**
 * Load and parse camera data from JSON
 */
async function loadCameraData() {
    updateLoadingStatus('Loading camera data...');
    
    try {
        const response = await fetch('cameras.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        cameraData = data.cameras;
        
        console.log(`✓ Loaded ${cameraData.length} cameras`);
        
        return true;
    } catch (error) {
        console.error('Error loading camera data:', error);
        alert('Failed to load camera data. Please ensure cameras.json is in the same directory.');
        return false;
    }
}

/**
 * Load point cloud from PLY file
 */
async function loadPointCloud() {
    updateLoadingStatus('Loading point cloud...');
    
    return new Promise((resolve, reject) => {
        const loader = new THREE.PLYLoader();
        
        loader.load(
            'agisoft_pointcloud.ply',
            
            // onLoad callback
            (geometry) => {
                const pointCount = geometry.attributes.position.count;
                console.log(`✓ Loaded point cloud: ${pointCount.toLocaleString()} points`);
                
                // Compute bounding box for auto-sizing
                geometry.computeBoundingBox();
                const box = geometry.boundingBox;
                const size = new THREE.Vector3();
                box.getSize(size);
                const sceneSize = size.length();
                
                console.log(`  Scene size: ${sceneSize.toFixed(2)} units`);
                
                // Auto-adjust point size based on scene
                config.pointSize = Math.max(0.005, Math.min(0.05, sceneSize / 300));
                config.cameraMarkerSize = Math.max(0.03, Math.min(0.15, sceneSize / 40));
                
                console.log(`  Auto-adjusted point size: ${config.pointSize.toFixed(4)}`);
                console.log(`  Auto-adjusted marker size: ${config.cameraMarkerSize.toFixed(3)}`);
                
                // Create point cloud material
                const material = new THREE.PointsMaterial({
                    size: config.pointSize,
                    vertexColors: geometry.attributes.color ? true : false,
                    sizeAttenuation: true,
                    transparent: false,
                    fog: false
                });
                
                // If no colors, use light gray
                if (!geometry.attributes.color) {
                    material.color = new THREE.Color(0xcccccc);
                }
                
                // Create point cloud
                pointCloud = new THREE.Points(geometry, material);
                scene.add(pointCloud);
                
                resolve(geometry);
            },
            
            // onProgress callback
            (xhr) => {
                if (xhr.lengthComputable) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    updateLoadingProgress(percentComplete * 0.7);
                }
            },
            
            // onError callback
            (error) => {
                console.error('Error loading point cloud:', error);
                alert('Could not load point cloud. Make sure agisoft_pointcloud.ply exists.');
                reject(error);
            }
        );
    });
}

/**
 * Create visual markers for camera positions
 */
function createCameraMarkers() {
    updateLoadingStatus('Creating camera markers...');
    
    cameraData.forEach((cam, index) => {
        // Create camera marker (sphere)
        const geometry = new THREE.SphereGeometry(config.cameraMarkerSize, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: config.cameraMarkerColor,
            emissive: config.cameraMarkerColor,
            emissiveIntensity: 0.5,
            metalness: 0.3,
            roughness: 0.7
        });
        const marker = new THREE.Mesh(geometry, material);
        
        // Position at camera center
        marker.position.set(cam.center[0], cam.center[1], cam.center[2]);
        marker.userData = { cameraIndex: index, cameraData: cam };
        
        scene.add(marker);
        cameraMarkers.push(marker);
    });
    
    console.log(`✓ Created ${cameraMarkers.length} camera markers`);
}

/**
 * Build view graph connecting nearby cameras
 */
function buildViewGraph() {
    updateLoadingStatus('Building view graph...');
    
    // Clear existing connections
    cameraConnections.forEach(line => scene.remove(line));
    cameraConnections = [];
    
    let connectionCount = 0;
    
    // Connect cameras based on distance
    for (let i = 0; i < cameraData.length; i++) {
        const pos1 = new THREE.Vector3(...cameraData[i].center);
        
        for (let j = i + 1; j < cameraData.length; j++) {
            const pos2 = new THREE.Vector3(...cameraData[j].center);
            const distance = pos1.distanceTo(pos2);
            
            // Connect if within threshold distance
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
                connectionCount++;
            }
        }
    }
    
    console.log(`✓ Created ${connectionCount} camera connections`);
}

/**
 * Initialize camera at the first position with proper view
 */
function initializeCamera() {
    if (cameraData.length === 0) return;
    
    // Set to first camera without animation
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
        // Instant positioning - place viewer camera AT this camera's position
        camera.position.set(camData.center[0], camData.center[1], camData.center[2]);
        
        // CRITICAL FIX: The rotation matrix from SfM is R_world_to_camera
        // We need R_camera_to_world = R^T (transpose) to look OUT from the camera
        const R = camData.rotation;
        const rotationMatrix = new THREE.Matrix4();
        
        // Transpose the rotation matrix (invert the view direction)
        rotationMatrix.set(
            R[0][0], R[1][0], R[2][0], 0,  // Note: swapped indices
            R[0][1], R[1][1], R[2][1], 0,  // This transposes the matrix
            R[0][2], R[1][2], R[2][2], 0,  // Now we look OUT from camera
            0, 0, 0, 1
        );
        
        camera.quaternion.setFromRotationMatrix(rotationMatrix);
        
        // Set orbit controls target to camera position (orbit around camera)
        controls.target.copy(camera.position);
        controls.update();
        
        console.log(`✓ Camera positioned at: [${camData.center[0].toFixed(2)}, ${camData.center[1].toFixed(2)}, ${camData.center[2].toFixed(2)}]`);
    } else {
        // Animated transition
        navigateToCamera(index);
    }
}

/**
 * Navigate to a specific camera with smooth transition
 */
function navigateToCamera(targetIndex) {
    if (isTransitioning || targetIndex === currentCameraIndex) {
        return;
    }
    
    if (targetIndex < 0 || targetIndex >= cameraData.length) {
        console.warn(`Invalid camera index: ${targetIndex}`);
        return;
    }
    
    console.log(`\n→ Navigating to camera ${targetIndex + 1}/${cameraData.length}`);
    
    isTransitioning = true;
    
    const startCam = cameraData[currentCameraIndex];
    const endCam = cameraData[targetIndex];
    
    // Starting values
    const startPos = new THREE.Vector3(...startCam.center);
    const startQuat = new THREE.Quaternion();
    const startR = startCam.rotation;
    // Transpose the rotation matrix (invert view direction)
    startQuat.setFromRotationMatrix(new THREE.Matrix4().set(
        startR[0][0], startR[1][0], startR[2][0], 0,
        startR[0][1], startR[1][1], startR[2][1], 0,
        startR[0][2], startR[1][2], startR[2][2], 0,
        0, 0, 0, 1
    ));
    
    // Target values
    const endPos = new THREE.Vector3(...endCam.center);
    const endQuat = new THREE.Quaternion();
    const endR = endCam.rotation;
    // Transpose the rotation matrix (invert view direction)
    endQuat.setFromRotationMatrix(new THREE.Matrix4().set(
        endR[0][0], endR[1][0], endR[2][0], 0,
        endR[0][1], endR[1][1], endR[2][1], 0,
        endR[0][2], endR[1][2], endR[2][2], 0,
        0, 0, 0, 1
    ));
    
    // Animate transition
    const startTime = performance.now();
    const duration = config.transitionDuration * 1000;
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const t = Math.min(elapsed / duration, 1.0);
        
        // Smooth easing
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        
        // Lerp position
        camera.position.lerpVectors(startPos, endPos, eased);
        
        // Slerp quaternion for smooth rotation
        camera.quaternion.slerpQuaternions(startQuat, endQuat, eased);
        
        // Update orbit controls target to camera position (orbit around camera)
        controls.target.copy(camera.position);
        controls.update();
        
        if (t < 1.0) {
            requestAnimationFrame(animate);
        } else {
            // Transition complete
            isTransitioning = false;
            currentCameraIndex = targetIndex;
            updateCameraMarkerColors();
            updateUI();
            console.log('✓ Transition complete');
        }
    }
    
    requestAnimationFrame(animate);
}

/**
 * Update camera marker colors to highlight current camera
 */
function updateCameraMarkerColors() {
    cameraMarkers.forEach((marker, index) => {
        if (index === currentCameraIndex) {
            // Current camera - bright green
            marker.material.color.setHex(config.currentCameraColor);
            marker.material.emissive.setHex(config.currentCameraColor);
            marker.material.emissiveIntensity = 1.0;
        } else {
            // Check if connected to current camera
            const isConnected = isConnectedToCurrentCamera(index);
            if (isConnected) {
                // Connected camera - orange
                marker.material.color.setHex(config.connectedCameraColor);
                marker.material.emissive.setHex(config.connectedCameraColor);
                marker.material.emissiveIntensity = 0.7;
            } else {
                // Not connected - dim green
                marker.material.color.setHex(0x004400);
                marker.material.emissive.setHex(0x002200);
                marker.material.emissiveIntensity = 0.2;
            }
        }
    });
}

/**
 * Check if a camera is connected to the current camera
 */
function isConnectedToCurrentCamera(targetIndex) {
    const currentPos = new THREE.Vector3(...cameraData[currentCameraIndex].center);
    const targetPos = new THREE.Vector3(...cameraData[targetIndex].center);
    const distance = currentPos.distanceTo(targetPos);
    return distance < config.maxConnectionDistance;
}

/**
 * Update UI elements
 */
function updateUI() {
    document.getElementById('camera-info').textContent = 
        `Camera ${currentCameraIndex + 1} / ${cameraData.length}`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Click on camera markers
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
    
    // Hover effect
    renderer.domElement.addEventListener('mousemove', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(cameraMarkers);
        
        renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (isTransitioning) return;
        
        switch(e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                // Previous camera
                const prevIndex = (currentCameraIndex - 1 + cameraData.length) % cameraData.length;
                navigateToCamera(prevIndex);
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                // Next camera
                const nextIndex = (currentCameraIndex + 1) % cameraData.length;
                navigateToCamera(nextIndex);
                break;
            case 'Home':
                // Go to first camera
                navigateToCamera(0);
                break;
            case 'End':
                // Go to last camera
                navigateToCamera(cameraData.length - 1);
                break;
        }
    });
    
    // Toggle point cloud visibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            if (pointCloud) {
                pointCloud.visible = !pointCloud.visible;
                console.log(`Point cloud: ${pointCloud.visible ? 'ON' : 'OFF'}`);
            }
        }
    });
}

/**
 * Animation loop
 */
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    controls.update();
    
    // Render scene
    renderer.render(scene, camera);
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Update loading screen
 */
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

/**
 * Initialize and start the application
 */
async function init() {
    try {
        console.log('=== Virtual Tour - Optimized Version ===');
        updateLoadingProgress(10);
        
        // Initialize scene
        initScene();
        updateLoadingProgress(20);
        
        // Load camera data
        const camerasLoaded = await loadCameraData();
        if (!camerasLoaded) return;
        updateLoadingProgress(40);
        
        // Load point cloud
        try {
            await loadPointCloud();
        } catch (error) {
            console.warn('Point cloud not loaded, continuing with camera visualization only');
        }
        updateLoadingProgress(80);
        
        // Create camera markers and view graph
        createCameraMarkers();
        buildViewGraph();
        updateLoadingProgress(90);
        
        // Initialize camera position at first camera
        initializeCamera();
        
        // Setup UI
        setupEventListeners();
        updateLoadingProgress(100);
        
        // Hide loading screen
        hideLoadingScreen();
        
        // Start animation loop
        animate();
        
        console.log('✓ Virtual tour initialized successfully!');
        console.log('Controls:');
        console.log('  - Click camera markers to navigate');
        console.log('  - Arrow keys (← →) or A/D to switch cameras');
        console.log('  - Mouse drag to orbit, scroll to zoom');
        console.log('  - Press P to toggle point cloud visibility');
        console.log('  - Home/End to jump to first/last camera');
        
    } catch (error) {
        console.error('Error initializing virtual tour:', error);
        alert('Failed to initialize virtual tour. Check console for details.');
    }
}

// Start the application when the page loads
window.addEventListener('DOMContentLoaded', init);
