const config = require('../lib/config')
const util = require('../lib/util')
const path = require('path')
const fs = require('fs-extra')
const { log } = require('console')

console.log('Building project...')
util.run('which', ['autoninja'], { cwd: config.srcDir })
let ninjaOpts = [
    '-C',
    'out/Debug-iphonesimulator',
    'gn_all'
]
console.log('Building..................')
util.run('autoninja', ninjaOpts, { cwd: config.srcDir })
console.log('Finish building project')
