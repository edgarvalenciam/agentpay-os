# AgentPay OS — Codex Starter v1.2

**Estado:** paquete de especificaciones y tareas listo para desarrollar con Codex. **No contiene código de aplicación ejecutable, credenciales, tests ejecutados ni pagos realizados.** Fecha: 2026-11-07.

## Objetivo

Infraestructura B2B2C para comercio iniciado por IA, validado por políticas deterministas y pagado con autorización bancaria mediante pey/CoDi. El MVP implementa el camino **CoDi Push**; la arquitectura prevé CoDi QR y Payment Links, pero no los implementa todavía.

## Primeros pasos

1. Descomprime el ZIP y abre **esta carpeta** como workspace/proyecto en Codex Desktop (o CLI de Codex).
2. Lee `AGENTS.md` y `AGENTPAY_MVP_IMPLEMENTATION.md`.
3. Pega en Codex el contenido completo de `prompts/START_CODEX.md`.
4. Permite que termine exclusivamente Fase 1 / Gate G1: motor de políticas y dominio en TypeScript estricto con pruebas. Fase 0 documental se puede hacer en paralelo.
5. Revisa `docs/progress.md`, `docs/decisions.md` y los resultados **reales** de los tests. Avanza una fase únicamente cuando autorices el siguiente gate.

## Archivos

| Archivo | Función |
|---|---|
| `AGENTS.md` | Instrucciones persistentes y restricciones de Codex |
| `AGENTPAY_MVP_IMPLEMENTATION.md` | Plan maestro actualizado v1.2 (incluye 8 fases) |
| `docs/pey-capabilities.md` | Inventario de 11 operaciones API, 4 eventos, fuentes oficiales y riesgos |
| `docs/pey-adapter-contracts.md` | Tipos y reglas para Payment Orchestrator, cuentas y conciliación |
| `docs/pey-validation.md` | Matriz de factibilidad: documentado vs probado vs bloqueado |
| `docs/decisions.md` | Registro ADR del proyecto |
| `docs/progress.md` | Gates, resultados y avance real |
| `docs/changelog-v1.2.md` | Cambios comparados con v1.1 |
| `tasks/00-pey-validation.md` | Validación externa, sin ejecutar cobros |
| `tasks/01-core.md` | Única tarea de código autorizada inicialmente |
| `tasks/02-*.md` a `tasks/07-*.md` | Siguientes fases, NO iniciar aún |
| `prompts/START_CODEX.md` | Prompt para Codex |
| `.env.example` | Valores seguros sin secretos |

## Alcance y precauciones

- API pey documentada: CoDi Push, QR, cuentas bancarias, Payment Links y consulta de transacciones. **No asumir** soporte para refunds, payouts, splits, escrow, débitos automáticos o autorización sin banco.
- Un `200` creando CoDi Push y una redirección a `successUrl` no significan PAID.
- Antes de aceptar un pago: cuenta activa, solicitud comercial aprobada, firma de webhook, monto y destinatario reconciliados.
- El portal pey documenta pruebas directamente en producción y no un sandbox dedicado público al momento de la revisión. El paquete **NO autoriza pruebas reales**.
- `PAYMENT_PROVIDER=mock`, `ALLOW_REAL_PAYMENTS=false` de fábrica. No subir `.env` ni credenciales al repositorio.

## Qué hay que decidir con pey antes de V1 B2B2C

Posibilidad contractual de registrar terceros bajo una sola API key, alta/habilitación de cuentas ajenas, prevención de duplicados upstream, campos de confirmación y rechazo, términos/comisiones por Payment Links y políticas de devolución. Ver `docs/pey-validation.md`.
