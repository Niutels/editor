# @landrush/pascal-host

The single integration seam between the Landrush application and Pascal's public packages.

It owns scene loading, editor runtime lifecycle, the Landrush build palette, item catalog, level
selector, and the one-canvas composition of Pascal's `Viewer` with Landrush world content. It
deliberately imports no Pascal internal paths, so the upstream-owned packages can be updated or
replaced without changing the Landrush application.
