# Fase 4 — Integración pey / CoDi Push (Gate G4)

**Precondición:** G3 aprobado + G0-R operativo + consentimiento explícito para **cualquier** cobro real.

## Alcance P0
- [x] `PeyCodiPushGateway` (backend) `POST /codi/pn`, Bearer, conversion exacta `amountMinor` → pesos, 10 dígitos, `expiration>=360`, `numRef` <=7 dígitos, metadata plana.
- [x] Registrar `transactionId`, `codiId`, `apiKeyId` y beneficiario configurado. Nunca marcar PAID por HTTP 200.
- [x] `GET /transaction/:id` y mapeo de estados publicados `PENDING`/`PAID`.
- [x] Verificador Standard Webhooks sobre raw body: `webhook-id`, `webhook-timestamp`, `webhook-signature`, secreto de API key y deduplicación.
- [x] Reconciliar `codi.pn.payment_received`, importe, `transactionId`, merchant/receptor, referencia, entorno y fecha.
- [x] Recovery ante 503/timeout `SUBMISSION_UNKNOWN`, sin re-POST automático.
- [x] Distinguir operaciones mock vs reales en cada vista/evento.

## Extensiones solo si se autoriza después de G4
- [ ] Alta/consulta de cuentas bancarias, con consentimiento del titular y gate contractual para terceros.
- [ ] QR de importe fijo y conciliación 1:N por `codiQrId`.
- [ ] Payment Link con `hasTip=false`, redirecciones HTTPS, conciliación de `paid` y `amountBreakdown`.

## G4
- [x] Tests contractuales de los campos de pey sobre fixtures publicados.
- [ ] Prueba financiera real de bajo monto solo si autorizada por pagador y beneficiario; registrar evidencia verificable sin exponer PII.
- [ ] Si falla la habilitación, declarar G4-R no cumplido y mantener una demo etiquetada MOCK, sin engañar al juez.

G4 técnico implementado con fixtures; G4-R bancario pendiente. Ver docs/g4-pey-integration.md. La consulta de cuenta existente está implementada; el alta de cuentas sigue fuera de alcance.
