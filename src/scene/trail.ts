// The whole trail: six dioramas climbing a slope, path markers between them, the hiker
// and a camera that glides to wherever the hiker stands. React talks to it through sync().

import gsap from "gsap";
import * as THREE from "three";
import { type GameState, openRoutes } from "../game/state";
import { LOCATION_INFO, LOCATIONS, type LocationId, ROUTES } from "../game/world";
import type { Assets } from "./assets";
import { Backdrop } from "./backdrop";
import { CloudFloor } from "./cloud-floor";
import type { DioramaParts } from "./diorama";
import { setFoliageDensity, setWind } from "./foliage";
import { tarn, terrace } from "./highlands";
import { mesh, PALETTE, rng } from "./kit";
import { BOOKMARKS, type BookmarkName, followPose, LAYOUT, type Pose, RADIUS } from "./layout";
import { ford, gate, hollow } from "./lowlands";
import { hiker, nameBoard, stone } from "./props";
import type { Quality } from "./render/pipeline";
import { shelter } from "./shelter";
import { Stage } from "./stage";
import type { TerrainHandle } from "./terrain";
import { Transfer } from "./transfer";
import { cheapWater } from "./water";
import { WeatherCell } from "./weather";

const BUILD = { gate, ford, hollow, terrace, tarn, shelter } as const;

interface Stop {
  id: LocationId;
  root: THREE.Group;
  parts: DioramaParts;
  cell: WeatherCell;
}

export class TrailScene {
  private readonly stage: Stage;
  private readonly stops: Stop[] = [];
  private readonly markers: { routes: string[]; mat: THREE.MeshStandardMaterial }[] = [];
  private readonly walker = hiker();
  private readonly transfer = new Transfer();
  private readonly backdrop: Backdrop;
  private readonly cloudFloor: CloudFloor;
  private readonly focus = new THREE.Vector3();
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private state: GameState | null = null;
  private calm: boolean;
  private down: { x: number; y: number } | null = null;
  private bookmark: BookmarkName | null = null;
  onPick: (id: LocationId) => void = () => {};

  constructor(
    host: HTMLElement,
    calm: boolean,
    onReady: () => void,
    loaded: Assets,
    quality: Quality,
    adaptive = true,
  ) {
    this.calm = calm;
    // Keep tweens on wall-clock time: slow devices jump rather than crawl in slow motion.
    gsap.ticker.lagSmoothing(0);
    setFoliageDensity(quality === "high" ? 1 : 0.35);
    this.stage = new Stage(host, quality, loaded);
    this.stage.adaptive = adaptive;
    this.stage.onDegrade = cheapWater;
    this.stage.onFirstFrame = onReady;
    LOCATIONS.forEach((id, i) => {
      const parts = BUILD[id](RADIUS, 11 + i * 17);
      const root = new THREE.Group();
      root.position.set(...LAYOUT[id]);
      root.rotation.y = i % 2 === 0 ? 0.25 : -0.25;
      root.add(parts.group);
      const board = nameBoard(LOCATION_INFO[id].name);
      board.position.set(RADIUS * 0.55, 0, RADIUS * 0.72);
      board.rotation.y = -root.rotation.y + 0.15;
      parts.group.add(board);
      root.userData.loc = id;
      const cell = new WeatherCell({
        radius: RADIUS,
        fogHeight: parts.fogHeight,
        fogSpread: parts.fogSpread,
        seed: 100 + i,
      });
      root.add(cell.group);
      this.stage.scene.add(root);
      this.stops.push({ id, root, parts, cell });
    });
    this.buildMarkers();
    this.backdrop = new Backdrop(
      new THREE.Vector3(...LAYOUT.hollow).lerp(new THREE.Vector3(...LAYOUT.terrace), 0.5),
      new THREE.Vector3(...LAYOUT.shelter),
    );
    this.cloudFloor = new CloudFloor(
      this.stage.sky,
      -11,
      new THREE.Vector3(...LAYOUT.hollow).lerp(new THREE.Vector3(...LAYOUT.terrace), 0.5),
    );
    this.stage.scene.add(
      this.backdrop.group,
      this.walker.group,
      this.transfer.group,
      this.cloudFloor.mesh,
    );
    this.stage.aoHidden.push(this.cloudFloor.mesh);
    // Transparent effects (fog, rain, wind, water, sprites, glass) stay out of the AO G-buffer.
    this.stage.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      const see = mats.some(
        (x) => x.transparent || (x as THREE.MeshPhysicalMaterial).transmission > 0,
      );
      if (see || o instanceof THREE.Sprite || o instanceof THREE.LineSegments)
        this.stage.aoHidden.push(o);
    });
    this.stage.onFrame = (dt, t) => this.frame(dt, t);
    this.stage.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.stage.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.stage.renderer.domElement.addEventListener("pointermove", this.onMove);
  }

  start(): void {
    this.stage.start();
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
  }

  /** Bring the scene in line with the game. `instant` skips tweens (first sync, replay). */
  sync(next: GameState, instant = false): void {
    const prev = this.state;
    this.state = next;
    for (const s of this.stops) s.cell.set(next.weather[s.id], instant);
    const open = openRoutes(next.weather);
    for (const m of this.markers) {
      const lit = m.routes.some((r) => open.has(r));
      gsap.to(m.mat, { emissiveIntensity: lit ? 1.6 : 0, duration: instant ? 0 : 0.6 });
      m.mat.color.set(lit ? "#ffe1ad" : "#6a6a60");
    }
    const animate = !instant && prev !== null && prev.at === next.at;
    this.walker.jar.set(next.jar, animate, this.calm);
    const kind = next.jar ?? prev?.jar;
    if (animate && kind && prev.jar !== next.jar) {
      const centre = this.stopOf(next.at).root.position;
      const jar = this.walker.jar.group.getWorldPosition(new THREE.Vector3());
      this.transfer.burst(kind, centre, jar, next.jar !== null, this.calm);
    }
    const moved = !prev || prev.at !== next.at;
    if (moved) this.walkTo(prev ? prev.trail.length : 0, next, instant || !prev);
  }

  private walkTo(from: number, s: GameState, instant: boolean): void {
    const path = s.trail.slice(Math.max(0, from - 1)).map((id) => this.standPoint(id));
    const end = path[path.length - 1] ?? this.standPoint(s.at);
    const target = this.stopOf(s.at)
      .root.position.clone()
      .add(new THREE.Vector3(0, 0.7, 0));
    gsap.killTweensOf(this.walker.group.position);
    gsap.killTweensOf(this.focus);
    if (instant || this.calm) {
      this.walker.group.position.copy(end);
      this.focus.copy(target);
      return;
    }
    const tl = gsap.timeline();
    const leg = 0.55;
    for (const p of path.slice(1)) {
      tl.to(this.walker.group.position, { x: p.x, z: p.z, duration: leg, ease: "sine.inOut" });
      tl.to(this.walker.group.position, { y: p.y + 0.5, duration: leg / 2, ease: "sine.out" }, `<`);
      tl.to(
        this.walker.group.position,
        { y: p.y, duration: leg / 2, ease: "sine.in" },
        `<${leg / 2}`,
      );
    }
    gsap.to(this.focus, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: Math.max(0.9, tl.duration()),
      ease: "power2.inOut",
    });
  }

  private stopOf(id: LocationId): Stop {
    return this.stops.find((s) => s.id === id) as Stop;
  }

  private standPoint(id: LocationId): THREE.Vector3 {
    const s = this.stopOf(id);
    return s.root.localToWorld(s.parts.stand.clone());
  }

  private buildMarkers(): void {
    for (let i = 0; i < LOCATIONS.length - 1; i++) {
      const a = LOCATIONS[i] as LocationId;
      const b = LOCATIONS[i + 1] as LocationId;
      const routes = ROUTES.filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)).map(
        (r) => r.id,
      );
      const mat = new THREE.MeshStandardMaterial({
        color: "#6a6a60",
        emissive: PALETTE.lantern,
        emissiveIntensity: 0,
      });
      this.markers.push({ routes, mat });
      const pa = new THREE.Vector3(...LAYOUT[a]);
      const pb = new THREE.Vector3(...LAYOUT[b]);
      const r = rng(i + 7);
      for (let k = 1; k <= 3; k++) {
        const t = 0.3 + k * 0.1;
        const p = pa.clone().lerp(pb, t);
        p.y = pa.y + (pb.y - pa.y) * t - 0.5;
        const rock = stone(0.2, 50 + i * 3 + k, 0.5);
        rock.position.copy(p);
        const bulb = mesh(new THREE.SphereGeometry(0.07, 10, 8), mat, "none");
        bulb.position.copy(p).add(new THREE.Vector3(0, 0.22 + r() * 0.05, 0));
        this.stage.scene.add(rock, bulb);
      }
    }
  }

  private frame(dt: number, time: number): void {
    const s = this.state;
    if (!s) return;
    setWind(time, this.calm ? 0.15 : 1);
    for (const stop of this.stops) {
      stop.cell.update(dt, time, this.calm);
      const terrain = stop.parts.group.userData.terrain as TerrainHandle | undefined;
      if (terrain) terrain.wetness.value = stop.cell.level.rain;
      stop.parts.update(dt, time, this.calm, stop.cell.level, s);
    }
    const cam = this.stage.camera;
    const sway = this.calm ? 0 : Math.sin(time * 0.15) * 0.25 + this.pointer.x * 0.4;
    const pose: Pose = this.bookmark
      ? BOOKMARKS[this.bookmark](cam.aspect)
      : followPose(this.focus, cam.aspect, sway);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    this.stage.aimLight(this.bookmark ? pose.target : this.focus);
    const w = this.walker.group;
    w.rotation.y = this.calm ? 0.3 : 0.3 + Math.sin(time * 0.7) * 0.08;
    this.walker.jar.update(time, this.calm);
    this.transfer.update(dt);
    this.backdrop.update(time, this.calm);
    this.cloudFloor.update(this.calm ? 0 : time);
  }

  private pick(clientX: number, clientY: number): LocationId | null {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const hits = this.raycaster.intersectObjects(
      this.stops.map((s) => s.parts.group),
      true,
    );
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.loc) o = o.parent;
      if (o) return o.userData.loc as LocationId;
    }
    return null;
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 8) return;
    const id = this.pick(e.clientX, e.clientY);
    if (id) this.onPick(id);
  };

  private readonly onMove = (e: PointerEvent): void => {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    if (e.pointerType === "mouse") {
      const id = this.pick(e.clientX, e.clientY);
      this.stage.renderer.domElement.style.cursor =
        id && id !== this.state?.at ? "pointer" : "default";
    }
  };

  /** Swap in the full-resolution sky once it has streamed in (same orientation). */
  setBackground(sky: THREE.Texture): void {
    this.stage.scene.background = sky;
  }

  /** Visual-test hooks: pin the camera to a named bookmark (null returns to play). */
  setBookmark(name: BookmarkName | null): void {
    this.bookmark = name;
  }

  get stageForTests(): Stage {
    return this.stage;
  }

  dispose(): void {
    const el = this.stage.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    gsap.killTweensOf(this.focus);
    this.stage.dispose();
  }
}
