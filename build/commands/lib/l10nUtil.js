/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * This file manages the following:
 * - Lists of files needed to be translated (Which is all top level GRD and JSON files)
 * - All mappings for auto-generated Herond files from the associated Chromium files.
 * - Top level global string replacements, such as replacing Chromium with Herond
 */

const path = require('path')
const fs = require('fs')
const chalk = require('chalk')
const { JSDOM } = require("jsdom")
const config = require('./config')

// Change to `true` for verbose console log output of GRD traversal
const verboseLogFindGrd = false
const srcDir = config.srcDir

// chromium_strings.grd and any of its parts files that we track localization for in transifex
// These map to herond/app/resources/chromium_strings*.xtb
const chromiumStringsPath = path.resolve(path.join(srcDir, 'chrome', 'app', 'chromium_strings.grd'))
const herondStringsPath = path.resolve(path.join(srcDir, 'brave', 'app', 'brave_strings.grd'))
const chromiumSettingsPartPath = path.resolve(path.join(srcDir, 'chrome', 'app', 'settings_chromium_strings.grdp'))
const herondSettingsPartPath = path.resolve(path.join(srcDir, 'brave', 'app', 'settings_brave_strings.grdp'))

//Replace android strings.
const androidChromeStringsPath = path.resolve(path.join(srcDir, 'chrome', 'browser', 'ui', 'android', 'strings', 'android_chrome_strings.grd'))
const herondAndroidChromeStringsPath = path.resolve(path.join(srcDir, 'brave', 'browser', 'ui', 'android', 'strings', 'android_chrome_strings.grd'))

// component_chromium_strings.grd and any of its parts files that we track localization for in transifex
// These map to brave/app/strings/components_chromium_strings*.xtb
const chromiumComponentsChromiumStringsPath = path.resolve(path.join(srcDir, 'components', 'components_chromium_strings.grd'))
const braveComponentsHerondStringsPath = path.resolve(path.join(srcDir, 'brave', 'components', 'components_brave_strings.grd'))

// components/component_strings.grd and any of its parts files that we track localization for in transifex
// These map to brave/components/component_strings*.xtb
const chromiumComponentsStringsPath = path.resolve(path.join(srcDir, 'components', 'components_strings.grd'))
const herondComponentsStringsPath = path.resolve(path.join(srcDir, 'brave', 'components', 'components_strings.grd'))

// generated_resources.grd and any of its parts files that we track localization for in transifex
// There is also chromeos_strings.grdp, but we don't need to track it here because it is explicitly skipped in transifex.py
// These map to brave/app/resources/generated_resoruces*.xtb
const chromiumGeneratedResourcesPath = path.resolve(path.join(srcDir, 'chrome', 'app', 'generated_resources.grd'))
const herondGeneratedResourcesPath = path.resolve(path.join(srcDir, 'brave', 'app', 'generated_resources.grd'))
const chromiumGeneratedResourcesExcludes = new Set(["chromeos_strings.grdp"])

// The following are not generated files but still need to be tracked so they get sent to transifex
// These xtb files don't need to be copied anywhere.
// brave_generated_resources.grd maps to brave/app/resources/brave_generated_resources*.xtb,
// brave_components_strings.grd maps to brave/components/resources/strings/brave_components_resources*.xtb
// messages.json localization is handled inside of brave-extension.
const herondSpecificGeneratedResourcesPath = path.resolve(path.join(srcDir, 'brave', 'app', 'brave_generated_resources.grd'))
const herondResourcesComponentsStringsPath = path.resolve(path.join(srcDir, 'brave', 'components', 'resources', 'brave_components_strings.grd'))
const herondExtensionMessagesPath = path.resolve(path.join(srcDir, 'brave', 'components', 'brave_extension', 'extension', 'brave_extension', '_locales', 'en_US', 'messages.json'))
const herondAndroidHerondStringsPath = path.resolve(path.join(srcDir, 'brave', 'browser', 'ui', 'android', 'strings', 'android_brave_strings.grd'))

// Helper function to find all grdp parts in a grd.
function getGrdPartsFromGrd(path) {
  const grd = new JSDOM(fs.readFileSync(path, 'utf8'))
  const partTags = grd.window.document.getElementsByTagName("part")
  let parts = new Array()
  for (const partTag of partTags) {
    parts.push(partTag.getAttribute('file'));
  }
  return parts
}

// Helper function to create a mapping for grd and all of its grdp parts.
function addGrd(chromiumPath, herondPath, exclude = new Set()) {
  if (verboseLogFindGrd)
    console.log("Adding mappings for GRD: " + chromiumPath)
  if (!fs.existsSync(chromiumPath)) {
    const err = new Error(`addGrd: Error. File not found at path "${chromiumPath}"`)
    console.error(err)
    throw err
  }
  let mapping = {}
  // Add grd parts before grd because chromium-rebase-l10n.py expects them to be
  // processed first.
  const grdps = getGrdPartsFromGrd(chromiumPath)
  if (grdps.length) {
    const chromiumDir = path.dirname(chromiumPath)
    const herondDir = path.dirname(herondPath)
    for (const grdp of grdps) {
      if (exclude.has(grdp)) {
        continue
      }
      const chromiumGrdpPath = path.resolve(path.join(chromiumDir, grdp))
      const herondGrdpPath = path.resolve(path.join(herondDir, grdp))
      // grdp files can have their own grdp parts too
      mapping = { ...mapping, ...addGrd(chromiumGrdpPath, herondGrdpPath, exclude) }
    }
    if (verboseLogFindGrd)
      console.log("  - Added " + (Object.keys(mapping).length - 1) + " GRDP.")
  }
  mapping[chromiumPath] = herondPath
  return mapping
}

// Helper functions that's, for a given pair of chromium to herond GRD mapping
// from the supplied map, determines which GRDP parts are no longer present in
// the chromium GRD file.
function getRemovedGRDParts(mapping) {
  let removedMap = new Map()
  for (const [sourcePath, destPath] of Object.entries(mapping)) {
    if (path.extname(destPath) === ".grd") {
      const herondGRDPs = getGrdPartsFromGrd(destPath)
      const chromiumGRDPs = getGrdPartsFromGrd(sourcePath)
      let removed = new Set()
      for (let i = 0; i < herondGRDPs.length; i++) {
        if (!chromiumGRDPs.includes(herondGRDPs[i])) {
          removed.add(herondGRDPs[i])
        }
      }
      if (removed.size) {
        removedMap.set(destPath, removed)
      }
    }
  }
  return removedMap
}

// Add all GRD mappings here.
function getAutoGeneratedGrdMappings() {
  if (typeof(getAutoGeneratedGrdMappings.mappings) === 'undefined') {
    console.log(chalk.italic('Recursing through GRD to find GRDP files...'))
    // Herond specific only grd and grdp files should NOT be added.
    // Using AddGrd will add GRD and all of its GRDPs.
    getAutoGeneratedGrdMappings.mappings = {
      ...addGrd(chromiumComponentsStringsPath, herondComponentsStringsPath),
      ...addGrd(chromiumGeneratedResourcesPath, herondGeneratedResourcesPath, chromiumGeneratedResourcesExcludes),
      ...addGrd(androidChromeStringsPath, herondAndroidChromeStringsPath)
    }
    console.log(chalk.italic('Done recursing through GRD to find GRDP files.'))
  }
  return getAutoGeneratedGrdMappings.mappings
}

function getChromiumToAutoGeneratedHerondMapping() {
  if (typeof(getChromiumToAutoGeneratedHerondMapping.mapping) === 'undefined') {
    // When adding new grd or grdp files, never add a grdp part path without a
    // parent grd path, but add the grd parts to the mapping before the parent
    // grd, becase chromium-rebase-l10n.py expects them to be processed first.
    // Group them with a leading and trailing newline to keep this file organized.
    // The first 3 are added explicitly because we change the file names.
    getChromiumToAutoGeneratedHerondMapping.mapping = {
      [chromiumSettingsPartPath]: herondSettingsPartPath,
      [chromiumStringsPath]: herondStringsPath,

      [chromiumComponentsChromiumStringsPath]: braveComponentsHerondStringsPath,

      ...getAutoGeneratedGrdMappings()
    }
  }
  return getChromiumToAutoGeneratedHerondMapping.mapping
}

const l10nUtil = {
  // Same as with chromiumToAutoGeneratedHerondMapping but maps in the opposite direction
  getAutoGeneratedHerondToChromiumMapping: () => {
    if (typeof(l10nUtil.getAutoGeneratedHerondToChromiumMapping.mapping) === 'undefined') {
      const chromiumToAutoGeneratedHerondMapping = getChromiumToAutoGeneratedHerondMapping()
      l10nUtil.getAutoGeneratedHerondToChromiumMapping.mapping = Object.keys(
        chromiumToAutoGeneratedHerondMapping).reduce((obj, key) => (
          { ...obj, [chromiumToAutoGeneratedHerondMapping[key]]: key }), {})
    }
    return l10nUtil.getAutoGeneratedHerondToChromiumMapping.mapping
  },

  // All paths which are generated
  getHerondAutoGeneratedPaths: () => {
    return Object.values(getChromiumToAutoGeneratedHerondMapping())
  },

  // All paths which are not generated
  getHerondNonGeneratedPaths: () => {
    if (typeof(l10nUtil.getHerondNonGeneratedPaths.paths) === 'undefined') {
      l10nUtil.getHerondNonGeneratedPaths.paths = [
        herondSpecificGeneratedResourcesPath,
        herondResourcesComponentsStringsPath,
        herondExtensionMessagesPath,
        herondAndroidHerondStringsPath
      ]
    }
    return l10nUtil.getHerondNonGeneratedPaths.paths
  },

  // Herond specific strings and Chromium mapped Herond strings will be here.
  // But you only need to add the Herond specific strings manually here.
  getAllHerondPaths: () => {
    return l10nUtil.getHerondNonGeneratedPaths().concat(l10nUtil.getHerondAutoGeneratedPaths())
  },

  // Get all GRD and JSON paths whether they are generatd or not
  // Push and pull scripts for l10n use this.
  // Transifex manages files per grd and not per grd or grdp.
  // This is because only 1 xtb is created per grd per locale even if it has multiple grdp files.
  getHerondTopLevelPaths: () => {
    return l10nUtil.getAllHerondPaths().filter((x) => ['grd', 'json'].includes(x.split('.').pop()))
  },

// Helper function to retrieve Greaselion script paths relative to the
// Herond paths.
//
// Greaselion.json consists of an array of Greaselion rules,
// specifying scripts to inject into given sites based on certain
// preconditions. If the rule contains a "messages" key, then the
// script contains user-visible strings that require translation. This
// helper function gathers those messages.json files for transmission
// to Transifex.
  getGreaselionScriptPaths: (extensionPath) => {
    let basePath = extensionPath
    if (!basePath) {
      basePath = '../../../brave-site-specific-scripts'
    }

    const jsonContent = fs.readFileSync(`${basePath}/Greaselion.json`, 'utf8')
    if (!jsonContent) {
      console.error('Missing Greaselion.json')
      return []
    }

    const greaselionRules = JSON.parse(jsonContent)
    if (!greaselionRules) {
      console.error('Malformed Greaselion.json')
      return []
    }

    let paths = []
    greaselionRules.forEach((rule) => {
      if (rule.messages) {
        paths.push(`${basePath}/${rule.messages}/en_US/messages.json`)
      }
    })

    return paths
  },

  // Helper function to pretty print removed GRDP file names.
  logRemovedGRDParts: (mapping) => {
    if (mapping.size) {
      console.log("\n**************************************************************************")
      console.log("The following GRDP files are no longer in the corresponding Chromium GRDs:\n")
      for (const [grd, grdps] of mapping.entries()) {
        console.log("  From " + grd + ":")
        for (const grdp of grdps) {
          console.log("    - " + grdp)
        }
      }
    }
  },

  // This simply reads Chromium files that are passed to it and replaces branding strings
  // with Herond specific branding strings.
  // Do not use this for filtering XML, instead use chromium-rebase-l10n.py.
  // Only add idempotent replacements here (i.e. don't append replace A with AX here)
  rebaseHerondStringFilesOnChromiumL10nFiles: async (path) => {
    const removedMap = getRemovedGRDParts(getAutoGeneratedGrdMappings())
    const ops = Object.entries(getChromiumToAutoGeneratedHerondMapping()).map(async ([sourcePath, destPath]) => {
      let contents = await new Promise(resolve => fs.readFile(sourcePath, 'utf8', (err, data) => resolve(data)))
      await new Promise(resolve => fs.writeFile(destPath, contents, 'utf8', resolve))
    })
    await Promise.all(ops)
    return removedMap
  },
}  // const l10nUtil

module.exports = l10nUtil
