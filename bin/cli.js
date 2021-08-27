#!/usr/bin/env node

const { queue } = require('async');
const { Command } = require('commander');
const cliProgress = require('cli-progress');
const package = require('../package');

const utility = require('../lib/utility');
const api = require('../lib/index');

const cli = new Command()
  .version(package.version, '-v, --version', 'output the current version and exit')
  .name(package.name)
  .usage('-u <username> -p <password> -f <file> [additional-options]')
  .helpOption('-h, --help', 'output this help message and exit')
  .requiredOption('-u, --username <string>', 'your Apple ID')
  .requiredOption('-p, --password <string>', 'app-specific password for your Apple ID')
  .requiredOption('-f, --file <string>', 'path to .ipa file for upload (local file, http:// or https:// URL)')
  .option('-c, --concurrency <number>', 'number of concurrent upload tasks to use', 4);

async function runUpload(ctx) {

  let exitCode = 0;

  const progressBar = new cliProgress.Bar({
    format: 'Uploading |{bar}| {percentage}% | {value}/{total} bytes | ETA: {eta}s | Speed: {speed}',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {

    // Handle URLs to ipa file.
    if (ctx.filePath.startsWith('ftp://') || ctx.filePath.startsWith('https://')) {
      ctx.originalFilePath = ctx.filePath;
      try {
        ctx.filePath = await utility.downloadTempFile(ctx.filePath);
      }
      catch (err) {
        throw new Error(`Could not download file: ${err.message}`)
      }
      ctx.usingTempFile = true;
    }

    // Open the application file for reading.
    ctx.fileHandle = await utility.openFile(ctx.filePath);

    // Bundle ID and version lookup.
    try {
      let extracted = await utility.extractBundleIdAndVersion(ctx.fileHandle);
      ctx.bundleId = extracted.bundleId;
      ctx.bundleVersion = extracted.bundleVersion;
      ctx.bundleShortVersion = extracted.bundleShortVersion;
      console.log(`Found Bundle ID "${ctx.bundleId}", Version ${ctx.bundleVersion} (${ctx.bundleShortVersion}).`);
    }
    catch (err) {
      console.error(err.message);
      throw new Error('Failed to extract Bundle ID and version, are you supplying a valid IPA-file?')
    }

    // Authenticate with Apple.
    await api.authenticateForSession(ctx);

    // Find "Apple ID" of application.
    await api.lookupSoftwareForBundleId(ctx);

    console.log(`Identified application as "${ctx.appName}" (${ctx.appleId}).`);

    // Generate metadata.
    await api.generateMetadata(ctx);

    // Validate metadata and assets.
    await api.validateMetadata(ctx);
    await api.validateAssets(ctx);
    await api.clientChecksumCompleted(ctx);

    // Make reservations for uploading.
    let reservations = await api.createReservation(ctx);

    // For time calculations.
    ctx.transferStartTime = Date.now();

    progressBar.start(ctx.metadataSize + ctx.fileSize, 0, { speed: ctx.speed });

    let q = queue(api.executeOperation, ctx.concurrency);

    // Start uploading.
    for (let reservation of reservations) {
      let tasks = reservation.operations.map(operation => ({ ctx, reservation, operation }));
      q.push(tasks, () => {
        ctx.speed = utility.formatSpeed(ctx.bytesSent, Date.now() - ctx.transferStartTime);
        progressBar.update(ctx.bytesSent, { speed: ctx.speed });
      });
      await Promise.race([q.drain(), q.error()]);
      await api.commitReservation(ctx, reservation);
    }

    // Calculate transfer time.
    ctx.transferTime = ctx.transferStartTime - Date.now();

    // Finish
    await api.uploadDoneWithArguments(ctx);

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
    }
    if (ctx.usingTempFile) {
      await utility.removeTempFile(ctx.filePath);
    }
  }

  process.exit(exitCode);
}

async function run() {

  // Parse command line params
  cli.parse(process.argv);

  const options = cli.opts();

  // Context variable keeping track of all the necessary information for upload procedure.
  const ctx = {
    username: options.username,
    password: options.password,
    filePath: options.file,
    concurrency: options.concurrency,
    packageName: 'app.itmsp',
    bytesSent: 0,
    speed: 'N/A'
  };

  await runUpload(ctx);
}

// Run only if called directly (e.g. not when tested)
if (require.main === module) {
  run();
}
