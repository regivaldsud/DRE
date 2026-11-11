/* Tabelas normativas (NBR 7229 / NBR 13969 / NBR 8160) e dados de referência do app.
 * Módulo sem dependências — roda em Node (require) e no navegador (window.DRE_DATA). */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DRE_DATA = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TABELA1 = [
    { name:"Alojamento provisório / Quartel (efetivo militar)", group:"Ocupantes permanentes", unit:"pessoa", C:80,  Lf:1.0,  recommended:true },
    { name:"Residência — padrão alto",                          group:"Ocupantes permanentes", unit:"pessoa", C:160, Lf:1.0 },
    { name:"Residência — padrão médio",                         group:"Ocupantes permanentes", unit:"pessoa", C:130, Lf:1.0 },
    { name:"Residência — padrão baixo",                         group:"Ocupantes permanentes", unit:"pessoa", C:100, Lf:1.0 },
    { name:"Hotel (exceto lavanderia e cozinha)",                group:"Ocupantes permanentes", unit:"pessoa", C:100, Lf:1.0 },
    { name:"Fábrica em geral",                                   group:"Ocupantes temporários", unit:"pessoa", C:70,  Lf:0.3 },
    { name:"Escritório",                                         group:"Ocupantes temporários", unit:"pessoa", C:50,  Lf:0.2 },
    { name:"Edifícios públicos ou comerciais",                   group:"Ocupantes temporários", unit:"pessoa", C:50,  Lf:0.2 },
    { name:"Escolas (externatos) e locais de longa permanência", group:"Ocupantes temporários", unit:"pessoa", C:50,  Lf:0.2 },
    { name:"Bares",                                              group:"Ocupantes temporários", unit:"pessoa", C:6,   Lf:0.1 },
    { name:"Restaurantes e similares (rancho/cozinha)",          group:"Ocupantes temporários", unit:"refeição", C:25, Lf:0.1, note:"unidade: refeição/dia" },
    { name:"Cinemas, teatros e locais de curta permanência",     group:"Ocupantes temporários", unit:"lugar", C:2, Lf:0.02, note:"unidade: lugar" },
    { name:"Sanitários públicos",                                group:"Ocupantes temporários", unit:"vaso sanit.", C:480, Lf:4.0, note:"unidade: vaso sanitário" },
    { name:"Personalizado (digitar C e Lf manualmente)",         group:"Outros", unit:"—", C:null, Lf:null, custom:true }
  ];
  var CUSTOM_IDX = TABELA1.length - 1;

  var TABELA2 = [
    { upto:1500, T:1.00, h:24, label:"até 1.500" },
    { upto:3000, T:0.92, h:22, label:"1.501 – 3.000" },
    { upto:4500, T:0.83, h:20, label:"3.001 – 4.500" },
    { upto:6000, T:0.75, h:18, label:"4.501 – 6.000" },
    { upto:7500, T:0.67, h:16, label:"6.001 – 7.500" },
    { upto:9000, T:0.58, h:14, label:"7.501 – 9.000" },
    { upto:Infinity, T:0.50, h:12, label:"mais que 9.000" }
  ];

  /* NBR 7229:1993, Tabela 3 — taxa de acumulação total de lodo K (em dias), em
   * função do intervalo entre limpezas E da temperatura ambiente média do mês mais
   * frio. Kt = [ t <= 10 °C , 10 °C < t <= 20 °C , t > 20 °C ].
   * REVISÃO v6.0: a versão anterior trazia uma única coluna (t > 20 °C) e uma linha
   * de "6 meses" que NÃO existe na norma — o intervalo mínimo tabelado é de 1 ano.
   * A linha foi removida e a temperatura passou a ser um dado de entrada. */
  var TABELA3 = [
    { anos:1, Kt:[ 94,  65,  57] },
    { anos:2, Kt:[134, 105,  97] },
    { anos:3, Kt:[174, 145, 137] },
    { anos:4, Kt:[214, 185, 177] },
    { anos:5, Kt:[254, 225, 217] }
  ];
  // K "padrão" (retrocompatibilidade): coluna t > 20 °C.
  TABELA3.forEach(function(l){ l.K = l.Kt[2]; });

  var TEMP_FAIXAS = [
    { label:"t \u2264 10 \u00B0C",              curto:"\u2264 10 \u00B0C",   desc:"m\u00EAs mais frio com m\u00E9dia at\u00E9 10 \u00B0C" },
    { label:"10 \u00B0C < t \u2264 20 \u00B0C", curto:"10\u201320 \u00B0C", desc:"m\u00EAs mais frio entre 10 \u00B0C e 20 \u00B0C" },
    { label:"t > 20 \u00B0C",                   curto:"> 20 \u00B0C",        desc:"m\u00EAs mais frio acima de 20 \u00B0C \u2014 caso de Boa Vista/RR e da maior parte do Norte/Nordeste" }
  ];

  /* NBR 13969:1997 — volume útil mínimo do filtro anaeróbio. */
  var FILTRO_VOL_MIN_L = 1000;

  var TABELA4 = [
    { upto:6.0,  min:1.2, max:2.2, label:"até 6,0" },
    { upto:10.0, min:1.5, max:2.5, label:"6,0 – 10,0" },
    { upto:Infinity, min:1.8, max:2.8, label:"mais que 10,0" }
  ];

  var TABELA5 = [
    { perc:40, taxa:0.20 }, { perc:80, taxa:0.14 }, { perc:120, taxa:0.12 },
    { perc:160, taxa:0.10 }, { perc:200, taxa:0.09 }, { perc:400, taxa:0.065 },
    { perc:600, taxa:0.053 }, { perc:1200, taxa:0.037 }, { perc:1400, taxa:0.032 }, { perc:2400, taxa:0.024 }
  ];

  /* NBR 8160:1999 — caixas de gordura.
   * REVISÃO v6.0: na versão anterior a coluna "parte submersa do septo" trazia, na
   * verdade, o DIÂMETRO INTERNO mínimo da caixa (0,30 / 0,40 / 0,60 m). Pela norma a
   * parte submersa do septo é 0,20 m nas caixas cilíndricas (CGP/CGS/CGD) e 0,40 m na
   * caixa especial (CGE). As duas informações passaram a ser colunas distintas. */
  var TABELA_CG = [
    { min:1, max:1,  tipo:"CGP — pequena (1 cozinha)",  diam:"0,30 m (cilíndrica)", septo:"0,20 m", cap:"18 L",  dn:"DN 75",  footprint:{c:0.5,l:0.5,h:0.5} },
    { min:2, max:2,  tipo:"CGS — simples (2 cozinhas)", diam:"0,40 m (cilíndrica)", septo:"0,20 m", cap:"31 L",  dn:"DN 75",  footprint:{c:0.6,l:0.6,h:0.5} },
    { min:3, max:12, tipo:"CGD — dupla (3 a 12 cozinhas)", diam:"0,60 m (cilíndrica)", septo:"0,20 m", cap:"120 L", dn:"DN 100", footprint:{c:0.9,l:0.9,h:0.6} },
    { min:13, max:Infinity, tipo:"CGE — especial (prismática, +12 cozinhas)", diam:"livre — altura útil mín. 0,40 m", septo:"0,40 m", cap:"V = 2×N + 20 (L), N = refeições/dia", dn:"DN 100", footprint:{c:1.0,l:1.0,h:0.6}, formula:true }
  ];

  // Tabela real de bitolas CA-50 (área e massa linear) — mesma referência da planilha
  // uma planilha de referência para o quantitativo de armadura.
  var DN_STEEL_TABLE = [
    { dn:6.3,  area:0.312, kgm:0.245 },
    { dn:8,    area:0.503, kgm:0.395 },
    { dn:10,   area:0.785, kgm:0.617 },
    { dn:12.5, area:1.227, kgm:0.963 },
    { dn:16,   area:2.011, kgm:1.578 },
    { dn:20,   area:3.142, kgm:2.466 },
    { dn:25,   area:4.909, kgm:3.853 }
  ];

  var DN_OPTIONS = [
    { mm:75,  pol:'75 mm / 3"' },
    { mm:100, pol:'100 mm / 4"' },
    { mm:150, pol:'150 mm / 6"' }
  ];

  // Declividade mínima usual de tubulação de esgoto por DN (prática de projeto
  // hidrossanitário — NBR 8160 trata de instalações prediais; para as interligações
  // fossa→filtro→sumidouro adota-se a mesma referência de mercado). Quanto maior o
  // DN, menor a declividade mínima necessária para manter a velocidade de autolimpeza.
  var DN_DECLIVIDADE_MIN = [
    { mm:75,  pct:2.0 },
    { mm:100, pct:1.0 },
    { mm:150, pct:0.6 }
  ];

  // Função/processo de cada unidade, conforme a norma que a rege — texto usado nos
  // desenhos técnicos (aba Projeto) para explicar o que cada módulo faz e o que a
  // norma exige que ele tenha.
  var MODULE_PROCESS_INFO = {
    fossa: {
      norma: "NBR 7229:1993",
      funcao: "Tratamento primário — decantação e digestão anaeróbia",
      processo: "O esgoto bruto entra e fica retido (tempo de detenção T); os sólidos mais densos decantam e formam o lodo no fundo, óleos/graxas mais leves sobem e formam a escuma na superfície. Bactérias anaeróbias digerem parte do lodo, reduzindo seu volume. O líquido clarificado (entre a escuma e o lodo) sai pelo dispositivo de saída submerso.",
      requisitos: [
        "Volume mínimo = 1000 L + N×(C×T + K×Lf) — Tabela de contribuição, tempo de detenção e taxa de lodo",
        "Dispositivos de entrada/saída submersos (retêm escuma; NÃO passagem livre)",
        "Tampa de inspeção removível para limpeza/desobstrução periódica",
        "Câmara dupla (2/3 + 1/3) quando comprimento ≥ 2× a largura",
        "Profundidade útil dentro da faixa da Tabela 4 (1,20–2,80 m conforme o volume); largura interna mínima 0,80 m e relação comprimento/largura entre 2:1 e 4:1",
        "Limpeza (remoção de lodo) no intervalo definido pela Tabela 3 (K)"
      ]
    },
    filtro: {
      norma: "NBR 13969:1997",
      funcao: "Tratamento secundário — pós-tratamento por biofilme fixo",
      processo: "Recebe o efluente já clarificado da fossa e o percola em fluxo ascendente através de um meio filtrante granular (brita). Bactérias anaeróbias aderidas à superfície da brita (biofilme) consomem a matéria orgânica remanescente, reduzindo ainda mais a DBO antes da disposição final.",
      requisitos: [
        "Volume útil mínimo = 1,6 × N×C×T, nunca inferior a 1000 L (piso normativo da NBR 13969)",
        "Meio filtrante granular (brita) preenchendo todo o volume útil",
        "Fluxo ascendente — entrada pelo fundo, saída pelo topo",
        "Tampa de inspeção para eventual limpeza/troca do meio filtrante"
      ]
    },
    sumidouro: {
      norma: "NBR 13969:1997",
      funcao: "Disposição final — infiltração no solo",
      processo: "Recebe o efluente já tratado (fossa + filtro) e o infiltra no solo através das paredes (e eventualmente do fundo) por percolação. A capacidade de absorção do terreno é o fator limitante — determinada pelo ensaio de percolação (tempo T em min/m, convertido em taxa de aplicação).",
      requisitos: [
        "Área mínima = vazão ÷ taxa de percolação do solo (ensaio de campo ou tabela de referência)",
        "Paredes permeáveis/perfuradas — alvenaria vazada, sem revestimento impermeabilizante",
        "Sem radier (fundo aberto, também contribui para a infiltração quando o solo permite)",
        "Afastamentos mínimos (NBR 7229, 6.1): 1,50 m de construções, limites de terreno e outros sumidouros; 3,00 m de árvores e de qualquer ponto da rede pública de abastecimento de água; 15,00 m de poços freáticos e de corpos de água de qualquer natureza",
        "Fundo acima do lençol freático — evitar contato direto com água subterrânea (referência usual: ≥ 1,50 m)"
      ]
    }
  };

  // NBR 6118:2014, Tabela 7.2 — cobrimento nominal mínimo (cm) para viga/pilar, por
  // classe de agressividade ambiental (admite Δc=0, concreto conforme Tabela 7.1).
  // Fossa/filtro/sumidouro ficam enterrados e em contato com efluente — Classe III
  // (forte) é o padrão sugerido; ajustável conforme o solo/lençol do local.
  var CLASSE_AGRESSIVIDADE = [
    { classe:"I",   desc:"Fraca — rural / submersa",                cobrimentoVigaPilar:2.5 },
    { classe:"II",  desc:"Moderada — urbana",                        cobrimentoVigaPilar:3.0 },
    { classe:"III", desc:"Forte — enterrada / contato com efluente", cobrimentoVigaPilar:4.0 },
    { classe:"IV",  desc:"Muito forte — industrial agressivo",       cobrimentoVigaPilar:5.0 }
  ];

  var TERRAIN_PRESETS = [
    { id:"amplo", label:"Amplo (padrão)", desc:"Terreno com espaço suficiente em planta — dimensões equilibradas, profundidade moderada.",
      larg:1.6, fossa:{comp:4.6,h:2.4}, filtro:{comp:5.6,h:1.67}, sumid:{comp:5.8,h:3.0} },
    { id:"estreito", label:"Estreito e comprido", desc:"Lote estreito (frente pequena) — reduz a largura e alonga os módulos.",
      larg:1.1, fossa:{comp:6.6,h:2.4}, filtro:{comp:7.8,h:1.67}, sumid:{comp:7.6,h:2.6} },
    { id:"compacto", label:"Compacto (área reduzida)", desc:"Pouca área disponível em planta — aumenta largura e profundidade, reduz comprimento.",
      larg:2.4, fossa:{comp:3.0,h:2.6}, filtro:{comp:3.6,h:1.8}, sumid:{comp:3.8,h:3.4} },
    { id:"raso", label:"Raso (lençol freático alto)", desc:"Profundidade limitada pelo lençol freático — módulos mais largos/compridos e rasos.",
      larg:2.0, fossa:{comp:5.6,h:1.7}, filtro:{comp:6.6,h:1.2}, sumid:{comp:6.8,h:1.8} }
  ];

  return {
    TABELA1: TABELA1, CUSTOM_IDX: CUSTOM_IDX,
    TABELA2: TABELA2, TABELA3: TABELA3, TABELA4: TABELA4, TABELA5: TABELA5,
    TABELA_CG: TABELA_CG, DN_STEEL_TABLE: DN_STEEL_TABLE, DN_OPTIONS: DN_OPTIONS,
    TEMP_FAIXAS: TEMP_FAIXAS, FILTRO_VOL_MIN_L: FILTRO_VOL_MIN_L,
    TERRAIN_PRESETS: TERRAIN_PRESETS, CLASSE_AGRESSIVIDADE: CLASSE_AGRESSIVIDADE,
    DN_DECLIVIDADE_MIN: DN_DECLIVIDADE_MIN, MODULE_PROCESS_INFO: MODULE_PROCESS_INFO
  };
}));
