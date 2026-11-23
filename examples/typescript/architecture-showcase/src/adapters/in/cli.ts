import { createOrderApplication } from '../../orders/composition/createOrderApplication.js';

function run(): void {
  console.log(createOrderApplication()('atlas-1'));
}

run();
