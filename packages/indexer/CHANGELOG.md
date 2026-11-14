# Changelog

## [0.2.0](https://github.com/andypalmer/find-sign-pipeline/compare/indexer-v0.1.0...indexer-v0.2.0) (2026-11-14)


### Features

* **indexer:** keep a provider's record file as it is when none of its signs changed ([b4c0bbb](https://github.com/andypalmer/find-sign-pipeline/commit/b4c0bbbe9cd68c7cf144884bfd1bead4d0bc5e14))
* **indexer:** let a build write only the version 2 index, leaving version 1 files as they are ([fd26c78](https://github.com/andypalmer/find-sign-pipeline/commit/fd26c78568522f32474a7064104c98d2fcc08426))
* **indexer:** read the last version 2 build from the store and publish a new one tier by tier ([9c369b8](https://github.com/andypalmer/find-sign-pipeline/commit/9c369b8a929bbf448f81ce3dbef80290e6f0080d))
* **indexer:** write the version 2 index beside version 1 when a provider is built ([dc07d9d](https://github.com/andypalmer/find-sign-pipeline/commit/dc07d9dd37cf8e8374caf8ae514876487a9908b3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @andypalmer/orthagonal bumped from ^0.1.0 to ^0.2.0

## 0.1.0 (2026-10-22)


### Features

* Find Sign's data pipeline as packages, published to GitHub Packages ([7920348](https://github.com/andypalmer/find-sign-pipeline/commit/79203483348a701163d8dfde31b77dd5101bc70b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @andypalmer/find-sign-util bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/vectors bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/orthagonal bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/data-store bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/records bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/tags bumped from ^0.0.0 to ^0.1.0
