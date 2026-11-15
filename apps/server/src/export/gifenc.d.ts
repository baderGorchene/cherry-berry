// gifenc ships no types; only what formats.ts uses.
declare module "gifenc" {
  type Palette = number[][];
  const gifenc: {
    GIFEncoder(): {
      writeFrame(index: Uint8Array, width: number, height: number, opts: { palette: Palette; delay?: number; repeat?: number }): void;
      finish(): void;
      bytes(): Uint8Array;
    };
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
  };
  export default gifenc;
}
