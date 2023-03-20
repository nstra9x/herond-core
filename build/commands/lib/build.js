const config = require('../lib/config')
const util = require('../lib/util')
const path = require('path')
const fs = require('fs-extra')
const { log } = require('console')

/**
 * Checks to make sure the src/chrome/VERSION matches herond-core's package.json version
 */
const checkVersionsMatch = () => {
  const srcChromeVersionDir = path.resolve(path.join(config.srcDir, 'chrome', 'VERSION'))
  const versionData = fs.readFileSync(srcChromeVersionDir, 'utf8')
  const re = /MAJOR=(\d+)\s+MINOR=(\d+)\s+BUILD=(\d+)\s+PATCH=(\d+)/
  const found = versionData.match(re)
  const herondVersionFromChromeFile = `${found[2]}.${found[3]}.${found[4]}`
  if (herondVersionFromChromeFile !== config.herondVersion) {
    // Only a warning. The CI environment will choose to proceed or not within its own script.
    console.warn(`Version files do not match!\nsrc/chrome/VERSION: ${herondVersionFromChromeFile}\nherond-core package.json version: ${config.herondVersion}`)
  }
}

const build = (buildConfig = config.defaultBuildConfig, options = {}) => {
    console.log('Building project...')
    let ninjaOpts = [
        '-C',
        'out/Debug-iphonesimulator',
        'gn_all'
    ]
    util.run('autoninja', ninjaOpts, { cwd: config.srcDir })
    console.log('Finish building project')
  /*config.buildConfig = buildConfig
  config.update(options)
  checkVersionsMatch()

  //util.touchOverriddenFiles()
  //util.updateBranding()

  if (config.xcode_gen_target) {
    util.generateXcodeWorkspace()
  } else {
    if (options.no_gn_gen === undefined)
      util.generateNinjaFiles()
    util.buildTarget()
  }*/
}

module.exports = build
