// Copyright (c) 2016 The Herond Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert')
const { spawnSync } = require('child_process')

let npmCommand = 'npm'
let NpmConfig = null
let dirName = __dirname

const rootDir = path.resolve(dirName, '..', '..', '..', '..', '..')
const herondCoreDir = path.join(rootDir, 'src', 'herond')

const run = (cmd, args = []) => {
  const prog = spawnSync(cmd, args)
  if (prog.status !== 0) {
    console.log(prog.stdout && prog.stdout.toString())
    console.error(prog.stderr && prog.stderr.toString())
    process.exit(1)
  }
  return prog
}

var packageConfig = function (key, sourceDir = herondCoreDir) {
  let packages = { config: {} }
  const configAbsolutePath = path.join(sourceDir, 'package.json')
  if (fs.existsSync(configAbsolutePath)) {
    packages = require(path.relative(__dirname, configAbsolutePath))
  }

  // packages.config should include version string.
  let obj = Object.assign({}, packages.config, { version: packages.version })
  for (var i = 0, len = key.length; i < len; i++) {
    if (!obj) {
      return obj
    }
    obj = obj[key[i]]
  }
  return obj
}

const getNPMConfig = (key, default_value = undefined) => {
  if (!NpmConfig) {
    const list = run(npmCommand, ['config', 'list', '--json', '--userconfig=' + path.join(rootDir, '.npmrc')])
    NpmConfig = JSON.parse(list.stdout.toString())
  }

  // NpmConfig has the multiple copy of the same variable: one from .npmrc
  // (that we want to) and one from the environment.
  // https://docs.npmjs.com/cli/v7/using-npm/config#environment-variables
  const npmConfigValue = NpmConfig[key.join('_')]
  if (npmConfigValue !== undefined)
    return npmConfigValue

  // Shouldn't be used in general but added for backward compatibilty.
  const npmConfigDeprecatedValue = NpmConfig[key.join('-').replace(/_/g, '-')]
  if (npmConfigDeprecatedValue !== undefined)
    return npmConfigDeprecatedValue

  const packageConfigValue = packageConfig(key)
  if (packageConfigValue !== undefined)
    return packageConfigValue

  return default_value
}

const parseExtraInputs = (inputs, accumulator, callback) => {
  for (let input of inputs) {
    let separatorIndex = input.indexOf(':')
    if (separatorIndex < 0) {
      separatorIndex = input.length
    }

    const key = input.substring(0, separatorIndex)
    const value = input.substring(separatorIndex + 1)
    callback(accumulator, key, value)
  }
}

const Config = function () {
  this.targetOS = "ios"
  this.targetArch = "arm64"
  this.defaultBuildConfig = 'Component'
  this.buildConfig = this.defaultBuildConfig
  this.buildTarget = 'herond'
  this.rootDir = rootDir
  this.herondCoreDir = herondCoreDir
  this.scriptDir = path.join(this.rootDir, 'scripts')
  this.defaultGClientFile = path.join(this.rootDir, '.gclient')
  this.gClientFile = process.env.HEROND_GCLIENT_FILE || this.defaultGClientFile
  this.srcDir = path.join(this.rootDir, 'src')
  this.channel = 'development'
  this.application = 'gn_all'
  this.targetEnvironment = "simulator"
  this.xcode_gen_target = "build"
  this.chromiumRepo = getNPMConfig(['projects', 'chrome', 'repository', 'url'])
  this.nativeRedirectCCDir = path.join(this.rootDir, 'out', 'redirect_cc')
  this.depotToolsDir = path.join(this.herondCoreDir, 'vendor', 'depot_tools')

  if (process.env.GOMA_DIR !== undefined) {
    this.realGomaDir = process.env.GOMA_DIR
  } else {
    this.realGomaDir = path.join(this.depotToolsDir, '.cipd_bin')
  }
}

Config.prototype.buildArgs = function () {
  let args = {
    '--build-dir': this.outputDir,
    '--gn-path': path.join(this.depotToolsDir, 'gn'),
    '--project-name': this.xcode_gen_target,
    '--build-config': this.buildConfig,
    '--target-environment': this.targetEnvironment
  }
  return args
}

Config.prototype.prependPath = function (oldPath, addPath) {
  let newPath = oldPath.split(path.delimiter)
  newPath.unshift(addPath)
  newPath = newPath.join(path.delimiter)
  return newPath
}

Config.prototype.appendPath = function (oldPath, addPath) {
  let newPath = oldPath.split(path.delimiter)
  newPath.push(addPath)
  newPath = newPath.join(path.delimiter)
  return newPath
}

Config.prototype.addPathToEnv = function (env, addPath, prepend = false) {
  // cmd.exe uses Path instead of PATH so just set both
  const addToPath = prepend ? this.prependPath : this.appendPath
  env.Path && (env.Path = addToPath(env.Path, addPath))
  env.PATH && (env.PATH = addToPath(env.PATH, addPath))
  return env
}

Config.prototype.addPythonPathToEnv = function (env, addPath) {
  env.PYTHONPATH = this.appendPath(env.PYTHONPATH || '', addPath)
  return env
}

Config.prototype.getProjectVersion = function (projectName) {
  return getNPMConfig(['projects', projectName, 'tag']) || getNPMConfig(['projects', projectName, 'branch'])
}

Config.prototype.getProjectRef = function (projectName) {
  const tag = getNPMConfig(['projects', projectName, 'tag'])
  if (tag) {
    return `refs/tags/${tag}`
  }

  let branch = getNPMConfig(['projects', projectName, 'branch'])
  if (branch) {
    return `origin/${branch}`
  }

  return 'origin/master'
}

Config.prototype.update = function (options) {

  if (options.C) {
    this.__outputDir = options.C
  }

  if (options.target_environment) {
    this.targetEnvironment = options.target_environment.toLowerCase()
  }

  if (options.channel) {
    this.channel = options.channel
  }

  if (options.application) {
    this.application = options.application.toLowerCase()
  }

  if (options.xcode_gen) {
    this.xcode_gen_target = options.xcode_gen
  }

  switch (this.buildConfig.toLowerCase()) {
    case 'release':
      this.buildConfig = 'Release'
      break
    case 'debug':
      this.buildConfig = 'Debug'
      break
    case 'profile':
        this.buildConfig = 'Profile'
        break
    case 'official':
      this.buildConfig = 'Official'
      break
    default:
      this.buildConfig = this.defaultBuildConfig
  }
}

Config.prototype.getCachePath = function () {
  return this.git_cache_path || process.env.GIT_CACHE_PATH
}

Object.defineProperty(Config.prototype, 'defaultOptions', {
  get: function () {
    let env = Object.assign({}, process.env)
    env = this.addPathToEnv(env, path.join(this.depotToolsDir, 'python-bin'), true)
    env = this.addPathToEnv(env, path.join(this.depotToolsDir, 'python2-bin'), true)
    env = this.addPathToEnv(env, this.depotToolsDir, true)
    env = this.addPythonPathToEnv(env, path.join(this.srcDir, 'tools', 'grit', 'grit', 'extern'))
    env = this.addPythonPathToEnv(env, path.join(this.srcDir, 'build'))
    env = this.addPythonPathToEnv(env, path.join(this.srcDir, 'third_party', 'depot_tools'))
    env.DEPOT_TOOLS_WIN_TOOLCHAIN = '0'
    env.PYTHONUNBUFFERED = '1'
    env.TARGET_ARCH = this.gypTargetArch // for herond scripts
    env.GYP_MSVS_VERSION = env.GYP_MSVS_VERSION || '2017' // enable 2017

    // Fix `gclient runhooks` - broken since depot_tools a7b20b34f85432b5958963b75edcedfef9cf01fd
    env.GSUTIL_ENABLE_LUCI_AUTH = '0'

    if (this.channel != "") {
      env.HEROND_CHANNEL = this.channel
    }

    if (this.getCachePath()) {
      console.log("using git cache path " + this.getCachePath())
      env.GIT_CACHE_PATH = path.join(this.getCachePath())
    }

    if (!this.use_goma && this.sccache) {
      env.CC_WRAPPER = this.sccache
      console.log('using cc wrapper ' + path.basename(this.sccache))
      if (path.basename(this.sccache) === 'ccache') {
        env.CCACHE_CPP2 = 'yes'
        env.CCACHE_SLOPPINESS = 'pch_defines,time_macros,include_file_mtime'
        env.CCACHE_BASEDIR = this.srcDir
        env = this.addPathToEnv(env, path.join(this.srcDir, 'third_party', 'llvm-build', 'Release+Asserts', 'bin'))
      }
    }

    if (this.use_goma) {
      // Vars used by autoninja to generate -j value, adjusted for Herond-specific setup.
      env.NINJA_CORE_MULTIPLIER = 20
      env.NINJA_CORE_LIMIT = 160
    }

    if (this.isCI) {
      // Enables autoninja to show build speed and final stats on finish.
      env.NINJA_SUMMARIZE_BUILD = 1
    }

    return {
      env,
      stdio: 'inherit',
      cwd: this.srcDir,
      shell: true,
      git_cwd: '.',
    }
  },
})

Object.defineProperty(Config.prototype, 'outputDir', {
  get: function () {
    const baseDir = path.join(this.srcDir, 'out')
    if (this.__outputDir) {
      if (path.isAbsolute(this.__outputDir)) {
        return this.__outputDir;
      }
      return path.join(baseDir, this.__outputDir)
    }
    else {
      return path.join(baseDir, "Component")
    }
  },
  set: function (outputDir) { return this.__outputDir = outputDir },
})

module.exports = new Config
