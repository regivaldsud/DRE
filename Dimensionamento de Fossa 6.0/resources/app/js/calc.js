/* Núcleo de cálculo (NBR 7229 / NBR 13969 / NBR 8160) — funções puras, sem DOM.
 * Roda em Node (require, usado pelos testes) e no navegador (window.DRE_CALC).
 * Qualquer mudança de fórmula deve ser feita AQUI (o script da UI só chama estas
 * funções) para não haver duas cópias da mesma conta divergindo com o tempo. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./data.js"));
  } else {
    root.DRE_CALC = factory(root.DRE_DATA);
  }
}(typeof self !== "undefined" ? self : this, function (DATA) {
  "use strict";

  var TABELA1 = DATA.TABELA1, TABELA2 = DATA.TABELA2, TABELA3 = DATA.TABELA3,
      TABELA4 = DATA.TABELA4, TABELA5 = DATA.TABELA5, TABELA_CG = DATA.TABELA_CG,
      DN_STEEL_TABLE = DATA.DN_STEEL_TABLE, CLASSE_AGRESSIVIDADE = DATA.CLASSE_AGRESSIVIDADE,
      DN_DECLIVIDADE_MIN = DATA.DN_DECLIVIDADE_MIN, FILTRO_VOL_MIN_L = DATA.FILTRO_VOL_MIN_L || 1000;

  /* K (Tabela 3 da NBR 7229) depende do intervalo entre limpezas E da temperatura
   * ambiente do mês mais frio — tempIdx: 0 = t<=10 °C, 1 = 10<t<=20 °C, 2 = t>20 °C. */
  function lookupK(intervaloIdx, tempIdx){
    var linha = TABELA3[intervaloIdx] || TABELA3[0];
    var ti = (tempIdx===0 || tempIdx===1 || tempIdx===2) ? tempIdx : 2;
    return linha.Kt ? linha.Kt[ti] : linha.K;
  }

  /* Área de infiltração do sumidouro. contarFundo=false considera só as paredes
   * laterais (critério conservador: o fundo colmata primeiro); true soma o fundo. */
  function areaSumidouro(comp, larg, h, contarFundo){
    return (contarFundo === false ? 0 : comp*larg) + 2*larg*h + 2*comp*h;
  }

  // Integra trechos lineares da pressão externa na altura da parede.
  function calcularEmpuxo(dados){
    var h = dados.height;
    var pesoAgua = 9.81;
    var nivel = Number.isFinite(dados.waterDepth) ? Math.min(h, Math.max(0,dados.waterDepth)) : h;
    var pesoSubmerso = Math.max(0,(dados.saturatedWeight ?? 20) - pesoAgua);
    function point(z){
      var submerso = Math.max(0,z-nivel);
      var solo = dados.ka * (dados.surcharge + dados.soilWeight * Math.min(z,nivel) + pesoSubmerso * submerso);
      var agua = pesoAgua * submerso;
      return { z:z, solo:solo, agua:agua, total:solo+agua };
    }
    var depths = nivel > 0 && nivel < h ? [0,nivel,h] : [0,h];
    var perfil = depths.map(point);
    var alturaFaixa = function(z){
      var v = 0, m = 0;
      for (var i=1;i<perfil.length && perfil[i-1].z<z;i++){
        var a = perfil[i-1];
        var b = point(Math.min(z,perfil[i].z));
        var dz = b.z-a.z;
        var constante = a.total * dz;
        var triangular = (b.total-a.total) * dz / 2;
        v += constante+triangular;
        m += constante*(z-a.z-dz/2) + triangular*(z-a.z-2*dz/3);
      }
      return { z:z, pressao:point(z).total, cortante:v, momento:m };
    };
    var baseFaixa = alturaFaixa(h);
    var resultante = baseFaixa.cortante*dados.influence;
    var momentoBase = baseFaixa.momento*dados.influence;
    var topo = perfil[0].total;
    var base = perfil[perfil.length-1].total;
    var amostras = Array.from({length:21},function(_,i){ return h*i/20; });
    if (depths.length === 3 && !amostras.includes(nivel)) amostras.push(nivel);
    amostras.sort(function(a,b){return a-b;});
    return {
      topo: topo, base: base, cargaTopo: topo*dados.influence, cargaBase: base*dados.influence,
      resultante: resultante, momentoBase: momentoBase,
      alturaAplicacao: resultante > 0 ? momentoBase / resultante : null,
      perfil:perfil, diagramas:amostras.map(alturaFaixa), avaliarFaixa:alturaFaixa
    };
  }

  function calcularParedesSumidouro(comprimento, largura, dados, sobrecargas){
    return [comprimento, largura, comprimento, largura].map(function(face,i){
      var q = sobrecargas[i] ?? dados.surcharge;
      var carga = calcularEmpuxo(Object.assign({},dados,{ influence:face, surcharge:q }));
      return Object.assign({ id:"P"+(i+1), face:face, surcharge:q },carga);
    });
  }

  function avaliarEscopo17076(vazao, dbo){
    return {
      vazaoExcede:vazao > 12000,
      dboExcede:Number.isFinite(dbo) && dbo > 3.8,
      dboInformada:Number.isFinite(dbo)
    };
  }

  function areaInternaSumidouro(dims, parede){
    var comprimento = Math.max(0,dims[0]-2*parede);
    var largura = Math.max(0,dims[1]-2*parede);
    var area = comprimento > 0 && largura > 0 ? areaSumidouro(comprimento,largura,dims[2],true) : 0;
    return { comprimento:comprimento, largura:largura, area:area };
  }

  function lookupDeclividadeMin(dn){
    var f = DN_DECLIVIDADE_MIN.filter(function(t){ return t.mm===dn; })[0];
    return f ? f.pct : 1.0;
  }

  /* Queda mínima recomendada (m) entre a saída de um módulo e a entrada do próximo,
   * na interligação a distância "distM" (m), na declividade mínima usual do DN. Não é
   * um valor normativo fechado — é a referência prática de projeto hidrossanitário
   * (quanto maior o DN, menor a declividade mínima exigida p/ autolimpeza). */
  function quedaMinima(distM, dn){
    var pct = lookupDeclividadeMin(dn);
    return distM * (pct/100);
  }

  function calcularInterligacoes(dn, fossaFiltro, filtroSumidouro){
    var declividade = lookupDeclividadeMin(dn);
    var trechos = [fossaFiltro, filtroSumidouro].map(function(comprimento){
      var queda = comprimento * declividade / 100;
      return { comprimento:comprimento, queda:queda, tubo:Math.hypot(comprimento, queda) };
    });
    return { dn:dn, declividade:declividade, trechos:trechos, tubo:trechos[0].tubo + trechos[1].tubo };
  }

  function perfilComCotas(interligacoes, cotas){
    var dados = [
      { inicial:cotas.saidaFossa, final:cotas.entradaFiltro },
      { inicial:cotas.saidaFiltro, final:cotas.entradaSumidouro }
    ];
    var trechos = dados.map(function(pontos,i){
      var minimo = interligacoes.trechos[i].queda;
      var completa = Number.isFinite(pontos.inicial) && Number.isFinite(pontos.final);
      var medida = completa ? pontos.inicial-pontos.final : null;
      return { inicial:pontos.inicial, final:pontos.final, queda:medida,
        maximo:Number.isFinite(pontos.inicial) ? pontos.inicial-minimo : null,
        atende:completa ? medida >= minimo-1e-8 : null };
    });
    var bases = [
      Number.isFinite(cotas.saidaFossa) ? cotas.saidaFossa-cotas.alturaFossa : null,
      Number.isFinite(cotas.entradaFiltro) && Number.isFinite(cotas.entradaFiltroAteBase) ? cotas.entradaFiltro-cotas.entradaFiltroAteBase : null,
      Number.isFinite(cotas.entradaSumidouro) ? cotas.entradaSumidouro-cotas.alturaSumidouro : null
    ];
    return { trechos:trechos, bases:bases, profundidades:bases.map(function(base){
      return base === null || !Number.isFinite(cotas.terreno) ? null : cotas.terreno-base;
    }) };
  }

  function verificarFaixa(carga, altura, apoio, fator, resistencia){
    var total = carga.diagramas.at(-1);
    var biapoiada = apoio === "biapoiada";
    var reacaoTopo = biapoiada ? total.momento/altura : 0;
    var v = Math.max(reacaoTopo,total.cortante-reacaoTopo)*fator;
    var m = total.momento;
    if (biapoiada){
      var inferior=0, superior=altura;
      for (var i=0;i<45;i++){
        var meio=(inferior+superior)/2;
        if(carga.avaliarFaixa(meio).cortante<reacaoTopo) inferior=meio;
        else superior=meio;
      }
      var z=(inferior+superior)/2;
      m=Math.max(0,reacaoTopo*z-carga.avaliarFaixa(z).momento);
    }
    m*=fator;
    return { v:v, m:m,
      atendeV:Number.isFinite(resistencia.v) ? v<=resistencia.v : null,
      atendeM:Number.isFinite(resistencia.m) ? m<=resistencia.m : null };
  }

  function fmt(n, dec){
    if (dec === undefined) dec = 0;
    if (!isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits:dec, maximumFractionDigits:dec });
  }
  function fmtR$(n){ return "R$ " + fmt(n,2); }
  function fmtLM3(litros){ return fmt(litros) + " L (" + fmt(litros/1000,2) + " m³)"; }
  function ceilStep(v, step){ return Math.ceil(v/step - 1e-9) * step; }

  function lookupT(vazao){
    for (var i=0;i<TABELA2.length;i++){ if (vazao <= TABELA2[i].upto) return TABELA2[i].T; }
    return 0.5;
  }
  function lookupProf(volM3){
    for (var i=0;i<TABELA4.length;i++){ if (volM3 <= TABELA4[i].upto) return TABELA4[i]; }
    return TABELA4[TABELA4.length-1];
  }
  function lookupCG(num){
    for (var i=0;i<TABELA_CG.length;i++){ if (num >= TABELA_CG[i].min && num <= TABELA_CG[i].max) return TABELA_CG[i]; }
    return TABELA_CG[TABELA_CG.length-1];
  }
  function interpTaxa(perc){
    var pts = TABELA5;
    if (perc <= pts[0].perc) return pts[0].taxa;
    if (perc >= pts[pts.length-1].perc) return pts[pts.length-1].taxa;
    for (var i=0;i<pts.length-1;i++){
      if (perc >= pts[i].perc && perc <= pts[i+1].perc){
        var f = (perc - pts[i].perc) / (pts[i+1].perc - pts[i].perc);
        return pts[i].taxa + f*(pts[i+1].taxa - pts[i].taxa);
      }
    }
    return pts[pts.length-1].taxa;
  }
  function kgmFor(dn){
    var f = DN_STEEL_TABLE.filter(function(t){ return t.dn===dn; })[0];
    return f ? f.kgm : 0;
  }
  function areaFor(dn){
    var f = DN_STEEL_TABLE.filter(function(t){ return t.dn===dn; })[0];
    return f ? f.area : 0;
  }
  function lookupClasseAgressividade(idx){
    return CLASSE_AGRESSIVIDADE[idx] || CLASSE_AGRESSIVIDADE[CLASSE_AGRESSIVIDADE.length-1];
  }

  /* Verificações normativas simplificadas (NBR 6118:2014) para pilar/viga/estribo —
   * checagem de mínimos de projeto, não uma análise estrutural (não há verificação de
   * esforços/Nd/Md aqui, só geometria e taxas mínimas). mat = mesmo objeto passado a
   * computeMateriaisCore, mais classeIdx (índice em CLASSE_AGRESSIVIDADE). */
  function verificarNormas(mat){
    var classe = lookupClasseAgressividade(mat.classeIdx);
    var checks = [];

    var cobrimentoCm = mat.matCobrimento*100;
    checks.push({
      item:"Cobrimento da armadura (classe "+classe.classe+" — "+classe.desc+")",
      valor: cobrimentoCm.toFixed(1)+" cm", minimo: classe.cobrimentoVigaPilar.toFixed(1)+" cm",
      ok: cobrimentoCm >= classe.cobrimentoVigaPilar - 1e-6,
      norma:"NBR 6118:2014, Tabela 7.2"
    });

    var menorLadoPilarCm = Math.min(mat.matPilarB, mat.matPilarH)*100;
    checks.push({
      item:"Dimensão mínima do pilar",
      valor: menorLadoPilarCm.toFixed(1)+" cm", minimo:"19,0 cm",
      ok: menorLadoPilarCm >= 19 - 1e-6,
      norma:"NBR 6118:2014, 13.2.3"
    });

    var areaPilarCm2 = (mat.matPilarB*100) * (mat.matPilarH*100);
    var areaAcoPilarCm2 = mat.matPilarNumBarras * areaFor(mat.matPilarDn);
    var taxaPilarPct = areaPilarCm2>0 ? areaAcoPilarCm2/areaPilarCm2*100 : 0;
    checks.push({
      item:"Taxa de armadura longitudinal do pilar",
      valor: taxaPilarPct.toFixed(2)+"%", minimo:"0,40%",
      ok: taxaPilarPct >= 0.4 - 1e-6,
      norma:"NBR 6118:2014, 17.3.5.3.1 (mínimo simplificado)"
    });

    var estriboMinMm = Math.max(5, mat.matPilarDn/4);
    checks.push({
      item:"Diâmetro mínimo do estribo",
      valor: mat.matEstriboDn.toFixed(1)+" mm", minimo: estriboMinMm.toFixed(1)+" mm",
      ok: mat.matEstriboDn >= estriboMinMm - 1e-6,
      norma:"NBR 6118:2014, 18.4.3"
    });

    var espEstriboMaxPilarCm = Math.min(20, menorLadoPilarCm, 12*mat.matPilarDn/10);
    var espEstriboPilarCm = mat.matEstriboPilarEsp*100;
    checks.push({
      item:"Espaçamento máx. do estribo — pilar",
      valor: espEstriboPilarCm.toFixed(1)+" cm", minimo:"≤ "+espEstriboMaxPilarCm.toFixed(1)+" cm",
      ok: espEstriboPilarCm <= espEstriboMaxPilarCm + 1e-6,
      norma:"NBR 6118:2014, 18.4.3"
    });

    var espEstriboMaxVigaCm = Math.min(30, 0.6*(mat.matPilarH*100));
    var espEstriboVigaCm = mat.matEstriboVigaEsp*100;
    checks.push({
      item:"Espaçamento máx. do estribo — viga",
      valor: espEstriboVigaCm.toFixed(1)+" cm", minimo:"≤ "+espEstriboMaxVigaCm.toFixed(1)+" cm",
      ok: espEstriboVigaCm <= espEstriboMaxVigaCm + 1e-6,
      norma:"NBR 6118:2014, 18.3.3.2 (0,6×d, simplificado)"
    });

    var espMax = mat.matEspacamentoMax;
    checks.push({
      item:"Espaçamento entre pilares (vão da viga de amarração)",
      valor: espMax.toFixed(2)+" m", minimo:"≤ 3,00 m",
      ok: espMax <= 3.0 + 1e-6,
      norma:"prática usual para viga de amarração sem cálculo de flecha/momento — reduzir se a viga vergar"
    });

    var okCount = checks.filter(function(c){ return c.ok; }).length;
    return { checks:checks, okCount:okCount, total:checks.length, allOk: okCount===checks.length };
  }

  /* Dimensionamento completo: contribuições -> volumes/área mínimos -> módulos.
   * input = { contribs, intervaloIdx, taxaIdx, percMedido, tfiltroAuto, tfiltroManual,
   *           mode:"padrao"|"unico", larg, fossa:{comp,h}, filtro:{comp,h}, sumid:{comp,h},
   *           numSumUnits, cgEnabled, cgNum, cgRefeicoes } */
  function dimensionar(input){
    var verificados = input.parametrosVerificados;
    var K = verificados ? verificados.k : lookupK(input.intervaloIdx, input.tempIdx);
    var contarFundo = input.contarFundoSumidouro !== false;
    var taxa, percInterpNote = "";
    if (verificados){
      taxa = verificados.infiltracao;
      percInterpNote = "Taxa de aplicação confirmada no projeto: "+fmt(taxa,3)+" m³/m².dia.";
    } else if (input.percMedido !== null && input.percMedido !== undefined && !isNaN(input.percMedido) && input.percMedido > 0){
      taxa = interpTaxa(input.percMedido);
      percInterpNote = "Taxa interpolada: " + taxa.toFixed(3) + " m³/m².dia (a partir de " + input.percMedido + " min/m medido)";
    } else {
      taxa = TABELA5[input.taxaIdx].taxa;
    }

    var sumN=0, sumVazao=0, sumFossaTerm=0, sumFiltroTerm=0;
    var contribDetails = [];
    input.contribs.forEach(function(c){
      var cat = TABELA1[c.catIndex];
      var C = cat.custom ? c.customC : cat.C;
      var Lf = cat.custom ? c.customLf : cat.Lf;
      var vazao_i = c.N * C;
      var Tfossa_i = verificados ? verificados.tFossa : lookupT(vazao_i);
      var Tfiltro_i = verificados ? verificados.tFiltro : input.tfiltroAuto ? Tfossa_i : input.tfiltroManual;
      var termoFossa_i = c.N * (C*Tfossa_i + K*Lf);
      var termoFiltro_i = c.N * C * Tfiltro_i;
      sumN += c.N;
      sumVazao += vazao_i;
      sumFossaTerm += termoFossa_i;
      sumFiltroTerm += termoFiltro_i;
      contribDetails.push({
        nome: cat.custom ? "Personalizado" : cat.name, unidade: cat.unit,
        N:c.N, C:C, Lf:Lf, vazao:vazao_i, Tfossa:Tfossa_i, Tfiltro:Tfiltro_i,
        termoFossa:termoFossa_i, termoFiltro:termoFiltro_i
      });
    });

    var VminFossa = 1000 + sumFossaTerm;
    var VminFiltroCalc = 1.6 * sumFiltroTerm;
    // NBR 13969: o volume útil do filtro anaeróbio nunca é menor que 1000 L.
    var VminFiltro = Math.max(VminFiltroCalc, FILTRO_VOL_MIN_L);
    var filtroPisoAplicado = VminFiltro > VminFiltroCalc + 1e-9;
    var Amin = (sumVazao/1000) / taxa;

    var wFossa = sumN>0 ? sumFossaTerm/sumN : 0;
    var wFiltroC_T = sumN>0 ? sumFiltroTerm/sumN : 0;
    var wC = sumN>0 ? sumVazao/sumN : 0;

    var larg = input.larg;
    var results, modeDetails;

    if (input.mode === "padrao"){
      var volFossaMod = input.fossa.comp * larg * input.fossa.h * 1000;
      var capFossaMod = (volFossaMod - 1000) / Math.max(wFossa,0.0001);
      var qtyFossa = Math.max(1, Math.ceil(sumN / Math.max(capFossaMod,0.0001)));

      var volFiltroMod = input.filtro.comp * larg * input.filtro.h * 1000;
      var capFiltroMod = volFiltroMod / (1.6*Math.max(wFiltroC_T,0.0001));
      var qtyFiltro = Math.max(1, Math.ceil(VminFiltro / volFiltroMod - 1e-9));

      var areaSumMod = areaSumidouro(input.sumid.comp, larg, input.sumid.h, contarFundo);
      var capSumMod = (areaSumMod * taxa * 1000) / Math.max(wC,0.0001);
      var qtySum = Math.max(1, Math.ceil(sumN / Math.max(capSumMod,0.0001)));

      results = {
        fossa: { dims:[input.fossa.comp,larg,input.fossa.h], vol:volFossaMod, cap:capFossaMod, qty:qtyFossa, totalCap:qtyFossa*capFossaMod },
        filtro:{ dims:[input.filtro.comp,larg,input.filtro.h], vol:volFiltroMod, cap:capFiltroMod, qty:qtyFiltro, totalCap:qtyFiltro*capFiltroMod },
        sumid: { dims:[input.sumid.comp,larg,input.sumid.h], area:areaSumMod, cap:capSumMod, qty:qtySum, totalCap:qtySum*capSumMod }
      };
      modeDetails = {
        mode:"padrao", wFossa:wFossa, wFiltroC_T:wFiltroC_T, wC:wC,
        volFossaMod:volFossaMod, capFossaMod:capFossaMod, qtyFossa:qtyFossa,
        volFiltroMod:volFiltroMod, capFiltroMod:capFiltroMod, qtyFiltro:qtyFiltro,
        areaSumMod:areaSumMod, capSumMod:capSumMod, qtySum:qtySum
      };
    } else {
      var profFossa = lookupProf(VminFossa/1000);
      var HuFossa = (profFossa.min + profFossa.max)/2;
      var compFossa = ceilStep(VminFossa/(larg*HuFossa*1000), 0.1);
      var volFossaFinal = larg*compFossa*HuFossa*1000;
      // Uma largura grande pode fazer o arredondamento cruzar a faixa de volume.
      var faixaExecutada = lookupProf(volFossaFinal/1000);
      while (HuFossa < faixaExecutada.min){
        HuFossa = faixaExecutada.min;
        compFossa = ceilStep(VminFossa/(larg*HuFossa*1000), 0.1);
        volFossaFinal = larg*compFossa*HuFossa*1000;
        faixaExecutada = lookupProf(volFossaFinal/1000);
      }
      profFossa = faixaExecutada;

      var HuFiltro = HuFossa;
      var compFiltro = ceilStep(VminFiltro/(larg*HuFiltro*1000), 0.1);
      var volFiltroFinal = larg*compFiltro*HuFiltro*1000;

      var HuSum = input.sumid.h;
      var numSumUnits = input.numSumUnits;
      var areaUnitNeeded = Amin/numSumUnits;
      var fatorFundo = contarFundo ? larg : 0;
      var compSum = ceilStep(Math.max(0.1,(areaUnitNeeded - 2*larg*HuSum)/(fatorFundo+2*HuSum)), 0.1);
      var areaSumFinal = areaSumidouro(compSum, larg, HuSum, contarFundo) * numSumUnits;

      results = {
        fossa: { dims:[compFossa,larg,HuFossa], vol:volFossaFinal, req:VminFossa, qty:1 },
        filtro:{ dims:[compFiltro,larg,HuFiltro], vol:volFiltroFinal, req:VminFiltro, qty:1 },
        sumid: { dims:[compSum,larg,HuSum], area:areaSumFinal, req:Amin, qty:numSumUnits }
      };
      modeDetails = {
        mode:"unico", profFossa:profFossa, HuFossa:HuFossa, compFossa:compFossa, volFossaFinal:volFossaFinal,
        HuFiltro:HuFiltro, compFiltro:compFiltro, volFiltroFinal:volFiltroFinal,
        HuSum:HuSum, numSumUnits:numSumUnits, areaUnitNeeded:areaUnitNeeded, compSum:compSum, areaSumFinal:areaSumFinal
      };
    }

    var sumid = results.sumid;
    var areaTotal = areaSumidouro(sumid.dims[0], sumid.dims[1], sumid.dims[2], contarFundo) * sumid.qty;
    var capacidadeInfiltracao = areaTotal * taxa * 1000;
    var infiltracao = {
      areaMinima: Amin, areaTotal: areaTotal, demanda: sumVazao, capacidade: capacidadeInfiltracao,
      saldo: capacidadeInfiltracao - sumVazao
    };

    var cg = null;
    if (input.cgEnabled){
      var cgSpec = lookupCG(input.cgNum);
      cg = {
        spec: cgSpec,
        dims: [cgSpec.footprint.c, cgSpec.footprint.l, cgSpec.footprint.h],
        capText: cgSpec.formula ? ("V = 2×"+input.cgRefeicoes+"+20 = "+fmt(2*input.cgRefeicoes+20)+" L") : cgSpec.cap
      };
    }

    return {
      K:K, tempIdx:(input.tempIdx===0||input.tempIdx===1?input.tempIdx:2), taxa:taxa, percInterpNote:percInterpNote,
      contarFundoSumidouro:contarFundo, VminFiltroCalc:VminFiltroCalc, filtroPisoAplicado:filtroPisoAplicado,
      sumN:sumN, sumVazao:sumVazao, VminFossa:VminFossa, VminFiltro:VminFiltro, Amin:Amin,
      contribDetails:contribDetails, results:results, modeDetails:modeDetails, cg:cg, infiltracao:infiltracao
    };
  }

  /* Quantitativo de armadura (pilares/vigas de amarração/malha/estribos) — estimativa
   * simplificada por elemento a partir de geometria e espaçamentos; não substitui
   * análise de pórtico. Roda para UM módulo por vez (fossa | filtro | sumidouro) —
   * ver computeMateriaisAll para o quantitativo consolidado dos três módulos.
   *
   * Modelo estrutural: 3 vigas de amarração perimetrais (anel fechado em volta dos
   * pilares, vão = perímetro do módulo), cada uma em um nível distinto:
   *   - viga baldrame: na base, amarra os pilares e apoia a alvenaria sobre o radier;
   *   - viga no meio : amarração intermediária (contraventamento das paredes altas);
   *   - viga de topo : no topo dos pilares, apoio da laje/tampa.
   * Cada nível tem bitola/nº de barras próprios (mat.matBaldrameDn/NumBarras,
   * mat.matMeioDn/NumBarras, mat.matTopoDn/NumBarras). O estribo (Ø/espaçamento) é
   * único e compartilhado pelos 3 níveis, como já era para os pilares.
   *
   * dims = { comp, larg, Hu, qty, hasRadier }
   * mat  = { matEspacamentoMax, matPilarNumBarras, matPilarDn,
   *          matBaldrameNumBarras, matBaldrameDn, matMeioNumBarras, matMeioDn,
   *          matTopoNumBarras, matTopoDn, matMalhaEsp, matMalhaDn,
   *          matPilarB, matPilarH, matCobrimento,
   *          matEstriboPilarEsp, matEstriboVigaEsp, matEstriboDn } */
  var NIVEIS_VIGA = [
    { key:"baldrame", label:"Viga baldrame" },
    { key:"meio", label:"Viga no meio" },
    { key:"topo", label:"Viga de topo" }
  ];
  function cap1(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  function computeMateriaisCore(dims, mat){
    var comp = dims.comp, larg = dims.larg, Hu = dims.Hu, qty = dims.qty;
    var hasRadier = dims.hasRadier !== false;

    var spansComp = Math.max(1, Math.ceil(comp / mat.matEspacamentoMax));
    var spansLarg = Math.max(1, Math.ceil(larg / mat.matEspacamentoMax));
    var numColunas = 2*spansComp + 2*spansLarg;
    var perimetro = 2*(comp+larg);

    var pesoPilaresUn = numColunas * mat.matPilarNumBarras * Hu * kgmFor(mat.matPilarDn);

    var vigas = NIVEIS_VIGA.map(function(niv){
      var nb = mat["mat"+cap1(niv.key)+"NumBarras"];
      var dn = mat["mat"+cap1(niv.key)+"Dn"];
      var pesoUn = nb * perimetro * kgmFor(dn);
      return { key:niv.key, label:niv.label, vao:perimetro, numBarras:nb, dn:dn, pesoUn:pesoUn, peso:pesoUn*qty };
    });
    var pesoVigasUn = vigas.reduce(function(a,v){ return a+v.pesoUn; }, 0);

    var areaRadier = hasRadier ? comp*larg : 0;
    var malhaKgM2 = (1/mat.matMalhaEsp) * kgmFor(mat.matMalhaDn) * 2;
    var pesoMalhaUn = malhaKgM2 * areaRadier;

    var perimEstribo = 2*(mat.matPilarB + mat.matPilarH) - 8*mat.matCobrimento;
    var ganchoTotal = 0.20;
    var compEstribo = perimEstribo + ganchoTotal;

    var numEstribosPilarUn = Math.max(1, Math.ceil(Hu / mat.matEstriboPilarEsp) + 1);
    var totalEstribosPilarUn = numColunas * numEstribosPilarUn;
    var pesoEstribosPilarUn = totalEstribosPilarUn * compEstribo * kgmFor(mat.matEstriboDn);

    // mesmo espaçamento/bitola de estribo para os 3 níveis de viga, cada um com vão = perímetro
    var numEstribosVigaUnPorNivel = Math.max(1, Math.ceil(perimetro / mat.matEstriboVigaEsp) + 1);
    var totalEstribosVigaUn = numEstribosVigaUnPorNivel * NIVEIS_VIGA.length;
    var pesoEstribosVigaUn = totalEstribosVigaUn * compEstribo * kgmFor(mat.matEstriboDn);

    var acoTotalUn = pesoPilaresUn + pesoVigasUn + pesoMalhaUn + pesoEstribosPilarUn + pesoEstribosVigaUn;

    return {
      comp:comp, larg:larg, Hu:Hu, qty:qty, perimetro:perimetro, hasRadier:hasRadier,
      numColunas:numColunas, vigas:vigas,
      pesoPilares:pesoPilaresUn*qty, pesoVigas:pesoVigasUn*qty, pesoMalha:pesoMalhaUn*qty,
      pesoEstribosPilar:pesoEstribosPilarUn*qty, pesoEstribosViga:pesoEstribosVigaUn*qty,
      acoTotal:acoTotalUn*qty,
      totalEstribosPilar:totalEstribosPilarUn*qty, totalEstribosViga:totalEstribosVigaUn*qty,
      numEstribosVigaUnPorNivel:numEstribosVigaUnPorNivel,
      compEstribo:compEstribo, perimEstribo:perimEstribo, areaRadier:areaRadier*qty
    };
  }

  /* Consolida o quantitativo de armadura dos 3 módulos (fossa/filtro/sumidouro) a
   * partir do "results" retornado por dimensionar(). Sumidouro não tem radier
   * (fundo aberto para infiltração) — malha do radier não se aplica a ele. */
  function computeMateriaisAll(results, mat){
    var modules = {
      fossa: computeMateriaisCore({ comp:results.fossa.dims[0], larg:results.fossa.dims[1], Hu:results.fossa.dims[2], qty:results.fossa.qty, hasRadier:true }, mat),
      filtro: computeMateriaisCore({ comp:results.filtro.dims[0], larg:results.filtro.dims[1], Hu:results.filtro.dims[2], qty:results.filtro.qty, hasRadier:true }, mat),
      sumid: computeMateriaisCore({ comp:results.sumid.dims[0], larg:results.sumid.dims[1], Hu:results.sumid.dims[2], qty:results.sumid.qty, hasRadier:false }, mat)
    };
    var totals = { pesoPilares:0, pesoVigas:0, pesoMalha:0, pesoEstribosPilar:0, pesoEstribosViga:0, acoTotal:0 };
    ["fossa","filtro","sumid"].forEach(function(k){
      var m = modules[k];
      totals.pesoPilares += m.pesoPilares;
      totals.pesoVigas += m.pesoVigas;
      totals.pesoMalha += m.pesoMalha;
      totals.pesoEstribosPilar += m.pesoEstribosPilar;
      totals.pesoEstribosViga += m.pesoEstribosViga;
      totals.acoTotal += m.acoTotal;
    });
    return { modules:modules, totals:totals };
  }

  return {
    fmt: fmt, fmtR$: fmtR$, fmtLM3: fmtLM3, ceilStep: ceilStep,
    lookupT: lookupT, lookupProf: lookupProf, lookupCG: lookupCG, interpTaxa: interpTaxa, kgmFor: kgmFor, areaFor: areaFor,
    lookupK: lookupK, areaSumidouro: areaSumidouro, calcularEmpuxo: calcularEmpuxo,
    calcularParedesSumidouro: calcularParedesSumidouro, calcularInterligacoes: calcularInterligacoes,
    avaliarEscopo17076: avaliarEscopo17076, areaInternaSumidouro: areaInternaSumidouro,
    perfilComCotas: perfilComCotas, verificarFaixa: verificarFaixa,
    dimensionar: dimensionar, computeMateriaisCore: computeMateriaisCore, computeMateriaisAll: computeMateriaisAll,
    verificarNormas: verificarNormas, lookupClasseAgressividade: lookupClasseAgressividade,
    lookupDeclividadeMin: lookupDeclividadeMin, quedaMinima: quedaMinima,
    NIVEIS_VIGA: NIVEIS_VIGA
  };
}));
