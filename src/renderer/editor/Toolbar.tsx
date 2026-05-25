import type { Tool } from './annotations'
import { Icon } from './icons'

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'select', label: 'Select / Move (V)' },
  { tool: 'arrow', label: 'Arrow (A)' },
  { tool: 'rect', label: 'Rectangle (R)' },
  { tool: 'ellipse', label: 'Ellipse (O)' },
  { tool: 'line', label: 'Line (L)' },
  { tool: 'pen', label: 'Pen (P)' },
  { tool: 'highlight', label: 'Highlighter (H)' },
  { tool: 'text', label: 'Text (T)' },
  { tool: 'blur', label: 'Blur (B)' },
  { tool: 'step', label: 'Step number (S)' }
]

const COLORS = ['#f0476b', '#ffcc00', '#2ecc71', '#3498db', '#ffffff', '#111111']
const WIDTHS = [2, 4, 7, 12]

interface Props {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  width: number
  setWidth: (w: number) => void
  blurRadius: number
  setBlurRadius: (r: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onCopy: () => void
  onSave: () => void
  onUpload: () => void
  onClose: () => void
  uploadEnabled: boolean
  busy: boolean
}

export function Toolbar(props: Props): React.ReactElement {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map(({ tool, label }) => (
          <button
            key={tool}
            className={props.tool === tool ? 'tool active' : 'tool'}
            title={label}
            onClick={() => props.setTool(tool)}
          >
            <Icon name={tool} />
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        {COLORS.map((c) => (
          <button
            key={c}
            className={props.color === c ? 'swatch active' : 'swatch'}
            style={{ background: c }}
            title={c}
            onClick={() => props.setColor(c)}
          />
        ))}
      </div>

      {props.tool === 'blur' ? (
        <div className="toolbar-group slider-group">
          <span className="framebar-label">Blur</span>
          <input
            type="range"
            min={2}
            max={40}
            value={props.blurRadius}
            onChange={(e) => props.setBlurRadius(Number(e.target.value))}
          />
          <span className="slider-value">{props.blurRadius}px</span>
        </div>
      ) : (
        <div className="toolbar-group">
          {WIDTHS.map((w) => (
            <button
              key={w}
              className={props.width === w ? 'width active' : 'width'}
              title={`Stroke ${w}px`}
              onClick={() => props.setWidth(w)}
            >
              <span style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
      )}

      <div className="toolbar-group">
        <button className="tool" title="Undo (⌘Z)" disabled={!props.canUndo} onClick={props.onUndo}>
          <Icon name="undo" />
        </button>
        <button
          className="tool"
          title="Redo (⌘⇧Z)"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Icon name="redo" />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group actions">
        <button className="action" title="Copy to clipboard (⌘C)" disabled={props.busy} onClick={props.onCopy}>
          <Icon name="copy" />
          <span>Copy</span>
        </button>
        <button className="action" title="Save to file" disabled={props.busy} onClick={props.onSave}>
          <Icon name="save" />
          <span>Save</span>
        </button>
        <button
          className="action"
          title={props.uploadEnabled ? 'Upload & copy link' : 'Configure upload in Settings'}
          disabled={props.busy || !props.uploadEnabled}
          onClick={props.onUpload}
        >
          <Icon name="upload" />
          <span>Upload</span>
        </button>
        <button className="action ghost" title="Close (Esc)" onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}
