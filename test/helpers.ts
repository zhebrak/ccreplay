export function getPixel(buf: Buffer, width: number, x: number, y: number): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]];
}

export function colorClose(actual: [number, number, number, number], expected: [number, number, number], tolerance = 10): boolean {
  return Math.abs(actual[0] - expected[0]) <= tolerance
    && Math.abs(actual[1] - expected[1]) <= tolerance
    && Math.abs(actual[2] - expected[2]) <= tolerance;
}
