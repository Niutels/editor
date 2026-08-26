import {
  collectLandrushZombieEscapeCollisionWorldTransferables,
  createLandrushZombieEscapeCollisionWorldWorkerRequestResolver,
  type LandrushZombieEscapeCollisionWorldWorkerRequest,
  type LandrushZombieEscapeCollisionWorldWorkerResponse,
  type LandrushZombieEscapeCollisionWorldWorkerStatus,
} from './landrush-zombie-escape-collision-world-worker-transport'

type CollisionWorldWorkerScope = {
  onmessage: ((event: MessageEvent<LandrushZombieEscapeCollisionWorldWorkerRequest>) => void) | null
  postMessage: (
    response:
      | LandrushZombieEscapeCollisionWorldWorkerResponse
      | LandrushZombieEscapeCollisionWorldWorkerStatus,
    transfer: ArrayBuffer[],
  ) => void
}

const workerScope = self as unknown as CollisionWorldWorkerScope
const resolveRequest = createLandrushZombieEscapeCollisionWorldWorkerRequestResolver()

workerScope.postMessage({ type: 'ready' }, [])

workerScope.onmessage = (event) => {
  workerScope.postMessage(
    {
      requestId: event.data.requestId,
      signature: event.data.signature,
      type: 'accepted',
    },
    [],
  )
  const response = resolveRequest(event.data)
  const transfer = response.ok
    ? collectLandrushZombieEscapeCollisionWorldTransferables(response.worlds)
    : []
  workerScope.postMessage(response, transfer)
}
