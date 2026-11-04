# 00 — Cuestiones que el software NO resuelve

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL.**
> Documento interno. Redactado por el equipo técnico a partir del código (fuente de verdad técnica), del texto oficial de las normas (BOE, EUR-Lex) y de guías de la AEPD. **No es asesoramiento jurídico.**
> Fecha de la auditoría: 2026-10-06.

Nada de lo implementado permite afirmar que Fíchame «cumple el RGPD» o que está «libre de riesgo jurídico». Lo que sigue son decisiones y verificaciones que corresponden a un abogado / asesor laboral y de protección de datos en España, o al titular de la empresa.

## A. Bloqueantes jurídicos antes de comercializar

| # | Cuestión | Por qué no lo resuelve el software | Documento |
|---|---|---|---|
| 1 | **¿Es Fíchame una agencia de colocación** (Ley 3/2023, arts. 40-45; RD 1796/2010)? | Depende de la calificación jurídica de la actividad y del modelo de negocio, no del código. Si lo es, requiere **declaración responsable** ante el servicio público de empleo y cumplir obligaciones propias (gratuidad para trabajadores, información al SEPE/servicios autonómicos, etc.). | [01](01-analisis-agencia-colocacion.md) |
| 2 | **Calificación final responsable/encargado** por cada tratamiento | El análisis técnico propone roles; la calificación depende de quién decide fines y medios *de hecho* y de lo que diga el contrato. | [02](02-data-controller-processor-analysis.md) |
| 3 | **Acuerdo de encargo (art. 28 RGPD)** definitivo | `/encargo` es un borrador estructural; faltan plazos de notificación de brechas, auditoría, devolución, responsabilidad. | `/encargo`, [10](10-acuerdo-encargo-tratamiento.md) |
| 4 | **Identidad del operador** (razón social, NIF, domicilio, registro, email de privacidad) | No se pueden inventar. Hoy las páginas dicen que están pendientes de publicación (variables `OPERATOR_*`). Exigido por art. 10 LSSI y art. 13 RGPD. | `/terminos`, `/privacidad` |
| 5 | **Transferencias internacionales** (Supabase Inc., Vercel Inc.) | Hay que confirmar región real de datos, DPA firmado/aceptado, certificación DPF vigente o SCC, y subencargados de cada proveedor. | [07](07-data-processing-vendors.md) |
| 6 | **Plazos de conservación** | Los valores por defecto (90 / 180 / 365 días) son **técnicos y provisionales**. En especial: si procede **bloqueo** (art. 32 LOPDGDD) en lugar de supresión inmediata, y durante cuánto tiempo (p. ej., por plazos de prescripción de acciones por discriminación en el acceso al empleo o de infracciones). | [06](06-data-subject-rights.md), [08](08-record-of-processing-activities.md) |
| 7 | **¿EIPD/DPIA obligatoria?** | La lista de la AEPD (art. 35.4 RGPD) y los criterios del EDPB requieren una valoración jurídica. Recomendación técnica: hacerla antes del lanzamiento. | [09](09-dpia-assessment.md) |
| 8 | **¿DPD/DPO obligatorio?** (art. 37 RGPD, art. 34 LOPDGDD) | Depende de la actividad principal y de la escala; también del punto 1. | [09](09-dpia-assessment.md) §DPD |
| 9 | **Textos legales finales**: `/privacidad`, `/cookies`, `/terminos`, `/encargo`, aviso de cada negocio (`/r/:slug/privacidad`), textos de consentimiento (`src/lib/consent.js`) | Son borradores técnicos marcados como tales. | — |

## B. Revisión jurídica necesaria (no bloqueante por sí sola, pero antes de escalar)

- **Base jurídica** de cada tratamiento (propuestas en [08](08-record-of-processing-activities.md)); en particular el interés legítimo de los registros de seguridad (requiere ponderación documentada) y la base del bloqueo.
- **Tratamiento de datos de categorías especiales** que el candidato incluya *voluntariamente* en el CV: el formulario no los pide y desaconseja incluirlos, pero pueden llegar. ¿Basta art. 9.2.e (datos hechos manifiestamente públicos por el interesado)? Probablemente **no** es aplicable a un CV enviado a una empresa concreta; valorar art. 9.2.b o la supresión/ignorancia de esos datos. [04](04-recruitment-discrimination-risks.md)
- **Notas internas**: derecho de acceso del candidato a valoraciones subjetivas (AEPD, guía de relaciones laborales, III.1, cita STS 31/10/2000).
- **Uso de WhatsApp** por el negocio para contactar candidatos (el panel ofrece el enlace `wa.me`): decisión del negocio como responsable; implica un proveedor (Meta) que no es subencargado de Fíchame.
- **Contratación**: Fíchame no es un sistema de gestión de personal. ¿Debe informarse al negocio de que los datos del contratado se trasladen a su sistema de RR. HH. y se borren de Fíchame?
- **Cierre de cuenta**: política de devolución/supresión (art. 28.3.g) antes de automatizar (`npm run delete-account` existe pero exige decisión).
- **Comunicaciones comerciales** de Fíchame a negocios: hoy **no existen**. Si se crean, aplicar art. 21 LSSI y base jurídica adecuada.
- **Facturación**: hoy **no existe** en el código. Cuando exista: obligaciones fiscales/mercantiles de conservación (6 años Código de Comercio art. 30; 4 años LGT — verificar), datos mínimos.
- **Términos 2026-11-02-precios** (§6 reescrito): prueba gratuita de 30 días por negocio, plan Fundadores (precio bloqueado 12 meses, primeros 50 negocios) y plan Profesional mensual/anual, todo «IVA no incluido»; valores en `src/lib/pricing.js`. Revisar: información precontractual de precios a negocios (y a autónomos que puedan tener la condición de consumidor), la redacción del bloqueo de 12 meses y el paso posterior al precio público, y la cláusula sobre el futuro proveedor de pagos (aún no hay cobro ni datos de pago).
- **Términos 2026-10-08** (precio futuro, limitación de responsabilidad, indemnidad, baja, cambios): revisar en particular el tope de 100 € en servicio gratuito, la validez de la indemnidad frente a negocios pequeños/autónomos y el preaviso de 30 días. El apartado 11 promete pedir aceptación expresa de versiones nuevas: desde la migration 0010 el panel avisa y pide aceptar en `/panel/terminos` (sin bloquear el panel) y cada aceptación queda en `terms_acceptances`. **Falta el aviso por email** que también promete el apartado 11 (hay que enviarlo a mano o automatizarlo cuando haya SMTP), y decidir el plazo de conservación de ese histórico.
- **Seguros** (responsabilidad civil / ciberriesgo), **actividad empresarial** (alta censal, IAE), **contratación con clientes** (condiciones generales, consumidores si hay autónomos), **reclamaciones**.
- **Legislación laboral** aplicable a la selección: Estatuto de los Trabajadores, LISOS (art. 16.1.c: infracción muy grave por solicitar datos discriminatorios en procesos de selección), Ley 15/2022 integral para la igualdad de trato, Ley Orgánica 3/2007 de igualdad efectiva.
- **IA**: cualquier funcionalidad futura (ver [05](05-ai-recruitment-risk.md)).

## C. Lo que sí está resuelto técnicamente (sujeto a revisión)

Ver la matriz final en el [informe de auditoría](../security/production-compliance-gate.md). Cada elemento allí marcado como *TECHNICALLY ADDRESSED* lo está **solo en el plano técnico**.

## D. Supuestos asumidos en esta auditoría

1. El operador de Fíchame es una persona o sociedad establecida en España — **confirmado** por el titular el 2026-10-08: Granada. Fuero de los términos: Granada (B2B); no hace falta representante en la UE (art. 27 RGPD).
2. Los negocios clientes son empleadores que seleccionan personal **para sí mismos**.
3. Fíchame no cobra a candidatos ni les ofrece servicios (verificado en el código: no hay cuentas de candidato).
4. No hay otros entornos (producción en Vercel) con datos distintos de los observados; la base Supabase conectada contiene datos de prueba y al menos un negocio real.
5. Actualización 2026-11-04: no existen marketing ni IA. Sí existen métricas internas pseudónimas (panel NexForge, `/privacidad#metricas`) y facturación con Stripe, que solo funciona con las claves configuradas; el lanzamiento es solo con prueba gratuita y la facturación desactivada.
