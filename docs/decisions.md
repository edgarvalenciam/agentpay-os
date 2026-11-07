# Architecture Decision Log

## ADR-001 — Core primero, frontend después
- **Fecha:** 2026-11-07
- **Decisión:** core independiente, API-first, frontend definido por contratos y construido después.
- **Razón:** la integridad transaccional y la conciliación son el riesgo principal.
- **Estado:** aceptada.

## ADR-002 — Aprobación bancaria obligatoria
- **Fecha:** 2026-11-07
- **Decisión:** el agente no inicia pagos directamente; el comprador solicita el cobro y autoriza en su aplicación bancaria.
- **Estado:** aceptada.

## ADR-003 — Entorno simulado por defecto
- **Fecha:** 2026-11-07
- **Decisión:** sin claves ni pagos reales por defecto. Toda demo simulada debe etiquetarse como tal.
- **Estado:** aceptada.

## Pendientes
- Beneficiario final y contrato operativo de pey.
- Habilitación de CoDi Push y prueba de banco pagador.
- Manejo exacto de rechazos, vencimientos y consulta de estados del proveedor.

## ADR-004 — Diseño multimétodo sin implementación temprana
- **Fecha:** 2026-11-07
- **Decisión:** el dominio admite `CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK`, pero el MVP implementa CoDi Push primero y los demás solo si no comprometen G7.
- **Razón:** aprovechar pey sin ampliar prematuramente el camino crítico.
- **Estado:** aceptada.

## ADR-005 — Cuenta bancaria por comercio con gate legal
- **Fecha:** 2026-11-07
- **Decisión:** modelar `MerchantPaymentAccount`, exigir estado ACTIVE para CoDi y no habilitar producción de terceros sin revisar contratos/KYB.
- **Estado:** aceptada como diseño; operación multi-comercio pendiente.

## ADR-006 — Recurso del proveedor distinto de transacción
- **Fecha:** 2026-11-07
- **Decisión:** separar `ProviderResource` de `ProviderTransaction`; QR y Payment Link pueden relacionarse con más de una transacción, y Push trae transactionId inicial.
- **Estado:** aceptada.

## ADR-007 — Link alojado no cambia orden aprobada
- **Fecha:** 2026-11-07
- **Decisión:** una modificación de monto exige nueva evaluación y consentimiento; no actualizar en silencio links `pending`. `hasTip=false` para compras de monto cerrado.
- **Estado:** aceptada.
