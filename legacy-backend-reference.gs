// ==========================================================================
// PLANILHA — obtém a planilha do sistema (CRIA AUTOMATICAMENTE se não existir)
// Funciona em qualquer conta: standalone ou vinculado a uma planilha
// ==========================================================================
var __SS_CACHE = null;
function testarPermissaoDrive() {
  DriveApp.getRootFolder();
  Logger.log("Drive OK!");
}

function obterPlanilha() {
  // 1) Cache em memória (mesma execução)
  if (__SS_CACHE) return __SS_CACHE;

  var props = PropertiesService.getScriptProperties();
  var idSalvo = props.getProperty("SPREADSHEET_ID");

  // 2) Tenta abrir pela ID salva anteriormente
  if (idSalvo) {
    try {
      __SS_CACHE = SpreadsheetApp.openById(idSalvo);
      return __SS_CACHE;
    } catch(e) {
      Logger.log("⚠ Planilha salva não encontrada (deletada?). Criando nova...");
      props.deleteProperty("SPREADSHEET_ID");
    }
  }

  // 3) Tenta planilha ativa (caso o script esteja VINCULADO a uma planilha)
  try {
    var ativa = SpreadsheetApp.getActiveSpreadsheet();
    if (ativa) {
      props.setProperty("SPREADSHEET_ID", ativa.getId());
      __SS_CACHE = ativa;
      return __SS_CACHE;
    }
  } catch(e) { /* standalone: não tem planilha ativa */ }

  // 4) NÃO EXISTE: cria a planilha do zero nesta conta
  Logger.log("📄 Criando planilha nova do sistema...");
  var nova = SpreadsheetApp.create("Caderneta de Gestão — AMQMI");
  props.setProperty("SPREADSHEET_ID", nova.getId());
  __SS_CACHE = nova;

  // Cria toda a estrutura de abas
  garantirAbas();

  // Remove a aba padrão vazia ("Página1"/"Sheet1")
  try {
    var abas = nova.getSheets();
    for (var i=0; i<abas.length; i++) {
      var n = abas[i].getName();
      if ((n === "Página1" || n === "Sheet1" || n === "Planilha1") && abas.length > 1) {
        nova.deleteSheet(abas[i]);
        break;
      }
    }
  } catch(e) {}

  Logger.log("✅ Planilha criada: " + nova.getUrl());
  return __SS_CACHE;
}

// Função utilitária: rode manualmente no editor para pegar o link da planilha
function obterLinkPlanilha() {
  var url = obterPlanilha().getUrl();
  Logger.log("🔗 Planilha do sistema: " + url);
  return url;
}

// ==========================================================================
// UTILITÁRIO — OBTER ABA COM CABEÇALHO (cria só se não existir)
// ==========================================================================
function obterAba(nomeAba, cabecalhos) {
  var ss = obterPlanilha();
  var aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
    aba.appendRow(cabecalhos);
    aba.getRange(1, 1, 1, cabecalhos.length).setFontWeight("bold").setBackground("#f3f4f6");
    SpreadsheetApp.flush();
  }
  return aba;
}

// ==========================================================================
// GARANTIR ABA — cria abas novas sem tocar nas existentes
// ==========================================================================
function garantirAbas() {
  var novas = [
    { nome: "Usuarios",     cabecalhos: ["Chave de Acesso", "Nome", "Telefone", "Tipo", "Foto"] },
    { nome: "Produtos",     cabecalhos: ["Nome", "Tipo", "Unidade", "Valor", "Foto", "Operador"] },
    { nome: "Salgados",     cabecalhos: ["Nome", "Descricao", "Unidade", "Valor", "Foto", "Operador"] },
    { nome: "Compradores",  cabecalhos: ["Nome", "Documento", "Telefone", "Endereço", "Foto", "Operador"] },
    { nome: "EstoqueManual",cabecalhos: ["Chave de Acesso Marisqueira", "Nome Marisqueira", "Tipo", "Produto", "Quantidade", "Data Atualizacao", "Operador"] },
    { nome: "Producao",     cabecalhos: ["Marisco Origem", "Peso In Natura Usado", "Peso Beneficiado Obtido", "Perdas", "Produto Final", "Qtd Gerada", "Lote", "Operador", "Data Registro", "Data Referência", "Chave de Acesso Operador"] },
    { nome: "ProdSalgados", cabecalhos: ["Salgado", "Quantidade", "Lote", "Operador", "Data Registro", "Data Referência", "Chave de Acesso Operador", "Observacao"] },
    { nome: "Saidas",       cabecalhos: ["Produto", "Quantidade", "Valor Unitário", "Total Venda", "Destino", "Lote", "Operador", "Data Registro", "Data Venda", "Unidade", "Chave de Acesso Operador", "TipoItem"] },
    { nome: "EstoqueAssociacao", cabecalhos: ["Produto", "Quantidade", "Lote", "Operador", "Data Recebimento", "Chave de Acesso Operador"] },
    { nome: "Metas",        cabecalhos: ["ID", "Nome", "Objetivo", "Realizado", "Unidade"] },
    { nome: "Noticias",     cabecalhos: ["Data", "Titulo", "Mensagem", "Autor", "Foto", "Validade", "ID"] },
    { nome: "Config",       cabecalhos: ["Chave", "Valor"] }
  ];
  var ss = obterPlanilha();
  novas.forEach(function(est) {
    if (!ss.getSheetByName(est.nome)) {
      obterAba(est.nome, est.cabecalhos);
    }
  });
  // Aba Entradas: garantir com estrutura nova (sem Local)
  garantirAbaEntradas(ss);
  // Aba EstoqueManual: garantir com coluna Tipo
  garantirEstoqueManualComTipo(ss);
}

// ==========================================================================
// GARANTIR ABA ENTRADAS — migra estrutura antiga (com Local) para nova
// ==========================================================================
function garantirAbaEntradas(ss) {
  var aba = ss.getSheetByName("Entradas");
  if (!aba) {
    // Cria nova
    aba = ss.insertSheet("Entradas");
    aba.appendRow(["Data Registro", "Data Mariscagem", "Lote", "Chave de Acesso Marisqueira", "Nome Marisqueira", "Produto", "Quantidade", "Unidade", "Operador"]);
    aba.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f3f4f6");
    SpreadsheetApp.flush();
    return;
  }
  // Já existe — verifica se tem coluna "Local" (estrutura antiga de 10 colunas)
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  // Estrutura antiga: ["Data Registro","Data Mariscagem","Local","Lote","Chave de Acesso...","Nome...","Produto","Quantidade","Unidade","Operador"]
  // Estrutura nova:   ["Data Registro","Data Mariscagem","Lote","Chave de Acesso...","Nome...","Produto","Quantidade","Unidade","Operador"]
  if (cabecalho[2] === "Local") {
    Logger.log("Migração: removendo coluna Local da aba Entradas");
    // Remove coluna 3 (Local = coluna C = índice 3 base-1)
    aba.deleteColumn(3);
    SpreadsheetApp.flush();
    Logger.log("Migração concluída");
  }
}

// ==========================================================================
// GARANTIR ABA ESTOQUE MANUAL — estrutura correta e migração automática
// ==========================================================================
// ==========================================================================
// INVALIDAÇÃO DE REGISTROS — adiciona colunas de auditoria se não existirem
// ==========================================================================
function garantirColunasInvalidacao(aba) {
  var cab = aba.getRange(1, 1, 1, Math.max(1, aba.getLastColumn())).getValues()[0];
  var nomes = ["Invalidado", "Invalidado Por", "Motivo Invalidação", "Data Invalidação"];
  var idx = {};
  var faltando = [];
  nomes.forEach(function(n) {
    var pos = cab.indexOf(n);
    if (pos === -1) faltando.push(n); 
  });
  if (faltando.length) {
    var startCol = aba.getLastColumn() + 1;
    aba.getRange(1, startCol, 1, faltando.length).setValues([faltando]);
    SpreadsheetApp.flush();
    cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  }
  nomes.forEach(function(n) { idx[n] = cab.indexOf(n); });
  return idx;
}

// Marca um registro (linha da planilha) como inválido — não altera o estoque,
// serve para auditoria: o registro some da confiança do relatório mas
// continua visível, marcado como "Invalidado".
function invalidarRegistro(payload) {
  try {
    var sheetsPermitidas = { "Entradas":1, "ProdSalgados":1, "Saidas":1 };
    var nomeAba = String(payload.sheet||"").trim();
    var linha = parseInt(payload.linha, 10);
    if (!sheetsPermitidas[nomeAba] || !linha || linha < 2) return "Registro inválido para invalidação.";

    var aba = obterPlanilha().getSheetByName(nomeAba);
    if (!aba) return "Aba não encontrada.";
    var idx = garantirColunasInvalidacao(aba);

    // Não reverte 2x se já estava invalidado
    var jaInvalido = aba.getRange(linha, idx["Invalidado"]+1).getValue();
    if (jaInvalido === true || String(jaInvalido).toUpperCase() === "TRUE") {
      return "Esse registro já estava invalidado.";
    }

    var operadorNome = String(payload.operador||"Admin").trim();

    // Reverte o efeito no estoque ANTES de marcar como invalidado
    var estorno = reverterEfeitoEstoque(nomeAba, linha, operadorNome);

    aba.getRange(linha, idx["Invalidado"]+1).setValue(true);
    aba.getRange(linha, idx["Invalidado Por"]+1).setValue(operadorNome);
    aba.getRange(linha, idx["Motivo Invalidação"]+1).setValue(String(payload.motivo||"").trim());
    aba.getRange(linha, idx["Data Invalidação"]+1).setValue(new Date());
    SpreadsheetApp.flush();
    return "Registro invalidado! " + estorno + " Ele continua no relatório, marcado como inválido.";
  } catch(e) { return "Erro ao invalidar: " + e.message; }
}

// ==========================================================================
// REVERTER EFEITO NO ESTOQUE — desfaz o que aquele registro tinha causado
//   Entradas (coleta)      → tira o In Natura que tinha entrado
//   ProdSalgados (produção)→ tira o Salgado que tinha entrado
//   Saidas (venda)         → devolve o produto pro estoque de quem vendeu
//                             (e estorna o crédito da Associação, se houve)
// ==========================================================================
function reverterEfeitoEstoque(nomeAba, linha, operadorNome) {
  var aba = obterPlanilha().getSheetByName(nomeAba);
  var v = aba.getRange(linha, 1, 1, aba.getLastColumn()).getValues()[0];

  if (nomeAba === "Entradas") {
    var header = aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0];
    var old = (String(header[2]||"") === "Local");
    var chaveAcessoC=old?4:3, prodC=old?6:5, qtdC=old?7:6;
    var chave = String(v[chaveAcessoC]||"").trim();
    var produto = String(v[prodC]||"").trim();
    var qtd = parseFloat(v[qtdC])||0;
    if (chave && produto && qtd>0) {
      decrementarEstoqueManual(chave, "innatura", produto, qtd);
      return "Estoque in natura ajustado (-" + qtd.toFixed(2) + " " + produto + ").";
    }
    return "Nada a ajustar no estoque.";
  }

  if (nomeAba === "ProdSalgados") {
    var chave = String(v[6]||"").trim();
    var produto = String(v[0]||"").trim();
    var qtd = parseFloat(v[1])||0;
    if (chave && produto && qtd>0) {
      decrementarEstoqueManual(chave, "salgado", produto, qtd);
      return "Estoque de processado ajustado (-" + qtd.toFixed(2) + " " + produto + ").";
    }
    return "Nada a ajustar no estoque.";
  }

  if (nomeAba === "Saidas") {
    var produto = String(v[0]||"").trim();
    var qtd = parseFloat(v[1])||0;
    var destino = String(v[4]||"").trim();
    var chaveOperador = String(v[10]||"").trim();
    var tipoItem = String(v[11]||"pescado").trim();
    var msgs = [];

    if (qtd > 0 && produto) {
      if (chaveOperador === "ASSOCIACAO") {
        // Venda tinha saído do estoque da Associação: devolve lá
        obterAba("EstoqueAssociacao",["Produto","Quantidade","Lote","Operador","Data Recebimento","Chave de Acesso Operador"])
          .appendRow([produto, Math.abs(qtd), "", "Estorno: " + operadorNome, new Date(), "ASSOCIACAO"]);
        msgs.push("Produto devolvido ao estoque da Associação.");
      } else if (chaveOperador) {
        // Devolve pro estoque pessoal de quem vendeu
        incrementarEstoqueManual(chaveOperador, tipoItem, produto, qtd, operadorNome);
        msgs.push("Produto devolvido ao estoque de quem vendeu (+" + qtd.toFixed(2) + " " + produto + ").");
      }
      // Se a venda tinha creditado a Associação (destino = Associação AMQMI), estorna esse crédito
      if (destino === "Associação AMQMI" && chaveOperador !== "ASSOCIACAO") {
        decrementarEstoqueAssociacao(produto, qtd, "Estorno invalidação: " + operadorNome);
        msgs.push("Crédito da Associação estornado.");
      }
    }
    return msgs.length ? msgs.join(" ") : "Nada a ajustar no estoque.";
  }

  return "";
}


function garantirEstoqueManualComTipo(ss) {
  try {
    var aba = ss.getSheetByName("EstoqueManual");
    if (!aba) return;
    
    Logger.log(">>> VERIFICANDO EstoqueManual");
    var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    var temTipo = false;
    
    // Verifica se coluna Tipo existe (coluna 3)
    for (var i=0; i<cabecalho.length; i++) {
      if (String(cabecalho[i]).toLowerCase().indexOf("tipo") >= 0) {
        temTipo = true;
        Logger.log("✓ Coluna Tipo encontrada");
        break;
      }
    }
    
    // Adiciona coluna Tipo na posição 3 se não existir
    if (!temTipo) {
      Logger.log("⚠ Coluna Tipo não encontrada - adicionando");
      aba.insertColumn(3);
      aba.getRange(1, 3).setValue("Tipo");
      var lastRow = aba.getLastRow();
      if (lastRow > 1) aba.getRange(2, 3, lastRow - 1, 1).setValue("Pescado");
      SpreadsheetApp.flush();
      Logger.log("✓ Coluna Tipo criada e preenchida");
    }
    
    // Se EstoqueManual vazio, migra histórico
    var ultimaLinha = aba.getLastRow();
    Logger.log("LastRow EstoqueManual: " + ultimaLinha);
    
    if (ultimaLinha <= 1) {
      Logger.log("⚠ EstoqueManual vazio - iniciando migração de histórico");
      migrarEstoqueHistoricoParaManual(ss);
    } else {
      Logger.log("✓ EstoqueManual já tem dados (" + (ultimaLinha - 1) + " linhas)");
    }
  } catch(e) {
    Logger.log("❌ Erro garantirEstoqueManualComTipo: " + e.message);
  }
}

// ==========================================================================
// FLUXO MIGRAÇÃO: carregar dados → calcular → salvar
// ==========================================================================
function migrarEstoqueHistoricoParaManual(ss) {
  try {
    Logger.log("\n=== MIGRAÇÃO (3 categorias: In Natura / Beneficiado / Salgado) ===");

    // PASSO 1: Carregar todos os dados (UMA VEZ)
    var usuarios = ss.getSheetByName("Usuarios").getDataRange().getValues();
    var entradas = ss.getSheetByName("Entradas") ? ss.getSheetByName("Entradas").getDataRange().getValues() : [[]];
    var producao = ss.getSheetByName("Producao") ? ss.getSheetByName("Producao").getDataRange().getValues() : [[]];
    var prodSalg = ss.getSheetByName("ProdSalgados") ? ss.getSheetByName("ProdSalgados").getDataRange().getValues() : [[]];
    var saidas   = ss.getSheetByName("Saidas") ? ss.getSheetByName("Saidas").getDataRange().getValues() : [[]];

    Logger.log("Usuarios: " + usuarios.length + " | Entradas: " + entradas.length + " | Producao: " + producao.length + " | ProdSalgados: " + prodSalg.length + " | Saidas: " + saidas.length);

    var abaDestino = ss.getSheetByName("EstoqueManual");
    var totalMigrados = 0;
    var linhasMigra = [];

    // PASSO 2: Calcular estoque para CADA pessoa
    for (var i=1; i<usuarios.length; i++) {
      var chaveAcesso = String(usuarios[i][0]||"").trim();
      var nomeMari = String(usuarios[i][1]||"").trim();
      if (!chaveAcesso) continue;

      var est = calcularEstoquePessoa(chaveAcesso, entradas, producao, prodSalg, saidas);
      Logger.log("📍 " + nomeMari + ": " + Object.keys(est.innatura).length + " in natura, " + Object.keys(est.beneficiado).length + " beneficiado, " + Object.keys(est.salgado).length + " salgado");

      // PASSO 3: Salvar as 3 categorias
      var cats = [
        { obj: est.innatura,    rotulo: "In Natura" },
        { obj: est.beneficiado, rotulo: "Beneficiado" },
        { obj: est.salgado,     rotulo: "Salgado" }
      ];
      for (var c=0; c<cats.length; c++) {
        for (var prod in cats[c].obj) {
          if (cats[c].obj[prod] > 0.001) {
            linhasMigra.push([chaveAcesso, nomeMari, cats[c].rotulo, prod, parseFloat(cats[c].obj[prod].toFixed(2)), new Date(), "Migração"]);
            totalMigrados++;
            Logger.log("   ✓ " + prod + " (" + cats[c].rotulo + ") = " + cats[c].obj[prod].toFixed(2));
          }
        }
      }
    }

    // GRAVA TUDO DE UMA VEZ (1 escrita em lote)
    if (linhasMigra.length) {
      abaDestino.getRange(abaDestino.getLastRow()+1, 1, linhasMigra.length, 7).setValues(linhasMigra);
    }
    SpreadsheetApp.flush();
    Logger.log("✅ MIGRAÇÃO CONCLUÍDA — " + totalMigrados + " produtos salvos");

  } catch(e) {
    Logger.log("❌ Erro na migração: " + e.message + "\n" + e.stack);
  }
}

// ==========================================================================
// CÁLCULO DE ESTOQUE HISTÓRICO — MODELO OFICIAL (3 categorias):
//   In Natura   = Entradas (coleta) − peso usado no beneficiamento
//   Beneficiado = Qtd gerada na Produção − vendas de pescado
//   Salgado     = ProdSalgados − vendas de salgado
// ==========================================================================
function calcularEstoquePessoa(chaveAcesso, entradas, producao, prodSalg, saidas) {
  var est = { innatura: {}, beneficiado: {}, salgado: {} };

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 1: ENTRADAS (coleta) → SOMA in natura
  // Entradas: [0]DtReg [1]DtMarisc [2]Lote [3]Chave [4]Nome [5]Produto [6]Qtd [7]Unid [8]Oper
  // ═══════════════════════════════════════════════════════════════════════
  for (var i=1; i<entradas.length; i++) {
    if (String(entradas[i][3]||"").trim() !== chaveAcesso) continue;
    var produto = String(entradas[i][5]||"").trim();
    var quantidade = parseFloat(entradas[i][6])||0;
    if (produto && quantidade > 0) {
      if (!est.innatura[produto]) est.innatura[produto] = 0;
      est.innatura[produto] += quantidade;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2: PRODUÇÃO (beneficiamento) → DESCONTA in natura usado, SOMA beneficiado
  // Producao: [0]Origem [1]PesoUsado [2]PesoObtido [3]Perdas [4]ProdutoFinal
  //           [5]QtdGerada [6]Lote [7]Operador [8]DtReg [9]DtRef [10]Chave
  // ═══════════════════════════════════════════════════════════════════════
  for (var i=1; i<producao.length; i++) {
    if (String(producao[i][10]||"").trim() !== chaveAcesso) continue;
    var prodOrigem = String(producao[i][0]||"").trim();
    var prodFinal = String(producao[i][4]||"").trim();
    var qtdUsada = parseFloat(producao[i][1])||0;
    var qtdGerada = parseFloat(producao[i][5])||0;

    if (prodOrigem && qtdUsada > 0) {
      if (!est.innatura[prodOrigem]) est.innatura[prodOrigem] = 0;
      est.innatura[prodOrigem] -= qtdUsada;
    }
    if (prodFinal && qtdGerada > 0) {
      if (!est.beneficiado[prodFinal]) est.beneficiado[prodFinal] = 0;
      est.beneficiado[prodFinal] += qtdGerada;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3: PRODUÇÃO DE SALGADOS → SOMA salgado (sem beneficiar)
  // ProdSalgados: [0]Salgado [1]Qtd [2]Lote [3]Operador [4]DtReg [5]DtRef [6]Chave [7]Obs
  // ═══════════════════════════════════════════════════════════════════════
  for (var i=1; i<prodSalg.length; i++) {
    if (String(prodSalg[i][6]||"").trim() !== chaveAcesso) continue;
    var salg = String(prodSalg[i][0]||"").trim();
    var qtdS = parseFloat(prodSalg[i][1])||0;
    if (salg && qtdS > 0) {
      if (!est.salgado[salg]) est.salgado[salg] = 0;
      est.salgado[salg] += qtdS;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 4: VENDAS → DESCONTA do tipo correspondente
  // Saidas: [0]Produto [1]Qtd ... [10]Chave [11]TipoItem
  //   salgado → desconta salgado | pescado → desconta beneficiado
  // ═══════════════════════════════════════════════════════════════════════
  for (var i=1; i<saidas.length; i++) {
    if (String(saidas[i][10]||"").trim() !== chaveAcesso) continue;
    var produto = String(saidas[i][0]||"").trim();
    var quantidade = parseFloat(saidas[i][1])||0;
    if (!produto || quantidade <= 0) continue;

    var tipoItem = String(saidas[i][11]||"pescado").toLowerCase().trim();
    if (tipoItem === "salgado") {
      if (!est.salgado[produto]) est.salgado[produto] = 0;
      est.salgado[produto] -= quantidade;
    } else {
      // Vendas de pescado saem do BENEFICIADO (produto vendível)
      if (!est.beneficiado[produto]) est.beneficiado[produto] = 0;
      est.beneficiado[produto] -= quantidade;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 5: LIMPEZA — remove negativos e zeros
  // ═══════════════════════════════════════════════════════════════════════
  ["innatura","beneficiado","salgado"].forEach(function(cat) {
    for (var p in est[cat]) {
      est[cat][p] = Math.max(0, est[cat][p]);
      if (est[cat][p] === 0) delete est[cat][p];
    }
  });

  return est;
}


// ==========================================================================
// INICIALIZAR ABAS — chamável manualmente pelo admin
// ==========================================================================
function inicializarAbas() {
  garantirAbas();
  return "✓ Sistema inicializado com sucesso!";
}

// ==========================================================================
// LOGIN
// ==========================================================================
function realizarLogin(chaveAcesso) {
  try {
    // Garante planilha + abas (cria tudo automaticamente na primeira vez)
    var ss = obterPlanilha();
    if (!ss.getSheetByName("Usuarios")) {
      obterAba("Usuarios", ["Chave de Acesso", "Nome", "Telefone", "Tipo", "Foto"]);
    }
    // Garante todas as abas de forma leve
    garantirAbas();

    var aba = ss.getSheetByName("Usuarios");
    var dados = aba.getDataRange().getValues();
    var chaveProcurada = String(chaveAcesso).trim().replace(/[^\d]/g, "");

    if (!chaveProcurada || chaveProcurada.length === 0) {
      return { sucesso: false, mensagem: "Chave de acesso inválida!" };
    }

    for (var i = 1; i < dados.length; i++) {
      var chaveLinha = String(dados[i][0]).trim().replace(/[^\d]/g, "");
      if (chaveLinha === chaveProcurada) {
        return {
          sucesso: true,
          chaveAcesso:      String(dados[i][0]).trim(),
          nome:     String(dados[i][1] || "Usuário"),
          telefone: String(dados[i][2] || ""),
          tipo:     String(dados[i][3] || "Marisqueira"),
          foto:     String(dados[i][4] || "")
        };
      }
    }

    // Admin master de emergência
    if (chaveProcurada === "00000000000") {
      aba.appendRow(["00000000000", "Admin Master", "", "Administrativo", ""]);
      SpreadsheetApp.flush();
      return { sucesso: true, chaveAcesso: "00000000000", nome: "Admin Master", telefone: "", tipo: "Administrativo", foto: "" };
    }

    return { sucesso: false, mensagem: "Chave de acesso não encontrada!" };
  } catch (e) {
    Logger.log("Erro no login: " + e.message);
    return { sucesso: false, mensagem: "Erro ao processar login: " + e.message };
  }
}

// ==========================================================================
// BUSCA DE DADOS PARA O FRONT-END
// ==========================================================================
function buscarOpcoesFormularios() {
  var marisqueiras = [], todosUsuarios = [], produtos = [], salgados = [],
      compradores = [], metas = [], noticias = [];
  try {
    // Usuários
    var dadosUsr = obterAba("Usuarios", ["Chave de Acesso","Nome","Telefone","Tipo","Foto"]).getDataRange().getValues();
    for (var i = 1; i < dadosUsr.length; i++) {
      if (!dadosUsr[i][0]) continue;
      var u = { chaveAcesso: String(dadosUsr[i][0]).trim(), nome: String(dadosUsr[i][1] || "Sem nome"), telefone: String(dadosUsr[i][2] || ""), tipo: String(dadosUsr[i][3] || "Marisqueira"), foto: String(dadosUsr[i][4] || "") };
      todosUsuarios.push(u);
      if (u.tipo === "Marisqueira") marisqueiras.push(u);
    }

    // Produtos
    var dadosProd = obterAba("Produtos", ["Nome","Tipo","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
    for (var i = 1; i < dadosProd.length; i++) {
      if (!dadosProd[i][0]) continue;
      produtos.push({ nome: String(dadosProd[i][0]).trim(), tipo: String(dadosProd[i][1] || "Marisco"), unidade: String(dadosProd[i][2] || "KG"), valor: Math.max(0, parseFloat(dadosProd[i][3]) || 0), foto: String(dadosProd[i][4] || "") });
    }

    // Salgados
    var dadosSalg = obterAba("Salgados", ["Nome","Descricao","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
    for (var i = 1; i < dadosSalg.length; i++) {
      if (!dadosSalg[i][0]) continue;
      salgados.push({ nome: String(dadosSalg[i][0]).trim(), descricao: String(dadosSalg[i][1] || ""), unidade: String(dadosSalg[i][2] || "UN"), valor: Math.max(0, parseFloat(dadosSalg[i][3]) || 0), foto: String(dadosSalg[i][4] || "") });
    }

    // Compradores
    var dadosComp = obterAba("Compradores", ["Nome","Documento","Telefone","Endereço","Foto","Operador"]).getDataRange().getValues();
    for (var i = 1; i < dadosComp.length; i++) {
      if (!dadosComp[i][0]) continue;
      compradores.push({ nome: String(dadosComp[i][0]).trim(), foto: String(dadosComp[i][4] || "") });
    }
    compradores.push({ nome: "Associação AMQMI", foto: "" });
    compradores.push({ nome: "Comprador Esporádico", foto: "" });

    // Metas
    var dadosMetas = obterAba("Metas", ["ID","Nome","Objetivo","Realizado","Unidade"]).getDataRange().getValues();
    for (var i = 1; i < dadosMetas.length; i++) {
      if (!dadosMetas[i][0] || !dadosMetas[i][1]) continue;
      metas.push({ id: String(dadosMetas[i][0]).trim(), nome: String(dadosMetas[i][1]).trim(), objetivo: Math.max(0, parseFloat(dadosMetas[i][2]) || 0), realizado: Math.max(0, parseFloat(dadosMetas[i][3]) || 0), unidade: String(dadosMetas[i][4] || "") });
    }

    // Notícias (não expiradas)
    var dadosNot = obterAba("Noticias", ["Data","Titulo","Mensagem","Autor","Foto","Validade","ID"]).getDataRange().getValues();
    var hoje = new Date(); hoje.setHours(0,0,0,0);
    for (var i = dadosNot.length - 1; i >= 1; i--) {
      if (!dadosNot[i][1]) continue;
      if (dadosNot[i][5]) {
        try { if (hoje > new Date(dadosNot[i][5] + "T23:59:59")) continue; } catch(e) {}
      }
      try {
        noticias.push({
          id:      String(dadosNot[i][6] || "N-" + i).trim(),
          data:    Utilities.formatDate(new Date(dadosNot[i][0]), Session.getScriptTimeZone(), "dd/MM/yyyy"),
          titulo:  String(dadosNot[i][1]).trim(),
          mensagem:String(dadosNot[i][2] || "").trim(),
          autor:   String(dadosNot[i][3] || "Sistema").trim(),
          fotoUrl: String(dadosNot[i][4] || "")
        });
      } catch(e) { Logger.log("Notícia inválida linha " + i + ": " + e.message); }
    }

    return { marisqueiras:marisqueiras, todosUsuarios:todosUsuarios, produtos:produtos, salgados:salgados, compradores:compradores, metas:metas, noticias:noticias, bannerUrl:obterBannerInicial(), logoUrl:obterLogoInicial() };
  } catch (e) {
    Logger.log("Erro em buscarOpcoesFormularios: " + e.message);
    return { marisqueiras:[], todosUsuarios:[], produtos:[], salgados:[], compradores:[], metas:[], noticias:[], bannerUrl:"", logoUrl:"" };
  }
}

// ==========================================================================
// USUÁRIOS
// ==========================================================================
function salvarUsuario(payload) {
  try {
    if (!payload.chaveAcesso || !payload.nome) return "Chave de Acesso e Nome são obrigatórios!";
    var aba = obterAba("Usuarios", ["Chave de Acesso","Nome","Telefone","Tipo","Foto"]);
    var dados = aba.getDataRange().getValues();
    var chaveAcessoNovo = String(payload.chaveAcesso).trim().replace(/[^\d]/g, "");
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim().replace(/[^\d]/g,"") === chaveAcessoNovo) {
        aba.getRange(i+1,2).setValue(String(payload.nome).trim());
        aba.getRange(i+1,3).setValue(String(payload.telefone||"").trim());
        aba.getRange(i+1,4).setValue(String(payload.tipo||"Marisqueira").trim());
        if (payload.fotoUrl) aba.getRange(i+1,5).setValue(String(payload.fotoUrl).trim());
        SpreadsheetApp.flush();
        return "Cadastro atualizado!";
      }
    }
    aba.appendRow([String(payload.chaveAcesso).trim(), String(payload.nome).trim(), String(payload.telefone||"").trim(), String(payload.tipo||"Marisqueira").trim(), String(payload.fotoUrl||"").trim()]);
    SpreadsheetApp.flush();
    return "Nova pessoa cadastrada!";
  } catch(e) { return "Erro ao salvar: " + e.message; }
}

function excluirUsuarioPorChaveAcesso(chaveAcesso) {
  try {
    var aba = obterAba("Usuarios", ["Chave de Acesso","Nome","Telefone","Tipo","Foto"]);
    var chaveAcessoB = String(chaveAcesso).trim().replace(/[^\d]/g,"");
    for (var r = aba.getLastRow(); r >= 2; r--) {
      if (String(aba.getRange(r,1).getValue()||"").trim().replace(/[^\d]/g,"") === chaveAcessoB) {
        aba.deleteRow(r); SpreadsheetApp.flush(); return "Usuário excluído!";
      }
    }
    return "Usuário não encontrado.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// PRODUTOS
// ==========================================================================
function salvarProduto(payload) {
  try {
    if (!payload.nomeProduto) return "Nome obrigatório!";
    obterAba("Produtos",["Nome","Tipo","Unidade","Valor","Foto","Operador"]).appendRow([String(payload.nomeProduto).trim(), String(payload.tipoProduto||"Marisco").trim(), String(payload.unidade||"KG").trim(), Math.max(0,parseFloat(payload.valor)||0), String(payload.fotoUrl||"").trim(), String(payload.operadorNome||"Sistema").trim()]);
    SpreadsheetApp.flush();
    return "Produto cadastrado!";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// SALGADOS
// ==========================================================================
function salvarSalgado(payload) {
  try {
    if (!payload.nome) return "Nome obrigatório!";
    obterAba("Salgados",["Nome","Descricao","Unidade","Valor","Foto","Operador"]).appendRow([String(payload.nome).trim(), String(payload.descricao||"").trim(), String(payload.unidade||"UN").trim(), Math.max(0,parseFloat(payload.valor)||0), String(payload.fotoUrl||"").trim(), String(payload.operadorNome||"Sistema").trim()]);
    SpreadsheetApp.flush();
    return "Produto processado cadastrado!";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// COMPRADORES
// ==========================================================================
function salvarComprador(payload) {
  try {
    if (!payload.nome) return "Nome obrigatório!";
    obterAba("Compradores",["Nome","Documento","Telefone","Endereço","Foto","Operador"]).appendRow([String(payload.nome).trim(), String(payload.documento||"").trim(), String(payload.telefone||"").trim(), String(payload.endereco||"").trim(), String(payload.fotoUrl||"").trim(), String(payload.operadorNome||"Sistema").trim()]);
    SpreadsheetApp.flush();
    return "Comprador cadastrado!";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// NOTÍCIAS
// ==========================================================================
function salvarNoticia(payload) {
  try {
    if (!payload.titulo) return "Título obrigatório!";
    var val = payload.validade;
    if (!val) { var d=new Date(); d.setDate(d.getDate()+3); val=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
    obterAba("Noticias",["Data","Titulo","Mensagem","Autor","Foto","Validade","ID"]).appendRow([new Date(), String(payload.titulo).trim(), String(payload.mensagem||"").trim(), String(payload.autor||"Sistema").trim(), String(payload.fotoUrl||"").trim(), String(val).trim(), "NOT-"+new Date().getTime()]);
    SpreadsheetApp.flush();
    return "Aviso postado!";
  } catch(e) { return "Erro: " + e.message; }
}

function excluirNoticia(noticiaId) {
  try {
    var aba = obterAba("Noticias",["Data","Titulo","Mensagem","Autor","Foto","Validade","ID"]);
    var idB = String(noticiaId).trim();
    for (var r=aba.getLastRow(); r>=2; r--) {
      if (String(aba.getRange(r,7).getValue()||"").trim()===idB) { aba.deleteRow(r); SpreadsheetApp.flush(); return "Aviso excluído!"; }
    }
    return "Aviso não encontrado.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// EXCLUSÃO GENÉRICA
// ==========================================================================
function excluirItemPorNome(tipo, nome) {
  try {
    var mapa = {
      "produto":   { aba:"Produtos",    cols:["Nome","Tipo","Unidade","Valor","Foto","Operador"] },
      "salgado":   { aba:"Salgados",    cols:["Nome","Descricao","Unidade","Valor","Foto","Operador"] },
      "comprador": { aba:"Compradores", cols:["Nome","Documento","Telefone","Endereço","Foto","Operador"] }
    };
    var cfg = mapa[tipo]; if (!cfg) return "Tipo inválido.";
    var aba = obterAba(cfg.aba, cfg.cols);
    var nB = String(nome).trim().toLowerCase();
    for (var r=aba.getLastRow(); r>=2; r--) {
      if (String(aba.getRange(r,1).getValue()||"").trim().toLowerCase()===nB) { aba.deleteRow(r); SpreadsheetApp.flush(); return tipo.charAt(0).toUpperCase()+tipo.slice(1)+" excluído!"; }
    }
    return "Item não encontrado.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// ENTRADAS (coleta)
// ==========================================================================
function salvarMultiplasEntradas(carrinho) {
  try {
    if (!carrinho || carrinho.length===0) return "Carrinho vazio!";
    var aba = obterAba("Entradas",["Data Registro","Data Mariscagem","Lote","Chave de Acesso Marisqueira","Nome Marisqueira","Produto","Quantidade","Unidade","Operador"]);
    var hoje = new Date();
    var linhas = [], itensEstoque = [];

    carrinho.forEach(function(item) {
      var dtM = item.dataRetro ? new Date(item.dataRetro+"T12:00:00") : hoje;
      var chaveMari = String(item.marisqueiraChave || item.marisqueiraCpf || "").trim();
      var nomeProd = String(item.nomeProduto||"").trim();
      var qtd = Math.max(0,parseFloat(item.quantidade)||0);
      var operador = String(item.operadorNome||"Sistema").trim();

      // 1) Linha do histórico (acumula pra gravar em lote)
      linhas.push([hoje, dtM, String(item.lotePersonalizado||"").trim(), chaveMari, String(item.marisqueiraNome||"").trim(), nomeProd, qtd, String(item.unidade||"KG").trim(), operador]);

      // 2) Item de estoque IN NATURA (acumula pro lote)
      if (chaveMari && nomeProd && qtd > 0) {
        itensEstoque.push({ chave:chaveMari, tipo:"innatura", produto:nomeProd, qtd:qtd, operador:operador });
      }
    });

    // GRAVA TUDO EM LOTE: 1 escrita no histórico + 1 rodada no estoque
    if (linhas.length) {
      aba.getRange(aba.getLastRow()+1, 1, linhas.length, 9).setValues(linhas);
    }
    incrementarEstoqueLote(itensEstoque);

    SpreadsheetApp.flush();
    return "Sucesso! "+carrinho.length+" registro(s) salvo(s) e estoque atualizado.";
  } catch(e) { return "Erro ao salvar entradas: " + e.message; }
}

// ==========================================================================
// BENEFICIAMENTO
// ==========================================================================
function salvarProducaoRendimento(payload) {
  try {
    if (!payload.mariscoOrigem||!payload.produtoFinal||!payload.pesoInNatura||!payload.pesoBeneficiado) return "Todos os campos são obrigatórios!";
    var dtRef = payload.dataRetro ? new Date(payload.dataRetro+"T12:00:00") : new Date();
    var pB = Math.max(0,parseFloat(payload.pesoInNatura)||0);
    var pL = Math.max(0,parseFloat(payload.pesoBeneficiado)||0);
    var chaveDono = String(payload.chaveAcessoOperador || payload.cpfOperador || "").trim();
    var produtoFinal = String(payload.produtoFinal).trim();

    // 1) Registra no histórico de Produção
    obterAba("Producao",["Marisco Origem","Peso In Natura Usado","Peso Beneficiado Obtido","Perdas","Produto Final","Qtd Gerada","Lote","Operador","Data Registro","Data Referência","Chave de Acesso Operador"]).appendRow([String(payload.mariscoOrigem).trim(), pB, pL, Math.max(0,pB-pL), produtoFinal, pL, String(payload.lote||"").trim(), String(payload.operador||"Sistema").trim(), new Date(), dtRef, chaveDono]);

    // 2) ATUALIZA O ESTOQUE:
    //    a) DESCONTA o in natura usado no beneficiamento
    //    b) SOMA o produto beneficiado gerado (vendível)
    if (chaveDono) {
      if (pB > 0) {
        decrementarEstoqueManual(chaveDono, "innatura", String(payload.mariscoOrigem).trim(), pB);
      }
      if (pL > 0) {
        incrementarEstoqueManual(chaveDono, "beneficiado", produtoFinal, pL, String(payload.operador||"Sistema").trim());
      }
    }

    SpreadsheetApp.flush();
    return "Produção gravada! −" + pB.toFixed(2) + " KG in natura, +" + pL.toFixed(2) + " KG de " + produtoFinal + " no estoque.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// PRODUÇÃO DE SALGADOS
// ==========================================================================
function salvarProducaoSalgado(payload) {
  try {
    if (!payload.salgado||!payload.quantidade) return "Produto e quantidade obrigatórios!";
    var qtd = Math.max(0,parseFloat(payload.quantidade)||0);
    if (qtd<=0) return "Quantidade deve ser maior que zero!";
    var dtRef = payload.dataRetro ? new Date(payload.dataRetro+"T12:00:00") : new Date();
    var chaveDono = String(payload.chaveAcessoOperador || payload.cpfOperador || "").trim();
    var nomeSalgado = String(payload.salgado).trim();

    // 1) Registra no histórico de ProdSalgados
    obterAba("ProdSalgados",["Salgado","Quantidade","Lote","Operador","Data Registro","Data Referência","Chave de Acesso Operador","Observacao"]).appendRow([nomeSalgado, qtd, String(payload.lote||"").trim(), String(payload.operador||"Sistema").trim(), new Date(), dtRef, chaveDono, String(payload.observacao||"").trim()]);

    // 2) ALIMENTA O ESTOQUE: soma o salgado no EstoqueManual da pessoa
    if (chaveDono && qtd > 0) {
      incrementarEstoqueManual(chaveDono, "salgado", nomeSalgado, qtd, String(payload.operador||"Sistema").trim());
    }

    SpreadsheetApp.flush();
    var unidTxt = String(payload.unidade||"UN").trim();
    return "Produção registrada! +" + (qtd % 1 === 0 ? qtd.toFixed(0) : qtd.toFixed(2)) + " " + unidTxt + " de " + nomeSalgado + " no estoque.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// NORMALIZADOR DE TIPO DE ESTOQUE — 3 categorias oficiais:
//   "In Natura"   (coleta, ainda não beneficiado)
//   "Beneficiado" (limpo, pronto pra vender)
//   "Salgado"     (produzido direto, sem beneficiar)
// Linhas legadas "Pescado" são tratadas como Beneficiado.
// ==========================================================================
function normTipoEstoque(t) {
  var s = String(t||"").toLowerCase().replace(/[^a-z]/g, "");
  if (s.indexOf("salgado") >= 0)  return { chave:"salgado", rotulo:"Salgado" };
  if (s.indexOf("natura") >= 0)   return { chave:"innatura", rotulo:"In Natura" };
  if (s.indexOf("benefic") >= 0)  return { chave:"beneficiado", rotulo:"Beneficiado" };
  if (s.indexOf("pescado") >= 0)  return { chave:"beneficiado", rotulo:"Beneficiado" }; // legado
  return { chave:"beneficiado", rotulo:"Beneficiado" };
}

// ==========================================================================
// INCREMENTAR ESTOQUE EM LOTE — 1 leitura + 1 escrita pro carrinho INTEIRO
// itens: [{chave, tipo, produto, qtd, operador}]
// ==========================================================================
function incrementarEstoqueLote(itens) {
  try {
    if (!itens || itens.length === 0) return true;
    var aba = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]);
    var dados = aba.getDataRange().getValues();

    // Índice: chave|tipo|produto → linha da PLANILHA (1-based)
    var idx = {};
    for (var i=1; i<dados.length; i++) {
      var k = String(dados[i][0]||"").trim() + "|" + normTipoEstoque(dados[i][2]).chave + "|" + String(dados[i][3]||"").trim();
      idx[k] = i + 1;
    }

    // Nomes de usuários (carrega só se precisar criar linha nova)
    var nomes = null;
    function nomeDe(chave, fallback) {
      if (nomes === null) {
        nomes = {};
        try {
          var us = obterAba("Usuarios",["Chave de Acesso","Nome","Telefone","Tipo","Foto"]).getDataRange().getValues();
          for (var u=1; u<us.length; u++) nomes[String(us[u][0]||"").trim()] = String(us[u][1]||"").trim();
        } catch(e) {}
      }
      return nomes[chave] || fallback || "Sem nome";
    }

    var updates = {};   // linhaPlanilha → novaQtd
    var novas = [];     // linhas para append em lote
    var agora = new Date();

    itens.forEach(function(it) {
      var chave = String(it.chave||"").trim();
      var produto = String(it.produto||"").trim();
      var qtd = Math.max(0, parseFloat(it.qtd)||0);
      if (!chave || !produto || qtd <= 0) return;
      var norm = normTipoEstoque(it.tipo);
      var k = chave + "|" + norm.chave + "|" + produto;

      if (idx[k] !== undefined) {
        var linha = idx[k];
        var atual = (updates[linha] !== undefined) ? updates[linha] : (parseFloat(dados[linha-1][4])||0);
        updates[linha] = atual + qtd;
      } else {
        // Pode repetir dentro do próprio lote
        var achou = false;
        for (var n=0; n<novas.length; n++) {
          if (novas[n][0]===chave && normTipoEstoque(novas[n][2]).chave===norm.chave && novas[n][3]===produto) {
            novas[n][4] += qtd; achou = true; break;
          }
        }
        if (!achou) novas.push([chave, nomeDe(chave, it.operador), norm.rotulo, produto, qtd, agora, String(it.operador||"Sistema")]);
      }
    });

    // Aplica updates (qtd + data)
    for (var linha in updates) {
      var l = parseInt(linha, 10);
      aba.getRange(l, 5, 1, 2).setValues([[updates[linha], agora]]);
    }
    // Append em lote
    if (novas.length) {
      aba.getRange(aba.getLastRow()+1, 1, novas.length, 7).setValues(novas);
    }
    SpreadsheetApp.flush();
    Logger.log("Estoque lote: " + Object.keys(updates).length + " atualizados, " + novas.length + " criados");
    return true;
  } catch(e) {
    Logger.log("Erro incrementarEstoqueLote: " + e.message);
    return false;
  }
}

// ==========================================================================
// INCREMENTAR ESTOQUE (unitário) — wrapper do lote
// ==========================================================================
function incrementarEstoqueManual(chaveAcesso, tipoItem, nomeProduto, quantidade, operadorNome) {
  return incrementarEstoqueLote([{ chave:chaveAcesso, tipo:tipoItem, produto:nomeProduto, qtd:quantidade, operador:operadorNome }]);
}

// ==========================================================================
// SAÍDAS / VENDAS
// ==========================================================================
function decrementarEstoqueManual(chaveAcesso, tipoItem, nomeProduto, quantidade) {
  try {
    var norm = normTipoEstoque(tipoItem);
    var aba = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]);
    var dados = aba.getDataRange().getValues();
    
    for (var i=1; i<dados.length; i++) {
      var chaveExistente = String(dados[i][0]||"").trim();
      var tipoExistente = normTipoEstoque(dados[i][2]).chave;
      var prodExistente = String(dados[i][3]||"").trim();
      
      if (chaveExistente === chaveAcesso && prodExistente === nomeProduto && tipoExistente === norm.chave) {
        var qtdAtual = parseFloat(dados[i][4]) || 0;
        var novaQtd = Math.max(0, qtdAtual - quantidade);
        aba.getRange(i+1, 5).setValue(novaQtd);
        aba.getRange(i+1, 6).setValue(new Date());
        SpreadsheetApp.flush();
        Logger.log("Estoque decrementado (" + norm.rotulo + "): " + nomeProduto + " de " + qtdAtual + " para " + novaQtd);
        return true;
      }
    }
    Logger.log("⚠ Produto não encontrado para decrementar: " + nomeProduto + " (tipo " + norm.rotulo + ", chave " + chaveAcesso + ")");
    return false;
  } catch(e) { 
    Logger.log("Erro decrementar estoque: "+e.message); 
    return false;
  }
}

function salvarSaida(payload) {
  try {
    if (!payload.nomeProduto||!payload.tipoSaida||!payload.qtdVenda) return "Campos obrigatórios não preenchidos!";
    var dtV = payload.dataRetro ? new Date(payload.dataRetro+"T12:00:00") : new Date();
    var qtd = Math.max(0,parseFloat(payload.qtdVenda)||0);
    var vU  = Math.max(0,parseFloat(payload.valorUnidade)||0);
    var destino = String(payload.tipoSaida).trim();
    var tipoItem = String(payload.tipoItem||"pescado").trim();
    var nomeProduto = String(payload.nomeProduto).trim();
    var operadorNome = String(payload.operadorNome||"Sistema").trim();

    // Vendedor: pessoa logada OU a Associação (estoque da AMQMI)
    var vendeAssociacao = String(payload.vendedor||"").toLowerCase() === "associacao";
    var chaveAcessoOperador = vendeAssociacao ? "ASSOCIACAO" : String(payload.vendedor || payload.chaveAcessoOperador || payload.cpfOperador || "").trim();
    
    // Registra na aba Saidas
    obterAba("Saidas",["Produto","Quantidade","Valor Unitário","Total Venda","Destino","Lote","Operador","Data Registro","Data Venda","Unidade","Chave de Acesso Operador","TipoItem"]).appendRow([nomeProduto, qtd, vU, qtd*vU, destino, String(payload.lote||"").trim(), operadorNome, new Date(), dtV, String(payload.unidade||"KG").trim(), chaveAcessoOperador, tipoItem]);
    
    // Desconta do estoque correto
    if (vendeAssociacao) {
      // Sai direto do estoque da ASSOCIAÇÃO
      decrementarEstoqueAssociacao(nomeProduto, qtd, operadorNome);
    } else if (chaveAcessoOperador) {
      // Sai do estoque pessoal de quem vende
      decrementarEstoqueManual(chaveAcessoOperador, tipoItem, nomeProduto, qtd);
    }
    
    // Venda PARA a Associação alimenta o estoque dela (exceto se a própria associação é a vendedora)
    if (destino === "Associação AMQMI" && !vendeAssociacao) {
      obterAba("EstoqueAssociacao",["Produto","Quantidade","Lote","Operador","Data Recebimento","Chave de Acesso Operador"]).appendRow([nomeProduto, qtd, String(payload.lote||"").trim(), operadorNome, dtV, chaveAcessoOperador]);
    }
    
    SpreadsheetApp.flush();
    return "Venda confirmada!";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// EXCLUIR PRODUTO DO ESTOQUE MANUAL — remove a linha (chave + tipo + produto)
// ==========================================================================
function excluirProdutoEstoqueManual(payload) {
  try {
    var chaveAcesso = String(payload.chaveAcesso||"").trim();
    var produto = String(payload.produto||"").trim();
    if (!chaveAcesso || !produto) return "Dados incompletos para excluir.";
    var norm = normTipoEstoque(payload.tipo);
    var aba = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]);
    var dados = aba.getDataRange().getValues();

    for (var i=1; i<dados.length; i++) {
      if (String(dados[i][0]||"").trim() === chaveAcesso
          && normTipoEstoque(dados[i][2]).chave === norm.chave
          && String(dados[i][3]||"").trim() === produto) {
        aba.deleteRow(i+1);
        SpreadsheetApp.flush();
        return "Produto removido do estoque!";
      }
    }
    return "Produto não encontrado no estoque.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// DECREMENTAR ESTOQUE DA ASSOCIAÇÃO — lança linha negativa (auditável)
// ==========================================================================
function decrementarEstoqueAssociacao(nomeProduto, quantidade, operadorNome) {
  try {
    obterAba("EstoqueAssociacao",["Produto","Quantidade","Lote","Operador","Data Recebimento","Chave de Acesso Operador"])
      .appendRow([String(nomeProduto).trim(), -Math.abs(quantidade), "", "Venda: " + (operadorNome||"Sistema"), new Date(), "ASSOCIACAO"]);
    SpreadsheetApp.flush();
    return true;
  } catch(e) {
    Logger.log("Erro decrementar estoque associação: " + e.message);
    return false;
  }
}

function calcularEstoqueAssociacao() {
  try {
    var est = {};
    var fotos = {};
    
    // Inicializa produtos cadastrados com fotos
    var pCad = obterAba("Produtos",["Nome","Tipo","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
    for (var i=1; i<pCad.length; i++) { var n=String(pCad[i][0]||"").trim(); if(n){est[n]=0;fotos[n]=String(pCad[i][4]||"");} }
    
    // Lê EstoqueAssociacao
    var dados = obterAba("EstoqueAssociacao",["Produto","Quantidade","Lote","Operador","Data Recebimento","Chave de Acesso Operador"]).getDataRange().getValues();
    for (var i=1; i<dados.length; i++) {
      var nome = String(dados[i][0]||"").trim();
      if (!nome) continue;
      if (est[nome]===undefined) { est[nome]=0; fotos[nome]=""; }
      est[nome]+=parseFloat(dados[i][1])||0; // soma com sinal: negativos = vendas da associação
    }
    
    var res=[];
    for (var p in est){ if(est[p]>0.001) res.push({nome:p,qtd:Math.max(0,est[p]).toFixed(2),foto:fotos[p]}); }
    return res;
  } catch(e) { Logger.log("Erro estoque associacao: "+e.message); return []; }
}

// ==========================================================================
// METAS
// ==========================================================================
function salvarNovaMeta(payload) {
  try {
    if (!payload.nome||!payload.objetivo) return "Nome e objetivo obrigatórios!";
    obterAba("Metas",["ID","Nome","Objetivo","Realizado","Unidade"]).appendRow(["MT-"+new Date().getTime(), String(payload.nome).trim(), Math.max(0,parseFloat(payload.objetivo)||0), 0, String(payload.unidade||"KG").trim()]);
    SpreadsheetApp.flush();
    return "Meta registrada!";
  } catch(e) { return "Erro: " + e.message; }
}

function adicionarProgressoMeta(idMeta, valor) {
  try {
    var aba = obterAba("Metas",["ID","Nome","Objetivo","Realizado","Unidade"]);
    var dados = aba.getDataRange().getValues();
    for (var i=1; i<dados.length; i++) {
      if (String(dados[i][0]||"").trim()===String(idMeta).trim()) {
        aba.getRange(i+1,4).setValue(Math.max(0,(parseFloat(dados[i][3])||0)+Math.max(0,parseFloat(valor)||0)));
        SpreadsheetApp.flush();
        return "Progresso atualizado!";
      }
    }
    return "Meta não localizada.";
  } catch(e) { return "Erro: " + e.message; }
}

function excluirMeta(idMeta) {
  try {
    var aba = obterAba("Metas",["ID","Nome","Objetivo","Realizado","Unidade"]);
    for (var r=aba.getLastRow(); r>=2; r--) {
      if (String(aba.getRange(r,1).getValue()||"").trim()===String(idMeta).trim()) { aba.deleteRow(r); SpreadsheetApp.flush(); return "Meta excluída!"; }
    }
    return "Meta não encontrada.";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// ESTOQUE MANUAL — registra estoque próprio de cada marisqueira
// ==========================================================================
function salvarEstoqueManual(payload) {
  try {
    if (!payload.chaveAcesso || !payload.nomeMari || !payload.produto || payload.quantidade === undefined) {
      return "Campos obrigatórios não preenchidos!";
    }
    var qtd = Math.max(0, parseFloat(payload.quantidade) || 0);
    var chaveAcesso = String(payload.chaveAcesso).trim();
    // Normaliza pros 3 tipos: In Natura | Beneficiado | Salgado
    var norm = normTipoEstoque(payload.tipo);
    var produto = String(payload.produto).trim();
    
    var aba = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]);
    var dados = aba.getDataRange().getValues();
    
    // Procura se já existe este produto deste tipo para esta marisqueira
    for (var i=1; i<dados.length; i++) {
      var chaveExistente = String(dados[i][0]||"").trim();
      var tipoExistente = normTipoEstoque(dados[i][2]).chave;
      var prodExistente = String(dados[i][3]||"").trim();
      if (chaveExistente === chaveAcesso && prodExistente === produto && tipoExistente === norm.chave) {
        // Atualiza quantidade
        aba.getRange(i+1, 5).setValue(qtd);
        aba.getRange(i+1, 6).setValue(new Date());
        SpreadsheetApp.flush();
        return "Estoque atualizado!";
      }
    }
    
    // Se não existe, cria novo registro
    aba.appendRow([
      chaveAcesso,
      String(payload.nomeMari).trim(),
      norm.rotulo,
      produto,
      qtd,
      new Date(),
      String(payload.operador || "Sistema").trim()
    ]);
    SpreadsheetApp.flush();
    return "Estoque registrado!";
  } catch(e) { return "Erro: " + e.message; }
}

// ==========================================================================
// ESTOQUE
// ==========================================================================
function obterEstoquePorMari(chaveAcessoMari) { return calcularEstoque(chaveAcessoMari || null); }

function obterEstoqueAdminCompleto() {
  try {
    Logger.log("\n=== obterEstoqueAdminCompleto (3 categorias) ===");

    // PASSO 1: Carrega tudo
    var usuarios = obterAba("Usuarios",["Chave de Acesso","Nome","Telefone","Tipo","Foto"]).getDataRange().getValues();
    var manual = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]).getDataRange().getValues();
    Logger.log("Usuarios: " + usuarios.length + " | EstoqueManual: " + manual.length);

    // PASSO 2: Organiza por pessoa nas 3 categorias
    var mapaMari = {};
    for (var i=1; i<usuarios.length; i++) {
      var chave = String(usuarios[i][0]||"").trim();
      if (!chave) continue;
      mapaMari[chave] = {
        chaveAcesso: chave,
        nome: String(usuarios[i][1]||"").trim(),
        tipo: String(usuarios[i][3]||"Marisqueira").trim(),
        foto: String(usuarios[i][4]||"").trim(),
        innatura: {}, beneficiado: {}, salgado: {}
      };
    }

    for (var i=1; i<manual.length; i++) {
      var chave = String(manual[i][0]||"").trim();
      var produto = String(manual[i][3]||"").trim();
      var quantidade = Math.max(0, parseFloat(manual[i][4])||0);
      if (!chave || !produto || !mapaMari[chave]) continue;

      var cat = normTipoEstoque(manual[i][2]).chave; // innatura | beneficiado | salgado
      if (!mapaMari[chave][cat][produto]) mapaMari[chave][cat][produto] = 0;
      mapaMari[chave][cat][produto] += quantidade;
    }

    // PASSO 3: Formata resposta
    function toLista(obj) {
      var arr = [];
      for (var p in obj) if (obj[p] > 0.001) arr.push({ nome:p, qtd:obj[p].toFixed(2), foto:"" });
      arr.sort(function(a,b){ return a.nome.localeCompare(b.nome, 'pt-BR', {sensitivity:'base'}); });
      return arr;
    }

    var porMari = [];
    for (var chave in mapaMari) {
      var mari = mapaMari[chave];
      var inNatura = toLista(mari.innatura);
      var beneficiado = toLista(mari.beneficiado);
      var salgados = toLista(mari.salgado);

      porMari.push({
        chaveAcesso: mari.chaveAcesso,
        nome: mari.nome,
        tipo: mari.tipo,
        foto: mari.foto,
        inNatura: inNatura,
        beneficiado: beneficiado,
        salgados: salgados,
        temEstoque: (inNatura.length > 0 || beneficiado.length > 0 || salgados.length > 0)
      });

      Logger.log("📍 " + mari.nome + ": " + inNatura.length + " in natura, " + beneficiado.length + " beneficiado, " + salgados.length + " salgado");
    }

    var geral = calcularEstoque(null);
    var resposta = {
      porMari: porMari,
      geral: geral,
      salgados: geral.salgados   // compat: mesmo dado do modelo novo, sem releitura
    };

    Logger.log("✅ RESPOSTA: " + porMari.length + " pessoas");
    return resposta;
    
  } catch(e) { 
    Logger.log("\n❌ ERRO: " + e.message);
    Logger.log(e.stack);
    return { porMari:[], geral:{inNatura:[],beneficiado:[]}, salgados:[] }; 
  }
}

function obterEstoqueAssociacao() {
  try {
    return calcularEstoqueAssociacao();
  } catch(e) {
    Logger.log("Erro obter estoque associacao: "+e.message);
    return [];
  }
}

function calcularEstoque(chaveAcessoFiltro) {
  try {
    var res = { inNatura:[], beneficiado:[], salgados:[] };
    var fotos = {};

    // Fotos de produtos e salgados cadastrados
    var pCad = obterAba("Produtos",["Nome","Tipo","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
    for (var i=1; i<pCad.length; i++) { var n=String(pCad[i][0]||"").trim(); if(n) fotos[n]=String(pCad[i][4]||""); }
    var sCad = obterAba("Salgados",["Nome","Descricao","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
    for (var i=1; i<sCad.length; i++) { var n=String(sCad[i][0]||"").trim(); if(n) fotos[n]=String(sCad[i][4]||""); }

    // Lê EstoqueManual — Tipo: In Natura | Beneficiado | Salgado (legado Pescado → Beneficiado)
    var mapa = { innatura:{}, beneficiado:{}, salgado:{} };
    var manual = obterAba("EstoqueManual",["Chave de Acesso Marisqueira","Nome Marisqueira","Tipo","Produto","Quantidade","Data Atualizacao","Operador"]).getDataRange().getValues();

    for (var i=1; i<manual.length; i++) {
      var chaveAtual = String(manual[i][0]||"").trim();
      if (chaveAcessoFiltro && chaveAtual !== chaveAcessoFiltro) continue;

      var tipoChave = normTipoEstoque(manual[i][2]).chave;
      var produto = String(manual[i][3]||"").trim();
      var quantidade = Math.max(0, parseFloat(manual[i][4])||0);
      if (!produto) continue;

      if (!mapa[tipoChave][produto]) mapa[tipoChave][produto] = 0;
      mapa[tipoChave][produto] += quantidade;
    }

    function toLista(obj) {
      var arr = [];
      for (var p in obj) {
        if (obj[p] > 0.001) arr.push({ nome:p, qtd:obj[p].toFixed(2), foto:fotos[p]||"" });
      }
      arr.sort(function(a,b){ return a.nome.localeCompare(b.nome, 'pt-BR', {sensitivity:'base'}); });
      return arr;
    }

    res.inNatura = toLista(mapa.innatura);
    res.beneficiado = toLista(mapa.beneficiado);
    res.salgados = toLista(mapa.salgado);

    Logger.log("calcularEstoque(" + (chaveAcessoFiltro||"geral") + "): " + res.inNatura.length + " in natura, " + res.beneficiado.length + " beneficiado, " + res.salgados.length + " salgado");
    return res;
  } catch(e) { 
    Logger.log("Erro calcularEstoque: "+e.message); 
    return { inNatura:[], beneficiado:[], salgados:[] }; 
  }
}

// ==========================================================================
// RELATÓRIOS
// ==========================================================================
function gerarRelatorio(filtros) {
  try {
    var filtrosMariChave = (filtros && (filtros.marisqueiraChave || filtros.marisqueiraCpf)) || "";
    var cab=[], vals=[], metas=[];
    var dI = filtros.dataIni ? new Date(filtros.dataIni+"T00:00:00") : null;
    var dF = filtros.dataFim ? new Date(filtros.dataFim+"T23:59:59") : null;
    var tz = Session.getScriptTimeZone();

    // Mapa chave de acesso → nome (para identificar a marisqueira dona do registro)
    var mapaNomes = {};
    try {
      var us = obterAba("Usuarios",["Chave de Acesso","Nome","Telefone","Tipo","Foto"]).getDataRange().getValues();
      for (var u=1; u<us.length; u++) {
        var ch = String(us[u][0]||"").trim();
        if (ch) mapaNomes[ch] = String(us[u][1]||"").trim();
      }
    } catch(e) {}

    function nomePorChave(chave, fallback) {
      chave = String(chave||"").trim();
      if (chave === "ASSOCIACAO") return "Associação AMQMI";
      return mapaNomes[chave] || fallback || "—";
    }

    function statusTxt(linhaArr, idxInv) {
      var inv = linhaArr[idxInv["Invalidado"]];
      if (inv === true || String(inv).toUpperCase() === "TRUE") {
        var quem = linhaArr[idxInv["Invalidado Por"]] || "—";
        var dt = linhaArr[idxInv["Data Invalidação"]];
        var dtTxt = "";
        try { dtTxt = dt ? Utilities.formatDate(new Date(dt), Session.getScriptTimeZone(), "dd/MM/yyyy") : ""; } catch(e){}
        return "🚫 Invalidado por " + quem + (dtTxt ? " em " + dtTxt : "");
      }
      return "✅ Válido";
    }

    if (filtros.tipo==="entrada") {
      cab = ["Dt. Coleta","Lote","Marisqueira","Produto","Qtd","Registrado por","Dt. Registro","Status"];
      var abaEnt = obterAba("Entradas",["Data Registro","Data Mariscagem","Lote","Chave de Acesso Marisqueira","Nome Marisqueira","Produto","Quantidade","Unidade","Operador"]);
      var idxInvEnt = garantirColunasInvalidacao(abaEnt);
      var d = abaEnt.getDataRange().getValues();
      var cab0 = d.length>0 ? String(d[0][2]||"") : "";
      var old = (cab0==="Local");
      for (var i=1; i<d.length; i++) {
        try {
          var chaveAcessoC=old?4:3, nomeC=old?5:4, prodC=old?6:5, qtdC=old?7:6, unC=old?8:7, loteC=old?3:2, operC=old?9:8;
          var df=new Date(d[i][1]||d[i][0]); var dr=new Date(d[i][0]);
          if(dI&&df<dI)continue; if(dF&&df>dF)continue;
          if(filtrosMariChave&&String(d[i][chaveAcessoC]||"").trim()!==String(filtrosMariChave).trim())continue;
          vals.push([Utilities.formatDate(df,tz,"dd/MM/yyyy"), String(d[i][loteC]||"—"), String(d[i][nomeC]||""), String(d[i][prodC]||""), (parseFloat(d[i][qtdC])||0).toFixed(2)+" "+(d[i][unC]||"KG"), String(d[i][operC]||"—"), Utilities.formatDate(dr,tz,"dd/MM/yyyy HH:mm"), statusTxt(d[i], idxInvEnt)]);
          metas.push({sheet:"Entradas", linha:i+1});
        } catch(e){}
      }
    } else if (filtros.tipo==="salgado") {
      cab = ["Dt. Produção","Lote","Produto","Qtd","Marisqueira","Registrado por","Observação","Dt. Registro"];
      // Unidade real de cada processado (do cadastro)
      var mapaUnid = {};
      try {
        var sc = obterAba("Salgados",["Nome","Descricao","Unidade","Valor","Foto","Operador"]).getDataRange().getValues();
        for (var s=1; s<sc.length; s++) { var n=String(sc[s][0]||"").trim(); if(n) mapaUnid[n]=String(sc[s][2]||"UN").trim(); }
      } catch(e) {}

      var abaSalg = obterAba("ProdSalgados",["Salgado","Quantidade","Lote","Operador","Data Registro","Data Referência","Chave de Acesso Operador","Observacao"]);
      var idxInvSalg = garantirColunasInvalidacao(abaSalg);
      var d = abaSalg.getDataRange().getValues();
      for (var i=1; i<d.length; i++) {
        try {
          var df=new Date(d[i][5]||d[i][4]); var dr=new Date(d[i][4]);
          if(dI&&df<dI)continue; if(dF&&df>dF)continue;
          if(filtrosMariChave&&String(d[i][6]||"").trim()!==String(filtrosMariChave).trim())continue;
          var nomeProd = String(d[i][0]||"");
          var unid = mapaUnid[nomeProd] || "UN";
          var qtdNum = parseFloat(d[i][1])||0;
          var qtdTxt = (qtdNum % 1 === 0 ? qtdNum.toFixed(0) : qtdNum.toFixed(2)) + " " + unid;
          var dona = nomePorChave(d[i][6], String(d[i][3]||""));
          vals.push([Utilities.formatDate(df,tz,"dd/MM/yyyy"), String(d[i][2]||"—"), nomeProd, qtdTxt, dona, String(d[i][3]||"—"), String(d[i][7]||""), Utilities.formatDate(dr,tz,"dd/MM/yyyy HH:mm"), statusTxt(d[i], idxInvSalg)]);
          metas.push({sheet:"ProdSalgados", linha:i+1});
        } catch(e){}
      }
    } else {
      cab = ["Dt. Venda","Lote","Vendedor(a)","Produto","Qtd","Total (R$)","Comprador","Tipo","Registrado por","Dt. Registro","Status"];
      var abaSai = obterAba("Saidas",["Produto","Quantidade","Valor Unitário","Total Venda","Destino","Lote","Operador","Data Registro","Data Venda","Unidade","Chave de Acesso Operador","TipoItem"]);
      var idxInvSai = garantirColunasInvalidacao(abaSai);
      var d = abaSai.getDataRange().getValues();
      for (var i=1; i<d.length; i++) {
        try {
          var df=new Date(d[i][8]||d[i][7]); var dr=new Date(d[i][7]);
          var comp=String(d[i][4]||""); var registrador=String(d[i][6]||"");
          // Vendedor(a) REAL: dono do estoque de onde saiu (chave col 10); Associação tem chave própria
          var vendedorReal = nomePorChave(d[i][10], registrador);
          if(dI&&df<dI)continue; if(dF&&df>dF)continue;
          if(filtros.vendedor && vendedorReal!==filtros.vendedor && registrador!==filtros.vendedor)continue;
          if (filtros.compradorEsporadico) {
            // Filtra só vendas pra "Comprador Esporádico" (destino salvo como "Esporádico: <nome>")
            if (comp.indexOf("Esporádico:") !== 0) continue;
            var nomeEsp = String(filtros.nomeEsporadico||"").trim().toLowerCase();
            if (nomeEsp && comp.toLowerCase().indexOf(nomeEsp) === -1) continue;
          } else if (filtros.compradorNome && comp.indexOf(filtros.compradorNome)===-1) {
            continue;
          }
          var ti=String(d[i][11]||"pescado").trim();
          vals.push([Utilities.formatDate(df,tz,"dd/MM/yyyy"), String(d[i][5]||"—"), vendedorReal, String(d[i][0]||""), (parseFloat(d[i][1])||0).toFixed(2)+" "+(d[i][9]||"KG"), "R$ "+(parseFloat(d[i][3])||0).toFixed(2), comp, ti==="salgado"?"🥟 Processado":"🦀 Pescado", registrador||"—", Utilities.formatDate(dr,tz,"dd/MM/yyyy HH:mm"), statusTxt(d[i], idxInvSai)]);
          metas.push({sheet:"Saidas", linha:i+1});
        } catch(e){}
      }
    }
    return {cabecalho:cab, valores:vals, metas:metas};
  } catch(e) { Logger.log("Erro relatório: "+e.message); return {cabecalho:[],valores:[],metas:[]}; }
}

// ==========================================================================
// UPLOAD E CONFIGURAÇÕES
// ==========================================================================
function uploadFotoParaDrive(base64Data, nomeArquivo) {
  try {
    if (!base64Data||base64Data.length<100) return "";
    var split=base64Data.split(",");
    var ct="image/jpeg"; try{var m=split[0].match(/:(.*?);/);if(m)ct=m[1];}catch(e){}
    var bytes=Utilities.base64Decode(split[1]);
    var blob=Utilities.newBlob(bytes,ct,nomeArquivo);
    var pastas=DriveApp.getFoldersByName("Imagens_Caderno_Gestao");
    var pasta=pastas.hasNext()?pastas.next():DriveApp.createFolder("Imagens_Caderno_Gestao");
    var arq=pasta.createFile(blob);
    arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    return "https://drive.google.com/thumbnail?id="+arq.getId()+"&sz=w1000";
  } catch(e) { Logger.log("Erro upload: "+e.message); return ""; }
}

function obterLogoInicial() {
  try { var d=obterAba("Config",["Chave","Valor"]).getDataRange().getValues(); for(var i=1;i<d.length;i++){if(d[i][0]==="LOGO_URL")return d[i][1];} } catch(e){}
  return "https://cdn-icons-png.flaticon.com/512/3060/3060790.png";
}

function salvarLogo(url) {
  try {
    if(!url||url.length<10)return "URL inválida!";
    var a=obterAba("Config",["Chave","Valor"]); var d=a.getDataRange().getValues();
    for(var i=1;i<d.length;i++){if(d[i][0]==="LOGO_URL"){a.getRange(i+1,2).setValue(url);SpreadsheetApp.flush();return "Logo atualizada!";}}
    a.appendRow(["LOGO_URL",url]); SpreadsheetApp.flush(); return "Logo salva!";
  } catch(e){return "Erro: "+e.message;}
}

function obterBannerInicial() {
  try { var d=obterAba("Config",["Chave","Valor"]).getDataRange().getValues(); for(var i=1;i<d.length;i++){if(d[i][0]==="BANNER_URL")return d[i][1];} } catch(e){}
  return "";
}

function salvarConfiguracaoBanner(url) {
  try {
    if(!url||url.length<10)return "URL inválida!";
    var a=obterAba("Config",["Chave","Valor"]); var d=a.getDataRange().getValues();
    for(var i=1;i<d.length;i++){if(d[i][0]==="BANNER_URL"){a.getRange(i+1,2).setValue(url);SpreadsheetApp.flush();return "Banner atualizado!";}}
    a.appendRow(["BANNER_URL",url]); SpreadsheetApp.flush(); return "Banner salvo!";
  } catch(e){return "Erro: "+e.message;}
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Caderneta de Gestão")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport","width=device-width, initial-scale=1");
}