// Copyright (c) 2017 The Herond Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

const program = require('commander');
const build = require('../lib/build')
const versions = require('../lib/versions')
const applyPatches = require('../lib/applyPatches')
const updatePatches = require('./updatePatches')

program
  .version(process.env.npm_package_version)

program
  .command('versions')
  .action(versions)

program
  .command('apply_patches')
  .arguments('[build_config]')
  .action(applyPatches)

  program
    .command('build')
    .option('-C <build_dir>', 'output directory')
    .option('--target_environment <target_environment>', 'target environment (device, catalyst, simulator)')
    .option('--channel <target_channel>', 'target channel to build', /^(beta|dev|nightly|release)$/i)
    .option('--application <target_application>', 'Build with options', /^(gn_all|content_shell|ios_web_shell)$/i)
    .option('--xcode_gen <target>', 'Generate an Xcode workspace to //out/<target>')
    .arguments('[build_config]')
    .action(build)

program
  .command('update_patches')
  .action(updatePatches)

program
  .parse(process.argv)
