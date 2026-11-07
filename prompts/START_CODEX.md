# Prompt inicial para Codex — v1.2

Actúa como arquitecto e ingeniero principal de AgentPay OS y trabaja **únicamente en la Fase 1 (G1)** del proyecto.

Antes de editar, lee en este orden:
1. `AGENTS.md`
2. `AGENTPAY_MVP_IMPLEMENTATION.md` (plan v1.2)
3. `docs/pey-capabilities.md`
4. `docs/pey-adapter-contracts.md`
5. `tasks/01-core.md`
6. `docs/pey-validation.md`, `docs/progress.md`, `docs/decisions.md`

Implementa monorepo TypeScript estricto con pnpm, Zod y Vitest. Desarrolla exclusivamente core puro y motor de políticas, entidades, snapshots, consentimiento comercial ligado al snapshot, `MerchantPaymentAccount` y tipos `PaymentMethod` (`CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK`) **sin crear adaptadores reales ni mocks financieros todavía**.

Fixtures: café especialidad 2 kg, presupuesto $1,000, oferta $850 elegible; oferta $1,200 bloqueada; vencimiento, entrega tardía, cambio de condiciones, comercio no habilitado, reserva ausente y cambio de beneficiario como negativas. La elegibilidad no autoriza cobro.

No implementar HTTP, SQLite/Prisma, frontend, integración OpenAI, integración pey ni crear solicitudes de pago. No contactar a `api.pey.mx`. El diseño multimétodo es solo de tipos en esta fase.

Primero resume brevemente diseño y criterios de aceptación; después implementa, ejecuta comandos y tests reales. Actualiza `docs/progress.md` y registra decisiones en `docs/decisions.md`. Presenta archivos modificados, comandos ejecutados, resultados reales, bloqueos, cumplimiento de G1 y **detente sin iniciar Fase 2**.
