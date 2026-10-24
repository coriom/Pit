// Settlement identity for a future reviewed Base rail. This module never sends
// a transaction or authorizes the unverified merchant payout address.
export const BASE_NETWORK = 'eip155:8453';
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_USDBC = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
export const USDC_DECIMALS = 6;
export const MERCHANT_PAYOUT_VERIFIED = false;
export const UNVERIFIED_MERCHANT_CANDIDATE = '0x8B87aECC9413C2c5b853e81AA94b60990e7aBdbE';

const sameAddress = (a,b) => typeof a==='string' && typeof b==='string' && /^0x[\da-fA-F]{40}$/.test(a) && a.toLowerCase()===b.toLowerCase();
export function validMockInvoice(invoice, order) {
  return invoice && order && invoice.orderId===order.id && invoice.expiresAt===order.expires_at &&
    invoice.chain===BASE_NETWORK && sameAddress(invoice.token,BASE_USDC) &&
    /^0x[\da-fA-F]{40}$/.test(invoice.recipient??'') &&
    /^[1-9]\d{0,11}$/.test(invoice.atomicAmount??'');
}
export function sameSettlement(invoice, readback) {
  return readback?.chain===BASE_NETWORK && sameAddress(readback.token,BASE_USDC) &&
    sameAddress(readback.recipient,invoice.recipient) &&
    readback.atomicAmount===invoice.atomicAmount;
}
export function sameStoredInvoice(invoice, stored) {
  return stored && invoice.orderId===stored.order_id && invoice.chain===stored.chain &&
    sameAddress(invoice.token,stored.asset) && sameAddress(invoice.recipient,stored.recipient) &&
    invoice.atomicAmount===stored.atomic_amount && invoice.expiresAt===stored.expires_at;
}
