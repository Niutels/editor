import {
  isParcelBuildFixedPriceNodeType,
  PARCEL_BUILD_FIXED_NODE_PRICE,
  PARCEL_BUILD_ITEM_PRICE,
  PARCEL_BUILD_WALL_PRICE_PER_METER,
} from '@landrush/protocol'

export type LandrushBuildPricePresentation = {
  ariaLabel: string
  label: string
}

export type LandrushBuildWalletAvailability = Readonly<{
  balance: number
  status: 'pending' | 'stale' | 'synced'
}>

const FIXED_NODE_PRICE: LandrushBuildPricePresentation = {
  ariaLabel: `Price: $${PARCEL_BUILD_FIXED_NODE_PRICE}`,
  label: `$${PARCEL_BUILD_FIXED_NODE_PRICE}`,
}

export function resolveLandrushBuildMinimumSelectionCost(
  kind: string | null | undefined,
): number | null {
  if (kind === 'fence') return 0
  if (kind === 'wall') return 1
  if (kind === 'item') return PARCEL_BUILD_ITEM_PRICE
  return isParcelBuildFixedPriceNodeType(kind) ? PARCEL_BUILD_FIXED_NODE_PRICE : null
}

export function canAffordLandrushBuildSelection(
  kind: string | null | undefined,
  wallet: LandrushBuildWalletAvailability | null | undefined,
): boolean {
  const minimumCost = resolveLandrushBuildMinimumSelectionCost(kind)
  if (minimumCost === null) return false
  if (minimumCost === 0) return true
  if (!wallet || wallet.status === 'stale') return false
  return Number.isFinite(wallet.balance) && wallet.balance >= minimumCost
}

export function resolveLandrushBuildPricePresentation(
  kind: string | null | undefined,
): LandrushBuildPricePresentation | null {
  if (kind === 'wall') {
    return {
      ariaLabel: `Price: $${PARCEL_BUILD_WALL_PRICE_PER_METER} per meter`,
      label: `$${PARCEL_BUILD_WALL_PRICE_PER_METER}/m`,
    }
  }
  if (kind === 'fence') {
    return {
      ariaLabel: 'Price: $0',
      label: '$0',
    }
  }
  if (kind === 'item') {
    return {
      ariaLabel: `Price: $${PARCEL_BUILD_ITEM_PRICE}`,
      label: `$${PARCEL_BUILD_ITEM_PRICE}`,
    }
  }
  return isParcelBuildFixedPriceNodeType(kind) ? FIXED_NODE_PRICE : null
}
