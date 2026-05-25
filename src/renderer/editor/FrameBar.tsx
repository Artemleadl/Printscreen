import type { Background, Frame } from './frame'

interface Preset {
  label: string
  bg: Background
  // CSS used purely for the swatch preview in the toolbar.
  swatch: string
}

const PRESETS: Preset[] = [
  { label: 'None', bg: { type: 'none' }, swatch: 'transparent' },
  {
    label: 'Midnight',
    bg: { type: 'gradient', from: '#0f0c29', to: '#302b63', angle: 135 },
    swatch: 'linear-gradient(135deg,#0f0c29,#302b63)'
  },
  {
    label: 'Carbon',
    bg: { type: 'gradient', from: '#1c1c1c', to: '#3d3d3d', angle: 135 },
    swatch: 'linear-gradient(135deg,#1c1c1c,#3d3d3d)'
  },
  {
    label: 'Pearl',
    bg: { type: 'gradient', from: '#e8e8f0', to: '#c8c8d8', angle: 135 },
    swatch: 'linear-gradient(135deg,#e8e8f0,#c8c8d8)'
  },
  {
    label: 'Sunset',
    bg: { type: 'gradient', from: '#ff6a88', to: '#ff99ac', angle: 135 },
    swatch: 'linear-gradient(135deg,#ff6a88,#ff99ac)'
  },
  {
    label: 'Ocean',
    bg: { type: 'gradient', from: '#2193b0', to: '#6dd5ed', angle: 135 },
    swatch: 'linear-gradient(135deg,#2193b0,#6dd5ed)'
  },
  {
    label: 'Violet',
    bg: { type: 'gradient', from: '#7028e4', to: '#e5b2ca', angle: 135 },
    swatch: 'linear-gradient(135deg,#7028e4,#e5b2ca)'
  },
  {
    label: 'Mint',
    bg: { type: 'gradient', from: '#11998e', to: '#38ef7d', angle: 135 },
    swatch: 'linear-gradient(135deg,#11998e,#38ef7d)'
  },
  {
    label: 'Aurora',
    bg: { type: 'gradient', from: '#00c6ff', to: '#0072ff', angle: 135 },
    swatch: 'linear-gradient(135deg,#00c6ff,#0072ff)'
  },
  {
    label: 'Peach',
    bg: { type: 'gradient', from: '#ed7966', to: '#ffc371', angle: 135 },
    swatch: 'linear-gradient(135deg,#ed7966,#ffc371)'
  },
  {
    label: 'Forest',
    bg: { type: 'gradient', from: '#134e5e', to: '#71b280', angle: 135 },
    swatch: 'linear-gradient(135deg,#134e5e,#71b280)'
  }
]

function sameBg(a: Background, b: Background): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

interface Props {
  frame: Frame
  setFrame: (f: Frame) => void
}

export function FrameBar({ frame, setFrame }: Props): React.ReactElement {
  return (
    <div className="framebar">
      <div className="toolbar-group">
        <span className="framebar-label">Background</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={sameBg(frame.background, p.bg) ? 'bg-swatch active' : 'bg-swatch'}
            style={{ background: p.swatch }}
            title={p.label}
            onClick={() => setFrame({ ...frame, background: p.bg })}
          >
            {p.bg.type === 'none' && <span className="bg-none">∅</span>}
          </button>
        ))}
      </div>

      <div className="toolbar-group slider-group">
        <span className="framebar-label">Padding</span>
        <input
          type="range"
          min={0}
          max={200}
          value={frame.padding}
          onChange={(e) => setFrame({ ...frame, padding: Number(e.target.value) })}
        />
        <span className="slider-value">{frame.padding}</span>
      </div>

      <div className="toolbar-group slider-group">
        <span className="framebar-label">Corner radius</span>
        <input
          type="range"
          min={0}
          max={80}
          value={frame.radius}
          onChange={(e) => setFrame({ ...frame, radius: Number(e.target.value) })}
        />
        <span className="slider-value">{frame.radius}</span>
      </div>
    </div>
  )
}
