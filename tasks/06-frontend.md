# Fase 6 — Frontend mínimo, construido al final (Gate G6)

**Precondición:** G5 aprobado. La UI se definió desde el día 1 en el plan maestro.

## Pantallas
- [x] Chat de compra con intención natural y propuesta.
- [x] Oferta seleccionada con precio total, producto, comercio y entrega.
- [x] Checkout con snapshot y consentimiento para **enviar solicitud CoDi** (no autorización bancaria).
- [x] Espera con `PAYMENT_PENDING` y diagnóstico sin reintentar POST en automático.
- [x] Resultado verificado o excepción pendiente, con etiqueta **MOCK** o **REAL**.
- [x] Vista básica de comercio con órdenes pagadas y preparación.
- [x] Auditoría de órdenes y eventos sanitizada.

## G6
- [x] UX completa consumiendo API propia, sin tocar pey desde navegador.
- [x] El frontend nunca muestra `PAID` por un temporizador o simple redirect.
- [x] No mostrar métodos QR o Payment Link como usables si no están implementados.

## Estado verificado

Implementado y probado en perfil local SIMULADO con intérprete fixture, backend comercial real y pagos mock. No se expone modo REAL ni claves en el navegador. Flujo de compra, confirmación explícita de operador, comercio/preparación y auditoría verificados en navegador móvil/escritorio. 346 pruebas y typecheck aprobados. Validación no acredita operación bancaria desde esta UI ni autenticación pública de producción. Ver docs/g6-frontend.md. G7 no iniciado.
