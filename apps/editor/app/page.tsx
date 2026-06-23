import { StandaloneEditorShell } from '@/components/standalone-editor-shell'

export default function Home() {
  return (
    <StandaloneEditorShell
      bannerLabel="Local editor - scenes are not saved."
      projectId="local-editor"
      showSceneLinks
    />
  )
}
