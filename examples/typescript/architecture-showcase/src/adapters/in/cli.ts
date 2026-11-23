import { createOrderApplication } from '../../orders/composition/createOrderApplication.js';

/***
 * @usage
 * @readme
 * @title TypeScript architecture showcase
 */
function run(): void {
  console.log(createOrderApplication()('atlas-1'));
}

run();
