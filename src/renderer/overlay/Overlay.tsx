import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AfterCapture, CaptureSize, SelectionRect } from '@shared/types'
import { CaptureBar, type CaptureBarMode } from './CaptureBar'
import './overlay.css'

interface Point {
  x: number
  y: number
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function rectFromPoints(a: Point, b: Point): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

const contains = (w: SelectionRect, p: Point): boolean =>
  p.x >= w.x && p.x < w.x + w.width && p.y >= w.y && p.y < w.y + w.height

const toRect = (w: SelectionRect): Rect => ({ left: w.x, top: w.y, width: w.width, height: w.height })

const HINTS: Record<CaptureBarMode, string> = {
  region: 'Drag to select an area · Space: window · Esc: cancel',
  window: 'Click a window to capture it · Space: area · Esc: cancel',
  fullscreen: 'Click anywhere or press Capture'
}

export function Overlay(): React.ReactElement {
  const [capture, setCapture] = useState<CaptureSize | null>(null)
  const [mode, setMode] = useState<CaptureBarMode>('region')
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  // App windows at capture time, front to back, and the pointer for window mode.
  const [windows, setWindows] = useState<SelectionRect[]>([])
  const [pointer, setPointer] = useState<Point | null>(null)
  const [afterCapture, setAfterCapture] = useState<AfterCapture>('editor')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // The window is created ahead of time and shown before its image arrives:
  // load on mount (covers a reload) and whenever main hands it a capture.
  useEffect(() => {
    document.body.classList.add('overlay')
    const load = (): void => {
      void window.api.loadCapture().then((size) => {
        if (!size) return
        setCapture(size)
        setMode('region')
        setStart(null)
        setCurrent(null)
        void window.api.overlayWindows().then(setWindows)
        void window.api.getSettings().then((s) => setAfterCapture(s.afterCapture))
      })
    }
    const unsubscribe = window.api.onCaptureAvailable(load)
    load()
    return () => {
      unsubscribe()
      document.body.classList.remove('overlay')
    }
  }, [])

  // Paint the frozen screen under the dimming, then let main focus the window.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (capture && canvas && window.api.drawCapture(canvas)) void window.api.captureDrawn()
  }, [capture])

  const cancel = (): void => void window.api.overlayCancel()

  // Hand the area to main, which crops it out of the full-resolution
  // capture — it works even if the frozen image hasn't been drawn yet.
  const confirm = (rect: Rect): void => {
    if (rect.width < 4 || rect.height < 4) {
      cancel()
      return
    }
    void window.api.overlaySelect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
  }

  const hoveredWindow = mode === 'window' && pointer ? windows.find((w) => contains(w, pointer)) : undefined
  const selection = start && current ? rectFromPoints(start, current) : null

  // What "Capture" (or Enter) takes in the current mode, if anything.
  // Full screen uses the display's size, not the window's: the overlay can
  // end up a pixel short of the screen edge.
  const pending: Rect | null =
    mode === 'fullscreen'
      ? { left: 0, top: 0, width: window.screen.width, height: window.screen.height }
      : mode === 'window'
        ? hoveredWindow
          ? toRect(hoveredWindow)
          : null
        : selection

  const switchMode = (next: CaptureBarMode): void => {
    setMode(next)
    setStart(null)
    setCurrent(null)
  }

  const saveAfterCapture = (value: AfterCapture): void => {
    setAfterCapture(value)
    void window.api.setAfterCapture(value)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter' && pending) confirm(pending)
      // Like macOS: Space switches between area and window selection.
      if (e.key === ' ' && !start && windows.length) switchMode(mode === 'window' ? 'region' : 'window')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const rootClass = [
    'overlay-root',
    `mode-${mode}`,
    // The selection or window highlight dims around itself instead.
    selection || hoveredWindow || mode === 'fullscreen' ? 'no-dim' : ''
  ].join(' ')

  return (
    <div
      className={rootClass}
      onMouseDown={(e) => {
        if (mode !== 'region') return
        setStart({ x: e.clientX, y: e.clientY })
        setCurrent({ x: e.clientX, y: e.clientY })
      }}
      onMouseMove={(e) => {
        if (mode === 'region' && start) setCurrent({ x: e.clientX, y: e.clientY })
        if (mode === 'window') setPointer({ x: e.clientX, y: e.clientY })
      }}
      onMouseUp={(e) => {
        const point = { x: e.clientX, y: e.clientY }
        // Use the release point itself: the last mousemove may not have been
        // rendered yet (React batches them), which would shrink the selection.
        if (mode === 'region' && start) confirm(rectFromPoints(start, point))
        if (mode === 'window') {
          const hit = windows.find((w) => contains(w, point))
          if (hit) confirm(toRect(hit))
        }
        if (mode === 'fullscreen' && pending) confirm(pending)
      }}
    >
      <canvas ref={canvasRef} className="overlay-image" />
      {!selection && <div className="overlay-hint">{HINTS[mode]}</div>}
      {selection && (
        <div
          className="overlay-selection"
          style={{
            left: selection.left,
            top: selection.top,
            width: selection.width,
            height: selection.height
          }}
        >
          <div className="overlay-size">
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </div>
        </div>
      )}
      {hoveredWindow && (
        <div
          className="overlay-window"
          style={{
            left: hoveredWindow.x,
            top: hoveredWindow.y,
            width: hoveredWindow.width,
            height: hoveredWindow.height
          }}
        />
      )}
      <CaptureBar
        mode={mode}
        setMode={switchMode}
        windowsAvailable={windows.length > 0}
        canCapture={pending !== null && mode !== 'region'}
        onCapture={() => pending && confirm(pending)}
        onClose={cancel}
        afterCapture={afterCapture}
        setAfterCapture={saveAfterCapture}
        inert={start !== null}
      />
    </div>
  )
}
