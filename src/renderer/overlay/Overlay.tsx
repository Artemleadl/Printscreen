import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CaptureSize } from '@shared/types'
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

export function Overlay(): React.ReactElement {
  const [capture, setCapture] = useState<CaptureSize | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // The window is created ahead of time and shown before its image arrives:
  // load on mount (covers a reload) and whenever main hands it a capture.
  useEffect(() => {
    document.body.classList.add('overlay')
    const load = (): void => {
      void window.api.loadCapture().then((size) => {
        if (size) setCapture(size)
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

  // Hand the selection to main, which crops it out of the full-resolution
  // capture — it works even if the frozen image hasn't been drawn yet.
  const confirm = (rect: Rect): void => {
    if (rect.width < 4 || rect.height < 4) {
      cancel()
      return
    }
    void window.api.overlaySelect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter' && start && current) confirm(rectFromPoints(start, current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selection = start && current ? rectFromPoints(start, current) : null

  return (
    <div
      className={selection ? 'overlay-root has-selection' : 'overlay-root'}
      onMouseDown={(e) => {
        setStart({ x: e.clientX, y: e.clientY })
        setCurrent({ x: e.clientX, y: e.clientY })
      }}
      onMouseMove={(e) => {
        if (start) setCurrent({ x: e.clientX, y: e.clientY })
      }}
      onMouseUp={(e) => {
        // Use the release point itself: the last mousemove may not have been
        // rendered yet (React batches them), which would shrink the selection.
        if (start) confirm(rectFromPoints(start, { x: e.clientX, y: e.clientY }))
      }}
    >
      <canvas ref={canvasRef} className="overlay-image" />
      {!selection && <div className="overlay-hint">Drag to select · Esc to cancel</div>}
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
    </div>
  )
}
