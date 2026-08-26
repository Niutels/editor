import {
  type NaturalRoadPlanWorkerRequest,
  type NaturalRoadPlanWorkerResponse,
  type NaturalRoadPlanWorkerStatus,
  resolveNaturalRoadPlanWorkerRequest,
} from './natural-road-plan-worker-transport'

type NaturalRoadPlanWorkerScope = {
  onmessage: ((event: MessageEvent<NaturalRoadPlanWorkerRequest>) => void) | null
  postMessage: (response: NaturalRoadPlanWorkerResponse | NaturalRoadPlanWorkerStatus) => void
}

const workerScope = self as unknown as NaturalRoadPlanWorkerScope

workerScope.postMessage({ type: 'ready' })

workerScope.onmessage = (event) => {
  workerScope.postMessage({
    requestId: event.data.requestId,
    signature: event.data.signature,
    type: 'accepted',
  })
  workerScope.postMessage(resolveNaturalRoadPlanWorkerRequest(event.data))
}
