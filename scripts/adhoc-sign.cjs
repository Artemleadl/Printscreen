// electron-builder afterPack hook. Without a Developer ID certificate
// electron-builder (v24) leaves the app unsigned, and macOS can't tie a
// Screen Recording permission to it: the toggle in System Settings never
// takes effect. Ad-hoc sign the app here; if a real certificate is found,
// electron-builder's own signing step runs afterwards and replaces this.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const entitlements = path.join(__dirname, '../build/entitlements.mac.plist')
  console.log(`  • ad-hoc signing  app=${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, appPath],
    { stdio: 'inherit' }
  )
}
