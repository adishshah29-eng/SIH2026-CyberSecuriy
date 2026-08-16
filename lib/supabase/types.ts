// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once a live project exists,
// then this file can be replaced wholesale.

export type StakeholderRole = "collector" | "processor" | "lab" | "manufacturer";
export type BatchStage =
  | "Collected"
  | "Processing"
  | "Lab Testing"
  | "Manufacturing"
  | "Verified"
  | "Failed";
export type BatchStatus = "Pending" | "Passed" | "Failed" | "Verified";
export type QualityTestStatus = "Passed" | "Failed";
export type AnomalySeverity = "low" | "medium" | "high";
export type AnomalyStatus = "open" | "reviewed" | "dismissed";
export type ProductStatus = "active" | "recalled";

export interface Database {
  public: {
    Tables: {
      stakeholders: {
        Row: {
          id: string;
          code: string;
          role: StakeholderRole;
          name: string;
          location: string | null;
          verified: boolean;
          created_at: string;
          auth_user_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["stakeholders"]["Row"]> & {
          code: string;
          role: StakeholderRole;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["stakeholders"]["Row"]>;
        Relationships: [];
      };
      batches: {
        Row: {
          id: string;
          batch_code: string;
          herb_name: string;
          quantity_kg: number;
          collection_date: string;
          current_stage: BatchStage;
          status: BatchStatus;
          collector_id: string | null;
          origin_location: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["batches"]["Row"]> & {
          batch_code: string;
          quantity_kg: number;
          collection_date: string;
          current_stage: BatchStage;
          status: BatchStatus;
          origin_location: string;
        };
        Update: Partial<Database["public"]["Tables"]["batches"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "batches_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_events: {
        Row: {
          id: string;
          batch_id: string;
          collector_id: string;
          latitude: number;
          longitude: number;
          location_name: string;
          quantity_kg: number;
          collected_at: string;
          harvest_zone: string;
          season_valid: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["collection_events"]["Row"]> & {
          batch_id: string;
          collector_id: string;
          latitude: number;
          longitude: number;
          location_name: string;
          quantity_kg: number;
          collected_at: string;
          harvest_zone: string;
        };
        Update: Partial<Database["public"]["Tables"]["collection_events"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "collection_events_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_events_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      processing_events: {
        Row: {
          id: string;
          batch_id: string;
          processor_id: string | null;
          process_type: string;
          start_time: string;
          end_time: string | null;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["processing_events"]["Row"]> & {
          batch_id: string;
          process_type: string;
          start_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_events"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "processing_events_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_events_processor_id_fkey";
            columns: ["processor_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      quality_tests: {
        Row: {
          id: string;
          batch_id: string;
          lab_id: string | null;
          test_type: string;
          value: string;
          threshold: string;
          status: QualityTestStatus;
          tested_at: string;
          certificate_url: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["quality_tests"]["Row"]> & {
          batch_id: string;
          test_type: string;
          value: string;
          threshold: string;
          status: QualityTestStatus;
          tested_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["quality_tests"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "quality_tests_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quality_tests_lab_id_fkey";
            columns: ["lab_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      anomalies: {
        Row: {
          id: string;
          batch_id: string | null;
          stakeholder_id: string | null;
          anomaly_type: string;
          severity: AnomalySeverity;
          description: string;
          score: number;
          status: AnomalyStatus;
          detected_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["anomalies"]["Row"]> & {
          anomaly_type: string;
          severity: AnomalySeverity;
          description: string;
          score: number;
        };
        Update: Partial<Database["public"]["Tables"]["anomalies"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "anomalies_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "anomalies_stakeholder_id_fkey";
            columns: ["stakeholder_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          batch_id: string;
          product_name: string;
          manufacturer_id: string | null;
          manufactured_at: string;
          qr_token: string;
          qr_url: string;
          status: ProductStatus;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & {
          batch_id: string;
          product_name: string;
          manufactured_at: string;
          qr_token: string;
          qr_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "products_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "stakeholders";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          id: number;
          entity_table: "collection_events" | "processing_events" | "quality_tests";
          entity_id: string;
          payload_hash: string;
          prev_hash: string;
          chain_hash: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      product_provenance: {
        Row: {
          qr_token: string;
          batch_code: string;
          herb_name: string;
          origin_location: string;
          quantity_kg: number;
          collection_date: string;
          batch_status: BatchStatus;
          product_name: string;
          manufactured_at: string;
          qr_url: string;
          collector_display: string | null;
          collection_location: string;
          lat: number;
          lng: number;
          harvest_zone: string;
          season_valid: boolean;
          all_tests_passed: boolean | null;
          tests: { test_type: string; status: QualityTestStatus }[] | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      verify_ledger_chain: {
        Args: Record<string, never>;
        Returns: {
          entry_id: number;
          entity_table: string;
          entity_id: string;
          chain_ok: boolean;
          payload_ok: boolean;
        }[];
      };
    };
  };
}
