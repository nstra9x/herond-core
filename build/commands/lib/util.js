// Copyright (c) 2016 The Herond Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

const path = require('path')
const { spawn, spawnSync } = require('child_process')
const config = require('./config')
const fs = require('fs-extra')
const crypto = require('crypto')
const Log = require('./sync/logging')
const assert = require('assert')
const { exit } = require('process')

const mergeWithDefault = (options) => {
  return Object.assign({}, config.defaultOptions, options)
}

async function applyPatches() {
  const GitPatcher = require('./gitPatcher')
  Log.progress('Applying patches...')
  // Always detect if we need to apply patches, since user may have modified
  // either chromium source files, or .patch files manually
  const coreRepoPath = config.herondCoreDir
  const patchesPath = path.join(coreRepoPath, 'patches')
  const v8PatchesPath = path.join(patchesPath, 'v8')
  const catapultPatchesPath = path.join(patchesPath, 'third_party', 'catapult')

  const chromiumRepoPath = config.srcDir
  const v8RepoPath = path.join(chromiumRepoPath, 'v8')
  const catapultRepoPath = path.join(chromiumRepoPath, 'third_party', 'catapult')

  const chromiumPatcher = new GitPatcher(patchesPath, chromiumRepoPath)
  const v8Patcher = new GitPatcher(v8PatchesPath, v8RepoPath)
  const catapultPatcher = new GitPatcher(catapultPatchesPath, catapultRepoPath)

  const chromiumPatchStatus = await chromiumPatcher.applyPatches()
  const v8PatchStatus = await v8Patcher.applyPatches()
  const catapultPatchStatus = await catapultPatcher.applyPatches()

  // Log status for all patches
  // Differentiate entries for logging
  v8PatchStatus.forEach(s => s.path = path.join('v8', s.path))
  catapultPatchStatus.forEach(
    s => s.path = path.join('third_party', 'catapult', s.path))
  const allPatchStatus =
    chromiumPatchStatus.concat(v8PatchStatus).concat(catapultPatchStatus)
  Log.allPatchStatus(allPatchStatus, 'Chromium')

  const hasPatchError = allPatchStatus.some(p => p.error)
  Log.progress('Done applying patches.')
  // Exit on error in any patch
  if (hasPatchError) {
    Log.error('Exiting as not all patches were successful!')
    process.exit(1)
  }
}

const isOverrideNewer = (original, override) => {
  return (fs.statSync(override).mtimeMs - fs.statSync(original).mtimeMs > 0)
}

const updateFileUTimesIfOverrideIsNewer = (original, override) => {
  if (isOverrideNewer(original, override)) {
    const date = new Date()
    fs.utimesSync(original, date, date)
    console.log(original + ' is touched.')
  }
}

const deleteFileIfOverrideIsNewer = (original, override) => {
  if (fs.existsSync(original) && isOverrideNewer(original, override)) {
    try {
      fs.unlinkSync(original)
      console.log(original + ' has been deleted.')
    } catch (err) {
      console.error('Unable to delete file: ' + original + ' error: ', err)
      process.exit(1)
    }
  }
}

const getAdditionalGenLocation = () => {
  if ((process.platform === 'darwin' || process.platform === 'linux') && config.targetArch === 'arm64') {
    return 'clang_x64_v8_arm64'
  }
  return ''
}

const util = {

  runProcess: (cmd, args = [], options = {}) => {
    Log.command(options.cwd, cmd, args)
    return spawnSync(cmd, args, options)
  },

  run: (cmd, args = [], options = {}) => {
    const { continueOnFail, ...cmdOptions } = options
    const prog = util.runProcess(cmd, args, cmdOptions)
    if (prog.status !== 0) {
      if (!continueOnFail) {
        console.log(prog.stdout && prog.stdout.toString())
        console.error(prog.stderr && prog.stderr.toString())
        process.exit(1)
      }
    }
    return prog
  },

  runGit: (repoPath, gitArgs, continueOnFail = false) => {
    let prog = util.run('git', gitArgs, { cwd: repoPath, continueOnFail })

    if (prog.status !== 0) {
      return null
    } else {
      return prog.stdout.toString().trim()
    }
  },

  runAsync: (cmd, args = [], options = {}) => {
    let { continueOnFail, verbose, ...cmdOptions } = options
    if (verbose) {
      Log.command(cmdOptions.cwd, cmd, args)
    }
    return new Promise((resolve, reject) => {
      const prog = spawn(cmd, args, cmdOptions)
      let stderr = ''
      let stdout = ''
      prog.stderr.on('data', data => {
        stderr += data
      })
      prog.stdout.on('data', data => {
        stdout += data
      })
      prog.on('close', statusCode => {
        const hasFailed = statusCode !== 0
        if (verbose && (!hasFailed || continueOnFail)) {
          console.log(stdout)
          if (stderr) {
            console.error(stderr)
          }
        }
        if (hasFailed) {
          const err = new Error(`Program ${cmd} exited with error code ${statusCode}.`)
          err.stderr = stderr
          err.stdout = stdout
          reject(err)
          if (!continueOnFail) {
            console.log(err.message)
            console.log(stdout)
            console.error(stderr)
            process.exit(1)
          }
          return
        }
        resolve(stdout)
      })
    })
  },


  runGitAsync: function (repoPath, gitArgs, verbose = false, logError = false) {
    return util.runAsync('git', gitArgs, { cwd: repoPath, verbose, continueOnFail: true })
      .catch(err => {
        if (logError) {
          console.error(err.message)
          console.error(`Git arguments were: ${gitArgs.join(' ')}`)
          console.log(err.stdout)
          console.error(err.stderr)
        }
        return Promise.reject(err)
      })
  },

  getGitReadableLocalRef: (repoDir) => {
    return util.runGit(repoDir, ['log', '-n', '1', '--pretty=format:%h%d'], true)
  },

  calculateFileChecksum: (filename) => {
    // adapted from https://github.com/kodie/md5-file
    const BUFFER_SIZE = 8192
    const fd = fs.openSync(filename, 'r')
    const buffer = Buffer.alloc(BUFFER_SIZE)
    const md5 = crypto.createHash('md5')

    try {
      let bytesRead
      do {
        bytesRead = fs.readSync(fd, buffer, 0, BUFFER_SIZE)
        md5.update(buffer.slice(0, bytesRead))
      } while (bytesRead === BUFFER_SIZE)
    } finally {
      fs.closeSync(fd)
    }

    return md5.digest('hex')
  },

  updateBranding: () => {},

  touchOverriddenChromiumSrcFiles: () => {
    console.log('touch original files overridden by chromium_src...')

    // Return true when original file of |file| should be touched.
    const applyFileFilter = (file) => {
      // Only include overridable files.
      const supported_exts = ['.cc','.h', '.mm', '.mojom', '.py', '.pdl'];
      return supported_exts.includes(path.extname(file))
    }

    const chromiumSrcDir = path.join(config.srcDir, 'brave', 'chromium_src')
    var sourceFiles = util.walkSync(chromiumSrcDir, applyFileFilter)
    const additionalGen = getAdditionalGenLocation()

    // Touch original files by updating mtime.
    const chromiumSrcDirLen = chromiumSrcDir.length
    sourceFiles.forEach(chromiumSrcFile => {
      const relativeChromiumSrcFile = chromiumSrcFile.slice(chromiumSrcDirLen)
      let overriddenFile = path.join(config.srcDir, relativeChromiumSrcFile)
      if (fs.existsSync(overriddenFile)) {
        // If overriddenFile is older than file in chromium_src, touch it to trigger rebuild.
        updateFileUTimesIfOverrideIsNewer(overriddenFile, chromiumSrcFile)
      } else {
        // If the original file doesn't exist, assume that it's in the gen dir.
        overriddenFile = path.join(config.outputDir, 'gen', relativeChromiumSrcFile)
        deleteFileIfOverrideIsNewer(overriddenFile, chromiumSrcFile)
        // Also check the secondary gen dir, if exists
        if (!!additionalGen) {
          overriddenFile = path.join(config.outputDir, additionalGen, 'gen', relativeChromiumSrcFile)
          deleteFileIfOverrideIsNewer(overriddenFile, chromiumSrcFile)
        }
      }
    })
  },

  touchOverriddenVectorIconFiles: () => {
    console.log('touch original vector icon files overridden by brave/vector_icons...')

    // Return true when original file of |file| should be touched.
    const applyFileFilter = (file) => {
      // Only includes icon files.
      const ext = path.extname(file)
      if (ext !== '.icon') { return false }
      return true
    }

    const herondVectorIconsDir = path.join(config.srcDir, 'brave', 'vector_icons')
    var herondVectorIconFiles = util.walkSync(herondVectorIconsDir, applyFileFilter)

    // Touch original files by updating mtime.
    const herondVectorIconsDirLen = herondVectorIconsDir.length
    herondVectorIconFiles.forEach(herondVectorIconFile => {
      var overriddenFile = path.join(config.srcDir, herondVectorIconFile.slice(herondVectorIconsDirLen))
      if (fs.existsSync(overriddenFile)) {
        // If overriddenFile is older than file in vector_icons, touch it to trigger rebuild.
        updateFileUTimesIfOverrideIsNewer(overriddenFile, herondVectorIconFile)
      }
    })
  },

  touchOverriddenFiles: () => {
    util.touchOverriddenChromiumSrcFiles()
    util.touchOverriddenVectorIconFiles()
  },

  // Chromium compares pre-installed midl files and generated midl files from IDL during the build to check integrity.
  // Generated files during the build time and upstream pre-installed files are different because we use different IDL file.
  // So, we should copy our pre-installed files to overwrite upstream pre-installed files.
  // After checking, pre-installed files are copied to gen dir and they are used to compile.
  // So, this copying in every build doesn't affect compile performance.
  updateOmahaMidlFiles: () => {
    console.log('update omaha midl files...')
    const srcDir = path.join(config.herondCoreDir, 'win_build_output', 'midl', 'google_update')
    const dstDir = path.join(config.srcDir, 'third_party', 'win_build_output', 'midl', 'google_update')
    fs.copySync(srcDir, dstDir)
  },

  // TODO(bridiver) - this should move to gn and windows should call signApp like other platforms
  signWinBinaries: () => {
    // Copy & sign only binaries for widevine sig file generation.
    // With this, create_dist doesn't trigger rebuild because original binaries is not modified.
    const dir = path.join(config.outputDir, 'signed_binaries')
    if (!fs.existsSync(dir))
      fs.mkdirSync(dir);

    fs.copySync(path.join(config.outputDir, 'herond.exe'), path.join(dir, 'herond.exe'));
    fs.copySync(path.join(config.outputDir, 'chrome.dll'), path.join(dir, 'chrome.dll'));

    util.run('python', [path.join(config.herondCoreDir, 'script', 'sign_binaries.py'), '--build_dir=' + dir])
  },

  buildNativeRedirectCC: (options = config.defaultOptions) => {
    // Expected path to redirect_cc.
    const redirectCC = path.join(config.nativeRedirectCCDir, util.appendExeIfWin32('redirect_cc'))

    // Only build if the source has changed unless it's CI
    if (!config.isCI &&
        fs.existsSync(redirectCC) &&
        fs.statSync(redirectCC).mtime >=
        fs.statSync(path.join(config.herondCoreDir, 'tools', 'redirect_cc', 'redirect_cc.cc')).mtime) {
      return
    }

    console.log('building native redirect_cc...')

    gnArgs = {
      'import("//brave/tools/redirect_cc/args.gni")': null,
      use_goma: config.use_goma,
      goma_dir: config.realGomaDir,
      real_gomacc: path.join(config.realGomaDir, 'gomacc'),
    }

    const buildArgsStr = util.buildArgsToString(gnArgs)
    util.run('gn', ['gen', config.nativeRedirectCCDir, '--args="' + buildArgsStr + '"'], options)

    util.buildTarget('brave/tools/redirect_cc', mergeWithDefault({outputDir: config.nativeRedirectCCDir}))
  },

  runGnGen: (options) => {
    const buildArgsStr = util.buildArgsToString(config.buildArgs())
    const buildArgsFile = path.join(config.outputDir, 'herond_build_args.txt')
    const buildNinjaFile = path.join(config.outputDir, 'build.ninja')
    const gnArgsFile = path.join(config.outputDir, 'args.gn')
    const prevBuildArgs = fs.existsSync(buildArgsFile) ?
      fs.readFileSync(buildArgsFile) : undefined
    const extraGnGenOptsFile = path.join(config.outputDir, 'herond_extra_gn_gen_opts.txt')
    const prevExtraGnGenOpts = fs.existsSync(extraGnGenOptsFile) ?
      fs.readFileSync(extraGnGenOptsFile) : undefined

    const shouldRunGnGen = config.force_gn_gen ||
      !fs.existsSync(buildNinjaFile) || !fs.existsSync(gnArgsFile) ||
      !prevBuildArgs || prevBuildArgs != buildArgsStr ||
      !prevExtraGnGenOpts || prevExtraGnGenOpts != config.extraGnGenOpts

    if (shouldRunGnGen) {
      // `gn gen` can modify args.gn even if it's failed.
      // Therefore delete the file to make sure that args.gn and
      // herond_build_args.txt are in sync.
      if (prevBuildArgs)
        fs.removeSync(buildArgsFile)

      util.run('gn', ['gen', config.outputDir, '--args="' + buildArgsStr + '"', config.extraGnGenOpts], options)
      fs.writeFileSync(buildArgsFile, buildArgsStr)
      fs.writeFileSync(extraGnGenOptsFile, config.extraGnGenOpts)
    }
  },

  generateNinjaFiles: (options = config.defaultOptions) => {
    util.buildNativeRedirectCC()

    console.log('generating ninja files...')

    if (process.platform === 'win32') {
      util.updateOmahaMidlFiles()
    }
    util.runGnGen(options)
  },

  buildTarget: (target = config.buildTarget, options = config.defaultOptions) => {
    const buildId = crypto.randomUUID()
    console.log('building ' + target + ' (id=' + buildId + ') ...')

    let num_compile_failure = 1
    if (config.ignore_compile_failure)
      num_compile_failure = 0

    let ninjaOpts = [
      '-C', options.outputDir || config.outputDir,
      config.application
    ]
    options.env.AUTONINJA_BUILD_ID = buildId
    util.run('autoninja', ninjaOpts, options)
  },

  generateXcodeWorkspace: (options = config.defaultOptions) => {
    console.log('generating Xcode workspace for "' + config.xcode_gen_target + '"...')

    const args = util.buildArgsToString(config.buildArgs())
    const genScript = path.join(config.herondCoreDir, 'build', 'ios', 'setup-gn.py')

    util.run('python3', [genScript, args], options)
  },

  lint: (options = {}) => {
    if (!options.base) {
      options.base = 'origin/master'
    }
    let cmd_options = config.defaultOptions
    cmd_options.cwd = config.herondCoreDir
    cmd_options = mergeWithDefault(cmd_options)
    util.run(
        'vpython3',
        [
          '-vpython-spec=' + path.join(config.depotToolsDir, '.vpython3'),
          path.join(
              config.herondCoreDir, 'build', 'commands', 'scripts', 'lint.py'),
          '--project_root=' + config.srcDir, '--base_branch=' + options.base
        ],
        cmd_options)
  },

  presubmit: (options = {}) => {
    if (!options.base) {
      options.base = 'origin/master'
    }
    // Temporary cleanup call, should be removed when everyone will remove
    // 'gerrit.host' from their herond checkout.
    util.runGit(
        config.herondCoreDir, ['config', '--unset-all', 'gerrit.host'], true)
    let cmd_options = config.defaultOptions
    cmd_options.cwd = config.herondCoreDir
    cmd_options = mergeWithDefault(cmd_options)
    cmd = 'git'
    // --upload mode is similar to `git cl upload`. Non-upload mode covers less
    // checks.
    args = ['cl', 'presubmit', options.base, '--force', '--upload']
    if (options.all)
      args.push('--all')
    if (options.files)
      args.push('--files', options.files)
    if (options.verbose) {
      args.push(...Array(options.verbose).fill('--verbose'))
    }
    if (options.fix) {
      cmd_options.env.PRESUBMIT_FIX = '1'
    }
    util.run(cmd, args, cmd_options)
  },

  format: (options = {}) => {
    if (!options.base) {
      options.base = 'origin/master'
    }
    let cmd_options = config.defaultOptions
    cmd_options.cwd = config.herondCoreDir
    cmd_options = mergeWithDefault(cmd_options)
    cmd = 'git'
    args = ['cl', 'format', '--upstream=' + options.base]
    if (options.full)
      args.push('--full')
    if (options.js)
      args.push('--js')
    if (options.python)
      args.push('--python')
     if (options.rust)
      args.push('--rust-fmt')
    if (options.swift)
      args.push('--swift-format')
    util.run(cmd, args, cmd_options)
  },

  massRename: (options = {}) => {
    let cmd_options = config.defaultOptions
    cmd_options.cwd = config.herondCoreDir
    util.run('python3', [path.join(config.srcDir, 'tools', 'git', 'mass-rename.py')], cmd_options)
  },

  runGClient: (args, options = {}, gClientFile = config.gClientFile) => {
    if (config.gClientVerbose) {
      args.push('--verbose')
    }
    options.cwd = options.cwd || config.rootDir
    options = mergeWithDefault(options)
    options.env.GCLIENT_FILE = gClientFile
    util.run('gclient', args, options)
  },

  applyPatches: () => {
    return applyPatches()
  },

  buildArgsToString: (buildArgs) => {
    let args = ''
    for (let arg in buildArgs) {
      let val = buildArgs[arg]
      if (val !== null) {
        if (typeof val === 'string') {
          val = '"' + val + '"'
        } else {
          val = JSON.stringify(val)
        }
      }
      args += val ? arg + '=' + val + ' ' : arg + ' '
    }
    return args
  },

  walkSync: (dir, filter = null, filelist = []) => {
    fs.readdirSync(dir).forEach(file => {
      if (fs.statSync(path.join(dir, file)).isDirectory()) {
        filelist = util.walkSync(path.join(dir, file), filter, filelist)
      } else if (!filter || filter.call(null, file)) {
        filelist = filelist.concat(path.join(dir, file))
      }
    })
    return filelist
  },

  appendExeIfWin32: (input) => {
    if (process.platform === 'win32')
      input += '.exe'
    return input
  },

  readJSON: (file, default_value = undefined) => {
    if (!fs.existsSync(file)) {
      return default_value
    }
    return fs.readJSONSync(file)
  },

  writeJSON: (file, value) => {
    return fs.writeJSONSync(file, value, {spaces: 2})
  },

  getGitDir: (repoDir) => {
    const dotGitPath = path.join(repoDir, '.git')
    if (!fs.existsSync(dotGitPath)) {
      return null
    }
    if (fs.statSync(dotGitPath).isDirectory()) {
      return dotGitPath
    }
    // Returns the actual .git dir in case a worktree is used.
    gitDir = util.runGit(repoDir, ['rev-parse', '--git-common-dir'], false)
    if (!path.isAbsolute(gitDir)) {
      return path.join(repoDir, gitDir)
    }
    return gitDir
  },

  getGitInfoExcludeFileName: (repoDir, create) => {
    const gitDir = util.getGitDir(repoDir)
    if (!gitDir) {
      assert(!create, `Can't create git exclude, .git not found in: ${repoDir}`)
      return null
    }
    const gitInfoDir = path.join(gitDir, 'info')
    const excludeFileName = path.join(gitInfoDir, 'exclude')
    if (!fs.existsSync(excludeFileName)) {
      if (!create) {
        return null
      }
      if (!fs.existsSync(gitInfoDir)) {
        fs.mkdirSync(gitInfoDir)
      }
      fs.writeFileSync(excludeFileName, '')
    }
    return excludeFileName
  },

  isGitExclusionExists: (repoDir, exclusion) => {
    const excludeFileName = util.getGitInfoExcludeFileName(repoDir, false)
    if (!excludeFileName) {
      return false
    }
    const lines = fs.readFileSync(excludeFileName).toString().split(/\r?\n/)
    for (const line of lines) {
      if (line === exclusion) {
        return true
      }
    }
    return false
  },

  addGitExclusion: (repoDir, exclusion) => {
    if (util.isGitExclusionExists(repoDir, exclusion)) {
      return
    }
    const excludeFileName = util.getGitInfoExcludeFileName(repoDir, true)
    fs.appendFileSync(excludeFileName, '\n' + exclusion)
  },
}

module.exports = util
