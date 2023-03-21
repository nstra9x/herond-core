const config = require('../lib/config')
const util = require('../lib/util')
const path = require('path')
const fs = require('fs-extra')

const buildIOS = (mode = "Release", device = "iphonesimulator", application = "gn_all", options) => {
  //config.buildConfig = buildConfig
  //config.update(options)
  switch (mode.toLowerCase()) {
    case "debug":
      mode = "Debug"
      break
    case "official":
      mode = "Official"
      break
    case "profile":
      mode = "Profile"
      break
    default:
      mode = "Release"
  }

  switch (device.toLowerCase()) {
    case "content_shell":
      device = "content_shell"
      break
    case "ios_web_shell":
      device = "ios_web_shell"
      break
    default:
      device = "gn_all"
  }

  switch (application.toLowerCase()) {
    case "iphone":
      application = "iphoneos"
      break
    case "maccatalyst":
      application = "maccatalyst"
      break
    default:
      application = "iphonesimulator"
  }

  const outDir = path.resolve(path.join('out', mode, '-', device))
  console.log('outDir == ' + outDir)

  console.log("Building project ...")
  util.run('autoninja', ['-C', outDir, application], { stdio: 'inherit', cwd: config.srcDir })
  console.log("... build project done")
}

module.exports = buildIOS
