/** A tap belongs to one pointer. A drag, cancellation or second finger invalidates it. */
export class TapGesture {
  readonly pointers = new Set<number>();
  private down: { id: number; x: number; y: number; moved: boolean } | null = null;

  press(id: number, x: number, y: number): void {
    this.pointers.add(id);
    this.down = this.pointers.size === 1 ? { id, x, y, moved: false } : null;
  }

  move(id: number, x: number, y: number): void {
    if (this.down?.id === id && Math.hypot(x - this.down.x, y - this.down.y) > 8)
      this.down.moved = true;
  }

  release(id: number, x: number, y: number): boolean {
    this.move(id, x, y);
    const tap = this.down?.id === id && !this.down.moved;
    this.pointers.delete(id);
    if (this.down?.id === id) this.down = null;
    return tap;
  }

  cancel(id: number): void {
    this.pointers.delete(id);
    this.down = null;
  }

  reset(): void {
    this.down = null;
    this.pointers.clear();
  }
}
