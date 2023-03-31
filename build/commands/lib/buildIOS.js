const config = require('../lib/config')
const util = require('../lib/util')

const buildIOS = (buildConfig = config.defaultBuildConfig, options) => {
  console.log("Building project ...")
  config.buildConfig = buildConfig
  config.update(options)

  util.run("herond/build/commands/scripts/setup-gn.py", [] ,{ cwd: config.srcDir })

  //if (config.xcode_gen_target) {
   // util.generateXcodeWorkspace()
  //}

  //util.buildTarget()

  //util.generateConfigArgs()

  //util.run('autoninja', ['-C', outDir, application], { stdio: 'inherit', cwd: config.srcDir })

  console.log("... build project done.")
}

module.exports = buildIOS
