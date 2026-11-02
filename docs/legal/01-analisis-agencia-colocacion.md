# 01 — ¿Es Fíchame una agencia de colocación?

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL.** LEGAL REVIEW REQUIRED.
> Conclusión adelantada: **existe un riesgo real de encuadramiento que no puede descartarse sin un asesor laboral**. Este documento no lo oculta ni propone cambiar el producto para eludir una obligación.

## 1. Hechos relevantes del producto (verificados en el código, 2026-10-06)

| Hecho | Evidencia |
|---|---|
| Cada negocio registra una cuenta y obtiene una página propia `/r/:slug`. | `src/routes/auth.js`, `src/routes/public.js` |
| El acceso físico es un código QR colocado **por el propio negocio** en su local (o el enlace que el negocio comparte). | `README.md`, `/panel/qr` |
| El candidato se dirige a **un negocio concreto** y envía datos + CV **a ese negocio**. | `submit_application` (migración 0005) |
| No hay cuentas de candidato, ni búsqueda de empleo, ni listado de ofertas de varios negocios, ni directorio público de negocios. | No existen rutas de ese tipo |
| No hay base de candidatos compartida: los datos de cada negocio están aislados (aplicación + FKs compuestas en BD). | `migrations/0005`, `test/db.js`, `test/smoke.js` |
| Fíchame **no** busca candidatos, **no** recomienda, **no** puntúa, **no** preselecciona, **no** presenta candidatos a negocios. | Sin código de ranking/IA |
| El negocio decide todo el proceso (estados, notas, contacto, contratación). | `src/routes/panel.js` |
| Modelo de ingresos: **no definido en el código** (no hay facturación). | — |
| Los candidatos no pagan nada. | — |

## 2. Normas aplicables (texto oficial consultado en BOE)

- **Ley 3/2023, de 28 de febrero, de Empleo** (BOE-A-2023-5365):
  - Art. 3.c) — definición de *intermediación laboral*: «conjunto de acciones destinadas a proporcionar a las personas trabajadoras un empleo adecuado a sus características y facilitar a las entidades empleadoras las personas trabajadoras más apropiadas a sus requerimientos y necesidades…». Incluye «actividades de prospección y captación de ofertas de empleo, puesta en contacto y colocación, recolocación y selección de personas trabajadoras».
  - Art. 40.2 — la intermediación puede comprender: a) prospección y captación de ofertas; **b) «la puesta en contacto de ofertas de trabajo con personas que buscan un empleo, para su colocación o recolocación»**; c) la selección; d) apoyos a colectivos prioritarios.
  - Art. 40.4 — la **selección de personal** se considera colocación especializada.
  - Art. 41 — agentes de la intermediación: servicios públicos de empleo, **agencias de colocación** y otros que se determinen.
  - Art. 42 — carácter de servicio público; **gratuidad** para las personas trabajadoras.
  - Art. 43 — agencias de colocación: entidades que realicen actividades de intermediación; **declaración responsable** ante el servicio público de empleo de la comunidad autónoma del establecimiento principal; obligaciones (información, intimidad y dignidad, protección de datos, gratuidad, accesibilidad, igualdad y no discriminación).
  - Art. 45 — la selección de personal la realizan los servicios públicos o las agencias de colocación, con igualdad y no discriminación.
  - Art. 5.a) — principios de igualdad y no discriminación en el acceso al empleo.
- **RD 1796/2010**, de 30 de diciembre, por el que se regulan las agencias de colocación (BOE-A-2010-20151): contempla agencias que actúan **exclusivamente por medios electrónicos** (consulta del texto consolidado; *verificar redacción literal y vigencia tras la Ley 3/2023*).

## 3. Interpretación conservadora

**Argumento a favor del encuadramiento.** La definición es funcional y amplia. Fíchame «facilita a las entidades empleadoras» la recepción de candidaturas y pone «en contacto» a personas que buscan empleo con ofertas de un empleador. Operar solo por medios electrónicos no excluye la condición de agencia (RD 1796/2010). La Ley no contiene una exclusión expresa para software o «portales» (no encontrada en arts. 40-43).

**Argumento en contra.** Fíchame se comporta como una **herramienta del propio empleador** (similar a un formulario de empleo en la web del negocio o a un ATS — *applicant tracking system*): no capta ofertas, no busca candidatos, no selecciona, no pone en contacto a un candidato con *varios* empleadores ni a un empleador con candidatos que no se hayan dirigido a él. El canal de entrada (código QR o enlace) lo coloca y controla el empleador, y el candidato se dirige a él directamente. La actividad de «intermediar» implica típicamente un tercero que media entre oferta y demanda; aquí la relación es directa candidato→empleador y Fíchame actúa como encargado del tratamiento siguiendo instrucciones del empleador (la AEPD describe a las agencias contratadas por una empresa como encargadas, guía «La protección de datos en las relaciones laborales», III.4, lo que muestra que ambos papeles pueden coexistir).

**Conclusión técnica conservadora:** con el diseño actual el riesgo parece **moderado**, pero **no puede afirmarse que no exista**. Corresponde a un asesor laboral.

## 4. Factores que pueden llevar al encuadramiento

- Que Fíchame preste servicios **a los candidatos** (perfil, búsqueda de ofertas, alertas).
- Que exista un **directorio o buscador** de negocios u ofertas.
- Cualquier **base de candidatos compartida** o «reutilizable» entre negocios.
- **Recomendaciones, matching, ranking o preselección** (con o sin IA).
- Que Fíchame **contacte** con candidatos o **presente** candidatos a negocios.
- Publicidad dirigida a **personas que buscan empleo** («encuentra trabajo con Fíchame»).
- Cobro al negocio **por candidato contratado** o por candidato presentado (en vez de por uso de software).
- Difusión de ofertas fuera de la página propia del negocio (multiposting).

## 5. Factores que pueden alejarlo

- Herramienta usada por el empleador para **sus propios** procesos, con datos aislados por empleador.
- El empleador coloca el punto de entrada y decide todo.
- Sin intervención de Fíchame en la selección ni en el contacto.
- Precio por suscripción de software, no por resultado.
- Comunicación del producto dirigida a negocios, no a demandantes de empleo.

## 6. Funcionalidades que aumentarían el riesgo (no implementar sin análisis)

Pool global de CV, «candidatos sugeridos», búsqueda de candidatos por los negocios fuera de sus propias candidaturas, app o cuenta de candidato, mapa/listado de negocios que contratan, alertas de empleo, matching/IA, cobro por contratación.

## 7. Funcionalidades que reducirían el riesgo (ya implementadas)

Aislamiento estricto por negocio (aplicación, BD y Storage), sin cuentas de candidato, sin ranking ni filtros automáticos, consentimiento de futuras oportunidades **limitado al mismo negocio**, términos que dicen que Fíchame no selecciona ni promete empleo.

## 8. Preguntas para el asesor laboral

1. ¿La actividad descrita en §1 es «intermediación laboral» en el sentido del art. 40 Ley 3/2023, en particular «puesta en contacto» (art. 40.2.b)?
2. ¿Cambia la respuesta según el modelo de precio (suscripción vs. por candidatura/contratación)?
3. ¿Afecta que el punto de entrada sea físico y del empleador (código QR en su local)?
4. Si fuese agencia: ¿qué servicio público de empleo es competente, qué datos hay que comunicar (art. 43; RD 1796/2010, art. 5) y qué implica para el diseño (gratuidad, accesibilidad, igualdad)?
5. ¿Qué funcionalidades del §6 cruzarían la línea?
6. ¿Es aplicable algún criterio administrativo o jurisprudencial sobre plataformas/ATS? (*No verificado en esta auditoría.*)

## 9. Acción recomendada antes de comercializar

1. **PRODUCTION BLOCKER** hasta obtener dictamen escrito de un asesor laboral sobre las preguntas 1-5.
2. Si el dictamen concluye que es agencia: presentar declaración responsable **antes** de operar y adaptar producto y documentación; **no** rediseñar el producto solo para eludir la obligación.
3. Mantener congeladas las funcionalidades del §6 hasta el dictamen.
