const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Bulk API',
      version: '1.0.0',
      description:
        'API REST para envío masivo de mensajes de WhatsApp. ' +
        'Multiusuario: cada usuario gestiona su propia sesión con una API Key. ' +
        '**Primero registra un usuario, luego usa su `api_key` en el header `x-api-key` para el resto de endpoints.**',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Servidor local' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API Key obtenida al registrar un usuario',
        },
      },
      schemas: {
        // ── Usuarios ──────────────────────────────────────────
        RegistrarUsuarioRequest: {
          type: 'object',
          required: ['nombre'],
          properties: {
            nombre: { type: 'string', example: 'Juan Pérez' },
          },
        },
        UsuarioResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: true },
            mensaje: { type: 'string', example: 'Usuario creado exitosamente.' },
            datos: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'uuid-del-usuario' },
                nombre: { type: 'string', example: 'Juan Pérez' },
                api_key: { type: 'string', example: 'uuid-api-key' },
              },
            },
          },
        },
        // ── Estado ───────────────────────────────────────────
        EstadoResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean' },
            datos: {
              type: 'object',
              properties: {
                estado: {
                  type: 'string',
                  enum: ['desconectado', 'conectando', 'qr', 'conectado', 'reconectando', 'error'],
                },
                usuario: { type: 'string', nullable: true, example: 'Juan' },
                numero: { type: 'string', nullable: true, example: '51987654321@s.whatsapp.net' },
                tieneQR: { type: 'boolean' },
                mensaje: { type: 'string', example: '✅ Conectado y listo' },
              },
            },
          },
        },
        QRResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean' },
            datos: {
              type: 'object',
              properties: {
                estado: { type: 'string', example: 'qr_disponible' },
                mensaje: { type: 'string', example: 'Escanea este QR con WhatsApp para conectar' },
                qr: {
                  type: 'string',
                  nullable: true,
                  description: 'Imagen QR en formato base64 (data:image/png;base64,...). Úsala directamente en un `<img src="">`',
                  example: 'data:image/png;base64,iVBORw...',
                },
              },
            },
          },
        },
        // ── Mensajes ─────────────────────────────────────────
        EnviarTextoRequest: {
          type: 'object',
          required: ['phone', 'text'],
          properties: {
            phone: { type: 'string', description: 'Número con código de país, sin +', example: '51987654321' },
            text: { type: 'string', example: 'Hola, este es un mensaje de prueba' },
            type: { type: 'string', enum: ['texto'], default: 'texto' },
          },
        },
        EnviarImagenRequest: {
          type: 'object',
          required: ['phone', 'type', 'file_url'],
          properties: {
            phone: { type: 'string', example: '51987654321' },
            type: { type: 'string', enum: ['imagen'], example: 'imagen' },
            file_url: { type: 'string', example: 'http://localhost:3000/uploads/1711234567-imagen.jpg' },
            text: { type: 'string', description: 'Caption opcional', example: 'Mira esta imagen' },
          },
        },
        EnviarDocumentoRequest: {
          type: 'object',
          required: ['phone', 'type', 'file_url'],
          properties: {
            phone: { type: 'string', example: '51987654321' },
            type: { type: 'string', enum: ['documento'], example: 'documento' },
            file_url: { type: 'string', example: 'http://localhost:3000/uploads/1711234567-factura.pdf' },
            filename: { type: 'string', example: 'Factura_F001-00234.pdf' },
            mime_type: { type: 'string', example: 'application/pdf' },
            text: { type: 'string', description: 'Caption opcional', example: 'Adjuntamos tu factura' },
          },
        },
        MensajeEnviadoResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: true },
            mensaje: { type: 'string', example: 'Mensaje enviado exitosamente' },
            datos: {
              type: 'object',
              properties: {
                message_id: { type: 'string', example: 'uuid-del-mensaje' },
                telefono: { type: 'string', example: '51987654321' },
                tipo: { type: 'string', example: 'texto' },
                enviado_en: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        // ── Bulk / Campañas ───────────────────────────────────
        EnviarBulkRequest: {
          type: 'object',
          required: ['campaign_name', 'messages'],
          properties: {
            campaign_name: { type: 'string', example: 'Promo Junio' },
            delay_ms: { type: 'integer', default: 3000, description: 'Delay mínimo entre mensajes en ms (mínimo 1000)', example: 3000 },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                required: ['phone', 'text'],
                properties: {
                  phone: { type: 'string', example: '51987654321' },
                  text: { type: 'string', example: 'Hola {nombre}, tu descuento es {descuento}%' },
                  type: { type: 'string', enum: ['texto', 'imagen', 'documento'], default: 'texto' },
                  file_url: { type: 'string', description: 'Requerido si type es imagen o documento' },
                  filename: { type: 'string', description: 'Solo para documentos' },
                  mime_type: { type: 'string', description: 'Solo para documentos' },
                  nombre: { type: 'string', description: 'Variable dinámica de ejemplo para reemplazar {nombre}', example: 'Juan' },
                  descuento: { type: 'string', description: 'Variable dinámica de ejemplo para reemplazar {descuento}', example: '20' },
                },
              },
              example: [
                { phone: '51987654321', text: 'Hola {nombre}, tu descuento es {descuento}%', nombre: 'Juan', descuento: '20' },
                { phone: '51912345678', text: 'Hola {nombre}, tu descuento es {descuento}%', nombre: 'María', descuento: '30' },
              ],
            },
          },
        },
        CampañaCreadaResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: true },
            mensaje: { type: 'string', example: 'Campaña creada y en cola de procesamiento' },
            datos: {
              type: 'object',
              properties: {
                campaign_id: { type: 'string', example: 'uuid-de-campaña' },
                nombre: { type: 'string', example: 'Promo Junio' },
                total_mensajes: { type: 'integer', example: 2 },
                delay_ms: { type: 'integer', example: 3000 },
                estado: { type: 'string', example: 'pendiente' },
                progreso_url: { type: 'string', example: '/api/campaigns/uuid-de-campaña' },
              },
            },
          },
        },
        CampañaDetalleResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean' },
            datos: {
              type: 'object',
              properties: {
                campaña: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    nombre: { type: 'string' },
                    estado: {
                      type: 'string',
                      enum: ['pendiente', 'en_proceso', 'completada', 'completada_con_errores', 'cancelada', 'error'],
                    },
                    total_mensajes: { type: 'integer' },
                    enviados: { type: 'integer' },
                    fallidos: { type: 'integer' },
                    pendientes: { type: 'integer' },
                    procesando_ahora: { type: 'boolean' },
                    estadisticas: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        enviados: { type: 'integer' },
                        fallidos: { type: 'integer' },
                        pendientes: { type: 'integer' },
                        porcentaje_completado: { type: 'integer' },
                      },
                    },
                  },
                },
                mensajes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      telefono: { type: 'string' },
                      texto: { type: 'string', nullable: true },
                      tipo: { type: 'string' },
                      estado: { type: 'string', enum: ['pendiente', 'enviado', 'fallido'] },
                      error: { type: 'string', nullable: true },
                      intentos: { type: 'integer' },
                      enviado_en: { type: 'string', format: 'date-time', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        // ── Upload ────────────────────────────────────────────
        UploadResponse: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: true },
            datos: {
              type: 'object',
              properties: {
                filename: { type: 'string', example: '1711234567890-imagen.jpg' },
                originalname: { type: 'string', example: 'mi-foto.jpg' },
                mimetype: { type: 'string', example: 'image/jpeg' },
                size: { type: 'integer', example: 204800 },
                url: { type: 'string', example: 'http://localhost:3000/uploads/1711234567890-imagen.jpg' },
              },
            },
          },
        },
        // ── Errores ───────────────────────────────────────────
        Error401: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Se requiere API Key. Envía el header "x-api-key"' },
          },
        },
        Error403: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: false },
            error: { type: 'string', example: 'API Key inválida' },
          },
        },
        Error503: {
          type: 'object',
          properties: {
            exito: { type: 'boolean', example: false },
            error: { type: 'string', example: 'WhatsApp no está conectado. Escanea el QR primero.' },
          },
        },
      },
    },
    tags: [
      { name: 'Usuarios', description: 'Registro y gestión de usuarios (sin autenticación)' },
      { name: 'Conexión', description: 'Estado y QR de WhatsApp (requiere API Key)' },
      { name: 'Mensajes', description: 'Envío y listado de mensajes (requiere API Key)' },
      { name: 'Campañas', description: 'Envío masivo y gestión de campañas (requiere API Key)' },
      { name: 'Reportes', description: 'Estadísticas y análisis de actividad (requiere API Key)' },
    ],
    paths: {
      // ── USUARIOS ─────────────────────────────────────────────
      '/api/users/register': {
        post: {
          tags: ['Usuarios'],
          summary: 'Registrar un nuevo usuario',
          description: 'Crea un usuario y devuelve la `api_key` que debes usar en todos los demás endpoints como header `x-api-key`.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegistrarUsuarioRequest' } } },
          },
          responses: {
            201: { description: 'Usuario creado exitosamente', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsuarioResponse' } } } },
            400: { description: 'Falta el campo "nombre"' },
            500: { description: 'Error interno' },
          },
        },
      },
      '/api/users': {
        get: {
          tags: ['Usuarios'],
          summary: 'Listar todos los usuarios',
          responses: {
            200: {
              description: 'Lista de usuarios',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      exito: { type: 'boolean' },
                      datos: { type: 'array', items: { $ref: '#/components/schemas/UsuarioResponse/properties/datos' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/users/{id}': {
        delete: {
          tags: ['Usuarios'],
          summary: 'Eliminar un usuario',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID del usuario' }],
          responses: {
            200: { description: 'Usuario eliminado' },
            404: { description: 'Usuario no encontrado' },
          },
        },
      },
      // ── CONEXIÓN ─────────────────────────────────────────────
      '/api/status': {
        get: {
          tags: ['Conexión'],
          summary: 'Estado de la conexión WhatsApp',
          description: 'Devuelve el estado actual de tu sesión WhatsApp: desconectado, conectando, qr, conectado, etc.',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: { description: 'Estado actual', content: { 'application/json': { schema: { $ref: '#/components/schemas/EstadoResponse' } } } },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
            403: { description: 'API Key inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error403' } } } },
          },
        },
      },
      '/api/qr': {
        get: {
          tags: ['Conexión'],
          summary: 'Obtener QR para vincular WhatsApp',
          description: 'Devuelve el QR en base64. Si ya estás conectado, devuelve `estado: conectado`. Si el QR no está listo, espera unos segundos y vuelve a intentar.',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: { description: 'QR disponible o ya conectado', content: { 'application/json': { schema: { $ref: '#/components/schemas/QRResponse' } } } },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
            403: { description: 'API Key inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error403' } } } },
          },
        },
      },
      '/api/disconnect': {
        post: {
          tags: ['Conexión'],
          summary: 'Cerrar sesión de WhatsApp',
          description: 'Desconecta la sesión WhatsApp activa. Deberás escanear el QR de nuevo para volver a conectar.',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: { description: 'Desconectado exitosamente' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      // ── MENSAJES ─────────────────────────────────────────────
      '/api/upload': {
        post: {
          tags: ['Mensajes'],
          summary: 'Subir un archivo al servidor',
          description: 'Sube una imagen, PDF, documento Office, video o audio. Devuelve la URL que usarás en `/api/send/single` o `/api/send/bulk`.',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary', description: 'Archivo a subir (máx 50MB)' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Archivo subido', content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadResponse' } } } },
            400: { description: 'No se recibió archivo o tipo no permitido' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/send/single': {
        post: {
          tags: ['Mensajes'],
          summary: 'Enviar mensaje individual',
          description: `Envía un mensaje a un único número. Soporta tres tipos:
- **texto**: solo requiere \`phone\` y \`text\`
- **imagen**: requiere \`phone\`, \`type: "imagen"\` y \`file_url\`
- **documento**: requiere \`phone\`, \`type: "documento"\` y \`file_url\``,
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/EnviarTextoRequest' },
                    { $ref: '#/components/schemas/EnviarImagenRequest' },
                    { $ref: '#/components/schemas/EnviarDocumentoRequest' },
                  ],
                },
                examples: {
                  texto: {
                    summary: 'Mensaje de texto',
                    value: { phone: '51987654321', text: 'Hola, este es un mensaje de prueba' },
                  },
                  imagen: {
                    summary: 'Mensaje con imagen',
                    value: { phone: '51987654321', type: 'imagen', file_url: 'http://localhost:3000/uploads/imagen.jpg', text: 'Mira esta imagen' },
                  },
                  documento: {
                    summary: 'Mensaje con documento',
                    value: { phone: '51987654321', type: 'documento', file_url: 'http://localhost:3000/uploads/factura.pdf', filename: 'Factura.pdf', mime_type: 'application/pdf', text: 'Adjunto tu factura' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Mensaje enviado', content: { 'application/json': { schema: { $ref: '#/components/schemas/MensajeEnviadoResponse' } } } },
            400: { description: 'Faltan campos requeridos' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
            503: { description: 'WhatsApp no conectado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error503' } } } },
          },
        },
      },
      // ── LISTADO DE MENSAJES ───────────────────────────────────
      '/api/messages': {
        get: {
          tags: ['Mensajes'],
          summary: 'Listar todos los mensajes enviados',
          description: 'Devuelve todos los mensajes del usuario con filtros opcionales y paginación.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'estado', in: 'query', schema: { type: 'string', enum: ['pendiente', 'enviado', 'fallido'] }, description: 'Filtrar por estado' },
            { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['texto', 'imagen', 'documento'] }, description: 'Filtrar por tipo de mensaje' },
            { name: 'campaign_id', in: 'query', schema: { type: 'string' }, description: 'Filtrar por campaña' },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Página (empieza en 1)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Resultados por página (máx 200)' },
          ],
          responses: {
            200: {
              description: 'Lista paginada de mensajes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      exito: { type: 'boolean' },
                      datos: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer', example: 342 },
                          pagina: { type: 'integer', example: 1 },
                          total_paginas: { type: 'integer', example: 7 },
                          por_pagina: { type: 'integer', example: 50 },
                          mensajes: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                user_id: { type: 'string' },
                                campaign_id: { type: 'string', nullable: true },
                                telefono: { type: 'string' },
                                texto: { type: 'string', nullable: true },
                                tipo: { type: 'string' },
                                archivo_url: { type: 'string', nullable: true },
                                estado: { type: 'string' },
                                error_detalle: { type: 'string', nullable: true },
                                intentos: { type: 'integer' },
                                enviado_en: { type: 'string', format: 'date-time', nullable: true },
                                created_at: { type: 'string', format: 'date-time' },
                                updated_at: { type: 'string', format: 'date-time' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      // ── CAMPAÑAS ─────────────────────────────────────────────
      '/api/send/bulk': {
        post: {
          tags: ['Campañas'],
          summary: 'Crear campaña de envío masivo',
          description: `Crea una campaña y la pone en cola. Los mensajes se envían en segundo plano con delays aleatorios para evitar bloqueos de WhatsApp.

**Variables dinámicas**: usa \`{variable}\` en el campo \`text\` y pasa el valor como campo extra en cada mensaje. Ej: \`"text": "Hola {nombre}"\` con \`"nombre": "Juan"\`.`,
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/EnviarBulkRequest' } } },
          },
          responses: {
            202: { description: 'Campaña creada y en cola', content: { 'application/json': { schema: { $ref: '#/components/schemas/CampañaCreadaResponse' } } } },
            400: { description: 'Datos inválidos' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
            503: { description: 'WhatsApp no conectado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error503' } } } },
          },
        },
      },
      '/api/campaigns': {
        get: {
          tags: ['Campañas'],
          summary: 'Listar campañas masivas',
          description: 'Devuelve el historial de campañas del usuario. Por defecto solo muestra campañas masivas (`tipo=masivo`). Los mensajes individuales enviados con `/api/send/single` se consultan con `?tipo=individual` o directamente en `/api/messages`.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: 'tipo',
              in: 'query',
              schema: { type: 'string', enum: ['masivo', 'individual'], default: 'masivo' },
              description: '`masivo` = campañas bulk reales | `individual` = mensajes únicos enviados con /send/single',
            },
          ],
          responses: {
            200: {
              description: 'Lista de campañas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      exito: { type: 'boolean' },
                      datos: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          colas_activas: { type: 'array', items: { type: 'string' } },
                          campañas: { type: 'array', items: { type: 'object' } },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/campaigns/{id}': {
        get: {
          tags: ['Campañas'],
          summary: 'Detalle y progreso de una campaña',
          description: 'Devuelve el estado detallado de la campaña incluyendo estadísticas y el listado de todos sus mensajes con sus estados individuales.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID de la campaña (campaign_id)' }],
          responses: {
            200: { description: 'Detalle de campaña', content: { 'application/json': { schema: { $ref: '#/components/schemas/CampañaDetalleResponse' } } } },
            404: { description: 'Campaña no encontrada' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
        delete: {
          tags: ['Campañas'],
          summary: 'Eliminar una campaña del historial',
          description: 'Marca la campaña como eliminada. No se puede eliminar una campaña que esté actualmente en proceso.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID de la campaña' }],
          responses: {
            200: { description: 'Campaña eliminada' },
            400: { description: 'La campaña está activa, cancélala primero' },
            404: { description: 'Campaña no encontrada' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      // ── REPORTES ──────────────────────────────────────────────
      '/api/reports/daily': {
        get: {
          tags: ['Reportes'],
          summary: 'Mensajes por día (últimos N días)',
          description: 'Devuelve la cantidad de mensajes enviados, fallidos y pendientes agrupados por día. Los días sin actividad aparecen con ceros.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'dias', in: 'query', schema: { type: 'integer', default: 5 }, description: 'Cuántos días atrás consultar (máx 90)' },
          ],
          responses: {
            200: {
              description: 'Reporte diario',
              content: {
                'application/json': {
                  example: {
                    exito: true,
                    datos: {
                      periodo_dias: 5,
                      desde: '2026-06-13',
                      hasta: '2026-06-17',
                      por_dia: [
                        { fecha: '2026-06-13', total: 45, enviados: 43, fallidos: 2, pendientes: 0 },
                        { fecha: '2026-06-14', total: 0,  enviados: 0,  fallidos: 0, pendientes: 0 },
                        { fecha: '2026-06-15', total: 120, enviados: 118, fallidos: 2, pendientes: 0 },
                        { fecha: '2026-06-16', total: 30, enviados: 28, fallidos: 2, pendientes: 0 },
                        { fecha: '2026-06-17', total: 15, enviados: 14, fallidos: 0, pendientes: 1 },
                      ],
                      totales: { total: 210, enviados: 203, fallidos: 6, pendientes: 1 },
                    },
                  },
                },
              },
            },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/reports/summary': {
        get: {
          tags: ['Reportes'],
          summary: 'Resumen general de la cuenta',
          description: 'Totales globales de mensajes y campañas del usuario: tasa de éxito, desglose por tipo, estado de campañas.',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: {
              description: 'Resumen general',
              content: {
                'application/json': {
                  example: {
                    exito: true,
                    datos: {
                      mensajes: {
                        total: 1540,
                        enviados: 1498,
                        fallidos: 32,
                        pendientes: 10,
                        tasa_exito: 97,
                        por_tipo: { texto: 1200, imagen: 250, documento: 90 },
                      },
                      campanas: {
                        total: 28,
                        completadas: 24,
                        con_errores: 2,
                        canceladas: 1,
                        en_proceso: 1,
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/reports/top-campaigns': {
        get: {
          tags: ['Reportes'],
          summary: 'Top campañas por volumen de mensajes',
          description: 'Lista las campañas con más mensajes, incluyendo tasa de éxito individual.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Cuántas campañas mostrar (máx 50)' },
          ],
          responses: {
            200: { description: 'Top campañas' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/reports/failed': {
        get: {
          tags: ['Reportes'],
          summary: 'Mensajes fallidos recientes',
          description: 'Lista los mensajes que fallaron en los últimos N días, con los errores más frecuentes agrupados.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'dias', in: 'query', schema: { type: 'integer', default: 7 }, description: 'Período a consultar (máx 30)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Máximo de mensajes a devolver (máx 200)' },
          ],
          responses: {
            200: {
              description: 'Mensajes fallidos',
              content: {
                'application/json': {
                  example: {
                    exito: true,
                    datos: {
                      total_fallidos: 5,
                      periodo_dias: 7,
                      errores_frecuentes: [
                        { error: 'WhatsApp no está conectado', cantidad: 3 },
                        { error: 'Connection Closed', cantidad: 2 },
                      ],
                      mensajes: [],
                    },
                  },
                },
              },
            },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
      '/api/campaigns/{id}/cancel': {
        post: {
          tags: ['Campañas'],
          summary: 'Cancelar una campaña activa',
          description: 'Envía una señal de cancelación. El proceso se detendrá en el próximo mensaje de la cola.',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID de la campaña' }],
          responses: {
            200: { description: 'Cancelación enviada' },
            400: { description: 'La campaña no está activa' },
            404: { description: 'Campaña no encontrada' },
            401: { description: 'Sin API Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
