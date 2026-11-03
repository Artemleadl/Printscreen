import { useEffect, useRef, useState } from 'react'

interface Props {
  // The toolbar button; receives whether the popover is open.
  trigger: (open: boolean) => React.ReactNode
  title: string
  align?: 'left' | 'right'
  children: React.ReactNode
}

// A toolbar button with a panel underneath, closed by an outside click or Esc.
export function Popover({ trigger, title, align = 'left', children }: Props): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    // Capture phase, so Esc closes the popover instead of the editor.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="popover-anchor" ref={ref}>
      <button className={open ? 'tool active' : 'tool'} title={title} onClick={() => setOpen(!open)}>
        {trigger(open)}
      </button>
      {open && <div className={`popover popover-${align}`}>{children}</div>}
    </div>
  )
}
