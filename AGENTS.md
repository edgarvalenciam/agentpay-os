# AGENTS.md — Reglas persistentes de AgentPay OS para Codex (v1.2)

## Contexto, orden de lectura y prioridades

1. Lee `AGENTPAY_MVP_IMPLEMENTATION.md` (v1.2), `docs/pey-capabilities.md`, `docs/pey-adapter-contracts.md` y `tasks/01-core.md`.
2. Lee `docs/decisions.md`, `docs/progress.md` y `docs/pey-validation.md` para no repetir ni inventar avances.
3. Haz el trabajo **por fases y gates**. En la primera sesión SOLO implementar Fase 1 y registrar hallazgos de Fase 0 sin llamadas financieras.
4. El producto valida compras iniciadas por IA; el agente **no puede efectuar pagos**. El usuario revisa la orden, solicita el cobro y autoriza en la app bancaria.
5. Mantén frontend **definido en contratos** pero NO lo desarrolles antes de G5/G6.

## Límites de la primera sesión

- Permitido: estructura monorepo TypeScript/pnpm, `packages/core`, modelos, Zod, motor de políticas, máquina de estados, test fixtures, Vitest y documentación de progreso.
- NO implementes endpoints HTTP, Prisma, OpenAI SDK, pey SDK, webhooks operativos, frontend ni pagos mock/real durante Fase 1.
- No invoques `https://api.pey.mx` ni uses una API key real, aunque estuviera disponible. No enviar solicitudes CoDi reales sin consentimiento explícito adicional.
- **Detente tras G1**. No interpretes que hay que implementar todas las fases porque existen tareas 02–07.

## Invariantes de seguridad y consistencia

- `packages/core` es puro; no importa Fastify, Next.js, Prisma, OpenAI ni implementaciones de pey.
- Guardar dinero en centavos enteros (`amountMinor`), MXN y aritmética exacta. El adaptador transforma a pesos decimales sin tolerancias silenciosas.
- Política elegible ≠ comprador aprobó el pedido ≠ solicitud enviada ≠ pago confirmado ≠ entrega realizada.
- Orden aprobada: snapshot inmutable de artículos, importe, comercio, cuenta beneficiaria, entrega y teléfono destino; cambios requieren nueva evaluación y consentimiento.
- Disponibilidad, vigencia, reserva y capacidad del comercio deben ser explícitas, nunca inventadas por IA.
- `PaymentMethod`: `CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK`. Diseña el modelo **sin implementar los tres** en G1. P0 = CoDi Push.
- Un QR puede tener múltiples pagos y admitir `amount=0`; no utilizar QR de importe abierto para una orden de precio cerrado.
- Payment Link puede tener fees/tips; para precio fijo `hasTip=false`, y no mutar una orden aprobada a través de `POST /payment-link/update`.
- El evento `bank.account.updated` solo publica `ACTIVE`; para otros estados se consulta API.
- No inventes capacidades no documentadas: reembolsos automáticos, payouts, escrow, split, pagos CoDi sin autorización bancaria, estados bancarios de entrega/lectura/rechazo.
- Deduplicar webhook tanto por `webhook-id` como por transacción/efecto y usar raw body + secreto Standard Webhooks. Mantener outbox persistente en la fase DB.
- Crear `PaymentAttempt` antes de llamar a proveedores; ante timeout de envío, `SUBMISSION_UNKNOWN`: nunca reintentar POST de manera automática sin idempotencia upstream demostrada.
- No exponer ni guardar credenciales, teléfonos, RFC o CLABE en logs/auditoría.
- La API de pey permite indicar `bankAccountId` en CoDi, pero **no valida por sí sola autorización legal para operar multi-comercio**.
- `PAYMENT_PROVIDER=mock` y `ALLOW_REAL_PAYMENTS=false` por defecto, incluidos los ejemplos.

## Ingeniería

- TypeScript strict, pnpm workspace, Zod, Vitest; capas separadas: core, contracts, integrations, database, apps.
- Política como función pura evaluable contra fixtures; errores tipados y estados explícitos.
- Fechas relativas resueltas usando timezone/fecha local del comprador explícitos.
- Crear pruebas de casos adversos y regresión, no solo happy path.
- Documentar en `docs/decisions.md` cualquier ambigüedad resuelta sin modificar silenciosamente producto.

## Gate de cierre

1. Ejecutar comandos reales: instalación, tests, typecheck (si existen). No afirmar éxitos no observados.
2. Actualizar `docs/progress.md` con fecha, archivos, comandos, resultados, evidencias y bloqueos.
3. Mostrar un resumen de cambios de código y una lista corta de riesgos restantes.
4. Declarar G1 como aprobado solo si se cumplieron todos sus criterios y **detenerse**.

## Estado verificado al cerrar G1 (2026-11-07)

- Core y reglas implementados; 47 pruebas y typecheck aprobados. No iniciar Fase 2 sin nueva instrucción del usuario.
- Idempotencia en G1 es una decisión pura sobre registros suministrados; atomicidad, índices únicos y persistencia pertenecen a G2/G3.
- Las transiciones financieras del core requieren evidencia de un servicio confiable futuro: no exponerlas directamente a agentes o clientes.
- Ver correcciones documentales en `docs/pey-review-2026-11-07.md`, incluyendo `partial`, `metadata.externalMetadata` e identificadores `id`/`transactionId`.

## Autorización y estado de Fase 2 — 2026-11-07

El usuario indicó «avacemos o que hace falta?» tras definir Fase 2; autoriza implementar G2. Las restricciones de primera sesión/G1 no impiden esta fase posterior. Se permiten API, Prisma y SQLite locales; se mantienen prohibidos frontend, llamadas financieras y credenciales reales.

G2 implementa API/auth local, reservas transaccionales, persistencia, idempotencia, auditoría/outbox interno y tablas preparatorias de pagos. No iniciar G3 ni proveedores simulados sin nueva instrucción. Ver `docs/api-contracts.md`, `docs/progress.md` y ADR-009/010. Los logs HTTP y Prisma permanecen desactivados para no filtrar cuerpos, tokens ni PII.

## Autorización y estado de Fase 3 — 2026-11-07

El usuario autorizó «continuemos con el siguiente fase» tras G2. Se permite únicamente G3: gateway CODI_PUSH mock, eventos de desarrollo firmados, conciliación, outbox y pruebas. No iniciar G4 ni ejecutar cobros reales.

- Mantener environment=mock / SIMULADO en efectos y respuestas financieras. El HMAC del protocolo mock NO implementa Standard Webhooks pey.
- Confirm/reject/dispatch son controles de operador separados de tokens comprador/comercio. Deshabilitados sin MOCK_CONTROL_TOKEN y ausentes en producción.
- SUBMISSION_PENDING huérfano pasa a UNKNOWN al reiniciar; nunca reenviar automáticamente. La aceptación idempotente 202 es histórica; consultar GET para estado actual.
- Pago tardío confirmado conserva evidencia y entra a excepción de cumplimiento si no hay reserva/stock. Consumo de inventario y outbox deben ser atómicos.
- Outbox entrega a bandeja local persistente; no enviar email, mensajes ni tráfico externo. Ver `docs/g3-mock-payments.md`.

## Autorización de URL / G4 parcial — 2026-11-07

El usuario autorizó crear la URL de webhooks y proporcionó su teléfono para configuración local. Esta entrega permite receptor dedicado, Standard Webhooks e infraestructura de túnel. No autoriza inferir un monto/destinatario ni ejecutar un cobro; no implementar frontend.

- Solo exponer el puerto del receptor dedicado, nunca la API comercial ni los controles mock.
- Teléfono/secretos únicamente en .env.pey.local privada e ignorada; jamás agregarla a commits, logs o ZIP.
- Sin secreto del portal: 503, no aceptar eventos sin firma. La configuración se recarga sin reinicio.
- Firma válida permite almacenar evidencia cifrada y pendiente; no marcar órdenes PAID desde la bandeja sin conciliación.
- G4 continúa parcial: falta transporte pey, conciliación real y validación bancaria explícita. Ver docs/pey-webhook-url.md.
