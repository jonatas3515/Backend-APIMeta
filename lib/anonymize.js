const patterns = [
  { regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g, label: '[CNPJ]' },
  { regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g, label: '[CPF]' },
  { regex: /\b\d{1,2}\.?\d{3}\.?\d{3}-?\d[0-9Xx]\b/g, label: '[RG]' },
  { regex: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b|\b\d{20}\b/g, label: '[PROCESSO]' },
  { regex: /\S+@\S+\.\S+/g, label: '[EMAIL]' },
  { regex: /\b(?:\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4})\b/g, label: '[TELEFONE]' },
  { regex: /\b(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[\s,;]+(?:reais|real|R\$|\$)\b/gi, label: '[VALOR]' },
  { regex: /\b(?:Rua|Av\.?|Avenida|Travessa|Alameda|Rodovia|BR-\d+|Est\.?|Praça)\s[^,\n]{5,80}[\d\-]{0,10}/gi, label: '[ENDEREÇO]' },
];

export function anonymizeText(text) {
  if (!text) return '';
  let anon = text;
  patterns.forEach(({ regex, label }) => {
    anon = anon.replace(regex, label);
  });
  return anon;
}
