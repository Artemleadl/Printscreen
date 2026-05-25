import { desktopCapturer, screen, systemPreferences } from 'electron'
import type { DisplayInfo, OverlayPayload } from '../shared/types'

// Returns true on macOS only when the user has granted Screen Recording access.
// On other platforms (or older macOS) this is a no-op that returns true.
export function hasScreenAccess(): boolean {
  if (process.platform !== 'darwin') return true
  // 'granted' | 'denied' | 'restricted' | 'not-determined'
  return systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

function displayToInfo(display: Electron.Display): DisplayInfo {
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: { ...display.bounds }
  }
}

// Capture the full-resolution image of a single display.
async function captureDisplay(display: Electron.Display): Promise<string> {
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
  return match.thumbnail.toDataURL()
}

// Capture the display the cursor currently sits on — used for region selection.
export async function captureCursorDisplay(): Promise<OverlayPayload> {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const imageDataUrl = await captureDisplay(display)
  return { display: displayToInfo(display), imageDataUrl }
}

// Capture the primary display in full — used for the fullscreen shortcut.
export async function capturePrimaryDisplay(): Promise<OverlayPayload> {
  const display = screen.getPrimaryDisplay()
  const imageDataUrl = await captureDisplay(display)
  return { display: displayToInfo(display), imageDataUrl }
}
