// Pure drawing + geometry helpers for the annotation editor.
// Coordinates are always in the base image's own pixel space.

export type Tool =
  | 'select'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'pen'
  | 'highlight'
  | 'text'
  | 'blur'
  | 'step'

export interface Point {
  x: number
  y: number
}

interface Common {
  id: string
  color: string
  width: number
}

export interface ShapeAnn extends Common {
  type: 'arrow' | 'rect' | 'ellipse' | 'line' | 'blur'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface StrokeAnn extends Common {
  type: 'pen' | 'highlight'
  points: Point[]
}

export interface TextAnn extends Common {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
}

export interface StepAnn extends Common {
  type: 'step'
  x: number
  y: number
  n: number
}

export type Annotation = ShapeAnn | StrokeAnn | TextAnn | StepAnn

const LINE_HEIGHT = 1.25

function textFont(fontSize: number): string {
  return `600 ${fontSize}px -apple-system, sans-serif`
}

// Shared offscreen context for measuring text outside of a draw call.
let measureCtx: CanvasRenderingContext2D | null = null

function measureText(a: TextAnn): { w: number; h: number } {
  const lines = a.text.split('\n')
  measureCtx ??= document.createElement('canvas').getContext('2d')
  let w = 0
  if (measureCtx) {
    measureCtx.font = textFont(a.fontSize)
    for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width)
  } else {
    w = Math.max(...lines.map((l) => l.length)) * a.fontSize * 0.6
  }
  return { w, h: lines.length * a.fontSize * LINE_HEIGHT }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function drawArrow(ctx: CanvasRenderingContext2D, a: ShapeAnn): void {
  const headLen = Math.max(18, a.width * 5)
  const headAngle = Math.PI / 7 // ~26° — острый аккуратный наконечник
  const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)

  // Линия заканчивается у основания наконечника, не торчит сквозь него
  const shaftEndX = a.x2 - headLen * 0.75 * Math.cos(angle)
  const shaftEndY = a.y2 - headLen * 0.75 * Math.sin(angle)
  ctx.beginPath()
  ctx.moveTo(a.x1, a.y1)
  ctx.lineTo(shaftEndX, shaftEndY)
  ctx.stroke()

  // Залитый треугольный наконечник
  ctx.beginPath()
  ctx.moveTo(a.x2, a.y2)
  ctx.lineTo(
    a.x2 - headLen * Math.cos(angle - headAngle),
    a.y2 - headLen * Math.sin(angle - headAngle)
  )
  ctx.lineTo(
    a.x2 - headLen * Math.cos(angle + headAngle),
    a.y2 - headLen * Math.sin(angle + headAngle)
  )
  ctx.closePath()
  ctx.fillStyle = a.color
  ctx.fill()
}

// Blur the underlying base image within the annotation's rectangle.
function drawBlur(ctx: CanvasRenderingContext2D, a: ShapeAnn, base: HTMLImageElement): void {
  const x = Math.min(a.x1, a.x2)
  const y = Math.min(a.y1, a.y2)
  const w = Math.abs(a.x2 - a.x1)
  const h = Math.abs(a.y2 - a.y1)
  if (w < 2 || h < 2) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.filter = `blur(${a.width}px)`
  // Draw the whole base image so blur samples surrounding pixels too.
  ctx.drawImage(base, 0, 0)
  ctx.restore()
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  base: HTMLImageElement
): void {
  ctx.save()
  ctx.lineWidth = a.width
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (a.type) {
    case 'arrow':
      drawArrow(ctx, a)
      break
    case 'line':
      ctx.beginPath()
      ctx.moveTo(a.x1, a.y1)
      ctx.lineTo(a.x2, a.y2)
      ctx.stroke()
      break
    case 'rect':
      ctx.strokeRect(
        Math.min(a.x1, a.x2),
        Math.min(a.y1, a.y2),
        Math.abs(a.x2 - a.x1),
        Math.abs(a.y2 - a.y1)
      )
      break
    case 'ellipse': {
      const cx = (a.x1 + a.x2) / 2
      const cy = (a.y1 + a.y2) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.abs(a.x2 - a.x1) / 2, Math.abs(a.y2 - a.y1) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'blur':
      drawBlur(ctx, a, base)
      break
    case 'pen':
    case 'highlight': {
      if (a.points.length < 2) break
      if (a.type === 'highlight') {
        ctx.globalAlpha = 0.35
        ctx.lineWidth = a.width * 4
      }
      ctx.beginPath()
      ctx.moveTo(a.points[0].x, a.points[0].y)
      for (const p of a.points.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      break
    }
    case 'text': {
      ctx.font = textFont(a.fontSize)
      ctx.textBaseline = 'top'
      // Subtle shadow keeps text legible over busy screenshots.
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 3
      for (const [i, line] of a.text.split('\n').entries()) {
        ctx.fillText(line, a.x, a.y + i * a.fontSize * LINE_HEIGHT)
      }
      break
    }
    case 'step': {
      const r = Math.max(13, a.width * 4)
      ctx.beginPath()
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${Math.round(r * 1.1)}px -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(a.n), a.x, a.y + 1)
      break
    }
  }
  ctx.restore()
}

// Axis-aligned bounding box, used for hit-testing and moving.
export function bounds(a: Annotation): { x: number; y: number; w: number; h: number } {
  switch (a.type) {
    case 'arrow':
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'blur':
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x2 - a.x1),
        h: Math.abs(a.y2 - a.y1)
      }
    case 'pen':
    case 'highlight': {
      const xs = a.points.map((p) => p.x)
      const ys = a.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
    }
    case 'text':
      return { x: a.x, y: a.y, ...measureText(a) }
    case 'step': {
      const r = Math.max(13, a.width * 4)
      return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 }
    }
  }
}

export function hitTest(a: Annotation, p: Point): boolean {
  const b = bounds(a)
  const pad = 6
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'arrow':
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'blur':
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
    case 'pen':
    case 'highlight':
      return { ...a, points: a.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
    case 'text':
    case 'step':
      return { ...a, x: a.x + dx, y: a.y + dy }
  }
}
