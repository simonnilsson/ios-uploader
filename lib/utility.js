const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const stream = require('stream');
const zlib = require('zlib');
const axios = require('axios');
const yauzl = require("yauzl");
const plist = require('simple-plist');
const prettyBytes = require('pretty-bytes');
const concat = require('concat-stream');
const { promisify } = require('util');

const INFO_PLIST_FILE_PATTERN = /^Payload\/[^/]*.app\/Info\.plist$/;

exports.generateIDString = function() {
  // YYYYMMDDHHmmss-sss
  return new Date().toISOString().replace(/-|:|T|Z/g, '').replace('.', '-');
}

exports.makeSessionDigest = function(sessionId, requestChecksum, requestId, sharedSecret) {
  return crypto.createHash('md5')
    .update(sessionId)
    .update(requestChecksum)
    .update(requestId)
    .update(sharedSecret)
    .digest('hex');
}

exports.openFile = function(path, flags = 'r') {
  return new Promise((resolve, reject) => {
    fs.open(path, flags, (err, fd) => {
      if (err) return reject(err);
      resolve(fd);
    });
  });
}

exports.closeFile = function(fd) {
  return new Promise((resolve, reject) => {
    fs.close(fd, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

exports.readFileDataFromZip = function(fd, fileNamePattern) {
  return new Promise((resolve, reject) => {
    yauzl.fromFd(fd, { autoClose: false, lazyEntries: true }, (err, zipFile) => {
      if (err) return reject(err);
      zipFile.on("error", reject);
      zipFile.on('entry', (entry) => {
        if (fileNamePattern.test(entry.fileName)) {
          zipFile.openReadStream(entry, (err, stream) => {
            if (err) throw err;
            stream.pipe(concat(resolve));
          });
        }
        else {
          zipFile.readEntry();
        }
      });
      zipFile.on('end', () => {
        resolve(null);
      });
      zipFile.readEntry();
    });
  });
}

exports.extractBundleIdAndVersion = async function(fd) {

  let data;
  
  try {
    data = await exports.readFileDataFromZip(fd, INFO_PLIST_FILE_PATTERN);
  }
  catch (err) {
    // Ignore this error, handled below.
  }

  if (!data || data.length === 0) {
    throw new Error('Info.plist not found');
  }

  let infoPlist;
  try {
    infoPlist = plist.parse(data, 'Info.plist');
  }
  catch (err) {
    throw new Error('Failed to parse Info.plist');
  }

  if (infoPlist && infoPlist.CFBundleIdentifier && infoPlist.CFBundleVersion && infoPlist.CFBundleShortVersionString) {
    return { 
      bundleId: infoPlist.CFBundleIdentifier,
      bundleVersion: infoPlist.CFBundleVersion,
      bundleShortVersion: infoPlist.CFBundleShortVersionString
    };
  }

  throw new Error('Bundle info not found in Info.plist');
}

exports.ensureTempDir = async function() {
  const tempDir = path.join(os.tmpdir(), 'ios-uploader');
  await fs.promises.mkdir(tempDir, { recursive: true });
  return tempDir;
}

exports.downloadTempFile = async function(fileUrl, onProgress = () => {}) {
  const res = await axios.get(fileUrl, {
    responseType: 'stream',
  });
  let newFilePath = path.join(
    await exports.ensureTempDir(), 
    Math.random().toString(16).substr(2, 8) + '.ipa'
  );
  const writer = fs.createWriteStream(newFilePath);

  const contentLength = Number(res.headers['content-length'] || 0);
  let downloaded = 0;
  if (contentLength > 0) {
    onProgress(0, contentLength);
    res.data.on('data', (chunk) => onProgress(downloaded += chunk.length, contentLength));
  }
 
  res.data.pipe(writer);
  await promisify(stream.finished)(writer);
  return newFilePath;
}

exports.removeTempFile = async function(filePath) {
  await fs.promises.unlink(filePath);
}

exports.getFileStats = function(fd) {
  return new Promise((resolve, reject) => {
    fs.fstat(fd, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

exports.readFile = function(path, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, (err, f) => {
      if (err) return reject(err);
      resolve(f);
    });
  });
}

exports.getFileMD5 = function(fd) {
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

exports.getFilePart = function(fd, offset, length) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.allocUnsafe(length);
    fs.read(fd, buffer, 0, length, offset, (err) => {
      if (err) return reject(err);
      resolve(buffer);
    });
  });
}

exports.getStringMD5 = function(text) {
  return crypto.createHash('md5').update(text).digest("hex");
}

exports.getStringMD5Buffer = function(text) {
  return crypto.createHash('md5').update(text).digest();
}

exports.bufferToGZBase64 = function(buf) {
  return new Promise((resolve, reject) => {
    zlib.gzip(buf, (err, res) => {
      if (err) return reject(err);
      resolve(res.toString('base64'));
    })
  });
}

exports.formatSpeedAndEta = function(bytes, total, duration) {
  return {
    speed: prettyBytes(Math.round((bytes / duration) * 1000)) + '/s',
    eta: Math.round(((total - bytes) / (bytes / duration)) / 1000) + 's'
  };
}
