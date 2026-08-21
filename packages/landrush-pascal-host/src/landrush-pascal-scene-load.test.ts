import { afterEach, describe, expect, test } from 'bun:test'
import {
  BuildingNode,
  clearSceneHistory,
  LevelNode,
  type SceneCommit,
  SiteNode,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { applyLandrushPascalSceneGraph } from './landrush-pascal-scene-load'

const originalScene = useScene.getState()

afterEach(() => {
  useScene.setState({
    collections: originalScene.collections,
    dirtyNodes: originalScene.dirtyNodes,
    hasExplicitPluginInstallState: originalScene.hasExplicitPluginInstallState,
    installedPlugins: originalScene.installedPlugins,
    materials: originalScene.materials,
    nodes: originalScene.nodes,
    rootNodeIds: originalScene.rootNodeIds,
  })
  clearSceneHistory()
})

describe('Landrush Pascal scene loading', () => {
  test('replaces a live scene with one load commit and no local edit commit', () => {
    const previous = sceneGraph('previous')
    useScene.setState({
      collections: {},
      installedPlugins: [],
      materials: {},
      nodes: previous.nodes as never,
      rootNodeIds: previous.rootNodeIds as never,
    })
    clearSceneHistory()
    const commits: SceneCommit[] = []
    const unsubscribe = subscribeSceneCommits((commit) => commits.push(commit))

    try {
      const next = sceneGraph('next')
      expect(applyLandrushPascalSceneGraph(next)).toBe(true)
      expect(commits.map((commit) => commit.origin)).toEqual(['load'])
      expect(commits[0]?.changedNodeIds).toBeUndefined()
      expect(Object.keys(commits[0]?.before.nodes ?? {}).sort()).toEqual(
        ['site_previous', 'building_previous', 'level_previous'].sort(),
      )
      expect(Object.keys(commits[0]?.current.nodes ?? {}).sort()).toEqual(
        ['site_next', 'building_next', 'level_next'].sort(),
      )
    } finally {
      unsubscribe()
    }
  })
})

function sceneGraph(suffix: string): SceneGraph {
  const site = SiteNode.parse({ children: [`building_${suffix}`], id: `site_${suffix}` })
  const building = BuildingNode.parse({
    children: [`level_${suffix}`],
    id: `building_${suffix}`,
    parentId: site.id,
  })
  const level = LevelNode.parse({
    children: [],
    id: `level_${suffix}`,
    level: 0,
    parentId: building.id,
  })
  return {
    nodes: { [building.id]: building, [level.id]: level, [site.id]: site },
    rootNodeIds: [site.id],
  }
}
