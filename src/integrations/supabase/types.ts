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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: number
          properties: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: never
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: never
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      answer_history: {
        Row: {
          context: string | null
          created_at: string | null
          error_type: string | null
          id: string
          is_correct: boolean
          question_id: string | null
          response_time_seconds: number | null
          selected_option: string
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          error_type?: string | null
          id?: string
          is_correct: boolean
          question_id?: string | null
          response_time_seconds?: number | null
          selected_option: string
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          error_type?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string | null
          response_time_seconds?: number | null
          selected_option?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answer_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          content: string | null
          context_subject: string | null
          created_at: string | null
          id: string
          message: string
          role: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          context_subject?: string | null
          created_at?: string | null
          id?: string
          message: string
          role: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          context_subject?: string | null
          created_at?: string | null
          id?: string
          message?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_missions: {
        Row: {
          calibration_eligible: boolean | null
          completed_at: string | null
          created_at: string | null
          date: string
          description: string | null
          due_date: string | null
          estimated_minutes: number | null
          fallback_generated: boolean | null
          id: string
          mission_order: number | null
          mission_type: string | null
          payload: Json | null
          plan_id: string | null
          question_ids: string[] | null
          score: number | null
          skipped_at: string | null
          status: string | null
          study_plan_id: string | null
          subject: string
          subtopic: string
          user_id: string | null
        }
        Insert: {
          calibration_eligible?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          fallback_generated?: boolean | null
          id?: string
          mission_order?: number | null
          mission_type?: string | null
          payload?: Json | null
          plan_id?: string | null
          question_ids?: string[] | null
          score?: number | null
          skipped_at?: string | null
          status?: string | null
          study_plan_id?: string | null
          subject: string
          subtopic: string
          user_id?: string | null
        }
        Update: {
          calibration_eligible?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          fallback_generated?: boolean | null
          id?: string
          mission_order?: number | null
          mission_type?: string | null
          payload?: Json | null
          plan_id?: string | null
          question_ids?: string[] | null
          score?: number | null
          skipped_at?: string | null
          status?: string | null
          study_plan_id?: string | null
          subject?: string
          subtopic?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_missions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_missions_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_missions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_estimates: {
        Row: {
          bottlenecks_json: Json | null
          created_at: string
          estimate_scope: string
          estimated_score: number | null
          explanation_json: Json | null
          global_theta: number | null
          id: string
          initial_priority_json: Json | null
          placement_band: string | null
          placement_confidence: string | null
          proficiencies: Json | null
          session_id: string | null
          strengths_json: Json | null
          user_id: string
        }
        Insert: {
          bottlenecks_json?: Json | null
          created_at?: string
          estimate_scope: string
          estimated_score?: number | null
          explanation_json?: Json | null
          global_theta?: number | null
          id?: string
          initial_priority_json?: Json | null
          placement_band?: string | null
          placement_confidence?: string | null
          proficiencies?: Json | null
          session_id?: string | null
          strengths_json?: Json | null
          user_id: string
        }
        Update: {
          bottlenecks_json?: Json | null
          created_at?: string
          estimate_scope?: string
          estimated_score?: number | null
          explanation_json?: Json | null
          global_theta?: number | null
          id?: string
          initial_priority_json?: Json | null
          placement_band?: string | null
          placement_confidence?: string | null
          proficiencies?: Json | null
          session_id?: string | null
          strengths_json?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_estimates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_item_responses: {
        Row: {
          correct_option: string | null
          created_at: string
          difficulty_presented: number | null
          id: string
          is_correct: boolean
          layer: string
          question_id: string
          response_time_seconds: number | null
          route_slot: string | null
          selected_option: string | null
          sequence_no: number
          session_id: string
          subject: string
          subtopic: string | null
          user_id: string
        }
        Insert: {
          correct_option?: string | null
          created_at?: string
          difficulty_presented?: number | null
          id?: string
          is_correct: boolean
          layer: string
          question_id: string
          response_time_seconds?: number | null
          route_slot?: string | null
          selected_option?: string | null
          sequence_no: number
          session_id: string
          subject: string
          subtopic?: string | null
          user_id: string
        }
        Update: {
          correct_option?: string | null
          created_at?: string
          difficulty_presented?: number | null
          id?: string
          is_correct?: boolean
          layer?: string
          question_id?: string
          response_time_seconds?: number | null
          route_slot?: string | null
          selected_option?: string | null
          sequence_no?: number
          session_id?: string
          subject?: string
          subtopic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_item_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_questions: {
        Row: {
          created_at: string | null
          difficulty: number
          difficulty_elo: number
          exam_slug: string
          explanation: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          options: Json
          question_text: string
          subject: string
          subtopic: string
        }
        Insert: {
          created_at?: string | null
          difficulty: number
          difficulty_elo: number
          exam_slug?: string
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          options: Json
          question_text: string
          subject: string
          subtopic: string
        }
        Update: {
          created_at?: string | null
          difficulty?: number
          difficulty_elo?: number
          exam_slug?: string
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          options?: Json
          question_text?: string
          subject?: string
          subtopic?: string
        }
        Relationships: []
      }
      diagnostic_results: {
        Row: {
          created_at: string
          cutoff_used: number
          estimated_score: number
          exam_config_id: string
          gap: number
          id: string
          priority_areas: Json
          probability: number
          probability_band: string
          probability_label: string
          proficiencies: Json
          raw_answers: Json
          total_correct: number
          total_questions: number
          user_id: string
        }
        Insert: {
          created_at?: string
          cutoff_used: number
          estimated_score: number
          exam_config_id: string
          gap: number
          id?: string
          priority_areas?: Json
          probability: number
          probability_band: string
          probability_label: string
          proficiencies?: Json
          raw_answers?: Json
          total_correct: number
          total_questions: number
          user_id: string
        }
        Update: {
          created_at?: string
          cutoff_used?: number
          estimated_score?: number
          exam_config_id?: string
          gap?: number
          id?: string
          priority_areas?: Json
          probability?: number
          probability_band?: string
          probability_label?: string
          proficiencies?: Json
          raw_answers?: Json
          total_correct?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_exam_config_id_fkey"
            columns: ["exam_config_id"]
            isOneToOne: false
            referencedRelation: "exam_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          exam_config_id: string
          id: string
          metadata: Json | null
          placement_band: string | null
          placement_confidence: string | null
          router_path: Json | null
          session_type: string
          started_at: string
          status: string
          total_correct: number
          total_items_presented: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exam_config_id: string
          id?: string
          metadata?: Json | null
          placement_band?: string | null
          placement_confidence?: string | null
          router_path?: Json | null
          session_type: string
          started_at?: string
          status?: string
          total_correct?: number
          total_items_presented?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exam_config_id?: string
          id?: string
          metadata?: Json | null
          placement_band?: string | null
          placement_confidence?: string | null
          router_path?: Json | null
          session_type?: string
          started_at?: string
          status?: string
          total_correct?: number
          total_items_presented?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_sessions_exam_config_id_fkey"
            columns: ["exam_config_id"]
            isOneToOne: false
            referencedRelation: "exam_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_configs: {
        Row: {
          campus: string | null
          competition_ratio: number | null
          course_name: string
          course_slug: string
          created_at: string | null
          cutoff_mean: number
          cutoff_sd: number | null
          exam_name: string
          exam_slug: string
          id: string
          is_active: boolean | null
          phase2_subjects: string[] | null
          subject_distribution: Json
          total_questions: number | null
        }
        Insert: {
          campus?: string | null
          competition_ratio?: number | null
          course_name: string
          course_slug: string
          created_at?: string | null
          cutoff_mean: number
          cutoff_sd?: number | null
          exam_name: string
          exam_slug: string
          id?: string
          is_active?: boolean | null
          phase2_subjects?: string[] | null
          subject_distribution: Json
          total_questions?: number | null
        }
        Update: {
          campus?: string | null
          competition_ratio?: number | null
          course_name?: string
          course_slug?: string
          created_at?: string | null
          cutoff_mean?: number
          cutoff_sd?: number | null
          exam_name?: string
          exam_slug?: string
          id?: string
          is_active?: boolean | null
          phase2_subjects?: string[] | null
          subject_distribution?: Json
          total_questions?: number | null
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          correct_answers: number
          created_at: string | null
          exam_name: string
          exam_type: string
          id: string
          per_subject_scores: Json | null
          score_percent: number
          time_spent_seconds: number | null
          total_questions: number
          user_id: string | null
        }
        Insert: {
          correct_answers: number
          created_at?: string | null
          exam_name: string
          exam_type: string
          id?: string
          per_subject_scores?: Json | null
          score_percent: number
          time_spent_seconds?: number | null
          total_questions: number
          user_id?: string | null
        }
        Update: {
          correct_answers?: number
          created_at?: string | null
          exam_name?: string
          exam_type?: string
          id?: string
          per_subject_scores?: Json | null
          score_percent?: number
          time_spent_seconds?: number | null
          total_questions?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proficiency_scores: {
        Row: {
          confidence: number | null
          id: string
          measured_at: string | null
          overall_readiness: number | null
          priority_areas: Json | null
          proficiency: Json | null
          score: number | null
          source: string | null
          subject: string
          subtopic: string
          summary: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          id?: string
          measured_at?: string | null
          overall_readiness?: number | null
          priority_areas?: Json | null
          proficiency?: Json | null
          score?: number | null
          source?: string | null
          subject: string
          subtopic: string
          summary?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          id?: string
          measured_at?: string | null
          overall_readiness?: number | null
          priority_areas?: Json | null
          proficiency?: Json | null
          score?: number | null
          source?: string | null
          subject?: string
          subtopic?: string
          summary?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proficiency_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          available_days: string[] | null
          city_state: string | null
          created_at: string | null
          current_biggest_difficulty: string | null
          current_streak: number | null
          desired_course: string | null
          education_goal: string | null
          exam_config_id: string | null
          exam_date: string | null
          exams_completed: number | null
          hours_per_day: number | null
          id: string
          last_activity_date: string | null
          last_mock_experience: string | null
          longest_streak: number | null
          missions_completed: number | null
          name: string
          onboarding_complete: boolean | null
          onboarding_completed_at: string | null
          preferred_shift: string | null
          routine_is_unstable: boolean | null
          school_stage: string | null
          school_type: string | null
          school_year: string | null
          self_declared_blocks: Json | null
          study_days: string[] | null
          target_universities: string[] | null
          total_xp: number | null
        }
        Insert: {
          age?: number | null
          available_days?: string[] | null
          city_state?: string | null
          created_at?: string | null
          current_biggest_difficulty?: string | null
          current_streak?: number | null
          desired_course?: string | null
          education_goal?: string | null
          exam_config_id?: string | null
          exam_date?: string | null
          exams_completed?: number | null
          hours_per_day?: number | null
          id: string
          last_activity_date?: string | null
          last_mock_experience?: string | null
          longest_streak?: number | null
          missions_completed?: number | null
          name: string
          onboarding_complete?: boolean | null
          onboarding_completed_at?: string | null
          preferred_shift?: string | null
          routine_is_unstable?: boolean | null
          school_stage?: string | null
          school_type?: string | null
          school_year?: string | null
          self_declared_blocks?: Json | null
          study_days?: string[] | null
          target_universities?: string[] | null
          total_xp?: number | null
        }
        Update: {
          age?: number | null
          available_days?: string[] | null
          city_state?: string | null
          created_at?: string | null
          current_biggest_difficulty?: string | null
          current_streak?: number | null
          desired_course?: string | null
          education_goal?: string | null
          exam_config_id?: string | null
          exam_date?: string | null
          exams_completed?: number | null
          hours_per_day?: number | null
          id?: string
          last_activity_date?: string | null
          last_mock_experience?: string | null
          longest_streak?: number | null
          missions_completed?: number | null
          name?: string
          onboarding_complete?: boolean | null
          onboarding_completed_at?: string | null
          preferred_shift?: string | null
          routine_is_unstable?: boolean | null
          school_stage?: string | null
          school_type?: string | null
          school_year?: string | null
          self_declared_blocks?: Json | null
          study_days?: string[] | null
          target_universities?: string[] | null
          total_xp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_exam_config_id_fkey"
            columns: ["exam_config_id"]
            isOneToOne: false
            referencedRelation: "exam_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string | null
          difficulty: number | null
          exam_type: string
          explanation: string | null
          id: string
          options: Json
          question_text: string
          subject: string
          subtopic: string
          tags: string[] | null
          year: number | null
        }
        Insert: {
          created_at?: string | null
          difficulty?: number | null
          exam_type: string
          explanation?: string | null
          id?: string
          options: Json
          question_text: string
          subject: string
          subtopic: string
          tags?: string[] | null
          year?: number | null
        }
        Update: {
          created_at?: string | null
          difficulty?: number | null
          exam_type?: string
          explanation?: string | null
          id?: string
          options?: Json
          question_text?: string
          subject?: string
          subtopic?: string
          tags?: string[] | null
          year?: number | null
        }
        Relationships: []
      }
      spaced_review_queue: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          interval_days: number
          last_performance: number | null
          last_reviewed_at: string | null
          next_review_at: string
          review_count: number
          subject: string
          subtopic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          interval_days?: number
          last_performance?: number | null
          last_reviewed_at?: string | null
          next_review_at: string
          review_count?: number
          subject: string
          subtopic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          interval_days?: number
          last_performance?: number | null
          last_reviewed_at?: string | null
          next_review_at?: string
          review_count?: number
          subject?: string
          subtopic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          created_at: string | null
          end_date: string | null
          generation_mode: string | null
          id: string
          is_current: boolean | null
          plan_data: Json | null
          plan_json: Json
          plan_version: number | null
          source_session_id: string | null
          start_date: string | null
          status: string | null
          summary: Json | null
          updated_at: string | null
          user_id: string | null
          version: number | null
          week_number: number
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          generation_mode?: string | null
          id?: string
          is_current?: boolean | null
          plan_data?: Json | null
          plan_json: Json
          plan_version?: number | null
          source_session_id?: string | null
          start_date?: string | null
          status?: string | null
          summary?: Json | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          week_number: number
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          generation_mode?: string | null
          id?: string
          is_current?: boolean | null
          plan_data?: Json | null
          plan_json?: Json
          plan_version?: number | null
          source_session_id?: string | null
          start_date?: string | null
          status?: string | null
          summary?: Json | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_mission_atomic: {
        Args: {
          p_mission_id: string
          p_score: number
          p_user_id: string
          p_xp_earned: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
