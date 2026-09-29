import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureSize } from '@shared/types'
import { bounds, hitTest, newId, translate, type Annotation, type Point, type Tool } from './annotations'
import { Toolbar } from './Toolbar'
import { FrameBar } from './FrameBar'
import { composeFrame, DEFAULT_FRAME, frameSize, type Frame } from './frame'
import './editor.css'

interface TextDraft {
  x: number
  y: number
  value: string
  fontSize: number
  color: string
}

type Drag =
  | { kind: 'shape' | 'stroke' }
  | { kind: 'move'; start: Point; original: Annotation; snapshot: Annotation[] }

export function Editor(): React.ReactElement {
  const [payload, setPayload] = useState<CaptureSize | null>(null)
  const [baseLoaded, setBaseLoaded] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [past, setPast] = useState<Annotation[][]>([])
  const [future, setFuture] = useState<Annotation[][]>([])
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState('#f0476b')
  const [width, setWidth] = useState(4)
  const [blurRadius, setBlurRadius] = useState(10)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadEnabled, setUploadEnabled] = useState(false)
  const [frame, setFrame] = useState<Frame>(DEFAULT_FRAME)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Offscreen canvas holding the captured image.
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const annsRef = useRef<Annotation[]>([])
  const draftRef = useRef<Annotation | null>(null)
  const dragRef = useRef<Drag | null>(null)
  // Prefs as last loaded or saved (JSON). Nothing is persisted before they're
  // loaded, so first-render defaults never overwrite them, and values that
  // are already stored aren't written back each time a capture loads.
  const savedPrefsRef = useRef<string | null>(null)

  annsRef.current = annotations

  // --- Load capture + settings ---------------------------------------------
  // The window is created ahead of time: load on mount (covers a reload) and
  // whenever main hands it a capture. Settings are re-read each time, as they
  // may have changed while the window sat hidden.
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const [size, s] = await Promise.all([window.api.loadCapture(), window.api.getSettings()])
      if (cancelled) return
      setUploadEnabled(s.upload.provider !== 'none')
      const p = s.editorPrefs
      setFrame(p.frame)
      setColor(p.color)
      setWidth(p.width)
      setBlurRadius(p.blurRadius)
      savedPrefsRef.current = JSON.stringify(p)
      if (!size) return
      const base = document.createElement('canvas')
      if (!window.api.drawCapture(base)) return
      baseRef.current = base
      setPayload(size)
      setBaseLoaded(true)
    }
    const unsubscribe = window.api.onCaptureAvailable(() => void load())
    void load()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // --- History helpers ------------------------------------------------------
  // State updaters stay pure (StrictMode runs them twice in dev), so each
  // helper reads the current stacks and sets every piece of state directly.
  const commit = useCallback((next: Annotation[]) => {
    const current = annsRef.current
    setPast((p) => [...p, current])
    setFuture([])
    setAnnotations(next)
  }, [])

  const undo = useCallback(() => {
    if (!past.length) return
    setPast(past.slice(0, -1))
    setFuture([annsRef.current, ...future])
    setAnnotations(past[past.length - 1])
    setSelectedId(null)
  }, [past, future])

  const redo = useCallback(() => {
    if (!future.length) return
    setFuture(future.slice(1))
    setPast([...past, annsRef.current])
    setAnnotations(future[0])
    setSelectedId(null)
  }, [past, future])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    commit(annsRef.current.filter((a) => a.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, commit])

  // --- Persist editor prefs -------------------------------------------------
  // Debounced so dragging a slider doesn't write the config on every tick.
  useEffect(() => {
    const prefs = { frame, color, width, blurRadius }
    const json = JSON.stringify(prefs)
    if (savedPrefsRef.current === null || savedPrefsRef.current === json) return
    const timer = setTimeout(() => {
      savedPrefsRef.current = json
      void window.api.setEditorPrefs(prefs)
    }, 300)
    return () => clearTimeout(timer)
  }, [frame, color, width, blurRadius])

  // --- Canvas drawing -------------------------------------------------------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const base = baseRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !base || !payload || !ctx) return
    composeFrame(ctx, base, annotations, draft, frame, payload.width, payload.height)
    if (selectedId) {
      const a = annotations.find((x) => x.id === selectedId)
      if (a) {
        const { pad } = frameSize(payload.width, payload.height, frame)
        const b = bounds(a)
        ctx.save()
        ctx.translate(pad, pad)
        ctx.strokeStyle = '#4ea1ff'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
        ctx.restore()
      }
    }
  }, [annotations, draft, selectedId, frame, payload])

  useEffect(() => {
    if (baseLoaded) redraw()
  }, [baseLoaded, redraw])

  // Main keeps the window hidden until the capture is on the canvas.
  useEffect(() => {
    if (baseLoaded) void window.api.captureDrawn()
  }, [baseLoaded, payload])

  // --- Pointer mapping ------------------------------------------------------
  // Frame coordinates → base-image space (subtract the padding offset).
  const toImagePoint = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const pad = Math.round(frame.padding)
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width - pad,
      y: ((clientY - rect.top) / rect.height) * canvas.height - pad
    }
  }

  // --- Pointer interaction --------------------------------------------------
  const onMouseDown = (e: React.MouseEvent): void => {
    if (textDraft) return
    const p = toImagePoint(e.clientX, e.clientY)

    if (tool === 'text') {
      setTextDraft({ x: p.x, y: p.y, value: '', fontSize: Math.round(14 + width * 3.5), color })
      return
    }

    if (tool === 'step') {
      // Continue from the highest step on the canvas, so undo/delete free the number.
      const n = annsRef.current.reduce((max, a) => (a.type === 'step' ? Math.max(max, a.n) : max), 0) + 1
      const ann: Annotation = { id: newId(), type: 'step', color, width, x: p.x, y: p.y, n }
      commit([...annsRef.current, ann])
      return
    }

    if (tool === 'select') {
      const hit = [...annsRef.current].reverse().find((a) => hitTest(a, p))
      if (hit) {
        setSelectedId(hit.id)
        dragRef.current = { kind: 'move', start: p, original: hit, snapshot: annsRef.current }
        attachWindowDrag()
      } else {
        setSelectedId(null)
      }
      return
    }

    setSelectedId(null)
    if (tool === 'pen' || tool === 'highlight') {
      draftRef.current = { id: newId(), type: tool, color, width, points: [p] }
      dragRef.current = { kind: 'stroke' }
    } else {
      const w = tool === 'blur' ? blurRadius : width
      draftRef.current = { id: newId(), type: tool, color, width: w, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      dragRef.current = { kind: 'shape' }
    }
    setDraft(draftRef.current)
    attachWindowDrag()
  }

  const attachWindowDrag = (): void => {
    window.addEventListener('mousemove', onWindowMove)
    window.addEventListener('mouseup', onWindowUp, { once: true })
  }

  const onWindowMove = (e: MouseEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    const p = toImagePoint(e.clientX, e.clientY)

    if (drag.kind === 'move') {
      const dx = p.x - drag.start.x
      const dy = p.y - drag.start.y
      const moved = translate(drag.original, dx, dy)
      setAnnotations((anns) => anns.map((a) => (a.id === moved.id ? moved : a)))
      return
    }

    // Track the draft in the ref too, so mouseup commits the latest shape even
    // if React hasn't re-rendered since the last move.
    const d = draftRef.current
    if (!d) return
    let next = d
    if (d.type === 'pen' || d.type === 'highlight') next = { ...d, points: [...d.points, p] }
    else if ('x2' in d) next = { ...d, x2: p.x, y2: p.y }
    draftRef.current = next
    setDraft(next)
  }

  const onWindowUp = (): void => {
    window.removeEventListener('mousemove', onWindowMove)
    const drag = dragRef.current
    dragRef.current = null

    if (drag?.kind === 'move') {
      // A plain click to select doesn't change anything worth undoing.
      if (annsRef.current === drag.snapshot) return
      // Record the pre-move state so the move is a single undo step.
      setPast((pp) => [...pp, drag.snapshot])
      setFuture([])
      return
    }

    const d = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!d) return
    const valid =
      d.type === 'pen' || d.type === 'highlight'
        ? d.points.length > 1
        : 'x2' in d && (Math.abs(d.x2 - d.x1) > 3 || Math.abs(d.y2 - d.y1) > 3)
    if (valid) commit([...annsRef.current, d])
  }

  const commitText = (): void => {
    if (!textDraft) return
    const value = textDraft.value.trim()
    if (value) {
      const ann: Annotation = {
        id: newId(),
        type: 'text',
        color: textDraft.color,
        width,
        x: textDraft.x,
        y: textDraft.y,
        text: value,
        fontSize: textDraft.fontSize
      }
      commit([...annsRef.current, ann])
    }
    setTextDraft(null)
  }

  // --- Export + actions -----------------------------------------------------
  const exportDataUrl = (): string => {
    const base = baseRef.current
    if (!base || !payload) return ''
    const { w, h } = frameSize(payload.width, payload.height, frame)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')!
    composeFrame(ctx, base, annsRef.current, null, frame, payload.width, payload.height)
    return out.toDataURL('image/png')
  }

  const doCopy = async (): Promise<void> => {
    await window.api.editorCopy(exportDataUrl())
    setStatus('Copied to clipboard')
  }

  const doSave = async (): Promise<void> => {
    setBusy(true)
    try {
      const { filePath } = await window.api.editorSave(exportDataUrl())
      setStatus(`Saved to ${filePath}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const doUpload = async (): Promise<void> => {
    setBusy(true)
    setStatus('Uploading…')
    try {
      const { url } = await window.api.editorUpload(exportDataUrl())
      setStatus(`Link copied: ${url}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  // --- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const shortcuts: Record<string, Tool> = {
      v: 'select',
      a: 'arrow',
      r: 'rect',
      o: 'ellipse',
      l: 'line',
      p: 'pen',
      h: 'highlight',
      t: 'text',
      b: 'blur',
      s: 'step'
    }
    const onKey = (e: KeyboardEvent): void => {
      if (textDraft) {
        if (e.key === 'Escape') setTextDraft(null)
        return
      }
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'c') {
        // Copy and done: the usual end of a quick capture.
        e.preventDefault()
        void doCopy().then(() => window.api.editorClose())
        return
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void doSave()
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelected()
        return
      }
      if (e.key === 'Escape') {
        void window.api.editorClose()
        return
      }
      const t = shortcuts[e.key.toLowerCase()]
      if (t) setTool(t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Map an image point to CSS offset within the canvas for the text input.
  const textInputStyle = (): React.CSSProperties => {
    const canvas = canvasRef.current
    if (!canvas || !textDraft) return { display: 'none' }
    const scale = canvas.clientWidth / canvas.width
    const pad = Math.round(frame.padding)
    return {
      left: (textDraft.x + pad) * scale,
      top: (textDraft.y + pad) * scale,
      fontSize: textDraft.fontSize * scale,
      color: textDraft.color
    }
  }

  const size = payload ? frameSize(payload.width, payload.height, frame) : { w: 0, h: 0 }

  return (
    <div className="editor">
      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        width={width}
        setWidth={setWidth}
        blurRadius={blurRadius}
        setBlurRadius={setBlurRadius}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onCopy={() => void doCopy()}
        onSave={() => void doSave()}
        onUpload={() => void doUpload()}
        onClose={() => void window.api.editorClose()}
        uploadEnabled={uploadEnabled}
        busy={busy}
      />

      <FrameBar frame={frame} setFrame={setFrame} />

      <div className="editor-stage">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            className={tool === 'select' ? 'canvas select' : 'canvas draw'}
            onMouseDown={onMouseDown}
          />
          {textDraft && (
            <textarea
              autoFocus
              className="text-input"
              style={textInputStyle()}
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onBlur={commitText}
            />
          )}
        </div>
      </div>

      <div className="status-bar">{status || (payload ? `${payload.width} × ${payload.height}px` : 'Waiting for capture…')}</div>
    </div>
  )
}
