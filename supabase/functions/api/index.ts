import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
});
const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const normTipo = (v: unknown) => {
  const s = clean(v).toLowerCase().replace(/[^a-z]/g, "");
  if (s.includes("salgado")) return "Salgado";
  if (s.includes("natura")) return "In Natura";
  return "Beneficiado";
};
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function b64url(bytes: Uint8Array) {
  let binary = ""; bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64url(s: string) {
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function sign(payload: Record<string, unknown>) {
  const secret = Deno.env.get("APP_AUTH_SECRET");
  if (!secret) throw new Error("Configure APP_AUTH_SECRET nas variáveis da Edge Function.");
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}
async function session(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Faça login novamente para continuar.");
  const secret = Deno.env.get("APP_AUTH_SECRET");
  if (!secret) throw new Error("Configure APP_AUTH_SECRET nas variáveis da Edge Function.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("HMAC", key, unb64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error("Sessão inválida. Faça login novamente.");
  const claims = JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
  if (!claims.exp || claims.exp < Date.now() / 1000) throw new Error("Sessão expirada. Faça login novamente.");
  const current = await one("usuarios", "chave_acesso", claims.chaveAcesso);
  if (!current) throw new Error("Usuário não encontrado. Faça login novamente.");
  return { chaveAcesso:current.chave_acesso,nome:current.nome,tipo:current.tipo };
}
function requireAdmin(user: { tipo: string }) {
  if (user.tipo !== "Administrativo") throw new Error("Esta ação é exclusiva da administração.");
}
async function rows(table: string, order = "") {
  const result: any[] = [];
  for (let start = 0; ; start += 1000) {
    let q = supabase.from(table).select("*").range(start, start + 999);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return result;
}
async function one(table: string, key: string, value: unknown) {
  const { data, error } = await supabase.from(table).select("*").eq(key, value).maybeSingle();
  if (error) throw error;
  return data;
}
async function saveStock(key: string, name: string, type: string, product: string, delta: number, operator: string, setValue = false) {
  if (!key || !product) return;
  const typeLabel = normTipo(type);
  // Resolve the full composite key so one product/category remains a single balance.
  const { data: found, error: findError } = await supabase.from("estoque_manual").select("*")
    .eq("chave_acesso", key).eq("tipo", typeLabel).eq("produto", product).maybeSingle();
  if (findError) throw findError;
  const qty = setValue ? Math.max(0, delta) : Math.max(0, num(found?.quantidade) + delta);
  const { error } = await supabase.from("estoque_manual").upsert({
    chave_acesso: key, nome_mari: name || "Sem nome", tipo: typeLabel,
    produto, quantidade: qty, data_atualizacao: new Date().toISOString(), operador,
  }, { onConflict: "chave_acesso,tipo,produto" });
  if (error) throw error;
}
async function applyOperation(id: string, fn: string, payload: any, user: { chaveAcesso: string; nome: string; tipo: string }) {
  const { data, error } = await supabase.rpc("processar_operacao_offline", {
    p_id: id, p_tipo: fn, p_payload: payload, p_usuario_chave: user.chaveAcesso,
    p_usuario_nome: user.nome, p_usuario_tipo: user.tipo,
  });
  if (error) return { id, status: "retry", msg: error.message || "Falha temporária ao sincronizar." };
  return data;
}
async function stockFor(key: string | null) {
  let q = supabase.from("estoque_manual").select("*");
  if (key) q = q.eq("chave_acesso", key);
  const { data, error } = await q;
  if (error) throw error;
  const result: Record<string, any[]> = { inNatura: [], beneficiado: [], salgados: [] };
  const groups: Record<string, any[]> = { "In Natura": result.inNatura, "Beneficiado": result.beneficiado, "Salgado": result.salgados };
  for (const r of data || []) if (num(r.quantidade) > 0.001) groups[r.tipo]?.push({ nome: r.produto, qtd: num(r.quantidade).toFixed(2), foto: "" });
  for (const list of Object.values(result)) list.sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  return result;
}

async function options(user: { chaveAcesso: string; tipo: string }) {
  const [users, products, salty, buyers, goals, news, config] = await Promise.all([
    rows("usuarios", "nome"), rows("produtos", "nome"), rows("salgados", "nome"), rows("compradores", "nome"),
    rows("metas", "nome"), rows("noticias", "data"), rows("configuracoes"),
  ]);
  const date = today();
  const activeNews = news.filter(n => !n.validade || n.validade >= date).reverse().map(n => ({
    id: n.id, data: new Date(n.data).toLocaleDateString("pt-BR"), titulo: n.titulo, mensagem: n.mensagem, autor: n.autor, fotoUrl: n.foto,
  }));
  const cfg = Object.fromEntries(config.map(c => [c.chave,c.valor]));
  const visibleUsers = user.tipo === "Administrativo" ? users : users.filter(u => u.chave_acesso === user.chaveAcesso);
  const buyersOut = buyers.map(c => ({ nome: c.nome, foto: c.foto || "" }));
  buyersOut.push({ nome: "Associação AMQMI", foto: "" }, { nome: "Comprador Esporádico", foto: "" });
  return {
    marisqueiras: visibleUsers.filter(u => u.tipo === "Marisqueira").map(userShape), todosUsuarios: visibleUsers.map(userShape),
    produtos: products.map(p => ({ nome:p.nome,tipo:p.tipo,unidade:p.unidade,valor:num(p.valor),foto:p.foto })),
    salgados: salty.map(p => ({ nome:p.nome,descricao:p.descricao,unidade:p.unidade,valor:num(p.valor),foto:p.foto })),
    compradores: buyersOut, metas: goals.map(m => ({ id:m.id,nome:m.nome,objetivo:num(m.objetivo),realizado:num(m.realizado),unidade:m.unidade })),
    noticias: activeNews, bannerUrl: cfg.BANNER_URL || "", logoUrl: cfg.LOGO_URL || "",
  };
}
function userShape(u: any) { return { chaveAcesso:u.chave_acesso,nome:u.nome,telefone:u.telefone,tipo:u.tipo,foto:u.foto }; }

async function inventoryAssociation() {
  const [stock, products] = await Promise.all([rows("estoque_associacao"), rows("produtos")]);
  const qty: Record<string, number> = {};
  for (const item of products) qty[item.nome] = 0;
  for (const item of stock) qty[item.produto] = (qty[item.produto] || 0) + num(item.quantidade);
  return Object.keys(qty).filter(name => qty[name] > 0.001).map(nome => ({ nome, qtd: qty[nome].toFixed(2), foto: products.find(p => p.nome === nome)?.foto || "" }));
}

async function report(f: any, user: { chaveAcesso:string; nome:string; tipo:string }) {
  const type = f.tipo;
  const table = type === "entrada" ? "entradas" : type === "salgado" ? "prod_salgados" : "saidas";
  const [records, users, salty] = await Promise.all([rows(table), rows("usuarios"), rows("salgados")]);
  const people = Object.fromEntries(users.map(u => [u.chave_acesso,u.nome]));
  const mapName = (key: string, fallback: string) => key === "ASSOCIACAO" ? "Associação AMQMI" : people[key] || fallback || "—";
  const start = f.dataIni || "0000-01-01", end = f.dataFim || "9999-12-31";
  const values: string[][] = [], metas: any[] = [];
  const headers = type === "entrada"
    ? ["Dt. Coleta","Lote","Marisqueira","Produto","Qtd","Registrado por","Dt. Registro","Status"]
    : type === "salgado"
      ? ["Dt. Produção","Lote","Produto","Qtd","Marisqueira","Registrado por","Observação","Dt. Registro","Status"]
      : ["Dt. Venda","Lote","Vendedor(a)","Produto","Qtd","Total (R$)","Comprador","Tipo","Registrado por","Dt. Registro","Status"];
  records.forEach((r: any, index: number) => {
    const refDate = type === "entrada" ? r.data_mariscagem : type === "salgado" ? r.data_referencia : r.data_venda;
    if (refDate < start || refDate > end) return;
    if (user.tipo !== "Administrativo" && r.chave_acesso_operador && r.chave_acesso_operador !== user.chaveAcesso && r.chave_marisqueira !== user.chaveAcesso) return;
    if (type !== "saida" && f.marisqueiraChave && (r.chave_marisqueira || r.chave_acesso_operador) !== f.marisqueiraChave) return;
    if (type === "saida") {
      const seller = mapName(r.chave_acesso_operador, r.operador);
      if (f.vendedor && seller !== f.vendedor && r.operador !== f.vendedor) return;
      if (f.compradorEsporadico && !String(r.destino).startsWith("Esporádico:")) return;
      if (f.nomeEsporadico && !r.destino.toLowerCase().includes(String(f.nomeEsporadico).toLowerCase())) return;
      if (!f.compradorEsporadico && f.compradorNome && !r.destino.includes(f.compradorNome)) return;
      values.push([new Date(r.data_venda).toLocaleDateString("pt-BR"),r.lote || "—",seller,r.produto,`${num(r.quantidade).toFixed(2)} ${r.unidade}`,`R$ ${num(r.total_venda).toFixed(2)}`,r.destino,r.tipo_item === "salgado" ? "🥟 Processado" : "🦀 Pescado",r.operador,new Date(r.data_registro).toLocaleString("pt-BR"),r.invalidado ? `🚫 Invalidado por ${r.invalidado_por || "—"}` : "✅ Válido"]);
    } else if (type === "entrada") {
      values.push([new Date(r.data_mariscagem).toLocaleDateString("pt-BR"),r.lote || "—",r.nome_marisqueira,r.produto,`${num(r.quantidade).toFixed(2)} ${r.unidade}`,r.operador,new Date(r.data_registro).toLocaleString("pt-BR"),r.invalidado ? `🚫 Invalidado por ${r.invalidado_por || "—"}` : "✅ Válido"]);
    } else {
      const unit = salty.find(s => s.nome === r.salgado)?.unidade || "UN";
      values.push([new Date(r.data_referencia).toLocaleDateString("pt-BR"),r.lote || "—",r.salgado,`${num(r.quantidade)} ${unit}`,mapName(r.chave_acesso_operador,r.operador),r.operador,r.observacao || "",new Date(r.data_registro).toLocaleString("pt-BR"),r.invalidado ? `🚫 Invalidado por ${r.invalidado_por || "—"}` : "✅ Válido"]);
    }
    metas.push({ sheet: type === "entrada" ? "Entradas" : type === "salgado" ? "ProdSalgados" : "Saidas", linha:r.id });
  });
  return { cabecalho: headers, valores: values, metas };
}

async function dispatch(action: string, args: any, user: any) {
  const payload = Array.isArray(args) ? args[0] : args;
  switch (action) {
    case "realizarLogin": {
      const key = clean(args).replace(/\D/g, "");
      if (!key) return { sucesso:false,mensagem:"Chave de acesso inválida!" };
      const found = (await rows("usuarios")).find(u => clean(u.chave_acesso).replace(/\D/g, "") === key);
      if (!found) return { sucesso:false,mensagem:"Chave de acesso não encontrada!" };
      const shape = userShape(found);
      const token = await sign({ ...shape, exp:Math.floor(Date.now()/1000)+60*60*24*30 });
      return { sucesso:true,...shape,token };
    }
    case "buscarOpcoesFormularios": return await options(user);
    case "inicializarAbas": requireAdmin(user); return "✓ Sistema inicializado com sucesso!";
    case "processarFilaOffline": {
      const results = [];
      for (const item of (Array.isArray(payload) ? payload : [])) results.push(await applyOperation(clean(item.id),clean(item.fn),item.payload,user));
      return results;
    }
    case "obterEstoquePorMari": return await stockFor(user.tipo === "Administrativo" ? clean(payload) || null : user.chaveAcesso);
    case "calcularEstoque": return await stockFor(user.tipo === "Administrativo" ? clean(payload) || null : user.chaveAcesso);
    case "obterEstoqueAssociacao": requireAdmin(user); return await inventoryAssociation();
    case "obterEstoqueAdminCompleto": {
      requireAdmin(user);
      const users = await rows("usuarios","nome");
      const porMari = [];
      for (const u of users) {
        const est = await stockFor(u.chave_acesso);
        porMari.push({ chaveAcesso:u.chave_acesso,nome:u.nome,tipo:u.tipo,foto:u.foto,
          inNatura:est.inNatura,beneficiado:est.beneficiado,salgados:est.salgados,
          temEstoque:est.inNatura.length+est.beneficiado.length+est.salgados.length>0 });
      }
      return { porMari, geral:await stockFor(null) };
    }
    case "salvarEstoqueManual": {
      const key = user.tipo === "Administrativo" ? clean(payload.chaveAcesso) : user.chaveAcesso;
      await saveStock(key, user.tipo === "Administrativo" ? payload.nomeMari : user.nome, payload.tipo, payload.produto, num(payload.quantidade), user.nome, true);
      return "Estoque atualizado!";
    }
    case "excluirProdutoEstoqueManual": {
      const key = user.tipo === "Administrativo" ? clean(payload.chaveAcesso) : user.chaveAcesso;
      const { error } = await supabase.from("estoque_manual").delete().eq("chave_acesso",key).eq("tipo",normTipo(payload.tipo)).eq("produto",clean(payload.produto));
      if (error) throw error;
      return "Produto removido do estoque!";
    }
    case "salvarUsuario": {
      requireAdmin(user);
      if (!payload.chaveAcesso || !payload.nome) return "Chave de Acesso e Nome são obrigatórios!";
      const { error } = await supabase.from("usuarios").upsert({ chave_acesso:clean(payload.chaveAcesso),nome:clean(payload.nome),telefone:clean(payload.telefone),tipo:clean(payload.tipo)||"Marisqueira",foto:clean(payload.fotoUrl) });
      if (error) throw error;
      return "Cadastro atualizado!";
    }
    case "excluirUsuarioPorChaveAcesso": { requireAdmin(user); const { error } = await supabase.from("usuarios").delete().eq("chave_acesso",clean(payload)); if (error) throw error; return "Usuário excluído!"; }
    case "salvarProduto": { requireAdmin(user); const { error } = await supabase.from("produtos").upsert({nome:clean(payload.nomeProduto),tipo:clean(payload.tipoProduto)||"Marisco",unidade:clean(payload.unidade)||"KG",valor:num(payload.valor),foto:clean(payload.fotoUrl),operador:user.nome}); if (error) throw error; return "Produto cadastrado!"; }
    case "salvarSalgado": { requireAdmin(user); const { error } = await supabase.from("salgados").upsert({nome:clean(payload.nome),descricao:clean(payload.descricao),unidade:clean(payload.unidade)||"UN",valor:num(payload.valor),foto:clean(payload.fotoUrl),operador:user.nome}); if (error) throw error; return "Produto processado cadastrado!"; }
    case "salvarComprador": { requireAdmin(user); const { error } = await supabase.from("compradores").upsert({nome:clean(payload.nome),documento:clean(payload.documento),telefone:clean(payload.telefone),endereco:clean(payload.endereco),foto:clean(payload.fotoUrl),operador:user.nome},{onConflict:"nome"}); if (error) throw error; return "Comprador cadastrado!"; }
    case "salvarNoticia": { requireAdmin(user); const { error } = await supabase.from("noticias").insert({id:`NOT-${Date.now()}`,titulo:clean(payload.titulo),mensagem:clean(payload.mensagem),autor:user.nome,foto:clean(payload.fotoUrl),validade:payload.validade||null}); if (error) throw error; return "Aviso postado!"; }
    case "excluirNoticia": { requireAdmin(user); const { error } = await supabase.from("noticias").delete().eq("id",clean(payload)); if (error) throw error; return "Aviso excluído!"; }
    case "excluirItemPorNome": {
      requireAdmin(user); const tables:Record<string,string>={produto:"produtos",salgado:"salgados",comprador:"compradores"};
      const table=tables[clean(args[0])]; if (!table) return "Tipo inválido.";
      const { error }=await supabase.from(table).delete().eq("nome",clean(args[1])); if(error) throw error; return "Item excluído!";
    }
    case "salvarNovaMeta": { requireAdmin(user); const { error }=await supabase.from("metas").insert({id:`MT-${Date.now()}`,nome:clean(payload.nome),objetivo:num(payload.objetivo),unidade:clean(payload.unidade)||"KG"}); if(error) throw error; return "Meta registrada!"; }
    case "adicionarProgressoMeta": { requireAdmin(user); const id=clean(args[0]), value=num(args[1]); const m=await one("metas","id",id); if(!m) return "Meta não localizada."; const {error}=await supabase.from("metas").update({realizado:num(m.realizado)+Math.max(0,value)}).eq("id",id); if(error) throw error; return "Progresso atualizado!"; }
    case "excluirMeta": { requireAdmin(user); const {error}=await supabase.from("metas").delete().eq("id",clean(payload)); if(error) throw error; return "Meta excluída!"; }
    case "obterLogoInicial": return (await one("configuracoes","chave","LOGO_URL"))?.valor || "https://cdn-icons-png.flaticon.com/512/3060/3060790.png";
    case "obterBannerInicial": return (await one("configuracoes","chave","BANNER_URL"))?.valor || "";
    case "salvarLogo": case "salvarConfiguracaoBanner": {
      requireAdmin(user); const key=action === "salvarLogo" ? "LOGO_URL" : "BANNER_URL";
      const {error}=await supabase.from("configuracoes").upsert({chave:key,valor:clean(payload)}); if(error) throw error;
      return action === "salvarLogo" ? "Logo atualizada!" : "Banner atualizado!";
    }
    case "uploadFotoParaDrive": {
      requireAdmin(user); const data=clean(args[0]), name=clean(args[1])||`imagem-${Date.now()}.jpg`;
      const match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/); if(!match) throw new Error("Formato de imagem inválido.");
      const binary=atob(match[2]), bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      if(bytes.length>5*1024*1024) throw new Error("A imagem deve ter até 5 MB.");
      const path=`${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const {error}=await supabase.storage.from("midia").upload(path,bytes,{contentType:match[1],upsert:false}); if(error) throw error;
      return supabase.storage.from("midia").getPublicUrl(path).data.publicUrl;
    }
    case "gerarRelatorio": requireOnline(user); return await report(payload,user);
    case "invalidarRegistro": {
      requireAdmin(user);
      const table=payload.sheet === "Entradas" ? "entradas" : payload.sheet === "ProdSalgados" ? "prod_salgados" : payload.sheet === "Saidas" ? "saidas" : "";
      if (!table) return "Registro inválido para invalidação.";
      const row=await one(table,"id",clean(payload.linha)); if(!row) return "Registro não encontrado.";
      if(row.invalidado) return "Esse registro já estava invalidado.";
      if (table === "entradas") {
        await saveStock(row.chave_marisqueira,row.nome_marisqueira,"In Natura",row.produto,-num(row.quantidade),user.nome);
      } else if (table === "producao") {
        await saveStock(row.chave_acesso_operador,"","In Natura",row.marisco_origem,num(row.peso_in_natura_usado),user.nome);
        await saveStock(row.chave_acesso_operador,"","Beneficiado",row.produto_final,-num(row.qtd_gerada),user.nome);
      } else if (table === "prod_salgados") {
        await saveStock(row.chave_acesso_operador,"","Salgado",row.salgado,-num(row.quantidade),user.nome);
      } else if (table === "saidas") {
        if (row.chave_acesso_operador === "ASSOCIACAO") {
          const {error:stockError}=await supabase.from("estoque_associacao").insert({produto:row.produto,quantidade:num(row.quantidade),operador:`Estorno: ${user.nome}`,chave_acesso_operador:"ASSOCIACAO"});
          if(stockError) throw stockError;
        } else {
          await saveStock(row.chave_acesso_operador,"",row.tipo_item === "salgado" ? "Salgado" : "Beneficiado",row.produto,num(row.quantidade),user.nome);
          if(row.destino === "Associação AMQMI") {
            const {error:stockError}=await supabase.from("estoque_associacao").insert({produto:row.produto,quantidade:-num(row.quantidade),operador:`Estorno: ${user.nome}`,chave_acesso_operador:row.chave_acesso_operador});
            if(stockError) throw stockError;
          }
        }
      }
      const {error}=await supabase.from(table).update({invalidado:true,invalidado_por:user.nome,motivo_invalidacao:clean(payload.motivo),data_invalidacao:new Date().toISOString()}).eq("id",row.id);
      if(error) throw error;
      return "Registro invalidado e mantido no relatório para auditoria.";
    }
    default: throw new Error(`Operação não implementada: ${action}`);
  }
}
function requireOnline(_user: unknown) { /* Reports require a live connection on the client. */ }

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error:"Método não permitido." },405);
  try {
    const { action, args } = await req.json();
    if (action === "realizarLogin") return json(await dispatch(action,args,null));
    const user = await session(req);
    return json(await dispatch(String(action),args,user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no servidor.";
    return json({ error:message }, message.startsWith("Sessão") || message.startsWith("Faça login") ? 401 : 400);
  }
});

