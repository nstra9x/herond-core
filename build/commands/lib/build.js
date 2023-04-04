const config = require('../lib/config')
const util = require('../lib/util')

const build = (buildConfig = config.defaultBuildConfig, options) => {
  console.log("Building project ...")
  config.buildConfig = buildConfig
  config.update(options)

  util.generateXcodeWorkspace()
  util.buildTarget()

  console.log("... build project done.")
}

module.exports = build
