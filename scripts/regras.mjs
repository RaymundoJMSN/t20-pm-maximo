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
 */

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
 */
export function limiteDePM({
  fonte = FONTE.PERSONAGEM,
  nivelClasse = 0,
  nivelPersonagem = 0,
  magiaIlimitada = false,
  atributoChave = 0,
  ehMagia = false,
} = {}) {
  const base = fonte === FONTE.CLASSE ? nivelClasse : nivelPersonagem;
  const extra = ehMagia && magiaIlimitada ? Math.max(0, Number(atributoChave) || 0) : 0;
  return Math.max(1, base + extra); // sempre dá para gastar pelo menos 1
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

  const ruins = ok.filter(([, bom]) => !bom);
  for (const [nome, , a, b] of ruins) console.error(`FALHOU: ${nome} — ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  console.log(`${ok.length - ruins.length}/${ok.length} checagens passaram`);
  return ruins.length === 0;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("regras.mjs")) {
  process.exit(check() ? 0 : 1);
}
