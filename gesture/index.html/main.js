const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const cameraShell = document.querySelector(".camera-shell");
const ctx = overlay.getContext("2d");
const cursor = document.getElementById("cursor");
const clickFlash = document.getElementById("clickFlash");
const startButton = document.getElementById("startButton");
const cameraStatus = document.getElementById("cameraStatus");
const handStatus = document.getElementById("handStatus");
const cameraDot = document.getElementById("cameraDot");
const handDot = document.getElementById("handDot");
const pointerX = document.getElementById("pointerX");
const pointerY = document.getElementById("pointerY");
const pinchDistance = document.getElementById("pinchDistance");
const webStatus = document.getElementById("webStatus");
const interactionLab = document.getElementById("interactionLab");
const actionStatus = document.getElementById("actionStatus");
const mirrorPreview = document.getElementById("mirrorPreview");
const sensitivity = document.getElementById("sensitivity");
const sensitivityValue = document.getElementById("sensitivityValue");
const activeGain = document.getElementById("activeGain");

let camera;
let smoothedX = 0.5;
let smoothedY = 0.5;
let seenHand = false;
let pinchHeld = false;
let previewMirrored = false;
let lastCursorX = 0.5;
let lastCursorY = 0.5;
let lastThumbX = 0.5;
let lastThumbY = 0.5;
let lastThumbAt = performance.now();
let thumbTrackingInitialized = false;
let pressedTarget = null;
let draggingNote = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let hoveredTarget = null;

let cursorGain = Number(sensitivity.value);
const PINCH_DOWN_THRESHOLD = 0.025;
const PINCH_UP_THRESHOLD = 0.05;
const THUMB_DEAD_ZONE = 0.0018;
const MIN_SMOOTHING = 0.1;
const MAX_SMOOTHING = 0.5;
const MAX_SPEED_BOOST = 1.5;
const SPEED_ACCELERATION = 3.5;

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  overlay.width = Math.round(rect.width * window.devicePixelRatio);
  overlay.height = Math.round(rect.height * window.devicePixelRatio);
}

function showPressFlash(x, y) {
  clickFlash.style.left = `${x}px`;
  clickFlash.style.top = `${y}px`;
  clickFlash.animate(
    [{ opacity: 0.95, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(16)" }],
    { duration: 260, easing: "ease-out" }
  );
}

function getGestureTarget(x, y) {
  const element = document.elementFromPoint(x, y);
  return element?.closest("button, [data-gesture-draggable]") ?? null;
}

function setHoveredTarget(target) {
  if (hoveredTarget === target) return;
  hoveredTarget?.classList.remove("is-gesture-hovered");
  hoveredTarget = target;
  hoveredTarget?.classList.add("is-gesture-hovered");
}

function moveDraggedNote(x, y) {
  if (!draggingNote) return;
  const labBounds = interactionLab.getBoundingClientRect();
  const noteBounds = draggingNote.getBoundingClientRect();
  const left = clamp(x - labBounds.left - dragOffsetX, 0, Math.max(0, labBounds.width - noteBounds.width));
  const top = clamp(y - labBounds.top - dragOffsetY, 106, Math.max(106, labBounds.height - noteBounds.height));
  draggingNote.style.left = `${left}px`;
  draggingNote.style.top = `${top}px`;
}

function releaseWebPress(x, y) {
  if (!pinchHeld) return;
  const releaseTarget = getGestureTarget(x, y);
  if (draggingNote) {
    draggingNote.classList.remove("is-gesture-grabbed");
    actionStatus.textContent = "Note placed. Pinch and hold it again to keep exploring.";
  } else if (pressedTarget && pressedTarget === releaseTarget) {
    pressedTarget.click();
  }
  pressedTarget?.classList.remove("is-gesture-pressed");
  draggingNote = null;
  pressedTarget = null;
  pinchHeld = false;
  cursor.classList.remove("is-pinching");
}

function updateWebPointer(x, y, pinch) {
  const isPinching = pinchHeld ? pinch < PINCH_UP_THRESHOLD : pinch < PINCH_DOWN_THRESHOLD;
  const target = getGestureTarget(x, y);
  setHoveredTarget(target);

  if (isPinching && !pinchHeld) {
    pinchHeld = true;
    pressedTarget = target;
    cursor.classList.add("is-pinching");
    showPressFlash(x, y);

    if (target?.hasAttribute("data-gesture-draggable")) {
      draggingNote = target;
      const noteBounds = draggingNote.getBoundingClientRect();
      dragOffsetX = x - noteBounds.left;
      dragOffsetY = y - noteBounds.top;
      draggingNote.classList.add("is-gesture-grabbed");
      actionStatus.textContent = "Holding the note. Move your thumb while pinching to drag it.";
    } else if (target) {
      target.classList.add("is-gesture-pressed");
      actionStatus.textContent = "Pressed. Release your pinch to activate it.";
    } else {
      actionStatus.textContent = "Pressed. Move over a control, then release to activate it.";
    }
  } else if (!isPinching && pinchHeld) {
    releaseWebPress(x, y);
  } else if (pinchHeld) {
    moveDraggedNote(x, y);
  }
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothThumbPosition(thumbTip) {
  const now = performance.now();
  if (!thumbTrackingInitialized) {
    smoothedX = thumbTip.x;
    smoothedY = thumbTip.y;
    lastThumbX = thumbTip.x;
    lastThumbY = thumbTip.y;
    lastThumbAt = now;
    thumbTrackingInitialized = true;
    return { deltaX: 0, deltaY: 0, gain: cursorGain };
  }

  const elapsed = Math.max(1, now - lastThumbAt);
  const rawDistance = Math.hypot(thumbTip.x - lastThumbX, thumbTip.y - lastThumbY);
  const thumbSpeed = Math.max(0, rawDistance - THUMB_DEAD_ZONE) / elapsed * 1000;
  const distance = Math.hypot(thumbTip.x - smoothedX, thumbTip.y - smoothedY);
  const previousX = smoothedX;
  const previousY = smoothedY;

  if (distance > THUMB_DEAD_ZONE) {
    const smoothing = Math.min(MAX_SMOOTHING, MIN_SMOOTHING + distance * 6);
    smoothedX += (thumbTip.x - smoothedX) * smoothing;
    smoothedY += (thumbTip.y - smoothedY) * smoothing;
  }

  lastThumbX = thumbTip.x;
  lastThumbY = thumbTip.y;
  lastThumbAt = now;

  // Slow movement stays precise; fast movement expands the reachable screen area.
  return {
    deltaX: smoothedX - previousX,
    deltaY: smoothedY - previousY,
    gain: cursorGain * (1 + Math.min(MAX_SPEED_BOOST, thumbSpeed * SPEED_ACCELERATION)),
  };
}

function drawHandOverlay(landmarks) {
  const width = overlay.width;
  const height = overlay.height;
  ctx.clearRect(0, 0, width, height);

  window.drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(100, 210, 255, 0.85)", lineWidth: 4 });
  window.drawLandmarks(ctx, landmarks, { color: "rgba(255, 255, 255, 0.9)", lineWidth: 2, radius: 4 });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Camera not supported";
    cameraDot.style.background = "var(--danger)";
    return;
  }

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    selfieMode: false,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6,
  });

  hands.onResults((results) => {
    resizeCanvas();
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!results.multiHandLandmarks?.length) {
      if (pinchHeld) {
        releaseWebPress(lastCursorX * window.innerWidth, lastCursorY * window.innerHeight);
      }
      thumbTrackingInitialized = false;
      seenHand = false;
      handStatus.textContent = "Waiting for hand";
      handDot.style.background = "var(--danger)";
      cursor.style.opacity = "0";
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    seenHand = true;
    handStatus.textContent = "Hand tracked";
    handDot.style.background = "var(--success)";
    drawHandOverlay(landmarks);

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const dx = indexTip.x - thumbTip.x;
    const dy = indexTip.y - thumbTip.y;
    const pinch = Math.hypot(dx, dy);

    const thumbMotion = smoothThumbPosition(thumbTip);
    activeGain.textContent = `${thumbMotion.gain.toFixed(2)}x`;

    lastCursorX = clamp(lastCursorX + (previewMirrored ? -thumbMotion.deltaX : thumbMotion.deltaX) * thumbMotion.gain);
    lastCursorY = clamp(lastCursorY + thumbMotion.deltaY * thumbMotion.gain);
    const x = lastCursorX * window.innerWidth;
    const y = lastCursorY * window.innerHeight;

    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.opacity = "1";

    pointerX.textContent = x.toFixed(0);
    pointerY.textContent = y.toFixed(0);
    pinchDistance.textContent = pinch.toFixed(3);

    updateWebPointer(x, y, pinch);
  });

  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 1280,
    height: 800,
  });

  try {
    await camera.start();
    resizeCanvas();
    cameraStatus.textContent = "Camera running";
    cameraDot.style.background = "var(--success)";
  } catch (error) {
    console.error(error);
    cameraStatus.textContent = "Camera permission denied";
    cameraDot.style.background = "var(--danger)";
  }
}

startButton.addEventListener("click", startCamera);
window.addEventListener("resize", resizeCanvas);
mirrorPreview.addEventListener("change", () => {
  previewMirrored = mirrorPreview.checked;
  cameraShell.classList.toggle("is-mirrored", previewMirrored);
});
sensitivity.addEventListener("input", () => {
  cursorGain = Number(sensitivity.value);
  sensitivityValue.textContent = `${cursorGain.toFixed(2)}x base`;
  activeGain.textContent = `${cursorGain.toFixed(2)}x`;
});

document.querySelectorAll("[data-gesture-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.gestureAction === "pulse") {
      interactionLab.classList.remove("is-pulsing");
      void interactionLab.offsetWidth;
      interactionLab.classList.add("is-pulsing");
      actionStatus.textContent = "Surface pulsed. Pinch the color button for another response.";
    } else {
      interactionLab.classList.toggle("is-warm");
      actionStatus.textContent = interactionLab.classList.contains("is-warm")
        ? "Color shifted to ember mode."
        : "Color returned to ocean mode.";
    }
  });
});

webStatus.textContent = "Browser-only mode: no helper or Accessibility access needed";
