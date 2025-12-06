export interface StripeProduct {
  id: string
  priceId: string
  name: string
  description: string
  price: number
  mode: 'subscription' | 'payment'
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_SgBmtOzhmrbBUC',
    priceId: 'price_1RkpP6Ho63JmGM47eF33IQSU',
    name: 'Pro Subscription',
    description: 'Advanced features for professional prototyping with 100 designs per month, 1000 refinement chats, priority support, advanced analytics, API access, and custom integrations',
    price: 100.00,
    mode: 'subscription'
  },
  {
    id: 'prod_SgBkQa3uERhD9g',
    priceId: 'price_1RkpNNHo63JmGM47rPTh9ujV',
    name: 'Plus Subscription',
    description: 'Enhanced prototyping capabilities with 10 designs per month, 100 refinement chats, priority processing, email support, and advanced export options',
    price: 25.00,
    mode: 'subscription'
  },
  {
    id: 'prod_SgBoJXSiDfjRza',
    priceId: 'price_1RkpR3Ho63JmGM47kZ3J7zUi',
    name: 'Manufacturing Connect Addon',
    description: 'Manufacturing network access addon - requires Pro subscription. Includes global supplier network, unlimited manufacturer searches, quote requests, and priority manufacturing connections.',
    price: 100.00,
    mode: 'subscription'
  },
  {
    id: 'prod_SgBqHX6Evs8cgV',
    priceId: 'price_1RkpSlHo63JmGM47wMp16yTw',
    name: 'Extra Patent Searches',
    description: 'Additional patent search credits for comprehensive prior art analysis - 10 searches for $10',
    price: 10.00,
    mode: 'payment'
  }
]

export const getProductByPriceId = (priceId: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.priceId === priceId)
}

export const getProductById = (id: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.id === id)
}

export const getProductByTier = (tier: string): StripeProduct | undefined => {
  // Never return manufacturer products for any tier - manufacturer access is handled separately
  if (tier === 'manufacturer') {
    return undefined; // Force fallback to prevent manufacturer tier usage
  }
  
  if (tier === 'pro') {
    return stripeProducts.find(product => product.name.includes('Pro'))
  } else if (tier === 'plus') {
    return stripeProducts.find(product => product.name.includes('Plus'))
  }
  return undefined
}

export const getManufacturingAddon = (): StripeProduct | undefined => {
  return stripeProducts.find(product => product.name.includes('Manufacturing Connect'))
}

export const getExtraPatentSearches = (): StripeProduct | undefined => {
  return stripeProducts.find(product => product.name.includes('Extra Patent Searches'))
}