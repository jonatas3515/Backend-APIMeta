import DOMMatrix from 'dommatrix';

if (typeof globalThis !== 'undefined' && !globalThis.DOMMatrix) {
  globalThis.DOMMatrix = DOMMatrix;
}
