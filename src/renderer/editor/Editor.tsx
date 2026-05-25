import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorPayload, Settings } from '@shared/types'
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
  const [payload, setPayload] = useState<EditorPayload | null>(null)
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
  const baseRef = useRef<HTMLImageElement | null>(null)
  const annsRef = useRef<Annotation[]>([])
  const dragRef = useRef<Drag | null>(null)
  const stepRef = useRef(1)
  const settingsRef = useRef<Settings | null>(null)

  annsRef.current = annotations

  // --- Load capture + settings ---------------------------------------------
  useEffect(() => {
    void window.api.requestEditorData().then((p) => {
      if (!p) return
      setPayload(p)
      const img = new Image()
      img.onload = () => {
        baseRef.current = img
        setBaseLoaded(true)
      }
      img.src = p.imageDataUrl
    })
    void window.api.getSettings().then((s) => {
      settingsRef.current = s
      setUploadEnabled(s.upload.provider !== 'none')
      const p = s.editorPrefs
      setFrame(p.frame as Frame)
      setColor(p.color)
      setWidth(p.width)
      setBlurRadius(p.blurRadius)
    })
  }, [])

  // --- History helpers ------------------------------------------------------
  const commit = useCallback((next: Annotation[]) => {
    setPast((p) => [...p, annsRef.current])
    setFuture([])
    setAnnotations(next)
  }, [])

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [annsRef.current, ...f])
      setAnnotations(prev)
      setSelectedId(null)
      return p.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const next = f[0]
      setPast((p) => [...p, annsRef.current])
      setAnnotations(next)
      return f.slice(1)
    })
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    commit(annsRef.current.filter((a) => a.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, commit])

  // --- Persist editor prefs -------------------------------------------------
  useEffect(() => {
    const s = settingsRef.current
    if (!s) return
    const updated = { ...s, editorPrefs: { frame, color, width, blurRadius } }
    settingsRef.current = updated
    void window.api.setSettings(updated)
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
      const ann: Annotation = { id: newId(), type: 'step', color, width, x: p.x, y: p.y, n: stepRef.current }
      stepRef.current += 1
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
      setDraft({ id: newId(), type: tool, color, width, points: [p] })
      dragRef.current = { kind: 'stroke' }
    } else {
      const w = tool === 'blur' ? blurRadius : width
      setDraft({ id: newId(), type: tool, color, width: w, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      dragRef.current = { kind: 'shape' }
    }
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

    setDraft((d) => {
      if (!d) return d
      if (d.type === 'pen' || d.type === 'highlight') {
        return { ...d, points: [...d.points, p] }
      }
      if ('x2' in d) return { ...d, x2: p.x, y2: p.y }
      return d
    })
  }

  const onWindowUp = (): void => {
    window.removeEventListener('mousemove', onWindowMove)
    const drag = dragRef.current
    dragRef.current = null

    if (drag?.kind === 'move') {
      // Record the pre-move state so the move is a single undo step.
      setPast((pp) => [...pp, drag.snapshot])
      setFuture([])
      return
    }

    setDraft((d) => {
      if (!d) return null
      const valid =
        d.type === 'pen' || d.type === 'highlight'
          ? d.points.length > 1
          : 'x2' in d && (Math.abs(d.x2 - d.x1) > 3 || Math.abs(d.y2 - d.y1) > 3)
      if (valid) commit([...annsRef.current, d])
      return null
    })
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
        e.preventDefault()
        void doCopy()
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
