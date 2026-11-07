# Fase 1 — Core, reglas, órdenes y tipos de pago (Gate G1)

## Objetivo

Implementar un dominio autónomo **sin** dependencias de API, DB, OpenAI o pey. Leer `AGENTS.md`, plan maestro y documentación de adaptadores antes de codificar.

## Entregables

- [x] Monorepo mínimo `pnpm` con TypeScript `strict`, Zod, Vitest y paquete `packages/core`.
- [x] Tipos/validación de `PurchaseIntent`, `Offer`, `Merchant`, `MerchantPaymentAccount`, `Reservation`, `PolicyEvaluation`, `OrderSnapshot`, `ConsentRecord` y `PaymentMethod`.
- [x] Tipos `PaymentMethod`: `CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK`, sin implementar gateway alguno.
- [x] `evaluateOffer(intent, offer, context)` **función pura** con razones y `policyVersion`.
- [x] Chequeos: presupuesto MXN y centavos, match de producto/cantidad, fecha y zona horaria explícitas, cuenta habilitada en operación CoDi, merchant activo, stock, reserva, plazo de entrega y oferta vigente.
- [x] Máquina de estados comercial separada de estados de pago. Consentimiento comercial ligado a hash/version de snapshot, incluyendo beneficiario y teléfono.
- [x] No asumir que una oferta seleccionada equivale a pago; impedir cobro desde core.
- [x] README con comandos para reproducir tests y resultados en `docs/progress.md`.

## Fixtures obligatorios

- Precio $850 vs máximo $1,000, comercio y cuenta CoDi ACTIVE, reserva válida → **ELIGIBLE**.
- Precio $1,200 → REJECTED por límite.
- Moneda no MXN, cantidad insuficiente, entrega tarde/desconocida, oferta vencida, merchant inactivo → REJECTED.
- Cuenta CoDi `PENDING`/`ERROR` o beneficiario inconsistente → no permitir solicitar CoDi.
- Cambio de precio, producto, entrega, cuenta beneficiaria o teléfono después de aprobación → invalidar consentimiento anterior.
- Fecha "mañana" convertida con timezone local explícito, nunca reloj global implícito.
- Método QR con monto abierto no debe considerarse elegible para orden de importe fijo (la restricción de payload se implementará en adaptador futuro).

## Criterios G1

- `pnpm test` y `pnpm typecheck` ejecutados, resultados reales registrados.
- `packages/core` no importa frameworks/SDKs externos.
- Todas las políticas producen checks individuales y causa de rechazo.
- Suite demuestra que no se inicia ningún cobro por elegibilidad aislada.
- `docs/progress.md` y `docs/decisions.md` actualizados.
- **Detenerse** sin construir Fase 2.
