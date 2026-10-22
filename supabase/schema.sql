-- Caderneta de Gestão: estrutura inicial no PostgreSQL (Supabase).
-- Execute uma vez no SQL Editor do projeto. As tabelas ficam fechadas para
-- acesso direto; somente a Edge Function, com chave de serviço no servidor,
-- pode alterar os dados.

create extension if not exists pgcrypto;

create table if not exists public.usuarios (
  chave_acesso text primary key,
  nome text not null,
  telefone text not null default '',
  tipo text not null default 'Marisqueira',
  foto text not null default '',
  criado_em timestamptz not null default now()
);
create table if not exists public.produtos (
  nome text primary key, tipo text not null default 'Marisco', unidade text not null default 'KG',
  valor numeric(12,2) not null default 0, foto text not null default '', operador text not null default ''
);
create table if not exists public.salgados (
  nome text primary key, descricao text not null default '', unidade text not null default 'UN',
  valor numeric(12,2) not null default 0, foto text not null default '', operador text not null default ''
);
create table if not exists public.compradores (
  id uuid primary key default gen_random_uuid(), nome text not null unique, documento text not null default '',
  telefone text not null default '', endereco text not null default '', foto text not null default '', operador text not null default ''
);
create table if not exists public.estoque_manual (
  chave_acesso text not null references public.usuarios(chave_acesso) on update cascade on delete cascade,
  nome_mari text not null, tipo text not null check (tipo in ('In Natura','Beneficiado','Salgado')),
  produto text not null, quantidade numeric(14,3) not null default 0 check (quantidade >= 0),
  data_atualizacao timestamptz not null default now(), operador text not null default '',
  primary key (chave_acesso,tipo,produto)
);
create table if not exists public.entradas (
  id uuid primary key default gen_random_uuid(), operacao_id text not null default gen_random_uuid()::text, data_registro timestamptz not null default now(),
  data_mariscagem date not null default current_date, lote text not null default '', chave_marisqueira text not null,
  nome_marisqueira text not null default '', produto text not null, quantidade numeric(14,3) not null,
  unidade text not null default 'KG', operador text not null default '', invalidado boolean not null default false,
  invalidado_por text, motivo_invalidacao text, data_invalidacao timestamptz
);
create table if not exists public.producao (
  id uuid primary key default gen_random_uuid(), operacao_id text not null default gen_random_uuid()::text, marisco_origem text not null,
  peso_in_natura_usado numeric(14,3) not null, peso_beneficiado_obtido numeric(14,3) not null,
  perdas numeric(14,3) not null default 0, produto_final text not null, qtd_gerada numeric(14,3) not null,
  lote text not null default '', operador text not null default '', data_registro timestamptz not null default now(),
  data_referencia date not null default current_date, chave_acesso_operador text not null,
  invalidado boolean not null default false, invalidado_por text, motivo_invalidacao text, data_invalidacao timestamptz
);
create table if not exists public.prod_salgados (
  id uuid primary key default gen_random_uuid(), operacao_id text not null default gen_random_uuid()::text, salgado text not null,
  quantidade numeric(14,3) not null, lote text not null default '', operador text not null default '',
  data_registro timestamptz not null default now(), data_referencia date not null default current_date,
  chave_acesso_operador text not null, observacao text not null default '', invalidado boolean not null default false,
  invalidado_por text, motivo_invalidacao text, data_invalidacao timestamptz
);
create table if not exists public.saidas (
  id uuid primary key default gen_random_uuid(), operacao_id text not null default gen_random_uuid()::text, produto text not null,
  quantidade numeric(14,3) not null, valor_unitario numeric(12,2) not null default 0, total_venda numeric(12,2) not null default 0,
  destino text not null, lote text not null default '', operador text not null default '', data_registro timestamptz not null default now(),
  data_venda date not null default current_date, unidade text not null default 'KG', chave_acesso_operador text not null,
  tipo_item text not null default 'pescado', invalidado boolean not null default false, invalidado_por text,
  motivo_invalidacao text, data_invalidacao timestamptz
);
create table if not exists public.estoque_associacao (
  id uuid primary key default gen_random_uuid(), produto text not null, quantidade numeric(14,3) not null,
  lote text not null default '', operador text not null default '', data_recebimento timestamptz not null default now(),
  chave_acesso_operador text not null default ''
);
create table if not exists public.metas (
  id text primary key, nome text not null, objetivo numeric(14,3) not null, realizado numeric(14,3) not null default 0,
  unidade text not null default 'KG'
);
create table if not exists public.noticias (
  id text primary key, data timestamptz not null default now(), titulo text not null, mensagem text not null default '',
  autor text not null default '', foto text not null default '', validade date
);
create table if not exists public.configuracoes (
  chave text primary key, valor text not null default ''
);
create table if not exists public.operacoes_offline (
  id text primary key, tipo text not null, payload jsonb not null, estado text not null default 'ok',
  mensagem text not null default '', usuario_chave text not null, criada_em timestamptz not null default now()
);

create index if not exists entradas_data_ref_idx on public.entradas(data_mariscagem);
create index if not exists entradas_chave_idx on public.entradas(chave_marisqueira);
create index if not exists producao_data_ref_idx on public.producao(data_referencia);
create index if not exists producao_chave_idx on public.producao(chave_acesso_operador);
create index if not exists prod_salgados_chave_idx on public.prod_salgados(chave_acesso_operador);
create index if not exists saidas_data_venda_idx on public.saidas(data_venda);
create index if not exists saidas_chave_idx on public.saidas(chave_acesso_operador);

do $$ declare t text; begin
  foreach t in array array['usuarios','produtos','salgados','compradores','estoque_manual','entradas','producao','prod_salgados','saidas','estoque_associacao','metas','noticias','configuracoes','operacoes_offline'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('midia','midia',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create or replace function public.apply_stock_delta(
  p_chave text, p_nome text, p_tipo text, p_produto text, p_delta numeric, p_operador text, p_absoluto boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare v_tipo text;
begin
  v_tipo := case when lower(regexp_replace(coalesce(p_tipo,''),'[^a-z]','','g')) like '%salgado%' then 'Salgado'
                 when lower(regexp_replace(coalesce(p_tipo,''),'[^a-z]','','g')) like '%natura%' then 'In Natura'
                 else 'Beneficiado' end;
  if nullif(trim(p_chave),'') is null or nullif(trim(p_produto),'') is null then return; end if;
  insert into public.estoque_manual as em(chave_acesso,nome_mari,tipo,produto,quantidade,operador)
  values(trim(p_chave),coalesce(nullif(trim(p_nome),''),'Sem nome'),v_tipo,trim(p_produto),greatest(0,coalesce(p_delta,0)),coalesce(p_operador,''))
  on conflict(chave_acesso,tipo,produto) do update set
    quantidade = greatest(0, case when p_absoluto then coalesce(p_delta,0) else em.quantidade + coalesce(p_delta,0) end),
    nome_mari = coalesce(nullif(trim(p_nome),''),em.nome_mari),
    data_atualizacao = now(), operador = coalesce(p_operador,'');
end $$;

create or replace function public.require_stock(p_chave text, p_tipo text, p_produto text, p_quantidade numeric) returns void
language plpgsql security definer set search_path=public as $$
declare v_tipo text; v_atual numeric;
begin
  v_tipo := case when lower(regexp_replace(coalesce(p_tipo,''),'[^a-z]','','g')) like '%salgado%' then 'Salgado'
                 when lower(regexp_replace(coalesce(p_tipo,''),'[^a-z]','','g')) like '%natura%' then 'In Natura'
                 else 'Beneficiado' end;
  select quantidade into v_atual from public.estoque_manual
  where chave_acesso=p_chave and tipo=v_tipo and produto=p_produto for update;
  if coalesce(v_atual,0) + 0.001 < p_quantidade then
    raise exception using errcode='23514', message=format('Estoque insuficiente de %s. Atualize os dados e confira antes de tentar novamente.',p_produto);
  end if;
end $$;

create or replace function public.processar_operacao_offline(
  p_id text, p_tipo text, p_payload jsonb, p_usuario_chave text, p_usuario_nome text, p_usuario_tipo text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb; v_key text; v_prod text; v_qtd numeric; v_unit numeric; v_msg text;
  v_existing public.operacoes_offline%rowtype;
begin
  insert into public.operacoes_offline(id,tipo,payload,usuario_chave,estado,mensagem)
  values(p_id,p_tipo,p_payload,p_usuario_chave,'processando','') on conflict(id) do nothing;
  if not found then
    select * into v_existing from public.operacoes_offline where id=p_id;
    return jsonb_build_object('id',p_id,'status',case when v_existing.estado='ok' then 'duplicado' else v_existing.estado end,'msg',coalesce(v_existing.mensagem,'Operação já recebida.'));
  end if;

  if p_tipo='salvarMultiplasEntradas' then
    if jsonb_typeof(p_payload)<>'array' or jsonb_array_length(p_payload)=0 then raise exception using errcode='22023',message='Carrinho vazio.'; end if;
    for v_item in select value from jsonb_array_elements(p_payload) loop
      v_key := case when p_usuario_tipo='Administrativo' then coalesce(v_item->>'marisqueiraChave',v_item->>'marisqueiraCpf','') else p_usuario_chave end;
      v_prod := trim(coalesce(v_item->>'nomeProduto','')); v_qtd := greatest(0,coalesce(nullif(v_item->>'quantidade','')::numeric,0));
      if v_key='' or v_prod='' or v_qtd<=0 then raise exception using errcode='22023',message='Item de coleta incompleto.'; end if;
      insert into public.entradas(operacao_id,data_mariscagem,lote,chave_marisqueira,nome_marisqueira,produto,quantidade,unidade,operador)
      values(p_id,coalesce(nullif(v_item->>'dataRetro','')::date,current_date),coalesce(v_item->>'lotePersonalizado',''),v_key,coalesce(v_item->>'marisqueiraNome',''),v_prod,v_qtd,coalesce(v_item->>'unidade','KG'),p_usuario_nome);
      perform public.apply_stock_delta(v_key,coalesce(v_item->>'marisqueiraNome',p_usuario_nome),'In Natura',v_prod,v_qtd,p_usuario_nome,false);
    end loop;
    v_msg := format('Sucesso! %s registro(s) salvo(s) e estoque atualizado.',jsonb_array_length(p_payload));
  elsif p_tipo='salvarProducaoRendimento' then
    v_key := case when p_usuario_tipo='Administrativo' then coalesce(p_payload->>'cpfOperador',p_payload->>'chaveAcessoOperador','') else p_usuario_chave end;
    v_qtd := greatest(0,coalesce(nullif(p_payload->>'pesoInNatura','')::numeric,0)); v_unit := greatest(0,coalesce(nullif(p_payload->>'pesoBeneficiado','')::numeric,0));
    if coalesce(p_payload->>'mariscoOrigem','')='' or coalesce(p_payload->>'produtoFinal','')='' or v_key='' or v_qtd<=0 or v_unit<=0 then raise exception using errcode='22023',message='Preencha os campos da produção.'; end if;
    perform public.require_stock(v_key,'In Natura',p_payload->>'mariscoOrigem',v_qtd);
    insert into public.producao(operacao_id,marisco_origem,peso_in_natura_usado,peso_beneficiado_obtido,perdas,produto_final,qtd_gerada,lote,operador,data_referencia,chave_acesso_operador)
    values(p_id,p_payload->>'mariscoOrigem',v_qtd,v_unit,greatest(0,v_qtd-v_unit),p_payload->>'produtoFinal',v_unit,coalesce(p_payload->>'lote',''),p_usuario_nome,coalesce(nullif(p_payload->>'dataRetro','')::date,current_date),v_key);
    perform public.apply_stock_delta(v_key,p_usuario_nome,'In Natura',p_payload->>'mariscoOrigem',-v_qtd,p_usuario_nome,false);
    perform public.apply_stock_delta(v_key,p_usuario_nome,'Beneficiado',p_payload->>'produtoFinal',v_unit,p_usuario_nome,false);
    v_msg := format('Produção gravada! −%s KG in natura, +%s KG de %s no estoque.',to_char(v_qtd,'FM999999990.00'),to_char(v_unit,'FM999999990.00'),p_payload->>'produtoFinal');
  elsif p_tipo='salvarProducaoSalgado' then
    v_key := case when p_usuario_tipo='Administrativo' then coalesce(p_payload->>'cpfOperador',p_payload->>'chaveAcessoOperador','') else p_usuario_chave end;
    v_qtd := greatest(0,coalesce(nullif(p_payload->>'quantidade','')::numeric,0));
    if coalesce(p_payload->>'salgado','')='' or v_key='' or v_qtd<=0 then raise exception using errcode='22023',message='Informe produto e quantidade.'; end if;
    insert into public.prod_salgados(operacao_id,salgado,quantidade,lote,operador,data_referencia,chave_acesso_operador,observacao)
    values(p_id,p_payload->>'salgado',v_qtd,coalesce(p_payload->>'lote',''),p_usuario_nome,coalesce(nullif(p_payload->>'dataRetro','')::date,current_date),v_key,coalesce(p_payload->>'observacao',''));
    perform public.apply_stock_delta(v_key,p_usuario_nome,'Salgado',p_payload->>'salgado',v_qtd,p_usuario_nome,false);
    v_msg := format('Produção registrada! +%s %s de %s no estoque.',to_char(v_qtd,'FM999999990.##'),coalesce(p_payload->>'unidade','UN'),p_payload->>'salgado');
  elsif p_tipo='salvarSaida' then
    v_key := case when p_usuario_tipo='Administrativo' then coalesce(p_payload->>'vendedor',p_payload->>'chaveAcessoOperador','') else p_usuario_chave end;
    if lower(v_key)='associacao' then v_key := 'ASSOCIACAO'; end if;
    v_qtd := greatest(0,coalesce(nullif(p_payload->>'qtdVenda','')::numeric,0)); v_unit := greatest(0,coalesce(nullif(p_payload->>'valorUnidade','')::numeric,0));
    if coalesce(p_payload->>'nomeProduto','')='' or coalesce(p_payload->>'tipoSaida','')='' or v_qtd<=0 then raise exception using errcode='22023',message='Preencha os dados da venda.'; end if;
    if v_key='ASSOCIACAO' then
      perform pg_advisory_xact_lock(hashtextextended('associacao:'||(p_payload->>'nomeProduto'),0));
      if (select coalesce(sum(quantidade),0) from public.estoque_associacao where produto=p_payload->>'nomeProduto') + 0.001 < v_qtd then
        raise exception using errcode='23514',message=format('Estoque insuficiente de %s na Associação.',p_payload->>'nomeProduto');
      end if;
    else
      perform public.require_stock(v_key,case when p_payload->>'tipoItem'='salgado' then 'Salgado' else 'Beneficiado' end,p_payload->>'nomeProduto',v_qtd);
    end if;
    insert into public.saidas(operacao_id,produto,quantidade,valor_unitario,total_venda,destino,lote,operador,data_venda,unidade,chave_acesso_operador,tipo_item)
    values(p_id,p_payload->>'nomeProduto',v_qtd,v_unit,v_qtd*v_unit,p_payload->>'tipoSaida',coalesce(p_payload->>'lote',''),p_usuario_nome,coalesce(nullif(p_payload->>'dataRetro','')::date,current_date),coalesce(p_payload->>'unidade','KG'),v_key,coalesce(p_payload->>'tipoItem','pescado'));
    if v_key='ASSOCIACAO' then
      insert into public.estoque_associacao(produto,quantidade,operador,chave_acesso_operador) values(p_payload->>'nomeProduto',-v_qtd,'Venda: '||p_usuario_nome,'ASSOCIACAO');
    else
      perform public.apply_stock_delta(v_key,p_usuario_nome,case when p_payload->>'tipoItem'='salgado' then 'Salgado' else 'Beneficiado' end,p_payload->>'nomeProduto',-v_qtd,p_usuario_nome,false);
    end if;
    if p_payload->>'tipoSaida'='Associação AMQMI' and v_key<>'ASSOCIACAO' then
      insert into public.estoque_associacao(produto,quantidade,lote,operador,chave_acesso_operador) values(p_payload->>'nomeProduto',v_qtd,coalesce(p_payload->>'lote',''),p_usuario_nome,v_key);
    end if;
    v_msg := 'Venda confirmada!';
  else
    raise exception using errcode='22023',message='Tipo de registro offline não reconhecido.';
  end if;
  update public.operacoes_offline set estado='ok',mensagem=v_msg where id=p_id;
  return jsonb_build_object('id',p_id,'status','ok','msg',v_msg);
exception when others then
  get stacked diagnostics v_msg = message_text;
  -- The exception block rolls back any partial stock/history writes before this log.
  insert into public.operacoes_offline(id,tipo,payload,usuario_chave,estado,mensagem)
  values(p_id,p_tipo,p_payload,p_usuario_chave,case when sqlstate like '22%' or sqlstate like '23%' then 'rejeitado' else 'retry' end,v_msg)
  on conflict(id) do update set estado=excluded.estado,mensagem=excluded.mensagem;
  return jsonb_build_object('id',p_id,'status',case when sqlstate like '22%' or sqlstate like '23%' then 'rejeitado' else 'retry' end,'msg',v_msg);
end $$;

create or replace function public.invalidar_registro(p_tabela text, p_id uuid, p_admin text, p_motivo text default '') returns text
language plpgsql security definer set search_path=public as $$
declare
  v_table text;
  v_row jsonb;
  v_product text;
  v_owner text;
  v_quantity numeric;
  v_item_type text;
  v_destination text;
begin
  v_table := case p_tabela when 'Entradas' then 'entradas' when 'Producao' then 'producao'
    when 'ProdSalgados' then 'prod_salgados' when 'Saidas' then 'saidas' else null end;
  if v_table is null then raise exception using errcode='22023',message='Registro inválido para invalidação.'; end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',v_table) into v_row using p_id;
  if v_row is null then raise exception using errcode='P0002',message='Registro não encontrado.'; end if;
  if coalesce((v_row->>'invalidado')::boolean,false) then return 'Esse registro já estava invalidado.'; end if;

  if v_table='entradas' then
    perform public.apply_stock_delta(v_row->>'chave_marisqueira',v_row->>'nome_marisqueira','In Natura',v_row->>'produto',-coalesce((v_row->>'quantidade')::numeric,0),p_admin,false);
  elsif v_table='producao' then
    perform public.apply_stock_delta(v_row->>'chave_acesso_operador',v_row->>'operador','In Natura',v_row->>'marisco_origem',coalesce((v_row->>'peso_in_natura_usado')::numeric,0),p_admin,false);
    perform public.apply_stock_delta(v_row->>'chave_acesso_operador',v_row->>'operador','Beneficiado',v_row->>'produto_final',-coalesce((v_row->>'qtd_gerada')::numeric,0),p_admin,false);
  elsif v_table='prod_salgados' then
    perform public.apply_stock_delta(v_row->>'chave_acesso_operador',v_row->>'operador','Salgado',v_row->>'salgado',-coalesce((v_row->>'quantidade')::numeric,0),p_admin,false);
  elsif v_table='saidas' then
    v_owner := v_row->>'chave_acesso_operador';
    v_product := v_row->>'produto';
    v_quantity := coalesce((v_row->>'quantidade')::numeric,0);
    v_item_type := case when v_row->>'tipo_item'='salgado' then 'Salgado' else 'Beneficiado' end;
    v_destination := v_row->>'destino';
    if v_owner='ASSOCIACAO' then
      insert into public.estoque_associacao(produto,quantidade,operador,chave_acesso_operador)
      values(v_product,v_quantity,'Estorno: '||p_admin,'ASSOCIACAO');
    else
      perform public.apply_stock_delta(v_owner,'',v_item_type,v_product,v_quantity,p_admin,false);
      if v_destination='Associação AMQMI' then
        insert into public.estoque_associacao(produto,quantidade,operador,chave_acesso_operador)
        values(v_product,-v_quantity,'Estorno: '||p_admin,v_owner);
      end if;
    end if;
  end if;
  execute format('update public.%I set invalidado=true,invalidado_por=$2,motivo_invalidacao=$3,data_invalidacao=now() where id=$1',v_table)
    using p_id,p_admin,coalesce(p_motivo,'');
  return 'Registro invalidado e mantido no relatório para auditoria.';
end $$;

revoke all on function public.apply_stock_delta(text,text,text,text,numeric,text,boolean) from public,anon,authenticated;
revoke all on function public.require_stock(text,text,text,numeric) from public,anon,authenticated;
revoke all on function public.processar_operacao_offline(text,text,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.invalidar_registro(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_stock_delta(text,text,text,text,numeric,text,boolean) to service_role;
grant execute on function public.require_stock(text,text,text,numeric) to service_role;
grant execute on function public.processar_operacao_offline(text,text,jsonb,text,text,text) to service_role;
grant execute on function public.invalidar_registro(text,uuid,text,text) to service_role;
