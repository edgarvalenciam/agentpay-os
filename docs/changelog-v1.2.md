# Changelog — actualización v1.1 → v1.2

**2026-11-07 · Tipo:** planificación + especificación, NO implementación.

1. **Cobertura documental:** antes se centraba en CoDi Push. Ahora incluye 11 endpoints y cuatro eventos de webhook de las cinco familias públicas (CoDi, Bank Account, Payment Link, Transaction, Webhooks).
2. **Multimétodo sin scope creep:** `CODI_PUSH`, `CODI_QR`, `PAYMENT_LINK` tipados; se implementa primero solo `CODI_PUSH`. QR y link se dejan para extensiones posteriores a G4.
3. **Comercios/cuentas:** `MerchantPaymentAccount` y flujo `PENDING → PROCESSING → ACTIVE/ERROR`, con normalización de mayúsculas; cuenta `ACTIVE` como requisito de CoDi. Multi-comercio requiere confirmación legal/contractual.
4. **CoDi QR:** diferenciar `id` de QR versus `transactionId`, permitir 1:N; cerrar el importe en checkout fijo y no permitir `amount=0` en ese caso.
5. **Payment Links:** URL checkout, `hasTip=false` en precio cerrado, redirección ≠ pago, `update` solo si `pending` y prohibición de mutar una orden autorizada.
6. **Conciliación ampliada:** query por transacción, listado por API key, por cuenta y por QR; páginas de 80/80/20 con `nextToken`.
7. **Webhooks:** firma y deduplicación, cuatro tipos de eventos y `bank.account.updated` solo para activación.
8. **Contratos más robustos:** `ProviderResource` y `ProviderTransaction` separados; mapping entre recursos propios y del proveedor.
9. **Tareas Codex:** archivos de trabajo para Fases 0–7, prompt actualizado, gates y alcance de cada etapa.
10. **Seguridad operacional:** ambiente mock por defecto, sin credenciales; operaciones financieras reales requieren consentimiento expreso.

## Qué NO cambió

- Core-first; API-first; TypeScript, Zod, Vitest, pnpm; frontend diseñado temprano e implementado después.
- Agente IA propone; core decide; usuario inicia solicitud y banco autoriza.
- Se debe aprobar G1 antes de continuar G2; ninguna fase se considera implementada con solo documentación.

## Advertencias

- El sitio de pey puede cambiar. Verificar la referencia oficial al implementar y documentar diferencias.
- No confundir que pey documenta varias cuentas con autorización para procesar cobros de terceros bajo un modelo B2B2C.
- No confundir `PAID` en pey con pedido entregado ni con exacto monto neto disponible al comercio.
