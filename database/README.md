# Banco PostgreSQL - PsicoConnect

Arquivos principais:

- `schema.sql`: cria as tabelas do banco.
- `seed.sql`: insere dados iniciais para teste.

## Como usar no Render

1. Crie um banco PostgreSQL no Render.
2. Copie a `External Database URL` para rodar os SQLs localmente.
3. Execute:

```bash
psql "SUA_EXTERNAL_DATABASE_URL" -f database/schema.sql
psql "SUA_EXTERNAL_DATABASE_URL" -f database/seed.sql
```

Na API hospedada no Render, use a `Internal Database URL` na variável `DATABASE_URL`.
