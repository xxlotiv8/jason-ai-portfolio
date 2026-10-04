import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const canvas = document.getElementById("scene");
const frame = document.getElementById("sceneFrame");
const emptyState = document.getElementById("sceneEmpty");
const objectCount = document.getElementById("objectCount");
const actionStatus = document.getElementById("actionStatus");
const cursor = document.getElementById("cursor");
const startButton = document.getElementById("startButton");
const cameraStatus = document.getElementById("cameraStatus");
const cameraDot = document.getElementById("cameraDot");
const clearButton = document.getElementById("clearButton");
const video = document.getElementById("video");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 2.7, 16);
const cameraTarget = new THREE.Vector3(0, 0, 0);
camera.lookAt(cameraTarget);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

scene.add(new THREE.HemisphereLight(0xf9f7ef, 0x879a8c, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-4, 7, 9);
scene.add(keyLight);
const greenLight = new THREE.PointLight(0x4c986e, 18, 24);
greenLight.position.set(4, -3, 5);
scene.add(greenLight);

const objectGroup = new THREE.Group();
scene.add(objectGroup);

const palette = [0x276b48, 0x83a18b, 0xd1a972, 0x9b6a51, 0x687d70];

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let objects = [];
let cameraController;
let hands;
let handControlActive = false;
let twoHandShape = null;
let cameraMoveLastPoint = null;
let cameraRotateLastPoint = null;
let animationFrame = 0;
let lastStatusAt = 0;

function resizeScene() {
  const bounds = frame.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  camera.aspect = bounds.width / bounds.height;
  camera.updateProjectionMatrix();
  renderer.setSize(bounds.width, bounds.height, false);
}

function pointOnScene(clientX, clientY) {
  const bounds = frame.getBoundingClientRect();
  pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(dragPlane, point) || new THREE.Vector3();
}

function updatePointer(clientX, clientY) {
  const bounds = frame.getBoundingClientRect();
  cursor.style.left = `${clientX - bounds.left}px`;
  cursor.style.top = `${clientY - bounds.top}px`;
  cursor.style.opacity = "1";
}

function updateObjectCount() {
  objectCount.textContent = `${String(objects.length).padStart(2, "0")} ${objects.length === 1 ? "OBJECT" : "OBJECTS"}`;
  emptyState.classList.toggle("is-hidden", objects.length > 0);
}

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.12,
    emissive: color,
    emissiveIntensity: 0.035,
  });
}

function createHandBox(position) {
  const color = palette[Math.floor(Math.random() * palette.length)];
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), makeMaterial(color));
  box.position.copy(position);
  box.scale.set(0.16, 0.16, 0.16);
  objectGroup.add(box);
  objects.push(box);
  updateObjectCount();
  return box;
}

function resizeHandBox(box, firstPoint, secondPoint) {
  const width = THREE.MathUtils.clamp(Math.abs(secondPoint.x - firstPoint.x), 0.18, 8);
  const height = THREE.MathUtils.clamp(Math.abs(secondPoint.y - firstPoint.y), 0.18, 8);
  const depth = THREE.MathUtils.clamp(Math.min(width, height) * 0.8, 0.18, 6);
  box.position.set(
    (firstPoint.x + secondPoint.x) / 2,
    (firstPoint.y + secondPoint.y) / 2,
    0,
  );
  box.scale.set(width, height, depth);
}

function isPointingUp(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y - 0.075;
  const otherFingersCurled = [[12, 10], [16, 14], [20, 18]]
    .every(([tip, joint]) => landmarks[tip].y > landmarks[joint].y - 0.015);
  return indexExtended && otherFingersCurled;
}

function isPeaceSign(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y - 0.065;
  const middleExtended = landmarks[12].y < landmarks[10].y - 0.065;
  const remainingFingersCurled = [[16, 14], [20, 18]]
    .every(([tip, joint]) => landmarks[tip].y > landmarks[joint].y - 0.015);
  return indexExtended && middleExtended && remainingFingersCurled;
}

function moveCameraFromHand(landmarks) {
  const handPoint = makeHandPosition(landmarks[9]);
  if (cameraMoveLastPoint) {
    const bounds = frame.getBoundingClientRect();
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(cameraTarget);
    const visibleWidth = visibleHeight * camera.aspect;
    const dx = handPoint.x - cameraMoveLastPoint.x;
    const dy = handPoint.y - cameraMoveLastPoint.y;
    const shiftX = -dx / bounds.width * visibleWidth;
    const shiftY = dy / bounds.height * visibleHeight;
    camera.position.x += shiftX;
    camera.position.y += shiftY;
    cameraTarget.x += shiftX;
    cameraTarget.y += shiftY;
    camera.lookAt(cameraTarget);
  }
  cameraMoveLastPoint = handPoint;
}

function rotateCameraFromHand(landmarks) {
  const handPoint = makeHandPosition(landmarks[9]);
  if (cameraRotateLastPoint) {
    const bounds = frame.getBoundingClientRect();
    const dx = (handPoint.x - cameraRotateLastPoint.x) / bounds.width;
    const dy = (handPoint.y - cameraRotateLastPoint.y) / bounds.height;
    const offset = camera.position.clone().sub(cameraTarget);
    const orbit = new THREE.Spherical().setFromVector3(offset);
    orbit.theta -= dx * Math.PI * 1.5;
    orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * Math.PI, 0.22, Math.PI - 0.22);
    camera.position.setFromSpherical(orbit).add(cameraTarget);
    camera.lookAt(cameraTarget);
  }
  cameraRotateLastPoint = handPoint;
}

function clearObjects() {
  for (const mesh of objects) {
    objectGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  objects = [];
  twoHandShape = null;
  cameraMoveLastPoint = null;
  cameraRotateLastPoint = null;
  updateObjectCount();
  actionStatus.textContent = "Space cleared. Pinch with both hands to set two corners and create a box.";
}

function getScenePoint(clientX, clientY) {
  return pointOnScene(clientX, clientY);
}

function endTwoHandShape() {
  if (!twoHandShape) return;
  twoHandShape = null;
  cameraStatus.textContent = "Box placed";
  actionStatus.textContent = "Box placed. Pinch with both hands to make another.";
}

function makeHandPosition(landmark) {
  const bounds = frame.getBoundingClientRect();
  // Mirror the raw camera x-coordinate once so hand movement feels like a mirror.
  const x = (1 - landmark.x) * bounds.width;
  const y = landmark.y * bounds.height;
  return { x: bounds.left + x, y: bounds.top + y };
}

function onHandResults(results) {
  if (!handControlActive) return;
  const detectedHands = results.multiHandLandmarks || [];
  if (detectedHands.length < 2) {
    endTwoHandShape();
    if (detectedHands.length === 1 && isPeaceSign(detectedHands[0])) {
      cameraMoveLastPoint = null;
      cursor.style.opacity = "0";
      cameraStatus.textContent = "Rotating view — lower your hand to stop";
      actionStatus.textContent = "Hold a peace sign and move your hand to orbit the camera.";
      rotateCameraFromHand(detectedHands[0]);
    } else if (detectedHands.length === 1 && isPointingUp(detectedHands[0])) {
      cameraRotateLastPoint = null;
      cursor.style.opacity = "0";
      cameraStatus.textContent = "Moving view — lower your finger to stop";
      actionStatus.textContent = "Point one index finger upward and move your hand to pan the view.";
      moveCameraFromHand(detectedHands[0]);
    } else {
      cameraMoveLastPoint = null;
      cameraRotateLastPoint = null;
      cursor.style.opacity = "0";
      const now = performance.now();
      if (now - lastStatusAt > 700) {
        cameraStatus.textContent = detectedHands.length ? "Show your second hand" : "Show both hands to begin";
        actionStatus.textContent = "Pinch with both hands to create a box; point up to pan or make a peace sign to rotate the view.";
        lastStatusAt = now;
      }
    }
    return;
  }
  cameraMoveLastPoint = null;
  cameraRotateLastPoint = null;

  const handsOnScreen = detectedHands.slice(0, 2).map((landmarks) => {
    const thumb = makeHandPosition(landmarks[4]);
    const index = makeHandPosition(landmarks[8]);
    const pinchDistance = Math.hypot(index.x - thumb.x, index.y - thumb.y) / Math.min(frame.clientWidth, frame.clientHeight);
    return {
      point: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
      pinching: pinchDistance < 0.09,
    };
  }).sort((a, b) => a.point.x - b.point.x);
  const leftHand = handsOnScreen[0];
  const rightHand = handsOnScreen[1];

  if (!leftHand.pinching || !rightHand.pinching) {
    endTwoHandShape();
    cameraStatus.textContent = "Pinch with both hands";
    actionStatus.textContent = "Pinch with both hands and drag the two points to set a box's corners.";
    updatePointer((leftHand.point.x + rightHand.point.x) / 2, (leftHand.point.y + rightHand.point.y) / 2);
    return;
  }

  const leftPoint = getScenePoint(leftHand.point.x, leftHand.point.y);
  const rightPoint = getScenePoint(rightHand.point.x, rightHand.point.y);
  const midpoint = leftPoint.clone().add(rightPoint).multiplyScalar(0.5);
  if (!twoHandShape) {
    twoHandShape = createHandBox(midpoint);
  }

  resizeHandBox(twoHandShape, leftPoint, rightPoint);
  cameraStatus.textContent = "Sizing box — release to place";
  actionStatus.textContent = "Move the two pinch points to set the box's opposite corners.";
}

async function enableHandControl() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Camera access is not supported here";
    return;
  }
  startButton.disabled = true;
  startButton.textContent = "Starting…";
  cameraStatus.textContent = "Waiting for camera permission";

  hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, selfieMode: false, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
  hands.onResults(onHandResults);
  cameraController = new Camera(video, { onFrame: async () => hands.send({ image: video }), width: 960, height: 540 });

  try {
    await cameraController.start();
    handControlActive = true;
    cameraDot.classList.add("is-active");
    cameraStatus.textContent = "Camera ready — show both hands";
    startButton.innerHTML = "Stop hand control";
    actionStatus.textContent = "Pinch with both hands to create a box; point up to pan or make a peace sign to rotate the view.";
  } catch (error) {
    console.error(error);
    cameraStatus.textContent = "Camera permission was not granted";
    startButton.innerHTML = "Try again <span>↗</span>";
  } finally {
    startButton.disabled = false;
  }
}

function disableHandControl() {
  endTwoHandShape();
  cameraMoveLastPoint = null;
  cameraRotateLastPoint = null;
  cameraController?.stop();
  video.srcObject?.getTracks().forEach((track) => track.stop());
  handControlActive = false;
  cameraDot.classList.remove("is-active");
  cameraStatus.textContent = "Camera off";
  startButton.innerHTML = "Enable hand control <span>↗</span>";
  cursor.style.opacity = "0";
}

function updateThemeColors() {
  const dark = document.documentElement.dataset.theme === "dark";
  scene.background = new THREE.Color(dark ? 0x202922 : 0xe9e8df);
  const gridColor = new THREE.Color(dark ? 0x69756a : 0x9ca99b);
  const gridOpacity = dark ? 0.27 : 0.22;
  grid.material.color.copy(gridColor);
  grid.material.opacity = gridOpacity;
  gridLines.material.color.copy(gridColor);
  gridLines.material.opacity = gridOpacity;
  particles.material.color.setHex(dark ? 0xc7d2c7 : 0x526b58);
}

const grid = new THREE.GridHelper(32, 32, 0x9ca99b, 0x9ca99b);
grid.rotation.x = Math.PI / 2;
grid.position.z = -1.8;
grid.material.transparent = true;
grid.material.opacity = 0.22;
scene.add(grid);

const gridLinesGeometry = new THREE.BufferGeometry();
const linePoints = [];
for (let x = -11; x <= 11; x += 1) {
  linePoints.push(x, -7, -1.9, x, 7, -1.9);
}
for (let y = -7; y <= 7; y += 1) {
  linePoints.push(-11, y, -1.9, 11, y, -1.9);
}
gridLinesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePoints, 3));
const gridLines = new THREE.LineSegments(gridLinesGeometry, new THREE.LineBasicMaterial({ color: 0x9ca99b, transparent: true, opacity: 0.22 }));
scene.add(gridLines);

const particleGeometry = new THREE.BufferGeometry();
const particlePositions = [];
for (let i = 0; i < 150; i += 1) {
  particlePositions.push((Math.random() - 0.5) * 23, (Math.random() - 0.5) * 14, -2.2 - Math.random() * 0.4);
}
particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(particlePositions, 3));
const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0x526b58, size: 0.035, transparent: true, opacity: 0.55 }));
scene.add(particles);

function animate() {
  animationFrame = requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

startButton.addEventListener("click", () => {
  if (handControlActive) disableHandControl();
  else void enableHandControl();
});
clearButton.addEventListener("click", clearObjects);
window.addEventListener("resize", resizeScene);
document.querySelector(".theme-toggle")?.addEventListener("click", () => requestAnimationFrame(updateThemeColors));
new MutationObserver(updateThemeColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

resizeScene();
updateThemeColors();
updateObjectCount();
animate();

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  cameraController?.stop();
  video.srcObject?.getTracks().forEach((track) => track.stop());
});
