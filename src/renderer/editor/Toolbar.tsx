import type { Tool } from './annotations'
import type { Frame } from './frame'
import { FramePanel } from './FramePanel'
import { Icon } from './icons'
import { Popover } from './Popover'

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

const COLORS = ['#f0476b', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#1d1d1f']
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
  frame: Frame
  setFrame: (f: Frame) => void
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

// One compact row in the window's title bar, like macOS Markup: tools in a
// segmented control, color / stroke / background in popovers, actions right.
export function Toolbar(props: Props): React.ReactElement {
  return (
    <div className="toolbar">
      <div className="segmented">
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

      <Popover title="Color" trigger={() => <span className="color-dot" style={{ background: props.color }} />}>
        <div className="color-grid">
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
      </Popover>

      {props.tool === 'blur' ? (
        <Popover title="Blur strength" trigger={() => <Icon name="blur" />}>
          <label className="panel-slider">
            <span className="panel-label">Blur</span>
            <input
              type="range"
              min={2}
              max={40}
              value={props.blurRadius}
              onChange={(e) => props.setBlurRadius(Number(e.target.value))}
            />
            <span className="slider-value">{props.blurRadius}px</span>
          </label>
        </Popover>
      ) : (
        <Popover
          title="Line width"
          trigger={() => (
            <span className="width-preview">
              <span style={{ height: Math.min(props.width, 8) }} />
            </span>
          )}
        >
          <div className="width-list">
            {WIDTHS.map((w) => (
              <button
                key={w}
                className={props.width === w ? 'width active' : 'width'}
                title={`${w}px`}
                onClick={() => props.setWidth(w)}
              >
                <span style={{ height: w }} />
              </button>
            ))}
          </div>
        </Popover>
      )}

      <span className="toolbar-separator" />

      <button className="tool" title="Undo (⌘Z)" disabled={!props.canUndo} onClick={props.onUndo}>
        <Icon name="undo" />
      </button>
      <button className="tool" title="Redo (⌘⇧Z)" disabled={!props.canRedo} onClick={props.onRedo}>
        <Icon name="redo" />
      </button>

      <div className="toolbar-spacer" />

      <Popover title="Background, padding and corners" align="right" trigger={() => <Icon name="background" />}>
        <FramePanel frame={props.frame} setFrame={props.setFrame} />
      </Popover>
      <button
        className="tool"
        title={props.uploadEnabled ? 'Upload & copy link' : 'Configure upload in Settings'}
        disabled={props.busy || !props.uploadEnabled}
        onClick={props.onUpload}
      >
        <Icon name="upload" />
      </button>
      <button className="tool" title="Save to file (⌘S)" disabled={props.busy} onClick={props.onSave}>
        <Icon name="save" />
      </button>
      <button className="primary" title="Copy to clipboard (⌘C copies and closes)" disabled={props.busy} onClick={props.onCopy}>
        Copy
      </button>
      {/* macOS closes with the traffic lights; elsewhere keep a close button. */}
      {window.api.platform !== 'darwin' && (
        <button className="tool" title="Close (Esc)" onClick={props.onClose}>
          <Icon name="close" />
        </button>
      )}
    </div>
  )
}
