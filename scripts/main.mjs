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
import { FONTE, limiteDePM, podeSomar, temPM, tetoDoUso } from "./regras.mjs";

const ID = "t20-pm-maximo";
/** "Você soma seu atributo-chave no limite de PM que pode gastar numa magia." */
const MAGIA_ILIMITADA = /magia\s+ilimitada/i;

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

/** Custo somado do que está marcado no diálogo de uso. */
function custoMarcado(form, aprimoramentos, base) {
  let custo = Number(base) || 0;
  for (const ap of aprimoramentos) {
    const campo = form.querySelector(`[name="aprs.${ap.id}.aplica"]`);
    if (!campo) continue;
    const vezes = campo.type === "checkbox" ? (campo.checked ? 1 : 0) : Number(campo.value) || 0;
    custo += vezes * (Number(ap.flags?.tormenta20?.custo) || 0);
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
  const aprimoramentos = item.effects.filter((e) => e.flags?.tormenta20?.onuse);
  const teto = tetoDoUso(limite, pm);
  const bloquear = game.settings.get(ID, "bloquear");

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

  const atualizar = () => {
    const custo = custoMarcado(form, aprimoramentos, base);
    const sobra = teto - custo;
    aviso.innerHTML = `<b>Limite de PM:</b> ${limite}${
      limite !== teto ? ` <span class="t20pm-obs">(você só tem ${pm.value + (pm.temp || 0)} PM)</span>` : ""
    } · <b>gastando ${custo}</b>${sobra < 0 ? ' <span class="t20pm-ruim">acima do limite</span>' : ""}`;

    // Desliga o que não cabe mais (checkbox) e limita o passo a passo (número).
    for (const ap of aprimoramentos) {
      const campo = form.querySelector(`[name="aprs.${ap.id}.aplica"]`);
      if (!campo) continue;
      const custoAp = Number(ap.flags?.tormenta20?.custo) || 0;
      if (campo.type === "checkbox") {
        if (!campo.checked && bloquear) campo.disabled = !podeSomar(custo, custoAp, teto);
      } else {
        const atual = Number(campo.value) || 0;
        const maximo = custoAp > 0 ? atual + Math.max(0, Math.floor((teto - custo) / custoAp)) : 99;
        if (bloquear) campo.max = String(maximo);
        if (bloquear && atual > maximo) campo.value = String(maximo);
      }
    }

    if (bloquear) {
      raiz.querySelectorAll("button").forEach((b) => {
        if (b.dataset.button === "cancel" || /cancel/i.test(b.className)) return;
        b.disabled = custo > teto && custo > base;
      });
    }
  };

  form.addEventListener("change", atualizar);
  form.addEventListener("click", () => setTimeout(atualizar, 0)); // os botões –/+ do sistema
  atualizar();
});

globalThis.t20PmMaximo = { limiteDoItem };
