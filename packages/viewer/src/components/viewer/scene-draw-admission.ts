export type ViewerSceneDrawSubmissionRef = {
  current: ViewerSceneDrawSubmissionState
}

export type ViewerSceneDrawSubmissionState = {
  attempts: number
  failures: number
  successfulSubmissions: number
}

export function createViewerSceneDrawSubmissionState(): ViewerSceneDrawSubmissionState {
  return { attempts: 0, failures: 0, successfulSubmissions: 0 }
}

export function shouldRenderViewerEmptyScene(
  sceneDrawDisabled: boolean,
  diagnosticDrawDisabled: boolean,
) {
  return sceneDrawDisabled || diagnosticDrawDisabled
}

export function executeViewerSceneDraw<T>(
  draw: () => T,
  sceneDrawSubmissionRef?: ViewerSceneDrawSubmissionRef,
): T {
  if (sceneDrawSubmissionRef) sceneDrawSubmissionRef.current.attempts += 1
  try {
    const result = draw()
    if (sceneDrawSubmissionRef) {
      sceneDrawSubmissionRef.current.successfulSubmissions += 1
    }
    return result
  } catch (error) {
    if (sceneDrawSubmissionRef) sceneDrawSubmissionRef.current.failures += 1
    throw error
  }
}
