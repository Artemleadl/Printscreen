// Composes the "beautiful screenshot" frame: a background, padding, rounded
// corners and a drop shadow around the captured image + its annotations.

import { drawAnnotation, type Annotation } from './annotations'

export type Background =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }

export interface Frame {
  padding: number
  radius: number
  background: Background
}

export const DEFAULT_FRAME: Frame = {
  padding: 0,
  radius: 0,
  background: { type: 'none' }
}

export function frameSize(
  imageW: number,
  imageH: number,
  frame: Frame
): { w: number; h: number; pad: number } {
  const pad = Math.round(frame.padding)
  return { w: imageW + pad * 2, h: imageH + pad * 2, pad }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: Background
): void {
  if (bg.type === 'none') return
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, w, h)
    return
  }
  const rad = (bg.angle * Math.PI) / 180
  const cx = w / 2
  const cy = h / 2
  const len = (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h) / 2
  const dx = Math.cos(rad) * len
  const dy = Math.sin(rad) * len
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  grad.addColorStop(0, bg.from)
  grad.addColorStop(1, bg.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

// Draw the full framed image (no selection handles) into a context whose
// canvas is already sized to frameSize(). Coordinates inside the rounded
// area match the base image's pixel space.
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  base: HTMLImageElement,
  annotations: Annotation[],
  draft: Annotation | null,
  frame: Frame,
  imageW: number,
  imageH: number
): void {
  const { w, h, pad } = frameSize(imageW, imageH, frame)
  ctx.clearRect(0, 0, w, h)
  paintBackground(ctx, w, h, frame.background)

  ctx.save()
  ctx.translate(pad, pad)
  const r = frame.radius

  // Drop shadow only reads well when there is padding to show it against.
  if (pad > 0) {
    ctx.save()
    roundedRectPath(ctx, 0, 0, imageW, imageH, r)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = Math.min(50, pad * 1.1)
    ctx.shadowOffsetY = Math.min(24, pad * 0.5)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundedRectPath(ctx, 0, 0, imageW, imageH, r)
  ctx.clip()
  ctx.drawImage(base, 0, 0)
  for (const a of annotations) drawAnnotation(ctx, a, base)
  if (draft) drawAnnotation(ctx, draft, base)
  ctx.restore()

  ctx.restore()
}
