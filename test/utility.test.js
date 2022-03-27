const assert = require('assert').strict;
const sinon = require('sinon');
const fs = require('fs');
const stream = require('stream');
const yauzl = require("yauzl");
const zlib = require('zlib');
const axios = require('axios');

const utility = require('../lib/utility');

const TEST_PLIST = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>BUNDLE_IDENTIFIER</string>
    <key>CFBundleVersion</key>
    <string>BUNDLE_VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>BUNDLE_SHORT_VERSION</string>
  </dict>
</plist>
`.trim();

const EMPTY_PLIST = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
  </dict>
</plist>
`.trim();

describe('lib/utility', () => {

  describe('generateIDString()', () => {

    let clock;

    before(() => {
      clock = sinon.useFakeTimers({
        now: new Date("2020-01-02T03:04:05.678Z"),
        shouldAdvanceTime: false,
      });
    });

    after(() => {
      clock.restore();
    });

    it('should correctly format ID based on current time', () => {
      assert.equal(utility.generateIDString(), '20200102030405-678');
    });

  });

  describe('makeSessionDigest()', () => {

    it('should generate a valid digest string', () => {
      assert.equal(utility.makeSessionDigest('SESSION-ID', 'REQUEST_CHECKSUM', 'REQUEST-ID', 'SECRET'), 'af7b0121fe12199cdb5d765b73bd7cb5');
    });

  });

  describe('openFile()', () => {

    before(() => {
      let stub = sinon.stub(fs, 'open')
      stub.withArgs('VALIDPATH').yields(undefined, 1);
      stub.withArgs('WRONGPATH').yields(new Error(), undefined);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve with file-descriptor on success', async () => {
      let fd = await utility.openFile('VALIDPATH');
      assert.equal(fd, 1);
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.openFile('WRONGPATH'));
    });

  });

  describe('closeFile()', () => {

    before(() => {
      let stub = sinon.stub(fs, 'close')
      stub.withArgs(1).yields(undefined);
      stub.withArgs(0).yields(new Error());
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      await utility.closeFile(1);
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.closeFile(0));
    });

  });

  
  describe('readFileDataFromZip()', () => {

    before(() => {

      let fromFdStub = sinon.stub(yauzl, 'fromFd')

      let zipFileOK = {
        on: () => {},
        openReadStream: () => {},
        readEntry: () => {}
      };

      let zipFileOKMock = sinon.mock(zipFileOK);
      let okEntry = { fileName: 'Payload/Test.app/Info.plist'};
      let okStream = new stream.Readable({
        read: function() {
          this.push(TEST_PLIST);
          this.push(null);
        }
      });
      zipFileOKMock.expects('readEntry').once().returns();
      zipFileOKMock.expects('openReadStream').withArgs(okEntry).yields(null, okStream);
      zipFileOKMock.expects('on').withArgs('entry').yields(okEntry);
      zipFileOKMock.expects('on').withArgs('error').returns();
      zipFileOKMock.expects('on').withArgs('end').returns();

      fromFdStub.withArgs(0, sinon.match.object)
        .yields(null, zipFileOK);

      let zipFileReadErr = {
        on: () => {},
        openReadStream: () => {},
        readEntry: () => {}
      };

      let zipFileReadErrMock = sinon.mock(zipFileReadErr);
      
      zipFileReadErrMock.expects('readEntry').once().returns();
      zipFileReadErrMock.expects('openReadStream').withArgs(okEntry).yields(new Error('STREAM_ERR'), null);
      zipFileReadErrMock.expects('on').withArgs('entry').yields(okEntry);
      zipFileReadErrMock.expects('on').withArgs('error').returns();
      zipFileReadErrMock.expects('on').withArgs('end').returns();

      fromFdStub.withArgs(1, sinon.match.object)
        .yields(null, zipFileReadErr);

      let zipFileWrong = {
        on: () => {},
        openReadStream: () => {},
        readEntry: () => {}
      };

      let zipFileWrongMock = sinon.mock(zipFileWrong);
      let wrongEntry = { fileName: 'Payload/Test.app/other.file'};
      zipFileWrongMock.expects('readEntry').once().returns();
      zipFileWrongMock.expects('openReadStream').never();
      zipFileWrongMock.expects('on').withArgs('entry').yields(wrongEntry);
      zipFileWrongMock.expects('on').withArgs('error').returns();
      zipFileWrongMock.expects('on').withArgs('end').yields();

      fromFdStub.withArgs(2, sinon.match.object)
        .yields(null, zipFileWrong);

      fromFdStub.withArgs(3, sinon.match.object)
        .yields(new Error('TEST_ERROR'), null);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let data = await utility.readFileDataFromZip(0, /^Payload\/[^/]*.app\/Info\.plist$/);
      sinon.assert.match(data, sinon.match.instanceOf(Buffer));
    });

    it('should throw if unable to open read stream', async () => {
      await assert.rejects(utility.readFileDataFromZip(1, /^Payload\/[^/]*.app\/Info\.plist$/), { message: 'STREAM_ERR' });
    });

    it('should resolve to null if not found', async () => {
      let data = await utility.readFileDataFromZip(2, /^Payload\/[^/]*.app\/Info\.plist$/);
      sinon.assert.match(data, null);
    });

    it('should throw if unable to read file', async () => {
      await assert.rejects(utility.readFileDataFromZip(3, /^Payload\/[^/]*.app\/Info\.plist$/), { message: 'TEST_ERROR' });
    });
  });

  describe('extractBundleIdAndVersion()', () => {

    before(() => {

      let readFileDataFromZipStub = sinon.stub(utility, 'readFileDataFromZip');

      readFileDataFromZipStub
        .withArgs(0, sinon.match.regexp)
        .resolves(Buffer.from(TEST_PLIST));

      readFileDataFromZipStub
        .withArgs(1, sinon.match.regexp)
        .resolves(null);

      readFileDataFromZipStub
        .withArgs(2, sinon.match.regexp)
        .resolves(Buffer.from('INVALID'));

      readFileDataFromZipStub
        .withArgs(3, sinon.match.regexp)
        .resolves(Buffer.from(EMPTY_PLIST));

    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let bundleInfo = await utility.extractBundleIdAndVersion(0);
      assert.deepEqual(bundleInfo, { bundleId: 'BUNDLE_IDENTIFIER', bundleVersion: 'BUNDLE_VERSION', bundleShortVersion: 'BUNDLE_SHORT_VERSION' });
    });

    it('should reject with error on failure 1', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(1), { message: 'Info.plist not found' });
    });

    it('should reject with error on failure 2', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(2), { message: 'Failed to parse Info.plist' });
    });

    it('should reject with error on failure 3', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(3), { message: 'Bundle info not found in Info.plist' });
    });

  });

  describe('ensureTempDir()', () => {

    before(() => {
      let stub = sinon.stub(fs.promises, 'mkdir');
      stub.withArgs(sinon.match.string, { recursive: true }).resolves(undefined);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let res = await utility.ensureTempDir();
      sinon.assert.match(res, sinon.match.string);
    });

  });

  describe('downloadTempFile()', () => {

    beforeEach(() => {
      let readableStream = new stream.PassThrough();
      readableStream.end();

      let axiosStub = sinon.stub(axios, 'get');
      axiosStub.withArgs('http://example.com/app.ipa', { responseType: 'stream' })
        .resolves({ data: readableStream, headers: { 'content-length': 1 } });

      axiosStub.withArgs('http://example.com/app-no-cl.ipa', { responseType: 'stream' })
        .resolves({ data: readableStream, headers: { } });

      let ensureTempDirStub = sinon.stub(utility, 'ensureTempDir')
      ensureTempDirStub.resolves('PATH');

      let writeStream = new stream.Writable();      

      let createWriteStreamStub = sinon.stub(fs, 'createWriteStream');
      createWriteStreamStub.withArgs(sinon.match.string).returns(writeStream);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      const onProgressCallback = sinon.spy();
      let res = await utility.downloadTempFile('http://example.com/app.ipa', onProgressCallback);
      sinon.assert.match(res, 'PATH');
      sinon.assert.called(onProgressCallback);
    });

    it('should not call onProgress if content-length unknown', async () => {
      const onProgressCallback = sinon.spy();
      let res = await utility.downloadTempFile('http://example.com/app-no-cl.ipa', onProgressCallback);
      sinon.assert.match(res, 'PATH');
      sinon.assert.notCalled(onProgressCallback);
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.downloadTempFile());
    });

  });

  describe('removeTempFile()', () => {

    before(() => {
      let unlinkStub = sinon.stub(fs.promises, 'unlink');
      unlinkStub.withArgs('FILE_PATH').resolves();
      unlinkStub.rejects();
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      await utility.removeTempFile('FILE_PATH');
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.removeTempFile());
    });

  });

  describe('getFileStats()', () => {

    before(() => {
      let stub = sinon.stub(fs, 'fstat')
      stub.withArgs(1).yields(undefined, {});
      stub.withArgs(0).yields(new Error(), undefined);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let stats = await utility.getFileStats(1);
      assert.deepEqual(stats, {});
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.getFileStats(0));
    });

  });

  describe('readFile()', () => {

    before(() => {
      let stub = sinon.stub(fs, 'readFile')
      stub.withArgs('VALIDPATH').yields(undefined, 'data');
      stub.withArgs('WRONGPATH').yields(new Error(), undefined);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let data = await utility.readFile('VALIDPATH');
      assert.deepEqual(data, 'data');
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.readFile('WRONGPATH'));
    });

  });

  describe('getFileMD5()', () => {

    before(() => {
      let stub = sinon.stub(fs, 'createReadStream');
      stub.withArgs(sinon.match.string, sinon.match({ fd: 1 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.push('data');
            this.push(null);
          }
        });
      });
      stub.withArgs(sinon.match.string, sinon.match({ fd: 0 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.emit('error', new Error());
            this.push(null);
          }
        });
      });
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let md5 = await utility.getFileMD5(1);
      assert.deepEqual(md5, '8d777f385d3dfec8815d20f7496026dc');
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.getFileMD5(0));
    });

  });

  describe('getFilePart()', () => {

    before(() => {
      let fsMock = sinon.mock(fs)
      fsMock.expects('read').withArgs(1, sinon.match.instanceOf(Buffer), 0, 4, 0).callsFake((fd, buffer, offset, length, position, cb) => {
        buffer.write('PART');
        cb();
      });
      fsMock.expects('read').yields(new Error());
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let part = await utility.getFilePart(1, 0, 4);
      assert.deepEqual(part, Buffer.from('PART'));
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.getFilePart(0, 0, 4));
    });

  });

  describe('getStringMD5()', () => {

    it('should return correct md5 hash string', () => {
      assert.deepEqual(utility.getStringMD5('data'), '8d777f385d3dfec8815d20f7496026dc');
    });

  });

  describe('getStringMD5Buffer()', () => {

    it('should return correct md5 hash buffer', () => {
      assert.deepEqual(utility.getStringMD5Buffer('data'), Buffer.from('8d777f385d3dfec8815d20f7496026dc', 'hex'));
    });

  });

  describe('bufferToGZBase64()', () => {

    it('should return correct md5 hash buffer', async () => {
      let gzBase64 = await utility.bufferToGZBase64(Buffer.from('data'));
      assert(typeof gzBase64 === 'string');
    });

    it('should reject with error on failure', async () => {
      const zlibMock = sinon.mock(zlib);
  
      zlibMock.expects('gzip')
        .withArgs(sinon.match.instanceOf(Buffer))
        .once()
        .yields(new Error('TEST_ERROR'), null);

      await assert.rejects(utility.bufferToGZBase64(Buffer.alloc(0)));

      zlibMock.verify();
      sinon.restore();
    });

  });

  describe('formatSpeedAndEta()', () => {

    it('should correctly format B/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10, 10, 1000), { eta: '0s', speed: '10 B/s' });
    });

    it('should correctly format kB/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10000, 10000, 1000), { eta: '0s', speed: '10 kB/s' });
    });

    it('should correctly format MB/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10000000, 10000000, 1000), { eta: '0s', speed: '10 MB/s' });
    });

    it('should correctly format eta', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10, 1000, 1000), { eta: '99s', speed: '10 B/s' });
    });

  });

});
