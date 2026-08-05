import { createRequire } from 'node:module';
import { queue } from 'async';
import { Command } from 'commander';
import cliProgress from 'cli-progress';
import prettyBytes from 'pretty-bytes';
import utility from '../lib/utility.js';
import api from '../lib/index.js';

const { version, name } = createRequire(import.meta.url)('../package.json');

const cli = new Command()
  .version(version, '-v, --version', 'output the current version and exit')
  .name(name)
  .usage('-u <username> -p <password> -f <file> [additional-options]')
  .helpOption('-h, --help', 'output this help message and exit')
  .requiredOption('-u, --username <string>', 'your Apple ID')
  .requiredOption('-p, --password <string>', 'app-specific password for your Apple ID')
  .requiredOption('-f, --file <string>', 'path to .ipa file for upload (local file or http(s):// URL)')
  .option('-c, --concurrency <number>', 'number of concurrent upload tasks to use', 4)
  .option('-s, --status', 'display upload status and exit');

const fileUrlRegex = /^https?:\/\//i;

/**
 * Formats a value for display in the progress bar.
 * @param {number} v The value to format.
 * @param {cliProgress.Options} options The options for formatting.
 * @param {cliProgress.ValueType} type The type of value (e.g. 'value', 'total', etc.).
 * @returns {string} The formatted value.
 */
function formatValue(v, options, type) {
  switch (type) {
    case 'value':
    case 'total':
      return prettyBytes(v);
    default:
      return v;
  }
}

/**
 * Runs the upload process.
 * @param {object} ctx The context object containing upload information.
 */
async function runUpload(ctx) {
  let exitCode = 0;

  const progressBar = new cliProgress.Bar({
    format: '{task} |{bar}| {percentage}% | {value} / {total} | {speed}',
    hideCursor: true,
    barsize: 20,
    formatValue,
  }, cliProgress.Presets.shades_classic);

  try {
    // Handle URLs to ipa file.
    if (fileUrlRegex.test(ctx.filePath)) {
      try {
        const transferStartTime = Date.now();
        let started = false;
        ctx.fileHandle = await utility.downloadTempFile(ctx.filePath, (current, total) => {
          let { speed, eta } = utility.formatSpeedAndEta(current, total, Date.now() - transferStartTime);
          !started
            ? progressBar.start(total, current, { task: 'Downloading', speed, etas: eta })
            : progressBar.update(current, { speed, etas: eta });
          started = true;
        });
        progressBar.stop();
      }
      catch (err) {
        throw new Error(`Could not download file: ${err.message}`, { cause: err });
      }
      ctx.usingTempFile = true;
    }
    else {
    // Open the application file for reading.
      try {
        ctx.fileHandle = await utility.openFile(ctx.filePath);
      }
      catch (err) {
        throw new Error(`Could not open file: ${err.message}`, { cause: err });
      }
    }

    // Bundle ID and version lookup.
    try {
      await utility.extractBundleIdAndVersion(ctx);
      console.log(`Found Bundle ID "${ctx.bundleId}", Version ${ctx.bundleVersion} (${ctx.bundleShortVersion}).`);
    }
    catch (err) {
      console.error(err.message);
      throw new Error('Failed to extract Bundle ID and version, are you supplying a valid IPA-file?', { cause: err });
    }

    // Authenticate with Apple.
    await api.authenticateForSession(ctx);
    await api.generateAppleConnectToken(ctx);

    // Find "Apple ID" of application.
    await api.lookupSoftwareForBundleId(ctx);

    console.log(`Identified application as "${ctx.appName}" (${ctx.appleId}).`);

    // Generate asset description.
    await api.generateAssetDescription(ctx);

    // Check for existing builds with the same version.
    await api.checkBuilds(ctx);

    if (ctx.currentBuild?.attributes.processingState) {
      if (ctx.status) {
        console.log(`Build version ${ctx.bundleVersion} is uploaded with state: ${ctx.currentBuild.attributes.processingState}`);
        return;
      }
      else {
        throw new Error(`A build with version ${ctx.bundleVersion} is already uploaded with state: ${ctx.currentBuild.attributes.processingState}.`);
      }
    }

    if (ctx.status) {
      console.log(`No existing upload with version ${ctx.bundleVersion} found.`);
      return;
    }

    // Register new build if not found.
    if (!ctx.currentBuild) {
      await api.registerBuild(ctx);
    }

    await api.registerAssetDescriptionDeliveryFile(ctx);
    await api.registerAssetDeliveryFile(ctx);

    // For time calculations.
    ctx.transferStartTime = Date.now();
    ctx.bytesSent = 0;

    progressBar.start(ctx.assetDescriptionSize + ctx.fileSize, 0, { task: 'Uploading', speed: 'N/A', etas: 'N/A' });

    // Upload asset description.
    let q = queue(api.executeOperation, ctx.concurrency);
    let tasks = ctx.assetDescriptionUploadOperations.map((operation) => ({ ctx, assetType: 'ASSET_DESCRIPTION', operation }));
    q.push(tasks, () => {
      let { speed, eta } = utility.formatSpeedAndEta(ctx.bytesSent, ctx.assetDescriptionSize + ctx.fileSize, Date.now() - ctx.transferStartTime);
      progressBar.update(ctx.bytesSent, { speed, etas: eta });
    });
    await Promise.race([q.drain(), q.error()]);
    await api.uploadCompleted(ctx, ctx.assetDescriptionDeliveryId);

    // Upload asset file.
    tasks = ctx.assetUploadOperations.map((operation) => ({ ctx, assetType: 'ASSET', operation }));
    q.push(tasks, () => {
      let { speed, eta } = utility.formatSpeedAndEta(ctx.bytesSent, ctx.assetDescriptionSize + ctx.fileSize, Date.now() - ctx.transferStartTime);
      progressBar.update(ctx.bytesSent, { speed, etas: eta });
    });
    await Promise.race([q.drain(), q.error()]);
    await api.uploadCompleted(ctx, ctx.assetDeliveryId);

    // Calculate transfer time.
    ctx.transferTime = ctx.transferStartTime - Date.now();

    // Finish
    progressBar.stop();
    console.log('The cookies are done.');
  }
  catch (err) {
    progressBar.stop();
    console.error(err.message);
    exitCode = 1;
  }
  finally {
    if (ctx.fileHandle) {
      await utility.closeFile(ctx.fileHandle);
      if (ctx.usingTempFile) {
        await utility.removeTempFile(ctx.fileHandle.path);
      }
    }
  }

  process.exit(exitCode);
}

/**
 * Main function to run the CLI application. Parses command line arguments, sets up context, and runs the upload process.
 */
export async function run() {
  // Parse command line params
  cli.parse(process.argv);

  const options = cli.opts();

  // Context variable keeping track of all the necessary information for upload procedure.
  const ctx = {
    username: options.username,
    password: options.password,
    filePath: options.file,
    concurrency: options.concurrency,
    status: options.status,
  };

  await runUpload(ctx);
}

/**
 * Handles graceful shutdown on receiving termination signals.
 * @param {number} signal The signal number.
 */
export function stop(signal) {
  // Fix to make sure cursor gets restored to visible state when exiting mid progress.
  process.stderr.write('\u001B[?25h');

  process.exit(128 + signal);
}
