const fs = require('fs-extra')
const path = require('path')

const config = require('../lib/config')
const util = require('../lib/util')
const assert = require('assert')

const getTestBinary = (suite) => {
  return (process.platform === 'win32') ? `${suite}.exe` : suite
}

const getTestsToRun = (config, suite) => {
  let testsToRun = [suite]
  if (suite === 'brave_unit_tests') {
    if (config.targetOS !== 'android') {
      testsToRun.push('brave_installer_unittests')
    } else {
      testsToRun.push('bin/run_brave_public_test_apk')
    }
  }
  return testsToRun
}

// Returns a list of paths to files containing all the filters that would apply
// to the current test suite, as long as such files exist in the filesystem.
//
// For instance, for Windows 64-bit and assuming all the filters files exist
// in the filesystem, this method would return paths to the following files:
//   - unit-tests.filter              -> Base filters
//   - unit_tests-windows.filters:    -> Platform specific
//   - unit_tests-windows-x86.filters -> Platform & Architecture specific
const getApplicableFilters = (suite) => {
  let filterFilePaths = []

  let targetPlatform = process.platform
  if (targetPlatform === "win32") {
    targetPlatform = "windows"
  } else if (targetPlatform === "darwin") {
    targetPlatform = "macos"
  }

  let possibleFilters = [
    suite,
    [suite, targetPlatform].join('-'),
    [suite, targetPlatform, config.targetArch].join('-'),
  ]
  possibleFilters.forEach(filterName => {
    let filterFilePath = path.join(config.herondCoreDir, 'test', 'filters',  `${filterName}.filter`)
    if (fs.existsSync(filterFilePath))
      filterFilePaths.push(filterFilePath)
  });

  return filterFilePaths
}

const test = (passthroughArgs, suite, buildConfig = config.defaultBuildConfig, options = {}) => {
  buildTests(suite, buildConfig, options)
  runTests(passthroughArgs, suite, buildConfig, options)
}

const buildTests = (suite, buildConfig = config.defaultBuildConfig, options = {}) => {
  config.buildConfig = buildConfig
  config.update(options)

  let testSuites = [
    'brave_unit_tests',
    'brave_browser_tests',
    'brave_network_audit_tests',
  ]
  if (testSuites.includes(suite)) {
    config.buildTarget = 'brave/test:' + suite
  } else {
    config.buildTarget = suite
  }
  util.touchOverriddenFiles()
  util.buildTarget()
}

const runTests = (passthroughArgs, suite, buildConfig, options) => {
  config.buildConfig = buildConfig
  config.update(options)

  let herondArgs = [
    '--enable-logging=stderr'
  ]

  // Android doesn't support --v
  if (config.targetOS !== 'android') {
    herondArgs.push('--v=' + options.v)

    if (options.vmodule) {
      herondArgs.push('--vmodule=' + options.vmodule)
    }
  }

  if (options.filter) {
    herondArgs.push('--gtest_filter=' + options.filter)
  }

  if (options.run_disabled_tests) {
    herondArgs.push('--gtest_also_run_disabled_tests')
  }

  if (options.output) {
    herondArgs.push('--gtest_output=xml:' + options.output)
  }

  if (options.disable_herond_extension) {
    herondArgs.push('--disable-herond-extension')
  }

  if (options.single_process) {
    herondArgs.push('--single_process')
  }

  if (options.test_launcher_jobs) {
    herondArgs.push('--test-launcher-jobs=' + options.test_launcher_jobs)
  }

  herondArgs = herondArgs.concat(passthroughArgs)

  // Filter out upstream tests that are known to fail for Herond
  let upstreamTestSuites = [
    'unit_tests',
    'browser_tests',
  ]
  if (upstreamTestSuites.includes(suite)) {
    let filterFilePaths = getApplicableFilters(suite)
    if (filterFilePaths.length > 0)
      herondArgs.push(`--test-launcher-filter-file="${filterFilePaths.join(';')}"`)
  }

  if (config.targetOS === 'ios') {
    util.run(path.join(config.outputDir, "iossim"), [
      "-d", "\"iPhone 14 Pro\"",
      path.join(config.outputDir, `${suite}.app`),
      path.join(config.outputDir, `${suite}.app/PlugIns/${suite}_module.xctest`)
    ], config.defaultOptions)
  } else {
    // Run the tests
    getTestsToRun(config, suite).every((testSuite) => {
      if (options.output) {
        herondArgs.splice(herondArgs.indexOf('--gtest_output=xml:' + options.output), 1)
        herondArgs.push(`--gtest_output=xml:${testSuite}.xml`)
      }
      if (config.targetOS === 'android') {
        assert(
            config.targetArch === 'x86' || options.manual_android_test_device,
            'Only x86 build can be run automatically. For other builds please run test device manually and specify manual_android_test_device flag.')
      }
      if (config.targetOS === 'android' && !options.manual_android_test_device) {
        // Specify emulator to run tests on
        herondArgs.push(`--avd-config tools/android/avd/proto/generic_android28.textpb`)
      }
      let runOptions = config.defaultOptions
      if (options.output)
        // When test results are saved to a file, callers (such as CI) generate
        // and analyze test reports as a next step. These callers are typically
        // not interested in the exit code of running the tests, because they
        // get the information about test success or failure from the output
        // file. On the other hand, callers are interested in errors that
        // produce an exit code, such as test compilation failures. By ignoring
        // the test exit code here, we give callers a chance to distinguish test
        // failures (by looking at the output file) from compilation errors.
        runOptions.continueOnFail = true
      let prog = util.run(path.join(config.outputDir, getTestBinary(testSuite)), herondArgs, runOptions)
      // Don't run other tests if one has failed already, especially because
      // this would overwrite the --output file (if given).
      return prog.status === 0
    })
  }
}

module.exports = test
