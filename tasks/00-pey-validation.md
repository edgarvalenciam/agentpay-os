# Fase 0 — Factibilidad y revisión de pey (G0)

**Modo:** investigación/documentación, nunca crear transacciones reales sin aprobación explícita.

## G0-D documental (se considera cubierto por v1.2, sujeto a revalidación al codificar)
- [x] Identificar 11 operaciones API y 4 webhooks públicos (ver `docs/pey-capabilities.md`).
- [x] Definir límites de Push, QR, Links, cuentas y conciliación (`docs/pey-adapter-contracts.md`).
- [x] Distinguir lo documentado de los supuestos contractuales.

## G0-R operativo (pendiente)
- [ ] Identificar titular y cuenta receptora habilitada / propia del piloto.
- [ ] Conseguir API key desde portal, sin incluir secretos en logs ni repositorio.
- [ ] Verificar que la cuenta CoDi esté ACTIVE.
- [ ] Verificar teléfono pagador enrolado y autorización expresa para prueba.
- [ ] Configurar endpoint HTTPS, guardar secreto y validar una firma estándar.
- [ ] Confirmar con pey comportamiento de idempotencia y timeout de POST.
- [ ] Si se autoriza explícitamente, probar monto pequeño, registrar IDs sanitizados y conciliar `PAID`.

**No pasar a Fase 4 real si G0-R no está listo.** Si no hay credenciales, mantener mock y reportar limitación. Las cuentas de prueba de terceros no son equivalentes al abono del comercio.
