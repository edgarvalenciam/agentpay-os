# Fase 3 — Mock de pagos y conciliación (Gate G3)

**Precondición:** G2 aprobado. Solo `CODI_PUSH` funcional en modo MOCK.

## Trabajo
- [x] `MockCodiPushGateway` con comportamiento controlado y explícitamente simulado.
- [x] `POST /v1/orders/:id/payment-requests` con consentimiento, idempotencia, persistencia-before-external-call, gating de stock y cuenta.
- [x] Simulación de webhook firmable de desarrollo **separada** de tráfico proveedor real y visible como SIMULADO.
- [x] `PaymentAttemptStatus` con `SUBMISSION_UNKNOWN` ante timeout externo.
- [x] Conciliación monto/moneda/recurso/cuenta/orden, deduplicación eventos y outbox.
- [x] Polling de estado para UI posterior; pruebas de timeout, webhooks duplicados, eventos tardíos y mismatch.

## G3
- [x] Un happy path completo en terminal confirma orden simulada exactamente una vez.
- [x] Un POST incierto no dispara automáticamente otro cobro.
- [x] Un webhook sin firma válida, monto incorrecto o cuenta diferente no marca PAID.
- [x] Resultado y logs sin secretos documentados.

Ver `docs/g3-mock-payments.md` para evidencia y límites. Gate validado con mocks propios; sin integración pey ni canal externo de mensajería.
