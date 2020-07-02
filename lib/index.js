const axios = require('axios');
const path = require('path');

const utility = require('./utility');

const SOFTWARE_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService';
const PRODUCER_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesProducerService';
const USER_AGENT = 'iTMSTransporter/2.0.0';

async function generateMetadata(ctx) {

  let metaText = await utility.readFile(path.join(__dirname, '../assets/metadata_template.xml'));

  const fileStats = await utility.getFileStats(ctx.fileHandle);
  ctx.fileName = path.basename(ctx.filePath);
  ctx.fileChecksum = await utility.getFileMD5(ctx.fileHandle);
  ctx.fileSize = fileStats.size;
  ctx.fileModifiedTime = Math.round(fileStats.mtimeMs);

  metaText = metaText
    .replace('APPLE_ID', ctx.appleId)
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
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret),
      headers['x-session-id'] = ctx.sessionId,
      headers['x-session-version'] = '2'
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
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret),
      headers['x-session-id'] = ctx.sessionId,
      headers['x-session-version'] = '2'
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
    throw new Error('Authentication failed!');
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
    throw new Error('Failed to lookup Apple ID for bundle!');
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
      bundle_identifier: '',
      bundle_short_version_string: '',
      bundle_version: '',
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
    throw new Error('Metadata validation failed!');
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
      bundle_identifier: '',
      bundle_short_version_string: '',
      bundle_version: '',
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
    throw new Error('Asset validation failed!');
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
    throw new Error('Client checksum failed!');
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
    throw new Error('Create reservation failed!');
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

  let res = await axios({
    url: operation.uri,
    method: operation.method,
    headers: Object.assign({
      'User-Agent': USER_AGENT,
    }, operation.headers),
    validateStatus: false,
    data
  });

  if (res.status != 200) {
    throw new Error('Upload failed!')
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
    throw new Error('Commit reservation failed!');
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
    throw new Error('Upload completion failed!');
  }
}

module.exports = {
  SOFTWARE_SERVICE_URL,
  PRODUCER_SERVICE_URL,
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
