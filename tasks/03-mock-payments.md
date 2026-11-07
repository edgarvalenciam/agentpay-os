# Fase 3 — Mock de pagos y conciliación (Gate G3)

**Precondición:** G2 aprobado. Solo `CODI_PUSH` funcional en modo MOCK.

## Trabajo
- [ ] `MockCodiPushGateway` con comportamiento controlado y explícitamente simulado.
- [ ] `POST /v1/orders/:id/payment-requests` con consentimiento, idempotencia, persistencia-before-external-call, gating de stock y cuenta.
- [ ] Simulación de webhook firmable de desarrollo **separada** de tráfico proveedor real y visible como SIMULADO.
- [ ] `PaymentAttemptStatus` con `SUBMISSION_UNKNOWN` ante timeout externo.
- [ ] Conciliación monto/moneda/recurso/cuenta/orden, deduplicación eventos y outbox.
- [ ] Polling de estado para UI posterior; pruebas de timeout, webhooks duplicados, eventos tardíos y mismatch.

## G3
- [ ] Un happy path completo en terminal confirma orden simulada exactamente una vez.
- [ ] Un POST incierto no dispara automáticamente otro cobro.
- [ ] Un webhook sin firma válida, monto incorrecto o cuenta diferente no marca PAID.
- [ ] Resultado y logs sin secretos documentados.
