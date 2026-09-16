# PsicoConnect - Guia rápido GitHub + Render

## Estrutura

- `frontend/`: páginas HTML, CSS e JS.
- `backend/`: API Node.js/Express para publicar no Render.
- `database/`: scripts SQL do PostgreSQL (`schema.sql` e `seed.sql`).
- `docs/`: documentação extra.

## Render Web Service

Na tela de criação do Web Service, use:

- **Language:** Node
- **Branch:** main
- **Region:** Oregon, a mesma do banco
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

## Variáveis de ambiente no Render

Adicione no Web Service:

```env
DATABASE_URL=cole_aqui_a_Internal_Database_URL_do_Render
NODE_ENV=production
PAYMENT_PROVIDER=mock
GOOGLE_MEET_PROVIDER=mock
APP_URL=https://sua-url-do-frontend
```

## Testes depois do deploy

Troque `SUA_URL_RENDER` pela URL do Web Service:

- `https://SUA_URL_RENDER.onrender.com/api/health`
- `https://SUA_URL_RENDER.onrender.com/api/db/health`
- `https://SUA_URL_RENDER.onrender.com/api/psicologos`
- `https://SUA_URL_RENDER.onrender.com/api/planos`
- `https://SUA_URL_RENDER.onrender.com/api/agendamentos`

## Banco de dados

Execute primeiro:

```bash
psql "SUA_EXTERNAL_DATABASE_URL" -f database/schema.sql
```

Depois:

```bash
psql "SUA_EXTERNAL_DATABASE_URL" -f database/seed.sql
```

Também pode colar o conteúdo dos arquivos no DBeaver ou pgAdmin.
