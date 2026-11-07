# AgentPay OS — Codex Starter v1.2

**Estado:** G1, G2 y G3 implementados: core, API local, persistencia SQLite/Prisma, reservas, consentimiento y auditoría. 122 pruebas y TypeScript estricto aprobados. Sin frontend ni integración financiera. Fecha: 2026-11-07.

## Objetivo

Infraestructura B2B2C para comercio iniciado por IA, validado por políticas deterministas y pagado con autorización bancaria mediante pey/CoDi. El MVP implementa el camino **CoDi Push**; la arquitectura prevé CoDi QR y Payment Links, pero no los implementa todavía.

## Primeros pasos

1. Abre esta carpeta en Codex y lee `AGENTS.md` y `docs/progress.md`.
2. G1, G2 y G3 ya están implementados. Ejecuta los comandos de reproducción de abajo.
3. `pnpm demo` demuestra API y persistencia sin banco ni frontend.
4. El prompt `prompts/START_CODEX.md` corresponde al arranque histórico de G1; no es la tarea siguiente.
5. Siguiente gate: G4, adaptador pey y requisitos operativos. No activar pagos reales ni producción desde este paquete.

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

## Ejecutar el core

Requisitos: Node.js 22+ y pnpm 11.25.0. Desde esta carpeta:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm typecheck
```

El paquete `@agentpay/core` está en `packages/core/src`. Las pruebas usan fixtures ficticios y no requieren variables de entorno. No existe servidor ni integración financiera. Ver `docs/architecture.md` y `docs/progress.md`.

## Fase 2 — API persistente

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm typecheck
pnpm demo
```

`pnpm demo` demuestra por HTTP local una orden de $850, replay idempotente, reinicio y auditoría en una DB temporal. No usa credenciales reales ni envía pagos. Para servidor persistente y contratos ver `docs/api-contracts.md`. `pnpm db:migrate` aplica migraciones sin resetear; `pnpm db:seed` conserva datos existentes. Generar el cliente Prisma con `pnpm db:generate` después de instalar o cambiar el schema.

G2 es local y de un proceso: autenticación demo por tokens de operador y escucha exclusiva en loopback. No es un despliegue productivo. G3 ya implementado; G4 requiere nueva instrucción y mantiene pagos reales deshabilitados.

## Fase 3 — Demostración de pago simulado

```sh
pnpm demo:payments
```

Muestra solicitud pendiente → evento firmado → confirmación simulada → una notificación interna → recuperación tras reinicio, con duplicados ignorados. No necesita credenciales de pey ni mueve dinero. Contratos, escenarios UNKNOWN, permisos de operador, recuperación y pruebas: `docs/g3-mock-payments.md`. La firma mock no acredita compatibilidad bancaria.

## URL de webhook pey — G4 parcial

Receptor dedicado con SDK Standard Webhooks y almacenamiento cifrado; sin acciones financieras. `pnpm webhook:up` inicia/reutiliza URL temporal; `pnpm webhook:configure` guarda el secreto con entrada oculta; `pnpm webhook:down` detiene servicios propios. Configuración y teléfono privados no están en el ZIP. Guía: docs/pey-webhook-url.md. Suite actual: 137 pruebas. G4 bancaria todavía pendiente.
