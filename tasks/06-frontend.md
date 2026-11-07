# Fase 6 — Frontend mínimo, construido al final (Gate G6)

**Precondición:** G5 aprobado. La UI se definió desde el día 1 en el plan maestro.

## Pantallas
- [ ] Chat de compra con intención natural y propuesta.
- [ ] Oferta seleccionada con precio total, producto, comercio y entrega.
- [ ] Checkout con snapshot y consentimiento para **enviar solicitud CoDi** (no autorización bancaria).
- [ ] Espera con `PAYMENT_PENDING` y diagnóstico sin reintentar POST en automático.
- [ ] Resultado verificado o excepción pendiente, con etiqueta **MOCK** o **REAL**.
- [ ] Vista básica de comercio con órdenes pagadas y preparación.
- [ ] Auditoría de órdenes y eventos sanitizada.

## G6
- [ ] UX completa consumiendo API propia, sin tocar pey desde navegador.
- [ ] El frontend nunca muestra `PAID` por un temporizador o simple redirect.
- [ ] No mostrar métodos QR o Payment Link como usables si no están implementados.
