'use client'

import type { LandrushWorldNode } from '@pascal-app/core'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { type InstancedMesh, Object3D } from 'three'
import type { LandrushMaterials } from './materials'

export function LandrushInstancedTrees({
  materials,
  trees,
}: {
  materials: LandrushMaterials
  trees: LandrushWorldNode['trees']
}) {
  const trunkRef = useRef<InstancedMesh>(null!)
  const pineCanopyRef = useRef<InstancedMesh>(null!)
  const roundedCanopyRef = useRef<InstancedMesh>(null!)
  const floweringCanopyRef = useRef<InstancedMesh>(null!)
  const pineTrees = useMemo(() => trees.filter((tree) => tree.kind === 'pine'), [trees])
  const roundedTrees = useMemo(
    () => trees.filter((tree) => tree.kind !== 'pine' && tree.kind !== 'flowering'),
    [trees],
  )
  const floweringTrees = useMemo(() => trees.filter((tree) => tree.kind === 'flowering'), [trees])

  useLayoutEffect(() => {
    applyTreeTrunkMatrices(trunkRef.current, trees)
    applyTreeCanopyMatrices(pineCanopyRef.current, pineTrees)
    applyTreeCanopyMatrices(roundedCanopyRef.current, roundedTrees)
    applyTreeCanopyMatrices(floweringCanopyRef.current, floweringTrees)
  }, [floweringTrees, pineTrees, roundedTrees, trees])

  return (
    <>
      {trees.length > 0 ? (
        <instancedMesh args={[undefined, undefined, trees.length]} castShadow ref={trunkRef}>
          <cylinderGeometry args={[0.18, 0.26, 1, 5]} />
          <primitive attach="material" object={materials.trunk} />
        </instancedMesh>
      ) : null}
      {pineTrees.length > 0 ? (
        <instancedMesh
          args={[undefined, undefined, pineTrees.length]}
          castShadow
          ref={pineCanopyRef}
        >
          <coneGeometry args={[1, 2.3, 7]} />
          <primitive attach="material" object={materials.canopy} />
        </instancedMesh>
      ) : null}
      {roundedTrees.length > 0 ? (
        <instancedMesh
          args={[undefined, undefined, roundedTrees.length]}
          castShadow
          ref={roundedCanopyRef}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <primitive attach="material" object={materials.canopy} />
        </instancedMesh>
      ) : null}
      {floweringTrees.length > 0 ? (
        <instancedMesh
          args={[undefined, undefined, floweringTrees.length]}
          castShadow
          ref={floweringCanopyRef}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <primitive attach="material" object={materials.canopyLight} />
        </instancedMesh>
      ) : null}
    </>
  )
}

function applyTreeTrunkMatrices(mesh: InstancedMesh | null, trees: LandrushWorldNode['trees']) {
  if (!mesh) return
  const transform = new Object3D()
  trees.forEach((tree, index) => {
    transform.position.set(tree.position.x, tree.trunkHeight / 2, tree.position.z)
    transform.rotation.set(0, tree.rotation, 0)
    transform.scale.set(1, tree.trunkHeight, 1)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

function applyTreeCanopyMatrices(mesh: InstancedMesh | null, trees: LandrushWorldNode['trees']) {
  if (!mesh) return
  const transform = new Object3D()
  trees.forEach((tree, index) => {
    transform.position.set(
      tree.position.x,
      tree.trunkHeight + tree.canopyRadius * 0.55,
      tree.position.z,
    )
    transform.rotation.set(0, tree.rotation, 0)
    transform.scale.set(tree.canopyRadius, tree.canopyRadius, tree.canopyRadius)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}
