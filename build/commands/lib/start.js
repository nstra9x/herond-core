const path = require('path')
const fs = require('fs-extra')
const ip = require('ip')
const URL = require('url').URL
const config = require('../lib/config')
const util = require('../lib/util')

const start = (passthroughArgs, buildConfig = config.defaultBuildConfig, options) => {
  config.buildConfig = buildConfig
  config.update(options)

  let herondArgs = [
    '--enable-logging',
    '--v=' + options.v,
  ]
  if (options.vmodule) {
    herondArgs.push('--vmodule=' + options.vmodule);
  }
  if (options.no_sandbox) {
    herondArgs.push('--no-sandbox')
  }
  if (options.disable_herond_extension) {
    herondArgs.push('--disable-herond-extension')
  }
  if (options.disable_herond_rewards_extension) {
    herondArgs.push('--disable-herond-rewards-extension')
  }
  if (options.disable_pdfjs_extension) {
    herondArgs.push('--disable-pdfjs-extension')
  }
  if (options.disable_webtorrent_extension) {
    herondArgs.push('--disable-webtorrent-extension')
  }
  if (options.ui_mode) {
    herondArgs.push(`--ui-mode=${options.ui_mode}`)
  }
  if (!options.enable_herond_update) {
    // This only has meaning with MacOS and official build.
    herondArgs.push('--disable-herond-update')
  }
  if (options.disable_doh) {
    herondArgs.push('--disable-doh')
  }
  if (options.single_process) {
    herondArgs.push('--single-process')
  }
  if (options.show_component_extensions) {
    herondArgs.push('--show-component-extension-options')
  }
  if (options.rewards) {
    herondArgs.push(`--rewards=${options.rewards}`)
  }
  if (options.herond_ads_testing) {
    herondArgs.push('--herond-ads-testing')
  }
  if (options.herond_ads_debug) {
    herondArgs.push('--herond-ads-debug')
  }
  if (options.herond_ads_production) {
    herondArgs.push('--herond-ads-production')
  }
  if (options.herond_ads_staging) {
    herondArgs.push('--herond-ads-staging')
  }
  herondArgs = herondArgs.concat(passthroughArgs)

  let user_data_dir
  if (options.user_data_dir_name) {
    if (process.platform === 'darwin') {
      user_data_dir = path.join(process.env.HOME, 'Library', 'Application\\ Support', 'HerondSoftware', options.user_data_dir_name)
    } else if (process.platform === 'win32') {
      user_data_dir = path.join(process.env.LocalAppData, 'HerondSoftware', options.user_data_dir_name)
    } else {
      user_data_dir = path.join(process.env.HOME, '.config', 'HerondSoftware', options.user_data_dir_name)
    }
    herondArgs.push('--user-data-dir=' + user_data_dir);
  }

  let cmdOptions = {
    stdio: 'inherit',
    timeout: undefined,
    continueOnFail: false,
    shell: process.platform === 'darwin' ? true : false,
    killSignal: 'SIGTERM'
  }

  let outputPath = options.output_path
  if (!outputPath) {
    outputPath = path.join(config.outputDir, 'herond')
    if (process.platform === 'win32') {
      outputPath = outputPath + '.exe'
    } else if (process.platform === 'darwin') {
      outputPath = fs.readFileSync(outputPath + '_helper').toString().trim()
    }
  }
  util.run(outputPath, herondArgs, cmdOptions)
}

module.exports = start
