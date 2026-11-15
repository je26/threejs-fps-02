// Input: keyboard, mouse, pointer lock, and the drag-to-look fallback.
// One job: turn raw browser events into a small polled state the simulation
// reads each tick. No game logic lives here.

export const Input = {
  keys: new Set(),
  lookDX: 0, lookDY: 0,
  locked: false,
  dragging: false,
  fireHeld: false,
  fireEdge: false,
  lastX: 0, lastY: 0,
  onKey: null, // set by main.js: (code, down) => void, for menu keys
};

const SENS = 0.0023;

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      Input.keys.add(e.code);
      if (Input.onKey) Input.onKey(e.code, true);
    }
  });
  window.addEventListener('keyup', (e) => {
    Input.keys.delete(e.code);
    if (Input.onKey) Input.onKey(e.code, false);
  });
  window.addEventListener('blur', () => {
    Input.keys.clear();
    Input.fireHeld = false;
    Input.dragging = false;
  });

  document.addEventListener('pointerlockchange', () => {
    Input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (Input.locked) {
      // Ignore absurd single-event jumps (a headless/pointer-lock quirk):
      // real mouse movement never covers 300px in one event.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      Input.lookDX += e.movementX;
      Input.lookDY += e.movementY;
    } else if (Input.dragging) {
      Input.lookDX += (e.clientX - Input.lastX) * 1.6;
      Input.lookDY += (e.clientY - Input.lastY) * 1.6;
      Input.lastX = e.clientX; Input.lastY = e.clientY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      Input.fireHeld = true;
      Input.fireEdge = true;
      if (!Input.locked) {
        // Drag fallback: hold and drag to look when pointer lock is off.
        Input.dragging = true;
        Input.lastX = e.clientX; Input.lastY = e.clientY;
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { Input.fireHeld = false; Input.dragging = false; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function requestLock(canvas) {
  if (!Input.locked && canvas.requestPointerLock) {
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* drag fallback covers it */ });
    } catch (_) { /* pointer lock unavailable: drag fallback covers it */ }
  }
}

export function releaseLock() {
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

// Consume accumulated look deltas (radians) for this tick, clamped so one
// bad frame can never spin the view.
export function consumeLook() {
  const dx = Math.max(-0.5, Math.min(0.5, Input.lookDX * SENS));
  const dy = Math.max(-0.5, Math.min(0.5, Input.lookDY * SENS));
  Input.lookDX = 0; Input.lookDY = 0;
  return { dx, dy };
}

export function consumeFireEdge() {
  const e = Input.fireEdge;
  Input.fireEdge = false;
  return e;
}

export function down(code) { return Input.keys.has(code); }
