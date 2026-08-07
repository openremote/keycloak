/**
 * Crops the quiet zone off a Keycloak-generated QR code, in place.
 *
 * Keycloak renders the code onto a fixed 246x246 canvas, so the white border around the ink
 * is whatever is left over once the code has been scaled to fit - and that depends on how
 * many modules the code needs, which depends on the length of the otpauth URL, which depends
 * on the realm's display name and the user's name. Measured against a real Keycloak: 20px per
 * side for one realm, 37px for the same realm renamed. There is no ratio to hardcode.
 *
 * Left alone, the design's 160px code renders anywhere between 8% and 15% smaller than
 * intended and sits inset from the text beside it by a different amount each time. Trimming
 * to the ink means the box we draw is the code, so .or-qr can size and align it directly and
 * the quiet zone becomes ours to set in CSS (as padding), which is also what keeps it
 * scannable.
 */
function trim(image: HTMLImageElement): void {
  // The trimmed result is assigned back to src, which fires load again.
  if (image.dataset.qrTrimmed === "true") {
    return;
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width === 0 || height === 0) {
    return;
  }

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;

  const sourceContext = source.getContext("2d", { willReadFrequently: true });

  if (sourceContext === null) {
    return;
  }

  sourceContext.drawImage(image, 0, 0);

  let pixels: Uint8ClampedArray;

  try {
    pixels = sourceContext.getImageData(0, 0, width, height).data;
  } catch {
    // Tainted canvas. Cannot happen for the data: URL Keycloak sends, but leaving the image
    // untouched is the right failure - an untrimmed code still scans.
    return;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      // Ink: opaque and dark. QR codes are pure black on white, so a mid threshold is safe.
      if (pixels[offset + 3] > 128 && pixels[offset] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return;
  }

  const size = Math.max(maxX - minX + 1, maxY - minY + 1);
  const output = document.createElement("canvas");
  output.width = size;
  output.height = size;
  output.getContext("2d")?.drawImage(source, minX, minY, size, size, 0, 0, size, size);

  image.dataset.qrTrimmed = "true";
  image.src = output.toDataURL("image/png");
}

/** `@load` handler for the QR image. */
export function trimQuietZone(event: Event): void {
  trim(event.currentTarget as HTMLImageElement);
}
