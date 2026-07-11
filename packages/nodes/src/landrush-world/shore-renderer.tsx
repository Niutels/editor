'use client'

import type { MeshBasicMaterial } from 'three'
import type {
  LandrushCoastTower,
  LandrushDock,
  LandrushShoreRock,
  LandrushShoreTerrace,
} from './render-types'

export function LandrushShoreDetails({
  coastTower,
  docks,
  shoreRocks,
  shoreTerraces,
  solidMaterials,
}: {
  coastTower: LandrushCoastTower | null
  docks: readonly LandrushDock[]
  shoreRocks: readonly LandrushShoreRock[]
  shoreTerraces: readonly LandrushShoreTerrace[]
  solidMaterials: Map<string, MeshBasicMaterial>
}) {
  return (
    <>
      {shoreRocks.map((rock) => (
        <mesh
          castShadow
          key={rock.id}
          position={rock.position}
          rotation={rock.rotation}
          scale={rock.scale}
        >
          {rock.shape === 'cliff' ? (
            <boxGeometry args={[1, 1, 1]} />
          ) : (
            <dodecahedronGeometry args={[1, 0]} />
          )}
          <primitive attach="material" object={solidMaterials.get(rock.color)!} />
        </mesh>
      ))}
      {shoreTerraces.map((terrace) => (
        <mesh
          castShadow
          key={terrace.id}
          position={terrace.position}
          rotation={terrace.rotation}
          scale={terrace.scale}
        >
          <boxGeometry args={[1, 1, 1]} />
          <primitive attach="material" object={solidMaterials.get(terrace.color)!} />
        </mesh>
      ))}
      {docks.map((dock) => (
        <group key={dock.id}>
          {dock.planks.map((plank, index) => (
            <mesh
              castShadow
              key={`${dock.id}-plank-${index}`}
              position={plank.position}
              rotation={[0, plank.rotation, 0]}
            >
              <boxGeometry args={plank.footprint} />
              <primitive attach="material" object={solidMaterials.get('#8b6f50')!} />
            </mesh>
          ))}
          {dock.posts.map((post, index) => (
            <mesh castShadow key={`${dock.id}-post-${index}`} position={post}>
              <cylinderGeometry args={[0.11, 0.13, 0.92, 5]} />
              <primitive attach="material" object={solidMaterials.get('#594536')!} />
            </mesh>
          ))}
        </group>
      ))}
      {coastTower ? (
        <group position={coastTower.position} rotation={[0, coastTower.rotation, 0]}>
          <mesh castShadow position={[0, 1.35, 0]}>
            <cylinderGeometry args={[0.56, 0.74, 2.7, 8]} />
            <primitive attach="material" object={solidMaterials.get('#f3ead0')!} />
          </mesh>
          <mesh castShadow position={[0, 2.96, 0]}>
            <cylinderGeometry args={[0.62, 0.62, 0.42, 8]} />
            <primitive attach="material" object={solidMaterials.get('#5f7680')!} />
          </mesh>
          <mesh castShadow position={[0, 3.42, 0]}>
            <coneGeometry args={[0.82, 0.82, 8]} />
            <primitive attach="material" object={solidMaterials.get('#2e5260')!} />
          </mesh>
          <mesh castShadow position={[0.5, 1.95, 0.08]}>
            <boxGeometry args={[0.09, 0.46, 0.08]} />
            <primitive attach="material" object={solidMaterials.get('#436776')!} />
          </mesh>
        </group>
      ) : null}
    </>
  )
}
