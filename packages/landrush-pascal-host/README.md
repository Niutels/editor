# @landrush/pascal-host

The single integration seam between the Landrush application and Pascal's public packages.

It owns scene loading, editor runtime lifecycle, the Landrush build palette, item catalog, level
selector, Pascal scene-to-collider projection, and the one-canvas composition of Pascal's `Viewer` with Landrush world content. It
deliberately imports no Pascal internal paths, so the upstream-owned packages can be updated or
replaced without changing the Landrush application.

The host keeps a valid Pascal site root for editor semantics, but suppresses only that renderer's
unregistered ground presentation objects. Registered building children remain under Pascal control,
while Landrush's island and ocean own the shared world's ground presentation.
