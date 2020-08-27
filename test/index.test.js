const assert = require('assert').strict;
const sinon = require('sinon');
const nock = require('nock');
const url = require('url');

const index = require('../lib/index');
const utility = require('../lib/utility');

describe('lib/index', () => {

  const TEST_CTX = {
    filePath: '/PATH/TO/FILE',
    fileName: 'FILE',
    fileHandle: 'FD',
    fileSize: 12345,
    fileModifiedTime: 1577930645678,
    fileChecksum: 'FILE_CHECKSUM',
    metadataChecksum: '95ceb84069b68b06b5d7820ef537d22a',
    metadataCompressed: "H4sIAAAAAAAACl1QW0vDMBh9F/wP4Xu3cbqCSNIhs8PhhIHbc4jp1y2sudCk3n69bbfasbfk3L7DYbNvU5FPrIN2lsMkuQWCVrlC2x2H7WZx8wCz7PqKeakOcoekldvAYR+jf6RUel9hopyhOjYWA9XGuzpiDWNmcGX8kjWmyRTaJELYgAgZAsZA+hShCw5P6/UqF8tn6DDhKxlLVxsO2oWjt3X3JhJ/PHL4aGxR4UC1ZCGjFKWu8B/q7ulfzCZ399OU0f59xnVaYaXBbLFc5YyO/zOR2qM6hMacrpoihV4u5i/5/PV9+8boIBmr0MsujPbVjxvQixG6jelp5OwPNMlY5pYBAAA=",
    metadataSize: 406,
    appleId: 'APPLE_ID',
    bundleId: 'BUNDLE_ID',
    bundleVersion: 'BUNDLE_VERSION',
    bundleShortVersion: 'BUNDLE_SHORT_VERSION',
    sessionId: 'SESSION_ID',
    sharedSecret: 'SECRET',
    appName: 'APP_NAME',
    appIconUrl: 'ICON_URL',
    packageName: 'PACKAGE_NAME'
  }

  describe('constructError()', () => {
    it('should return a formated error', () => {
      let err = index.constructError("MESSAGE", { ErrorMessage: 'RESPONSE_ERROR' });
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'MESSAGE\nRESPONSE_ERROR');
    });
  });

  describe('generateMetadata()', () => {

    before(() => {
      sinon.stub(utility, 'getFileStats').withArgs(TEST_CTX.fileHandle).resolves({
        size: TEST_CTX.fileSize,
        mtimeMs: TEST_CTX.fileModifiedTime + 0.1
      });
      sinon.stub(utility, 'getFileMD5').withArgs(TEST_CTX.fileHandle).resolves(TEST_CTX.fileChecksum);
    });

    after(() => {
      sinon.restore();
    });

    it('should correctly format ID based on current time', async () => {
      const METADATA_INPUT = {
        fileHandle: TEST_CTX.fileHandle,
        filePath: TEST_CTX.filePath,
        appleId: TEST_CTX.appleId
      };
      const ctx = Object.assign({}, METADATA_INPUT);
      await index.generateMetadata(ctx);
      const EXPECTED_METADATA = {
        fileName: TEST_CTX.fileName,
        fileSize: TEST_CTX.fileSize,
        fileModifiedTime: TEST_CTX.fileModifiedTime,
        fileChecksum: TEST_CTX.fileChecksum,
        metadataBuffer: sinon.match.instanceOf(Buffer),
        metadataChecksum: sinon.match.string,
        metadataCompressed: sinon.match.string,
        metadataSize: sinon.match.number
      };
      sinon.assert.match(ctx, Object.assign({}, METADATA_INPUT, EXPECTED_METADATA));
    });

  });

  describe('makeSoftwareServiceRequest()', () => {

    before(() => {

      const serviceUrl = new url.URL(index.SOFTWARE_SERVICE_URL);

      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'test',
          id: sinon.match.string,
          params: {}
        }).test(body))
        .reply(200, { result: { Success: true } });

    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      let res = await index.makeSoftwareServiceRequest({ sessionId: TEST_CTX.sessionId, sharedSecret: TEST_CTX.sharedSecret }, 'test', {});
      sinon.assert.match(res, { Success: true });
    });

  });

  describe('makeProducerServiceRequest()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'test',
          id: sinon.match.string,
          params: {}
        }).test(body))
        .reply(200, { result: { Success: true } });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      let res = await index.makeProducerServiceRequest({ sessionId: TEST_CTX.sessionId, sharedSecret: TEST_CTX.sharedSecret }, 'test', {});
      sinon.assert.match(res, { Success: true });
    });

  });

  describe('authenticateForSession()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'authenticateForSession',
          id: sinon.match.string,
          params: { Username: TEST_CTX.username, Password: TEST_CTX.password }
        }).test(body))
        .reply(200, { result: { SessionId: TEST_CTX.sessionId, SharedSecret: TEST_CTX.sharedSecret } });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, { result: { Success: false } });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = {
        username: TEST_CTX.username,
        password: TEST_CTX.password
      };
      await index.authenticateForSession(ctx);
      sinon.assert.match(ctx, { sessionId: TEST_CTX.sessionId, sharedSecret: TEST_CTX.sharedSecret });
    });

    it('should reject on failure', async () => {
      const ctx = {
        username: TEST_CTX.username,
        password: 'WRONG_PASSWORD'
      };
      await assert.rejects(index.authenticateForSession(ctx));
    });

  });

  describe('lookupSoftwareForBundleId()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.SOFTWARE_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'lookupSoftwareForBundleId',
          id: sinon.match.string,
          params: {
            Application: 'altool',
            ApplicationBundleId: 'com.apple.itunes.altool',
            BundleId: TEST_CTX.bundleId,
            Version: '4.0.1 (1182)'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true,
            Attributes: [{ AppleID: TEST_CTX.appleId, Application: TEST_CTX.appName, IconURL: TEST_CTX.appIconUrl }]
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = {
        bundleId: TEST_CTX.bundleId
      };
      await index.lookupSoftwareForBundleId(ctx);
      sinon.assert.match(ctx, { appleId: TEST_CTX.appleId, appName: TEST_CTX.appName, appIconUrl: TEST_CTX.appIconUrl });
    });

    it('should reject on failure', async () => {
      const ctx = {
        bundleId: 'WRONG_BUNDLE_ID'
      };
      await assert.rejects(index.lookupSoftwareForBundleId(ctx));
    });

  });

  describe('validateMetadata()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'validateMetadata',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            Files: [
              TEST_CTX.fileName,
              'metadata.xml'
            ],
            iTMSTransporterMode: 'upload',
            MetadataChecksum: TEST_CTX.metadataChecksum,
            MetadataCompressed: TEST_CTX.metadataCompressed,
            MetadataInfo: {
              app_platform: 'ios',
              apple_id: TEST_CTX.appleId,
              asset_types: [
                'bundle'
              ],
              bundle_identifier: TEST_CTX.bundleId,
              bundle_short_version_string: TEST_CTX.bundleShortVersion,
              bundle_version: TEST_CTX.bundleVersion,
              device_id: '',
              packageVersion: 'software5.4',
              primary_bundle_identifier: ''
            },
            PackageName: TEST_CTX.packageName,
            PackageSize: TEST_CTX.fileSize + TEST_CTX.metadataSize,
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.validateMetadata(ctx);
    });

    it('should reject on failure', async () => {
      const ctx = {
      };
      await assert.rejects(index.validateMetadata(ctx));
    });

  });

  describe('validateAssets()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'validateAssets',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            Files: [
              TEST_CTX.fileName,
              'metadata.xml'
            ],
            iTMSTransporterMode: 'upload',
            MetadataChecksum: TEST_CTX.metadataChecksum,
            MetadataCompressed: TEST_CTX.metadataCompressed,
            MetadataInfo: {
              app_platform: 'ios',
              apple_id: TEST_CTX.appleId,
              asset_types: [
                'bundle'
              ],
              bundle_identifier: TEST_CTX.bundleId,
              bundle_short_version_string: TEST_CTX.bundleShortVersion ,
              bundle_version: TEST_CTX.bundleVersion,
              device_id: '',
              packageVersion: 'software5.4',
              primary_bundle_identifier: ''
            },
            PackageName: TEST_CTX.packageName,
            PackageSize: TEST_CTX.fileSize + TEST_CTX.metadataSize,
            StreamingInfoList: [],
            Transport: 'HTTP',
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true,
            NewPackageName: 'NEW_PACKAGE_NAME'
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.validateAssets(ctx);
      sinon.assert.match(ctx, { packageName: 'NEW_PACKAGE_NAME' });
    });

    it('should reject on failure', async () => {
      const ctx = {
      };
      await assert.rejects(index.validateAssets(ctx));
    });

  });

  describe('clientChecksumCompleted()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'clientChecksumCompleted',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            iTMSTransporterMode: 'upload',
            NewPackageName: TEST_CTX.packageName,
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.clientChecksumCompleted(ctx);
    });

    it('should reject on failure', async () => {
      const ctx = {
      };
      await assert.rejects(index.clientChecksumCompleted(ctx));
    });

  });

  describe('createReservation()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'createReservation',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            fileDescriptions: [
              {
                checksum: TEST_CTX.metadataChecksum,
                checksumAlgorithm: 'MD5',
                contentType: 'application/xml',
                fileName: 'metadata.xml',
                fileSize: TEST_CTX.metadataSize
              },
              {
                checksum: TEST_CTX.fileChecksum,
                checksumAlgorithm: 'MD5',
                contentType: 'application/octet-stream',
                fileName: TEST_CTX.fileName,
                fileSize: TEST_CTX.fileSize,
                uti: 'com.apple.ipa'
              }
            ],
            iTMSTransporterMode: 'upload',
            NewPackageName: TEST_CTX.packageName,
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true,
            Reservations: []
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.createReservation(ctx);
    });

    it('should reject on failure', async () => {
      const ctx = {};
      await assert.rejects(index.createReservation(ctx));
    });

  });

  describe('executeOperation()', () => {

    const TEST_METADATA_OPERATION = {
      uri: 'https://example.com/fileupload/metadata',
      method: 'PUT',
      offset: 0,
      headers: {
        'Content-Type': 'application/xml'
      },
      length: TEST_CTX.metadataSize
    };

    const TEST_BINARY_OPERATION = {
      uri: 'https://example.com/fileupload/binary',
      method: 'PUT',
      offset: 10,
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      length: 20
    };

    before(() => {
      const metadataUrl = new url.URL(TEST_METADATA_OPERATION.uri);
      nock(metadataUrl.origin)
        .matchHeader('Content-Type', TEST_METADATA_OPERATION.headers['Content-Type'])
        .intercept(metadataUrl.pathname, TEST_METADATA_OPERATION.method, (body) => body.length === TEST_METADATA_OPERATION.length)
        .reply(200);

      sinon.stub(utility, 'getFilePart')
        .withArgs(TEST_CTX.fileHandle, TEST_BINARY_OPERATION.offset, TEST_BINARY_OPERATION.length)
        .resolves(Buffer.alloc(TEST_BINARY_OPERATION.length));

      const binaryUrl = new url.URL(TEST_BINARY_OPERATION.uri);
      nock(binaryUrl.origin)
        .matchHeader('Content-Type', TEST_BINARY_OPERATION.headers['Content-Type'])
        .intercept(binaryUrl.pathname, TEST_BINARY_OPERATION.method, (body) => body.length === TEST_BINARY_OPERATION.length)
        .reply(200);

      nock(binaryUrl.origin)
        .intercept(/.*/, TEST_BINARY_OPERATION.method)
        .reply(400);

    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request for metadata.xml', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      ctx.metadataBuffer = Buffer.alloc(ctx.metadataSize);
      await index.executeOperation({ ctx, reservation: { file: 'metadata.xml' }, operation: TEST_METADATA_OPERATION });
      sinon.assert.match(ctx, { bytesSent: TEST_METADATA_OPERATION.length });
    });

    it('should make the appropriate HTTP request for binary', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      await index.executeOperation({ ctx, reservation: { file: TEST_CTX.fileName }, operation: TEST_BINARY_OPERATION });
      sinon.assert.match(ctx, { bytesSent: TEST_BINARY_OPERATION.length });
    });

    it('should do nothing on unknown file', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      await index.executeOperation({ ctx, reservation: { file: 'unknown' }, operation: {} });
      sinon.assert.match(ctx, { bytesSent: 0 });
    });

    it('should reject on failure', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      ctx.metadataBuffer = Buffer.alloc(ctx.metadataSize);
      const wrongOperation = Object.assign({}, TEST_METADATA_OPERATION, { length: 0 })
      await assert.rejects(index.executeOperation({ ctx, reservation: { file: 'metadata.xml' }, operation: wrongOperation }));
    });

  });

  describe('commitReservation()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'commitReservation',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            iTMSTransporterMode: 'upload',
            NewPackageName: TEST_CTX.packageName,
            reservations: [
              'RESERVATION_ID'
            ],
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.commitReservation(ctx, { id: 'RESERVATION_ID' });
    });

    it('should reject on failure', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await assert.rejects(index.commitReservation(ctx, { id: 'WRONG_RESERVATION_ID' }));
    });

  });

  describe('uploadDoneWithArguments()', () => {

    before(() => {
      const serviceUrl = new url.URL(index.PRODUCER_SERVICE_URL);
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname, (body) => sinon.match({
          jsonrpc: '2.0',
          method: 'uploadDoneWithArguments',
          id: sinon.match.string,
          params: {
            Application: 'iTMSTransporter',
            BaseVersion: '2.0.0',
            FileSizeInfo: {
              [TEST_CTX.fileName]: TEST_CTX.fileSize,
              "metadata.xml": TEST_CTX.metadataSize
            },
            ClientChecksumInfo: [
              {
                CalculatedChecksum: TEST_CTX.fileChecksum,
                CalculationTime: 100,
                FileLastModified: TEST_CTX.fileModifiedTime,
                Filename: TEST_CTX.fileName,
                fileSize: TEST_CTX.fileSize
              }
            ],
            StatisticsArray: [],
            StreamingInfoList: [],
            iTMSTransporterMode: 'upload',
            PackagePathWithoutBase: null,
            NewPackageName: TEST_CTX.packageName,
            Transport: 'HTTP',
            TransferTime: TEST_CTX.transferTime,
            NumberBytesTransferred: TEST_CTX.fileSize + TEST_CTX.metadataSize,
            Username: TEST_CTX.username,
            Version: '2.0.0'
          }
        }).test(body))
        .reply(200, {
          result: {
            Success: true
          }
        });
      nock(serviceUrl.origin)
        .post(serviceUrl.pathname)
        .reply(200, {
          result: {
            Success: false
          }
        });
    });

    after(() => {
      sinon.restore();
    });

    it('should make the appropriate HTTP request', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.uploadDoneWithArguments(ctx);
    });

    it('should reject on failure', async () => {
      const ctx = {};
      await assert.rejects(index.uploadDoneWithArguments(ctx));
    });

  });

});