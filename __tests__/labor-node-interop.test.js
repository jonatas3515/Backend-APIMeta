const { execSync } = require('child_process');
const path = require('path');

function runInNode(script) {
  const cwd = path.resolve(__dirname, '..');
  const cmd = 'node -e ' + JSON.stringify(script);
  return execSync(cmd, { cwd, encoding: 'utf-8' }).trim();
}

describe('labor settlement CJS interop (raw Node require)', () => {
  test('"Quero calcular minha rescisão" é tratada e pede o salário', () => {
    const script = "const { adaptLaborSettlement } = require('./lib/laborSettlementAdapter'); "
      + "const result = adaptLaborSettlement({ message: 'Quero calcular minha rescisão' }); "
      + "if (!result || !result.handled) { process.stdout.write('NOT_HANDLED'); process.exit(1); } "
      + "process.stdout.write(result.response.text);";
    const output = runInNode(script);
    expect(output).toContain('Qual era o salário mensal?');
  });

  test('mensagem comum continua não trabalhista (handled=false)', () => {
    const script = "const { adaptLaborSettlement } = require('./lib/laborSettlementAdapter'); "
      + "const result = adaptLaborSettlement({ message: 'Bom dia, quero falar com um advogado' }); "
      + "process.stdout.write(result.handled ? 'HANDLED' : 'NOT_HANDLED');";
    const output = runInNode(script);
    expect(output).toBe('NOT_HANDLED');
  });

  test('pergunta conceitual trabalhista é orientada e não inicia cálculo', () => {
    const script = "const { adaptLaborSettlement } = require('./lib/laborSettlementAdapter'); "
      + "const result = adaptLaborSettlement({ message: 'O que é rescisão indireta?' }); "
      + "if (!result.handled || result.flow !== 'labor_question') { process.stdout.write('FAIL'); process.exit(1); } "
      + "process.stdout.write(result.response.text);";
    const output = runInNode(script);
    expect(output).toContain('dúvida trabalhista');
  });
});
