/* global fetch */
import { Components } from './globals';

if (typeof fetch === 'undefined') {
  Components.utils.importGlobalProperties(['fetch']);
}

export default fetch;

export {
  fetch,
  Headers,
  Request,
  Response
};
