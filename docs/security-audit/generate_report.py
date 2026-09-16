import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Paleta oficial requerida
COLOR_CRITICA = '#B91C1C'
COLOR_ALTA = '#EA580C'
COLOR_MEDIA = '#D97706'
COLOR_BAIXA = '#2563EB'
COLOR_PONTO_FORTE = '#059669'
COLOR_NEUTRO_DARK = '#1E293B'
COLOR_BG_LIGHT = '#F8FAFC'
COLOR_BORDER = '#E2E8F0'

class NumberedCanvas(canvas.Canvas):
    """Canvas com cabeçalho e rodapé em todas as páginas exceto capa"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Capa sem cabeçalho/rodapé

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#64748B'))

        # Cabeçalho
        self.drawString(2 * cm, 28.2 * cm, "Relatório de Auditoria de Segurança — PsicoConnect API & Web")
        self.setStrokeColor(colors.HexColor('#CBD5E1'))
        self.setLineWidth(0.5)
        self.line(2 * cm, 28.0 * cm, 19 * cm, 28.0 * cm)

        # Rodapé
        self.line(2 * cm, 1.8 * cm, 19 * cm, 1.8 * cm)
        self.drawString(2 * cm, 1.3 * cm, "CONFIDENCIAL — Auditoria Técnica de Código-Fonte")
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(19 * cm, 1.3 * cm, page_str)
        self.restoreState()

def generate_charts(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Gráfico de Rosca (Severidade)
    labels = ['Crítica', 'Alta', 'Média', 'Baixa']
    counts = [2, 4, 3, 1]
    chart_colors = [COLOR_CRITICA, COLOR_ALTA, COLOR_MEDIA, COLOR_BAIXA]
    
    fig, ax = plt.subplots(figsize=(4.2, 3.0), dpi=200)
    wedges, texts, autotexts = ax.pie(
        counts,
        labels=labels,
        autopct='%1.0f%%',
        startangle=140,
        colors=chart_colors,
        pctdistance=0.75,
        textprops=dict(color="#1E293B", fontsize=9, weight="bold"),
        wedgeprops=dict(width=0.45, edgecolor='white', linewidth=2)
    )
    for at in autotexts:
        at.set_color('white')
        at.set_fontsize(9)
        at.set_weight('bold')
    
    ax.set_title("Achados por Severidade", fontsize=11, fontweight='bold', pad=10, color="#0F172A")
    donut_path = os.path.join(output_dir, "chart_severity.png")
    plt.tight_layout()
    plt.savefig(donut_path, transparent=True)
    plt.close()

    # 2. Gráfico de Barras (Categorias)
    categories = [
        '1. Banco sem Tranca',
        '2. Permissão Navegador',
        '3. IDOR',
        '4. Chaves Expostas',
        '5. XSS / Sem Tratamento'
    ]
    cat_counts = [2, 2, 2, 2, 2]  # Total 10 achados
    cat_colors = [COLOR_CRITICA, COLOR_ALTA, COLOR_CRITICA, COLOR_MEDIA, COLOR_ALTA]
    
    fig, ax = plt.subplots(figsize=(5.0, 3.0), dpi=200)
    bars = ax.barh(categories[::-1], cat_counts[::-1], color=cat_colors[::-1], height=0.55, edgecolor='none')
    ax.set_xlim(0, 3)
    ax.set_xlabel("Quantidade de Vulnerabilidades", fontsize=9, color="#475569")
    ax.set_title("Vulnerabilidades por Categoria Auditada", fontsize=11, fontweight='bold', pad=10, color="#0F172A")
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#CBD5E1')
    ax.spines['bottom'].set_color('#CBD5E1')
    ax.tick_params(colors='#334155', labelsize=8)
    
    for bar in bars:
        w = bar.get_width()
        ax.text(w + 0.08, bar.get_y() + bar.get_height()/2, f'{int(w)}', ha='left', va='center', fontsize=9, fontweight='bold', color="#1E293B")
        
    bar_path = os.path.join(output_dir, "chart_categories.png")
    plt.tight_layout()
    plt.savefig(bar_path, transparent=True)
    plt.close()

    return donut_path, bar_path

def build_pdf(filename="relatorio-auditoria-seguranca.pdf"):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_pdf = os.path.join(script_dir, filename)
    donut_path, bar_path = generate_charts(script_dir)

    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.2 * cm
    )

    styles = getSampleStyleSheet()

    # Custom styles
    style_cover_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#0F172A'),
        alignment=0,
        spaceAfter=10
    )
    style_cover_subtitle = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#475569'),
        alignment=0,
        spaceAfter=25
    )
    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )
    style_body = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6
    )
    style_body_bold = ParagraphStyle(
        'Body_Custom_Bold',
        parent=style_body,
        fontName='Helvetica-Bold'
    )
    style_code = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#0F172A'),
        backColor=colors.HexColor('#F1F5F9'),
        borderPadding=4,
        spaceAfter=6
    )
    style_table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#1E293B')
    )
    style_table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    story = []

    # ==========================================
    # CAPA
    # ==========================================
    story.append(Spacer(1, 2.5 * cm))
    
    # Tag de Identificação
    badge_data = [[Paragraph("<font color='#B91C1C'><b>RELATÓRIO TÉCNICO DE AUDITORIA DE CÓDIGO-FONTE</b></font>", style_table_cell)]]
    t_badge = Table(badge_data, colWidths=[12 * cm])
    t_badge.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FEE2E2')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#FCA5A5')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_badge)
    story.append(Spacer(1, 15))

    story.append(Paragraph("Relatório de Auditoria de Segurança — PsicoConnect", style_cover_title))
    story.append(Paragraph("Avaliação Técnica Sistemática de Vulnerabilidades em 5 Categorias Críticas", style_cover_subtitle))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0F172A'), spaceBefore=0, spaceAfter=20))

    meta_info = [
        [Paragraph("<b>Data da Auditoria:</b>", style_body_bold), Paragraph("15 de Setembro de 2026", style_body)],
        [Paragraph("<b>Projeto Avaliado:</b>", style_body_bold), Paragraph("PsicoConnect (Versão 2.0.0 - Monorepo)", style_body)],
        [Paragraph("<b>Escopo Auditado:</b>", style_body_bold), Paragraph("backend/ (src/server.js, routes/, middleware/, config/), database/ (schema.sql, seed.sql), frontend/ (HTMLs, js/script.js), .github/workflows/ci.yml", style_body)],
        [Paragraph("<b>Metodologia:</b>", style_body_bold), Paragraph("Análise Estática de Código (SAST) orientada a OWASP Top 10 e modelagem de ameaças multitenancy", style_body)],
        [Paragraph("<b>Classificação:</b>", style_body_bold), Paragraph("<font color='#B91C1C'><b>CONFIDENCIAL — RESTRIÇÃO DE ACESSO</b></font>", style_body)],
    ]
    t_meta = Table(meta_info, colWidths=[4 * cm, 13 * cm])
    t_meta.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_meta)

    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>Nota Metodológica & Stack Detectada:</b>", style_h2))
    methodology_text = (
        "O ecossistema do <b>PsicoConnect</b> foi inspecionado em sua totalidade. Foi detectada a seguinte stack técnica:<br/>"
        "• <b>Linguagem & Runtime:</b> JavaScript / Node.js (ES Modules, v22+)<br/>"
        "• <b>Backend Framework:</b> Express 4.21.2 com middlewares de rate limiting e helmet<br/>"
        "• <b>Banco de Dados & Acesso:</b> PostgreSQL nativo via driver <code>pg</code> (Pool connection), sem ORM; queries executadas com raw SQL parametrizado<br/>"
        "• <b>Autenticação & Sessão:</b> JWT (JSON Web Tokens via <code>jsonwebtoken</code>) + bcryptjs para hashing de senha<br/>"
        "• <b>Frontend:</b> Arquitetura híbrida (Vanilla HTML5 + JS DOM manipulation + CSS3) com persistência client-side simulada em <code>localStorage</code> e chamadas parciais REST para a API<br/>"
        "• <b>Deploy & CI/CD:</b> GitHub Actions (<code>.github/workflows/ci.yml</code>) com pipeline de testes PostgreSQL e build para Render.<br/><br/>"
        "<b>Mapeamento das 5 Categorias:</b><br/>"
        "1. <i>Banco sem Tranca:</i> PostgreSQL sem RLS configurada em <code>schema.sql</code>, demandando isolamento lógico por filtros <code>WHERE usuario_id = $x</code> no Express.<br/>"
        "2. <i>Permissão no Navegador:</i> Checagem de discrepâncias entre restrições visuais do frontend (tipo 'Administrador') vs. validação com <code>requireRole('admin')</code> nas rotas Express.<br/>"
        "3. <i>IDOR:</i> Inspeção de parâmetros de rota (<code>:id</code>, <code>:agendamentoId</code>) sem cruzamento de propriedade com <code>req.user.id</code>.<br/>"
        "4. <i>Chaves Expostas:</i> Inspeção de fallbacks permissivos em variáveis de ambiente, credenciais fixas de demonstração em código e scripts SQL.<br/>"
        "5. <i>Inputs sem Tratamento (XSS):</i> Auditoria de manipulação de DOM via <code>innerHTML</code> sem bibliotecas de sanitização (como DOMPurify) no frontend."
    )
    story.append(Paragraph(methodology_text, style_body))

    story.append(PageBreak())

    # ==========================================
    # RESUMO EXECUTIVO & GRÁFICOS
    # ==========================================
    story.append(Paragraph("Resumo Executivo", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))

    exec_summary_text = (
        "A auditoria de segurança identificou um total de <b>10 achados de segurança confirmados no código</b>, "
        "distribuídos em <b>2 Críticos</b>, <b>4 Altos</b>, <b>3 Médios</b> e <b>1 Baixo</b>. Adicionalmente, "
        "foram mapeados <b>4 pontos fortes defensivos</b> que demonstram boas práticas parciais de engenharia de software "
        "(como hashing de senhas com bcrypt, queries SQL parametrizadas prevenindo SQL Injection clássico, "
        "e rate limiting estruturado contra ataques de força bruta)."
    )
    story.append(Paragraph(exec_summary_text, style_body))
    story.append(Spacer(1, 8))

    # Tabela com métricas rápidas
    summary_metrics = [
        [
            Paragraph("<font color='#B91C1C'><b>2</b></font><br/><b>Críticas</b>", style_table_cell),
            Paragraph("<font color='#EA580C'><b>4</b></font><br/><b>Altas</b>", style_table_cell),
            Paragraph("<font color='#D97706'><b>3</b></font><br/><b>Médias</b>", style_table_cell),
            Paragraph("<font color='#2563EB'><b>1</b></font><br/><b>Baixas</b>", style_table_cell),
            Paragraph("<font color='#059669'><b>4</b></font><br/><b>Pontos Fortes</b>", style_table_cell),
        ]
    ]
    t_metrics = Table(summary_metrics, colWidths=[3.4 * cm] * 5)
    t_metrics.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#FEE2E2')),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor('#FFEDD5')),
        ('BACKGROUND', (2,0), (2,0), colors.HexColor('#FEF3C7')),
        ('BACKGROUND', (3,0), (3,0), colors.HexColor('#DBEAFE')),
        ('BACKGROUND', (4,0), (4,0), colors.HexColor('#D1FAE5')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0,0), (-1,-1), 1, colors.white),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_metrics)
    story.append(Spacer(1, 12))

    # Tabela com os dois gráficos lado a lado
    chart_table_data = [
        [Image(donut_path, width=7.5*cm, height=5.3*cm), Image(bar_path, width=9.2*cm, height=5.3*cm)]
    ]
    t_charts = Table(chart_table_data, colWidths=[8.0*cm, 9.0*cm])
    t_charts.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_charts)

    story.append(Spacer(1, 14))

    # ==========================================
    # PONTOS FORTES E PONTOS FRACOS
    # ==========================================
    story.append(Paragraph("Pontos Fortes e Riscos Centrais", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))

    pf_pw_data = [
        [
            Paragraph("<font color='#059669'><b>PONTOS FORTES IDENTIFICADOS (EVIDÊNCIAS)</b></font>", style_table_cell),
            Paragraph("<font color='#B91C1C'><b>RISCOS CENTRAIS DA ARQUITETURA</b></font>", style_table_cell)
        ],
        [
            Paragraph(
                "<b>1. Prevenção de SQL Injection:</b> No backend (<code>databaseRoutes.js</code> e <code>authRoutes.js</code>), todas as consultas SQL utilizam queries parametrizadas (<code>$1, $2...</code>) do driver <code>pg</code>, sem interpolação direta de strings em comandos SQL.<br/><br/>"
                "<b>2. Armazenamento de Senhas:</b> Hashing seguro implementado com <code>bcrypt.hash(senha, 10)</code> e conferência com <code>bcrypt.compare</code> em <code>authRoutes.js:46, 121</code>.<br/><br/>"
                "<b>3. Rate Limiting Estruturado:</b> Em <code>server.js:36-50</code>, aplicação de <code>express-rate-limit</code> global (100 reqs/15m) e limite restrito para autenticação (20 reqs/15m), mitigando brute-force.<br/><br/>"
                "<b>4. Proteção em Rotas Administrativas:</b> A rota de validação de psicólogos (<code>databaseRoutes.js:55</code>) valida adequadamente autenticação e privilégio via middleware <code>requireAuth, requireRole('admin')</code>.",
                style_table_cell
            ),
            Paragraph(
                "<b>1. Vazamento Horizontal de Dados Clínicos (IDOR):</b> Falta de validação de propriedade em rotas de mensagens e cancelamento de consultas permite que qualquer paciente ou psicólogo autenticado acesse conversas confidenciais de terceiros e cancele agendamentos alheios.<br/><br/>"
                "<b>2. Fragilidade no Segredo JWT:</b> A existência de fallback com segredo estático público em <code>authMiddleware.js:4</code> possibilita forjar tokens com perfil <code>admin</code> se a variável de ambiente for omitida em produção.<br/><br/>"
                "<b>3. Exposição a XSS no Frontend:</b> O uso generalizado de <code>innerHTML</code> sem sanitização em <code>script.js</code> permite sequestro de sessão e manipulação de prontuários clínicos locais.<br/><br/>"
                "<b>4. Rota Crítica de Agendamento do Meet Aberta:</b> <code>POST /api/meet/create-event</code> permite geração irrestrita de reuniões e envio de spam via Google Calendar API.",
                style_table_cell
            )
        ]
    ]
    t_pf_pw = Table(pf_pw_data, colWidths=[8.5 * cm, 8.5 * cm])
    t_pf_pw.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#D1FAE5')),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor('#FEE2E2')),
        ('BACKGROUND', (0,1), (0,1), colors.HexColor('#F8FAFC')),
        ('BACKGROUND', (1,1), (1,1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_pf_pw)

    story.append(PageBreak())

    # ==========================================
    # TABELA DE ACHADOS DETALHADOS
    # ==========================================
    story.append(Paragraph("Tabela de Achados Detalhados por Categoria", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))

    def make_chip(text, bg_color):
        return Paragraph(f"<font color='white'><b>{text}</b></font>", ParagraphStyle(
            'Chip',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=7.5,
            alignment=1
        ))

    findings_data = [
        [
            Paragraph("<b>Sev.</b>", style_table_header),
            Paragraph("<b>Cat.</b>", style_table_header),
            Paragraph("<b>Arquivo:Linha</b>", style_table_header),
            Paragraph("<b>Descrição do Problema & Impacto</b>", style_table_header)
        ],
        # 1. Banco sem tranca
        [
            make_chip("ALTA", COLOR_ALTA),
            Paragraph("1. Banco sem Tranca", style_table_cell),
            Paragraph("<code>backend/src/routes/<br/>databaseRoutes.js:207-221</code>", style_table_cell),
            Paragraph("<b>GET /api/mensagens/:agendamentoId sem filtro de participante:</b> A consulta SQL não valida se <code>req.user.id</code> é o paciente ou psicólogo vinculado ao agendamento. Qualquer usuário logado lê mensagens privadas de qualquer consulta.", style_table_cell)
        ],
        [
            make_chip("ALTA", COLOR_ALTA),
            Paragraph("1. Banco sem Tranca", style_table_cell),
            Paragraph("<code>backend/src/routes/<br/>databaseRoutes.js:224-241</code>", style_table_cell),
            Paragraph("<b>POST /api/mensagens sem validação de tenant/participação:</b> Insere mensagens no chat usando apenas <code>agendamento_id</code> vindo do body, permitindo injeção de mensagens fraudulentas em sessões alheias.", style_table_cell)
        ],
        # 2. Permissão no navegador
        [
            make_chip("MÉDIA", COLOR_MEDIA),
            Paragraph("2. Permissão Navegador", style_table_cell),
            Paragraph("<code>frontend/js/<br/>script.js:155, 209-215</code>", style_table_cell),
            Paragraph("<b>Bypass de tela de Admin no Frontend via credencial mock:</b> Validação de acesso ao painel de aprovação restrita a <code>session()?.tipo === 'Administrador'</code> e execução client-side de <code>aprovarPsicologo()</code> sobre <code>localStorage</code>.", style_table_cell)
        ],
        [
            make_chip("MÉDIA", COLOR_MEDIA),
            Paragraph("2. Permissão Navegador", style_table_cell),
            Paragraph("<code>backend/src/routes/<br/>databaseRoutes.js:78-108</code>", style_table_cell),
            Paragraph("<b>POST /api/psicologos público e sem autenticação:</b> Permite criação direta de registros de psicólogo sem senha e sem passar pelo fluxo de autenticação e validação de perfil formal.", style_table_cell)
        ],
        # 3. IDOR
        [
            make_chip("CRÍTICA", COLOR_CRITICA),
            Paragraph("3. IDOR", style_table_cell),
            Paragraph("<code>backend/src/routes/<br/>databaseRoutes.js:189-204</code>", style_table_cell),
            Paragraph("<b>PATCH /api/agendamentos/:id/cancelar sem verificação de posse:</b> Executa <code>UPDATE agendamentos SET status = 'cancelado' WHERE id = $1</code> diretamente. Qualquer usuário autenticado pode cancelar consultas de outros pacientes/psicólogos conhecendo apenas o UUID.", style_table_cell)
        ],
        [
            make_chip("ALTA", COLOR_ALTA),
            Paragraph("3. IDOR", style_table_cell),
            Paragraph("<code>backend/src/<br/>server.js:136-168</code>", style_table_cell),
            Paragraph("<b>POST /api/meet/create-event desprotegido:</b> Endpoint público sem <code>requireAuth</code> que aceita qualquer <code>consultaId</code> e e-mails de destino, gerando reuniões e convidando e-mails arbitrários via API real do Google Calendar.", style_table_cell)
        ],
        # 4. Chaves expostas
        [
            make_chip("CRÍTICA", COLOR_CRITICA),
            Paragraph("4. Chaves Expostas", style_table_cell),
            Paragraph("<code>backend/src/middleware/<br/>authMiddleware.js:4</code>", style_table_cell),
            Paragraph("<b>Segredo JWT com fallback padrão hardcoded:</b> Se <code>JWT_SECRET</code> não for configurada no ambiente (como no Render ou local), a aplicação usa <code>'psicoconnect_dev_secret_troque_em_producao'</code>, permitindo forja irrestrita de tokens de admin.", style_table_cell)
        ],
        [
            make_chip("BAIXA", COLOR_BAIXA),
            Paragraph("4. Chaves Expostas", style_table_cell),
            Paragraph("<code>database/<br/>seed.sql:11-15</code> e <code>script.js:152</code>", style_table_cell),
            Paragraph("<b>Credenciais Administrativas Padrão em Seed e Frontend:</b> Usuário <code>admin@psicoconnect.com</code> / <code>admin@demo.com</code> com senha <code>123456</code> inserido no banco de dados e exposto na interface de login de demonstração.", style_table_cell)
        ],
        # 5. Inputs sem tratamento (XSS)
        [
            make_chip("ALTA", COLOR_ALTA),
            Paragraph("5. Inputs (XSS)", style_table_cell),
            Paragraph("<code>frontend/js/<br/>script.js:247</code>", style_table_cell),
            Paragraph("<b>Cross-Site Scripting (XSS) Armazenado no Chat:</b> Mensagens digitadas pelo usuário são renderizadas via <code>innerHTML</code> sem sanitização ou escape HTML em <code>byId('chatMensagens').innerHTML</code>.", style_table_cell)
        ],
        [
            make_chip("MÉDIA", COLOR_MEDIA),
            Paragraph("5. Inputs (XSS)", style_table_cell),
            Paragraph("<code>frontend/js/<br/>script.js:238</code>", style_table_cell),
            Paragraph("<b>DOM-based XSS na Triagem de Sintomas:</b> O texto informado no campo de triagem (<code>relatoTriagem</code>) é utilizado para compor resposta HTML injetada via <code>innerHTML</code> em <code>byId('resultadoTriagem')</code> sem escape.", style_table_cell)
        ]
    ]

    t_findings = Table(findings_data, colWidths=[1.8 * cm, 2.8 * cm, 4.0 * cm, 8.4 * cm])
    t_findings.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0F172A')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0,1), (0,1), colors.HexColor('#FFEDD5')),
        ('BACKGROUND', (0,2), (0,2), colors.HexColor('#FFEDD5')),
        ('BACKGROUND', (0,3), (0,3), colors.HexColor('#FEF3C7')),
        ('BACKGROUND', (0,4), (0,4), colors.HexColor('#FEF3C7')),
        ('BACKGROUND', (0,5), (0,5), colors.HexColor('#FEE2E2')),
        ('BACKGROUND', (0,6), (0,6), colors.HexColor('#FFEDD5')),
        ('BACKGROUND', (0,7), (0,7), colors.HexColor('#FEE2E2')),
        ('BACKGROUND', (0,8), (0,8), colors.HexColor('#DBEAFE')),
        ('BACKGROUND', (0,9), (0,9), colors.HexColor('#FFEDD5')),
        ('BACKGROUND', (0,10), (0,10), colors.HexColor('#FEF3C7')),
    ]))
    story.append(t_findings)

    story.append(PageBreak())

    # ==========================================
    # RECOMENDAÇÕES PRIORIZADAS
    # ==========================================
    story.append(Paragraph("Recomendações Priorizadas de Correção", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))

    recs = [
        ("P1 (Imediato / Bloqueador de Release)", COLOR_CRITICA, [
            "<b>Falha no Segredo JWT (authMiddleware.js:4):</b> Remover imediatamente o valor de fallback. Implementar validação obrigatória no startup (<code>if (!process.env.JWT_SECRET) throw new Error(...)</code>) para abortar a inicialização caso a variável esteja ausente.",
            "<b>IDOR no Cancelamento de Agendamentos (databaseRoutes.js:189):</b> Modificar a cláusula <code>UPDATE</code> para verificar se <code>id = $1</code> AND (<code>paciente_id IN (SELECT id FROM pacientes WHERE usuario_id = $2) OR psicologo_id IN (SELECT id FROM psicologos WHERE usuario_id = $2)</code>), garantindo que apenas participantes ou administradores cancelem a consulta."
        ]),
        ("P2 (Alta Prioridade / Próxima Sprint)", COLOR_ALTA, [
            "<b>Isolamento de Mensagens do Chat (databaseRoutes.js:207, 224):</b> Incluir verificação de autorização em <code>GET /api/mensagens/:agendamentoId</code> e <code>POST /api/mensagens</code>, checando se o usuário autenticado pertence ao agendamento alvo antes de buscar ou persistir mensagens.",
            "<b>Autenticação e Validação no Meet (server.js:136):</b> Adicionar middleware <code>requireAuth</code> na rota <code>/api/meet/create-event</code> e validar se o usuário autenticado possui permissão para gerar evento associado àquela consulta.",
            "<b>Mitigação de XSS no Frontend (script.js:238, 247):</b> Substituir o uso de <code>innerHTML</code> por <code>textContent</code> na exibição de mensagens de chat e triagem, ou integrar biblioteca de sanitização robusta como <code>DOMPurify</code> antes de qualquer injeção de HTML."
        ]),
        ("P3 (Média / Baixa Prioridade / Melhorias Arquiteturais)", COLOR_MEDIA, [
            "<b>Depreciação de Rotas Redundantes (databaseRoutes.js:78):</b> Descontinuar a rota pública <code>POST /api/psicologos</code> em prol exclusivo do fluxo protegido em <code>/api/auth/register</code>.",
            "<b>Saneamento de Credenciais Padrão (seed.sql, script.js):</b> Assegurar que seeds de desenvolvimento não sejam executados em ambientes de homologação/produção e desabilitar credenciais demo em builds voltadas à produção.",
            "<b>Content Security Policy (CSP):</b> Reativar a diretiva CSP no middleware <code>helmet</code> em <code>server.js:17-20</code> com políticas estritas de <code>script-src</code> e <code>connect-src</code>."
        ])
    ]

    for title, color_code, items in recs:
        story.append(Paragraph(f"<font color='{color_code}'><b>{title}</b></font>", style_h2))
        for it in items:
            story.append(Paragraph(f"• {it}", style_body))
        story.append(Spacer(1, 4))

    story.append(PageBreak())

    # ==========================================
    # ISSUES PARA O GITHUB
    # ==========================================
    story.append(Paragraph("Issues Prontas para o GitHub", style_h1))
    story.append(Paragraph("Blocos completos formatados em Markdown para criação imediata no repositório:", style_body))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))

    issues = [
        {
            "id": 1,
            "title": "[Segurança] Vulnerabilidade Crítica de IDOR em Cancelamento de Agendamentos",
            "labels": "security, severidade:crítica, p1",
            "problem": "O endpoint PATCH /api/agendamentos/:id/cancelar recebe o identificador do agendamento via parâmetro de rota e executa diretamente uma instrução UPDATE no banco de dados sem verificar se o usuário autenticado (req.user.id) é o paciente ou psicólogo daquela consulta.",
            "evidence": "backend/src/routes/databaseRoutes.js:189-204\n```js\nrouter.patch('/agendamentos/:id/cancelar', requireAuth, async (req, res) => {\n  const { id } = req.params;\n  const result = await query(\n    `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 RETURNING *`,\n    [id]\n  );\n```",
            "impact": "Qualquer paciente ou psicólogo autenticado no sistema pode cancelar agendamentos de terceiros arbitrários conhecendo ou iterando identificadores UUID.",
            "fix": "Adicionar verificação de pertinência antes da atualização ou restringir o UPDATE garantindo que a consulta pertença ao usuário logado ou que req.user.tipo === 'admin'.",
            "acceptance": "- [ ] Usuário paciente não consegue cancelar agendamento de outro paciente (retorna 403).\n- [ ] Usuário psicólogo não consegue cancelar agendamento onde não seja o profissional responsável (retorna 403).\n- [ ] Administrador consegue cancelar qualquer consulta.\n- [ ] Teste automatizado de regressão cobrindo rejeição de IDOR implementado em database.test.js."
        },
        {
            "id": 2,
            "title": "[Segurança] Segredo JWT com Fallback Público Hardcoded em authMiddleware.js",
            "labels": "security, severidade:crítica, p1",
            "problem": "A constante JWT_SECRET utiliza um fallback estático caso a variável de ambiente process.env.JWT_SECRET não seja fornecida, permitindo que a aplicação suba em produção com um segredo público conhecido.",
            "evidence": "backend/src/middleware/authMiddleware.js:4\n```js\nconst JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';\n```",
            "impact": "Qualquer atacante externo pode gerar tokens JWT válidos com payload de administrador ({ id: 1, email: 'admin@attack.com', tipo: 'admin' }) e obter acesso irrestrito às rotas administrativas da API.",
            "fix": "Remover o valor padrão e incluir validação estrita no boot da aplicação (server.js / authMiddleware.js) lançando exceção fatal se JWT_SECRET não estiver definida ou tiver menos de 32 caracteres.",
            "acceptance": "- [ ] Servidor aborta inicialização em ambiente não-teste se JWT_SECRET estiver indefinida.\n- [ ] Fallback hardcoded removido de authMiddleware.js.\n- [ ] .env.example e documentação atualizados destacando a obrigatoriedade da variável."
        },
        {
            "id": 3,
            "title": "[Segurança] Vazamento de Dados do Chat e Injeção de Mensagens por Falta de Isolamento de Agendamento",
            "labels": "security, severidade:alta, p2",
            "problem": "Os endpoints GET /api/mensagens/:agendamentoId e POST /api/mensagens não validam se o usuário requisitante é participante da consulta relacionada ao agendamento informado.",
            "evidence": "backend/src/routes/databaseRoutes.js:207-241\n```js\nrouter.get('/mensagens/:agendamentoId', requireAuth, async (req, res) => {\n  const result = await query(`SELECT m.*, u.nome AS autor_nome FROM mensagens m WHERE m.agendamento_id = $1 ...`, [req.params.agendamentoId]);\n```",
            "impact": "Quebra de sigilo profissional psicológico e privacidade clínica (LGPD / Conselho Federal de Psicologia). Qualquer usuário logado pode ler todo o histórico de conversas entre médico e paciente de qualquer consulta.",
            "fix": "Validar na tabela agendamentos se o agendamento_id pertence ao req.user.id antes de listar ou inserir mensagens.",
            "acceptance": "- [ ] GET /api/mensagens/:id rejeita com 403 requisições de usuários que não participam da consulta.\n- [ ] POST /api/mensagens rejeita com 403 tentativa de postagem de terceiros.\n- [ ] Testes de integração cobrindo os cenários autorizados e negados."
        },
        {
            "id": 4,
            "title": "[Segurança] Endpoint de Criação de Eventos Meet Desprotegido contra Abuso e IDOR",
            "labels": "security, severidade:alta, p2",
            "problem": "A rota POST /api/meet/create-event não possui middleware de autenticação (requireAuth) e aceita livremente parâmetros arbitrários de consultaId, pacienteEmail e psicologoEmail.",
            "evidence": "backend/src/server.js:136-168\n```js\napp.post('/api/meet/create-event', async (req, res) => {\n  const { consultaId, summary, description, startDateTime, endDateTime, pacienteEmail, psicologoEmail } = req.body;\n```",
            "impact": "Possibilidade de exaustão de cota da API Google Calendar, envio de e-mails de phishing/spam utilizando a credencial da clínica e criação não autorizada de links de videoconferência.",
            "fix": "Adicionar requireAuth e validar se o consultaId corresponde a um agendamento válido pertencente ao usuário logado.",
            "acceptance": "- [ ] Rota rejeita requisições anônimas com status 401.\n- [ ] Usuário não autorizado para a consulta recebe 403.\n- [ ] Dados de e-mail dos participantes são extraídos do banco de dados a partir do agendamento, não do corpo da requisição."
        },
        {
            "id": 5,
            "title": "[Segurança] Vulnerabilidade de Cross-Site Scripting (XSS) no Chat e Triagem",
            "labels": "security, severidade:alta, p2",
            "problem": "No frontend, as mensagens do chat e os resultados de triagem de sintomas utilizam innerHTML concatenando variáveis providas por usuários sem qualquer sanitização.",
            "evidence": "frontend/js/script.js:238 e 247\n```js\n// Chat:\nbyId('chatMensagens').innerHTML = banco.mensagens.map(m => `<div class=\"chat-bubble\">...<p>${m.texto}</p></div>`);\n// Triagem:\nbyId('resultadoTriagem').innerHTML = `<div class=\"notice-box\"><b>Sugestão:</b> ${sugestao}...`;\n```",
            "impact": "Execução de scripts maliciosos no contexto de execução do navegador de outros usuários e psicólogos, possibilitando roubo de tokens JWT em localStorage e sequestro de sessão.",
            "fix": "Criar elementos DOM com document.createElement e atribuir textos via textContent, ou integrar a biblioteca DOMPurify para sanitizar strings antes de injetar em innerHTML.",
            "acceptance": "- [ ] Inserção de carga <img src=x onerror=alert(1)> no chat renderiza como texto puro sem disparar script.\n- [ ] Inserção de payload no relato de triagem é escapada com segurança.\n- [ ] Diretiva CSP ativa no backend proibindo scripts inline inseguros."
        }
    ]

    import html
    for iss in issues:
        raw_text = (
            f"--- ISSUE {iss['id']} ---\n"
            f"**Título:** {iss['title']}\n"
            f"**Labels sugeridas:** {iss['labels']}\n\n"
            f"**Descrição do Problema:**\n{iss['problem']}\n\n"
            f"**Evidência de Código:**\n{iss['evidence']}\n\n"
            f"**Impacto de Segurança:**\n{iss['impact']}\n\n"
            f"**Sugestão de Correção:**\n{iss['fix']}\n\n"
            f"**Critérios de Aceite:**\n{iss['acceptance']}\n"
            f"--- FIM ISSUE {iss['id']} ---"
        )
        escaped_text = html.escape(raw_text).replace('\n', '<br/>')
        
        t_issue = Table([[Paragraph(f"<b>ISSUE #{iss['id']} PARA O GITHUB: {html.escape(iss['title'])}</b>", style_table_header)],
                         [Paragraph(escaped_text, style_code)]],
                        colWidths=[17 * cm])

        t_issue.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E293B')),
            ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#F8FAFC')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        
        story.append(KeepTogether([t_issue, Spacer(1, 12)]))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Relatório gerado com sucesso em: {output_pdf}")
    return output_pdf

if __name__ == "__main__":
    build_pdf()
