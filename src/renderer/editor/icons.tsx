interface IconProps {
  name: string
}

const paths: Record<string, React.ReactNode> = {
  select: <path d="M5 3l14 7-6 2-2 6z" />,
  arrow: <path d="M5 19L19 5M19 5h-7M19 5v7" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  line: <path d="M5 19L19 5" />,
  pen: <path d="M4 20l4-1 9-9-3-3-9 9zM14 7l3 3" />,
  highlight: <path d="M4 20l3 0 11-11-3-3L4 17z M13 6l3 3" />,
  text: <path d="M5 5h14M12 5v14M9 19h6" />,
  blur: <path d="M12 3c4 5 6 8 6 11a6 6 0 11-12 0c0-3 2-6 6-11z" />,
  step: <path d="M12 4a8 8 0 100 16 8 8 0 000-16zM12 9v6M10 11l2-2" />,
  undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10" />,
  redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10" />,
  copy: <path d="M8 8h10v12H8zM6 16H4V4h12v2" />,
  save: <path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-6h8v6" />,
  upload: <path d="M12 16V4M8 8l4-4 4 4M5 16v4h14v-4" />,
  close: <path d="M6 6l12 12M18 6L6 18" />
}

export function Icon({ name }: IconProps): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={name === 'step' || name === 'select' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
