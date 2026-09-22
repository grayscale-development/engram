import { checkout } from '../src/checkout.js';

if (checkout({ id: 'saved_1' }).paymentMethodId !== 'saved_1') throw new Error('saved card was not selected');
