import { desktopCapturer, screen, systemPreferences, type NativeImage } from 'electron'
import type { DisplayInfo, RawImage, SelectionRect } from '../shared/types'

export interface Capture {
  display: DisplayInfo
  // Full-resolution image of the display, in physical pixels.
  image: NativeImage
}

// Returns false only when macOS has definitely refused Screen Recording access.
// 'not-determined' counts as allowed: the first capture triggers the system
// prompt. On other platforms there is no such permission, so this is true.
export function hasScreenAccess(): boolean {
  if (process.platform !== 'darwin') return true
  // 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'
  const status = systemPreferences.getMediaAccessStatus('screen')
  return status !== 'denied' && status !== 'restricted'
}

function displayToInfo(display: Electron.Display): DisplayInfo {
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: { ...display.bounds }
  }
}

// Capture the full-resolution image of a single display.
async function captureDisplay(display: Electron.Display): Promise<NativeImage> {
  const { width, height } = display.bounds
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    // Request the native pixel resolution so retina captures stay crisp.
    thumbnailSize: {
      width: Math.round(width * display.scaleFactor),
      height: Math.round(height * display.scaleFactor)
    }
  })

  const match =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!match) {
    throw new Error('No screen source available to capture.')
  }
  return match.thumbnail
}

// Capture the display the cursor currently sits on — used for both region
// selection and fullscreen, so multi-monitor setups grab the screen in use.
export async function captureCursorDisplay(): Promise<Capture> {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const image = await captureDisplay(display)
  return { display: displayToInfo(display), image }
}

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max)

// Crop a region selected in the overlay (DIP, relative to the display) out of
// the capture: map it onto the image's physical pixels and clamp it inside.
export function cropCapture({ display, image }: Capture, rect: SelectionRect): NativeImage {
  const size = image.getSize()
  const scaleX = size.width / display.bounds.width
  const scaleY = size.height / display.bounds.height
  const x = clamp(Math.round(rect.x * scaleX), 0, size.width - 1)
  const y = clamp(Math.round(rect.y * scaleY), 0, size.height - 1)
  return image.crop({
    x,
    y,
    width: clamp(Math.round(rect.width * scaleX), 1, size.width - x),
    height: clamp(Math.round(rect.height * scaleY), 1, size.height - y)
  })
}

// Raw pixels for a renderer window: a straight copy of the bitmap, far cheaper
// than encoding a PNG in main and decoding it again in the renderer.
export function toRawImage(image: NativeImage): RawImage {
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  const rowBytes = width * 4
  if (bitmap.length === rowBytes * height) return { width, height, bgra: bitmap }
  // toBitmap() doesn't promise tightly packed rows; repack them if padded.
  const stride = height > 1 ? (bitmap.length - rowBytes) / (height - 1) : rowBytes
  const packed = Buffer.allocUnsafe(rowBytes * height)
  for (let y = 0; y < height; y++) bitmap.copy(packed, y * rowBytes, y * stride, y * stride + rowBytes)
  return { width, height, bgra: packed }
}
