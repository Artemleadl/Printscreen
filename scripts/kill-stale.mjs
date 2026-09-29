// Stops a previous dev instance before `npm run dev`: the app holds a
// single-instance lock, so a leftover process would make the new one quit.
// pkill isn't available on Windows; there the stale instance must be closed
// by hand (tray → Quit).
import { execSync } from 'node:child_process'

let killed = false
if (process.platform !== 'win32') {
  for (const pattern of ['electron-vite', 'snapshot-studio']) {
    try {
      execSync(`pkill -f ${pattern}`, { stdio: 'ignore' })
      killed = true
    } catch {
      // Nothing matched — that's fine.
    }
  }
}

// Give the old process a moment to release the lock and the dev-server port.
if (killed) await new Promise((resolve) => setTimeout(resolve, 1000))
