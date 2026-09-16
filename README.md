# PsicoConnect - Sistema de Agendamento Psicológico

Projeto web estático para apresentação/protótipo funcional usando HTML, CSS e JavaScript com LocalStorage.

## Implementações adicionadas

- Cadastro de paciente.
- Cadastro de psicólogo com CRP, CIP, upload simulado de documento e endereço da clínica.
- Mensalidade simulada para psicólogo.
- Aprovação/reprovação de psicólogos pelo admin.
- Busca de psicólogos aprovados por nome, especialidade, cidade e modalidade.
- Perfil profissional com Google Maps incorporado e link para rota.
- Agendamento com remoção automática do horário usado.
- Dashboard do paciente e do psicólogo.
- Chat por consulta.
- Triagem inteligente simulada, sugerindo especialidade com base no relato.
- Ajuda emergencial com CVV 188, mapa de pronto atendimento e mensagem gerada.
- Prontuário psicológico com rascunho gerado por IA simulada e status de prontuário entregue/finalizado.

## Como testar

Abra o arquivo `index.html` no navegador.

Credenciais de demonstração:

- Paciente: `paciente@demo.com` / `123456`
- Psicólogo: `ana@demo.com` / `123456`
- Admin: `admin@demo.com` / `123456`

## Observação

Esta versão usa LocalStorage para simular banco de dados. Para a versão final em Expo + TypeScript + Firebase, as entidades podem ser migradas para coleções do Firestore: `pacientes`, `psicologos`, `consultas`, `pagamentos`, `prontuarios`, `mensagens` e `triagens`.

## Atualização: pagamentos e Google Meet

Foram adicionadas integrações de teste para:

- Pagamento de planos do psicólogo em `planos.html`.
- Geração de link de consulta online/Google Meet em `agendamento.html`.
- Botão **Entrar no Meet** nos painéis do paciente e psicólogo.
- Backend opcional em `api/` com endpoints para Stripe, Mercado Pago e Google Calendar/Meet.

Leia `INTEGRACOES.md` para configurar e testar.


## Banco de dados PostgreSQL

Este projeto já possui a pasta `database/` com os arquivos:

- `schema.sql`: criação das tabelas.
- `seed.sql`: dados iniciais para teste.

Para testar localmente ou no Render, configure a variável `DATABASE_URL` dentro da pasta `api`.

Endpoints úteis depois de iniciar a API:

- `GET /api/health`
- `GET /api/db/health`
- `GET /api/psicologos`
- `POST /api/psicologos`
- `GET /api/planos`
- `GET /api/agendamentos`

No Render, crie primeiro o PostgreSQL, rode `database/schema.sql` e `database/seed.sql`, depois coloque a `Internal Database URL` como variável `DATABASE_URL` no Web Service da API.
