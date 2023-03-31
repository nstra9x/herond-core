const config = require('../lib/config')
const util = require('../lib/util')

const buildIOS = (buildConfig = config.defaultBuildConfig, options) => {
  console.log("Building project ...")
  config.buildConfig = buildConfig
  config.update(options)

  util.generateXcodeWorkspace()
  util.buildTarget()

  //util.run('autoninja', ['-C', outDir, application], { stdio: 'inherit', cwd: config.srcDir })

  console.log("... build project done.")
}

module.exports = buildIOS
