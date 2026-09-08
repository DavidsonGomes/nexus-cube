# Superadmin R2: proposta sem implementação

Autorização de produto aprovada para R2, fora da release Auth R1. Ainda não há CRUD administrativo, promoção, role ou operação sobre usuários reais.

Backend privilegiado receberá JWT do solicitante, verificará usuário/sessão no servidor e consultará autorização administrativa mantida em armazenamento controlado pelo servidor. Não confiar em `user_metadata`, flag de UI, primeiro cadastro ou posse presumida de email. Bootstrap depende de identidade expressamente indicada pelo usuário e de janela administrativa auditada.

Cliente poderá receber capacidades observáveis para menu/tela, mas cada leitura/mutação será novamente autorizada no backend. Segredo administrativo fica apenas no ambiente protegido do backend. Credencial frontend continua publishable. Access tokens emitidos e claims potencialmente antigos não substituirão verificação da autorização atual em operações sensíveis.

Proposta de operações: listar usuários com paginação e campos mínimos; consultar usuário por ID; preparar alteração; aplicar alteração com revisão/idempotency key e auditoria; preparar exclusão com efeitos explícitos; confirmar exclusão vinculada ao preview. Revogação e deleção terão resultados separados para não alegar invalidação imediata de JWTs já emitidos. Não emitir ou registrar senhas/tokens em respostas/auditoria.

Antes de habilitar: contrato de campos/roles, bootstrap explícito, proteção contra autoelevação e remoção do último administrador, revisão Vigia, limites/rate-limit, testes visitante/A/admin revogado/solicitação repetida e janela remota exclusiva. Nenhuma SQL ou infraestrutura foi criada por esta proposta.
