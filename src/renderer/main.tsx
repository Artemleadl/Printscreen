import React from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './overlay/Overlay'
import { Editor } from './editor/Editor'
import { Settings } from './settings/Settings'
import './styles/global.css'

function pickView(): React.ReactElement {
  const route = window.location.hash.replace(/^#\//, '')
  switch (route) {
    case 'overlay':
      return <Overlay />
    case 'editor':
      return <Editor />
    case 'settings':
      return <Settings />
    default:
      return <Settings />
  }
}

// Lets CSS fit platform chrome, e.g. room for the macOS traffic lights.
document.documentElement.dataset.platform = window.api.platform

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{pickView()}</React.StrictMode>
)
