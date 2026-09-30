import * as THREE from "three";

type Disposable = { dispose(): void };

/** One lifetime for assets and their scene copies, including late asynchronous arrivals. */
export class SceneResources {
  private readonly owned = new Set<Disposable>();
  private readonly released = new WeakSet<Disposable>();
  private closed = false;

  own<T extends Disposable>(resource: T): T {
    if (this.closed) this.release(resource);
    else this.owned.add(resource);
    return resource;
  }

  material(material: THREE.Material): void {
    this.own(material);
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) this.own(value);
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    if (uniforms)
      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof THREE.Texture) this.own(uniform.value);
        else if (Array.isArray(uniform.value))
          for (const value of uniform.value) if (value instanceof THREE.Texture) this.own(value);
      }
  }

  tree(root: THREE.Object3D): void {
    root.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry) this.own(drawable.geometry);
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
      for (const material of materials) if (material) this.material(material);
      if (object instanceof THREE.InstancedMesh) this.own(object);
      if (object instanceof THREE.Light && "shadow" in object)
        this.own((object as THREE.DirectionalLight).shadow);
    });
  }

  release(resource: Disposable): void {
    this.owned.delete(resource);
    if (this.released.has(resource)) return;
    this.released.add(resource);
    resource.dispose();
  }

  dispose(): void {
    this.closed = true;
    for (const resource of this.owned) this.release(resource);
  }
}
