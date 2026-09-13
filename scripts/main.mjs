/**
 * t20-pm-maximo — o limite de PM por uso, aplicado na hora de usar.
 *
 * O sistema mostra os aprimoramentos e soma o custo, mas não impede ninguém de
 * passar do limite de gasto (nível na classe que dá a habilidade; nível de
 * personagem para raça, origem e poder geral) nem de usar uma habilidade sem
 * PM. Este módulo entra no diálogo de uso (`AbilityUseDialog`, o mesmo de magia
 * e de poder), desliga o que não cabe e segura o botão de usar.
 *
 * Casa com o t20-fabricar: os dois leem o mesmo limite.
 */
import { FONTE, limiteDePM, podeSomar, temPM, tetoDoUso, circuloMaximo, circuloExigido, limitadoPorCirculo, vezesPorCirculo } from "./regras.mjs";

const ID = "t20-pm-maximo";
/** "Você soma seu atributo-chave no limite de PM que pode gastar numa magia." */
const MAGIA_ILIMITADA = /magia\s+ilimitada/i;

/** Maior círculo de magia que a ficha lança (classes conhecidas, Ladrão Arcano, ou a maior magia). */
const circuloMaximoDe = (actor) =>
  circuloMaximo({
    classes: actor.items.filter((i) => i.type === "classe").map((i) => ({ nome: i.name, nivel: i.system.niveis })),
    ladraoArcano: actor.items.some((i) => i.type === "poder" && /ladr[aã]o\s+arcano/i.test(i.name)),
    maiorMagia: Math.max(0, ...actor.items.filter((i) => i.type === "magia").map((i) => Number(i.system.circulo) || 0)),
  });

const temMagiaIlimitada = (actor) =>
  actor.items.some((i) => ["poder", "classe"].includes(i.type) && MAGIA_ILIMITADA.test(i.name));

Hooks.once("init", () => {
  game.settings.register(ID, "bloquear", {
    name: "Impedir de passar do limite",
    hint: "Desligado, o módulo só avisa (útil se a mesa usa alguma regra caseira).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

/**
 * Atributo-chave de conjuração. A ficha já guarda isso no seletor ao lado da CD
 * (`system.attributes.conjuracao`); só perguntamos quando está vazio, e a
 * resposta vai para a própria ficha — assim vale para o sistema inteiro.
 */
async function atributoChaveDe(actor) {
  const chave = actor.system.attributes?.conjuracao;
  if (chave) return Number(actor.system.atributos?.[chave]?.value ?? 0);
  if (!actor.isOwner) return 0;

  const opcoes = Object.entries(CONFIG.T20.atributos)
    .map(([k, rot]) => `<option value="${k}">${game.i18n.localize(rot)}</option>`)
    .join("");
  const escolhido = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Magia Ilimitada — atributo-chave" },
    content: `<p>${actor.name} tem <b>Magia Ilimitada</b>, que soma o atributo-chave ao limite de PM.
      Qual é o atributo de conjuração?</p>
      <div class="form-group"><label>Atributo</label><select name="atr">${opcoes}</select></div>`,
    ok: {
      label: "Guardar",
      callback: (_ev, _b, dlg) => dlg.element.querySelector('[name="atr"]').value,
    },
    rejectClose: false,
  });
  if (!escolhido) return 0;
  await actor.update({ "system.attributes.conjuracao": escolhido });
  return Number(actor.system.atributos?.[escolhido]?.value ?? 0);
}

/** Limite de PM para usar ESTE item. */
async function limiteDoItem(item) {
  const actor = item.actor;
  if (!actor) return Infinity;
  const ehMagia = item.type === "magia";
  // Habilidade de classe e magia seguem o nível na classe; o resto (raça,
  // origem, poder geral) segue o nível de personagem. Sem dado de "qual classe
  // deu isto", a classe conjuradora é a de maior nível — vale para todo mundo
  // que não é multiclasse, e o mestre corrige no aviso.
  const niveisDeClasse = actor.items.filter((i) => i.type === "classe").map((i) => Number(i.system.niveis) || 0);
  const nivelPersonagem = Number(actor.system.attributes?.nivel?.value) || Math.max(0, ...niveisDeClasse, 0);
  const magiaIlimitada = ehMagia && temMagiaIlimitada(actor);
  return limiteDePM({
    fonte: ehMagia || item.system?.tipo === "classe" ? FONTE.CLASSE : FONTE.PERSONAGEM,
    nivelClasse: Math.max(0, ...niveisDeClasse, 0),
    nivelPersonagem,
    ehMagia,
    magiaIlimitada,
    atributoChave: magiaIlimitada ? await atributoChaveDe(actor) : 0,
  });
}

/** Aprimoramentos como o diálogo os mostra: campo `aplica` + custo escondido ao lado.
 * Lido do formulário porque o sistema mistura efeitos do item e do ator (Tomo Hermético). */
function camposDoDialogo(form) {
  return [...form.querySelectorAll('[name^="aprs."][name$=".aplica"]')].map((campo) => {
    const id = campo.name.slice(5, -7);
    const custo = Number(form.querySelector(`[name="aprs.${id}.custo"]`)?.value) || 0; // "Truque" → 0
    const texto = campo.closest("li")?.querySelector(".item-name")?.textContent ?? "";
    return { campo, custo, texto };
  });
}

/** Custo somado do que está marcado no diálogo de uso. */
function custoMarcado(form, base) {
  let custo = Number(base) || 0;
  for (const { campo, custo: custoAp } of camposDoDialogo(form)) {
    const vezes = campo.type === "checkbox" ? (campo.checked ? 1 : 0) : Number(campo.value) || 0;
    custo += vezes * custoAp;
  }
  return custo;
}

/* O diálogo de uso do sistema (magia, poder, item) — AppV1, hook por classe. */
Hooks.on("renderAbilityUseDialog", async (app, html) => {
  const item = app.item;
  const actor = item?.actor;
  if (!actor || actor.type !== "character") return;
  const raiz = html instanceof HTMLElement ? html : html[0];
  const form = raiz.querySelector("form") ?? raiz;

  const pm = actor.system.attributes?.pm ?? { value: 0, temp: 0 };
  const base = Number(item.system?.ativacao?.custo) || 0;
  const limite = await limiteDoItem(item);
  const teto = tetoDoUso(limite, pm);
  const bloquear = game.settings.get(ID, "bloquear");
  const circuloMax = item.type === "magia" ? circuloMaximoDe(actor) : 0;

  // Sem PM nem para o custo mínimo: nem abre para gastar.
  if (!temPM(base, pm)) {
    ui.notifications?.warn(`${actor.name} não tem PM para usar ${item.name} (custo ${base}, PM ${pm.value}).`);
    if (bloquear) {
      raiz.querySelectorAll("button").forEach((b) => {
        if (b.dataset.button !== "cancel" && !/cancel/i.test(b.className)) b.disabled = true;
      });
      return;
    }
  }

  const aviso = document.createElement("p");
  aviso.className = "t20pm-aviso";
  form.prepend(aviso);

  // Aprimoramento que pede círculo que a ficha não tem: some do jogo (uma vez só).
  if (bloquear && circuloMax) {
    for (const { campo, texto } of camposDoDialogo(form)) {
      if (circuloExigido(texto) <= circuloMax) continue;
      campo.disabled = true;
      if (campo.type === "checkbox") campo.checked = false;
      else campo.value = "0";
      campo.closest("li")?.classList.add("t20pm-sem-circulo");
    }
  }

  const atualizar = () => {
    let custo = custoMarcado(form, base);

    if (bloquear) {
      // O –/+ do sistema ignora `max`: passou do teto, volta o campo e reconta.
      for (const { campo, custo: custoAp, texto } of camposDoDialogo(form)) {
        if (campo.type === "checkbox" || custoAp <= 0) continue;
        const atual = Number(campo.value) || 0;
        let maximo = atual + Math.floor((teto - custo) / custoAp);
        if (circuloMax && limitadoPorCirculo(texto)) maximo = Math.min(maximo, vezesPorCirculo(circuloMax));
        campo.max = String(Math.max(atual, maximo, 0));
        if (atual > maximo && maximo >= 0) {
          campo.value = String(maximo);
          custo = custoMarcado(form, base);
          app._onInputChange?.(app.element); // o total de PM do sistema já tinha somado o clique
        }
      }
      // Desliga o checkbox que não cabe mais.
      for (const { campo, custo: custoAp } of camposDoDialogo(form)) {
        if (campo.type === "checkbox" && !campo.checked) campo.disabled = !podeSomar(custo, custoAp, teto);
      }
    }

    const sobra = teto - custo;
    aviso.innerHTML = `<b>Limite de PM:</b> ${limite}${circuloMax ? ` · <b>círculo máximo:</b> ${circuloMax}º` : ""}${
      limite !== teto ? ` <span class="t20pm-obs">(você só tem ${pm.value + (pm.temp || 0)} PM)</span>` : ""
    } · <b>gastando ${custo}</b>${sobra < 0 ? ' <span class="t20pm-ruim">acima do limite</span>' : ""}`;

    if (bloquear) {
      raiz.querySelectorAll("button").forEach((b) => {
        if (b.classList.contains("numCtrl") || b.dataset.button === "cancel" || /cancel/i.test(b.className)) return;
        b.disabled = custo > teto && custo > base;
      });
    }
  };

  form.addEventListener("change", atualizar);
  form.addEventListener("click", () => setTimeout(atualizar, 0)); // os botões –/+ do sistema
  atualizar();
  botoesDeEscolha(app, raiz);
});

/* ──────────────────── escolher 10 / escolher 20 ────────────────────
 * O livro deixa escolher 10 (sem pressa e sem risco) ou 20 (20× o tempo) em
 * vez de rolar. O sistema não tem isso, e o d20 é criado dentro de uma função
 * interna — então o caminho é: o botão marca a intenção, a rolagem acontece
 * normal (com todos os bônus que o jogador aplicar) e, antes do card ir para o
 * chat, trocamos o resultado do d20 pelo valor escolhido.
 */
let escolhaPendente = null;

function botoesDeEscolha(app, raiz) {
  const barra = raiz.closest(".app")?.querySelector(".dialog-buttons") ?? raiz.querySelector(".dialog-buttons");
  if (!barra || barra.querySelector(".t20pm-escolher")) return;
  const actor = app.item?.actor;
  if (!actor || app.item?.type !== "pericia") return; // escolher 10/20 é regra de teste de perícia

  const criar = (valor) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "t20pm-escolher";
    b.innerHTML = `<i class="fas fa-hand-pointer"></i> Escolher ${valor}`;
    b.title =
      valor === 10
        ? "Sem pressa e sem risco: o d20 vale 10 (Tormenta20 p. 103)."
        : "Leva 20× o tempo e só vale sem risco de falha: o d20 vale 20.";
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      escolhaPendente = { actorId: actor.id, valor, quando: Date.now() };
      // Segue o fluxo normal do sistema: aplica o que o jogador marcou.
      barra.querySelector("button:not(.t20pm-escolher)")?.click();
    });
    return b;
  };
  // 10 à esquerda, o botão de rolar do sistema no meio, 20 à direita.
  barra.prepend(criar(10));
  barra.append(criar(20));
  barra.classList.add("t20pm-barra");
  // A janela foi medida antes dos nossos botões e do aviso: remedir para não
  // sobrar rolagem interna.
  requestAnimationFrame(() => app.setPosition({ height: "auto" }));
}

Hooks.on("preCreateChatMessage", (msg) => {
  const pendente = escolhaPendente;
  if (!pendente) return;
  // Vale só para a rolagem que veio logo em seguida.
  if (Date.now() - pendente.quando > 15000) {
    escolhaPendente = null;
    return;
  }
  const rolls = msg.rolls ?? [];
  const trocados = [];
  for (const roll of rolls) {
    const d20 = roll.dice?.find((d) => d.faces === 20);
    if (!d20) {
      trocados.push(roll);
      continue;
    }
    const antes = d20.total;
    for (const r of d20.results) r.result = pendente.valor;
    roll._total = Math.round((roll.total - antes + d20.total) * 100) / 100;
    trocados.push(roll);
  }
  if (!trocados.length) return;
  escolhaPendente = null;
  msg.updateSource({
    rolls: trocados.map((r) => JSON.stringify(r)),
    flavor: `${msg.flavor ?? ""} <em>(escolheu ${pendente.valor})</em>`,
  });
});

globalThis.t20PmMaximo = { limiteDoItem, escolher: (valor) => (escolhaPendente = { valor, quando: Date.now() }) };
