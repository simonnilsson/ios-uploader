import path from 'node:path';
import utility from './utility.js';

const SOFTWARE_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService';

const USER_AGENT = 'iTMSTransporter/4.3.0.4 (Windows 11; 10.0; amd64; Java 21.0.5) SmartClient/0.1.0';

const PROCESSING_STATE_ORDER = ['WAITING_FOR_UPLOAD', 'PROCESSING', 'FAILED', 'INVALID', 'VALID'];

/**
 * Construct error message using application error string and response object.
 * @param {string} message Application error message
 * @param {object|undefined} response Response object from remote request,
 * used to extract error message if any.
 * @returns {Error} An error that can be thrown.
 */
function constructError(message, response) {
  let errorMessage = message;
  if (response?.data?.ErrorMessage) {
    errorMessage += '\n' + response.data.ErrorMessage;
  }
  return new Error(errorMessage);
}

/**
 * Construct error message using application error string and response object.
 * @param {string} message Application error message
 * @param {object|undefined} response Response object from remote request,
 * used to extract error message if any.
 * @returns {Error} An error that can be thrown.
 */
async function constructDSError(message, response) {
  let errorMessage = message;
  if (response) {
    try {
      const body = await response.json();
      if (body?.errors?.[0]?.detail) {
        errorMessage += '\n' + body.errors[0].detail;
      }
    }
    catch {
      // ignore JSON parsing errors
    }
  }
  return new Error(errorMessage);
}

/**
 * Generate and prepare asset description metadata for app submission.
 * @param {object} ctx The upload context object containing file and bundle information.
 * @returns {Promise<void>}
 */
async function generateAssetDescription(ctx) {
  const fileStats = await utility.getFileStats(ctx.fileHandle);
  ctx.fileName = path.basename(ctx.filePath).replace(/[: ]/g, '_');
  ctx.fileChecksum = await utility.getFileMD5(ctx.fileHandle);
  ctx.fileSize = fileStats.size;

  const appStoreInfoData = {
    'product-metadata': {
      'archive-bytes': ctx.fileSize,
      'file-name': ctx.fileName,
      packages: [{
        bundles: [{
          CFBundleShortVersionString: ctx.bundleShortVersion,
          CFBundleVersion: ctx.bundleVersion,
          'bundle-identifier': ctx.bundleId,
          'bundle-path': path.basename(path.dirname(ctx.infoPlist.fileName)),
          bundles: [],
          icons: [],
          'platform-display-name': 'iOS App',
          'platform-id': 1,
        }],
        files: [{
          'file-size': ctx.mobileProvision.data.length,
          'file-type': 'NSFileTypeRegular',
          'file-data': ctx.mobileProvision.data.toString('base64'),
          uti: 'com.apple.mobileprovision',
          path: path.posix.relative('Payload', ctx.mobileProvision.fileName),
        }],
      }],
    },
  };

  ctx.assetDescription = utility.makeBinaryPlist(appStoreInfoData);
  ctx.assetDescriptionSize = ctx.assetDescription.length;
  ctx.assetDescriptionChecksum = utility.getMD5HashString(ctx.assetDescription);
}

/**
 * Make a request to Apple's Software Service endpoint.
 * @param {object} ctx The upload context object containing session information.
 * @param {string} method The JSON-RPC method name.
 * @param {object} params The JSON-RPC method parameters.
 * @returns {Promise<object>} Response status, data and headers from the service.
 */
async function makeSoftwareServiceRequest(ctx, method, params) {
  const requestId = utility.generateIDString();

  const request = {
    jsonrpc: '2.0',
    method,
    id: requestId,
    params,
  };

  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify(request);

  if (ctx.sessionId) {
    const jsonChecksum = utility.getMD5HashBuffer(body);
    headers['x-request-id'] = requestId;
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret);
    headers['x-session-id'] = ctx.sessionId;
    headers['x-session-version'] = '2';
  }

  const res = await fetch(SOFTWARE_SERVICE_URL, {
    method: 'POST',
    headers,
    body,
  });

  return { status: res.status, data: (await res.json()).result, headers: res.headers };
}

/**
 * Make a request to Apple's Content Delivery Service provider endpoint.
 * @param {object} ctx The upload context object containing delivery token information.
 * @param {string} method The HTTP method (GET, POST, PATCH, etc.).
 * @param {string} path The API path relative to the provider endpoint.
 * @param {object} [data] Optional request body data.
 * @returns {Promise<Response>} The fetch response object.
 */
async function makeContentDeliveryServiceProviderRequest(ctx, method, path, data) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    Cookie: `${ctx.dsTokenName}=${ctx.dsToken}`,
  };

  const body = data ? JSON.stringify({ data }) : undefined;

  return fetch(`https://contentdelivery.itunes.apple.com/MZContentDeliveryService/iris/provider/${ctx.providerPublicId}/v1/${path}`, {
    method,
    headers,
    body,
  });
}

/**
 * Authenticate user credentials and establish a session.
 * @param {object} ctx The upload context object to populate with session credentials.
 * @returns {Promise<void>}
 * @throws {Error} If authentication fails.
 */
async function authenticateForSession(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'authenticateForSession', {
    Username: ctx.username,
    Password: ctx.password,
  });

  if (res.data.SessionId && res.data.SharedSecret) {
    ctx.sessionId = res.data.SessionId;
    ctx.sharedSecret = res.data.SharedSecret;
  }
  else {
    throw constructError('Authentication failed!', res);
  }
}

/**
 * Generate an Apple Connect token for Content Delivery Service access.
 * @param {object} ctx The upload context object to populate with delivery token information.
 * @returns {Promise<void>}
 * @throws {Error} If token generation fails.
 */
async function generateAppleConnectToken(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'generateAppleConnectToken', {
    Username: ctx.username,
    Password: ctx.password,
  });

  if (res.data.DSToken && res.data.DSTokenCookieName) {
    ctx.dsToken = res.data.DSToken;
    ctx.dsTokenName = res.data.DSTokenCookieName;
  }
  else {
    throw constructError('Authentication failed!', res);
  }
}

/**
 * Look up application information for a given bundle ID.
 * @param {object} ctx The upload context object to populate with app information.
 * @returns {Promise<void>}
 * @throws {Error} If application lookup fails.
 */
async function lookupSoftwareForBundleId(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'lookupSoftwareForBundleId', {
    BundleId: ctx.bundleId,
  });

  if (!res.data.Success || res.data.Attributes.length < 1) {
    throw constructError('Application lookup failed!', res);
  }

  ctx.providerPublicId = res.data.ProviderPublicId;
  ctx.appleId = res.data.Attributes[0].AppleID;
  ctx.appName = res.data.Attributes[0].Application;
  ctx.appIconUrl = res.data.Attributes[0].IconURL;
}

/**
 * Check for existing builds matching the bundle version.
 * @param {object} ctx The upload context object containing app and version information.
 * @returns {Promise<void>}
 * @throws {Error} If a build with the same version is already uploaded or if lookup fails.
 */
async function checkBuilds(ctx) {
  const params = new URLSearchParams();
  params.append('filter[app]', ctx.appleId);
  params.append('filter[version]', ctx.bundleVersion);

  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'GET', `builds?${params}`);
  let currentStateIndex = -1;

  if (res.status === 200) {
    const { data } = await res.json();
    for (const build of data) {
      const stateIndex = PROCESSING_STATE_ORDER.indexOf(build.attributes.processingState ?? 'WAITING_FOR_UPLOAD');
      if (stateIndex > currentStateIndex) {
        currentStateIndex = stateIndex;
        ctx.currentBuild = build;
      }
    }
  }
  else {
    throw await constructDSError('Failed to lookup existing build!', res);
  }
}

/**
 * Register a new build for the application.
 * @param {object} ctx The upload context object containing app and version information.
 * @returns {Promise<void>}
 * @throws {Error} If build registration fails.
 */
async function registerBuild(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'builds', {
    attributes: {
      cfBundleShortVersionString: ctx.bundleShortVersion,
      cfBundleVersion: ctx.bundleVersion,
      platform: 'IOS',
    },
    relationships: {
      app: {
        data: {
          id: ctx.appleId,
          type: 'apps',
        },
      },
    },
    type: 'builds',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.currentBuild = data;
  }
  else {
    throw await constructDSError('Build registration failed!', res);
  }
}

/**
 * Retrieve the current processing state of a build.
 * @param {object} ctx The upload context object containing build ID.
 * @returns {Promise<string>} The processing state of the build.
 * @throws {Error} If retrieval fails.
 */
async function getBuildStatus(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'GET', `builds/${ctx.currentBuild.id}`);

  if (res.status === 200) {
    const { data } = await res.json();
    return data.attributes.processingState;
  }
  else {
    throw await constructDSError('Failed to get build status!', res);
  }
}

/**
 * Register the asset description file (AppStoreInfo.plist) for delivery.
 * @param {object} ctx The upload context object containing asset description and build information.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails.
 */
async function registerAssetDescriptionDeliveryFile(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'buildDeliveryFiles', {
    attributes: {
      assetType: 'ASSET_DESCRIPTION',
      fileName: 'AppStoreInfo.plist',
      fileSize: ctx.assetDescriptionSize,
      sourceFileChecksum: ctx.assetDescriptionChecksum,
      uti: 'com.apple.binary-property-list',
    },
    relationships: {
      build: {
        data: {
          id: ctx.currentBuild.id,
          type: 'builds',
        },
      },
    },
    type: 'buildDeliveryFiles',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.assetDescriptionDeliveryId = data.id;
    ctx.assetDescriptionUploadOperations = data.attributes.uploadOperations;
  }
  else {
    throw await constructDSError('Failed to register asset description delivery file!', res);
  }
}

/**
 * Register the IPA file for delivery.
 * @param {object} ctx The upload context object containing file and build information.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails.
 */
async function registerAssetDeliveryFile(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'buildDeliveryFiles', {
    attributes: {
      assetType: 'ASSET',
      fileName: ctx.fileName,
      fileSize: ctx.fileSize,
      sourceFileChecksum: ctx.fileChecksum,
      uti: 'com.apple.ipa',
    },
    relationships: {
      build: {
        data: {
          id: ctx.currentBuild.id,
          type: 'builds',
        },
      },
    },
    type: 'buildDeliveryFiles',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.assetDeliveryId = data.id;
    ctx.assetUploadOperations = data.attributes.uploadOperations;
  }
  else {
    throw await constructDSError('Failed to register asset delivery file!', res);
  }
}

/**
 * Mark a delivery file upload as completed.
 * @param {object} ctx The upload context object containing delivery token information.
 * @param {string} deliveryId The delivery file ID to mark as uploaded.
 * @returns {Promise<void>}
 * @throws {Error} If the request fails.
 */
async function uploadCompleted(ctx, deliveryId) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'PATCH', `buildDeliveryFiles/${deliveryId}`, {
    attributes: {
      uploaded: true,
    },
    id: deliveryId,
    type: 'buildDeliveryFiles',
  });

  if (res.status !== 200) {
    throw await constructDSError('Failed to mark upload completed!', res);
  }
}

/**
 * Execute a single upload operation for a file chunk.
 * @param {object} options Upload operation parameters.
 * @param {object} options.ctx The upload context object.
 * @param {string} options.assetType The type of asset being uploaded ('ASSET_DESCRIPTION' or 'ASSET').
 * @param {object} options.operation The upload operation details including URL, method, offset, and length.
 * @returns {Promise<void>}
 * @throws {Error} If the upload operation fails.
 */
async function executeOperation({ ctx, assetType, operation }) {
  let data;

  if (assetType === 'ASSET_DESCRIPTION') {
    data = ctx.assetDescription.slice(operation.offset, operation.offset + operation.length);
  }
  else if (assetType === 'ASSET') {
    data = await utility.getFilePart(ctx.fileHandle, operation.offset, operation.length);
  }
  else {
    // Unknown file
    return;
  }

  try {
    const res = await fetch(operation.url, {
      method: operation.method,
      headers: {
        'User-Agent': USER_AGENT,
        ...operation.requestHeaders.reduce((obj, { name, value }) => ({ ...obj, [name]: value }), {}),
      },
      body: data,
    });

    if (res.status != 200) {
      throw new Error('Upload failed! (' + res.status + ')');
    }
  }
  catch (err) {
    throw new Error('Upload failed!\n' + err.message, { cause: err });
  }

  ctx.bytesSent += operation.length;
}

export default {
  SOFTWARE_SERVICE_URL,
  constructError,
  constructDSError,
  generateAssetDescription,
  makeSoftwareServiceRequest,
  authenticateForSession,
  generateAppleConnectToken,
  lookupSoftwareForBundleId,
  checkBuilds,
  registerBuild,
  registerAssetDescriptionDeliveryFile,
  registerAssetDeliveryFile,
  uploadCompleted,
  getBuildStatus,
  executeOperation,
};
