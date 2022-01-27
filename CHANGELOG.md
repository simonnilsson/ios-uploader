# Changelog
All notable changes to this project will be documented in this file.

## [Unreleased]
- Updated dependencies


## [2.0.0] - 2022-01-18
### Changed
- **BREAKING** Dropped support for Node v10
- Bump binary releases from Node v12 to v14
- Updated dependencies


## [1.5.2] - 2021-11-14
### Changed
- Updated dependencies


## [1.5.1] - 2021-09-24
### Changed
- Updated dependencies


## [1.5.0] - 2021-08-27
### Added
- Added support for HTTP/HTTPS URLs to .ipa #16

### Fixed
- Fixed Coveralls badge link

### Changed
- Updated dependencies


## [1.4.0] - 2021-06-27
### Fixed
- Rework of bundle info lookup to solve issues with some IPA-files.
- Improved error message when bundle info lookup fails

### Changed
- Updated dependencies


## [1.3.0] - 2021-05-11
### Fixed
- Limit what files get published to npm

### Changed
- Updated dependencies
- Renamed npm token in build
- Added Node v16 to CI tests
- Binary releases now bundle Node v12


## [1.2.3] - 2021-04-30
### Fixed
- Minor README fixes

### Changed
- Updated dependencies
- Moved CI to Github Actions


## [1.2.2] - 2021-03-27
### Changed
- Updated dependencies


## [1.2.1] - 2021-01-16
### Fixed
- Catch error thrown by plist parsing #9
- Make Info.plist regex more specific #9
- Fix upload of big application archives #7

### Changed
- Updated dependencies


## [1.2.0] - 2020-12-29
### Fixed
- Fixed error handling on failed upload #7

### Changed
- Updated dependencies


## [1.1.3] - 2020-11-06
### Added
- Added CHANGELOG.md

### Fixed
- Fixed invalid code syntax and indentation
- Change spelling of "Licence" to "License" in README.md

### Changed
- Updated dependencies


## [1.1.2] - 2020-08-31
### Added
- Added version validation #4

### Changed
- Help message improvements #6 


## [1.1.1] - 2020-08-27
### Added
- Include bundle info in validateAssets #4

### Fixed
- Fixed incorrect short version in metadata #5

### Changed
- Improved info messages


## [1.1.0] - 2020-08-26
### Added
- Added sanitation of input file name
- Added version validation #4

### Fixed
-  Fixed typo

### Changed
- Improved error reporting #3

### Removed
- Removed support for bundle-id argument


## [1.0.2] - 2020-08-25
### Added
- Added gitattributes file

### Fixed
- Travis CI fixes


## [1.0.1] - 2020-08-20
### Changed
- Updated dependencies

### Fixed
- Travis CI fixes
- Time issue in tests


## [1.0.0] - 2020-07-02
- Initial release
