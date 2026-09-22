import { selectSavedCard } from './saved-cards.js';

export function checkout(paymentMethod) {
  return selectSavedCard(paymentMethod);
}
