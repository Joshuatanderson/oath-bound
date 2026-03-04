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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      identity_verifications: {
        Row: {
          id: string
          auth_user_id: string
          persona_inquiry_id: string
          status: string
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          auth_user_id: string
          persona_inquiry_id: string
          status: string
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          auth_user_id?: string
          persona_inquiry_id?: string
          status?: string
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      audits: {
        Row: {
          audited_at: string
          id: string
          ipfs_cid: string
          passed: boolean
          report_hash: string
          skill_id: string
          sui_digest: string | null
          sui_object_id: string | null
          uploader: string
        }
        Insert: {
          audited_at?: string
          id?: string
          ipfs_cid: string
          passed: boolean
          report_hash: string
          skill_id: string
          sui_digest?: string | null
          sui_object_id?: string | null
          uploader: string
        }
        Update: {
          audited_at?: string
          id?: string
          ipfs_cid?: string
          passed?: boolean
          report_hash?: string
          skill_id?: string
          sui_digest?: string | null
          sui_object_id?: string | null
          uploader?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          allowed_tools: string | null
          compatibility: string | null
          created_at: string | null
          description: string
          id: string
          license: Database["public"]["Enums"]["license_type"]
          name: string
          namespace: string
          storage_path: string
          sui_digest: string | null
          sui_object_id: string | null
          tar_hash: string
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          allowed_tools?: string | null
          compatibility?: string | null
          created_at?: string | null
          description: string
          id?: string
          license?: Database["public"]["Enums"]["license_type"]
          name: string
          namespace: string
          storage_path: string
          sui_digest?: string | null
          sui_object_id?: string | null
          tar_hash: string
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          allowed_tools?: string | null
          compatibility?: string | null
          created_at?: string | null
          description?: string
          id?: string
          license?: Database["public"]["Enums"]["license_type"]
          name?: string
          namespace?: string
          storage_path?: string
          sui_digest?: string | null
          sui_object_id?: string | null
          tar_hash?: string
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      license_type:
        | "MIT"
        | "APACHE-2.0"
        | "BSD-2-CLAUSE"
        | "BSD-3-CLAUSE"
        | "GPL-3.0-ONLY"
        | "AGPL-3.0-ONLY"
        | "ISC"
        | "UNLICENSE"
        | "BUSL-1.1"
        | "MPL-2.0"
        | "PROPRIETARY"
      user_role: "DEVELOPER" | "AUDITOR"
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
      license_type: [
        "MIT",
        "APACHE-2.0",
        "BSD-2-CLAUSE",
        "BSD-3-CLAUSE",
        "GPL-3.0-ONLY",
        "AGPL-3.0-ONLY",
        "ISC",
        "UNLICENSE",
        "BUSL-1.1",
        "MPL-2.0",
        "PROPRIETARY",
      ],
      user_role: ["DEVELOPER", "AUDITOR"],
    },
  },
} as const
