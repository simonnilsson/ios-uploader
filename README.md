# ios-uploader

[![npm](https://img.shields.io/npm/v/ios-uploader.svg?style=flat-square)](https://www.npmjs.org/package/ios-uploader)
[![build](https://img.shields.io/travis/simonnilsson/ios-uploader/master.svg?style=flat-square)](https://travis-ci.org/simonnilsson/ios-uploader)
[![coverage](https://coveralls.io/repos/github/simonnilsson/ios-uploader/badge.svg?branch=master)](https://coveralls.io/github/simonnilsson/ios-uploader?branch=master)
[![install size](https://packagephobia.com/badge?p=ios-uploader)](https://packagephobia.com/result?p=ios-uploader)

Easy to use, cross-platform tool to upload an iOS app to iTunes Connect.

## Installation

### System Requirements
* **OS**: Windows, macOS or Linux
* **Node.js**: v10 or newer (bundled with standalone binaries)

If you have Node.js and npm installed the simplest way is to just install the package globaly. The tool will automatically be added to your PATH as `ios-uploader`.

```sh
npm install -g ios-uploader
```

The program is also available as standalone binaries for all major OS:es on [github.com](https://github.com/simonnilsson/ios-uploader/releases).

## Usage

If you have used `altool` previously to upload applications the process should be very familiar.

```sh
$ ios-uploader -u <username> -p <password> -f <path/to/app.ipa>
```

is equivalent to the following command using altool (macOS only):

```sh
$ xcrun altool --upload-app -u <username> -p <password> -f <path/to/app.ipa>
```

> See this page for information on how to generate an app specific password: https://support.apple.com/en-us/HT204397

## Options

```
  -v, --version               output the current version and exit
  -u, --username <string>     your Apple ID
  -p, --password <string>     app-specific password for your Apple ID
  -f, --file <string>         path to .ipa file for upload
  -c, --concurrency <number>  number of concurrent upload tasks to use (default: 4)
  -h, --help                  output this help message and exit
```

## Disclaimer

This package is not endorsed by or in any way associated with Apple Inc. It is provided as is without warranty of any kind. The program may stop working at any time without prior notice if Apple decides to change the API.

## Licence

[MIT](LICENSE)