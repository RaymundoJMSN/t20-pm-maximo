/**
 * Limite de gasto de PM por uso (Tormenta20 p. 106).
 * `node scripts/regras.mjs --check` roda os casos.
 *
 *   "Para habilidades com custo variável, o máximo de PM que você pode gastar
 *    por uso é igual ao seu nível na classe que fornece a habilidade (mas você
 *    sempre pode usar a habilidade em seu custo mínimo). Para habilidades de
 *    raça, origem ou outras fontes e poderes gerais, o limite é o seu nível de
 *    personagem."
 *
 *   Magia Ilimitada (LB p. 131): "Você soma seu atributo-chave no limite de PM
 *   que pode gastar numa magia."
 *
 *   Poder Sem Limites (Deuses de Arton, concedido de Kallyadranoch): "A CD e os
 *   limites de PM de suas habilidades (exceto magias e habilidades que as
 *   simulem) aumentam em um valor igual ao seu patamar."
 */

/** Patamar pelo nível (LB p. 32): Iniciante 1, Veterano 2, Campeão 3, Lenda 4. */
export const patamarDe = (nivel) => {
  const n = Number(nivel) || 0;
  return n >= 17 ? 4 : n >= 11 ? 3 : n >= 5 ? 2 : 1;
};

/** De onde a habilidade vem decide qual nível manda. */
export const FONTE = { CLASSE: "classe", PERSONAGEM: "personagem" };

/**
 * @param {object} e
 * @param {string} e.fonte            FONTE.CLASSE (magia, habilidade de classe) ou FONTE.PERSONAGEM
 * @param {number} e.nivelClasse      nível na classe que fornece a habilidade
 * @param {number} e.nivelPersonagem  nível total
 * @param {boolean} e.magiaIlimitada  tem o poder (só vale para magia)
 * @param {number} e.atributoChave    valor do atributo-chave de conjuração
 * @param {boolean} e.ehMagia
 * @param {boolean} e.poderSemLimites  tem o poder (não vale para magia)
 */
export function limiteDePM({
  fonte = FONTE.PERSONAGEM,
  nivelClasse = 0,
  nivelPersonagem = 0,
  magiaIlimitada = false,
  atributoChave = 0,
  ehMagia = false,
  poderSemLimites = false,
} = {}) {
  const base = fonte === FONTE.CLASSE ? nivelClasse : nivelPersonagem;
  const extra = ehMagia && magiaIlimitada ? Math.max(0, Number(atributoChave) || 0) : 0;
  // ponytail: "habilidades que as simulem" não dá para ler da ficha — só magia fica de fora.
  const patamar = poderSemLimites && !ehMagia ? patamarDe(nivelPersonagem || nivelClasse) : 0;
  return Math.max(1, base + extra + patamar); // sempre dá para gastar pelo menos 1
}

/** O custo mínimo sempre passa: o limite corta os aprimoramentos, não o uso. */
export const cabeNoLimite = (custoTotal, limite, custoMinimo = 0) =>
  custoTotal <= Math.max(limite, custoMinimo);

/** Ainda dá para marcar mais este aprimoramento? */
export const podeSomar = (custoAtual, custoDoAprimoramento, limite) =>
  custoAtual + custoDoAprimoramento <= limite;

/** Tem PM na ficha para pagar? PM temporário conta junto. */
export const temPM = (custo, { value = 0, temp = 0 } = {}) => custo <= (Number(value) || 0) + (Number(temp) || 0);

/** Quanto ainda dá para gastar: o menor entre o que sobra de limite e de PM. */
export const tetoDoUso = (limite, pm) => Math.min(limite, (Number(pm?.value) || 0) + (Number(pm?.temp) || 0));


/* ───────────────────────── círculo máximo de magia ─────────────────────────
 * Duas progressões no livro: conjurador cheio (2º no 5º, +1 a cada 4 níveis) e
 * parcial (2º no 6º, 3º no 10º, 4º no 14º). Ladrão Arcano rouba até 4º.
 */
const CHEIO = { 2: 5, 3: 9, 4: 13, 5: 17 };
const PARCIAL = { 2: 6, 3: 10, 4: 14 };
// ponytail: engenhoca do inventor (6/10/14/18) fora — só vale para item tipo "eng"
export const PROGRESSAO_CIRCULO = {
  arcanista: CHEIO, necromante: CHEIO, clerigo: CHEIO, usurpador: CHEIO, frade: CHEIO,
  bardo: PARCIAL, magimarcialista: PARCIAL, druida: PARCIAL, ermitao: PARCIAL, ventanista: PARCIAL,
};

export const slug = (nome) =>
  String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "_");

/** Círculo que um nível numa classe alcança (0 = não conjura). */
export function circuloDaClasse(nome, nivel) {
  const prog = PROGRESSAO_CIRCULO[slug(nome)];
  if (!prog || nivel < 1) return 0;
  let c = 1;
  for (const [circ, n] of Object.entries(prog)) if (nivel >= n) c = Math.max(c, Number(circ));
  return c;
}

/**
 * @param {{classes?:{nome:string,nivel:number}[], ladraoArcano?:boolean, maiorMagia?:number}} e
 * `maiorMagia` = maior círculo entre as magias da ficha (fallback para classe desconhecida).
 */
export function circuloMaximo({ classes = [], ladraoArcano = false, maiorMagia = 0 } = {}) {
  const porClasse = Math.max(0, ...classes.map((c) => circuloDaClasse(c.nome, Number(c.nivel) || 0)));
  return Math.max(porClasse, ladraoArcano ? 4 : 0, porClasse ? 0 : Number(maiorMagia) || 0);
}

/** "Requer 3º círculo" → 3; sem exigência → 0. */
export const circuloExigido = (texto) => Number(/requer\s+(\d)\s*[ºo°]?\s*c[ií]rculo/i.exec(texto || "")?.[1]) || 0;

/** "limitado pelo círculo máximo de magia que você pode lançar" */
export const limitadoPorCirculo = (texto) => /limitad[oa]\s+pelo\s+c[ií]rculo\s+m[aá]ximo/i.test(texto || "");

/** Quantas vezes um aprimoramento "limitado pelo círculo" pode entrar: uma por círculo (leitura da mesa). */
export const vezesPorCirculo = (circuloMax) => Math.max(0, Number(circuloMax) || 0);

/**
 * Conjurar sem foco (poder caseiro da Bruxa): teste de Misticismo contra CD 20 +
 * o PM que a magia custou. O custo é a mesma conta do `ItemT20.displayCard`
 * (custo ≥1 se a magia tem custo, + `custoPM` da ficha, truque 0, metade arredonda pra baixo).
 */
export function cdSemFoco({ custo = 0, temCusto = false, extra = 0, truque = false, metade = false } = {}) {
  let pm = Math.max(Number(custo) || 0, 0) || (temCusto ? 1 : 0);
  pm += Number(extra) || 0;
  if (truque) pm = 0;
  else if (metade) pm = Math.floor(pm / 2);
  return 20 + pm;
}

/** O d20 do teste deu 20 natural (com vantagem, o dado que ficou). */
export const vinteNatural = (roll) => roll?.dice?.find((d) => d.faces === 20)?.total === 20;

/* ────────────────────────────── self-test ────────────────────────────── */
function check() {
  const ok = [];
  const eq = (nome, a, b) => ok.push([nome, JSON.stringify(a) === JSON.stringify(b), a, b]);

  eq("magia usa o nível da classe", limiteDePM({ fonte: FONTE.CLASSE, nivelClasse: 5, nivelPersonagem: 9, ehMagia: true }), 5);
  eq("poder geral usa o nível de personagem", limiteDePM({ fonte: FONTE.PERSONAGEM, nivelClasse: 5, nivelPersonagem: 9 }), 9);
  eq("nível 0 ainda deixa gastar 1", limiteDePM({}), 1);
  // Exemplo do livro: arcanista de 5º com Int 4 e Magia Ilimitada gasta até 9.
  eq(
    "Magia Ilimitada soma o atributo-chave",
    limiteDePM({ fonte: FONTE.CLASSE, nivelClasse: 5, atributoChave: 4, magiaIlimitada: true, ehMagia: true }),
    9
  );
  eq(
    "Magia Ilimitada não vale fora de magia",
    limiteDePM({ fonte: FONTE.PERSONAGEM, nivelPersonagem: 5, atributoChave: 4, magiaIlimitada: true }),
    5
  );
  // Poder Sem Limites: devoto de Kallyadranoch de 11º (Campeão) usa poder geral até 11+3.
  eq("Poder Sem Limites soma o patamar", limiteDePM({ fonte: FONTE.PERSONAGEM, nivelPersonagem: 11, poderSemLimites: true }), 14);
  eq(
    "Poder Sem Limites não vale em magia",
    limiteDePM({ fonte: FONTE.CLASSE, nivelClasse: 11, nivelPersonagem: 11, ehMagia: true, poderSemLimites: true }),
    11
  );
  eq("patamar por faixa", [1, 4, 5, 10, 11, 16, 17, 20].map(patamarDe), [1, 1, 2, 2, 3, 3, 4, 4]);

  eq("atributo negativo não tira do limite", limiteDePM({ fonte: FONTE.CLASSE, nivelClasse: 5, atributoChave: -2, magiaIlimitada: true, ehMagia: true }), 5);

  eq("dentro do limite passa", cabeNoLimite(5, 5), true);
  eq("acima do limite não", cabeNoLimite(6, 5), false);
  eq("custo mínimo sempre passa", cabeNoLimite(6, 5, 6), true);

  eq("cabe mais um aprimoramento", podeSomar(3, 2, 5), true);
  eq("não cabe mais um", podeSomar(4, 2, 5), false);

  eq("PM temporário conta", temPM(7, { value: 5, temp: 2 }), true);
  eq("sem PM não usa", temPM(3, { value: 2 }), false);
  eq("teto é o menor dos dois", tetoDoUso(9, { value: 4, temp: 0 }), 4);
  eq("teto respeita o limite", tetoDoUso(3, { value: 40 }), 3);

  eq("arcanista 5º lança 2º círculo", circuloDaClasse("Arcanista", 5), 2);
  eq("arcanista 4º ainda 1º", circuloDaClasse("Arcanista", 4), 1);
  eq("bardo 14º lança 4º", circuloDaClasse("Bardo", 14), 4);
  eq("druida 20º para no 4º", circuloDaClasse("Druida", 20), 4);
  eq("necromante herda do arcanista", circuloDaClasse("Necromante", 17), 5);
  eq("guerreiro não conjura", circuloDaClasse("Guerreiro", 20), 0);
  eq("multiclasse pega o maior", circuloMaximo({ classes: [{ nome: "Guerreiro", nivel: 10 }, { nome: "Clérigo", nivel: 9 }] }), 3);
  eq("Ladrão Arcano dá 4º", circuloMaximo({ classes: [{ nome: "Ladino", nivel: 13 }], ladraoArcano: true }), 4);
  eq("sem classe conhecida usa a maior magia", circuloMaximo({ classes: [{ nome: "Sábio", nivel: 9 }], maiorMagia: 2 }), 2);
  eq("classe conhecida ignora a maior magia", circuloMaximo({ classes: [{ nome: "Arcanista", nivel: 1 }], maiorMagia: 3 }), 1);
  eq("lê 'Requer 3º círculo'", circuloExigido("muda a duração para cena. Requer 3º círculo."), 3);
  eq("lê 'Requer 4° Círculo' com grau", circuloExigido("Requer 4° Círculo."), 4);
  eq("lê quebra de linha", circuloExigido("Requer 3º\ncírculo."), 3);
  eq("sem exigência", circuloExigido("muda o alcance para curto."), 0);
  eq("detecta limitado pelo círculo", limitadoPorCirculo("aumenta o bônus em +1 (bônus máximo limitado pelo círculo máximo de magia que você pode lançar)."), true);
  eq("limitado pelo círculo: 1 clique por círculo", vezesPorCirculo(3), 3);
  eq("1º círculo deixa 1", vezesPorCirculo(1), 1);
  eq("sem foco: 3 PM = CD 23", cdSemFoco({ custo: 3, temCusto: true }), 23);
  eq("sem foco: custo 0 com custo vira 1", cdSemFoco({ custo: 0, temCusto: true }), 21);
  eq("sem foco: soma custoPM da ficha", cdSemFoco({ custo: 3, temCusto: true, extra: 1 }), 24);
  eq("sem foco: truque = CD 20", cdSemFoco({ custo: 1, temCusto: true, truque: true }), 20);
  eq("sem foco: metade arredonda pra baixo", cdSemFoco({ custo: 5, temCusto: true, metade: true }), 22);
  eq("20 natural", vinteNatural({ dice: [{ faces: 20, total: 20 }] }), true);
  eq("19 não é 20 natural", vinteNatural({ dice: [{ faces: 20, total: 19 }] }), false);
  eq("20 no d6 não conta", vinteNatural({ dice: [{ faces: 6, total: 20 }, { faces: 20, total: 3 }] }), false);
  eq("sem rolagem", vinteNatural(null), false);

  const ruins = ok.filter(([, bom]) => !bom);
  for (const [nome, , a, b] of ruins) console.error(`FALHOU: ${nome} — ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  console.log(`${ok.length - ruins.length}/${ok.length} checagens passaram`);
  return ruins.length === 0;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("regras.mjs")) {
  process.exit(check() ? 0 : 1);
}
