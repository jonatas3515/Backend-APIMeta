/**
 * Configuracao do pdfjs-dist para ambiente serverless
 */

let pdfjsLib = null;

export async function getPdfLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    // Desabilita worker completamente
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  }
  return pdfjsLib;
}
