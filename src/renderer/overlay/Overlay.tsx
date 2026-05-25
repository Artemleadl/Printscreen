import { useEffect, useRef, useState } from 'react'
import type { OverlayPayload } from '@shared/types'
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
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    document.body.classList.add('overlay')
    void window.api.requestOverlayData().then((p) => {
      if (p) setPayload(p)
    })
    return () => document.body.classList.remove('overlay')
  }, [])

  const cancel = (): void => void window.api.overlayCancel()

  // Crop the source image to the selected rect and hand it to the editor.
  const confirm = (rect: Rect): void => {
    const img = imgRef.current
    if (!img || rect.width < 4 || rect.height < 4) {
      cancel()
      return
    }
    const ratio = img.naturalWidth / img.clientWidth
    const sx = Math.round(rect.left * ratio)
    const sy = Math.round(rect.top * ratio)
    const sw = Math.round(rect.width * ratio)
    const sh = Math.round(rect.height * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      cancel()
      return
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    void window.api.overlaySelect({
      imageDataUrl: canvas.toDataURL('image/png'),
      width: sw,
      height: sh
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter' && start && current) confirm(rectFromPoints(start, current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!payload) return <div className="overlay-loading" />

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
      onMouseUp={() => {
        if (selection) confirm(selection)
      }}
    >
      <img ref={imgRef} className="overlay-image" src={payload.imageDataUrl} draggable={false} />
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
