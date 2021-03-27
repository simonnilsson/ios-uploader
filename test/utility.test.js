const assert = require('assert').strict;
const sinon = require('sinon');
const fs = require('fs');
const unzipper = require('unzipper');
const stream = require('stream');

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

  describe('extractBundleIdAndVersion()', () => {

    before(() => {
      let readStreamStub = sinon.stub(fs, 'createReadStream');
      readStreamStub.withArgs(sinon.match.string, sinon.match({ fd: 1 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.push('data');
            this.push(null);
          }
        });
      });

      readStreamStub.withArgs(sinon.match.string, sinon.match({ fd: 0 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.push('error');
            this.push(null);
          }
        });
      });

      readStreamStub.withArgs(sinon.match.string, sinon.match({ fd: 2 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.push('empty');
            this.push(null);
          }
        });
      });

      readStreamStub.withArgs(sinon.match.string, sinon.match({ fd: 3 })).callsFake(() => {
        return new stream.Readable({
          read: function() {
            this.push('nothing');
            this.push(null);
          }
        });
      });

      let unzipperStub = sinon.stub(unzipper, 'ParseOne');

      unzipperStub.callsFake(() => {
        return new stream.Writable({
          write: function(s) {
            if (s.toString() === 'data') this.emit('data', TEST_PLIST);
            if (s.toString() === 'error') this.emit('error', new Error());
            if (s.toString() === 'empty') this.emit('data', '');
            this.emit('end');
          }
        });
      });

    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let bundleInfo = await utility.extractBundleIdAndVersion(1);
      assert.deepEqual(bundleInfo, { bundleId: 'BUNDLE_IDENTIFIER', bundleVersion: 'BUNDLE_VERSION', bundleShortVersion: 'BUNDLE_SHORT_VERSION' });
    });

    it('should reject with error on failure 1', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(0));
    });

    it('should reject with error on failure 2', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(2));
    });

    it('should reject with error on failure 3', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion(3));
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
      let stub = sinon.stub(fs, 'read')
      stub.withArgs(1, sinon.match.instanceOf(Buffer), sinon.match.number).callsFake((fd, buffer) => {
        buffer.write('PART');
      }).yields(undefined);
      stub.yields(new Error());
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
      await assert.rejects(utility.bufferToGZBase64(0));
    });

  });

  describe('formatSpeed()', () => {

    it('should correctly format B/s', () => {
      assert.equal(utility.formatSpeed(10, 1000), '10 B/s');
    });

    it('should correctly format kB/s', () => {
      assert.equal(utility.formatSpeed(10, 1), '10 kB/s');
    });

    it('should correctly format MB/s', () => {
      assert.equal(utility.formatSpeed(10000, 1), '10 MB/s');
    });

  });

});
