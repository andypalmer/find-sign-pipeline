# Changelog

## [0.2.0](https://github.com/andypalmer/find-sign-pipeline/compare/orthagonal-v0.1.0...orthagonal-v0.2.0) (2026-11-14)


### Features

* **orthagonal:** cut signs into hash-placed, id-sorted, content-named shards and scan files ([c2f8fde](https://github.com/andypalmer/find-sign-pipeline/commit/c2f8fde7f1e90f1bf54c8d34693482ca9fe6d5ad))
* **orthagonal:** deal word vectors into content-named buckets by the hash of the word ([6dd9735](https://github.com/andypalmer/find-sign-pipeline/commit/6dd9735e3d515c5ff8c2e92a40d3e440b81c524d))
* **orthagonal:** keep an index's shard and scan counts until they are twice too full, then double them ([5c8e328](https://github.com/andypalmer/find-sign-pipeline/commit/5c8e3285c4f0997080da495b4bed1e0db5f573c0))
* **orthagonal:** let a build carry over indexes it did not rebuild, naming them in manifest.json ([b548845](https://github.com/andypalmer/find-sign-pipeline/commit/b54884551b464c9d336844da267fb5d8a9d0f9a5))
* **orthagonal:** let a build keep the last build's counts by passing in its index manifest ([b3b9360](https://github.com/andypalmer/find-sign-pipeline/commit/b3b9360d2379bbb7e60cfd6495e80b921b801334))
* **orthagonal:** name a file after the first ten hex digits of its own bytes ([b0da0e8](https://github.com/andypalmer/find-sign-pipeline/commit/b0da0e8aa0b42ec74c507ec204e71760ecdb9766))
* **orthagonal:** read a version 2 index, and when a kept file has gone, ask for manifest.json again and retry once ([026259f](https://github.com/andypalmer/find-sign-pipeline/commit/026259f5efe594c68a9f252b26e6ea95d18d0fa8))
* **orthagonal:** read and check the version 2 manifests, refusing anything unsafe or unfinished ([8ae371b](https://github.com/andypalmer/find-sign-pipeline/commit/8ae371b83f2ccb9fd5c3e0160cbcbc8966b23d1d))
* **orthagonal:** share one set of word vector buckets across the whole collection ([df74b51](https://github.com/andypalmer/find-sign-pipeline/commit/df74b51df11863aca9ec35c7a946507dc41710e9))
* **orthagonal:** split the publish plan into content files, index manifests and manifest.json ([c518619](https://github.com/andypalmer/find-sign-pipeline/commit/c518619e5f458b329c63c762459c8937c124b8d4))
* **orthagonal:** tell each loaded entry which index it is in ([058525d](https://github.com/andypalmer/find-sign-pipeline/commit/058525d2c3bc42a77291b1a1045e18c7a8099796))
* **orthagonal:** work out which shard holds a sign and which bucket holds a word ([4289a42](https://github.com/andypalmer/find-sign-pipeline/commit/4289a4223c0f114500b14540036536f9cdf3e9ff))
* **orthagonal:** write a whole version 2 index and plan the order its files are published in ([353e0dc](https://github.com/andypalmer/find-sign-pipeline/commit/353e0dcc0ca35f59db17b3cbfe248bbdd5ae4e56))

## 0.1.0 (2026-10-22)


### Features

* Find Sign's data pipeline as packages, published to GitHub Packages ([7920348](https://github.com/andypalmer/find-sign-pipeline/commit/79203483348a701163d8dfde31b77dd5101bc70b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @andypalmer/find-sign-util bumped from ^0.0.0 to ^0.1.0
    * @andypalmer/vectors bumped from ^0.0.0 to ^0.1.0
