import { useState } from 'react'
import type { AfterCapture } from '@shared/types'

export type CaptureBarMode = 'fullscreen' | 'window' | 'region'

const AFTER_CAPTURE: { value: AfterCapture; label: string }[] = [
  { value: 'editor', label: 'Open in editor' },
  { value: 'copy', label: 'Copy to clipboard' },
  { value: 'save', label: 'Save to file' }
]

const icons: Record<CaptureBarMode | 'close', React.ReactNode> = {
  close: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="var(--bar-bg-solid)" strokeWidth="2" />
    </>
  ),
  fullscreen: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15h18v2a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="currentColor" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="7" r="0.6" fill="currentColor" />
      <circle cx="8.2" cy="7" r="0.6" fill="currentColor" />
      <circle cx="10.4" cy="7" r="0.6" fill="currentColor" />
    </>
  ),
  region: <rect x="3" y="5" width="18" height="14" rx="1.5" strokeDasharray="3 2.4" />
}

function BarIcon({ name }: { name: keyof typeof icons }): React.ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {icons[name]}
    </svg>
  )
}

interface Props {
  mode: CaptureBarMode
  setMode: (mode: CaptureBarMode) => void
  windowsAvailable: boolean
  // What "Capture" would take right now, or null if nothing yet.
  canCapture: boolean
  onCapture: () => void
  onClose: () => void
  afterCapture: AfterCapture
  setAfterCapture: (value: AfterCapture) => void
  // Ignore the pointer while a selection is being dragged across the bar.
  inert: boolean
}

// Floating bar at the bottom of the overlay, modelled on macOS's ⌘⇧5 toolbar.
export function CaptureBar(props: Props): React.ReactElement {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const modes: { mode: CaptureBarMode; title: string; disabled?: boolean }[] = [
    { mode: 'fullscreen', title: 'Capture entire screen' },
    {
      mode: 'window',
      title: props.windowsAvailable ? 'Capture selected window (Space)' : 'No windows to capture',
      disabled: !props.windowsAvailable
    },
    { mode: 'region', title: 'Capture selected portion' }
  ]

  return (
    <div
      className={props.inert ? 'capture-bar inert' : 'capture-bar'}
      // Keep clicks on the bar from starting a selection or a capture.
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
    >
      <button className="bar-button" title="Close (Esc)" onClick={props.onClose}>
        <BarIcon name="close" />
      </button>
      <span className="bar-separator" />
      {modes.map(({ mode, title, disabled }) => (
        <button
          key={mode}
          className={props.mode === mode ? 'bar-button active' : 'bar-button'}
          title={title}
          disabled={disabled}
          onClick={() => props.setMode(mode)}
        >
          <BarIcon name={mode} />
        </button>
      ))}
      <span className="bar-separator" />
      <div className="bar-options">
        <button className="bar-text-button" onClick={() => setOptionsOpen(!optionsOpen)}>
          Options <span className="bar-chevron">▾</span>
        </button>
        {optionsOpen && (
          <div className="bar-menu" role="menu">
            <div className="bar-menu-title">After capture</div>
            {AFTER_CAPTURE.map(({ value, label }) => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={props.afterCapture === value}
                className="bar-menu-item"
                onClick={() => {
                  props.setAfterCapture(value)
                  setOptionsOpen(false)
                }}
              >
                <span className="bar-menu-check">{props.afterCapture === value ? '✓' : ''}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="bar-capture"
        disabled={!props.canCapture}
        title={props.canCapture ? 'Capture (Enter)' : props.mode === 'region' ? 'Drag to select an area' : 'Point at a window'}
        onClick={props.onCapture}
      >
        Capture
      </button>
    </div>
  )
}
