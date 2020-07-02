const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const unzipper = require('unzipper');
const plist = require('simple-plist');
const prettyBytes = require('pretty-bytes');

function generateIDString() {
  // YYYYMMDDHHmmss-sss
  return new Date().toISOString().replace(/-|:|T|Z/g, '').replace('.', '-');
}

function makeSessionDigest(sessionId, requestChecksum, requestId, sharedSecret) {
  return crypto.createHash('md5')
    .update(sessionId)
    .update(requestChecksum)
    .update(requestId)
    .update(sharedSecret)
    .digest('hex');
}

function openFile(path, flags = 'r') {
  return new Promise((resolve, reject) => {
    fs.open(path, flags, (err, fd) => {
      if (err) return reject(err);
      resolve(fd);
    });
  });
}

function closeFile(fd) {
  return new Promise((resolve, reject) => {
    fs.close(fd, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function extractBundleIdAndVersion(fd) {
  return new Promise((resolve, reject) => {
    let bundleIdFound = false;
    fs.createReadStream('', { fd, start: 0, autoClose: false })
      .pipe(unzipper.ParseOne(/^Payload\/[^/]*\/Info\.plist$/))
      .on('error', err => reject(err))
      .on('data', data => {
        if (!bundleIdFound) {
          let infoPlist = plist.parse(data, 'Info.plist');
          if (infoPlist && infoPlist.CFBundleIdentifier && infoPlist.CFBundleVersion) {
            bundleIdFound = true;
            resolve({ bundleId: infoPlist.CFBundleIdentifier, bundleVersion: infoPlist.CFBundleVersion });
          }
        }
      })
      .on('end', () => {
        if (!bundleIdFound) {
          reject(new Error('Bundle id not found!'))
        }
      });
  });
}

function getFileStats(fd) {
  return new Promise((resolve, reject) => {
    fs.fstat(fd, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

function readFile(path, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, (err, f) => {
      if (err) return reject(err);
      resolve(f);
    });
  });
}

function getFileMD5(fd) {
  return new Promise((resolve, reject) => {
    const output = crypto.createHash('md5');
    const input = fs.createReadStream('', { fd, start: 0, autoClose: false });
    input.on('error', err => reject(err));
    output.once('readable', () => {
      resolve(output.read().toString('hex'));
    });
    input.pipe(output);
  });
}

function getFilePart(fd, offset, length) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.allocUnsafe(length);
    fs.read(fd, buffer, 0, length, offset, (err) => {
      if (err) return reject(err);
      resolve(buffer);
    });
  });
}

function getStringMD5(text) {
  return crypto.createHash('md5').update(text).digest("hex");
}

function getStringMD5Buffer(text) {
  return crypto.createHash('md5').update(text).digest();
}

function bufferToGZBase64(buf) {
  return new Promise((resolve, reject) => {
    zlib.gzip(buf, (err, res) => {
      if (err) return reject(err);
      resolve(res.toString('base64'));
    })
  });
}

function formatSpeed(bytes, duration) {
  return prettyBytes(Math.round((bytes / duration) * 1000)) + '/s';
}

module.exports = {
  generateIDString,
  makeSessionDigest,
  openFile,
  closeFile,
  extractBundleIdAndVersion,
  getFileStats,
  getFileMD5,
  getFilePart,
  readFile,
  getStringMD5,
  getStringMD5Buffer,
  bufferToGZBase64,
  formatSpeed
};
