import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import * as THREE from "three";
import { clamp } from "../scene/iso";
import type { CustomPrefabDraft, CustomPrefabPoint } from "../scene/customPrefabs";

type Prefab3DEditorProps = {
  onCreatePrefab: (draft: CustomPrefabDraft) => void;
};

type PrimitiveKind = "box" | "cylinder";

type Primitive = {
  id: string;
  kind: PrimitiveKind;
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  rotationY: number;
};

type Point2 = { x: number; z: number };
type DragMode = "orbit" | "move" | "rotate";
type DragState = {
  pointerId: number;
  mode: DragMode;
  startX: number;
  startY: number;
  startAzimuth?: number;
  startPolar?: number;
  primitiveId?: string;
  planeY?: number;
  offsetX?: number;
  offsetZ?: number;
  startRotation?: number;
};

const VIEWPORT_HEIGHT = 230;
const INITIAL_PRIMITIVE_ID = "box-0";

function colorHexToNumber(hex: string): number {
  return Number.parseInt(hex.replace(/^#/, ""), 16);
}

function createDefaultPrimitive(kind: PrimitiveKind, index: number): Primitive {
  const size = kind === "box" ? { x: 1, y: 0.8, z: 1 } : { x: 0.9, y: 1, z: 0.9 };
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    position: { x: index * 0.2, y: size.y * 0.5, z: index * 0.2 },
    size,
    rotationY: 0,
  };
}

function createInitialPrimitive(): Primitive {
  return {
    id: INITIAL_PRIMITIVE_ID,
    kind: "box",
    position: { x: 0, y: 0.4, z: 0 },
    size: { x: 1, y: 0.8, z: 1 },
    rotationY: 0,
  };
}

function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((node) => {
      if (!(node instanceof THREE.Mesh || node instanceof THREE.LineSegments)) return;
      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        for (const material of node.material) material.dispose();
      } else {
        node.material.dispose();
      }
    });
  }
}

function toWorldPoints(primitive: Primitive): Point2[] {
  const cos = Math.cos(primitive.rotationY);
  const sin = Math.sin(primitive.rotationY);
  const transform = (x: number, z: number): Point2 => ({
    x: primitive.position.x + x * cos - z * sin,
    z: primitive.position.z + x * sin + z * cos,
  });

  if (primitive.kind === "box") {
    const halfX = primitive.size.x * 0.5;
    const halfZ = primitive.size.z * 0.5;
    return [
      transform(-halfX, -halfZ),
      transform(halfX, -halfZ),
      transform(halfX, halfZ),
      transform(-halfX, halfZ),
    ];
  }

  const points: Point2[] = [];
  const radiusX = primitive.size.x * 0.5;
  const radiusZ = primitive.size.z * 0.5;
  const steps = 16;
  for (let index = 0; index < steps; index += 1) {
    const theta = (Math.PI * 2 * index) / steps;
    points.push(transform(Math.cos(theta) * radiusX, Math.sin(theta) * radiusZ));
  }
  return points;
}

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function convexHull(points: Point2[]): Point2[] {
  if (points.length <= 3) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  const lower: Point2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point2[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function buildDraft(
  primitives: Primitive[],
  name: string,
  topColor: string,
  sideColor: string,
  alpha: number,
  zLayer: number
): CustomPrefabDraft | null {
  if (primitives.length === 0) return null;
  const points = primitives.flatMap(toWorldPoints);
  if (points.length < 3) return null;
  const hull = convexHull(points);
  if (hull.length < 3) return null;

  const xs = hull.map((point) => point.x);
  const zs = hull.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const span = Math.max(0.25, maxX - minX, maxZ - minZ);

  const footprint: CustomPrefabPoint[] = hull.map((point) => ({
    u: clamp((point.x - centerX) / span, -0.5, 0.5),
    v: clamp((point.z - centerZ) / span, -0.5, 0.5),
  }));

  const minY = Math.min(...primitives.map((primitive) => primitive.position.y - primitive.size.y * 0.5));
  const maxY = Math.max(...primitives.map((primitive) => primitive.position.y + primitive.size.y * 0.5));
  const worldHeight = Math.max(0.08, maxY - minY);
  const normalizedHeight = clamp((worldHeight / span) * 0.2, 0.05, 0.8);

  return {
    name: name.trim().length > 0 ? name : "Prefab 3D",
    footprint,
    height: normalizedHeight,
    zLayer: Math.round(clamp(zLayer, 1, 60)),
    topColor: colorHexToNumber(topColor),
    sideColor: colorHexToNumber(sideColor),
    alpha: clamp(alpha, 0.2, 1),
  };
}

function formatAngle(value: number): string {
  return `${Math.round((value * 180) / Math.PI)}deg`;
}

function normalizePointer(
  event: PointerEvent<HTMLDivElement> | WheelEvent,
  host: HTMLDivElement
): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export function Prefab3DEditor({ onCreatePrefab }: Prefab3DEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerVectorRef = useRef(new THREE.Vector2());
  const orbitRef = useRef({ radius: 4, azimuth: 0.9, polar: 1.05, targetY: 0.45 });
  const dragStateRef = useRef<DragState | null>(null);

  const [name, setName] = useState("Prefab 3D");
  const [zLayer, setZLayer] = useState(12);
  const [alpha, setAlpha] = useState(0.95);
  const [topColor, setTopColor] = useState("#d7e3ff");
  const [sideColor, setSideColor] = useState("#5f6f95");
  const [primitives, setPrimitives] = useState<Primitive[]>(() => [createInitialPrimitive()]);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_PRIMITIVE_ID);
  const primitiveIndexRef = useRef(1);

  const selectedPrimitive = useMemo(
    () => primitives.find((primitive) => primitive.id === selectedId) ?? null,
    [primitives, selectedId]
  );

  const draftPreview = useMemo(
    () => buildDraft(primitives, name, topColor, sideColor, alpha, zLayer),
    [alpha, name, primitives, sideColor, topColor, zLayer]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(48, host.clientWidth / VIEWPORT_HEIGHT, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, VIEWPORT_HEIGHT, false);
    renderer.domElement.className = "prefab-3d-editor__canvas";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(3, 4, 2);
    scene.add(keyLight);

    const grid = new THREE.GridHelper(6, 12, 0x334155, 0x1e293b);
    scene.add(grid);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const resizeObserver = new ResizeObserver(() => {
      if (!host || !rendererRef.current || !cameraRef.current) return;
      const width = Math.max(180, host.clientWidth);
      rendererRef.current.setSize(width, VIEWPORT_HEIGHT, false);
      cameraRef.current.aspect = width / VIEWPORT_HEIGHT;
      cameraRef.current.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    let animationFrame = 0;
    const renderFrame = () => {
      const rendererInstance = rendererRef.current;
      const cameraInstance = cameraRef.current;
      if (!rendererInstance || !cameraInstance || !sceneRef.current) return;

      const orbit = orbitRef.current;
      const sinPolar = Math.sin(orbit.polar);
      cameraInstance.position.set(
        orbit.radius * sinPolar * Math.cos(orbit.azimuth),
        orbit.radius * Math.cos(orbit.polar),
        orbit.radius * sinPolar * Math.sin(orbit.azimuth)
      );
      cameraInstance.lookAt(0, orbit.targetY, 0);

      rendererInstance.render(sceneRef.current, cameraInstance);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (groupRef.current) {
        disposeGroupChildren(groupRef.current);
      }
      renderer.dispose();
      if (host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    disposeGroupChildren(group);

    for (const primitive of primitives) {
      const isSelected = primitive.id === selectedId;
      const baseColor = colorHexToNumber(sideColor);
      const material = new THREE.MeshStandardMaterial({
        color: isSelected ? 0xa7f3d0 : baseColor,
        roughness: 0.62,
        metalness: 0.08,
        emissive: isSelected ? 0x0f766e : 0x000000,
        emissiveIntensity: isSelected ? 0.6 : 0,
      });

      const mesh =
        primitive.kind === "box"
          ? new THREE.Mesh(new THREE.BoxGeometry(primitive.size.x, primitive.size.y, primitive.size.z), material)
          : new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), material);

      if (primitive.kind === "cylinder") {
        mesh.scale.set(primitive.size.x, primitive.size.y, primitive.size.z);
      }

      mesh.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
      mesh.rotation.y = primitive.rotationY;
      mesh.userData.primitiveId = primitive.id;

      if (isSelected) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95 })
        );
        if (primitive.kind === "cylinder") {
          edges.scale.set(primitive.size.x, primitive.size.y, primitive.size.z);
        }
        mesh.add(edges);

        const footprintRadius = Math.max(primitive.size.x, primitive.size.z) * 0.62;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(footprintRadius, footprintRadius + 0.08, 36),
          new THREE.MeshBasicMaterial({
            color: 0x67e8f9,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.55,
          })
        );
        ring.rotation.x = -Math.PI * 0.5;
        ring.position.y = -primitive.size.y * 0.5 + 0.015;
        mesh.add(ring);
      }

      group.add(mesh);
    }
  }, [primitives, selectedId, sideColor]);

  function updatePrimitiveById(
    primitiveId: string,
    patch:
      | Partial<Primitive>
      | { position?: Partial<Primitive["position"]>; size?: Partial<Primitive["size"]>; rotationY?: number }
  ) {
    setPrimitives((prev) =>
      prev.map((primitive) => {
        if (primitive.id !== primitiveId) return primitive;
        return {
          ...primitive,
          ...patch,
          position: {
            ...primitive.position,
            ...(patch.position ?? {}),
          },
          size: {
            ...primitive.size,
            ...(patch.size ?? {}),
          },
        };
      })
    );
  }

  function addPrimitive(kind: PrimitiveKind) {
    const next = createDefaultPrimitive(kind, primitiveIndexRef.current);
    primitiveIndexRef.current += 1;
    setPrimitives((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  function removeSelectedPrimitive() {
    if (!selectedId) return;
    const remaining = primitives.filter((primitive) => primitive.id !== selectedId);
    setPrimitives(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  }

  function resetScene() {
    const first = createInitialPrimitive();
    primitiveIndexRef.current = 1;
    setPrimitives([first]);
    setSelectedId(first.id);
  }

  function pickPrimitiveAtPointer(
    event: PointerEvent<HTMLDivElement> | WheelEvent
  ): { primitiveId: string; hitPoint: THREE.Vector3 } | null {
    const host = hostRef.current;
    const camera = cameraRef.current;
    const group = groupRef.current;
    if (!host || !camera || !group) return null;

    const pointer = normalizePointer(event, host);
    pointerVectorRef.current.set(pointer.x, pointer.y);
    raycasterRef.current.setFromCamera(pointerVectorRef.current, camera);
    const intersections = raycasterRef.current.intersectObjects(group.children, false);
    const hit = intersections.find((entry) => typeof entry.object.userData.primitiveId === "string");
    if (!hit) return null;
    const primitiveId = String(hit.object.userData.primitiveId);
    return { primitiveId, hitPoint: hit.point.clone() };
  }

  function intersectPointerWithPlaneAtY(event: PointerEvent<HTMLDivElement>, y: number): THREE.Vector3 | null {
    const host = hostRef.current;
    const camera = cameraRef.current;
    if (!host || !camera) return null;

    const pointer = normalizePointer(event, host);
    pointerVectorRef.current.set(pointer.x, pointer.y);
    raycasterRef.current.setFromCamera(pointerVectorRef.current, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(plane, out);
    if (!hit) return null;
    return out;
  }

  function handleHostPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    const picked = pickPrimitiveAtPointer(event);
    if (picked) {
      setSelectedId(picked.primitiveId);
      const primitive = primitives.find((item) => item.id === picked.primitiveId);
      if (primitive) {
        if (event.shiftKey) {
          dragStateRef.current = {
            pointerId: event.pointerId,
            mode: "rotate",
            primitiveId: primitive.id,
            startX: event.clientX,
            startY: event.clientY,
            startRotation: primitive.rotationY,
          };
          return;
        }

        dragStateRef.current = {
          pointerId: event.pointerId,
          mode: "move",
          primitiveId: primitive.id,
          startX: event.clientX,
          startY: event.clientY,
          planeY: primitive.position.y,
          offsetX: primitive.position.x - picked.hitPoint.x,
          offsetZ: primitive.position.z - picked.hitPoint.z,
        };
        return;
      }
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      mode: "orbit",
      startX: event.clientX,
      startY: event.clientY,
      startAzimuth: orbitRef.current.azimuth,
      startPolar: orbitRef.current.polar,
    };
  }

  function handleHostPointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (dragState.mode === "orbit") {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      orbitRef.current.azimuth = (dragState.startAzimuth ?? orbitRef.current.azimuth) - dx * 0.01;
      orbitRef.current.polar = clamp((dragState.startPolar ?? orbitRef.current.polar) + dy * 0.01, 0.3, Math.PI - 0.3);
      return;
    }

    if (!dragState.primitiveId) return;
    if (dragState.mode === "rotate") {
      const deltaX = event.clientX - dragState.startX;
      const rotation = (dragState.startRotation ?? 0) + deltaX * 0.015;
      updatePrimitiveById(dragState.primitiveId, { rotationY: rotation });
      return;
    }

    const hitPoint = intersectPointerWithPlaneAtY(event, dragState.planeY ?? 0);
    if (!hitPoint) return;
    updatePrimitiveById(dragState.primitiveId, {
      position: {
        x: clamp(hitPoint.x + (dragState.offsetX ?? 0), -2.4, 2.4),
        z: clamp(hitPoint.z + (dragState.offsetZ ?? 0), -2.4, 2.4),
      },
    });
  }

  function handleHostPointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const picked = pickPrimitiveAtPointer(event);
      if (!picked || event.altKey) {
        orbitRef.current.radius = clamp(orbitRef.current.radius * Math.exp(event.deltaY * 0.0015), 1.5, 9);
        return;
      }

      setSelectedId(picked.primitiveId);
      const primitive = primitives.find((item) => item.id === picked.primitiveId);
      if (!primitive) return;

      const factor = Math.exp(-event.deltaY * 0.0015);
      if (event.shiftKey) {
        const nextHeight = clamp(primitive.size.y * factor, 0.2, 2);
        updatePrimitiveById(primitive.id, {
          size: { y: nextHeight },
          position: { y: nextHeight * 0.5 },
        });
        return;
      }

      const nextX = clamp(primitive.size.x * factor, 0.2, 2);
      const nextZ = clamp(primitive.size.z * factor, 0.2, 2);
      updatePrimitiveById(primitive.id, {
        size: {
          x: nextX,
          z: nextZ,
        },
      });
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      host.removeEventListener("wheel", onWheel);
    };
  }, [primitives]);

  function onChangeSelected(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedId(event.target.value);
  }

  function createPrefab() {
    if (!draftPreview) return;
    onCreatePrefab(draftPreview);
  }

  return (
    <div className="prefab-3d-editor">
      <label className="editor-panel__field">
        <span>Nom 3D</span>
        <input className="editor-panel__input" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div
        ref={hostRef}
        className="prefab-3d-editor__viewport"
        onPointerDown={handleHostPointerDown}
        onPointerMove={handleHostPointerMove}
        onPointerUp={handleHostPointerUp}
        onPointerCancel={handleHostPointerUp}
      />
      <div className="prefab-3d-editor__hint">
        Clic objet: selection. Drag objet: deplacer. Shift+drag objet: rotation. Molette objet: scale. Shift+molette
        objet: hauteur. Drag vide / Alt+molette: camera.
      </div>
      <div className="editor-panel__actions">
        <button type="button" className="editor-panel__btn" onClick={() => addPrimitive("box")}>
          + Box
        </button>
        <button type="button" className="editor-panel__btn" onClick={() => addPrimitive("cylinder")}>
          + Cylinder
        </button>
        <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={resetScene}>
          Reset
        </button>
      </div>

      <div className="prefab-3d-editor__controls">
        <label className="editor-panel__field">
          <span>Primitive</span>
          <select className="editor-panel__select" value={selectedId} onChange={onChangeSelected}>
            <option value="">Aucune</option>
            {primitives.map((primitive) => (
              <option key={primitive.id} value={primitive.id}>
                {primitive.kind} ({primitive.id})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="editor-panel__btn editor-panel__btn--danger"
          onClick={removeSelectedPrimitive}
          disabled={!selectedPrimitive}
        >
          Supprimer primitive
        </button>
      </div>
      {selectedPrimitive && (
        <div className="prefab-3d-editor__hint">
          Selection: {selectedPrimitive.kind} | rot {formatAngle(selectedPrimitive.rotationY)} | size{" "}
          {selectedPrimitive.size.x.toFixed(2)} x {selectedPrimitive.size.y.toFixed(2)} x{" "}
          {selectedPrimitive.size.z.toFixed(2)}
        </div>
      )}

      <div className="prefab-3d-editor__controls">
        <label className="editor-panel__field">
          <span>Couleur top</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={topColor}
            onChange={(event) => setTopColor(event.target.value)}
          />
        </label>
        <label className="editor-panel__field">
          <span>Couleur side</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={sideColor}
            onChange={(event) => setSideColor(event.target.value)}
          />
        </label>
        <label className="editor-panel__field">
          <span>Alpha</span>
          <input
            className="editor-panel__input"
            type="number"
            min={0.2}
            max={1}
            step={0.05}
            value={alpha}
            onChange={(event) => setAlpha(Number(event.target.value))}
          />
        </label>
        <label className="editor-panel__field">
          <span>Z Layer</span>
          <input
            className="editor-panel__input"
            type="number"
            min={1}
            max={60}
            step={1}
            value={zLayer}
            onChange={(event) => setZLayer(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="prefab-3d-editor__hint">
        {draftPreview
          ? `Preview: ${draftPreview.footprint.length} points, hauteur ${draftPreview.height.toFixed(3)}.`
          : "Ajoute au moins une primitive."}
      </div>
      <div className="editor-panel__actions">
        <button type="button" className="editor-panel__btn" onClick={createPrefab} disabled={!draftPreview}>
          Creer prefab depuis 3D
        </button>
      </div>
    </div>
  );
}
