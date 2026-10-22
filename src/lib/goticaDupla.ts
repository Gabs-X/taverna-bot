// Junta dois retratos (512×512) numa imagem 1024×512, com um símbolo no meio.
// Cada retrato define os mesmos ids (pele, cabelo, vol...); o prefixo evita que um use as cores do outro.

const prefixar = (svg: string, p: string) =>
  svg
    .replace(/\bid="([^"]+)"/g, `id="${p}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${p}$1"`);

const miolo = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const SIMBOLOS = {
  duelo: `<g transform="translate(512 256)">
      <circle r="58" fill="#12061c" stroke="#f5b544" stroke-width="5"/>
      <g stroke-linecap="round" stroke-width="9">
        <path d="M-30 -30 L30 30" stroke="#d8d8e6"/><path d="M30 -30 L-30 30" stroke="#d8d8e6"/>
      </g>
      <path d="M-38 22 L-22 38 M38 22 L22 38" stroke="#c9a24e" stroke-width="12" stroke-linecap="round"/>
    </g>`,
  visita: `<g transform="translate(512 256)">
      <circle r="58" fill="#12061c" stroke="#ff7aa2" stroke-width="5"/>
      <path transform="scale(1.5)" d="M0 14 C-30 -6 -40 -30 -22 -40 C-10 -46 0 -36 0 -28 C0 -36 10 -46 22 -40 C40 -30 30 -6 0 14 Z" fill="#e8436f"/>
    </g>`,
};

export function juntarRetratos(esquerda: string, direita: string, simbolo: keyof typeof SIMBOLOS) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512" width="1024" height="512">
  <defs><clipPath id="metade"><rect width="512" height="512"/></clipPath></defs>
  <g clip-path="url(#metade)">${miolo(prefixar(esquerda, 'e-'))}</g>
  <g transform="translate(512 0)"><g clip-path="url(#metade)">${miolo(prefixar(direita, 'd-'))}</g></g>
  <rect x="510" y="0" width="4" height="512" fill="#0b0612"/>
  ${SIMBOLOS[simbolo]}
</svg>`;
}
