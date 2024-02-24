# ios-uploader

[![npm](https://img.shields.io/npm/v/ios-uploader.svg?style=flat-square)](https://www.npmjs.org/package/ios-uploader)
[![build](https://github.com/simonnilsson/ios-uploader/workflows/ci/badge.svg)](https://github.com/simonnilsson/ios-uploader/actions?query=workflow%3Aci+branch%3Amain)
[![coverage](https://coveralls.io/repos/github/simonnilsson/ios-uploader/badge.svg?branch=main)](https://coveralls.io/github/simonnilsson/ios-uploader?branch=main)
[![install size](https://packagephobia.com/badge?p=ios-uploader)](https://packagephobia.com/result?p=ios-uploader)
[![Awesome](https://cdn.rawgit.com/sindresorhus/awesome/d7305f38d29fed78fa85652e3a63e154dd8e8829/media/badge.svg)](https://github.com/vsouza/awesome-ios)

Easy to use, cross-platform tool to upload iOS apps to App Store Connect.

## Installation

### System Requirements
* **OS**: Windows, macOS or Linux
* **Node.js**: v18 or newer (bundled with standalone binaries)

If you have Node.js and npm installed the simplest way is to just install the package globally. The tool will automatically be added to your PATH as `ios-uploader`.

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

> See this page for information on how to generate an app specific password: <br>https://support.apple.com/en-us/HT204397

## Options

```
  -v, --version               output the current version and exit
  -u, --username <string>     your Apple ID
  -p, --password <string>     app-specific password for your Apple ID
  -f, --file <string>         path to .ipa file for upload (local file, http(s):// or ftp:// URL)
  -c, --concurrency <number>  number of concurrent upload tasks to use (default: 4)
  -h, --help                  output this help message and exit
```

## Disclaimer

This package is not endorsed by or in any way associated with Apple Inc. It is provided as is without warranty of any kind. The program may stop working at any time without prior notice if Apple decides to change the API.

## License

[MIT](LICENSE)