/**
 * Polyfills required for pdfjs-dist in Node.js environment.
 * 
 * IMPORTANT: This file must be imported BEFORE pdfjs-dist is loaded anywhere.
 * It sets up global DOMMatrix which pdfjs-dist requires.
 */

// Polyfill DOMMatrix for Node.js environment (required by pdfjs-dist)
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    
    translate(tx: number, ty: number) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]); }
    scale(sx: number, sy = sx) { return new DOMMatrix([this.a * sx, this.b, this.c, this.d * sy, this.e, this.f]); }
    multiply(_other: DOMMatrix) { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(point: { x: number; y: number }) { return { x: point.x, y: point.y, z: 0, w: 1 }; }
  }
  (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
}

// Export nothing - this is a side-effect-only module
export {};

