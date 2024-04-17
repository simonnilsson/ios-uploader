const axios = require('axios');
const path = require('path');

const utility = require('./utility');

const SOFTWARE_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService';
const PRODUCER_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesProducerService';
const USER_AGENT = 'iTMSTransporter/2.0.0';

const MAX_BODY_LENGTH = 1024 ** 3;

/**
 * Construct error message using application error string and response object.
 * @param {String} message Application error message
 * @param {Object|undefined} response Response object from remote request, 
 * used to extract error message if any.
 * @returns {Error} An error that can be thrown.
 */
function constructError(message, response) {
  let errorMessage = message;
  if (response && response.ErrorMessage) {
    errorMessage += '\n' + response.ErrorMessage;
  }
  return new Error(errorMessage);
}

async function generateMetadata(ctx) {

  let metaText = await utility.readFile(path.join(__dirname, '../assets/metadata_template.xml'));

  const fileStats = await utility.getFileStats(ctx.fileHandle);
  ctx.fileName = path.basename(ctx.filePath).replace(/[: ]/g, '_');
  ctx.fileChecksum = await utility.getFileMD5(ctx.fileHandle);
  ctx.fileSize = fileStats.size;
  ctx.fileModifiedTime = Math.round(fileStats.mtimeMs);

  metaText = metaText
    .replace('APPLE_ID', ctx.appleId)
    .replace('BUNDLE_SHORT_VERSION', ctx.bundleShortVersion)
    .replace('BUNDLE_VERSION', ctx.bundleVersion)
    .replace('BUNDLE_IDENTIFIER', ctx.bundleId)
    .replace('FILE_SIZE', ctx.fileSize)
    .replace('FILE_NAME', ctx.fileName)
    .replace('MD5', ctx.fileChecksum);

  ctx.metadataSize = metaText.length;
  ctx.metadataChecksum = utility.getStringMD5(metaText);
  ctx.metadataBuffer = Buffer.from(metaText, 'utf-8');
  ctx.metadataCompressed = await utility.bufferToGZBase64(ctx.metadataBuffer);
}

async function makeSoftwareServiceRequest(ctx, method, params) {
  const requestId = utility.generateIDString();

  const request = {
    jsonrpc: "2.0",
    method,
    id: requestId,
    params
  };

  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json'
  };

  const json = JSON.stringify(request);
  const jsonChecksum = utility.getStringMD5Buffer(json);

  if (ctx.sessionId) {
    headers['x-request-id'] = requestId;
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret);
    headers['x-session-id'] = ctx.sessionId;
    headers['x-session-version'] = '2';
  }

  let res = await axios.post(
    SOFTWARE_SERVICE_URL,
    json,
    { headers }
  );

  return res.data.result;
}

async function makeProducerServiceRequest(ctx, method, params) {
  const requestId = utility.generateIDString();

  const request = {
    jsonrpc: "2.0",
    method,
    id: requestId,
    params
  };

  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json'
  };

  const json = JSON.stringify(request);
  const jsonChecksum = utility.getStringMD5Buffer(json);

  if (ctx.sessionId) {
    headers['x-request-id'] = requestId;
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret);
    headers['x-session-id'] = ctx.sessionId;
    headers['x-session-version'] = '2';
  }

  let res = await axios.post(
    PRODUCER_SERVICE_URL,
    json,
    { headers }
  );

  return res.data.result;
}

async function authenticateForSession(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'authenticateForSession', {
    Username: ctx.username,
    Password: ctx.password
  });

  if (res.SessionId && res.SharedSecret) {
    ctx.sessionId = res.SessionId;
    ctx.sharedSecret = res.SharedSecret;
  }
  else {
    throw constructError('Authentication failed!', res);
  }
}

async function lookupSoftwareForBundleId(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'lookupSoftwareForBundleId', {
    Application: 'altool',
    ApplicationBundleId: 'com.apple.itunes.altool',
    BundleId: ctx.bundleId,
    Version: '4.0.1 (1182)'
  });

  if (!res.Success || res.Attributes.length < 1) {
    throw constructError('Application lookup failed!', res);
  }

  ctx.appleId = res.Attributes[0].AppleID;
  ctx.appName = res.Attributes[0].Application;
  ctx.appIconUrl = res.Attributes[0].IconURL;
}

async function validateMetadata(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'validateMetadata', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    Files: [
      ctx.fileName,
      'metadata.xml'
    ],
    iTMSTransporterMode: 'upload',
    MetadataChecksum: ctx.metadataChecksum,
    MetadataCompressed: ctx.metadataCompressed,
    MetadataInfo: {
      app_platform: 'ios',
      apple_id: ctx.appleId,
      asset_types: [
        'bundle'
      ],
      bundle_identifier: ctx.bundleId,
      bundle_short_version_string: ctx.bundleShortVersion,
      bundle_version: ctx.bundleVersion,
      device_id: '',
      packageVersion: 'software5.4',
      primary_bundle_identifier: ''
    },
    PackageName: ctx.packageName,
    PackageSize: ctx.fileSize + ctx.metadataSize,
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Metadata validation failed!', res);
  }
}

async function validateAssets(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'validateAssets', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    AssetDescriptionsCompressed: [],
    Files: [
      ctx.fileName,
      'metadata.xml'
    ],
    iTMSTransporterMode: 'upload',
    MetadataChecksum: ctx.metadataChecksum,
    MetadataCompressed: ctx.metadataCompressed,
    MetadataInfo: {
      app_platform: 'ios',
      apple_id: ctx.appleId,
      asset_types: [
        'bundle'
      ],
      bundle_identifier: ctx.bundleId,
      bundle_short_version_string: ctx.bundleShortVersion,
      bundle_version: ctx.bundleVersion,
      device_id: '',
      packageVersion: 'software5.4',
      primary_bundle_identifier: ''
    },
    PackageName: ctx.packageName,
    PackageSize: ctx.fileSize + ctx.metadataSize,
    StreamingInfoList: [],
    Transport: 'HTTP',
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Asset validation failed!', res);
  }

  // validateAssets returns a new package name.
  ctx.packageName = res.NewPackageName;
}

async function clientChecksumCompleted(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'clientChecksumCompleted', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    iTMSTransporterMode: 'upload',
    NewPackageName: ctx.packageName,
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Client checksum failed!', res);
  }
}

async function createReservation(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'createReservation', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    fileDescriptions: [
      {
        checksum: ctx.metadataChecksum,
        checksumAlgorithm: 'MD5',
        contentType: 'application/xml',
        fileName: 'metadata.xml',
        fileSize: ctx.metadataSize
      },
      {
        checksum: ctx.fileChecksum,
        checksumAlgorithm: 'MD5',
        contentType: 'application/octet-stream',
        fileName: ctx.fileName,
        fileSize: ctx.fileSize,
        uti: 'com.apple.ipa'
      }
    ],
    iTMSTransporterMode: 'upload',
    NewPackageName: ctx.packageName,
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Create reservation failed!', res);
  }

  return res.Reservations;
}

async function executeOperation({ ctx, reservation, operation }) {

  let data;

  if (reservation.file === 'metadata.xml') {
    data = ctx.metadataBuffer.slice(operation.offset, operation.offset + operation.length);
  }
  else if (reservation.file === ctx.fileName) {
    data = await utility.getFilePart(ctx.fileHandle, operation.offset, operation.length);
  }
  else {
    // Unknown file
    return;
  }

  let res;

  try {
    res = await axios({
      url: operation.uri,
      method: operation.method,
      headers: Object.assign({
        'User-Agent': USER_AGENT,
      }, operation.headers),
      validateStatus: null,
      maxBodyLength: MAX_BODY_LENGTH,
      data
    });
  }
  catch (err) {
    throw new Error('Upload failed!\n' + err.message);
  }

  if (res.status != 200) {
    throw new Error('Upload failed! (' + res.status + ')');
  }

  ctx.bytesSent += operation.length;
}

async function commitReservation(ctx, reservation) {
  let res = await makeProducerServiceRequest(ctx, 'commitReservation', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    iTMSTransporterMode: 'upload',
    NewPackageName: ctx.packageName,
    reservations: [
      reservation.id
    ],
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Commit reservation failed!', res);
  }
}

async function uploadDoneWithArguments(ctx) {
  let res = await makeProducerServiceRequest(ctx, 'uploadDoneWithArguments', {
    Application: 'iTMSTransporter',
    BaseVersion: '2.0.0',
    FileSizeInfo: {
      [ctx.fileName]: ctx.fileSize,
      "metadata.xml": ctx.metadataSize
    },
    ClientChecksumInfo: [
      {
        CalculatedChecksum: ctx.fileChecksum,
        CalculationTime: 100,
        FileLastModified: ctx.fileModifiedTime,
        Filename: ctx.fileName,
        fileSize: ctx.fileSize
      }
    ],
    StatisticsArray: [],
    StreamingInfoList: [],
    iTMSTransporterMode: 'upload',
    PackagePathWithoutBase: null,
    NewPackageName: ctx.packageName,
    Transport: 'HTTP',
    TransferTime: ctx.transferTime,
    NumberBytesTransferred: ctx.fileSize + ctx.metadataSize,
    Username: ctx.username,
    Version: '2.0.0'
  });

  if (!res.Success) {
    throw constructError('Upload completion failed!', res);
  }
}

module.exports = {
  SOFTWARE_SERVICE_URL,
  PRODUCER_SERVICE_URL,
  constructError,
  generateMetadata,
  makeSoftwareServiceRequest,
  makeProducerServiceRequest,
  authenticateForSession,
  lookupSoftwareForBundleId,
  validateMetadata,
  validateAssets,
  clientChecksumCompleted,
  createReservation,
  executeOperation,
  commitReservation,
  uploadDoneWithArguments
};
