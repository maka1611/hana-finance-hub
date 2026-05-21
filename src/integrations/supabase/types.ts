export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string
          actor_name: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id: string
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary?: string | null
        }
        Relationships: []
      }
      client_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_path: string
          id: string
          kind: string
          signed_url: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_path: string
          id?: string
          kind: string
          signed_url: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
          signed_url?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_secrets: {
        Row: {
          initial_password: string
          updated_at: string
          user_id: string
        }
        Insert: {
          initial_password: string
          updated_at?: string
          user_id: string
        }
        Update: {
          initial_password?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_guarantors: {
        Row: {
          comment: string | null
          contract_id: string
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          comment?: string | null
          contract_id: string
          created_at?: string
          full_name: string
          id?: string
        }
        Update: {
          comment?: string | null
          contract_id?: string
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_guarantors_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "installment_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantor_emails: {
        Row: {
          created_at: string
          email: string
          guarantor_id: string
          id: string
          label: string | null
        }
        Insert: {
          created_at?: string
          email: string
          guarantor_id: string
          id?: string
          label?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          guarantor_id?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guarantor_emails_guarantor_id_fkey"
            columns: ["guarantor_id"]
            isOneToOne: false
            referencedRelation: "contract_guarantors"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantor_phones: {
        Row: {
          channels: string[]
          created_at: string
          guarantor_id: string
          id: string
          label: string | null
          phone: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          guarantor_id: string
          id?: string
          label?: string | null
          phone: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          guarantor_id?: string
          id?: string
          label?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantor_phones_guarantor_id_fkey"
            columns: ["guarantor_id"]
            isOneToOne: false
            referencedRelation: "contract_guarantors"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_applications: {
        Row: {
          admin_note: string | null
          client_comment: string | null
          client_full_name: string | null
          client_id: string
          client_phone: string | null
          client_telegram: string | null
          contract_id: string | null
          created_at: string
          down_payment: number
          first_payment_date: string | null
          id: string
          product_description: string | null
          product_image_url: string | null
          product_name: string
          product_price: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          term_months: number
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          client_comment?: string | null
          client_full_name?: string | null
          client_id: string
          client_phone?: string | null
          client_telegram?: string | null
          contract_id?: string | null
          created_at?: string
          down_payment?: number
          first_payment_date?: string | null
          id?: string
          product_description?: string | null
          product_image_url?: string | null
          product_name: string
          product_price: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          term_months: number
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          client_comment?: string | null
          client_full_name?: string | null
          client_id?: string
          client_phone?: string | null
          client_telegram?: string | null
          contract_id?: string | null
          created_at?: string
          down_payment?: number
          first_payment_date?: string | null
          id?: string
          product_description?: string | null
          product_image_url?: string | null
          product_name?: string
          product_price?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          term_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      installment_contracts: {
        Row: {
          client_comment: string | null
          client_full_name: string | null
          client_id: string
          client_telegram: string | null
          created_at: string
          down_payment: number
          id: string
          markup_amount: number
          markup_rate: number
          monthly_payment: number
          principal: number
          product_description: string | null
          product_image_url: string | null
          product_name: string
          product_price: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          term_months: number
          total_sale_price: number
          updated_at: string
        }
        Insert: {
          client_comment?: string | null
          client_full_name?: string | null
          client_id: string
          client_telegram?: string | null
          created_at?: string
          down_payment?: number
          id?: string
          markup_amount: number
          markup_rate?: number
          monthly_payment: number
          principal: number
          product_description?: string | null
          product_image_url?: string | null
          product_name: string
          product_price: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          term_months: number
          total_sale_price: number
          updated_at?: string
        }
        Update: {
          client_comment?: string | null
          client_full_name?: string | null
          client_id?: string
          client_telegram?: string | null
          created_at?: string
          down_payment?: number
          id?: string
          markup_amount?: number
          markup_rate?: number
          monthly_payment?: number
          principal?: number
          product_description?: string | null
          product_image_url?: string | null
          product_name?: string
          product_price?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          term_months?: number
          total_sale_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_schedules: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          seq: number
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          seq: number
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          seq?: number
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "installment_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          contract_id: string
          id: string
          method: string | null
          paid_at: string
          schedule_id: string | null
        }
        Insert: {
          amount: number
          contract_id: string
          id?: string
          method?: string | null
          paid_at?: string
          schedule_id?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          id?: string
          method?: string | null
          paid_at?: string
          schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "installment_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          driver_license_categories: string | null
          driver_license_issued_at: string | null
          driver_license_number: string | null
          driver_license_photo_url: string | null
          email: string | null
          full_name: string | null
          id: string
          passport_issued_at: string | null
          passport_issued_by: string | null
          passport_number: string | null
          passport_photo_url: string | null
          passport_series: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_license_categories?: string | null
          driver_license_issued_at?: string | null
          driver_license_number?: string | null
          driver_license_photo_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          passport_issued_at?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_photo_url?: string | null
          passport_series?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_license_categories?: string | null
          driver_license_issued_at?: string | null
          driver_license_number?: string | null
          driver_license_photo_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          passport_issued_at?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_photo_url?: string | null
          passport_series?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_phones: {
        Row: {
          channels: string[]
          created_at: string
          id: string
          label: string | null
          phone: string
          user_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          id?: string
          label?: string | null
          phone: string
          user_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          id?: string
          label?: string | null
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "client" | "manager" | "admin" | "owner"
      application_status: "pending" | "approved" | "rejected"
      contract_status: "pending" | "active" | "closed" | "overdue"
      payment_status: "pending" | "paid" | "overdue"
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
  public: {
    Enums: {
      app_role: ["client", "manager", "admin", "owner"],
      application_status: ["pending", "approved", "rejected"],
      contract_status: ["pending", "active", "closed", "overdue"],
      payment_status: ["pending", "paid", "overdue"],
    },
  },
} as const
