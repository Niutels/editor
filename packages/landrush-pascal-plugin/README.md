# @landrush/pascal-plugin

Landrush-owned Pascal node definitions and renderers. The package uses only the
public `@pascal-app/core` and `@pascal-app/viewer` surfaces and is loaded by the
Landrush host through Pascal's `Plugin` contract.

The persisted node kinds remain `landrush-layout`, `landrush-world`, and
`pascal-water` so existing island saves continue to load without migration.
Pascal's built-in node bundle does not import this package.
