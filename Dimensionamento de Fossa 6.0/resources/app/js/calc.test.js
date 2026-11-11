/* Testes de regressão do núcleo de cálculo (js/calc.js).
 * Rodar com: node --test app/js
 * Os valores "golden" abaixo foram conferidos manualmente rodando o app (ver
 * histórico do projeto) antes da extração destas funções — qualquer alteração
 * de fórmula que mude esses números precisa ser justificada, não "consertada". */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var calc = require("./calc.js");

test("calcularEmpuxo integra o caso trapezoidal da planilha do sumidouro", function(){
  var r = calc.calcularEmpuxo({ height:2.5, ka:1/3, soilWeight:18, surcharge:5, influence:1.5 });
  assert.equal(r.cargaTopo, 2.5);
  assert.equal(r.cargaBase, 25);
  assert.equal(r.resultante, 34.375);
  assert.equal(r.momentoBase, 31.25);
  assert.equal(r.alturaAplicacao, 10/11);
});

test("calcularEmpuxo posiciona cargas uniformes e triangulares e trata pressão zero", function(){
  var base = { height:3, ka:0.5, soilWeight:18, surcharge:5, influence:2 };
  var uniforme = calc.calcularEmpuxo({ ...base, soilWeight:0 });
  var triangular = calc.calcularEmpuxo({ ...base, surcharge:0 });
  var zero = calc.calcularEmpuxo({ ...base, ka:0 });
  assert.equal(uniforme.alturaAplicacao, 1.5);
  assert.equal(triangular.alturaAplicacao, 1);
  assert.equal(zero.resultante, 0);
  assert.equal(zero.alturaAplicacao, null);
});

test("lookupT — limites exatos das faixas da Tabela 2 (NBR 7229)", function(){
  assert.equal(calc.lookupT(1500), 1.00);
  assert.equal(calc.lookupT(1501), 0.92);
  assert.equal(calc.lookupT(9000), 0.58);
  assert.equal(calc.lookupT(9001), 0.50);
  assert.equal(calc.lookupT(50000), 0.50);
});

test("lookupProf — faixas de profundidade útil da Tabela 4 (NBR 7229)", function(){
  assert.deepEqual(calc.lookupProf(6.0), { upto:6.0, min:1.2, max:2.2, label:"até 6,0" });
  var faixaMedia = calc.lookupProf(6.1);
  assert.equal(faixaMedia.min, 1.5);
  assert.equal(faixaMedia.max, 2.5);
  var faixaAlta = calc.lookupProf(15);
  assert.equal(faixaAlta.min, 1.8);
  assert.equal(faixaAlta.max, 2.8);
});

test("interpTaxa — interpola linearmente entre pontos e satura nas pontas", function(){
  assert.equal(calc.interpTaxa(40), 0.20);
  assert.equal(calc.interpTaxa(2400), 0.024);
  assert.equal(calc.interpTaxa(10), 0.20);       // abaixo do menor ponto -> satura
  assert.equal(calc.interpTaxa(10000), 0.024);   // acima do maior ponto -> satura
  // meio do caminho entre 40 (0.20) e 80 (0.14) -> 0.17
  assert.ok(Math.abs(calc.interpTaxa(60) - 0.17) < 1e-9);
});

test("ceilStep — arredonda para cima no passo informado", function(){
  assert.ok(Math.abs(calc.ceilStep(4.01, 0.1) - 4.1) < 1e-9);
  assert.ok(Math.abs(calc.ceilStep(4.10, 0.1) - 4.1) < 1e-9); // já exato, não deve subir pra 4.2
  assert.ok(Math.abs(calc.ceilStep(0, 0.1)) < 1e-9); // aceita 0 ou -0 (irrelevante na prática)
});

test("kgmFor — tabela real de bitolas CA-50 (mesma da planilha de referência)", function(){
  assert.equal(calc.kgmFor(10), 0.617);
  assert.equal(calc.kgmFor(6.3), 0.245);
  assert.equal(calc.kgmFor(25), 3.853);
  assert.equal(calc.kgmFor(999), 0); // bitola inexistente -> 0, não deve quebrar
});

test("dimensionar — golden: 500 pessoas em alojamento, parâmetros padrão", function(){
  var out = calc.dimensionar({
    contribs: [{ catIndex:0, N:500, customC:50, customLf:0.2 }],
    intervaloIdx: 0, tempIdx: 2,   // 1 ano, t > 20 C -> K=57
    taxaIdx: 0,        // 40 min/m -> 0.20 m3/m2.dia
    percMedido: null,
    tfiltroAuto: true, tfiltroManual: 1,
    mode: "padrao", larg: 1.6,
    fossa: { comp:4.6, h:2.4 }, filtro: { comp:5.6, h:1.67 }, sumid: { comp:5.8, h:3.0 },
    numSumUnits: 2, cgEnabled: false, cgNum: 1, cgRefeicoes: 500
  });
  // Categoria 0 = Alojamento provisório/Quartel: C=80 L/hab.dia, Lf=1.0
  // vazão = 500*80 = 40000 L/dia -> T (Tabela 2) = 0.50 (faixa "mais que 9000")
  // termoFossa = 500*(80*0.5 + 57*1.0) = 500*97 = 48500 -> Vmin fossa = 1000+48500 = 49500 L
  // termoFiltro = 500*80*0.5 = 20000 -> Vmin filtro = 1.6*20000 = 32000 L
  // Amin = (40000/1000)/0.20 = 200 m²
  assert.equal(out.K, 57);
  assert.equal(out.taxa, 0.20);
  assert.equal(out.sumN, 500);
  assert.equal(out.sumVazao, 40000);
  assert.equal(out.VminFossa, 49500);
  assert.equal(out.VminFiltro, 32000);
  assert.equal(out.Amin, 200);
  assert.equal(out.contribDetails[0].C, 80);
  assert.equal(out.contribDetails[0].Tfossa, 0.5);
});

test("dimensionar — modo 'unico' produz volume executado >= volume mínimo exigido", function(){
  var out = calc.dimensionar({
    contribs: [{ catIndex:0, N:500, customC:50, customLf:0.2 }],
    intervaloIdx: 0, tempIdx: 2, taxaIdx: 0, percMedido: null,
    tfiltroAuto: true, tfiltroManual: 1,
    mode: "unico", larg: 1.6,
    fossa: { comp:4.6, h:2.4 }, filtro: { comp:5.6, h:1.67 }, sumid: { comp:5.8, h:3.0 },
    numSumUnits: 2, cgEnabled: false, cgNum: 1, cgRefeicoes: 500
  });
  // por definição do modo otimizado, o volume/área construído nunca pode ficar
  // abaixo do mínimo normativo (senão o dimensionamento estaria sub-especificado)
  assert.ok(out.results.fossa.vol >= out.VminFossa, "volume da fossa deve atender o mínimo");
  assert.ok(out.results.filtro.vol >= out.VminFiltro, "volume do filtro deve atender o mínimo");
  assert.ok(out.results.sumid.area >= out.Amin - 1e-6, "área do sumidouro deve atender o mínimo");
});

test("dimensionar — caixa de gordura usa fórmula CGE quando >12 cozinhas", function(){
  var out = calc.dimensionar({
    contribs: [{ catIndex:0, N:10, customC:50, customLf:0.2 }],
    intervaloIdx: 0, tempIdx: 2, taxaIdx: 0, percMedido: null,
    tfiltroAuto: true, tfiltroManual: 1,
    mode: "padrao", larg: 1.6,
    fossa: { comp:4.6, h:2.4 }, filtro: { comp:5.6, h:1.67 }, sumid: { comp:5.8, h:3.0 },
    numSumUnits: 2, cgEnabled: true, cgNum: 15, cgRefeicoes: 300
  });
  assert.ok(out.cg, "caixa de gordura deveria ser calculada quando cgEnabled=true");
  // V = 2*refeições + 20 = 2*300+20 = 620 L
  assert.match(out.cg.capText, /620/);
});

function matFixture(){
  return {
    matEspacamentoMax:1.9,
    matPilarNumBarras:4, matPilarDn:10,
    matBaldrameNumBarras:4, matBaldrameDn:8,
    matMeioNumBarras:4, matMeioDn:8,
    matTopoNumBarras:4, matTopoDn:8,
    matMalhaEsp:0.20, matMalhaDn:10,
    matPilarB:0.20, matPilarH:0.19, matCobrimento:0.04,
    matEstriboPilarEsp:0.12, matEstriboVigaEsp:0.084, matEstriboDn:6.3,
    classeIdx:2
  };
}

test("computeMateriaisCore — peso total = soma dos componentes (sem perda/arredondamento indevido)", function(){
  var m = calc.computeMateriaisCore({ comp:6, larg:3.75, Hu:2, qty:1, hasRadier:true }, matFixture());
  var soma = m.pesoPilares + m.pesoVigas + m.pesoMalha + m.pesoEstribosPilar + m.pesoEstribosViga;
  assert.ok(Math.abs(soma - m.acoTotal) < 1e-9, "aço total deve ser exatamente a soma dos componentes");
  assert.ok(m.numColunas > 0 && m.pesoPilares > 0, "deve haver pilares com peso positivo");
  assert.equal(m.vigas.length, 3, "deve haver 3 níveis de viga: baldrame, meio e topo");
  m.vigas.forEach(function(v){ assert.ok(v.peso > 0, "viga "+v.key+" deve ter peso positivo"); });
});

test("computeMateriaisCore — sumidouro (hasRadier:false) não soma peso de malha", function(){
  var m = calc.computeMateriaisCore({ comp:5.8, larg:1.6, Hu:3.0, qty:2, hasRadier:false }, matFixture());
  assert.equal(m.pesoMalha, 0, "sem radier, peso da malha deve ser zero");
  assert.ok(m.pesoPilares > 0 && m.pesoVigas > 0, "pilares e vigas de amarração continuam existindo (apoio da tampa)");
});

test("verificarNormas — parâmetros padrão da UI (v6.0) atendem os mínimos NBR 6118", function(){
  var r = calc.verificarNormas(matFixture());
  assert.equal(r.allOk, true, "todos os checks deveriam passar com os valores padrão: "+JSON.stringify(r.checks.filter(function(c){return !c.ok;})));
  assert.equal(r.total, 7);
});

test("verificarNormas — detecta cobrimento abaixo do mínimo da classe de agressividade", function(){
  var mat = matFixture();
  mat.matCobrimento = 0.02; // 2 cm, abaixo do mínimo de 4,0 cm da classe III
  var r = calc.verificarNormas(mat);
  var cobrimentoCheck = r.checks[0];
  assert.equal(cobrimentoCheck.ok, false);
  assert.equal(r.allOk, false);
});

test("verificarNormas — detecta pilar abaixo da dimensão mínima (19 cm)", function(){
  var mat = matFixture();
  mat.matPilarB = 0.12; mat.matPilarH = 0.12; // 12 cm < 19 cm mínimo
  var r = calc.verificarNormas(mat);
  assert.equal(r.checks[1].ok, false, "dimensão mínima do pilar deve reprovar");
});

test("verificarNormas — detecta taxa de armadura do pilar insuficiente (seção grande, bitola fina)", function(){
  var mat = matFixture();
  mat.matPilarB = 0.40; mat.matPilarH = 0.40; // seção grande dilui a taxa de aço
  mat.matPilarNumBarras = 4; mat.matPilarDn = 6.3; // bitola fina
  var r = calc.verificarNormas(mat);
  assert.equal(r.checks[2].ok, false, "taxa de armadura deve reprovar com bitola fina em seção grande");
});

test("quedaMinima — declividade mínima por DN (quanto maior o DN, menor a declividade)", function(){
  assert.equal(calc.lookupDeclividadeMin(75), 2.0);
  assert.equal(calc.lookupDeclividadeMin(100), 1.0);
  assert.equal(calc.lookupDeclividadeMin(150), 0.6);
  assert.ok(Math.abs(calc.quedaMinima(1.0, 100) - 0.01) < 1e-9, "1,0 m a 1% = 0,01 m de queda");
  assert.ok(Math.abs(calc.quedaMinima(2.0, 75) - 0.04) < 1e-9, "2,0 m a 2% = 0,04 m de queda");
});

test("computeMateriaisAll — consolida fossa + filtro + sumidouro, total bate com a soma dos módulos", function(){
  var results = {
    fossa: { dims:[4.6, 1.6, 2.0], qty:1 },
    filtro: { dims:[5.6, 1.6, 1.67], qty:1 },
    sumid: { dims:[5.8, 1.6, 3.0], qty:2 }
  };
  var all = calc.computeMateriaisAll(results, matFixture());
  assert.equal(all.modules.sumid.pesoMalha, 0, "módulo sumidouro não tem radier");
  var somaAco = all.modules.fossa.acoTotal + all.modules.filtro.acoTotal + all.modules.sumid.acoTotal;
  assert.ok(Math.abs(somaAco - all.totals.acoTotal) < 1e-9, "aço total consolidado deve bater com a soma dos 3 módulos");
});

test("lookupK - Tabela 3 completa: K varia com o intervalo e com a temperatura", function(){
  // NBR 7229:1993, Tabela 3 - colunas t<=10 C, 10<t<=20 C, t>20 C
  assert.equal(calc.lookupK(0, 0), 94);
  assert.equal(calc.lookupK(0, 1), 65);
  assert.equal(calc.lookupK(0, 2), 57);
  assert.equal(calc.lookupK(4, 0), 254);
  assert.equal(calc.lookupK(4, 2), 217);
  assert.equal(calc.lookupK(0, undefined), 57, "sem temperatura informada usa t>20 C");
});

test("dimensionar - filtro anaerobio respeita o piso de 1000 L da NBR 13969", function(){
  var out = calc.dimensionar({
    contribs: [{ catIndex:0, N:2, customC:50, customLf:0.2 }],
    intervaloIdx: 0, tempIdx: 2, taxaIdx: 0, percMedido: null,
    tfiltroAuto: true, tfiltroManual: 1,
    mode: "padrao", larg: 1.6,
    fossa: { comp:4.6, h:2.4 }, filtro: { comp:5.6, h:1.67 }, sumid: { comp:5.8, h:3.0 },
    numSumUnits: 2, cgEnabled: false, cgNum: 1, cgRefeicoes: 500
  });
  // 2 x 80 x 1,0 x 1,6 = 256 L -> abaixo do piso normativo
  assert.equal(out.VminFiltroCalc, 256);
  assert.equal(out.VminFiltro, 1000);
  assert.equal(out.filtroPisoAplicado, true);
});

test("areaSumidouro - com e sem o fundo", function(){
  // 5,8 x 1,6 x H3,0: paredes = 2*1,6*3 + 2*5,8*3 = 44,4 ; fundo = 9,28
  assert.equal(calc.areaSumidouro(5.8, 1.6, 3.0, false).toFixed(2), "44.40");
  assert.equal(calc.areaSumidouro(5.8, 1.6, 3.0, true).toFixed(2), "53.68");
});

test("dimensionar - criterio conservador (so paredes) exige mais area de sumidouro", function(){
  var base = {
    contribs: [{ catIndex:0, N:500, customC:50, customLf:0.2 }],
    intervaloIdx: 0, tempIdx: 2, taxaIdx: 0, percMedido: null,
    tfiltroAuto: true, tfiltroManual: 1,
    mode: "padrao", larg: 1.6,
    fossa: { comp:4.6, h:2.4 }, filtro: { comp:5.6, h:1.67 }, sumid: { comp:5.8, h:3.0 },
    numSumUnits: 2, cgEnabled: false, cgNum: 1, cgRefeicoes: 500
  };
  var comFundo = calc.dimensionar(Object.assign({}, base, { contarFundoSumidouro:true }));
  var soParedes = calc.dimensionar(Object.assign({}, base, { contarFundoSumidouro:false }));
  assert.ok(soParedes.results.sumid.qty >= comFundo.results.sumid.qty);
  assert.ok(soParedes.results.sumid.area < comFundo.results.sumid.area);
});

test("lookupCG - tabela NBR 8160 revisada: septo submerso 0,20 m e diametro interno separado", function(){
  var cgp = calc.lookupCG(1), cgd = calc.lookupCG(5), cge = calc.lookupCG(20);
  assert.equal(cgp.septo, "0,20 m");
  assert.equal(cgd.septo, "0,20 m");
  assert.equal(cge.septo, "0,40 m");
  assert.ok(cgp.diam.indexOf("0,30 m") === 0);
  assert.ok(cgd.diam.indexOf("0,60 m") === 0);
});
