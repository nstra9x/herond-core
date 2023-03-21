const config = require('../lib/config')
const util = require('../lib/util')
const path = require('path')
const fs = require('fs-extra')

const buildIOS = (buildConfig = config.defaultBuildConfig, options) => {
  config.buildConfig = buildConfig
  config.update(options)

  switch (options.build_mode.toLowerCase()) {
    case "debug":
      options.build_mode = "Debug"
      break
    case "official":
      options.build_mode = "Official"
      break
    case "profile":
      options.build_mode = "Profile"
      break
    default:
      options.build_mode = "Release"
  }

  switch (options.build_option.toLowerCase()) {
    case "content_shell":
      options.build_option = "content_shell"
      break
    case "ios_web_shell":
      options.build_option = "ios_web_shell"
      break
    default:
      options.build_option = "gn_all"
  }

  switch (options.build_device.toLowerCase()) {
    case "iphone":
      options.build_device = "iphoneos"
      break
    case "maccatalyst":
      options.build_device = "maccatalyst"
      break
    default:
      options.build_device = "iphonesimulator"
  }

  const outDir = path.resolve(path.join('out', options.build_mode, '-', options.build_device))
  console.log('outDir == ' + outDir)

  console.log("Building project ...")
  util.run('autoninja', ['-C', outDir, options.build_option], { stdio: 'inherit', cwd: config.srcDir })
  console.log("... build project done")
}

module.exports = buildIOS
