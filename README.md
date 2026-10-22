# Caderneta de Gestão — AMQMI

Versão reestruturada do aplicativo enviado, mantendo a interface, telas e fluxos da Caderneta. O código fica no GitHub; o site pode ser publicado no Cloudflare Pages com domínio próprio; o banco central usa PostgreSQL no Supabase.

## O que está incluído

- Interface original preservada em `public/index.html`.
- Aplicativo instalável (PWA), com cache da interface para abrir sem internet.
- Fila offline atual preservada e espelhada em IndexedDB para recuperação local.
- API Supabase para login por chave, cadastros, coleta, beneficiamento, processados, vendas, estoques, metas, avisos, relatórios, auditoria e upload de imagens.
- Estrutura do banco em `supabase/schema.sql`.

Os quatro registros operacionais que já funcionavam offline continuam sendo guardados no aparelho: coleta, beneficiamento, produção de processados e venda. Ao voltar à tela com conexão, o app tenta enviá-los. A sincronização em segundo plano quando o navegador está fechado não é garantida por todos os celulares; a fila continua visível no próprio app.

Vendas e beneficiamento conferem o saldo novamente no servidor ao sincronizar. Se mais de um aparelho usar o mesmo saldo offline e as operações ultrapassarem o estoque real, a operação que não couber será recusada para conferência, em vez de deixar o saldo negativo.

## Publicação

1. Crie um projeto Supabase e execute `supabase/schema.sql` no SQL Editor.
2. A chave de acesso identifica a conta; agora cada pessoa também precisa de uma senha individual com pelo menos 8 caracteres. Para cadastrar o administrador inicial pelo SQL Editor, substitua os valores entre aspas e escolha uma senha forte:

   ```sql
   set search_path = public, extensions;
   insert into public.usuarios (chave_acesso, nome, tipo, pin_hash)
   values ('CHAVE_DO_ADMIN', 'Nome do administrador', 'Administrativo',
           crypt('SENHA_FORTE_DO_ADMIN', gen_salt('bf', 10)));
   ```

   Não use os exemplos como credenciais reais. O hash é armazenado no banco; após cinco tentativas inválidas para a mesma chave, novas tentativas ficam bloqueadas por 15 minutos. Para contas que já existiam antes desta atualização, defina uma senha para cada uma pelo SQL Editor antes de publicar a nova API:

   ```sql
   set search_path = public, extensions;
   update public.usuarios
   set pin_hash = crypt('NOVA_SENHA_FORTE', gen_salt('bf', 10))
   where chave_acesso = 'CHAVE_DA_CONTA';
   ```

   Repita com uma senha diferente para cada conta. A senha antiga não pode ser recuperada porque não era armazenada.
   A nova versão exige novo login e invalida sessões emitidas pela versão anterior.
3. Edite `public/app-config.js` e informe o URL do projeto e a chave pública `anon`/`publishable` do Supabase. Essa chave pública pode ficar no código; **não coloque a `service_role` no arquivo público**.
4. Instale a CLI do Supabase, vincule este diretório ao projeto e cadastre um segredo longo para assinar sessões:

   ```powershell
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase secrets set APP_AUTH_SECRET="uma-frase-secreta-longa-e-aleatoria"
   supabase functions deploy api
   ```

   O Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` à função no servidor. A função usa `service_role` internamente; ela não é enviada ao navegador.
5. Conecte o repositório GitHub ao Cloudflare Pages. Use `public` como diretório de saída; não é necessário comando de build. Configure o domínio no projeto Pages.
6. Abra o domínio com internet uma vez em cada aparelho e faça login para baixar os cadastros e o estoque que serão usados offline. Depois, o navegador pode oferecer **Adicionar à tela inicial**.

## Dados que já estão no Google Sheets

O novo banco começa vazio. Antes de parar a versão antiga, exporte uma cópia de segurança das abas e importe os cadastros e saldos iniciais nas tabelas correspondentes. A conversão de cabeçalhos é:

| Aba antiga | Tabela nova | Campos principais |
|---|---|---|
| Usuarios | `usuarios` | Chave de Acesso → `chave_acesso`; Nome → `nome`; Tipo → `tipo`; Foto → `foto` |
| Produtos | `produtos` | Nome → `nome`; Tipo → `tipo`; Unidade → `unidade`; Valor → `valor`; Foto → `foto` |
| Salgados | `salgados` | Nome → `nome`; Descricao → `descricao`; Unidade → `unidade`; Valor → `valor`; Foto → `foto` |
| Compradores | `compradores` | Nome → `nome`; Documento → `documento`; Telefone → `telefone`; Endereço → `endereco` |
| EstoqueManual | `estoque_manual` | Chave de Acesso Marisqueira → `chave_acesso`; Tipo → `tipo`; Produto → `produto`; Quantidade → `quantidade` |
| Entradas | `entradas` | Data Registro → `data_registro`; Data Mariscagem → `data_mariscagem`; Lote → `lote`; Chave de Acesso Marisqueira → `chave_marisqueira`; Nome Marisqueira → `nome_marisqueira`; Produto → `produto`; Quantidade → `quantidade`; Unidade → `unidade`; Operador → `operador` |
| Producao | `producao` | Marisco Origem → `marisco_origem`; Peso In Natura Usado → `peso_in_natura_usado`; Peso Beneficiado Obtido → `peso_beneficiado_obtido`; Perdas → `perdas`; Produto Final → `produto_final`; Qtd Gerada → `qtd_gerada`; Lote → `lote`; Operador → `operador`; Data Registro → `data_registro`; Data Referência → `data_referencia`; Chave de Acesso Operador → `chave_acesso_operador` |
| ProdSalgados | `prod_salgados` | Salgado → `salgado`; Quantidade → `quantidade`; Lote → `lote`; Operador → `operador`; Data Registro → `data_registro`; Data Referência → `data_referencia`; Chave de Acesso Operador → `chave_acesso_operador`; Observacao → `observacao` |
| Saidas | `saidas` | Produto → `produto`; Quantidade → `quantidade`; Valor Unitário → `valor_unitario`; Total Venda → `total_venda`; Destino → `destino`; Lote → `lote`; Operador → `operador`; Data Registro → `data_registro`; Data Venda → `data_venda`; Unidade → `unidade`; Chave de Acesso Operador → `chave_acesso_operador`; TipoItem → `tipo_item` |
| EstoqueAssociacao | `estoque_associacao` | Produto → `produto`; Quantidade → `quantidade` (mantenha valores negativos); Lote → `lote`; Operador → `operador`; Data Recebimento → `data_recebimento`; Chave de Acesso Operador → `chave_acesso_operador` |
| Metas | `metas` | ID → `id`; Nome → `nome`; Objetivo → `objetivo`; Realizado → `realizado`; Unidade → `unidade` |
| Noticias | `noticias` | ID → `id`; Titulo → `titulo`; Mensagem → `mensagem`; Data → `data`; Validade → `validade` |

No importador CSV do Supabase, use somente as colunas da tabela de destino indicadas acima; as colunas `id` e `operacao_id` têm valores automáticos para registros históricos. Converta os valores de `EstoqueManual.Tipo` para `In Natura`, `Beneficiado` ou `Salgado` antes de importar (o valor antigo `Pescado` vira `Beneficiado`). Preserve as abas históricas para manter relatórios e auditoria anteriores. Não publique os CSVs no GitHub.

## Cuidados antes de usar dados reais

- O login exige chave de acesso e senha individual. O acesso offline usa um verificador derivado localmente; não grava a senha em texto aberto.
- Cadastre pelo menos uma conta administrativa e confira os perfis antes do piloto.
- O plano gratuito do Supabase não oferece backup baixável e pode pausar projetos com pouca atividade. Para operação real, configure cópias de segurança e avalie o plano pago.
- Cada celular guarda dados locais. Proteja os aparelhos com bloqueio de tela e não compartilhe o mesmo perfil do navegador entre usuários.

## Organização dos arquivos

- `public/`: interface, configuração pública, PWA e integração com a API.
- `supabase/schema.sql`: banco, índices, bloqueio de acesso direto e bucket de imagens.
- `supabase/functions/api/index.ts`: API executada no servidor.
- `legacy-backend-reference.gs`: cópia de referência da lógica Apps Script recebida; não é publicada pelo site.
