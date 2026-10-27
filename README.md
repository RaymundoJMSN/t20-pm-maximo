# PM Máximo — Tormenta20

Módulo do Foundry VTT (v13, sistema **Tormenta20**) que aplica o **limite de gasto de PM por
uso** (Livro Básico p. 106) e os **limites de círculo** dos aprimoramentos, direto no diálogo de
uso de magia/poder/item.

## O que faz

- **Limite de PM**: nível na classe que fornece a habilidade (magia, habilidade de classe) ou
  nível de personagem (raça, origem, poder geral). **Magia Ilimitada** soma o atributo-chave
  (arcanista de 5º com Int 4 = 9 PM). O atributo sai do seletor de conjuração da ficha; se
  estiver vazio, pergunta uma vez e grava. **Poder Sem Limites** (concedido de Kallyadranoch)
  soma o patamar (1/2/3/4) no limite de tudo que não é magia. A parte de CD do poder fica de
  fora — este módulo só cuida de PM.
- No diálogo de uso: mostra "limite × gastando", desliga o checkbox que não cabe, limita o
  campo −/+ dos aprimoramentos de "aumentar" (inclusive os que vêm da ficha, como Tomo Hermético)
  e segura o botão de usar. Sem PM nem para o custo mínimo, avisa e não deixa usar.
- **Círculo máximo** da ficha (arcanista/clérigo/frade e variantes: 5/9/13/17; bardo/druida/
  ventanista e variantes: 6/10/14; Ladrão Arcano: 4º; multiclasse pega o maior):
  - aprimoramento com "**Requer Nº círculo**" acima do alcançado some do diálogo;
  - aprimoramento "**limitado pelo círculo máximo**" aceita um clique por círculo.
- **Escolher 10 / Escolher 20** em testes de perícia (o d20 vale 10 ou 20, com os bônus da
  ficha), como regra do livro p. 103.
- Opção de mundo "Impedir de passar do limite": desligada, o módulo só avisa.
- **Conjurar sem foco** (poder caseiro): caixinha em Configurações de Personagem, abaixo de
  "Escrever Pergaminhos". Ligada, toda magia rola Misticismo contra **CD 20 + PM gasto**; falhou,
  os PM vão embora e o card da magia não aparece. Se o teste for alterado depois e passar
  (Inspiração, bônus), o card sai. O card pendente fica na memória de quem conjurou (F5 perde).

Multiclasse é aproximação: sem dado de "qual classe deu esta habilidade", usa a classe de maior
nível.

## Instalação

Copie (ou clone) a pasta para `Data/modules/t20-pm-maximo` e ative o módulo no mundo.

## Desenvolvimento

Regras puras em `scripts/regras.mjs`:

```bash
node scripts/regras.mjs --check
```
