import { applySceneSnapshot, type SceneSnapshot, useScene } from '@pascal-app/core'
import { editorHostPanelRegistry, type SceneGraph } from '@pascal-app/editor'

export function applyLandrushPascalSceneGraph(sceneGraph: SceneGraph) {
  const installedPlugins =
    sceneGraph.installedPlugins ?? editorHostPanelRegistry.getDefaultInstalledPluginIds()
  const applied = applySceneSnapshot(
    {
      collections: (sceneGraph.collections ?? {}) as SceneSnapshot['collections'],
      installedPlugins,
      materials: (sceneGraph.materials ?? {}) as SceneSnapshot['materials'],
      nodes: sceneGraph.nodes as SceneSnapshot['nodes'],
      rootNodeIds: sceneGraph.rootNodeIds as SceneSnapshot['rootNodeIds'],
    },
    { origin: 'load' },
  )
  useScene.setState({ hasExplicitPluginInstallState: sceneGraph.installedPlugins !== undefined })
  return applied
}
