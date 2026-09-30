// The whole trail: six dioramas climbing a slope, path markers between them, the hiker
// and a camera that glides to wherever the hiker stands. React talks to it through sync().

import gsap from "gsap";
import * as THREE from "three";
import { type GameState, openRoutes } from "../game/state";
import { LOCATION_INFO, LOCATIONS, type LocationId, ROUTES } from "../game/world";
import { type Assets, assetResources, disposeAssets } from "./assets";
import { Backdrop } from "./backdrop";
import { CloudFloor } from "./cloud-floor";
import type { DioramaParts } from "./diorama";
import { clearFog } from "./fog";
import { clearFoliage, setFoliageDensity, setFoliageReveal, setWind } from "./foliage";
import { tarn, terrace } from "./highlands";
import { TapGesture } from "./input";
import { clearKit, mesh, PALETTE, rng } from "./kit";
import { BOOKMARKS, type BookmarkName, followPose, LAYOUT, type Pose, RADIUS } from "./layout";
import { ford, gate, hollow } from "./lowlands";
import { TravelMotion } from "./motion";
import { Opening } from "./opening";
import { clearProps, hiker, nameBoard, stone } from "./props";
import type { Quality } from "./render/pipeline";
import { shelter } from "./shelter";
import { Stage } from "./stage";
import type { TerrainHandle } from "./terrain";
import { Transfer } from "./transfer";
import { cheapWater, clearWater } from "./water";
import { WeatherCell } from "./weather";

const BUILD = { gate, ford, hollow, terrace, tarn, shelter } as const;

interface Stop {
  id: LocationId;
  root: THREE.Group;
  parts: DioramaParts;
  cell: WeatherCell;
}

export class TrailScene {
  readonly opening = new Opening();
  private readonly stage: Stage;
  private readonly stops: Stop[] = [];
  private readonly markers: { routes: string[]; mat: THREE.MeshStandardMaterial }[] = [];
  private readonly walker = hiker();
  private readonly transfer = new Transfer();
  private readonly backdrop: Backdrop;
  private readonly cloudFloor: CloudFloor;
  private readonly focus = new THREE.Vector3();
  private readonly movement = new TravelMotion(this.walker.group.position, this.focus);
  private readonly gesture = new TapGesture();
  private readonly removeFoliageReveal: () => void;
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private state: GameState | null = null;
  private calm: boolean;
  private inputEnabled = true;
  private disposed = false;
  private starting: Promise<boolean> | null = null;
  private motionTime = 0;
  private readonly motionPreference: MediaQueryList;
  private observedMotion: boolean;
  private bookmark: BookmarkName | null = null;
  onPick: (id: LocationId) => void = () => {};

  constructor(
    host: HTMLElement,
    calm: boolean,
    onReady: () => void,
    private readonly loaded: Assets,
    quality: Quality,
    adaptive = true,
  ) {
    this.calm = calm;
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.observedMotion = this.motionPreference.matches;
    // Keep tweens on wall-clock time: slow devices jump rather than crawl in slow motion.
    gsap.ticker.lagSmoothing(0);
    setFoliageDensity(quality === "low" ? 0.35 : 1);
    this.stage = new Stage(host, quality, loaded);
    this.stage.adaptive = adaptive;
    this.stage.onDegrade = cheapWater;
    this.stage.onFirstFrame = onReady;
    this.removeFoliageReveal = setFoliageReveal((objects) => this.stage.reveal(objects));
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
    this.stage.renderer.domElement.addEventListener("pointercancel", this.onCancel);
    this.stage.renderer.domElement.addEventListener("lostpointercapture", this.onCancel);
    this.stage.renderer.domElement.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Compile every shader behind the arrival veil, then start the frame loop. */
  start(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.starting ??= this.stage.precompile().then((compiled) => {
      if (!compiled || this.disposed) return false;
      this.stage.start();
      return true;
    });
    return this.starting;
  }

  setCalm(calm: boolean): void {
    if (this.disposed || this.calm === calm) return;
    this.calm = calm;
    if (calm) {
      this.movement.finish();
      this.walker.jar.finish();
      this.transfer.finish();
      this.opening.finish();
      if (this.state) this.sync(this.state, true);
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled && !this.disposed;
    if (!this.inputEnabled) this.resetPointer();
  }

  /** Bring the scene in line with the game. `instant` skips tweens (first sync, replay). */
  sync(next: GameState, instant = false): void {
    if (this.disposed) return;
    const prev = this.state;
    this.state = next;
    const snap = instant || this.calm;
    if (instant) this.transfer.finish();
    for (const s of this.stops) s.cell.set(next.weather[s.id], snap);
    const open = openRoutes(next.weather);
    for (const m of this.markers) {
      const lit = m.routes.some((r) => open.has(r));
      gsap.killTweensOf(m.mat);
      if (snap) m.mat.emissiveIntensity = lit ? 1.6 : 0;
      else gsap.to(m.mat, { emissiveIntensity: lit ? 1.6 : 0, duration: 0.6 });
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
    const moved = instant || !prev || prev.at !== next.at;
    if (moved) this.walkTo(prev ? prev.trail.length : 0, next, instant || !prev);
    if (snap) this.frame(0, 0, true);
  }

  private walkTo(from: number, s: GameState, instant: boolean): void {
    const path = s.trail.slice(Math.max(0, from - 1)).map((id) => this.standPoint(id));
    const end = path[path.length - 1] ?? this.standPoint(s.at);
    const target = this.stopOf(s.at)
      .root.position.clone()
      .add(new THREE.Vector3(0, 0.7, 0));
    this.movement.move(path.length ? path : [end], target, instant || this.calm);
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

  private frame(dt: number, _time: number, instant = false): void {
    const preference = this.motionPreference.matches;
    if (preference !== this.observedMotion) {
      // Some browsers update matches before dispatching change; only react to a change in
      // the observed preference so an explicit initial calm setting is still respected.
      this.observedMotion = preference;
      this.setCalm(preference);
    }
    const s = this.state;
    if (!s) return;
    if (!this.calm) this.motionTime += dt;
    const time = this.motionTime;
    setWind(time, this.calm ? 0 : 1);
    for (const stop of this.stops) {
      stop.cell.update(dt, time, this.calm);
      const terrain = stop.parts.group.userData.terrain as TerrainHandle | undefined;
      if (terrain) terrain.wetness.value = stop.cell.level.rain;
      stop.parts.update(this.calm ? 0 : dt, time, this.calm, stop.cell.level, s, instant);
    }
    const cam = this.stage.camera;
    const sway = this.calm ? 0 : Math.sin(time * 0.15) * 0.25 + this.pointer.x * 0.4;
    const w = this.stage.renderer.domElement.clientWidth || innerWidth;
    const h = this.stage.renderer.domElement.clientHeight || innerHeight;
    const rail =
      w <= 720 && h <= 550 && w > h
        ? (document.querySelector<HTMLElement>(".weather-hud")?.getBoundingClientRect().width ??
          Math.min(320, w * 0.54))
        : 0;
    const home: Pose = this.bookmark
      ? BOOKMARKS[this.bookmark](cam.aspect)
      : { ...followPose(this.focus, cam.aspect, sway, (w - rail) / h), shiftX: rail / 2 };
    if (this.bookmark) cam.clearViewOffset();
    const pose = this.bookmark ? home : this.opening.update(dt, cam, home, this.calm);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    this.stage.aimLight(this.bookmark || this.opening.phase !== "done" ? pose.target : this.focus);
    this.walker.group.rotation.y = this.calm ? 0.3 : 0.3 + Math.sin(time * 0.7) * 0.08;
    this.walker.jar.update(time, this.calm);
    this.transfer.update(dt);
    this.backdrop.update(time, this.calm);
    this.cloudFloor.update(time);
  }

  private pick(clientX: number, clientY: number): LocationId | null {
    if (!this.canPick) return null;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
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
    if (!this.canPick || e.button !== 0) return;
    this.gesture.press(e.pointerId, e.clientX, e.clientY);
    this.stage.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private readonly onUp = (e: PointerEvent): void => {
    const tap = this.gesture.release(e.pointerId, e.clientX, e.clientY);
    const el = this.stage.renderer.domElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!tap || !this.canPick) return;
    const id = this.pick(e.clientX, e.clientY);
    if (id) this.onPick(id);
  };

  private readonly onMove = (e: PointerEvent): void => {
    this.gesture.move(e.pointerId, e.clientX, e.clientY);
    if (!this.canPick) return;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    if (e.pointerType === "mouse") {
      const id = this.pick(e.clientX, e.clientY);
      this.stage.renderer.domElement.style.cursor =
        id && id !== this.state?.at ? "pointer" : "default";
    }
  };

  private get canPick(): boolean {
    return (
      !this.disposed &&
      !document.hidden &&
      this.inputEnabled &&
      this.opening.phase === "done" &&
      !this.bookmark
    );
  }

  private readonly onCancel = (e: PointerEvent): void => {
    this.gesture.cancel(e.pointerId);
    this.pointer.x = 0;
    this.stage.renderer.domElement.style.cursor = "default";
  };

  private readonly onLeave = (): void => {
    this.pointer.x = 0;
    this.stage.renderer.domElement.style.cursor = "default";
  };

  private readonly onBlur = (): void => this.resetPointer();
  private readonly onVisibility = (): void => {
    if (document.hidden) this.resetPointer();
  };

  private resetPointer(): void {
    const el = this.stage.renderer.domElement;
    for (const id of this.gesture.pointers)
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    this.gesture.reset();
    this.onLeave();
  }

  /** Swap in the full-resolution sky once it has streamed in (same orientation). */
  setBackground(sky: THREE.Texture): void {
    if (this.disposed) {
      sky.dispose();
      return;
    }
    this.stage.scene.background = sky;
  }

  /** Visual-test hooks: pin the camera to a named bookmark (null returns to play). */
  setBookmark(name: BookmarkName | null): void {
    this.bookmark = name;
    this.resetPointer();
  }

  movementForTests() {
    const expected = this.state ? this.standPoint(this.state.at) : this.walker.group.position;
    return {
      active: this.movement.active,
      calm: this.calm,
      at: this.state?.at ?? null,
      walker: this.walker.group.position.toArray(),
      expected: expected.toArray(),
      focus: this.focus.toArray(),
      distance: this.walker.group.position.distanceTo(expected),
      pointers: this.gesture.pointers.size,
    };
  }

  get stageForTests(): Stage {
    return this.stage;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetPointer();
    const el = this.stage.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointercancel", this.onCancel);
    el.removeEventListener("lostpointercapture", this.onCancel);
    el.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.movement.cancel();
    this.walker.jar.finish();
    this.transfer.finish();
    for (const marker of this.markers) gsap.killTweensOf(marker.mat);
    this.opening.onDone = () => {};
    this.onPick = () => {};
    this.removeFoliageReveal();
    const resources = assetResources(this.loaded);
    resources.tree(this.stage.scene);
    for (const material of this.transfer.materials) resources.material(material);
    clearFoliage(resources);
    clearFog(resources);
    clearProps(resources);
    clearKit(resources);
    clearWater(resources);
    disposeAssets(this.loaded);
    this.stage.dispose();
    this.stage.scene.clear();
  }
}
