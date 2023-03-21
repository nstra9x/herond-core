const config = require('../lib/config')
const util = require('../lib/util')
const path = require('path')
const fs = require('fs-extra')

const buildIOS = () => {
  console.log("Building project ...")
  util.run('autoninja', ['-C', 'out/Debug-iphonesimulator', 'gn_all'], { stdio: 'inherit' }, cwd: config.srcDir)
  console.log("... build project done")
}

module.exports = buildIOS
