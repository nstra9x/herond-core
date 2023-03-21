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
    case "iphone":
      device = "iphoneos"
      break
    case "maccatalyst":
      device = "maccatalyst"
      break
    default:
      device = "iphonesimulator"
  }

  switch (application.toLowerCase()) {
    case "content_shell":
      application = "content_shell"
      break
    case "ios_web_shell":
      application = "ios_web_shell"
      break
    default:
      application = "gn_all"
  }

  const outDir = 'out/' + mode + '-' + device
  console.log('outDir == ' + outDir)

  console.log("Building project ...")
  util.run('autoninja', ['-C', outDir, application], { stdio: 'inherit', cwd: config.srcDir })
  console.log("... build project done")
}

module.exports = buildIOS
