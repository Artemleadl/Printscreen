// electron-builder afterPack hook. Without a Developer ID certificate
// electron-builder (v24) leaves the app unsigned, and macOS can't tie a
// Screen Recording permission to it: the toggle in System Settings never
// takes effect. Sign the app here instead:
// - with the local "Snapshot Studio Local" certificate when it exists
//   (created by scripts/install-mac.sh): the identity stays the same across
//   builds, so the permission survives rebuilds;
// - ad-hoc otherwise: works, but each build needs the permission again.
// If a real certificate is found, electron-builder's own signing step runs
// afterwards and replaces this signature.
const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')

const LOCAL_IDENTITY = 'Snapshot Studio Local'

exports.default = function sign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const entitlements = path.join(__dirname, '../build/entitlements.mac.plist')
  const hasLocal = spawnSync('security', ['find-certificate', '-c', LOCAL_IDENTITY]).status === 0
  const identity = hasLocal ? LOCAL_IDENTITY : '-'
  console.log(`  • signing  identity=${hasLocal ? LOCAL_IDENTITY : 'ad-hoc'} app=${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', identity, '--options', 'runtime', '--entitlements', entitlements, appPath],
    { stdio: 'inherit' }
  )
}
