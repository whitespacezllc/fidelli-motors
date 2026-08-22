export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cambios_override_plan: {
        Row: {
          cambiado_por: string
          created_at: string
          id: string
          lubricentro_id: string
          motivo: string
          overrides_antes: Json
          overrides_despues: Json
        }
        Insert: {
          cambiado_por: string
          created_at?: string
          id?: string
          lubricentro_id: string
          motivo: string
          overrides_antes: Json
          overrides_despues: Json
        }
        Update: {
          cambiado_por?: string
          created_at?: string
          id?: string
          lubricentro_id?: string
          motivo?: string
          overrides_antes?: Json
          overrides_despues?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cambios_override_plan_cambiado_por_fkey"
            columns: ["cambiado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_override_plan_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      canjes: {
        Row: {
          created_at: string
          id: string
          lubricentro_id: string
          premio_id: string
          service_id: string | null
          vehiculo_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lubricentro_id: string
          premio_id: string
          service_id?: string | null
          vehiculo_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lubricentro_id?: string
          premio_id?: string
          service_id?: string | null
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canjes_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_premio_id_fkey"
            columns: ["premio_id"]
            isOneToOne: false
            referencedRelation: "premios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "vista_proximos_service"
            referencedColumns: ["ultimo_service_id"]
          },
          {
            foreignKeyName: "canjes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canjes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string
          cuit: string | null
          email: string | null
          id: string
          lubricentro_id: string
          nombre: string
          telefono: string
        }
        Insert: {
          created_at?: string
          cuit?: string | null
          email?: string | null
          id?: string
          lubricentro_id: string
          nombre: string
          telefono: string
        }
        Update: {
          created_at?: string
          cuit?: string | null
          email?: string | null
          id?: string
          lubricentro_id?: string
          nombre?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      config_experiencia: {
        Row: {
          campos_visibles: Json
          color_carton: string | null
          color_fondo: string | null
          color_primario: string
          datos_contacto: Json
          logo_url: string | null
          lubricentro_id: string
          updated_at: string
        }
        Insert: {
          campos_visibles?: Json
          color_carton?: string | null
          color_fondo?: string | null
          color_primario?: string
          datos_contacto?: Json
          logo_url?: string | null
          lubricentro_id: string
          updated_at?: string
        }
        Update: {
          campos_visibles?: Json
          color_carton?: string | null
          color_fondo?: string | null
          color_primario?: string
          datos_contacto?: Json
          logo_url?: string | null
          lubricentro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_experiencia_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: true
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      contactos: {
        Row: {
          canal: Database["public"]["Enums"]["canal_contacto"]
          created_at: string
          estado: Database["public"]["Enums"]["estado_contacto"]
          id: string
          lubricentro_id: string
          usuario_id: string
          vehiculo_id: string
        }
        Insert: {
          canal?: Database["public"]["Enums"]["canal_contacto"]
          created_at?: string
          estado: Database["public"]["Enums"]["estado_contacto"]
          id?: string
          lubricentro_id: string
          usuario_id: string
          vehiculo_id: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_contacto"]
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_contacto"]
          id?: string
          lubricentro_id?: string
          usuario_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contactos_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      contactos_fidelli: {
        Row: {
          canal: Database["public"]["Enums"]["canal_contacto"]
          created_at: string
          id: string
          lubricentro_id: string
          motivo: Database["public"]["Enums"]["motivo_contacto_fidelli"]
          usuario_id: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_contacto"]
          created_at?: string
          id?: string
          lubricentro_id: string
          motivo: Database["public"]["Enums"]["motivo_contacto_fidelli"]
          usuario_id: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_contacto"]
          created_at?: string
          id?: string
          lubricentro_id?: string
          motivo?: Database["public"]["Enums"]["motivo_contacto_fidelli"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contactos_fidelli_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_fidelli_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      correcciones_patente: {
        Row: {
          corregido_por: string
          created_at: string
          id: string
          lubricentro_id: string
          motivo: string
          patente_anterior: string
          patente_nueva: string
          vehiculo_id: string
        }
        Insert: {
          corregido_por: string
          created_at?: string
          id?: string
          lubricentro_id: string
          motivo: string
          patente_anterior: string
          patente_nueva: string
          vehiculo_id: string
        }
        Update: {
          corregido_por?: string
          created_at?: string
          id?: string
          lubricentro_id?: string
          motivo?: string
          patente_anterior?: string
          patente_nueva?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correcciones_patente_corregido_por_fkey"
            columns: ["corregido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correcciones_patente_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correcciones_patente_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correcciones_patente_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_busquedas: {
        Row: {
          created_at: string
          encontrada: boolean
          id: string
          lubricentro_id: string
          patente: string
        }
        Insert: {
          created_at?: string
          encontrada: boolean
          id?: string
          lubricentro_id: string
          patente: string
        }
        Update: {
          created_at?: string
          encontrada?: boolean
          id?: string
          lubricentro_id?: string
          patente?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_busquedas_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      lubricentros: {
        Row: {
          activo: boolean
          calcos_entregadas: number
          created_at: string
          id: string
          nombre: string
          plan_overrides: Json
          slug: string
        }
        Insert: {
          activo?: boolean
          calcos_entregadas?: number
          created_at?: string
          id?: string
          nombre: string
          plan_overrides?: Json
          slug: string
        }
        Update: {
          activo?: boolean
          calcos_entregadas?: number
          created_at?: string
          id?: string
          nombre?: string
          plan_overrides?: Json
          slug?: string
        }
        Relationships: []
      }
      mensaje_templates: {
        Row: {
          activo: boolean
          contenido: string
          created_at: string
          id: string
          lubricentro_id: string
          tono: string
        }
        Insert: {
          activo?: boolean
          contenido: string
          created_at?: string
          id?: string
          lubricentro_id: string
          tono: string
        }
        Update: {
          activo?: boolean
          contenido?: string
          created_at?: string
          id?: string
          lubricentro_id?: string
          tono?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensaje_templates_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_vehiculo: {
        Row: {
          contenido: string
          created_at: string
          id: string
          lubricentro_id: string
          updated_at: string
          usuario_id: string
          vehiculo_id: string
          visible_cliente: boolean
        }
        Insert: {
          contenido: string
          created_at?: string
          id?: string
          lubricentro_id: string
          updated_at?: string
          usuario_id: string
          vehiculo_id: string
          visible_cliente?: boolean
        }
        Update: {
          contenido?: string
          created_at?: string
          id?: string
          lubricentro_id?: string
          updated_at?: string
          usuario_id?: string
          vehiculo_id?: string
          visible_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notas_vehiculo_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_vehiculo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_vehiculo_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_vehiculo_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          created_at: string
          fecha_pago: string
          id: string
          lubricentro_id: string
          monto: number
          periodo_desde: string
          periodo_hasta: string
          registrado_por: string
          suscripcion_id: string
        }
        Insert: {
          created_at?: string
          fecha_pago: string
          id?: string
          lubricentro_id: string
          monto: number
          periodo_desde: string
          periodo_hasta: string
          registrado_por: string
          suscripcion_id: string
        }
        Update: {
          created_at?: string
          fecha_pago?: string
          id?: string
          lubricentro_id?: string
          monto?: number
          periodo_desde?: string
          periodo_hasta?: string
          registrado_por?: string
          suscripcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean
          created_at: string
          descuento_anual_pct: number
          descuento_semestral_pct: number
          features: Json
          heredado: boolean
          id: string
          limites: Json
          nombre: string
          precio_mensual: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descuento_anual_pct?: number
          descuento_semestral_pct?: number
          features?: Json
          heredado?: boolean
          id?: string
          limites?: Json
          nombre: string
          precio_mensual: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          descuento_anual_pct?: number
          descuento_semestral_pct?: number
          features?: Json
          heredado?: boolean
          id?: string
          limites?: Json
          nombre?: string
          precio_mensual?: number
        }
        Relationships: []
      }
      premios: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string
          id: string
          lubricentro_id: string
          meta_services: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion: string
          id?: string
          lubricentro_id: string
          meta_services: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string
          id?: string
          lubricentro_id?: string
          meta_services?: number
        }
        Relationships: [
          {
            foreignKeyName: "premios_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["categoria_producto"]
          created_at: string
          id: string
          lubricentro_id: string
          marca: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          categoria: Database["public"]["Enums"]["categoria_producto"]
          created_at?: string
          id?: string
          lubricentro_id: string
          marca?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_producto"]
          created_at?: string
          id?: string
          lubricentro_id?: string
          marca?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          cambiado: boolean
          created_at: string
          detalle: string | null
          id: string
          item_tipo: Database["public"]["Enums"]["item_tipo"]
          lubricentro_id: string
          producto_id: string | null
          service_id: string
        }
        Insert: {
          cambiado?: boolean
          created_at?: string
          detalle?: string | null
          id?: string
          item_tipo: Database["public"]["Enums"]["item_tipo"]
          lubricentro_id: string
          producto_id?: string | null
          service_id: string
        }
        Update: {
          cambiado?: boolean
          created_at?: string
          detalle?: string | null
          id?: string
          item_tipo?: Database["public"]["Enums"]["item_tipo"]
          lubricentro_id?: string
          producto_id?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_items_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "vista_proximos_service"
            referencedColumns: ["ultimo_service_id"]
          },
        ]
      }
      services: {
        Row: {
          aceite_nombre: string | null
          aceite_producto_id: string | null
          aceite_tipo: string
          anulado: boolean
          created_at: string
          desbloqueado_hasta: string | null
          desbloqueado_por: string | null
          fecha: string
          id: string
          kilometros: number
          lubricentro_id: string
          observaciones: string | null
          prox_service_km: number
          sucursal_id: string
          updated_at: string
          usuario_id: string
          vehiculo_id: string
        }
        Insert: {
          aceite_nombre?: string | null
          aceite_producto_id?: string | null
          aceite_tipo: string
          anulado?: boolean
          created_at?: string
          desbloqueado_hasta?: string | null
          desbloqueado_por?: string | null
          fecha?: string
          id?: string
          kilometros: number
          lubricentro_id: string
          observaciones?: string | null
          prox_service_km: number
          sucursal_id: string
          updated_at?: string
          usuario_id: string
          vehiculo_id: string
        }
        Update: {
          aceite_nombre?: string | null
          aceite_producto_id?: string | null
          aceite_tipo?: string
          anulado?: boolean
          created_at?: string
          desbloqueado_hasta?: string | null
          desbloqueado_por?: string | null
          fecha?: string
          id?: string
          kilometros?: number
          lubricentro_id?: string
          observaciones?: string | null
          prox_service_km?: number
          sucursal_id?: string
          updated_at?: string
          usuario_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_aceite_producto_id_fkey"
            columns: ["aceite_producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_desbloqueado_por_fkey"
            columns: ["desbloqueado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activa: boolean
          created_at: string
          direccion: string | null
          horarios: string | null
          id: string
          lubricentro_id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          horarios?: string | null
          id?: string
          lubricentro_id: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          horarios?: string | null
          id?: string
          lubricentro_id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones: {
        Row: {
          created_at: string
          descuento_pct: number
          estado: Database["public"]["Enums"]["estado_suscripcion"]
          id: string
          inicio: string
          lubricentro_id: string
          periodo: Database["public"]["Enums"]["periodo_suscripcion"]
          plan_id: string
          vencimiento: string
        }
        Insert: {
          created_at?: string
          descuento_pct?: number
          estado?: Database["public"]["Enums"]["estado_suscripcion"]
          id?: string
          inicio?: string
          lubricentro_id: string
          periodo?: Database["public"]["Enums"]["periodo_suscripcion"]
          plan_id: string
          vencimiento: string
        }
        Update: {
          created_at?: string
          descuento_pct?: number
          estado?: Database["public"]["Enums"]["estado_suscripcion"]
          id?: string
          inicio?: string
          lubricentro_id?: string
          periodo?: Database["public"]["Enums"]["periodo_suscripcion"]
          plan_id?: string
          vencimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          created_at: string
          email: string
          id: string
          lubricentro_id: string | null
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          lubricentro_id?: string | null
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          lubricentro_id?: string | null
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          anio: number | null
          cliente_id: string
          created_at: string
          id: string
          lubricentro_id: string
          marca: string | null
          modelo: string | null
          patente: string
          patente_normalizada: string
        }
        Insert: {
          anio?: number | null
          cliente_id: string
          created_at?: string
          id?: string
          lubricentro_id: string
          marca?: string | null
          modelo?: string | null
          patente: string
          patente_normalizada?: string
        }
        Update: {
          anio?: number | null
          cliente_id?: string
          created_at?: string
          id?: string
          lubricentro_id?: string
          marca?: string | null
          modelo?: string | null
          patente?: string
          patente_normalizada?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vista_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vista_proximos_service"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "vehiculos_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vista_clientes: {
        Row: {
          cantidad_vehiculos: number | null
          created_at: string | null
          cuit: string | null
          email: string | null
          id: string | null
          lubricentro_id: string | null
          nombre: string | null
          nombre_busqueda: string | null
          patentes: string | null
          patentes_lista: string | null
          telefono: string | null
          ultimo_prox_service_km: number | null
          ultimo_service_fecha: string | null
          ultimo_service_km: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_proximos_service: {
        Row: {
          cantidad_services: number | null
          cliente_id: string | null
          cliente_nombre: string | null
          cliente_telefono: string | null
          contactado: boolean | null
          dias_hasta: number | null
          estado: Database["public"]["Enums"]["estado_contacto"] | null
          estimacion_inicial: boolean | null
          fecha_estimada: string | null
          km_faltantes: number | null
          km_por_dia: number | null
          lubricentro_id: string | null
          marca: string | null
          modelo: string | null
          patente: string | null
          patente_normalizada: string | null
          prox_service_km: number | null
          sucursal_id: string | null
          sucursal_nombre: string | null
          ultimo_service_fecha: string | null
          ultimo_service_id: string | null
          ultimo_service_km: number | null
          vehiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_vehiculos: {
        Row: {
          anio: number | null
          cantidad_services: number | null
          cliente_id: string | null
          created_at: string | null
          id: string | null
          lubricentro_id: string | null
          marca: string | null
          modelo: string | null
          patente: string | null
          patente_normalizada: string | null
          ultimo_service_fecha: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vista_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vista_proximos_service"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "vehiculos_lubricentro_id_fkey"
            columns: ["lubricentro_id"]
            isOneToOne: false
            referencedRelation: "lubricentros"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activar_template: { Args: { p_template_id: string }; Returns: undefined }
      actualizar_lubricentro: {
        Args: {
          p_calcos: number
          p_descuento_pct: number
          p_id: string
          p_nombre: string
          p_periodo: Database["public"]["Enums"]["periodo_suscripcion"]
          p_plan_id: string
          p_slug: string
          p_vencimiento: string
        }
        Returns: undefined
      }
      actualizar_mi_nombre: { Args: { p_nombre: string }; Returns: undefined }
      actualizar_nombre_lubricentro: {
        Args: { p_nombre: string }
        Returns: undefined
      }
      actualizar_service: {
        Args: {
          p_aceite_nombre?: string
          p_aceite_producto_id?: string
          p_aceite_tipo: string
          p_fecha: string
          p_items?: Json
          p_kilometros: number
          p_observaciones?: string
          p_prox_service_km: number
          p_service_id: string
          p_sucursal_id: string
        }
        Returns: undefined
      }
      atencion_tenant: { Args: { p_lubricentro_id: string }; Returns: Json }
      buscar_vehiculo_por_patente: {
        Args: { p_patente: string }
        Returns: {
          anio: number
          cantidad_services: number
          cliente_id: string
          cliente_nombre: string
          cliente_telefono: string
          marca: string
          modelo: string
          patente: string
          premio_descripcion: string
          premio_disponible: boolean
          premio_meta: number
          premio_services_ciclo: number
          ultimo_service_fecha: string
          ultimo_service_km: number
          ultimo_service_sucursal: string
          vehiculo_id: string
        }[]
      }
      catalogo_features_plan: { Args: never; Returns: string[] }
      catalogo_limites_plan: { Args: never; Returns: string[] }
      ciclos_fidelizacion: {
        Args: never
        Returns: {
          services_ciclo: number
          vehiculo_id: string
        }[]
      }
      contactado_fidelli: {
        Args: { p_lubricentro_id: string }
        Returns: boolean
      }
      corregir_patente: {
        Args: {
          p_motivo: string
          p_patente_nueva: string
          p_vehiculo_id: string
        }
        Returns: undefined
      }
      crear_cliente_con_vehiculo: {
        Args: {
          p_anio?: number
          p_cuit?: string
          p_email: string
          p_marca?: string
          p_modelo?: string
          p_nombre: string
          p_patente: string
          p_telefono: string
        }
        Returns: string
      }
      crear_identidad_email: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      crear_lubricentro: {
        Args: {
          p_descuento_pct: number
          p_dias_trial: number
          p_nombre: string
          p_periodo: Database["public"]["Enums"]["periodo_suscripcion"]
          p_plan_id: string
          p_slug: string
          p_sucursales: Json
        }
        Returns: string
      }
      desbloquear_service: { Args: { p_service_id: string }; Returns: string }
      dias_de_aviso: { Args: never; Returns: number }
      estado_atencion: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_suscripcion"]
          p_vencimiento: string
        }
        Returns: string
      }
      estados_owner: {
        Args: never
        Returns: {
          estado: string
          lubricentro_id: string
        }[]
      }
      feature_de_tenant: {
        Args: { p_feature: string; p_lubricentro: string }
        Returns: boolean
      }
      feature_plan_valida: { Args: { p_feature: string }; Returns: boolean }
      features_plan_bien_formadas: { Args: { p: Json }; Returns: boolean }
      fijar_override_plan: {
        Args: { p_lubricentro: string; p_motivo: string; p_overrides: Json }
        Returns: undefined
      }
      fm_unaccent: { Args: { "": string }; Returns: string }
      get_carton: { Args: { p_patente: string; p_slug: string }; Returns: Json }
      get_landing: { Args: { p_slug: string }; Returns: Json }
      guardar_service: {
        Args: {
          p_aceite_nombre?: string
          p_aceite_producto_id?: string
          p_aceite_tipo: string
          p_canjear_premio?: boolean
          p_fecha: string
          p_items?: Json
          p_kilometros: number
          p_observaciones?: string
          p_prox_service_km: number
          p_sucursal_id: string
          p_vehiculo_id: string
        }
        Returns: string
      }
      limite_de_tenant: {
        Args: { p_limite: string; p_lubricentro: string }
        Returns: number
      }
      limite_del_plan: {
        Args: { p_limite: string; p_plan: string }
        Returns: number
      }
      limite_plan_valido: { Args: { p_limite: string }; Returns: boolean }
      limites_plan_bien_formados: { Args: { p: Json }; Returns: boolean }
      listado_lubricentros: {
        Args: never
        Returns: {
          activo: boolean
          atencion: string
          atencion_orden: number
          calcos_entregadas: number
          contactado: boolean
          creado: string
          id: string
          nombre: string
          owner_estado: string
          owner_nombre: string
          plan_desc_anual: number
          plan_desc_sem: number
          plan_id: string
          plan_nombre: string
          plan_precio: number
          services_mes: number
          slug: string
          sub_descuento_pct: number
          sub_estado: Database["public"]["Enums"]["estado_suscripcion"]
          sub_periodo: Database["public"]["Enums"]["periodo_suscripcion"]
          sub_vencimiento: string
          suscripcion_id: string
          telefono: string
          ultimo_service: string
        }[]
      }
      metricas_plataforma: { Args: never; Returns: Json }
      metricas_tenant: { Args: { p_lubricentro_id: string }; Returns: Json }
      mi_lubricentro_id: { Args: never; Returns: string }
      normalizar_patente: { Args: { entrada: string }; Returns: string }
      orden_atencion: { Args: { p_atencion: string }; Returns: number }
      overrides_plan_bien_formados: { Args: { p: Json }; Returns: boolean }
      plan_capacidades: {
        Args: { u: Database["public"]["Tables"]["usuarios"]["Row"] }
        Returns: Json
      }
      plan_limite: { Args: { p_limite: string }; Returns: number }
      plan_permite: { Args: { p_feature: string }; Returns: boolean }
      premio_disponible: {
        Args: { p_vehiculo_id: string }
        Returns: {
          descripcion: string
          disponible: boolean
          meta_services: number
          premio_id: string
          services_ciclo: number
        }[]
      }
      recuperados_del_mes: {
        Args: {
          p_desde?: string
          p_lubricentro_id: string
          p_sucursal_id?: string
        }
        Returns: number
      }
      registrar_pago: {
        Args: {
          p_fecha_pago: string
          p_lubricentro_id: string
          p_monto: number
          p_periodo_desde: string
          p_periodo_hasta: string
        }
        Returns: string
      }
      resumen_inicio: { Args: { p_sucursal_id?: string }; Returns: Json }
      seed_demo: { Args: { p_password?: string }; Returns: string }
      sembrar_templates: {
        Args: { p_lubricentro_id: string; p_nombre: string }
        Returns: undefined
      }
      service_editable: { Args: { p_service_id: string }; Returns: boolean }
      slug_estado: { Args: { p_slug: string }; Returns: string }
      slug_reservado: { Args: { p_slug: string }; Returns: boolean }
      slugs_publicos: {
        Args: never
        Returns: {
          created_at: string
          slug: string
        }[]
      }
      soy_superadmin: { Args: never; Returns: boolean }
      sucursales_dentro_del_limite: {
        Args: { p_lubricentro: string; p_sucursal: string }
        Returns: boolean
      }
      telefono_de_contacto: {
        Args: { p_lubricentro_id: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      verificar_seguridad_vistas: {
        Args: never
        Returns: {
          arreglo: string
          motivo: string
          vista: string
        }[]
      }
    }
    Enums: {
      canal_contacto: "whatsapp" | "manual"
      categoria_producto: "aceite" | "filtro" | "liquido" | "aditivo" | "otro"
      estado_contacto: "urgente" | "proximo" | "vencido"
      estado_suscripcion: "trial" | "activa" | "vencida" | "cancelada"
      item_tipo:
        | "filtro_aceite"
        | "filtro_aire"
        | "filtro_combustible"
        | "filtro_habitaculo"
        | "aceite_caja"
        | "aceite_diferencial"
        | "aceite_hidraulico"
        | "liq_refrigerante"
        | "liq_frenos"
        | "aditivo_motor"
        | "aditivo_transmision"
      motivo_contacto_fidelli: "trial" | "cobranza"
      periodo_suscripcion: "mensual" | "semestral" | "anual"
      rol_usuario: "owner" | "superadmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      canal_contacto: ["whatsapp", "manual"],
      categoria_producto: ["aceite", "filtro", "liquido", "aditivo", "otro"],
      estado_contacto: ["urgente", "proximo", "vencido"],
      estado_suscripcion: ["trial", "activa", "vencida", "cancelada"],
      item_tipo: [
        "filtro_aceite",
        "filtro_aire",
        "filtro_combustible",
        "filtro_habitaculo",
        "aceite_caja",
        "aceite_diferencial",
        "aceite_hidraulico",
        "liq_refrigerante",
        "liq_frenos",
        "aditivo_motor",
        "aditivo_transmision",
      ],
      motivo_contacto_fidelli: ["trial", "cobranza"],
      periodo_suscripcion: ["mensual", "semestral", "anual"],
      rol_usuario: ["owner", "superadmin"],
    },
  },
} as const

