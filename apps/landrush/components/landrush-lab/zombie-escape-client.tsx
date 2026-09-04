'use client'

import {
  deriveZombieEscapeCameraRig,
  ZOMBIE_ESCAPE_QUALITY,
  ZOMBIE_ESCAPE_SEED,
  type ZombieEscapeInputMode,
  type ZombieEscapeQuality,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  createZombieEscapeHudSnapshot,
  type ZombieEscapeHudSnapshot,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import { Canvas } from '@react-three/fiber'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { ZombieEscapeHud } from './zombie-escape-hud'
import { ZombieEscapeScene, type ZombieEscapeSceneApi } from './zombie-escape-scene'

export function ZombieEscapeClient() {
  const arena = useMemo(() => createZombieEscapeArena(ZOMBIE_ESCAPE_SEED), [])
  const [snapshot, setSnapshot] = useState<ZombieEscapeHudSnapshot>(createZombieEscapeHudSnapshot)
  const [inputMode, setInputMode] = useState<ZombieEscapeInputMode>('keyboard')
  const [quality, setQuality] = useState<ZombieEscapeQuality>('balanced')
  const apiRef = useRef<ZombieEscapeSceneApi | null>(null)
  const cameraRig = useMemo(
    () => deriveZombieEscapeCameraRig('design', arena.radius),
    [arena.radius],
  )
  const toggleQuality = useCallback(() => {
    setQuality((current) => (current === 'balanced' ? 'performance' : 'balanced'))
  }, [])

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-[#2b88a1] [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none">
      <Canvas
        aria-label="Playable Zombie Escape arena"
        camera={{
          far: cameraRig.far,
          fov: cameraRig.fov,
          near: cameraRig.near,
          position: [
            arena.playerStartX + cameraRig.offsetX,
            cameraRig.offsetY,
            arena.playerStartZ + cameraRig.offsetZ,
          ],
        }}
        dpr={ZOMBIE_ESCAPE_QUALITY[quality].dpr}
        frameloop="always"
        gl={{
          alpha: false,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ camera, gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
          camera.lookAt(arena.playerStartX, 0.95, arena.playerStartZ)
          camera.updateMatrixWorld()
        }}
        shadows={false}
      >
        <ZombieEscapeScene
          apiRef={apiRef}
          arena={arena}
          onHudSnapshot={setSnapshot}
          onInputModeChange={setInputMode}
          onQualityToggle={toggleQuality}
          quality={quality}
        />
      </Canvas>
      <ZombieEscapeHud
        api={apiRef.current}
        inputMode={inputMode}
        onQualityToggle={toggleQuality}
        quality={quality}
        snapshot={snapshot}
      />
    </main>
  )
}
